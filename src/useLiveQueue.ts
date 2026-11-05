import { useEffect, useMemo, useState } from 'react'
import { initialTaxis } from './data/taxis'
import type { CallInfo, SuspendReason, Taxi } from './types'
import type { Dispatch, QueueApi } from './useQueue'
import { placeAt } from './useQueue'
import { EMPTY_CALL, hasCallInfo, parseStoredTaxi, toTaxi, validateCall, type TaxiInput } from './validate'

type Fb = typeof import('./firebase')

// Live queue shared by every signed-in operator, kept in Firestore:
//   taxis/{id}        taxi records (admin writes)
//   queue/state       { order: taxi ids, interested: taxi ids }
//   dispatches/{id}   dispatch log (never deleted; undo/reopen set flags)
// Every change that touches the order runs in a transaction, so two operators can't interleave.
// Passenger details live in the dispatch documents (Singapore region; see SECURITY.md).

function parseCall(v: unknown): CallInfo | null {
  if (typeof v !== 'object' || v === null) return null
  const c = v as Record<string, unknown>
  const s = (x: unknown) => (typeof x === 'string' ? x : '')
  const call: CallInfo = { pickup: s(c.pickup), destination: s(c.destination), phone: s(c.phone), note: s(c.note) }
  const at = c.pickupAt
  const to = c.destinationAt
  if (Array.isArray(to) && to.length === 2 && to.every((n) => typeof n === 'number' && Number.isFinite(n))) call.destinationAt = [to[0] as number, to[1] as number]
  if (Array.isArray(at) && at.length === 2 && at.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    call.pickupAt = [at[0] as number, at[1] as number]
  }
  return Object.keys(validateCall(call)).length || !hasCallInfo(call) ? null : call
}

// Firestore rejects `undefined`; send only defined fields.
function taxiData(t: Taxi) {
  const { id: _id, suspended, ...rest } = t
  return suspended ? { ...rest, suspended } : rest
}
function callData(c: CallInfo) {
  const { pickupAt, destinationAt, ...rest } = c
  return { ...rest, ...(pickupAt ? { pickupAt } : {}), ...(destinationAt ? { destinationAt } : {}) }
}

// Order ids from the state doc, keeping only registered taxis; any taxi missing from the order
// (just registered) joins the back.
function normalize(order: unknown, taxis: Map<string, Taxi>): string[] {
  const ids = Array.isArray(order) ? order.filter((id): id is string => typeof id === 'string' && taxis.has(id)) : []
  const seen = new Set(ids)
  const missing = [...taxis.values()].filter((t) => !seen.has(t.id)).sort((a, b) => Number(a.taxiNo) - Number(b.taxiNo))
  return [...new Set(ids), ...missing.map((t) => t.id)]
}

