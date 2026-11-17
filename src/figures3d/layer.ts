// The 3D figures layer: a MapLibre custom layer that draws vehicles and people as low-poly three.js
// models in the map's own WebGL context (one shared scene, one render pass), so buildings hide what
// is behind them. Loaded with a dynamic import, so three.js only downloads when 3D figures show.
//
// Positions come from the FigureRegistry that MapView fills where it moves its DOM markers; this
// layer never moves anything itself. It draws only when the map repaints: MapView asks for a repaint
// when the registry changes (kick), and the layer itself only while indicators blink.

import { AmbientLight, BufferGeometry, Camera, Color, DirectionalLight, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, Scene, WebGLRenderer, type Material } from 'three'
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl'
import { bridgeHeightAt } from '../worldStyle'
import { FIG3D_MAX, legSwing, mercator, modelKey, pickFigures, type Figure, type FigureRegistry } from '../core/figures'
import { armGeometry, lampGeometry, legGeometry, lampSpots, LIMBS, personParts, shadowGeometry, TEMPLATES, vehicleGeometry, type PersonParts } from './models'

export interface FiguresLayer extends CustomLayerInterface {
  setEnabled(on: boolean): void
  setNight(night: boolean): void
  // Ask for a frame if anything drawn has changed since the last one.
  kick(): void
}

const EARTH = 40_075_016.686
const SAFE_HEX = /^#[0-9a-f]{6}$/i
const PERSON_H = 1.7
// Never smaller than this on screen (px), like the DOM drawings' minimum, so they stay easy to see
// when zoomed out a little; at most this many times their real size.
const MIN_VEHICLE_PX = 28
const MIN_PERSON_PX = 24
const MAX_BOOST = 6
// How see-through a resting figure is (the flat drawings fade the same way).
const GHOST = 0.45

// Instances of one geometry, rebuilt every frame from scratch.
class Pool {
  private m = new Float32Array(16 * 16)
  private c = new Float32Array(3 * 16)
  private n = 0
  private mesh: InstancedMesh | null = null
  used = 0 // frame number this pool was last used in
  private readonly scene: Scene
  readonly geo: BufferGeometry
  private readonly mat: Material
  private readonly tinted: boolean
  constructor(scene: Scene, geo: BufferGeometry, mat: Material, tinted: boolean) {
    this.scene = scene
    this.geo = geo
    this.mat = mat
    this.tinted = tinted
  }
  begin() {
    this.n = 0
  }
  push(mx: Matrix4, col?: Color) {
    if ((this.n + 1) * 16 > this.m.length) {
      const m = new Float32Array(this.m.length * 2)
      m.set(this.m)
      this.m = m
      const c = new Float32Array(this.c.length * 2)
      c.set(this.c)
      this.c = c
    }
    mx.toArray(this.m, this.n * 16)
    if (col) col.toArray(this.c, this.n * 3)
    this.n++
  }
  end() {
    const n = this.n
    if (!this.mesh && !n) return
    if (!this.mesh || this.mesh.instanceMatrix.count < n) {
      if (this.mesh) {
        this.scene.remove(this.mesh)
        this.mesh.dispose()
      }
      let cap = 16
      while (cap < n) cap *= 2
      const mesh = new InstancedMesh(this.geo, this.mat, cap)
      if (this.tinted) mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3)
      mesh.frustumCulled = false // culled per figure before drawing
      mesh.matrixAutoUpdate = false
      this.scene.add(mesh)
      this.mesh = mesh
    }
    const mesh = this.mesh
    mesh.count = n
    mesh.visible = n > 0
    if (!n) return
    ;(mesh.instanceMatrix.array as Float32Array).set(this.m.subarray(0, n * 16))
    mesh.instanceMatrix.needsUpdate = true
    if (this.tinted && mesh.instanceColor) {
      ;(mesh.instanceColor.array as Float32Array).set(this.c.subarray(0, n * 3))
      mesh.instanceColor.needsUpdate = true
    }
  }
  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.dispose()
    }
    this.mesh = null
    this.geo.dispose()
  }
}

const hex = (c: string, fallback: string) => (SAFE_HEX.test(c) ? c : fallback)

