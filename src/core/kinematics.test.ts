import { describe, expect, it } from 'vitest'
import { axleCentre, axleHeading, followFront, placeAxles, traceAxles, WHEELBASE_M } from './kinematics'

const M = 111_320
const O: [number, number] = [4.17, 73.5]
const k = Math.cos((O[0] * Math.PI) / 180)
// A point `n` metres north and `e` metres east of O.
const at = (n: number, e: number): [number, number] => [O[0] + n / M, O[1] + e / (M * k)]
const north = (p: [number, number]) => (p[0] - O[0]) * M
const east = (p: [number, number]) => (p[1] - O[1]) * M * k

describe('real-car turning: the rear axle trails the front (bicycle model)', () => {
  it('stands one wheelbase long, facing its heading, drawn between the axles', () => {
    const ax = placeAxles(at(10, 0), 0, WHEELBASE_M.car)
    expect(north(ax.rear)).toBeCloseTo(10 - 2.6, 6)
    expect(axleHeading(ax)).toBeCloseTo(0, 6)
    expect(north(axleCentre(ax))).toBeCloseTo(10 - 1.3, 6)
  })
  it('does not change when stopped (never spins in place)', () => {
    const ax = placeAxles(at(0, 0), 45, WHEELBASE_M.car)
    expect(followFront(ax, ax.front, WHEELBASE_M.car)).toBe(ax)
  })
  it('on a straight road the rear stays right behind', () => {
    const { axles } = traceAxles([at(0, 0), at(50, 0)], 0, WHEELBASE_M.car)
    expect(axleHeading(axles)).toBeCloseTo(0, 3)
    expect(east(axles.rear)).toBeCloseTo(0, 3)
  })
  it('round a 90-degree corner the rear cuts inside, and the heading turns smoothly', () => {
    // North 30 m, then east 30 m: the corner is at (30, 0); the inside is south-east of it.
    const { axles, rears, headings } = traceAxles([at(0, 0), at(30, 0), at(30, 30)], 0, WHEELBASE_M.car)
    expect(rears.some((r) => north(r) < 29.5 && east(r) > 0.5)).toBe(true) // a tighter path than the front
    for (let i = 1; i < headings.length; i++) {
      const step = Math.abs(((headings[i]! - headings[i - 1]! + 540) % 360) - 180)
      expect(step).toBeLessThan(6) // no snap: a little each 10 cm
    }
    expect(axleHeading(axles)).toBeCloseTo(90, 0) // faces along the new road at the end
  })
  it('a longer vehicle (a bus) swings wider than a car', () => {
    const path = [at(0, 0), at(30, 0), at(30, 30)]
    const inside = (wb: number) => Math.max(...traceAxles(path, 0, wb).rears.map((r) => Math.min(30 - north(r), east(r))))
    expect(inside(WHEELBASE_M.bus)).toBeGreaterThan(inside(WHEELBASE_M.car))
  })
  it('a long frame traces the same curve as many short ones', () => {
    const ax = placeAxles(at(0, 0), 0, WHEELBASE_M.car)
    const one = followFront(ax, at(3, 3), WHEELBASE_M.car)
    let many = ax
    for (let s = 1; s <= 300; s++) many = followFront(many, at((3 * s) / 300, (3 * s) / 300), WHEELBASE_M.car)
    expect(Math.abs(axleHeading(one) - axleHeading(many))).toBeLessThan(0.5)
  })
})
