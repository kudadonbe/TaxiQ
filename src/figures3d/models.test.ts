import { describe, expect, it } from 'vitest'
import { VEHICLE_SHAPES } from '../core/vehicleModels'
import { PERSON_LOOKS, LOOK_COLOUR_COUNT } from '../core/presence'
import { WORK_LOOKS } from '../core/figures'
import { armGeometry, lampSpots, legGeometry, personParts, TEMPLATES, triangles, vehicleGeometry } from './models'

describe('3D models stay low-poly', () => {
  it('every vehicle shape, with each rider, is under 800 triangles', () => {
    for (const s of VEHICLE_SHAPES) {
      for (const r of ['none', 'man', 'woman', 'young'] as const) {
        const g = vehicleGeometry(s, '#dc2626', false, r)
        const n = triangles(g)
        expect(n, `${s} ${r}`).toBeGreaterThan(20)
        expect(n, `${s} ${r}`).toBeLessThan(800)
      }
    }
    expect(triangles(vehicleGeometry('sedan', '#fde047', true))).toBeLessThan(800)
  })
  it('every person look is under 400 triangles with both legs and arms', () => {
    const limbs = 2 * triangles(legGeometry()) + 2 * triangles(armGeometry())
    for (const l of [...PERSON_LOOKS, ...WORK_LOOKS]) {
      for (let c = 0; c < LOOK_COLOUR_COUNT; c++) {
        const p = personParts(l, c)
        expect(triangles(p.body) + limbs, `${l} ${c}`).toBeLessThan(400)
        expect(p.legs).toMatch(/^#[0-9a-f]{6}$/i)
        expect(p.arms).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })
  it('models stand on the ground and fit their template', () => {
    for (const s of VEHICLE_SHAPES) {
      const g = vehicleGeometry(s, '#2563eb')
      g.computeBoundingBox()
      const b = g.boundingBox!
      const t = TEMPLATES[s]
      expect(b.min.z, s).toBeGreaterThanOrEqual(-0.01)
      expect(b.max.y - b.min.y, s).toBeLessThanOrEqual(t.length + 0.2)
      expect(b.max.z, s).toBeLessThanOrEqual(t.height + 0.3)
    }
  })
  it('lamps: two at each end of a car, one of each on a bike', () => {
    expect(lampSpots('sedan').rear).toHaveLength(2)
    expect(lampSpots('sedan').front).toHaveLength(2)
    expect(lampSpots('scooter').rear).toHaveLength(1)
  })
})
