// TaxiQ core engine: the queue rules. Pure functions, no UI and no storage: every client (the demo,
// the live Firestore queue, and later the API server) runs the same rules from here.
//
// A queue is a list of taxi ids in rank order plus the set of drivers who answered the current call.
// Every action returns the new state, or null when the action isn't allowed (callers do nothing).

export interface QueueState {
  order: readonly string[]
  interested: readonly string[]
}

export interface QueueTaxi {
  id: string
  taxiNo: string
  suspended: boolean
}

// What a dispatch remembers so it can be undone or reopened.
export interface DispatchRecord {
  taxiId: string
  from: number // index in the order before the taxi went to the back
  interested: readonly string[] // drivers who had answered
}

// Move an item to an index (clamped), keeping everyone else's order.
export function placeAt<T extends string | { id: string }>(list: readonly T[], id: string, index: number): T[] {
  const key = (x: T) => (typeof x === 'string' ? x : x.id)
  const item = list.find((x) => key(x) === id)
  if (item === undefined) return [...list]
  const next = list.filter((x) => key(x) !== id)
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item)
  return next
}

// Clean a stored order against the registered taxis: unknown or duplicate ids are dropped, and any
// taxi missing from the order (just registered) joins the back, lowest center number first.
export function normalizeOrder(order: unknown, taxis: readonly QueueTaxi[]): string[] {
  const known = new Set(taxis.map((t) => t.id))
  const ids = Array.isArray(order) ? order.filter((id): id is string => typeof id === 'string' && known.has(id)) : []
  const kept = [...new Set(ids)]
  const seen = new Set(kept)
  const missing = taxis.filter((t) => !seen.has(t.id)).sort((a, b) => Number(a.taxiNo) - Number(b.taxiNo))
  return [...kept, ...missing.map((t) => t.id)]
}

const available = (taxis: ReadonlyMap<string, QueueTaxi>, id: string) => {
  const t = taxis.get(id)
  return !!t && !t.suspended
}

export const byId = (taxis: readonly QueueTaxi[]) => new Map(taxis.map((t) => [t.id, t]))

// The suggested driver: the answered driver standing highest in the queue.
export function suggestion(state: QueueState): string | null {
  return state.order.find((id) => state.interested.includes(id)) ?? null
}

// Tap a driver who answered (or un-tap). Suspended taxis can't answer.
export function toggleInterest(state: QueueState, id: string, taxis: ReadonlyMap<string, QueueTaxi>): QueueState | null {
  if (!available(taxis, id)) return null
  const interested = state.interested.includes(id) ? state.interested.filter((x) => x !== id) : [...state.interested, id]
  return { order: [...state.order], interested }
}

export function clearCall(state: QueueState): QueueState {
  return { order: [...state.order], interested: [] }
}

// Assign the ride to an answered driver. The taxi goes to the back, the call is finished
// (nobody is slid out any more), and the dispatch records what undo/reopen need.
export function assign(state: QueueState, id: string, taxis: ReadonlyMap<string, QueueTaxi>): { state: QueueState; dispatch: DispatchRecord } | null {
  const from = state.order.indexOf(id)
  if (from < 0 || !available(taxis, id) || !state.interested.includes(id)) return null
  return {
    state: { order: [...state.order.filter((x) => x !== id), id], interested: [] },
    dispatch: { taxiId: id, from, interested: [...state.interested] },
  }
}

// Undo exactly reverses an assignment, but only while nothing else has moved the taxi (it is still
// last in the order).
export function canUndo(state: QueueState, d: DispatchRecord): boolean {
  return state.order.at(-1) === d.taxiId
}

export function undo(state: QueueState, d: DispatchRecord, taxis: ReadonlyMap<string, QueueTaxi>): QueueState | null {
  if (!canUndo(state, d)) return null
  return {
    order: placeAt(state.order, d.taxiId, d.from),
    interested: d.interested.filter((id) => available(taxis, id)),
  }
}

// Reopen a dispatch (something happened to the driver before the trip was done): the driver gets
// their old place back, and the other answered drivers slide out again so the call can be
// reassigned. The reopened driver is not counted as answering.
export function reopen(state: QueueState, d: DispatchRecord, taxis: ReadonlyMap<string, QueueTaxi>): QueueState | null {
  if (!state.order.includes(d.taxiId)) return null
  return {
    order: placeAt(state.order, d.taxiId, d.from),
    interested: d.interested.filter((id) => id !== d.taxiId && available(taxis, id)),
  }
}

// A suspended taxi keeps its place but stops answering.
export function onSuspend(state: QueueState, id: string): QueueState {
  return { order: [...state.order], interested: state.interested.filter((x) => x !== id) }
}

export function removeTaxi(state: QueueState, id: string): QueueState {
  return { order: state.order.filter((x) => x !== id), interested: state.interested.filter((x) => x !== id) }
}

// A driver who accepted a ride request moves their own taxi to the back (the Firestore rules check
// exactly this shape: order.removeAll([id]).concat([id])).
export function driverToBack(state: QueueState, id: string): QueueState {
  return { order: [...state.order.filter((x) => x !== id), id], interested: state.interested.filter((x) => x !== id) }
}
