import { describe, expect, it } from 'vitest'
import { canAccept, moveOffer, nextTaxi, OFFER_SECONDS, offerTimedOut, startOffer, type OfferState } from './offers'

const order = ['a', 'b', 'c', 'd']
const none = new Set<string>()

describe('nextTaxi', () => {
  it('takes the first in queue order', () => {
    expect(nextTaxi(order, [], none)).toBe('a')
  })
  it('skips taxis already asked and suspended ones', () => {
    expect(nextTaxi(order, ['a'], new Set(['b']))).toBe('c')
  })
  it('returns null when everyone has been asked', () => {
    expect(nextTaxi(order, order, none)).toBeNull()
  })
})

describe('startOffer', () => {
  it('a queue request goes to the first free taxi', () => {
    expect(startOffer('queue', order, new Set(['a']))).toMatchObject({ status: 'offering', offerTo: 'b', skipped: [] })
  })
  it('a direct request goes to the chosen taxi', () => {
    expect(startOffer('direct', order, none, 'c')).toMatchObject({ status: 'offering', offerTo: 'c' })
  })
  it('expires straight away with nobody to ask', () => {
    expect(startOffer('queue', [], none).status).toBe('expired')
    expect(startOffer('direct', order, new Set(['c']), 'c').status).toBe('expired')
  })
})

describe('moving an offer on', () => {
  const offer = (o: Partial<OfferState>): OfferState => ({
    mode: 'queue',
    status: 'offering',
    offerTo: 'a',
    offerAt: 0,
    skipped: [],
    acceptedBy: null,
    ...o,
  })

  it('goes down the queue one taxi at a time', () => {
    const m1 = moveOffer(offer({}), order, none)!
    expect(m1).toEqual({ skipped: ['a'], offerTo: 'b', status: 'offering' })
    const m2 = moveOffer(offer({ ...m1 }), order, none)!
    expect(m2).toEqual({ skipped: ['a', 'b'], offerTo: 'c', status: 'offering' })
  })
  it('expires after the last taxi', () => {
    expect(moveOffer(offer({ offerTo: 'd', skipped: ['a', 'b', 'c'] }), order, none)).toEqual({ skipped: ['a', 'b', 'c', 'd'], offerTo: null, status: 'expired' })
  })
  it('a direct request expires instead of moving to another taxi', () => {
    expect(moveOffer(offer({ mode: 'direct', offerTo: 'c' }), order, none)!.status).toBe('expired')
  })
  it('does nothing unless the request is being offered', () => {
    expect(moveOffer(offer({ status: 'accepted' }), order, none)).toBeNull()
    expect(moveOffer(offer({ offerTo: null }), order, none)).toBeNull()
  })
})

describe('timeouts and accepting', () => {
  it('times out after OFFER_SECONDS (plus any grace)', () => {
    const o = { status: 'offering' as const, offerAt: 1_000 }
    expect(offerTimedOut(o, 1_000 + OFFER_SECONDS * 1000 - 1)).toBe(false)
    expect(offerTimedOut(o, 1_000 + OFFER_SECONDS * 1000)).toBe(true)
    expect(offerTimedOut(o, 1_000 + OFFER_SECONDS * 1000, 1000)).toBe(false)
    expect(offerTimedOut({ status: 'accepted', offerAt: 0 }, 10 ** 9)).toBe(false)
  })
  it('only the offered, unsuspended taxi can accept', () => {
    const o = { status: 'offering' as const, offerTo: 'b' }
    expect(canAccept(o, 'b', none)).toBe(true)
    expect(canAccept(o, 'a', none)).toBe(false)
    expect(canAccept(o, 'b', new Set(['b']))).toBe(false)
    expect(canAccept({ status: 'expired', offerTo: 'b' }, 'b', none)).toBe(false)
  })
})
