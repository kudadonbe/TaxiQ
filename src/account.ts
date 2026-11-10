import { useEffect, useState } from 'react'
import { tripEntries, validCorrection, type AccountEntry, type FinishedTrip } from './core/account'

// Money accounts (firestore.rules: accountEntries; logic in src/core/account.ts). One collection of
// entries, each for one person (uid). Trip entries are written in the same batch that finishes the
// trip; the rules check them against the trip. Corrections are written by staff, with a reason.

type Fb = typeof import('./firebase')
type Batch = ReturnType<Fb['writeBatch']>

const ms = (x: unknown) => (x && typeof (x as { toMillis?: () => number }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : 0)

// Add a finished trip's entries to a batch (the batch that sets the trip to done).
export function addTripEntries(fb: Fb, batch: Batch, t: FinishedTrip, by: string) {
  for (const e of tripEntries(t)) {
    batch.set(fb.doc(fb.db, 'accountEntries', e.id), {
      uid: e.uid,
      passengerUid: t.passengerUid, // the trip's passenger: the rules read the trip from it
      side: e.side,
      amount: e.amount,
      method: 'cash',
      kind: e.kind,
      tripKey: e.tripKey,
      note: '',
      by: by.toLowerCase(),
      at: fb.serverTimestamp(),
    })
  }
}

// Staff: a correction on someone's account (signed amount, with a reason).
export async function addCorrection(fb: Fb, uid: string, amount: number, note: string, by: string) {
  if (!validCorrection(amount, note)) throw new Error('invalid')
  await fb.setDoc(fb.doc(fb.collection(fb.db, 'accountEntries')), {
    uid,
    side: 'correction',
    amount,
    method: 'cash',
    kind: null,
    tripKey: '',
    note: note.trim().slice(0, 120),
    by: by.toLowerCase(),
    at: fb.serverTimestamp(),
  })
}

// One person's entries, newest first.
export function useAccount(fb: Fb | null, uid: string | null, max = 200): AccountEntry[] {
  const [list, setList] = useState<AccountEntry[]>([])
  useEffect(() => {
    if (!fb || !uid) return
    return fb.onSnapshot(
      fb.query(fb.collection(fb.db, 'accountEntries'), fb.where('uid', '==', uid), fb.orderBy('at', 'desc'), fb.limit(max)),
      (s) =>
        setList(
          s.docs.flatMap((d) => {
            const x = d.data()
            const side = x.side === 'earned' || x.side === 'paid' || x.side === 'correction' ? x.side : null
            if (!side || typeof x.amount !== 'number') return []
            return [
              {
                id: d.id,
                uid: String(x.uid ?? ''),
                side,
                amount: x.amount,
                method: 'cash' as const,
                kind: x.kind === 'taxi' || x.kind === 'private' ? x.kind : null,
                tripKey: String(x.tripKey ?? ''),
                note: String(x.note ?? '').slice(0, 120),
                by: String(x.by ?? ''),
                at: ms(x.at),
              },
            ]
          }),
        ),
      () => setList([]),
    )
  }, [fb, uid, max])
  return fb && uid ? list : []
}
