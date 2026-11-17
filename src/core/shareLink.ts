// Share pickup links: a link to our own app that opens the map on a place (no sign-in needed).
//   https://kd-taxiq.web.app/?at=<lat>,<lng>[&n=<place name>]
// Both sides are allow-listed: the position must be inside the Maldives (5 decimals at most), and
// the name is a short place name (letters in any script, digits, basic punctuation). Never put
// personal data (phone, passenger name) in a link; the builder only takes a place name.

export const SHARE_BASE = 'https://kd-taxiq.web.app/'
export const SHARE_NAME_MAX = 60

// The Maldives with a margin (Haa Alif to Addu, Thiladhunmathi to the eastern atolls).
export const MALDIVES_BOX = { south: -1, north: 7.5, west: 72.3, east: 74 }

export interface SharedSpot {
  at: [number, number]
  name?: string
}

const AT_RE = /^(-?\d{1,2}\.\d{1,5}),(\d{2}\.\d{1,5})$/
// Letters and marks in any script, digits, spaces and basic punctuation (as isFreeText).
const NAME_RE = /^[\p{L}\p{M}\p{N} .,'/#()&+:;\-،]+$/u

export function inMaldives([lat, lng]: readonly [number, number]): boolean {
  return lat >= MALDIVES_BOX.south && lat <= MALDIVES_BOX.north && lng >= MALDIVES_BOX.west && lng <= MALDIVES_BOX.east
}

// A place name fit for a link, or null: trimmed, single spaces, 1-60 characters, allow-listed, and
// never a phone number (no run of 7 digits).
export function cleanShareName(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ')
  if (!s || [...s].length > SHARE_NAME_MAX || !NAME_RE.test(s) || /\d{7}/.test(s)) return null
  return s
}

// Read `at` and `n` from a query string (location.search). Anything that fails the rules is ignored:
// a bad position gives null, a bad name is left out.
export function parseShareParams(search: string): SharedSpot | null {
  let q: URLSearchParams
  try {
    q = new URLSearchParams(search)
  } catch {
    return null
  }
  const m = AT_RE.exec(q.get('at') ?? '')
  if (!m) return null
  const at: [number, number] = [Number(m[1]), Number(m[2])]
  if (!at.every(Number.isFinite) || !inMaldives(at)) return null
  const n = q.get('n')
  const name = n === null ? null : cleanShareName(n)
  return name ? { at, name } : { at }
}

// The link for a place. The name is added only if it passes the rules.
export function shareLink(at: readonly [number, number], name?: string, base = SHARE_BASE): string {
  const q = `at=${at[0].toFixed(5)},${at[1].toFixed(5)}`
  const n = name ? cleanShareName(name) : null
  return `${base}?${q}${n ? `&n=${encodeURIComponent(n)}` : ''}`
}

// The query string without `at` and `n` (other parameters kept), for history.replaceState.
export function withoutShareParams(search: string): string {
  const q = new URLSearchParams(search)
  q.delete('at')
  q.delete('n')
  const s = q.toString()
  return s ? `?${s}` : ''
}
