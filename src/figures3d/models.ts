// Low-poly 3D models for the map, built in code from boxes, cylinders and spheres (no downloaded
// assets; our own simple style). Every model is one merged geometry with its colours baked in as
// vertex colours, so each kind of model is a single draw call however many are on the map.
//
// Model space: metres, x to the right, y forward (the nose), z up, the footprint centred on 0,0 and
// standing on z = 0. Vehicles are built at a nominal size (TEMPLATES) and scaled to the real model's
// length and width; people are built 1.7 m tall.

import { BoxGeometry, BufferGeometry, CircleGeometry, Color, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, Matrix4, SphereGeometry } from 'three'
import type { VehicleShape } from '../core/vehicleModels'
import { lookColours, type FigureLook } from '../core/figures'

type Rider = 'none' | 'man' | 'woman' | 'young'

// ---- building blocks ----

interface Part {
  g: BufferGeometry
  c: string
}
const lin = new Map<string, Color>()
function colour(hex: string) {
  let c = lin.get(hex)
  if (!c) lin.set(hex, (c = new Color(hex)))
  return c
}

// A box w (x) by l (y) by h (z), its bottom middle at (x, y, z). `top` narrows the top face
// (x and y factors) and `shift` moves it forward, for windscreens and rounded shoulders.
function box(c: string, w: number, l: number, h: number, x: number, y: number, z: number, top: [number, number] = [1, 1], shift = 0): Part {
  const g = new BoxGeometry(w, l, h)
  if (top[0] !== 1 || top[1] !== 1 || shift) {
    const p = g.getAttribute('position')
    for (let i = 0; i < p.count; i++) {
      if (p.getZ(i) > 0) {
        p.setX(i, p.getX(i) * top[0])
        p.setY(i, p.getY(i) * top[1] + shift)
      }
    }
  }
  g.translate(x, y, z + h / 2)
  return { g, c }
}
// A cylinder standing up (axis z), radius r1 at the bottom and r2 at the top.
function column(c: string, r1: number, r2: number, h: number, x: number, y: number, z: number, seg = 8): Part {
  const g = new CylinderGeometry(r2, r1, h, seg, 1)
  g.rotateX(Math.PI / 2)
  g.translate(x, y, z + h / 2)
  return { g, c }
}
// A wheel: a short cylinder with its axle along x.
function wheel(r: number, w: number, x: number, y: number, seg = 8, c = '#111827'): Part {
  const g = new CylinderGeometry(r, r, w, seg, 1)
  g.rotateZ(Math.PI / 2)
  g.translate(x, y, r)
  return { g, c }
}
function ball(c: string, r: number, x: number, y: number, z: number, detail = 1, squash: [number, number, number] = [1, 1, 1]): Part {
  const g = new IcosahedronGeometry(r, detail)
  g.scale(squash[0], squash[1], squash[2])
  g.translate(x, y, z)
  return { g, c }
}
// The top half of a sphere (a cap of hair, a helmet), dome up.
function dome(c: string, r: number, x: number, y: number, z: number, seg = 8): Part {
  const g = new SphereGeometry(r, seg, 3, 0, Math.PI * 2, 0, Math.PI / 2)
  g.rotateX(Math.PI / 2)
  g.translate(x, y, z)
  return { g, c }
}

// Merge parts into one flat-shaded geometry with vertex colours.
export function merge(parts: Part[], transform?: Matrix4): BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  for (const { g, c } of parts) {
    const flat = g.index ? g.toNonIndexed() : g
    if (transform) flat.applyMatrix4(transform)
    const p = flat.getAttribute('position')
    const k = colour(c)
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      col.push(k.r, k.g, k.b)
    }
    if (flat !== g) flat.dispose()
    g.dispose()
  }
  const out = new BufferGeometry()
  out.setAttribute('position', new Float32BufferAttribute(pos, 3))
  out.setAttribute('color', new Float32BufferAttribute(col, 3))
  out.computeVertexNormals() // non-indexed: one normal per face (flat, low-poly look)
  out.computeBoundingSphere()
  return out
}

export const triangles = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3

// ---- colours ----

const GLASS = '#1e293b'
const TYRE = '#111827'
const DARK = '#0f172a'
const HEAD = '#fef9c3'
const SKIN = '#a86f4c'
const HAIR = '#1c1917'
const SEAT = '#1f2937'