export function createFiguresLayer(registry: FigureRegistry, id = 'figures-3d'): FiguresLayer {
  let map: MlMap | null = null
  let renderer: WebGLRenderer | null = null
  const scene = new Scene()
  const camera = new Camera()
  const ambient = new AmbientLight(0xffffff, 1.6)
  const sun = new DirectionalLight(0xfff7e8, 2.2)
  scene.add(ambient, sun)
  const solid = new MeshLambertMaterial({ vertexColors: true })
  const lit = new MeshBasicMaterial({ toneMapped: false })
  const shade = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
  // Resting vehicles and people (no move for a while, like the faded flat drawings): see-through.
  const ghost = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: GHOST })
  const models = new Map<string, Pool>()
  const people = new Map<string, PersonParts>()
  let legs: Pool
  let arms: Pool
  let ghostLegs: Pool
  let ghostArms: Pool
  let lamps: Pool
  let shadows: Pool
  let enabled = false
  let night = false
  let drawn = -1
  let frame = 0
  let blinkTimer = 0

  const colourCache = new Map<string, Color>()
  const col = (h: string) => {
    let c = colourCache.get(h)
    if (!c) colourCache.set(h, (c = new Color(h)))
    return c
  }

  const setLight = () => {
    // Like the world style's light: a low warm sun from the south-south-west by day, a cool, dim
    // moon at night (src/worldStyle.ts setWorldNight).
    const [az, polar] = night ? [200, 50] : [210, 35]
    const a = (az * Math.PI) / 180
    const p = (polar * Math.PI) / 180
    sun.position.set(Math.sin(a) * Math.sin(p), Math.cos(a) * Math.sin(p), Math.cos(p))
    sun.color.set(night ? 0xc7d2fe : 0xfff7e8)
    sun.intensity = night ? 0.9 : 2.2
    ambient.color.set(night ? 0x8b9cc8 : 0xffffff)
    ambient.intensity = night ? 0.9 : 1.6
    shade.opacity = night ? 0.12 : 0.22
  }
  setLight()

  const pool = (key: string, make: () => BufferGeometry, faded: boolean) => {
    const k = faded ? `${key}:rest` : key
    let p = models.get(k)
    if (!p) models.set(k, (p = new Pool(scene, make(), faded ? ghost : solid, false)))
    p.used = frame
    return p
  }

  // Reused every frame.
  const M = new Matrix4()
  const T = new Matrix4()
  const R = new Matrix4()
  const S = new Matrix4()
  const L = new Matrix4()
  const local = new Matrix4()

  const place = (out: Matrix4, x: number, y: number, z: number, headingDeg: number, sx: number, sy: number, sz: number, leanDeg = 0) => {
    out.makeTranslation(x, y, z)
    out.multiply(R.makeRotationZ((-headingDeg * Math.PI) / 180))
    if (leanDeg) out.multiply(R.makeRotationY((leanDeg * Math.PI) / 180))
    return out.multiply(S.makeScale(sx, sy, sz))
  }

  const BRAKE = new Color('#ff2020')
  const TAIL = new Color('#7f1d1d')
  const AMBER = new Color('#fbbf24')
  const HEADLIGHT = new Color('#fffbe0')

  const drawVehicle = (f: Figure, x: number, y: number, z: number, boost: number, now: number) => {
    if (f.model.kind !== 'vehicle') return
    const { shape, taxi, rider } = f.model
    const t = TEMPLATES[shape]
    const body = hex(f.colour, '#475569')
    const p = pool(`${modelKey(f.model)}:${body}`, () => vehicleGeometry(shape, body, taxi, rider), f.faded)
    const sx = (f.width / t.width) * boost
    const sy = (f.length / t.length) * boost
    const sz = (sx + sy) / 2
    place(M, x, y, z, f.heading, sx, sy, sz, t.two ? f.lean : 0)
    p.push(M)
    shadows.push(L.copy(M).multiply(S.makeScale(t.width * 1.15, t.length * 1.05, 1)))
    // Lamps: brake lights at the back (dim tail lights at night), indicators blinking at the front
    // corners, headlights at night.
    const spots = lampSpots(shape)
    const size = t.two ? 0.1 : 0.26
    const rear = f.braking ? BRAKE : night ? TAIL : null
    if (rear) for (const s of spots.rear) lamps.push(L.copy(M).multiply(T.makeTranslation(s[0], s[1], s[2])).multiply(S.makeScale(size, 0.08, 0.12)), rear)
    const blinkOn = f.signal !== null && now % 700 < 380
    for (const s of spots.front) {
      const side = spots.front.length === 1 ? f.signal : s[0] < 0 ? 'left' : 'right'
      const c = blinkOn && f.signal === side ? AMBER : night ? HEADLIGHT : null
      if (c) lamps.push(L.copy(M).multiply(T.makeTranslation(s[0], s[1], s[2])).multiply(S.makeScale(size * 0.8, 0.08, 0.1)), c)
    }
  }

  const drawPerson = (f: Figure, x: number, y: number, z: number, boost: number, now: number) => {
    if (f.model.kind !== 'person') return
    const key = modelKey(f.model)
    let parts = people.get(key)
    const { look, colour } = f.model
    if (!parts) people.set(key, (parts = personParts(look, colour)))
    const pp = parts
    const p = pool(key, () => pp.body.clone(), f.faded)
    const k = (pp.height / PERSON_H) * boost
    place(M, x, y, z, f.heading, k, k, k)
    p.push(M)
    shadows.push(L.copy(M).multiply(S.makeScale(0.55, 0.45, 1)))
    const a = legSwing(f.speed, now, f.moving) * pp.swing
    const legC = col(pp.legs)
    const armC = col(pp.arms)
    const [legPool, armPool] = f.faded ? [ghostLegs, ghostArms] : [legs, arms]
    for (const side of [-1, 1]) {
      legPool.push(L.copy(M).multiply(T.makeTranslation(side * LIMBS.hipX, 0, LIMBS.hipZ)).multiply(R.makeRotationX(side * a)), legC)
      armPool.push(L.copy(M).multiply(T.makeTranslation(side * LIMBS.shoulderX, 0, LIMBS.shoulderZ)).multiply(R.makeRotationX(-side * a * 0.8)), armC)
    }
  }

  const layer: FiguresLayer = {
    id,
    type: 'custom',
    renderingMode: '3d',
    onAdd(m: MlMap, gl: WebGL2RenderingContext) {
      map = m
      renderer = new WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
      legs = new Pool(scene, legGeometry(), solid, true)
      arms = new Pool(scene, armGeometry(), solid, true)
      ghostLegs = new Pool(scene, legGeometry(), ghost, true)
      ghostArms = new Pool(scene, armGeometry(), ghost, true)
      lamps = new Pool(scene, lampGeometry(), lit, true)
      shadows = new Pool(scene, shadowGeometry(), shade, false)
    },
    onRemove() {
      for (const p of models.values()) p.dispose()
      models.clear()
      for (const p of people.values()) p.body.dispose()
      people.clear()
      for (const p of [legs, arms, ghostLegs, ghostArms, lamps, shadows]) p?.dispose()
      solid.dispose()
      ghost.dispose()
      lit.dispose()
      shade.dispose()
      clearTimeout(blinkTimer)
      // The renderer shares MapLibre's context: never dispose or lose it here.
      renderer = null
      map = null
    },
    render(gl: WebGL2RenderingContext | WebGLRenderingContext, args: CustomRenderMethodInput) {
      const m = map
      if (!m || !renderer) return
      drawn = registry.version
      if (!enabled || (typeof document !== 'undefined' && document.hidden)) return
      frame++
      const now = performance.now()
      const centre = m.getCenter()
      const [ox, oy] = mercator(centre.lat, centre.lng)
      const cos = Math.cos((centre.lat * Math.PI) / 180)
      const unit = 1 / (EARTH * cos) // mercator units per metre here
      const mpp = (EARTH * cos) / (512 * 2 ** m.getZoom()) // metres per pixel
      // The view (padded), and what to draw in it.
      const b = m.getBounds()
      const padY = (b.getNorth() - b.getSouth()) * 0.15
      const padX = (b.getEast() - b.getWest()) * 0.15
      const figs = pickFigures(registry.items.values(), registry.shows, [b.getSouth() - padY, b.getWest() - padX, b.getNorth() + padY, b.getEast() + padX], [centre.lat, centre.lng], FIG3D_MAX)

      for (const p of models.values()) p.begin()
      for (const p of [legs, arms, ghostLegs, ghostArms, lamps, shadows]) p.begin()
      let blinking = false
      for (const f of figs) {
        const [fx, fy] = mercator(f.at[0], f.at[1])
        const x = (fx - ox) / unit
        const y = -(fy - oy) / unit
        // On a raised bridge deck (the Sinamalé Bridge), ride on the deck, not the sea under it.
        const z = bridgeHeightAt(f.at[0], f.at[1])
        if (f.model.kind === 'vehicle') {
          const boost = Math.min(MAX_BOOST, Math.max(1, (MIN_VEHICLE_PX * mpp) / Math.max(1.5, f.length)))
          drawVehicle(f, x, y, z, boost, now)
          if (f.signal) blinking = true
        } else {
          const boost = Math.min(MAX_BOOST, Math.max(1, (MIN_PERSON_PX * mpp) / PERSON_H))
          drawPerson(f, x, y, z, boost, now)
        }
      }
      for (const p of models.values()) p.end()
      for (const p of [legs, arms, ghostLegs, ghostArms, lamps, shadows]) p.end()
      // Drop models not drawn for a while (a bus route colour that left the view).
      if (frame % 600 === 0) {
        for (const [k, p] of models) {
          if (frame - p.used > 600) {
            p.dispose()
            models.delete(k)
          }
        }
      }

      // Camera: MapLibre's matrix, then our local metres around the view's middle (x east, y north,
      // z up), in double precision so nothing shakes at street level.
      local.makeTranslation(ox, oy, 0).multiply(S.makeScale(unit, -unit, unit))
      camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(local)
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
      renderer.resetState()
      renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      renderer.render(scene, camera)
      renderer.resetState()
      // Indicators blink by themselves: a few frames a second while one is on, nothing otherwise.
      if (blinking && !blinkTimer)
        blinkTimer = window.setTimeout(() => {
          blinkTimer = 0
          map?.triggerRepaint()
        }, 120)
    },
    setEnabled(on: boolean) {
      if (enabled === on) return
      enabled = on
      map?.triggerRepaint()
    },
    setNight(n: boolean) {
      if (night === n) return
      night = n
      setLight()
      map?.triggerRepaint()
    },
    kick() {
      if (enabled && map && registry.version !== drawn) map.triggerRepaint()
    },
  }
  return layer
}
