import { describe, expect, it } from 'vitest'
import { FigureRegistry, legSwing, mercator, pickFigures, riderForLook, workLookFor, type Figure } from './figures'

const fig = (o: Partial<Figure> = {}): Figure => ({
  id: 'v:1',
  cat: 'private',
  model: { kind: 'vehicle', shape: 'sedan' },
  colour: '#dc2626',
  at: [4.175, 73.509],
  heading: 90,
  length: 4.5,
  width: 1.75,
  moving: false,
  speed: 0,
  braking: false,
  signal: null,
  lean: 0,
  faded: false,
  ...o,
})

describe('the figures registry', () => {
  it('changes its version only when something drawn changes', () => {
    const r = new FigureRegistry()
    r.set(fig())
    const v = r.version
    r.set(fig()) // the same, every frame while standing still
    expect(r.version).toBe(v)
    r.set(fig({ at: [4.17501, 73.509] }))
    expect(r.version).toBe(v + 1)
    r.set(fig({ at: [4.17501, 73.509], braking: true }))
    expect(r.version).toBe(v + 2)
    r.set(fig({ at: [4.17501, 73.509], braking: true, model: { kind: 'vehicle', shape: 'suv' } }))
    expect(r.version).toBe(v + 3)
  })
  it('removes entries and prunes by prefix', () => {
    const r = new FigureRegistry()
    r.set(fig({ id: 'p:a', cat: 'person' }))
    r.set(fig({ id: 'p:b', cat: 'person' }))
    r.set(fig({ id: 'v:c' }))
    r.prune('p:', new Set(['p:a']))
    expect([...r.items.keys()].sort()).toEqual(['p:a', 'v:c'])
    const v = r.version
    r.delete('nothing')
    expect(r.version).toBe(v)
    r.delete('v:c')
    expect(r.items.has('v:c')).toBe(false)
  })
})

describe('picking what to draw', () => {
  const box: [number, number, number, number] = [4.17, 73.5, 4.18, 73.52]
  it('only those in view that show, nearest first, at most the cap', () => {
    const all = [
      fig({ id: 'a', at: [4.175, 73.51] }),
      fig({ id: 'b', at: [4.171, 73.501] }),
      fig({ id: 'out', at: [4.2, 73.51] }),
      fig({ id: 'bus', cat: 'bus', at: [4.1751, 73.51] }),
    ]
    const shown = pickFigures(all, (f) => f.cat !== 'bus', box, [4.175, 73.51], 1)
    expect(shown.map((f) => f.id)).toEqual(['a'])
    expect(pickFigures(all, () => true, box, [4.175, 73.51]).map((f) => f.id).sort()).toEqual(['a', 'b', 'bus'])
  })
})

describe('helpers', () => {
  it('Web Mercator like MapLibre', () => {
    expect(mercator(0, 0)).toEqual([0.5, 0.5])
    const [x, y] = mercator(4.175, 73.51)
    expect(x).toBeCloseTo(0.704194, 5)
    expect(y).toBeLessThan(0.5) // north of the equator is up
  })
  it('a walk cycle only while moving', () => {
    expect(legSwing(1.3, 500, false)).toBe(0)
    expect(legSwing(0, 500, true)).toBe(0)
    const swings = Array.from({ length: 20 }, (_, i) => legSwing(1.3, i * 100, true))
    expect(Math.max(...swings)).toBeGreaterThan(0.2)
    expect(Math.min(...swings)).toBeLessThan(-0.2)
    for (const s of swings) expect(Math.abs(s)).toBeLessThanOrEqual(0.6)
  })
  it('work outfits by service kind', () => {
    expect(workLookFor(['mechanic', 'tyre'])).toBe('mechanic')
    expect(workLookFor(['battery'])).toBe('mechanic')
    expect(workLookFor(['parts'])).toBe('delivery')
    expect(workLookFor(['fuel'])).toBe('delivery')
    expect(workLookFor([])).toBe('mechanic')
  })
  it('a rider for each look', () => {
    expect(riderForLook('woman-libaas')).toBe('woman')
    expect(riderForLook('man-formal')).toBe('man')
    expect(riderForLook('young')).toBe('young')
    expect(riderForLook('plain')).toBe('none')
  })
})