// ---- vehicles ----

// The size each shape is built at (m), and where its lamps are (for the lamp layer).
export interface Template {
  length: number
  width: number
  height: number
  lampZ: number // height of the lamps
  two: boolean // a two-wheeler (leans; one rear lamp)
}
export const TEMPLATES: Record<VehicleShape, Template> = {
  hatchback: { length: 3.8, width: 1.68, height: 1.5, lampZ: 0.75, two: false },
  sedan: { length: 4.5, width: 1.75, height: 1.45, lampZ: 0.75, two: false },
  suv: { length: 4.5, width: 1.85, height: 1.7, lampZ: 0.9, two: false },
  van: { length: 4.7, width: 1.7, height: 1.95, lampZ: 0.85, two: false },
  minibus: { length: 5.4, width: 1.9, height: 2.3, lampZ: 0.9, two: false },
  pickup: { length: 5.3, width: 1.85, height: 1.8, lampZ: 0.9, two: false },
  lorry: { length: 4.7, width: 1.7, height: 2.5, lampZ: 0.8, two: false },
  bus: { length: 12, width: 2.55, height: 3.1, lampZ: 0.9, two: false },
  scooter: { length: 1.85, width: 0.7, height: 1.5, lampZ: 0.75, two: true },
  motorbike: { length: 2, width: 0.75, height: 1.55, lampZ: 0.8, two: true },
  ebike: { length: 1.75, width: 0.65, height: 1.5, lampZ: 0.75, two: true },
  bicycle: { length: 1.75, width: 0.6, height: 1.6, lampZ: 0.8, two: true },
}

// A four-wheeled car-like body: lower body, glass cabin (tapered), roof, wheels and headlights.
function carParts(body: string, L: number, W: number, o: { ride: number; bodyH: number; cabFront: number; cabBack: number; cabH: number; wheelR: number; axle: number }): Part[] {
  const { ride, bodyH, cabFront, cabBack, cabH, wheelR, axle } = o
  const cabL = cabFront - cabBack
  const cabY = (cabFront + cabBack) / 2
  const top = ride + bodyH
  return [
    box(body, W, L, bodyH, 0, 0, ride, [0.96, 0.97]),
    box(GLASS, W * 0.9, cabL, cabH, 0, cabY, top, [0.84, 0.72], -cabL * 0.04),
    box(body, W * 0.76, cabL * 0.7, 0.06, 0, cabY - cabL * 0.05, top + cabH - 0.02),
    box(DARK, W * 0.6, 0.06, bodyH * 0.35, 0, L / 2 - 0.01, ride + 0.05), // grille
    box(HEAD, 0.28, 0.06, 0.12, -W / 2 + 0.25, L / 2 - 0.01, ride + bodyH * 0.55),
    box(HEAD, 0.28, 0.06, 0.12, W / 2 - 0.25, L / 2 - 0.01, ride + bodyH * 0.55),
    wheel(wheelR, 0.22, -W / 2 + 0.13, axle),
    wheel(wheelR, 0.22, W / 2 - 0.13, axle),
    wheel(wheelR, 0.22, -W / 2 + 0.13, -axle),
    wheel(wheelR, 0.22, W / 2 - 0.13, -axle),
  ]
}

