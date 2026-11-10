import { useEffect, useState } from 'react'

// Taxi centers (firestore.rules: centers). Each center has its own queue, taxis, dispatch log, fare
// table and staff. The first one (today's data) is MAIN, "TaxiQ Center": its queue stays at
// queue/state and its fare table at config/fares, so nothing had to move; records without a
// centerId belong to it. Platform admins (admins without a center, and developers) create centers
// and appoint each center's admins; a center admin manages only their center.

type Fb = typeof import('./firebase')
export const MAIN = 'main'

export interface Center {
  id: string
  name: string
  nameDv: string
  at: [number, number] | null // where it is, for "nearest first"
}

export const centerOf = (x: { centerId?: string | null } | null | undefined) => x?.centerId || MAIN
export const queueRef = (fb: Fb, c: string) => (c === MAIN ? fb.doc(fb.db, 'queue', 'state') : fb.doc(fb.db, 'queues', c))
export const faresRef = (fb: Fb, c: string) => (c === MAIN ? fb.doc(fb.db, 'config', 'fares') : fb.doc(fb.db, 'fares', c))

const str = (x: unknown, n: number) => (typeof x === 'string' ? x.slice(0, n) : '')
export function parseCenter(id: string, x: Record<string, unknown>): Center | null {
  const name = str(x.name, 60)
  if (!name) return null
  const at = Array.isArray(x.at) && x.at.length === 2 && x.at.every((n) => typeof n === 'number') ? ([x.at[0], x.at[1]] as [number, number]) : null
  return { id, name, nameDv: str(x.nameDv, 60), at }
}

export function useCenters(fb: Fb | null, enabled: boolean): Center[] {
  const [list, setList] = useState<Center[]>([])
  useEffect(() => {
    if (!fb || !enabled) return
    return fb.onSnapshot(
      fb.collection(fb.db, 'centers'),
      (s) => setList(s.docs.flatMap((d) => parseCenter(d.id, d.data()) ?? []).sort((a, b) => (a.id === MAIN ? -1 : b.id === MAIN ? 1 : a.name.localeCompare(b.name)))),
      () => setList([]),
    )
  }, [fb, enabled])
  // Until the first center's record exists, it is still there.
  const out = list.some((c) => c.id === MAIN) ? list : [{ id: MAIN, name: 'TaxiQ Center', nameDv: '', at: [6.62, 73.07] as [number, number] }, ...list]
  return fb && enabled ? out : []
}

// Nearest first (to the pickup), for the hire form.
export function byDistance(centers: Center[], from: [number, number] | undefined): Center[] {
  if (!from) return centers
  const d = (c: Center) => (c.at ? Math.hypot(c.at[0] - from[0], (c.at[1] - from[1]) * Math.cos((from[0] * Math.PI) / 180)) : 99)
  return [...centers].sort((a, b) => d(a) - d(b))
}

export async function saveCenter(fb: Fb, c: { id?: string; name: string; nameDv: string; at: [number, number] | null }, email: string) {
  const ref = c.id ? fb.doc(fb.db, 'centers', c.id) : fb.doc(fb.collection(fb.db, 'centers'))
  const data: Record<string, unknown> = { name: c.name.trim().slice(0, 60), nameDv: c.nameDv.trim().slice(0, 60), at: c.at, updatedBy: email, updatedAt: fb.serverTimestamp() }
  await fb.setDoc(ref, data, { merge: true })
  return ref.id
}

// Platform admins, once: give today's records (no centerId) to the first center, and make its
// record. Runs on a platform admin's app; marks itself done on the center's record.
export async function moveToMainCenter(fb: Fb, email: string) {
  const mainRef = fb.doc(fb.db, 'centers', MAIN)
  const main = await fb.getDoc(mainRef)
  if (main.exists() && main.data().migrated === true) return
  for (const name of ['taxis', 'publicTaxis', 'dispatches', 'queueChanges']) {
    const snap = await fb.getDocs(fb.collection(fb.db, name))
    const todo = snap.docs.filter((d) => !d.data().centerId)
    for (let i = 0; i < todo.length; i += 400) {
      const batch = fb.writeBatch(fb.db)
      for (const d of todo.slice(i, i + 400)) batch.update(d.ref, { centerId: MAIN })
      await batch.commit()
    }
  }
  await fb.setDoc(mainRef, { name: main.exists() ? main.data().name : 'TaxiQ Center', nameDv: main.exists() ? (main.data().nameDv ?? '') : '', at: main.exists() ? (main.data().at ?? [6.62, 73.07]) : [6.62, 73.07], migrated: true, updatedBy: email, updatedAt: fb.serverTimestamp() }, { merge: true })
}