export function useLiveQueue(fb: Fb | null, enabled: boolean, email: string | null, isAdmin = false): QueueApi {
  const [taxis, setTaxis] = useState<Map<string, Taxi>>(new Map())
  const [state, setState] = useState<{ order: unknown; interested: unknown }>({ order: [], interested: [] })
  const [log, setLog] = useState<(Dispatch & { undone: boolean })[]>([])
  const [call, setCall] = useState<CallInfo>(EMPTY_CALL)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!fb || !enabled) return
    const { db, collection, doc, onSnapshot, query, orderBy, limit } = fb
    const fail = (e: { code?: string }) => setError(e.code ?? 'error')
    const stops = [
      onSnapshot(
        collection(db, 'taxis'),
        (snap) => {
          const next = new Map<string, Taxi>()
          for (const d of snap.docs) {
            const t = parseStoredTaxi({ id: d.id, ...d.data() })
            if (t) next.set(t.id, t)
          }
          setTaxis(next)
          setLoaded(true)
        },
        fail,
      ),
      onSnapshot(
        doc(db, 'queue', 'state'),
        (snap) => setState({ order: snap.data()?.order ?? [], interested: snap.data()?.interested ?? [] }),
        fail,
      ),
      onSnapshot(
        query(collection(db, 'dispatches'), orderBy('at', 'desc'), limit(40)),
        (snap) => {
          const rows: (Dispatch & { undone: boolean })[] = []
          for (const d of snap.docs) {
            const x = d.data()
            const taxi = parseStoredTaxi(x.taxi)
            if (!taxi || typeof x.at !== 'number' || typeof x.from !== 'number') continue
            rows.push({
              id: d.id,
              taxi,
              at: x.at,
              from: x.from,
              interested: Array.isArray(x.interested) ? x.interested.filter((i: unknown) => typeof i === 'string') : [],
              call: parseCall(x.call),
              reopened: x.reopened === true,
              undone: x.undone === true,
              exact: true,
            })
          }
          setLog(rows)
        },
        fail,
      ),
    ]
    return () => stops.forEach((s) => s())
  }, [fb, enabled])

  // Admins keep publicTaxis (what the public map shows: no phone numbers) in step with taxis.
  // Any difference, from any source, is repaired the next time an admin has the app open.
  useEffect(() => {
    if (!fb || !enabled || !isAdmin || !loaded) return
    return fb.onSnapshot(fb.collection(fb.db, 'publicTaxis'), (snap) => {
      const have = new Map(snap.docs.map((d) => [d.id, d.data()]))
      const batch = fb.writeBatch(fb.db)
      let writes = 0
      for (const t of taxis.values()) {
        const want = { taxiNo: t.taxiNo, name: t.driver.name, nameDv: t.driver.nameDv, suspended: !!t.suspended }
        const cur = have.get(t.id)
        if (!cur || cur.taxiNo !== want.taxiNo || cur.name !== want.name || cur.nameDv !== want.nameDv || cur.suspended !== want.suspended) {
          batch.set(fb.doc(fb.db, 'publicTaxis', t.id), want)
          writes++
        }
      }
      for (const id of have.keys()) {
        if (!taxis.has(id)) {
          batch.delete(fb.doc(fb.db, 'publicTaxis', id))
          writes++
        }
      }
      if (writes) batch.commit().catch((e: { code?: string }) => setError(e.code ?? 'error'))
    })
  }, [fb, enabled, isAdmin, loaded, taxis])

  const order = useMemo(() => normalize(state.order, taxis), [state.order, taxis])
  const queue = useMemo(() => order.map((id) => taxis.get(id)!), [order, taxis])
  const interested = useMemo(
    () => new Set(Array.isArray(state.interested) ? state.interested.filter((id) => typeof id === 'string' && taxis.get(id) && !taxis.get(id)!.suspended) : []),
    [state.interested, taxis],
  ) as ReadonlySet<string>
  const history = useMemo(() => {
    const rows = log.filter((d) => !d.undone).slice(0, 30)
    // Undo is exact only while the taxi is still last in the queue (nothing moved it since).
    return rows.map((d, i) => ({ ...d, exact: i === 0 && order.at(-1) === d.taxi.id }))
  }, [log, order])

  const pick = queue.find((t) => interested.has(t.id))
  const callInProgress = interested.size > 0 || hasCallInfo(call)
  const canUndo = !!history[0] && history[0].exact && !history[0].reopened

  // Run a change to the queue state (and optionally a dispatch) in one transaction.
  const change = (fn: (order: string[], interested: string[]) => { order: string[]; interested: string[]; dispatch?: [string, Record<string, unknown>] } | null) => {
    if (!fb) return
    const { db, doc, collection, runTransaction, serverTimestamp } = fb
    setError(null)
    void runTransaction(db, async (tx) => {
      const ref = doc(db, 'queue', 'state')
      const snap = await tx.get(ref)
      const cur = normalize(snap.data()?.order, taxis)
      const curInterested = Array.isArray(snap.data()?.interested) ? (snap.data()!.interested as string[]) : []
      const next = fn(cur, curInterested)
      if (!next) return
      tx.set(ref, { order: next.order, interested: next.interested, updatedAt: serverTimestamp(), updatedBy: email ?? '' })
      if (next.dispatch) {
        const [id, data] = next.dispatch
        const dref = id ? doc(db, 'dispatches', id) : doc(collection(db, 'dispatches'))
        if (id) tx.update(dref, data)
        else tx.set(dref, data)
      }
    }).catch((e: { code?: string }) => setError(e.code ?? 'error'))
  }

  const available = (id: string) => !!taxis.get(id) && !taxis.get(id)!.suspended

  const toggle = (id: string) => {
    if (!available(id)) return
    change((o, i) => ({ order: o, interested: i.includes(id) ? i.filter((x) => x !== id) : [...i, id] }))
  }

  const clear = () => {
    setCall(EMPTY_CALL)
    change((o) => ({ order: o, interested: [] }))
  }

  const assign = (id: string) => {
    const taxi = taxis.get(id)
    if (!taxi || taxi.suspended) return
    const details = hasCallInfo(call) ? callData(call) : null
    change((o, i) => {
      const from = o.indexOf(id)
      if (from < 0 || !i.includes(id)) return null
      return {
        order: [...o.filter((x) => x !== id), id],
        interested: [],
        dispatch: ['', { taxi: { id, ...taxiData(taxi) }, at: Date.now(), from, interested: i, call: details, reopened: false, undone: false, by: email ?? '' }],
      }
    })
    setCall(EMPTY_CALL)
  }

  const undo = () => {
    const d = history[0]
    if (!d || !canUndo || callInProgress) return
    change((o) => ({ order: placeAt(o, d.taxi.id, d.from), interested: d.interested.filter(available), dispatch: [d.id, { undone: true }] }))
    setCall(d.call ?? EMPTY_CALL)
  }

  const reopen = (dispatchId: string) => {
    const d = history.find((x) => x.id === dispatchId)
    if (!d || d.reopened || callInProgress || !taxis.has(d.taxi.id)) return
    change((o) => ({
      order: placeAt(o, d.taxi.id, d.from),
      interested: d.interested.filter((x) => x !== d.taxi.id && available(x)),
      dispatch: [d.id, { reopened: true }],
    }))
    setCall(d.call ?? EMPTY_CALL)
  }

  const adminWrite = (p: Promise<unknown>) => {
    setError(null)
    p.catch((e: { code?: string }) => setError(e.code ?? 'error'))
  }

  const suspend = (id: string, reason: SuspendReason, note: string) => {
    if (!fb) return
    adminWrite(fb.updateDoc(fb.doc(fb.db, 'taxis', id), { suspended: { reason, note: note.trim(), at: Date.now() } }))
    if (interested.has(id)) change((o, i) => ({ order: o, interested: i.filter((x) => x !== id) }))
  }

  const lift = (id: string) => {
    if (!fb) return
    adminWrite(fb.updateDoc(fb.doc(fb.db, 'taxis', id), { suspended: fb.deleteField() }))
  }

  const register = (input: TaxiInput) => {
    if (!fb) return
    const ref = fb.doc(fb.collection(fb.db, 'taxis'))
    adminWrite(fb.setDoc(ref, taxiData(toTaxi(ref.id, input))))
  }

  const remove = (id: string) => {
    if (!fb) return
    adminWrite(fb.deleteDoc(fb.doc(fb.db, 'taxis', id)))
    change((o, i) => ({ order: o.filter((x) => x !== id), interested: i.filter((x) => x !== id) }))
  }

  // Admin, empty database only: load the 10 sample drivers to try the live queue.
  const seedDemo = () => {
    if (!fb || taxis.size) return
    const batch = fb.writeBatch(fb.db)
    for (const t of initialTaxis) batch.set(fb.doc(fb.db, 'taxis', t.id), taxiData(t))
    batch.set(fb.doc(fb.db, 'queue', 'state'), { order: initialTaxis.map((t) => t.id), interested: [], updatedAt: fb.serverTimestamp(), updatedBy: email ?? '' })
    adminWrite(batch.commit())
  }

  return {
    mode: 'live',
    loaded,
    error,
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
    reset: null,
    seedDemo: taxis.size ? null : seedDemo,
  }
}
