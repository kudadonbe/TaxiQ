import { describe, expect, it } from 'vitest'
import { move, reasonOk, shuffle, validReorder } from './reorder'

const order = ['a', 'b', 'c', 'd']

describe('manual queue changes', () => {
  it('moves a taxi up, down, to the front and to the back', () => {
    expect(move(order, 'c', 'up')).toEqual(['a', 'c', 'b', 'd'])
    expect(move(order, 'b', 'down')).toEqual(['a', 'c', 'b', 'd'])
    expect(move(order, 'd', 'front')).toEqual(['d', 'a', 'b', 'c'])
    expect(move(order, 'a', 'back')).toEqual(['b', 'c', 'd', 'a'])
  })
  it('stays put at the edges and ignores unknown taxis', () => {
    expect(move(order, 'a', 'up')).toEqual(order)
    expect(move(order, 'd', 'down')).toEqual(order)
    expect(move(order, 'zz', 'front')).toEqual(order)
  })
  it('only accepts an order with exactly the same taxis', () => {
    expect(validReorder(order, ['d', 'c', 'b', 'a'])).toEqual(['d', 'c', 'b', 'a'])
    expect(validReorder(order, ['a', 'b', 'c'])).toBeNull() // dropped one
    expect(validReorder(order, ['a', 'b', 'c', 'c'])).toBeNull() // duplicate
    expect(validReorder(order, ['a', 'b', 'c', 'x'])).toBeNull() // added one
  })
  it('shuffles fairly and keeps every taxi', () => {
    const s = shuffle(order, () => 0)
    expect([...s].sort()).toEqual([...order].sort())
    expect(s).not.toEqual(order)
    // Rough fairness: each taxi lands first about a quarter of the time.
    const firsts: Record<string, number> = {}
    for (let i = 0; i < 4000; i++) {
      const f = shuffle(order)[0]!
      firsts[f] = (firsts[f] ?? 0) + 1
    }
    for (const id of order) expect(firsts[id]!).toBeGreaterThan(800)
  })
  it('requires a reason, and a note for "other"', () => {
    expect(reasonOk('late', '')).toBe(true)
    expect(reasonOk('other', '')).toBe(false)
    expect(reasonOk('other', 'driver swap')).toBe(true)
    expect(reasonOk('nonsense', 'x')).toBe(false)
  })
})