// A rider sitting on a two-wheeler at seat height `z`, `y` along the bike. Modest clothes; a helmet
// on motorised bikes (and a scarf trailing under it for a woman).
function riderParts(rider: Rider, y: number, z: number, helmet: boolean, helmetColour: string): Part[] {
  const s = rider === 'young' ? 0.85 : 1
  const shirt = rider === 'man' ? '#334155' : rider === 'woman' ? '#9d174d' : rider === 'young' ? '#0369a1' : '#1e293b'
  const legs = rider === 'woman' ? '#4c1d95' : '#1f2937'
  const parts: Part[] = [
    box(shirt, 0.38 * s, 0.24 * s, 0.55 * s, 0, y - 0.05, z, [0.85, 0.9], 0.04), // torso, leaning forward
    box(legs, 0.16, 0.5 * s, 0.14, -0.13, y + 0.2, z - 0.05), // thighs
    box(legs, 0.16, 0.5 * s, 0.14, 0.13, y + 0.2, z - 0.05),
    box(legs, 0.13, 0.14, 0.45, -0.15, y + 0.42, z - 0.47), // shins
    box(legs, 0.13, 0.14, 0.45, 0.15, y + 0.42, z - 0.47),
    box(shirt, 0.1, 0.5 * s, 0.1, -0.22 * s, y + 0.2, z + 0.4 * s, [1, 1], 0), // arms to the handlebar
    box(shirt, 0.1, 0.5 * s, 0.1, 0.22 * s, y + 0.2, z + 0.4 * s, [1, 1], 0),
  ]
  const hz = z + 0.55 * s + 0.14 * s
  if (helmet) {
    parts.push(ball(SKIN, 0.11 * s, 0, y + 0.01, hz, 1))
    parts.push(dome(helmetColour, 0.15 * s, 0, y - 0.01, hz - 0.03))
  } else if (rider === 'woman') {
    parts.push(ball('#9d174d', 0.14 * s, 0, y - 0.02, hz, 1), ball(SKIN, 0.085 * s, 0, y + 0.05, hz - 0.01, 1, [1, 0.7, 1.1]))
  } else {
    parts.push(ball(SKIN, 0.11 * s, 0, y, hz, 1), dome(HAIR, 0.12 * s, 0, y - 0.015, hz + 0.01))
  }
  if (rider === 'woman' && helmet) parts.push(box('#9d174d', 0.22, 0.06, 0.32, 0, y - 0.14, hz - 0.34, [0.8, 1])) // scarf under the helmet
  return parts
}

function twoWheelerParts(shape: VehicleShape, body: string, rider: Rider): Part[] {
  const t = TEMPLATES[shape]
  const L = t.length
  const half = L / 2
  if (shape === 'bicycle') {
    const r = 0.34
    return [
      wheel(r, 0.05, 0, half - r, 10, TYRE),
      wheel(r, 0.05, 0, -half + r, 10, TYRE),
      box(body, 0.05, L - 2 * r, 0.05, 0, 0, r + 0.15), // top tube
      box(body, 0.05, 0.05, 0.45, 0, -0.18, r - 0.05, [1, 1], -0.12), // seat tube
      box(body, 0.05, 0.05, 0.5, 0, half - r - 0.05, r, [1, 1], -0.08), // fork
      box(DARK, 0.5, 0.05, 0.04, 0, half - r - 0.1, r + 0.5), // handlebar
      box(SEAT, 0.12, 0.22, 0.05, 0, -0.3, r + 0.4),
      ...riderParts(rider, -0.25, r + 0.45, false, body),
    ]
  }
  const r = shape === 'motorbike' ? 0.3 : 0.25
  const parts: Part[] = [wheel(r, 0.12, 0, half - r, 8, TYRE), wheel(r, 0.14, 0, -half + r, 8, TYRE)]
  if (shape === 'motorbike') {
    parts.push(
      box(DARK, 0.3, 0.55, 0.3, 0, 0, r - 0.05), // engine
      box(body, 0.36, 0.5, 0.22, 0, 0.18, r + 0.25, [0.8, 0.9]), // tank
      box(SEAT, 0.28, 0.6, 0.1, 0, -0.35, r + 0.35),
      box(body, 0.2, 0.5, 0.12, 0, -0.7, r + 0.3, [0.8, 1], 0), // tail
      box(DARK, 0.06, 0.06, 0.55, 0, half - r - 0.1, r, [1, 1], -0.1), // fork
      box(DARK, 0.62, 0.05, 0.04, 0, half - r - 0.2, r + 0.55),
      box(HEAD, 0.14, 0.05, 0.1, 0, half - r + 0.02, r + 0.42),
      ...riderParts(rider, -0.3, r + 0.45, true, body),
    )
  } else {
    // Scooters and e-bikes: a step-through with a front shield and a deck.
    parts.push(
      box(body, 0.38, L * 0.55, 0.18, 0, -0.1, r - 0.05), // deck
      box(body, 0.42, 0.25, 0.65, 0, half - r - 0.12, r - 0.05, [0.85, 0.6], -0.08), // front shield
      box(body, 0.4, 0.55, 0.35, 0, -half + r + 0.15, r, [0.9, 0.9]), // rear body
      box(SEAT, 0.3, 0.55, 0.08, 0, -0.35, r + 0.35),
      box(DARK, 0.6, 0.05, 0.04, 0, half - r - 0.18, r + 0.7),
      box(HEAD, 0.14, 0.05, 0.1, 0, half - r + 0.02, r + 0.45),
      ...riderParts(rider, -0.3, r + 0.43, true, shape === 'ebike' ? '#e2e8f0' : body),
    )
  }
  return parts
}

