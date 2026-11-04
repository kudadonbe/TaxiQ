// TaxiQ core engine: ride offers. A passenger's request is offered to one taxi at a time, in queue
// order, for OFFER_SECONDS each. Pure functions; the Firestore rules (and later the API server)
// enforce the same rules on the server.

export const OFFER_SECONDS = 20

export type OfferMode = 'queue' | 'direct'
export type OfferStatus = 'offering' | 'accepted' | 'expired' | 'cancelled'

export interface OfferState {
  mode: OfferMode
  status: OfferStatus
  offerTo: string | null
  offerAt: number // ms
  skipped: readonly string[]
  acceptedBy: string | null
}

// Next taxi to offer to: the first in queue order not yet offered and not suspended.
export function nextTaxi(order: readonly string[], skipped: readonly string[], suspended: ReadonlySet<string>): string | null {
  return order.find((id) => !skipped.includes(id) && !suspended.has(id)) ?? null
}

// A new request: a direct request goes to the chosen taxi; a queue request to the first free one.
// With nobody to offer to, it starts out expired.
export function startOffer(
  mode: OfferMode,
  order: readonly string[],
  suspended: ReadonlySet<string>,
  chosen?: string,
): Pick<OfferState, 'mode' | 'status' | 'offerTo' | 'skipped' | 'acceptedBy'> {
  const offerTo = mode === 'direct' ? (chosen && !suspended.has(chosen) ? chosen : null) : nextTaxi(order, [], suspended)
  return { mode, status: offerTo ? 'offering' : 'expired', offerTo, skipped: [], acceptedBy: null }
}

export function offerTimedOut(offer: Pick<OfferState, 'status' | 'offerAt'>, now: number, graceMs = 0): boolean {
  return offer.status === 'offering' && now >= offer.offerAt + OFFER_SECONDS * 1000 + graceMs
}

// Move the offer on (declined or timed out). A direct request expires; a queue request goes to the
// next taxi in order, or expires when everyone has been asked.
export function moveOffer(offer: OfferState, order: readonly string[], suspended: ReadonlySet<string>): Pick<OfferState, 'status' | 'offerTo' | 'skipped'> | null {
  if (offer.status !== 'offering' || !offer.offerTo) return null
  const skipped = [...offer.skipped, offer.offerTo]
  const next = offer.mode === 'queue' ? nextTaxi(order, skipped, suspended) : null
  return { skipped, offerTo: next, status: next ? 'offering' : 'expired' }
}

// Only the taxi the offer is with can accept, and only while it is being offered.
export function canAccept(offer: Pick<OfferState, 'status' | 'offerTo'>, taxiId: string, suspended: ReadonlySet<string>): boolean {
  return offer.status === 'offering' && offer.offerTo === taxiId && !suspended.has(taxiId)
}
