import { describe, expect, it } from 'vitest'
import { loadPlacesAround, loadPlacesForSearch, nearestPlace, nearestRoad, regionAt, searchPlaces, type Place } from './places'

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

describe('loading only the tiles needed', () => {
  const male: [number, number] = [4.1755, 73.509] // Malé, near the middle
  it('around a spot in Malé: the houses near it, not the whole area or Kulhudhuffushi', async () => {
    const list = await loadPlacesAround(male)
    expect(nearestPlace(list, male, 120)).not.toBeNull()
    expect(list.length).toBeGreaterThan(100)
    expect(list.length).toBeLessThan(14_106 / 2)
    expect(list.every((p) => p.p[0]![0] < 4.19)).toBe(true) // nothing from Hulhumalé or Kulhudhuffushi
  })
  it('the list kept from an earlier call fills in when more of the area loads', async () => {
    const list = await loadPlacesAround(male)
    const before = list.length
    await loadPlacesAround([4.214, 73.54]) // Hulhumalé
    expect(list.length).toBeGreaterThan(before)
  })
  it('search: the whole area, each road once', async () => {
    const all = await loadPlacesForSearch(male)
    expect(all).toHaveLength(14_106)
    expect(all.filter((p) => p.t === 'r')).toHaveLength(245)
    expect(searchPlaces(all, '20095').length).toBeGreaterThan(0) // by postcode
  })
  it('in Kulhudhuffushi (small) or outside any area with house data: all of Kulhudhuffushi', async () => {
    expect(regionAt([0.6, 73.1])).toBeUndefined()
    expect(await loadPlacesAround([0.6, 73.1])).toHaveLength(3914)
    expect(await loadPlacesAround([6.622, 73.07])).toHaveLength(3914)
    expect(regionAt([4.17, 73.51])?.id).toBe('male')
  })
})
