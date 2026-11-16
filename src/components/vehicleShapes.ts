import type { Rider } from '../vehicles'
import type { VehicleShape } from '../core/vehicleModels'

// Top-down vehicle shapes (src/core/vehicleModels.ts), nose pointing UP so rotate() aims them along
// the road, in the style of the map's earlier car, van, pickup and bike drawings. Each is our own
// constant markup; the only thing put in is the body colour, and only after it is checked to be a
// hex colour (or the word currentColor, for markers coloured by CSS). Never put user text in here.

// The drawn size of each shape, in SVG px (its width and height attributes and viewBox). The map
// scales a shape to the vehicle's real length with: scale = lengthOnScreenPx / SHAPE_PX[shape].h.
export const SHAPE_PX: Record<VehicleShape, { w: number; h: number }> = {
  hatchback: { w: 20, h: 34 },
  sedan: { w: 20, h: 38 },
  suv: { w: 22, h: 38 },
  van: { w: 22, h: 40 },
  minibus: { w: 24, h: 48 },
  pickup: { w: 22, h: 42 },
  lorry: { w: 24, h: 48 },
  bus: { w: 20, h: 80 },
  scooter: { w: 14, h: 30 },
  motorbike: { w: 16, h: 34 },
  ebike: { w: 16, h: 32 },
  bicycle: { w: 12, h: 30 },
}
// Shapes that can show a rider (the owner's choice, src/vehicles.ts RIDERS).
export const RIDDEN_SHAPES: VehicleShape[] = ['scooter', 'motorbike', 'ebike', 'bicycle']

export const DEFAULT_FILL = '#475569'
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
// The body colour, checked: a hex colour or currentColor, else the default grey.
export const safeFill = (fill: string) => (fill === 'currentColor' || HEX.test(fill) ? fill : DEFAULT_FILL)

// The vehicle's colour from what the owner typed (English or Dhivehi), else a dark grey.
const COLOURS: [RegExp, string][] = [
  [/red|ރަތް/i, '#dc2626'],
  [/blue|ނޫ/i, '#2563eb'],
  [/green|ފެހި/i, '#16a34a'],
  [/white|ހުދު/i, '#f8fafc'],
  [/black|ކަޅު/i, '#1e293b'],
  [/silver|grey|gray|ރިހި/i, '#94a3b8'],
  [/yellow|ރީނދޫ/i, '#facc15'],
  [/orange|ތެޔޮކުލަ/i, '#f97316'],
  [/brown|ދޮން/i, '#92400e'],
  [/purple|ވައިލެޓް/i, '#7c3aed'],
  [/pink|ފިޔާތޮށި/i, '#ec4899'],
]
export const colourHex = (c: string) => COLOURS.find(([r]) => r.test(c))?.[1] ?? DEFAULT_FILL

const D = '#0f172a' // outlines, glass, tyres
const LIGHT = '#fde68a'

// A rider seen from above, centred at (cx, y). 'none' (the default) is just a helmet; a man (broad
// shoulders); a woman (narrower shoulders, a scarf trailing behind); a young rider (smaller).
function riderSvg(rider: Rider, cx: number, y: number) {
  if (rider === 'man') return `<ellipse cx="${cx}" cy="${y + 2.2}" rx="5.4" ry="2.6" fill="#334155"/><circle cx="${cx}" cy="${y}" r="3.1" fill="${D}"/>`
  if (rider === 'woman')
    return `<ellipse cx="${cx}" cy="${y + 2.2}" rx="4.3" ry="2.3" fill="#475569"/><path d="M${cx - 2.4} ${y + 1} C${cx - 2} ${y + 7} ${cx - 1} ${y + 10} ${cx} ${y + 10.5} C${cx + 1} ${y + 10} ${cx + 2} ${y + 7} ${cx + 2.4} ${y + 1} Z" fill="#be185d" opacity=".92"/><circle cx="${cx}" cy="${y}" r="3" fill="${D}"/><path d="M${cx - 2.8} ${y} A2.9 2.9 0 0 1 ${cx + 2.8} ${y}" fill="none" stroke="#be185d" stroke-width="1.4"/>`
  if (rider === 'young') return `<ellipse cx="${cx}" cy="${y + 1.8}" rx="3.5" ry="1.9" fill="#334155"/><circle cx="${cx}" cy="${y}" r="2.5" fill="${D}"/>`
  return `<circle cx="${cx}" cy="${y}" r="3.6" fill="${D}" opacity=".85"/>`
}

const lamps = (l: number, r: number, y = 2.5, w = 3, h = 2) => `<rect x="${l}" y="${y}" width="${w}" height="${h}" rx="1" fill="${LIGHT}"/><rect x="${r}" y="${y}" width="${w}" height="${h}" rx="1" fill="${LIGHT}"/>`

