import { describe, expect, it } from 'vitest'
import { easeDrive, glideAt, glideState, MAX_GLIDE_MS, nextGlide, OVERRUN, roundCorners, turnToward } from './glide'

const A: [number, number] = [4.17, 73.5]
const B: [number, number] = [4.171, 73.5] // ~111 m north

describe('vehicles glide between reports, like driving', () => {
  it('the first report puts it there, no glide', () => {
    const g = nextGlide(null, A, 0, null)
    expect(glideAt(g, 0)).toEqual(A)
  })
  it('glides from where it is shown to the new position, running a little past the gap', () => {
    const g0 = nextGlide(null, A, 0, null)
    const g = nextGlide(g0, B, 10_000, 0) // next report 10 s later
    expect(g.dur).toBe(10_000 * OVERRUN)
    expect(glideAt(g, 10_000)).toEqual(A)
    expect(glideAt(g, 10_000 + g.dur)).toEqual(B)
    // Still rolling when the next report is due (no stop-start).
    expect(glideAt(g, 20_000)[0]).toBeLessThan(B[0])
  })
  it('steady speed, then a gentle stop at the very end', () => {
    expect(easeDrive(0)).toBe(0)
    expect(easeDrive(1)).toBeCloseTo(1, 9)
    const v1 = easeDrive(0.5) - easeDrive(0.4)
    const v2 = easeDrive(0.8) - easeDrive(0.7)
    expect(v1).toBeCloseTo(v2, 9) // steady
    expect(easeDrive(1) - easeDrive(0.99)).toBeLessThan(v1 / 5) // slowing to a stop
  })
  it('rounds corners into a short bend', () => {
    const r = roundCorners([[4.17, 73.5], [4.171, 73.5], [4.171, 73.501]])
    expect(r.length).toBeGreaterThan(3)
    expect(r[0]).toEqual([4.17, 73.5])
    expect(r[r.length - 1]).toEqual([4.171, 73.501])
    expect(r.some((p) => p[0] < 4.171 && p[1] > 73.5)).toBe(true) // cuts inside the corner
  })
  it('a report in the middle of a glide carries on from the shown position (no jump back)', () => {
    const g1 = nextGlide(nextGlide(null, A, 0, null), B, 10_000, 0)
    const shown = glideAt(g1, 15_000)
    const g2 = nextGlide(g1, [4.172, 73.5], 15_000, 10_000)
    expect(glideAt(g2, 15_000)).toEqual(shown)
  })
  it('faces the way it is going; GPS jitter keeps the heading', () => {
    const g1 = nextGlide(nextGlide(null, A, 0, null), B, 5_000, 0)
    expect(g1.heading).toBeCloseTo(0, 0) // north
    const g2 = nextGlide(g1, [B[0] + 0.00001, B[1]], 20_000, 5_000) // ~1 m: jitter
    expect(g2.heading).toBe(g1.heading)
  })
  it('never glides for too long after a long silence', () => {
    const g = nextGlide(nextGlide(null, A, 0, null), B, 120_000, 0)
    expect(g.dur).toBe(MAX_GLIDE_MS)
  })
  it('drives along the roads around a corner, not across the block', () => {
    const corner: [number, number] = [4.171, 73.5]
    const end: [number, number] = [4.171, 73.501] // north, then east
    const g = nextGlide(nextGlide(null, A, 0, null), end, 10_000, 0, null, [A, corner, end])
    expect(glideState(g, 10_000 + g.dur * 0.2).heading).toBeCloseTo(0, 0) // going north first
    expect(glideState(g, 10_000 + g.dur * 0.85).heading).toBeCloseTo(90, 0) // then east
    // Never far from the roads: every point is within a few metres of the north or east road.
    for (let k = 0; k <= 20; k++) {
      const p = glideState(g, 10_000 + (g.dur * k) / 20).at
      const offNorth = Math.abs(p[1] - 73.5) * 111_320
      const offEast = Math.abs(p[0] - 4.171) * 111_320
      expect(Math.min(offNorth, offEast)).toBeLessThan(3)
    }
  })
  it('turns smoothly the shortest way round', () => {
    const h = turnToward(350, 10, 125) // halfway in 125 ms
    expect(h).toBeCloseTo(0, 6)
  })
})
