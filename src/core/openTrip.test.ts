import { describe, expect, it } from 'vitest'
import { firstName, privateQueue, secondsLeft, timedOut } from './openTrip'

describe('open trips', () => {
  it('the private queue: first available first, never your own or ones that passed', () => {
    const v = [
      { id: 'b', ownerUid: 'u2', since: 300 },
      { id: 'a', ownerUid: 'u1', since: 100 },
      { id: 'c', ownerUid: 'me', since: 50 },
      { id: 'd', ownerUid: 'u3', since: 200 },
    ]
    expect(privateQueue(v, 'me').map((x) => x.id)).toEqual(['a', 'd', 'b'])
    expect(privateQueue(v, 'me', ['a']).map((x) => x.id)).toEqual(['d', 'b'])
  })
  it('each step waits its time: driver 20 s, passenger 60 s', () => {
    expect(secondsLeft('offering', 0, 5_000)).toBe(15)
    expect(secondsLeft('interest', 0, 5_000)).toBe(55)
    expect(timedOut('offering', 1000, 21_500)).toBe(false)
    expect(timedOut('offering', 1000, 22_500)).toBe(true)
  })
  it('the driver hears the first name only', () => {
    expect(firstName('  Aisha Mohamed ')).toBe('Aisha')
  })
})
