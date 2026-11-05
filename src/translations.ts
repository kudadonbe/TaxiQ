// Live translation fixes. The built-in Dhivehi strings live in src/i18n.tsx; an admin can correct
// any of them in Admin → Translations. Fixes are stored in Firestore (translations/dv) and applied
// on top of the built-in strings for everyone, without a rebuild. "Export" turns them into
// English → Dhivehi pairs to write back into the code.
//
// Strings that are functions, e.g. (no) => `Taxi ${no} is coming`, are edited as templates with
// numbered placeholders: "Taxi {1} is coming". A fix must keep the same placeholders.

export type Overrides = Readonly<Record<string, string>>

// Labels that change shape with their arguments (not a simple fill-in), so they can't be edited
// as one template. They're screen-reader labels; fix them in code.
const NOT_EDITABLE = new Set(['rowLabel'])

export interface Entry {
  key: string // dotted path, e.g. "errors.taken"
  value: string // the text, or the template for a function
  isTemplate: boolean
}

const PLACEHOLDER = /\{(\d)\}/g

export function asTemplate(fn: (...args: never[]) => unknown): string {
  const args = Array.from({ length: fn.length }, (_, i) => `{${i + 1}}`)
  return String((fn as (...a: string[]) => unknown)(...args))
}

// Every editable string in a dictionary, flattened to dotted keys.
export function flatten(dict: object, prefix = ''): Entry[] {
  const out: Entry[] = []
  for (const [k, v] of Object.entries(dict)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (NOT_EDITABLE.has(key)) continue
    if (typeof v === 'string') out.push({ key, value: v, isTemplate: false })
    else if (typeof v === 'function') out.push({ key, value: asTemplate(v), isTemplate: true })
    else if (v && typeof v === 'object') out.push(...flatten(v, key))
  }
  return out
}

export const placeholders = (s: string) => new Set([...s.matchAll(PLACEHOLDER)].map((m) => m[1]))

// A fix is acceptable if it is not empty, not too long, and keeps every placeholder of the original.
export function checkFix(original: string, fix: string): 'ok' | 'empty' | 'too_long' | 'placeholders' {
  const text = fix.trim()
  if (!text) return 'empty'
  if (text.length > 300) return 'too_long'
  const want = placeholders(original)
  const have = placeholders(text)
  if (want.size !== have.size || [...want].some((p) => !have.has(p))) return 'placeholders'
  return 'ok'
}

const fill = (template: string, args: unknown[]) => template.replace(PLACEHOLDER, (_, i: string) => String(args[Number(i) - 1] ?? ''))

// The dictionary with fixes applied (same shape as the original).
export function applyOverrides<T extends object>(dict: T, overrides: Overrides, prefix = ''): T {
  if (!Object.keys(overrides).length) return dict
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(dict)) {
    const key = prefix ? `${prefix}.${k}` : k
    const fix = NOT_EDITABLE.has(key) ? undefined : overrides[key]
    if (typeof v === 'string') out[k] = fix ?? v
    else if (typeof v === 'function') out[k] = fix ? (...args: unknown[]) => fill(fix, args) : v
    else if (v && typeof v === 'object') out[k] = applyOverrides(v, overrides, key)
    else out[k] = v
  }
  return out as T
}

// Only keep well-formed fixes read from the database.
export function parseOverrides(data: unknown): Overrides {
  const entries = (data as { entries?: unknown } | undefined)?.entries
  if (!entries || typeof entries !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(entries as Record<string, unknown>)) {
    if (/^[A-Za-z0-9.]{1,80}$/.test(k) && typeof v === 'string' && v.trim() && v.length <= 300) out[k] = v
  }
  return out
}
