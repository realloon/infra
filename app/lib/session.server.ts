import { createCookie } from 'react-router'

export const uidCookie = createCookie('carbon_uid', {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
})

async function parseUid(request: Request): Promise<string | null> {
  const existing = await uidCookie.parse(request.headers.get('Cookie'))
  return typeof existing === 'string' && existing ? existing : null
}

export async function ensureUid(request: Request): Promise<{ uid: string; setCookie?: string }> {
  const uid = await parseUid(request)
  if (uid) return { uid }
  const fresh = crypto.randomUUID()
  return { uid: fresh, setCookie: await uidCookie.serialize(fresh) }
}

export const readUid = parseUid
