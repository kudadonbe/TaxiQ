import { describe, expect, it } from 'vitest'
import {
  assign,
  byId,
  canUndo,
  clearCall,
  driverToBack,
  normalizeOrder,
  onSuspend,
  placeAt,
  removeTaxi,
  reopen,
  suggestion,
  toggleInterest,
  undo,
  type QueueState,
  type QueueTaxi,
} from './queue'

const taxis: QueueTaxi[] = [
  { id: 'a', taxiNo: '34', suspended: false },
  { id: 'b', taxiNo: '2', suspended: false },
  { id: 'c', taxiNo: '17', suspended: false },
  { id: 'd', taxiNo: '8', suspended: false },
  { id: 'x', taxiNo: '41', suspended: true },
]
const map = byId(taxis)
const start: QueueState = { order: ['a', 'b', 'c', 'd', 'x'], interested: [] }

describe('placeAt', () => {
  it('moves an item, keeping the others in order', () => {
    expect(placeAt(['a', 'b', 'c', 'd'], 'd', 1)).toEqual(['a', 'd', 'b', 'c'])
  })
  it('clamps the index', () => {
    expect(placeAt(['a', 'b', 'c'], 'a', 99)).toEqual(['b', 'c', 'a'])
    expect(placeAt(['a', 'b', 'c'], 'c', -5)).toEqual(['c', 'a', 'b'])
  })
  it('leaves the list alone for an unknown id', () => {
    expect(placeAt(['a', 'b'], 'z', 0)).toEqual(['a', 'b'])
  })
  it('works with objects', () => {
    expect(placeAt([{ id: 'a' }, { id: 'b' }], 'b', 0).map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('normalizeOrder', () => {
  it('drops unknown and duplicate ids', () => {
    expect(normalizeOrder(['a', 'zz', 'a', 'b', 'c', 'd', 'x'], taxis)).toEqual(['a', 'b', 'c', 'd', 'x'])
  })
  it('appends taxis missing from the order, lowest center number first', () => {
    expect(normalizeOrder(['c'], taxis)).toEqual(['c', 'b', 'd', 'a', 'x'])
  })
  it('treats bad stored data as empty', () => {
    expect(normalizeOrder('nope', taxis)).toEqual(['b', 'd', 'c', 'a', 'x'])
  })
})

describe('answering a call', () => {
  it('toggles a driver in and out', () => {
    const s1 = toggleInterest(start, 'b', map)!
    expect(s1.interested).toEqual(['b'])
    expect(toggleInterest(s1, 'b', map)!.interested).toEqual([])
  })
  it('refuses suspended and unknown taxis', () => {
    expect(toggleInterest(start, 'x', map)).toBeNull()
    expect(toggleInterest(start, 'zz', map)).toBeNull()
  })
  it('suggests the answered driver highest in the queue, not the first to answer', () => {
    expect(suggestion({ order: start.order, interested: ['d', 'b'] })).toBe('b')
    expect(suggestion(start)).toBeNull()
  })
  it('clears the call', () => {
    expect(clearCall({ order: start.order, interested: ['b', 'd'] }).interested).toEqual([])
  })
})

describe('assign', () => {
  const called: QueueState = { order: start.order, interested: ['b', 'd'] }

  it('sends the taxi to the back and finishes the call', () => {
    const r = assign(called, 'b', map)!
    expect(r.state.order).toEqual(['a', 'c', 'd', 'x', 'b'])
    expect(r.state.interested).toEqual([])
    expect(r.dispatch).toEqual({ taxiId: 'b', from: 1, interested: ['b', 'd'] })
  })
  it('lets the operator pick any answered driver, not only the suggestion', () => {
    expect(assign(called, 'd', map)!.state.order).toEqual(['a', 'b', 'c', 'x', 'd'])
  })
  it('refuses drivers who did not answer, suspended or unknown taxis', () => {
    expect(assign(called, 'a', map)).toBeNull()
    expect(assign({ ...called, interested: ['x'] }, 'x', map)).toBeNull()
    expect(assign(called, 'zz', map)).toBeNull()
  })
})

describe('undo', () => {
  const r = assign({ order: start.order, interested: ['b', 'd'] }, 'b', map)!

  it('exactly restores the queue and the answered drivers', () => {
    expect(undo(r.state, r.dispatch, map)).toEqual({ order: start.order, interested: ['b', 'd'] })
  })
  it('is only allowed while the taxi is still last', () => {
    expect(canUndo(r.state, r.dispatch)).toBe(true)
    const moved = { order: placeAt(r.state.order, 'b', 0), interested: [] }
    expect(canUndo(moved, r.dispatch)).toBe(false)
    expect(undo(moved, r.dispatch, map)).toBeNull()
  })
  it('does not re-mark a driver suspended since', () => {
    const later = byId(taxis.map((t) => (t.id === 'd' ? { ...t, suspended: true } : t)))
    expect(undo(r.state, r.dispatch, later)!.interested).toEqual(['b'])
  })
})

describe('reopen', () => {
  const r = assign({ order: start.order, interested: ['b', 'd'] }, 'b', map)!

  it('puts the driver back in their old place and slides the others out again', () => {
    expect(reopen(r.state, r.dispatch, map)).toEqual({ order: start.order, interested: ['d'] })
  })
  it('works after later dispatches, at the same position number', () => {
    const second = assign({ order: r.state.order, interested: ['a'] }, 'a', map)!
    expect(reopen(second.state, r.dispatch, map)!.order).toEqual(['c', 'b', 'd', 'x', 'a'])
  })
  it('refuses a taxi that has been removed', () => {
    expect(reopen(removeTaxi(r.state, 'b'), r.dispatch, map)).toBeNull()
  })
})

describe('admin changes', () => {
  it('suspending keeps the place and stops answering', () => {
    const s = onSuspend({ order: start.order, interested: ['b', 'c'] }, 'b')
    expect(s.order).toEqual(start.order)
    expect(s.interested).toEqual(['c'])
  })
  it('removing drops the taxi from order and answers', () => {
    expect(removeTaxi({ order: start.order, interested: ['b'] }, 'b')).toEqual({ order: ['a', 'c', 'd', 'x'], interested: [] })
  })
})

describe('driverToBack (accepting a passenger request)', () => {
  it('matches the rules: order.removeAll([id]).concat([id]), interested.removeAll([id])', () => {
    const s = driverToBack({ order: start.order, interested: ['c', 'b'] }, 'c')
    expect(s.order).toEqual(['a', 'b', 'd', 'x', 'c'])
    expect(s.interested).toEqual(['b'])
  })
  it('adds a taxi missing from the order at the back', () => {
    expect(driverToBack({ order: ['a'], interested: [] }, 'b').order).toEqual(['a', 'b'])
  })
})
