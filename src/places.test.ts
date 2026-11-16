import { describe, expect, it } from 'vitest'
import { nearestPlace, nearestRoad, type Place } from './places'

const house = (e: string, at: [number, number]): Place => ({ t: 'h', e, d: '', k: e.toLowerCase(), p: [at] })
const road = (e: string, pts: [number, number][]): Place => ({ t: 'r', e, d: '', k: e.toLowerCase(), p: pts })
const north = (m: number): number => 4.17 + m / 111_320

describe('naming a pinned spot', () => {
  const places = [house('Rose Villa', [north(0), 73.51]), road('Majeedhee Magu', [[north(300), 73.505], [north(300), 73.515]])]
  it('the nearest house within 80 m', () => {
    expect(nearestPlace(places, [north(40), 73.51])?.e).toBe('Rose Villa')
    expect(nearestPlace(places, [north(200), 73.51])).toBeNull()
  })
  it('else the nearest road, by distance to its line (not only its end points)', () => {
    // 20 m from the middle of the road, about 550 m from either end point.
    expect(nearestRoad(places, [north(280), 73.51])?.e).toBe('Majeedhee Magu')
    expect(nearestRoad(places, [north(150), 73.51])).toBeNull()
  })
})
