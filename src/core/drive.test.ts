import { describe, expect, it } from 'vitest'
import { brakingSpeed, cornerSpeed, cruiseSpeed, HANDLING, indicator, leanDegrees, nextSpeed, roadLimitKmh, turnAngle } from './drive'

const KMH = 3.6
const KULHU: [number, number] = [6.62, 73.07]
const MALE: [number, number] = [4.175, 73.51]
const HULHUMALE: [number, number] = [4.21, 73.54]

describe('speed limits by place and road', () => {
  it('island roads 30, main roads 40, lanes and parking 10', () => {
    expect(roadLimitKmh('residential', KULHU)).toBe(30)
    expect(roadLimitKmh('primary', HULHUMALE)).toBe(40)
    expect(roadLimitKmh('service', KULHU)).toBe(10)
    expect(roadLimitKmh(undefined, KULHU)).toBe(30)
  })
  it('Malé streets at most 25', () => {
    expect(roadLimitKmh('primary', MALE)).toBe(25)
    expect(roadLimitKmh('residential', MALE)).toBe(25)
  })
})

describe('acceleration by type', () => {
  it('a car reaches 30 km/h in about 5 s; a bus in about 9 s; a motorbike quicker', () => {
    const time = (type: 'car' | 'bus' | 'motorbike') => {
      let v = 0
      let t = 0
      while (v < 30 / KMH - 1e-6 && t < 30) {
        v = nextSpeed(v, 30 / KMH, type, 0.05)
        t += 0.05
      }
      return t
    }
    expect(time('car')).toBeCloseTo(5, 0)
    expect(time('bus')).toBeCloseTo(9, 0)
    expect(time('motorbike')).toBeLessThan(4)
  })
  it('buses and e-bikes are capped; drivers vary a little', () => {
    expect(cruiseSpeed('bus', 40, 1) * KMH).toBeLessThanOrEqual(34)
    expect(cruiseSpeed('ebike', 40, 1) * KMH).toBeLessThanOrEqual(25)
    expect(cruiseSpeed('car', 30, 0) * KMH).toBeCloseTo(25.5, 1)
  })
})

describe('turning', () => {
  it('slows for corners: 90° at about 12 km/h for a car, gentle bends at cruise', () => {
    expect(cornerSpeed('car', 90, 30 / KMH) * KMH).toBeCloseTo(12, 0)
    expect(cornerSpeed('car', 10, 30 / KMH) * KMH).toBeCloseTo(30, 6)
    expect(cornerSpeed('car', 45, 30 / KMH)).toBeGreaterThan(cornerSpeed('car', 90, 30 / KMH))
    expect(cornerSpeed('car', 180, 30 / KMH) * KMH).toBeCloseTo(5, 6)
  })
  it('starts braking in time', () => {
    // From 30 km/h, slowing to 12 km/h with 2.5 m/s²: about 11.6 m before the corner.
    expect(brakingSpeed(12 / KMH, 11.6, HANDLING.car.brake) * KMH).toBeCloseTo(30, 0)
  })
  it('big vehicles take wider corners; bikes tighter and they lean', () => {
    expect(HANDLING.bus.cornerM).toBeGreaterThan(HANDLING.car.cornerM)
    expect(HANDLING.motorbike.cornerM).toBeLessThan(HANDLING.car.cornerM)
    expect(HANDLING.motorbike.leans).toBe(true)
    expect(Math.abs(leanDegrees(90, 8))).toBeLessThanOrEqual(15)
  })
  it('indicates on the turning side, about 3 s before the turn', () => {
    expect(turnAngle(0, 90)).toBe(90) // north, then east: a right turn
    expect(indicator(90, 20, 8)).toBe('right')
    expect(indicator(-90, 20, 8)).toBe('left')
    expect(indicator(90, 100, 8)).toBeNull() // too far yet
    expect(indicator(10, 5, 8)).toBeNull() // barely a bend
  })
})
