import { describe, expect, it } from 'vitest'
import { metres } from './core/route'
import { __sim, ROAD_GRAPH } from './positions'

describe('demo taxis drive like real cars (Kulhudhuffushi roads)', () => {
  it('stay within the limit, never jump, and slow down for corners', () => {
    let checked = 0
    for (const id of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      const s = __sim.create(ROAD_GRAPH, id)
      if (s.parked) continue
      checked++
      let last = __sim.step(s, 0.016)
      let maxV = 0
      let minV = Infinity
      for (let f = 0; f < 60 * 120; f++) {
        // two minutes at 60 frames a second
        const p = __sim.step(s, 1 / 60)
        const moved = metres([last.lat, last.lng], [p.lat, p.lng])
        expect(moved).toBeLessThan(1.5) // ~30 km/h is 0.14 m a frame: no jumps, even at corners
        maxV = Math.max(maxV, s.v)
        if (f > 600) minV = Math.min(minV, s.v)
        last = p
      }
      expect(maxV * 3.6).toBeLessThanOrEqual(30.01) // island limit
      expect(minV * 3.6).toBeLessThan(20) // it slowed for at least one corner
    }
    expect(checked).toBeGreaterThan(3)
  })
})

describe('traffic: a safe distance, never through each other', () => {
  // A long straight one-way road (no overtaking), 300 m.
  const g = { nodes: [[4.17, 73.5], [4.17 + 300 / 111_320, 73.5], [4.17 + 600 / 111_320, 73.5]] as [number, number][], next: [[1], [2], []] }
  it('a faster taxi behind a slow one keeps its gap', () => {
    const lead = __sim.create(g, 'lead')
    const back = __sim.create(g, 'back')
    for (const [s, along, v] of [[lead, 60, 2], [back, 20, 8]] as const) {
      s.parked = false
      s.prev = 0
      s.from = 0
      s.to = 1
      s.after = 2
      s.length = 300
      s.along = along
      s.v = v
    }
    let minGap = Infinity
    for (let f = 0; f < 60 * 20; f++) {
      __sim.traffic([lead, back], f * 16, 1 / 60)
      lead.cap = Math.min(lead.cap, 2) // the slow one stays slow
      __sim.step(lead, 1 / 60)
      __sim.step(back, 1 / 60)
      if (lead.from === back.from) minGap = Math.min(minGap, lead.along - back.along)
    }
    expect(minGap).toBeGreaterThan(4.5 + 3) // a car length plus a gap: never through it
    expect(back.v).toBeLessThan(3) // it slowed to the leader's pace
  })
})

