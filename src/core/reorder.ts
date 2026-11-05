// TaxiQ core: manual queue changes by staff (reorder, shuffle). Every change needs a reason and is
// logged by the caller. Pure functions, no storage.

export type ReorderReason = 'late' | 'returned' | 'correction' | 'shift' | 'other'
export const REORDER_REASONS: readonly ReorderReason[] = ['late', 'returned', 'correction', 'shift', 'other']

// A new order is only valid if it holds exactly the same taxis (none added, none dropped, no
// duplicates). Returns the order, or null.
export function validReorder(current: readonly string[], next: readonly string[]): string[] | null {
  if (next.length !== current.length || new Set(next).size !== next.length) return null
  const have = new Set(current)
  return next.every((id) => have.has(id)) ? [...next] : null
}

// Move one taxi up or down by `by` places (clamped), or to the front / back.
export function move(order: readonly string[], id: string, to: 'up' | 'down' | 'front' | 'back'): string[] {
  const i = order.indexOf(id)
  if (i < 0) return [...order]
  const rest = order.filter((x) => x !== id)
  const j = to === 'front' ? 0 : to === 'back' ? rest.length : to === 'up' ? Math.max(0, i - 1) : Math.min(rest.length, i + 1)
  rest.splice(j, 0, id)
  return rest
}

// Fair random order (Fisher–Yates). `random` is injectable for tests.
export function shuffle(order: readonly string[], random: () => number = Math.random): string[] {
  const a = [...order]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

// A reason is required; "other" needs a note.
export function reasonOk(reason: string, note: string): boolean {
  return REORDER_REASONS.includes(reason as ReorderReason) && (reason !== 'other' || note.trim().length > 0)
}
