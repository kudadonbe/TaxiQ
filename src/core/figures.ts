// 3D figures on TaxiQ's own map (src/figures3d/): what MapView tells the three.js layer each frame.
// Pure data and functions (no three.js here), so MapView can fill it without downloading three.js
// and the rules are testable. MapView keeps moving everything exactly as before (glides, roads,
// lanes); it only copies where each thing is shown into this registry.

import type { ServiceKind } from './services'
import type { VehicleShape } from './vehicleModels'
import type { PersonLook } from './presence'
import type { MarkerKind } from '../mapChips'

// Zoomed in at least this far (on TaxiQ's own map, in 3D view), vehicles and people are 3D models.
export const FIG3D_MIN_ZOOM = 16.5
// At most this many figures are drawn (the nearest to the middle of the view).
export const FIG3D_MAX = 300

// People looks: the ones a person can pick (PERSON_LOOKS), plus work outfits given automatically.
export type WorkLook = 'mechanic' | 'delivery' | 'taxi-driver'
export type FigureLook = PersonLook | WorkLook
export const WORK_LOOKS: WorkLook[] = ['mechanic', 'delivery', 'taxi-driver']

// A mobile helper's work outfit, from their first service kind: parts and fuel come by delivery
// rider; everything else (mechanic, tyres, battery, towing, car wash, AC, e-bike help) in overalls.
export function workLookFor(kinds: readonly ServiceKind[]): WorkLook {
  const k = kinds[0] ?? 'mechanic'
  return k === 'parts' || k === 'fuel' ? 'delivery' : 'mechanic'
}

// Clothing colours a person can pick (index 0-5): [main, second]. Calm, everyday colours.
export const LOOK_COLOURS: [string, string][] = [
  ['#2563eb', '#1e293b'], // blue, dark trousers
  ['#0f766e', '#334155'], // teal
  ['#b91c1c', '#1f2937'], // red
  ['#f8fafc', '#475569'], // white
  ['#7c3aed', '#312e81'], // purple
  ['#ca8a04', '#3f3f46'], // mustard
]
export const lookColours = (i: number): [string, string] => LOOK_COLOURS[i] ?? LOOK_COLOURS[0]!

// The rider shown on a two-wheeler for a person's look (src/vehicles.ts RIDERS).
export function riderForLook(look: FigureLook): 'none' | 'man' | 'woman' | 'young' {
  if (look.startsWith('woman')) return 'woman'
  if (look.startsWith('man') || look === 'taxi-driver' || look === 'mechanic' || look === 'delivery') return 'man'
  if (look === 'young' || look === 'child') return 'young'
  return 'none'
}

export type FigureModel =
  | { kind: 'vehicle'; shape: VehicleShape; taxi?: boolean; rider?: 'none' | 'man' | 'woman' | 'young' }
  | { kind: 'person'; look: FigureLook; colour: number }

export interface Figure {
  id: string
  cat: MarkerKind // for the category chips
  model: FigureModel
  colour: string // body colour (vehicles), hex
  at: [number, number] // lat, lng where it is shown now
  heading: number // degrees clockwise from north
  length: number // metres (vehicles: the real length; people: their height)
  width: number // metres
  moving: boolean
  speed: number // m/s (people: for the walk cycle)
  braking: boolean
  signal: 'left' | 'right' | null
  lean: number // degrees, two-wheelers into a turn
  faded: boolean // resting (drawn a little see-through)
}

// What the 3D layer reads. MapView sets entries where it moves its DOM markers; `version` changes
// whenever something drawn changes, so the layer asks for a new frame only then (never a constant
// repaint when nothing moves).
export class FigureRegistry {
  readonly items = new Map<string, Figure>()
  version = 0
  // Category chips and the viewer's own ride: whether a figure shows (set by MapView).
  shows: (f: Figure) => boolean = () => true

  set(f: Figure) {
    const old = this.items.get(f.id)
    if (old && same(old, f)) return
    this.items.set(f.id, f)
    this.version++
  }
  delete(id: string) {
    if (this.items.delete(id)) this.version++
  }
  // Remove every entry with this id prefix that isn't in `keep`.
  prune(prefix: string, keep: ReadonlySet<string>) {
    for (const id of [...this.items.keys()]) if (id.startsWith(prefix) && !keep.has(id)) this.delete(id)
  }
  touch() {
    this.version++
  }
}

const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps
function same(a: Figure, b: Figure) {
  return (
    near(a.at[0], b.at[0], 2e-8) &&
    near(a.at[1], b.at[1], 2e-8) &&
    near(a.heading, b.heading, 0.05) &&
    near(a.lean, b.lean, 0.1) &&
    a.moving === b.moving &&
    a.braking === b.braking &&
    a.signal === b.signal &&
    a.colour === b.colour &&
    a.faded === b.faded &&
    a.cat === b.cat &&
    a.length === b.length &&
    a.width === b.width &&
    modelKey(a.model) === modelKey(b.model)
  )
}

export function modelKey(m: FigureModel) {
  return m.kind === 'vehicle' ? `v:${m.shape}:${m.taxi ? 't' : ''}:${m.rider ?? ''}` : `p:${m.look}:${m.colour}`
}

// Web Mercator, 0..1 across the world (MapLibre's MercatorCoordinate), in double precision.
export function mercator(lat: number, lng: number): [number, number] {
  const x = (lng + 180) / 360
  const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180)
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
  return [x, y]
}

// The figures to draw: those that show, inside the view (s, w, n, e, already padded), at most `max`,
// the nearest to `centre` first.
export function pickFigures(all: Iterable<Figure>, shows: (f: Figure) => boolean, box: [number, number, number, number], centre: [number, number], max = FIG3D_MAX): Figure[] {
  const out: { f: Figure; d: number }[] = []
  const k = Math.cos((centre[0] * Math.PI) / 180)
  for (const f of all) {
    if (f.at[0] < box[0] || f.at[0] > box[2] || f.at[1] < box[1] || f.at[1] > box[3]) continue
    if (!shows(f)) continue
    const dy = f.at[0] - centre[0]
    const dx = (f.at[1] - centre[1]) * k
    out.push({ f, d: dx * dx + dy * dy })
  }
  if (out.length > max) {
    out.sort((a, b) => a.d - b.d)
    out.length = max
  }
  return out.map((x) => x.f)
}

// Walk cycle: the legs' swing (radians) for a person moving at `speed` m/s, at time `t` ms.
export function legSwing(speed: number, t: number, moving: boolean) {
  if (!moving || speed < 0.2) return 0
  const stride = Math.min(1.6, 0.7 + speed * 0.25) // metres a step covers
  const phase = ((t / 1000) * speed * Math.PI) / stride
  return Math.sin(phase) * Math.min(0.6, 0.25 + speed * 0.12)
}