const BODIES: Record<VehicleShape, (f: string, rider: Rider) => string> = {
  hatchback: (f) => `<rect x="1.5" y="1.5" width="17" height="31" rx="6" fill="${f}" stroke="${D}" stroke-width="1.5"/>
  <path d="M4.5 9 Q10 6 15.5 9 L14.5 13.5 H5.5 Z" fill="${D}" opacity=".85"/>
  <rect x="5.5" y="14.5" width="9" height="10.5" rx="1.5" fill="${D}" opacity=".15"/>
  <path d="M5.5 26 H14.5 L15 29.5 Q10 31 5 29.5 Z" fill="${D}" opacity=".7"/>
  ${lamps(3, 14)}`,
  sedan: (f) => `<rect x="1.5" y="1.5" width="17" height="35" rx="5.5" fill="${f}" stroke="${D}" stroke-width="1.5"/>
  <path d="M4.5 10 Q10 7 15.5 10 L14.5 14.5 H5.5 Z" fill="${D}" opacity=".85"/>
  <rect x="5.5" y="15.5" width="9" height="8.5" rx="1.5" fill="${D}" opacity=".15"/>
  <path d="M5.5 25 H14.5 L15.3 29 Q10 30.3 4.7 29 Z" fill="${D}" opacity=".7"/>
  <line x1="4" y1="31.5" x2="16" y2="31.5" stroke="${D}" stroke-width="1" opacity=".4"/>
  ${lamps(3, 14)}`,
  suv: (f) => `<rect x="1.5" y="1.5" width="19" height="35" rx="4" fill="${f}" stroke="${D}" stroke-width="1.5"/>
  <path d="M4.5 8 Q11 5.5 17.5 8 L16.5 12.5 H5.5 Z" fill="${D}" opacity=".85"/>
  <rect x="5.5" y="13.5" width="11" height="18" rx="1.5" fill="${D}" opacity=".15"/>
  <line x1="5" y1="14" x2="5" y2="31" stroke="${D}" stroke-width="1.2" opacity=".55"/>
  <line x1="17" y1="14" x2="17" y2="31" stroke="${D}" stroke-width="1.2" opacity=".55"/>
  <rect x="5.5" y="32.5" width="11" height="2.5" rx="1" fill="${D}" opacity=".7"/>
  ${lamps(3.5, 15.5)}`,
  van: (f) => `<rect x="1.5" y="1.5" width="19" height="37" rx="4" fill="${f}" stroke="${D}" stroke-width="1.5"/>
  <path d="M4.5 8 Q11 5.5 17.5 8 L16.5 12.5 H5.5 Z" fill="${D}" opacity=".85"/>
  <rect x="5" y="15" width="12" height="20" rx="1.5" fill="${D}" opacity=".18"/>
  ${lamps(3.5, 15.5)}`,
  minibus: (f) => `<rect x="1.5" y="1.5" width="21" height="45" rx="3.5" fill="${f}" stroke="${D}" stroke-width="1.5"/>
  <rect x="4" y="3.5" width="16" height="5" rx="1.5" fill="${D}" opacity=".85"/>
  <rect x="3" y="12" width="1.8" height="31" rx=".8" fill="${D}" opacity=".6"/>
  <rect x="19.2" y="12" width="1.8" height="31" rx=".8" fill="${D}" opacity=".6"/>
  <rect x="6.5" y="12" width="11" height="31" rx="1.5" fill="#ffffff" opacity=".2"/>
  <rect x="9" y="22" width="6" height="4" rx=".8" fill="${D}" opacity=".35"/>
  ${lamps(3, 18, 2.5, 3, 1.6)}`,
  pickup: (f) => `<rect x="1.5" y="1.5" width="19" height="39" rx="5" fill="${f}" stroke="${D}" stroke-width="1.5"/>
  <path d="M4.5 8.5 Q11 6 17.5 8.5 L16.5 13 H5.5 Z" fill="${D}" opacity=".85"/>
  <rect x="5" y="13.5" width="12" height="5" rx="1" fill="${D}" opacity=".15"/>
  <line x1="4" y1="20" x2="18" y2="20" stroke="${D}" stroke-width="1.5"/>
  <rect x="4" y="21" width="14" height="17" rx="1.5" fill="none" stroke="${D}" stroke-width="1.5" opacity=".7"/>
  ${lamps(3.5, 15.5)}`,
  lorry: (f) => `<rect x="2" y="1.5" width="20" height="11" rx="3" fill="${f}" stroke="${D}" stroke-width="1.5"/>
  <rect x="4" y="3.5" width="16" height="3.5" rx="1" fill="${D}" opacity=".85"/>
  <rect x="1.5" y="14" width="21" height="32.5" rx="1" fill="${f}" stroke="${D}" stroke-width="1.5"/>
  <rect x="3.5" y="16" width="17" height="28.5" rx=".5" fill="#ffffff" opacity=".35"/>
  <line x1="12" y1="16" x2="12" y2="44.5" stroke="${D}" stroke-width=".8" opacity=".3"/>
  ${lamps(3, 18, 2.3, 3, 1.6)}`,
  bus: (f) => `<rect x="1.5" y="1.5" width="17" height="77" rx="3" fill="${f}" stroke="${D}" stroke-width="1.5"/>
  <rect x="3.5" y="3.5" width="13" height="5" rx="1.2" fill="${D}" opacity=".85"/>
  <rect x="4.5" y="12" width="11" height="62" rx="1.5" fill="#ffffff" opacity=".22"/>
  <rect x="7" y="22" width="6" height="4" rx=".8" fill="${D}" opacity=".35"/>
  <rect x="7" y="50" width="6" height="4" rx=".8" fill="${D}" opacity=".35"/>
  ${lamps(2.5, 14.5, 2.5, 3, 1.6)}`,
  scooter: (f, rider) => `<rect x="5.5" y="1" width="3" height="5.5" rx="1.5" fill="${D}"/>
  <rect x="5.5" y="23.5" width="3" height="5.5" rx="1.5" fill="${D}"/>
  <line x1="1.5" y1="7.5" x2="12.5" y2="7.5" stroke="${D}" stroke-width="1.6" stroke-linecap="round"/>
  <rect x="3.5" y="6" width="7" height="5.5" rx="2.5" fill="${f}" stroke="${D}" stroke-width="1.1"/>
  <rect x="4.5" y="10.5" width="5" height="6" fill="${f}" stroke="${D}" stroke-width="1.1"/>
  <rect x="3.5" y="15" width="7" height="11" rx="3.5" fill="${f}" stroke="${D}" stroke-width="1.1"/>
  ${riderSvg(rider, 7, 16.5)}
  <circle cx="7" cy="6.6" r="1" fill="${LIGHT}"/>`,
  motorbike: (f, rider) => `<rect x="6.5" y="1" width="3" height="7" rx="1.5" fill="${D}"/>
  <rect x="6.5" y="26" width="3" height="7" rx="1.5" fill="${D}"/>
  <line x1="2" y1="9" x2="14" y2="9" stroke="${D}" stroke-width="1.8" stroke-linecap="round"/>
  <rect x="5" y="8" width="6" height="19" rx="3" fill="${f}" stroke="${D}" stroke-width="1.2"/>
  ${riderSvg(rider, 8, 15.5)}
  <circle cx="8" cy="2" r="1" fill="${LIGHT}"/>`,
  ebike: (f, rider) => `<rect x="6.5" y="1" width="3" height="6" rx="1.5" fill="${D}"/>
  <rect x="6.5" y="25" width="3" height="6" rx="1.5" fill="${D}"/>
  <line x1="2.5" y1="8" x2="13.5" y2="8" stroke="${D}" stroke-width="1.6" stroke-linecap="round"/>
  <rect x="5.5" y="7" width="5" height="19" rx="2.5" fill="${f}" stroke="${D}" stroke-width="1.1"/>
  <rect x="6.5" y="19" width="3" height="5" rx=".8" fill="#22c55e"/>
  ${riderSvg(rider, 8, 13.5)}`,
  bicycle: (f, rider) => `<rect x="5.25" y="1" width="1.5" height="8" rx=".75" fill="${D}"/>
  <rect x="5.25" y="21" width="1.5" height="8" rx=".75" fill="${D}"/>
  <line x1="6" y1="6" x2="6" y2="24" stroke="${D}" stroke-width="2.8" stroke-linecap="round"/>
  <line x1="6" y1="6" x2="6" y2="24" stroke="${f}" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="1.5" y1="7" x2="10.5" y2="7" stroke="${D}" stroke-width="1.2" stroke-linecap="round"/>
  <ellipse cx="6" cy="19.5" rx="1.4" ry="2" fill="${D}"/>
  ${riderSvg(rider, 6, 15.5)}`,
}

// One shape as an SVG string, in the given body colour (checked; a bad value draws grey). Two-
// wheelers show the rider (the default 'none' is just a helmet); other shapes ignore it.
export function shapeSvg(shape: VehicleShape, fill: string, rider: Rider = 'none'): string {
  const s = SHAPE_PX[shape] ? shape : 'hatchback'
  const { w, h } = SHAPE_PX[s]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
  ${BODIES[s](safeFill(fill), rider)}
</svg>`
}

// The scale that draws `shape` at a vehicle's real size, given how many screen px its length takes:
// sy along the vehicle, sx across it (its real width; pass sx = sy to keep the drawing's own shape).
export function shapeScaleXY(shape: VehicleShape, lengthM: number, widthM: number, lengthPx: number) {
  const { w, h } = SHAPE_PX[shape]
  const sy = lengthPx / h
  return { sx: (lengthPx * (widthM / lengthM)) / w, sy }
}

// For an <img> preview (an image can't run scripts, and the markup is ours).
export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
