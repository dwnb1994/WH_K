const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const DOC_TYPES = ['gr', 'inc', 'mr']
const INBOUND_TYPES = new Set(['gr', 'inc'])

function parseArgs(argv) {
  const args = {
    source: 'local',
    bucket: process.env.TRCLOUD_GCS_BUCKET || 'kitchen-sepon-data',
    month: '',
    today: '',
    out: path.join('apps', 'api', 'data', 'stock-simulation.json'),
  }

  for (const arg of argv) {
    const [rawKey, ...rest] = arg.replace(/^--/, '').split('=')
    const value = rest.join('=')
    if (rawKey && value !== undefined) args[rawKey] = value
  }

  return args
}

function ymdInBangkok(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = type => parts.find(part => part.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function monthBounds(month, today) {
  const [year, monthNo] = month.split('-').map(Number)
  const start = `${month}-01`
  const endOfMonth = new Date(Date.UTC(year, monthNo, 0)).toISOString().slice(0, 10)
  const previousEnd = new Date(Date.UTC(year, monthNo - 1, 0)).toISOString().slice(0, 10)
  return {
    baseDateTo: previousEnd,
    movementDateFrom: start,
    movementDateTo: today && today.startsWith(month) && today < endOfMonth ? today : endOfMonth,
  }
}

function text(value) {
  return value == null ? '' : String(value).trim()
}

function number(value) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function round(value) {
  return Math.round(value * 1000) / 1000
}

function compactDate(value) {
  return text(value).slice(0, 10)
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function readLocalSnapshot(root, docType) {
  const file = path.join(root, 'apps', 'api', 'data', `${docType}.json`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

async function readGcsSnapshot(bucketName, docType) {
  const { Storage } = require('@google-cloud/storage')
  const storage = new Storage()
  const [content] = await storage
    .bucket(bucketName)
    .file(`trcloud/snapshots/${docType}/latest.json`)
    .download()
  return JSON.parse(content.toString('utf8'))
}

function readGsutilSnapshot(bucketName, docType) {
  const uri = `gs://${bucketName}/trcloud/snapshots/${docType}/latest.json`
  const defaultWindowsBin = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gsutil.cmd')
    : 'gsutil.cmd'
  const bin = process.env.GSUTIL_BIN || (process.platform === 'win32' && fs.existsSync(defaultWindowsBin)
    ? defaultWindowsBin
    : process.platform === 'win32' ? 'gsutil.cmd' : 'gsutil')
  const command = process.platform === 'win32' ? 'powershell' : bin
  const psBin = bin.replace(/'/g, "''")
  const psUri = uri.replace(/'/g, "''")
  const commandArgs = process.platform === 'win32'
    ? ['-NoProfile', '-Command', `& '${psBin}' cat '${psUri}'`]
    : ['cat', uri]
  const content = execFileSync(command, commandArgs, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 200,
  })
  return JSON.parse(content)
}

function normalizeLine(docType, line) {
  const date = compactDate(line.date || line.issue_date)
  const productId = text(line.product_id) || 'NO-SKU'
  const warehouse = text(line.warehouse) || 'ไม่ระบุคลัง'
  const quantity = number(line.quantity)
  const direction = INBOUND_TYPES.has(docType) ? 'in' : 'out'

  return {
    docType: docType.toUpperCase(),
    direction,
    docRef: text(line.doc_ref || line.document_number),
    date,
    productId,
    productName: text(line.product_name || line.product || line.description) || '-',
    warehouse,
    unit: text(line.unit),
    quantity,
  }
}

function positionKey(line) {
  return `${line.warehouse}::${line.productId}`
}

function emptyPosition(line) {
  return {
    key: positionKey(line),
    productId: line.productId,
    productName: line.productName,
    warehouse: line.warehouse,
    unit: line.unit,
    baseQty: 0,
    inboundQty: 0,
    outboundQty: 0,
    balanceQty: 0,
    movementCount: 0,
    lastDate: '',
  }
}

function touch(map, line) {
  const key = positionKey(line)
  const row = map.get(key) || emptyPosition(line)
  if (line.productName && line.productName !== '-') row.productName = line.productName
  if (line.unit) row.unit = line.unit
  map.set(key, row)
  return row
}

function summarizeDocs(snapshots) {
  return Object.fromEntries(
    Object.entries(snapshots).map(([docType, snapshot]) => [
      docType,
      {
        fetchedAt: snapshot.fetched_at || null,
        dateFrom: snapshot.date_from || null,
        dateTo: snapshot.date_to || null,
        orders: snapshot.orders?.length || 0,
        lines: snapshot.lines?.length || 0,
      },
    ]),
  )
}

async function main() {
  const root = path.resolve(__dirname, '..', '..', '..')
  const args = parseArgs(process.argv.slice(2))
  const today = args.today || ymdInBangkok()
  const month = args.month || today.slice(0, 7)
  const bounds = monthBounds(month, today)
  const snapshots = {}

  for (const docType of DOC_TYPES) {
    if (args.source === 'gcs') snapshots[docType] = await readGcsSnapshot(args.bucket, docType)
    else if (args.source === 'gsutil') snapshots[docType] = readGsutilSnapshot(args.bucket, docType)
    else snapshots[docType] = readLocalSnapshot(root, docType)
  }

  const basePositions = new Map()
  const movementPositions = new Map()
  const daily = new Map()
  const movements = []
  const sourceCounts = {
    baseLines: 0,
    movementLines: 0,
    skippedLines: 0,
  }

  for (const docType of DOC_TYPES) {
    for (const rawLine of snapshots[docType].lines || []) {
      const line = normalizeLine(docType, rawLine)
      if (!line.date || !line.quantity) {
        sourceCounts.skippedLines += 1
        continue
      }

      if (INBOUND_TYPES.has(docType) && line.date <= bounds.baseDateTo) {
        const row = touch(basePositions, line)
        row.baseQty = round(row.baseQty + line.quantity)
        sourceCounts.baseLines += 1
        continue
      }

      if (line.date < bounds.movementDateFrom || line.date > bounds.movementDateTo) continue

      const row = touch(movementPositions, line)
      if (line.direction === 'in') {
        row.inboundQty = round(row.inboundQty + line.quantity)
      } else {
        row.outboundQty = round(row.outboundQty + line.quantity)
      }
      row.movementCount += 1
      row.lastDate = row.lastDate > line.date ? row.lastDate : line.date

      const day = daily.get(line.date) || {
        date: line.date,
        inboundQty: 0,
        outboundQty: 0,
        netQty: 0,
        movementCount: 0,
        skuCount: 0,
        warehouseCount: 0,
        _skus: new Set(),
        _warehouses: new Set(),
      }
      if (line.direction === 'in') day.inboundQty = round(day.inboundQty + line.quantity)
      else day.outboundQty = round(day.outboundQty + line.quantity)
      day.netQty = round(day.inboundQty - day.outboundQty)
      day.movementCount += 1
      day._skus.add(line.productId)
      day._warehouses.add(line.warehouse)
      daily.set(line.date, day)

      movements.push(line)
      sourceCounts.movementLines += 1
    }
  }

  for (const [key, base] of basePositions) {
    const movement = movementPositions.get(key) || {
      inboundQty: 0,
      outboundQty: 0,
      movementCount: 0,
      lastDate: '',
    }
    const row = {
      ...base,
      inboundQty: movement.inboundQty,
      outboundQty: movement.outboundQty,
      movementCount: movement.movementCount,
      lastDate: movement.lastDate,
    }
    row.balanceQty = round(row.baseQty + row.inboundQty - row.outboundQty)
    movementPositions.set(key, row)
  }

  for (const row of movementPositions.values()) {
    row.baseQty = round(row.baseQty || 0)
    row.inboundQty = round(row.inboundQty || 0)
    row.outboundQty = round(row.outboundQty || 0)
    row.balanceQty = round(row.baseQty + row.inboundQty - row.outboundQty)
  }

  const initialQty = Array.from(basePositions.values()).reduce((sum, row) => sum + row.baseQty, 0)
  let runningClosingQty = round(initialQty)
  const dailyRows = Array.from(daily.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(day => {
      runningClosingQty = round(runningClosingQty + day.netQty)
      return {
        date: day.date,
        inboundQty: round(day.inboundQty),
        outboundQty: round(day.outboundQty),
        netQty: round(day.netQty),
        closingQty: runningClosingQty,
        movementCount: day.movementCount,
        skuCount: day._skus.size,
        warehouseCount: day._warehouses.size,
      }
    })

  const rows = Array.from(movementPositions.values())
    .sort((a, b) => a.warehouse.localeCompare(b.warehouse) || a.productId.localeCompare(b.productId))

  const output = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: args.source,
    bucket: ['gcs', 'gsutil'].includes(args.source) ? args.bucket : null,
    basis: 'base_from_gr_inc_until_previous_month_then_current_month_gr_inc_minus_mr',
    base: {
      date_to: bounds.baseDateTo,
      qty: round(initialQty),
      position_count: basePositions.size,
    },
    period: {
      date_from: bounds.movementDateFrom,
      date_to: bounds.movementDateTo,
    },
    source_counts: sourceCounts,
    snapshots: summarizeDocs(snapshots),
    rows,
    movements,
    daily: dailyRows,
  }

  const outPath = path.resolve(root, args.out)
  ensureDir(outPath)
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    output: outPath,
    source: output.source,
    base: output.base,
    period: output.period,
    rows: output.rows.length,
    movements: output.movements.length,
    daily: output.daily.length,
  }, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
