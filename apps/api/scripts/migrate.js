/**
 * Apply SQL migrations from database/migrations/
 * Usage: DATABASE_URL=postgresql://... node scripts/migrate.js
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const migrationsDir = path.join(__dirname, '..', 'database', 'migrations')
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

  const client = new Client({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  const { rows: applied } = await client.query('SELECT filename FROM schema_migrations')
  const done = new Set(applied.map(r => r.filename))

  for (const file of files) {
    if (done.has(file)) {
      console.log(`skip ${file}`)
      continue
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    console.log(`apply ${file}`)
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  }

  await client.end()
  console.log('migrations complete')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
