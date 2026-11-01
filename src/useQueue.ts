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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
    } catch {
      // Storage unavailable (private mode etc.) — the queue still works in memory.
    }
  }, [queue])

  // The ride goes to the interested driver standing highest in the queue.
  const pick = queue.find((t) => interested.has(t.id))

  const toggle = (id: string) => {
    const next = new Set(interested)
    if (!next.delete(id)) next.add(id)
    setInterested(next)
  }

  const clear = () => setInterested(new Set())

  // Assigning sends the picked taxi to the back; everyone else slides back into line.
  const assign = () => {
    if (!pick) return
    const from = queue.indexOf(pick)
    setQueue([...queue.filter((t) => t.id !== pick.id), pick])
    setHistory([{ taxi: pick, at: Date.now(), from, interested: [...interested] }, ...history].slice(0, 20))
    setInterested(new Set())
  }

  // Undo the most recent assignment: taxi back to its old place, interested drivers slid out again.
  const undo = () => {
    const [last, ...rest] = history
    if (!last) return
    const next = queue.filter((t) => t.id !== last.taxi.id)
    next.splice(last.from, 0, last.taxi)
    setQueue(next)
    setInterested(new Set(last.interested.filter((id) => next.some((t) => t.id === id))))
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
    const next = new Set(interested)
    next.delete(id)
    setInterested(next)
  }

  const reset = () => {
    setQueue(initialTaxis)
    setHistory([])
    setInterested(new Set())
  }

  return { queue, history, interested, pick, toggle, clear, assign, undo, register, remove, reset }
}