function vehicleParts(shape: VehicleShape, body: string, taxi: boolean, rider: Rider): Part[] {
  const t = TEMPLATES[shape]
  const L = t.length
  const W = t.width
  if (t.two) return twoWheelerParts(shape, body, rider)
  switch (shape) {
    case 'hatchback':
      return carParts(body, L, W, { ride: 0.25, bodyH: 0.7, cabFront: 0.75, cabBack: -1.75, cabH: 0.55, wheelR: 0.3, axle: 1.25 })
    case 'sedan': {
      const p = carParts(body, L, W, { ride: 0.25, bodyH: 0.65, cabFront: 0.85, cabBack: -1.15, cabH: 0.55, wheelR: 0.31, axle: 1.4 })
      if (taxi) {
        p.push(
          box('#fef08a', 0.7, 0.32, 0.2, 0, -0.2, 1.43, [0.9, 0.85]), // roof sign
          box(DARK, 0.5, 0.33, 0.06, 0, -0.2, 1.5),
          box(DARK, W + 0.02, L * 0.7, 0.1, 0, -0.1, 0.62), // a dark band along the sides
        )
      }
      return p
    }
    case 'suv':
      return carParts(body, L, W, { ride: 0.35, bodyH: 0.75, cabFront: 0.9, cabBack: -2.0, cabH: 0.6, wheelR: 0.36, axle: 1.4 })
    case 'van':
      return carParts(body, L, W, { ride: 0.25, bodyH: 0.75, cabFront: 1.6, cabBack: -2.3, cabH: 0.95, wheelR: 0.3, axle: 1.35 })
    case 'minibus':
      return carParts(body, L, W, { ride: 0.3, bodyH: 0.8, cabFront: 2.2, cabBack: -2.65, cabH: 1.2, wheelR: 0.33, axle: 1.65 })
    case 'pickup':
      return [
        ...carParts(body, L, W, { ride: 0.35, bodyH: 0.7, cabFront: 1.0, cabBack: -0.6, cabH: 0.7, wheelR: 0.36, axle: 1.6 }),
        box(DARK, W * 0.86, 2.0, 0.05, 0, -1.55, 1.05), // the open bed's floor
        box(body, 0.08, 2.1, 0.35, -W / 2 + 0.06, -1.55, 1.05),
        box(body, 0.08, 2.1, 0.35, W / 2 - 0.06, -1.55, 1.05),
      ]
    case 'lorry':
      return [
        ...carParts(body, 1.7, W, { ride: 0.35, bodyH: 0.85, cabFront: 0.85, cabBack: 0.1, cabH: 0.75, wheelR: 0.34, axle: 0 }).slice(0, 6).map((p) => ({ ...p, g: p.g.translate(0, L / 2 - 0.85, 0) })),
        box('#e2e8f0', W, L - 1.75, 2.0, 0, -0.85, 0.5), // the goods box
        box(DARK, W * 0.9, L - 1.8, 0.12, 0, -0.85, 0.4),
        wheel(0.34, 0.25, -W / 2 + 0.14, 1.5),
        wheel(0.34, 0.25, W / 2 - 0.14, 1.5),
        wheel(0.34, 0.3, -W / 2 + 0.16, -1.2),
        wheel(0.34, 0.3, W / 2 - 0.16, -1.2),
      ]
    case 'bus':
      return [
        box(body, W, L, 0.95, 0, 0, 0.35, [0.98, 0.995]),
        box(GLASS, W * 0.98, L * 0.96, 1.0, 0, 0.1, 1.3), // window band
        box(body, W, L, 0.75, 0, 0, 2.3, [0.95, 0.99]), // upper body and roof
        box('#e2e8f0', W * 0.6, 3.0, 0.15, 0, -2.5, 3.05), // roof unit
        box(GLASS, W * 0.9, 0.06, 1.4, 0, L / 2, 0.95), // windscreen
        box(HEAD, 0.35, 0.06, 0.15, -W / 2 + 0.3, L / 2, 0.55),
        box(HEAD, 0.35, 0.06, 0.15, W / 2 - 0.3, L / 2, 0.55),
        wheel(0.5, 0.3, -W / 2 + 0.16, L / 2 - 2.6),
        wheel(0.5, 0.3, W / 2 - 0.16, L / 2 - 2.6),
        wheel(0.5, 0.3, -W / 2 + 0.16, -L / 2 + 3.2),
        wheel(0.5, 0.3, W / 2 - 0.16, -L / 2 + 3.2),
      ]
    default:
      return carParts(body, L, W, { ride: 0.25, bodyH: 0.7, cabFront: 0.75, cabBack: -1.75, cabH: 0.55, wheelR: 0.3, axle: 1.25 })
  }
}

