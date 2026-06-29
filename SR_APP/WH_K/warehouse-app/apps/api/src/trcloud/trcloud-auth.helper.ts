const ERP_BASE = process.env.TRCLOUD_ERP_URL ?? 'https://thaidrill.trcloud.co'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

let cachedCookie: string | null = null

/** ล็อกอิน TRCloud ERP แล้วคืน cookie header (cache ใน process) */
export async function getTrcloudCookie(): Promise<string> {
  if (cachedCookie) return cachedCookie

  const username = process.env.TRCLOUD_USERNAME
  const password = process.env.TRCLOUD_PASSWORD
  const deviceId = process.env.TRCLOUD_DEVICE_ID
  if (!username || !password || !deviceId) {
    throw new Error('TRCLOUD_USERNAME / TRCLOUD_PASSWORD / TRCLOUD_DEVICE_ID ไม่ครบใน .env')
  }

  const page = await fetch(`${ERP_BASE}/application/login/`, {
    headers: { 'User-Agent': UA },
  })
  const sessionId = page.headers.getSetCookie?.()
    ?.map(c => c.split(';')[0])
    .find(c => c.startsWith('PHPSESSID='))
    ?.split('=')[1]
    ?? parseCookieHeader(page.headers.get('set-cookie'), 'PHPSESSID')

  if (!sessionId) throw new Error('TRCloud login: ไม่ได้รับ PHPSESSID')

  const body = new URLSearchParams({
    json: JSON.stringify({
      username,
      password,
      cookie: deviceId,
      remember: 'false',
    }),
  })

  const res = await fetch(`${ERP_BASE}/application/login/login_engine.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': UA,
      Origin: ERP_BASE,
      Cookie: `trcloud=${deviceId}; PHPSESSID=${sessionId}`,
    },
    body,
  })

  const data = await res.json() as { success?: number; message?: string }
  if (data.success !== 1) {
    throw new Error(`TRCloud login failed: ${data.message ?? 'unknown'}`)
  }

  cachedCookie = `trcloud=${deviceId}; PHPSESSID=${sessionId}`
  return cachedCookie
}

export function clearTrcloudCookieCache() {
  cachedCookie = null
}

function parseCookieHeader(raw: string | null, name: string): string | undefined {
  if (!raw) return undefined
  const match = raw.match(new RegExp(`${name}=([^;]+)`))
  return match?.[1]
}

export { ERP_BASE, UA }
