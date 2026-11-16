import { useEffect, useState } from 'react'

// Off duty: a center driver using the app as a citizen. duty/{taxiId} = { offDuty, by, at }; the
// taxi keeps its place in the queue but gets no offers (readOrderAndSuspended skips it, and the
// rules' freeTaxi() refuses an offer or accept). Only the taxi's driver or its center's staff write
// it. No personal data: a flag, who set it and when.

type Fb = typeof import('./firebase')

export async function setOffDuty(fb: Fb, taxiId: string, email: string, offDuty: boolean) {
  await fb.setDoc(fb.doc(fb.db, 'duty', taxiId), { offDuty, by: email, at: fb.serverTimestamp() })
}

// Whether this taxi is off duty now (false until known, or with no duty record).
export function useOffDuty(fb: Fb | null, taxiId: string | null): boolean {
  const [state, setState] = useState<{ id: string; off: boolean } | null>(null)
  useEffect(() => {
    if (!fb || !taxiId) return
    return fb.onSnapshot(
      fb.doc(fb.db, 'duty', taxiId),
      (snap) => setState({ id: taxiId, off: snap.data()?.offDuty === true }),
      () => setState({ id: taxiId, off: false }),
    )
  }, [fb, taxiId])
  return !!fb && !!taxiId && state?.id === taxiId && state.off
}
