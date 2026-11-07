import { useEffect, useState } from 'react'
import { validFares, type FareTable } from './core/taxiFare'

// The center's taxi fare table: config/fares (firestore.rules). Admins set it; everyone signed in
// reads it to see a trip's total before sending it.
type Fb = typeof import('./firebase')

export function useFareTable(fb: Fb | null, enabled: boolean): FareTable | null {
  const [f, setF] = useState<FareTable | null>(null)
  useEffect(() => {
    if (!fb || !enabled) return
    return fb.onSnapshot(
      fb.doc(fb.db, 'config', 'fares'),
      (s) => {
        const x = s.data()
        const t = x ? { base: Number(x.base), perKm: Number(x.perKm), minimum: Number(x.minimum) } : null
        setF(t && validFares(t) ? t : null)
      },
      () => setF(null),
    )
  }, [fb, enabled])
  return fb && enabled ? f : null
}

export async function saveFares(fb: Fb, f: FareTable, email: string) {
  if (!validFares(f)) throw new Error('invalid')
  await fb.setDoc(fb.doc(fb.db, 'config', 'fares'), { base: f.base, perKm: f.perKm, minimum: f.minimum, updatedBy: email, updatedAt: fb.serverTimestamp() })
}