export function vehicleGeometry(shape: VehicleShape, body: string, taxi = false, rider: Rider = 'none'): BufferGeometry {
  return merge(vehicleParts(shape, body, taxi, rider))
}

// Where a vehicle's lamps are, in its template's space: two at the back (brake), two at the front
// corners (indicators by day, headlights at night). Two-wheelers have one of each, in the middle.
export function lampSpots(shape: VehicleShape): { rear: [number, number, number][]; front: [number, number, number][] } {
  const t = TEMPLATES[shape]
  const y = t.length / 2
  const z = t.lampZ
  if (t.two) return { rear: [[0, -y + 0.05, z * 0.8]], front: [[0, y - 0.25, z * 0.7]] }
  const x = t.width / 2 - 0.18
  return {
    rear: [
      [-x, -y, z],
      [x, -y, z],
    ],
    front: [
      [-x - 0.05, y, z * 0.85],
      [x + 0.05, y, z * 0.85],
    ],
  }
}

// ---- people ----

// What a look wears: body (torso, head, hair or hijab), and the colours the arms and legs take
// (legs and arms are separate parts, so they can swing).
export interface PersonParts {
  body: BufferGeometry
  legs: string
  arms: string
  swing: number // how much the legs swing (a long dress: less)
  height: number // metres
}

const HIP = 0.86 // leg length
const SHOULDER = 1.42

// A head with short hair, or wrapped in a hijab.
function headParts(kind: 'hair' | 'hijab' | 'hijab-fitted' | 'cap' | 'helmet', c: string): Part[] {
  const z = 1.6
  if (kind === 'hijab' || kind === 'hijab-fitted') {
    const parts: Part[] = [
      ball(c, kind === 'hijab' ? 0.15 : 0.135, 0, -0.012, z, 1),
      ball(SKIN, 0.088, 0, 0.055, z - 0.01, 1, [1, 0.7, 1.15]), // the face
    ]
    // A simple wrapped hijab falls over the shoulders; the sporty one is fitted at the neck.
    if (kind === 'hijab') parts.push(column(c, 0.27, 0.15, 0.24, 0, -0.01, SHOULDER - 0.12))
    else parts.push(column(c, 0.12, 0.11, 0.12, 0, -0.01, SHOULDER - 0.02))
    return parts
  }
  const parts: Part[] = [box(SKIN, 0.09, 0.09, 0.08, 0, 0, SHOULDER), ball(SKIN, 0.115, 0, 0, z, 1)]
  if (kind === 'cap') parts.push(dome(c, 0.125, 0, -0.01, z + 0.02), box(c, 0.16, 0.12, 0.025, 0, 0.11, z + 0.02))
  else if (kind === 'helmet') parts.push(dome(c, 0.15, 0, -0.01, z - 0.02))
  else parts.push(dome(HAIR, 0.122, 0, -0.012, z + 0.01))
  return parts
}

// A torso from the hips to the shoulders, a little narrower at the waist.
const torso = (c: string, w = 0.42) => box(c, w, 0.22, SHOULDER - HIP, 0, 0, HIP, [1.08, 1])
// Short sleeves (a T-shirt or polo) over the top of the arms.
const sleeves = (c: string) => [box(c, 0.12, 0.13, 0.18, -0.27, 0, SHOULDER - 0.2), box(c, 0.12, 0.13, 0.18, 0.27, 0, SHOULDER - 0.2)]

