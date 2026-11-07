import { describe, expect, it } from 'vitest'
import { zoneFare, zoneOf } from './zoneFares'

const MALE: [number, number] = [4.1755, 73.5093] // Majeedhee Magu
const AIRPORT: [number, number] = [4.1918, 73.5291] // Velana terminal
const HM1: [number, number] = [4.2125, 73.5435] // Phase 1 lot 10xxx
const HM2: [number, number] = [4.2320, 73.5450] // Phase 2 lot 2xxxx
const KULHU: [number, number] = [6.62, 73.07]

describe('Greater Malé official taxi fares', () => {
  it('knows the zones', () => {
    expect(zoneOf(MALE)).toBe('male')
    expect(zoneOf(AIRPORT)).toBe('airport')
    expect(zoneOf(HM1)).toBe('hulhumale1')
    expect(zoneOf(HM2)).toBe('hulhumale2')
    expect(zoneOf(KULHU)).toBeNull()
  })
  it('the published fares, either way', () => {
    expect(zoneFare(MALE, [4.172, 73.515])).toBe(30)
    expect(zoneFare(MALE, HM1)).toBe(85)
    expect(zoneFare(HM1, MALE)).toBe(85)
    expect(zoneFare(MALE, HM2)).toBe(100)
    expect(zoneFare(HM1, HM2)).toBe(40)
    expect(zoneFare(AIRPORT, MALE)).toBe(70)
    expect(zoneFare(AIRPORT, HM1)).toBe(80)
    expect(zoneFare(AIRPORT, HM2)).toBe(85)
  })
  it('7-10 seat vehicles', () => {
    expect(zoneFare(MALE, HM2, 'large')).toBe(155)
    expect(zoneFare(AIRPORT, MALE, 'large')).toBe(110)
  })
  it('outside the zones: the center decides', () => {
    expect(zoneFare(KULHU, [6.63, 73.07])).toBeNull()
    expect(zoneFare(MALE, KULHU)).toBeNull()
  })
})
