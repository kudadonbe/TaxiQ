import { describe, expect, it } from 'vitest'
import { filterReading, newTracker } from './gpsFilter'
import { forward, makeLine, nextStop, pointAt, project, stretch } from './routeLine'

const MAX = 40 / 3.6 // 40 km/h
const at = (dNorthM: number): [number, number] => [4.17 + dNorthM / 111_320, 73.5]

describe('GPS: stay calm about odd readings', () => {
  it('ignores a parked wobble', () => {
    const tr = newTracker()
    filterReading(tr, { at: at(0), t: 0 }, MAX)
    expect(filterReading(tr, { at: at(5), t: 5000 }, MAX)).toBe('still')
  })
  it('accepts normal driving', () => {
    const tr = newTracker()
    filterReading(tr, { at: at(0), t: 0 }, MAX)
    expect(filterReading(tr, { at: at(80), t: 10_000 }, MAX)).toBe('move') // 8 m/s
  })
  it('holds an impossible jump until the next readings confirm it', () => {
    const tr = newTracker()
    filterReading(tr, { at: at(0), t: 0 }, MAX)
    expect(filterReading(tr, { at: at(600), t: 5_000 }, MAX)).toBe('hold') // 120 m/s: a glitch
    expect(filterReading(tr, { at: at(0), t: 10_000 }, MAX)).toBe('still') // it was a glitch
    // A real move far away: confirmed when readings agree.
    expect(filterReading(tr, { at: at(900), t: 15_000 }, MAX)).toBe('hold')
    expect(filterReading(tr, { at: at(960), t: 20_000 }, MAX)).toBe('move')
  })
  it('holds a step backwards', () => {
    const tr = newTracker()
    filterReading(tr, { at: at(0), t: 0 }, MAX)
    filterReading(tr, { at: at(80), t: 10_000 }, MAX) // going north
    expect(filterReading(tr, { at: at(60), t: 12_000 }, MAX)).toBe('hold') // 20 m back south
  })
})

describe('a bus on its own route', () => {
  const pts: [number, number][] = [at(0), at(100), at(200), at(300)]
  const line = makeLine(pts, [at(100), at(250)])
  it('knows how far along a position is, and the next stop', () => {
    expect(project(line, [4.17 + 150 / 111_320, 73.50001]).s).toBeCloseTo(150, 0)
    expect(nextStop(line, 120)).toBeCloseTo(250, 0)
    expect(pointAt(line, 200)[0]).toBeCloseTo(at(200)[0], 9)
  })
  it('moves forward along the route between two points', () => {
    const s = stretch(line, 50, 250)
    expect(s[0]![0]).toBeCloseTo(at(50)[0], 9)
    expect(s[s.length - 1]![0]).toBeCloseTo(at(250)[0], 9)
    expect(s.length).toBe(4) // start, the corners at 100 and 200, end
  })
  it('wraps round a circular route instead of going back', () => {
    const loop = makeLine([at(0), at(100), [4.17 + 100 / 111_320, 73.501], [4.17, 73.501], at(0)])
    expect(loop.loop).toBe(true)
    expect(forward(loop, loop.length - 20, 10)).toBeCloseTo(30, 6)
  })
})
