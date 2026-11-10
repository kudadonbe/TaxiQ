import { useEffect, useState } from 'react'
import { validFares, type FareTable } from './core/taxiFare'
import { faresRef, MAIN } from './centers'

// Each center's taxi fare table: config/fares for the first center, fares/{center} for the others
// (firestore.rules). The center's admins set it; everyone signed in reads it to see a trip's total.
type Fb = typeof import('./firebase')

export function useFareTable(fb: Fb | null, enabled: boolean, center = MAIN): FareTable | null {
  const [f, setF] = useState<FareTable | null>(null)
  useEffect(() => {
    if (!fb || !enabled) return
    return fb.onSnapshot(
      faresRef(fb, center),
      (s) => {
        const x = s.data()
        const t = x ? { base: Number(x.base), perKm: Number(x.perKm), minimum: Number(x.minimum) } : null
        setF(t && validFares(t) ? t : null)
      },
      () => setF(null),
    )
  }, [fb, enabled, center])
  return fb && enabled ? f : null
}

export async function saveFares(fb: Fb, f: FareTable, email: string, center = MAIN) {
  if (!validFares(f)) throw new Error('invalid')
  await fb.setDoc(faresRef(fb, center), { base: f.base, perKm: f.perKm, minimum: f.minimum, updatedBy: email, updatedAt: fb.serverTimestamp() })
}
