import { useEffect, useState } from 'react'
import { initialTaxis } from './data/taxis'
import type { CallInfo, SuspendReason, Taxi } from './types'
import { EMPTY_CALL, hasCallInfo, parseStoredTaxi, toTaxi, type TaxiInput } from './validate'

// The queue holds every registered taxi, in rank order (suspended ones keep their place). Stored as
// full records because the admin panel can add, remove and suspend taxis. Call/passenger details and
// the dispatch log are never stored. Bump the key if the stored shape changes incompatibly.
const STORAGE_KEY = 'taxiq.queue.v3'

export interface Dispatch {
  id: string
  taxi: Taxi
  at: number
  // Where the taxi stood and who had answered, so the dispatch can be undone or reopened.
  from: number
  interested: string[]
  call: CallInfo | null
  reopened: boolean
  // `from` is exact only until the queue changes some other way (a reopen or a removal).
  exact: boolean
}

// Everything the screens need from the queue, in both modes: the local demo (this file) and the live
// Firestore queue for signed-in staff (useLiveQueue.ts).
export interface QueueApi {
  mode: 'demo' | 'live'
  loaded: boolean
  error: string | null
  queue: Taxi[]
  history: Dispatch[]
  interested: ReadonlySet<string>
  pick: Taxi | undefined
  call: CallInfo
  setCall: (c: CallInfo) => void
  callInProgress: boolean
  canUndo: boolean
  toggle: (id: string) => void
  clear: () => void
  assign: (id: string) => void
  undo: () => void
  reopen: (dispatchId: string) => void
  suspend: (id: string, reason: SuspendReason, note: string) => void
  lift: (id: string) => void
  register: (input: TaxiInput) => void
  remove: (id: string) => void
  reset: (() => void) | null // demo only
  seedDemo: (() => void) | null // live only, empty database
}

function load(): Taxi[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialTaxis
    const stored: unknown = JSON.parse(raw)
    if (!Array.isArray(stored)) return initialTaxis
    // Every record is re-validated; anything malformed or duplicated is dropped.
    const seen = new Set<string>()
    const taxis: Taxi[] = []
    for (const item of stored) {
      const t = parseStoredTaxi(item)
      if (!t || seen.has(t.id) || seen.has(`no:${t.taxiNo}`)) continue
      seen.add(t.id).add(`no:${t.taxiNo}`)
      taxis.push(t)
    }
    return taxis
  } catch {
    return initialTaxis
  }
}

