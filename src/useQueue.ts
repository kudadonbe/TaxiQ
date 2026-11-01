import { useEffect, useState } from 'react'
import { initialTaxis } from './data/taxis'
import type { Taxi } from './types'
import { parseStoredTaxi, toTaxi, type TaxiInput } from './validate'

// The queue holds every registered taxi, in rank order. Stored as full records because the
// admin panel can add and remove taxis; bump the key if the stored shape changes.
const STORAGE_KEY = 'taxiq.queue.v3'

export interface Dispatch {
  taxi: Taxi
  at: number
  // Where the taxi stood in the queue, and who had answered the call, so undo can restore both exactly.
  from: number
  interested: string[]
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

export function useQueue() {
  const [queue, setQueue] = useState<Taxi[]>(load)
  const [history, setHistory] = useState<Dispatch[]>([])
  // Drivers who answered the current radio call (their rows are slid left).
  const [interested, setInterested] = useState<ReadonlySet<string>>(new Set())
  // The taxi the current call was assigned to, while the call is still open. It stays open so
  // the operator can reassign if that driver doesn't respond; Done closes it. Always history[0].
  const [assignedId, setAssignedId] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
    } catch {
      // Storage unavailable (private mode etc.) — the queue still works in memory.
    }
  }, [queue])

  // Suggested driver: the answered driver standing highest in the queue (excluding the one
  // already assigned on this call).
  const pick = queue.find((t) => interested.has(t.id) && t.id !== assignedId)
  const assigned = assignedId ? queue.find((t) => t.id === assignedId) : undefined

  const toggle = (id: string) => {
    if (id === assignedId) return
    const next = new Set(interested)
    if (!next.delete(id)) next.add(id)
    setInterested(next)
  }

  // Close the call: everyone slides back into line.
  const done = () => {
    setInterested(new Set())
    setAssignedId(null)
  }

  // Put a dispatched taxi back where it stood before. Only valid for history[0], because the
  // queue hasn't changed since then.
  const restore = (q: Taxi[], d: Dispatch) => {
    const next = q.filter((t) => t.id !== d.taxi.id)
    next.splice(d.from, 0, d.taxi)
    return next
  }

  // Assign the ride to one of the answered drivers (usually `pick`, but the operator may choose
  // any). That taxi goes to the back. If the call was already assigned, this is a reassign: the
  // driver who didn't respond goes back to their old place and is no longer marked as answered.
  const assign = (id: string) => {
    if (id === assignedId || !interested.has(id)) return
    let q = queue
    let hist = history
    const answered = new Set(interested)
    const prev = assignedId ? history[0] : undefined
    if (prev) {
      q = restore(q, prev)
      hist = history.slice(1)
      answered.delete(prev.taxi.id)
    }
    const from = q.findIndex((t) => t.id === id)
    if (from < 0) return
    const taxi = q[from]!
    setQueue([...q.filter((t) => t.id !== id), taxi])
    setHistory([{ taxi, at: Date.now(), from, interested: [...answered] }, ...hist].slice(0, 20))
    setInterested(answered)
    setAssignedId(id)
  }

  // Undo the most recent assignment: taxi back to its old place, interested drivers slid out again.
  const undo = () => {
    const [last, ...rest] = history
    if (!last) return
    const next = restore(queue, last)
    setQueue(next)
    setInterested(new Set(last.interested.filter((id) => next.some((t) => t.id === id))))
    setAssignedId(null)
    setHistory(rest)
  }

  // Admin: a newly registered taxi joins the back of the rank. Input must already be validated.
  const register = (input: TaxiInput) => {
    setQueue([...queue, toTaxi(crypto.randomUUID(), input)])
  }

  // Admin: an unsubscribed taxi leaves the rank. Removing shifts everyone's position, so the
  // undo history (which stores positions) is cleared rather than left pointing at wrong places.
  const remove = (id: string) => {
    setQueue(queue.filter((t) => t.id !== id))
    setHistory([])
    setAssignedId(null)
    const next = new Set(interested)
    next.delete(id)
    setInterested(next)
  }

  const reset = () => {
    setQueue(initialTaxis)
    setHistory([])
    setInterested(new Set())
    setAssignedId(null)
  }

  return { queue, history, interested, pick, assigned, toggle, done, assign, undo, register, remove, reset }
}
