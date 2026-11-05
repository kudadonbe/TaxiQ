import { describe, expect, it } from 'vitest'
import { bearing, glideAt, isStale, metres, startGlide, turn } from './motion'

const a = { lat: 6.62, lng: 73.07 }

describe('geometry', () => {
  it('measures distance in metres', () => {
    expect(metres(a, { lat: 6.621, lng: 73.07 })).toBeCloseTo(111.3, 0)
  })
  it('gives compass bearings', () => {
    expect(bearing(a, { lat: 6.63, lng: 73.07 })).toBeCloseTo(0, 5)
    expect(bearing(a, { lat: 6.62, lng: 73.08 })).toBeCloseTo(90, 5)
    expect(bearing(a, { lat: 6.61, lng: 73.07 })).toBeCloseTo(180, 5)
    expect(bearing(a, { lat: 6.62, lng: 73.06 })).toBeCloseTo(270, 5)
  })
  it('turns the shortest way round', () => {
    expect(turn(350, 10, 0.5)).toBeCloseTo(0, 5)
    expect(turn(10, 350, 0.5)).toBeCloseTo(0, 5)
    expect(turn(90, 270, 1)).toBeCloseTo(270, 5)
    expect(turn(0, 90, 2)).toBeCloseTo(90, 5) // clamped
  })
})

describe('gliding between GPS fixes', () => {
  it('the first fix is drawn straight away', () => {
    const { glide } = startGlide(null, { ...a, heading: 45, at: 0 }, 1000, 3000)
    expect(glideAt(glide, 1000)).toMatchObject({ lat: a.lat, lng: a.lng, heading: 45 })
  })
  it('glides from where the car is drawn to the new fix and stops there', () => {
    const drawn = { ...a, heading: 0 }
    const to = { lat: 6.621, lng: 73.07, heading: null, at: 0 }
    const { glide } = startGlide(drawn, to, 0, 3000)
    const mid = glideAt(glide, 1500)
    expect(mid.lat).toBeGreaterThan(a.lat)
    expect(mid.lat).toBeLessThan(to.lat)
    expect(glideAt(glide, 3000).lat).toBeCloseTo(to.lat, 9)
    expect(glideAt(glide, 9000).lat).toBeCloseTo(to.lat, 9) // never overshoots
  })
  it('faces the direction of travel when the phone gives no heading', () => {
    const { heading } = startGlide({ ...a, heading: 0 }, { lat: 6.62, lng: 73.071, heading: null, at: 0 }, 0, 3000)
    expect(heading).toBeCloseTo(90, 0)
  })
  it('uses the phone heading when given', () => {
    expect(startGlide({ ...a, heading: 0 }, { lat: 6.621, lng: 73.07, heading: 200, at: 0 }, 0, 3000).heading).toBe(200)
  })
  it('does not spin a parked car on GPS jitter', () => {
    const { heading } = startGlide({ ...a, heading: 123 }, { lat: a.lat + 0.00001, lng: a.lng - 0.00001, heading: null, at: 0 }, 0, 3000)
    expect(heading).toBe(123)
  })
})

describe('staleness', () => {
  it('flags fixes older than the limit', () => {
    expect(isStale(0, 119_000, 120_000)).toBe(false)
    expect(isStale(0, 121_000, 120_000)).toBe(true)
  })
})