// Demo mode: the queue lives in this browser only.
export function useLocalQueue(): QueueApi {
  const [queue, setQueue] = useState<Taxi[]>(load)
  const [history, setHistory] = useState<Dispatch[]>([])
  // Drivers who answered the current radio call (their rows are slid left).
  const [interested, setInterested] = useState<ReadonlySet<string>>(new Set())
  // Passenger details for the call being taken now.
  const [call, setCall] = useState<CallInfo>(EMPTY_CALL)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
    } catch {
      // Storage unavailable (private mode etc.) — the queue still works in memory.
    }
  }, [queue])

  // Suggested driver: the answered driver standing highest in the queue.
  const pick = queue.find((t) => interested.has(t.id))
  const callInProgress = interested.size > 0 || hasCallInfo(call)
  const canUndo = !!history[0] && history[0].exact && !history[0].reopened

  const available = (id: string) => {
    const t = queue.find((x) => x.id === id)
    return !!t && !t.suspended
  }

  const toggle = (id: string) => {
    if (!available(id)) return
    const next = new Set(interested)
    if (!next.delete(id)) next.add(id)
    setInterested(next)
  }

  // Cancel the call being taken: everyone slides back, details cleared.
  const clear = () => {
    setInterested(new Set())
    setCall(EMPTY_CALL)
  }

  // Assigning finishes the call: the taxi goes to the back, every slid card returns to normal,
  // and the passenger details go with the dispatch.
  const assign = (id: string) => {
    const from = queue.findIndex((t) => t.id === id)
    const taxi = queue[from]
    if (!taxi || taxi.suspended || !interested.has(id)) return
    setQueue([...queue.filter((t) => t.id !== id), taxi])
    setHistory(
      [
        {
          id: crypto.randomUUID(),
          taxi,
          at: Date.now(),
          from,
          interested: [...interested],
          call: hasCallInfo(call) ? call : null,
          reopened: false,
          exact: true,
        },
        ...history,
      ].slice(0, 30),
    )
    clear()
  }

  // Undo a mistaken assignment (latest only): exact restore of the queue, the answered drivers and
  // the call details, as if Assign was never pressed.
  const undo = () => {
    const [last, ...rest] = history
    if (!last || !canUndo || callInProgress) return
    setQueue(placeAt(queue, last.taxi.id, last.from))
    setInterested(new Set(last.interested.filter(available)))
    setCall(last.call ?? EMPTY_CALL)
    setHistory(rest)
  }

  // Reopen a dispatch when something happened to the driver before the trip was completed: the
  // driver gets their old place back, the call (details + other answered drivers) comes back so it
  // can be assigned to someone else, and the dispatch stays in the log marked as reopened.
  const reopen = (dispatchId: string) => {
    const d = history.find((x) => x.id === dispatchId)
    if (!d || d.reopened || callInProgress || !queue.some((t) => t.id === d.taxi.id)) return
    setQueue(placeAt(queue, d.taxi.id, d.from))
    setInterested(new Set(d.interested.filter((id) => id !== d.taxi.id && available(id))))
    setCall(d.call ?? EMPTY_CALL)
    setHistory(history.map((x) => (x.id === d.id ? { ...x, reopened: true } : { ...x, exact: false })))
  }

  // Admin: suspend (flip to the red side) or lift. The taxi keeps its place in the queue.
  const suspend = (id: string, reason: SuspendReason, note: string) => {
    setQueue(queue.map((t) => (t.id === id ? { ...t, suspended: { reason, note: note.trim(), at: Date.now() } } : t)))
    const next = new Set(interested)
    next.delete(id)
    setInterested(next)
  }

  const lift = (id: string) => {
    setQueue(
      queue.map((t) => {
        if (t.id !== id) return t
        const { suspended: _lifted, ...rest } = t
        return rest
      }),
    )
  }

  // Admin: a newly registered taxi joins the back of the rank. Input must already be validated.
  const register = (input: TaxiInput) => {
    setQueue([...queue, toTaxi(crypto.randomUUID(), input)])
  }

  // Admin: an unsubscribed taxi leaves the rank. Positions shift, so logged dispatches can no
  // longer be undone exactly (they can still be reopened, by index).
  const remove = (id: string) => {
    setQueue(queue.filter((t) => t.id !== id))
    setHistory(history.map((x) => ({ ...x, exact: false })))
    const next = new Set(interested)
    next.delete(id)
    setInterested(next)
  }

  const reset = () => {
    setQueue(initialTaxis)
    setHistory([])
    clear()
  }

  return {
    mode: 'demo',
    loaded: true,
    error: null,
    seedDemo: null,
    queue,
    history,
    interested,
    pick,
    call,
    setCall,
    callInProgress,
    canUndo,
    toggle,
    clear,
    assign,
    undo,
    reopen,
    suspend,
    lift,
    register,
    remove,
    reset,
  }
}

// Move an item to an index (clamped), keeping everyone else's order.
export function placeAt<T extends string | { id: string }>(list: T[], id: string, index: number): T[] {
  const key = (x: T) => (typeof x === 'string' ? x : x.id)
  const item = list.find((x) => key(x) === id)
  if (item === undefined) return list
  const next = list.filter((x) => key(x) !== id)
  next.splice(Math.min(index, next.length), 0, item)
  return next
}
