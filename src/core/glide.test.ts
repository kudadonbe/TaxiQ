import { describe, expect, it } from 'vitest'
import { glideAt, glideState, MAX_GLIDE_MS, nextGlide, turnToward } from './glide'

const A: [number, number] = [4.17, 73.5]
const B: [number, number] = [4.171, 73.5] // ~111 m north

describe('vehicles glide between reports, like driving', () => {
  it('the first report puts it there, no glide', () => {
    const g = nextGlide(null, A, 0, null)
    expect(glideAt(g, 0)).toEqual(A)
  })
  it('glides at a steady speed from where it is shown to the new position', () => {
    const g0 = nextGlide(null, A, 0, null)
    const g = nextGlide(g0, B, 10_000, 0) // next report 10 s later
    expect(glideAt(g, 10_000)).toEqual(A)
    const mid = glideAt(g, 15_000)
    expect(mid[0]).toBeCloseTo((A[0] + B[0]) / 2, 9)
    expect(glideAt(g, 20_000)).toEqual(B)
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
    const half = glideState(g, 10_000 + g.dur * (111 / (111 + 107))) // about at the corner
    expect(half.at[0]).toBeCloseTo(4.171, 4)
    expect(half.at[1]).toBeCloseTo(73.5, 4)
    expect(glideState(g, 10_000 + g.dur * 0.25).heading).toBeCloseTo(0, 0) // going north first
    expect(glideState(g, 10_000 + g.dur * 0.9).heading).toBeCloseTo(90, 0) // then east
  })
  it('turns smoothly the shortest way round', () => {
    const h = turnToward(350, 10, 125) // halfway in 125 ms
    expect(h).toBeCloseTo(0, 6)
  })
})
