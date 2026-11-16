import { describe, expect, it } from 'vitest'
import { colourHex, safeFill, shapeScaleXY, shapeSvg, SHAPE_PX } from './vehicleShapes'
import { VEHICLE_SHAPES } from '../core/vehicleModels'

describe('vehicle shapes', () => {
  it('draws every shape at its stated size, nose up (taller than wide)', () => {
    for (const s of VEHICLE_SHAPES) {
      const svg = shapeSvg(s, '#dc2626')
      const { w, h } = SHAPE_PX[s]
      expect(svg, s).toContain(`viewBox="0 0 ${w} ${h}"`)
      expect(svg, s).toContain('#dc2626')
      expect(h, s).toBeGreaterThan(w)
    }
  })
  it('only puts in a checked colour', () => {
    expect(safeFill('#abc')).toBe('#abc')
    expect(safeFill('currentColor')).toBe('currentColor')
    expect(safeFill('red" onload="x')).toBe('#475569')
    const svg = shapeSvg('sedan', '"/><script>alert(1)</script>')
    expect(svg).not.toContain('script')
    expect(colourHex('White Swift')).toBe('#f8fafc')
    expect(colourHex('ރަތް')).toBe('#dc2626')
    expect(colourHex('??')).toBe('#475569')
  })
  it('shows a rider only on two-wheelers', () => {
    expect(shapeSvg('bicycle', '#000000', 'woman')).toContain('#be185d')
    expect(shapeSvg('scooter', '#000000', 'man')).toContain('#334155')
    expect(shapeSvg('sedan', '#000000', 'woman')).not.toContain('#be185d')
  })
  it('scales to the real length and width', () => {
    const { sx, sy } = shapeScaleXY('hatchback', 3.4, 1.7, 68)
    expect(sy).toBe(2)
    expect(sx).toBeCloseTo(34 / 20)
  })
})