export function personParts(look: FigureLook, colourIndex: number): PersonParts {
  const [main, second] = lookColours(colourIndex)
  let body: Part[]
  let legs = second
  let arms = main
  let swing = 1
  let height = 1.7
  switch (look) {
    case 'man-casual':
      body = [torso(main), box('#f8fafc', 0.2, 0.06, 0.05, 0, 0.1, SHOULDER - 0.05), ...headParts('hair', HAIR)]
      break
    case 'man-tshirt':
      body = [torso(main), ...sleeves(main), ...headParts('hair', HAIR)]
      arms = SKIN
      break
    case 'man-formal': {
      const shirt = main === '#f8fafc' ? '#dbeafe' : '#f8fafc'
      body = [torso(shirt), box(main, 0.06, 0.02, 0.42, 0, 0.115, SHOULDER - 0.46, [0.6, 1]), ...headParts('hair', HAIR)] // a tie
      arms = shirt
      legs = '#1f2937'
      break
    }
    case 'woman-hijab':
      // A long tunic over trousers, and a simple wrapped hijab.
      body = [box(main, 0.42, 0.24, SHOULDER - HIP + 0.3, 0, 0, HIP - 0.3, [0.92, 0.92]), ...headParts('hijab', second === '#1e293b' ? '#334155' : second)]
      break
    case 'woman-libaas':
      // A long dress (libaas) to the ankles, and a hijab over the shoulders.
      body = [column(main, 0.3, 0.2, SHOULDER - 0.1, 0, 0, 0.1, 8), ...headParts('hijab', second)]
      legs = main
      swing = 0.35
      break
    case 'woman-sport':
      // A sports top and track trousers with a stripe, and a fitted sports hijab.
      body = [torso(main, 0.38), box('#f8fafc', 0.39, 0.02, 0.06, 0, 0.11, HIP + 0.25), ...headParts('hijab-fitted', DARK)]
      legs = DARK
      break
    case 'young':
      body = [torso(main, 0.38), ...sleeves(main), box(second, 0.4, 0.22, 0.22, 0, 0, HIP - 0.16), ...headParts('cap', second)] // T-shirt, shorts, cap
      arms = SKIN
      legs = SKIN
      height = 1.45
      break
    case 'mechanic':
      // Blue overalls with a light stripe, and a tool bag.
      body = [torso('#1d4ed8'), box('#fde047', 0.43, 0.23, 0.05, 0, 0, HIP + 0.2), box('#b91c1c', 0.12, 0.34, 0.2, 0.36, 0.05, 0.42), box(DARK, 0.02, 0.02, 0.36, 0.3, 0.05, 0.62), ...headParts('cap', '#1e3a8a')]
      arms = '#1d4ed8'
      legs = '#1d4ed8'
      break
    case 'delivery':
      // A bright jacket, a helmet, and a delivery box on the back.
      body = [torso('#16a34a'), box('#f97316', 0.4, 0.3, 0.42, 0, -0.27, HIP + 0.1), ...headParts('helmet', '#f8fafc')]
      arms = '#16a34a'
      legs = '#1f2937'
      break
    case 'taxi-driver':
      body = [torso('#facc15'), ...sleeves('#facc15'), ...headParts('cap', DARK)]
      arms = SKIN
      legs = '#1f2937'
      break
    default:
      // Plain: a simple figure in the chosen colour.
      body = [torso(main), ...headParts('hair', HAIR)]
  }
  // Built 1.7 m tall; a young person is scaled down by the layer (height).
  return { body: merge(body), legs, arms, swing, height }
}

// One leg (hanging from the hip at z = 0, down to z = -HIP, with a shoe) and one arm (hanging from
// the shoulder). White, so each person's colours tint them; shoes and hands a shade darker.
export function legGeometry() {
  return merge([box('#ffffff', 0.14, 0.15, HIP - 0.07, 0, 0, -HIP + 0.07), box('#3f3f46', 0.13, 0.24, 0.07, 0, 0.04, -HIP)])
}
export function armGeometry() {
  return merge([box('#ffffff', 0.1, 0.11, 0.56, 0, 0, -0.56, [1.1, 1.1]), box('#d6b6a0', 0.08, 0.09, 0.08, 0, 0, -0.64)])
}
export const LIMBS = { hipZ: HIP, hipX: 0.1, shoulderZ: SHOULDER - 0.04, shoulderX: 0.265 }

// A flat soft shadow under each figure (a disc 1 m across), and a lamp (a unit box).
export function shadowGeometry() {
  const g = new CircleGeometry(0.5, 12)
  g.translate(0, 0, 0.04)
  return g
}
export function lampGeometry() {
  return new BoxGeometry(1, 1, 1)
}
