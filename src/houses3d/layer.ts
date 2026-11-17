// Our own houses in 3D (plans/house-designs.md): a MapLibre custom layer that draws the houses in and
// near the view as three.js meshes in the map's own WebGL context, so they share the depth buffer with
// the buildings and the 3D figures (figures in yards and streets are hidden by walls in front of
// them). Real sloped roofs, which fill-extrusion can't draw.
//
// The houses come in tiles of about 280 m (src/data/houses/<area>/, scripts/build-house-tiles.py),
// each a lazy chunk loaded the first time the view reaches it. Each tile is built into one merged
// mesh (plus one for window glass): a single draw call or two per tile however many houses it has.
// Close up (zoom 18.5+) the tiles in view are rebuilt with boundary walls, gates, balconies, doors and
// windows; the ones only near the view keep the simple version. Loaded with a dynamic import, so
// three.js only downloads when the 3D houses show (it shares the figures layer's chunk).

import { AmbientLight, BufferGeometry, Camera, DirectionalLight, Float32BufferAttribute, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Scene, WebGLRenderer } from 'three'
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl'
import { mercator } from '../core/figures'
import { buildHouses, triCount, type HouseLod, type MeshData } from '../core/houseGeometry'
import { decodeHouseTile, HOUSES3D_DETAIL_ZOOM, houseTileBox, houseTileOrigin, houseTilesIn, type House, type HouseTileDoc } from '../core/houseTiles'

export interface HousesLayer extends CustomLayerInterface {
  setEnabled(on: boolean): void
  setNight(night: boolean): void
  // What the last frame drew (tiles, triangles), for checking frame cost.
  stats(): { tiles: number; triangles: number; houses: number }
}

const EARTH = 40_075_016.686
const FILES = import.meta.glob<HouseTileDoc>('../data/houses/*/*.json', { import: 'default' })
const BY_NAME = new Map<string, () => Promise<HouseTileDoc>>()
for (const [path, load] of Object.entries(FILES)) {
  const name = path.slice(path.lastIndexOf('/') + 1, -5)
  BY_NAME.set(name, load)
}
const MAX_TILES = 36 // in and near the view
const KEEP_BUILT = 48 // tiles kept built (the rest are freed)
const BUILD_MS = 10 // building time per frame

interface Tile {
  name: string
  houses: House[] | null
  loading: boolean
  origin: [number, number] // mercator of the south-west corner
  cos: number // cos of the tile's latitude
  lod: HouseLod | 0 // built at
  solid: Mesh | null
  glass: Mesh | null
  tris: number
  used: number
}

function geometry(m: MeshData): BufferGeometry | null {
  if (!m.pos.length) return null
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(m.pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(m.nor, 3))
  g.setAttribute('color', new Float32BufferAttribute(m.col, 3))
  return g
}

export function createHousesLayer(id = 'houses-3d'): HousesLayer {
  let map: MlMap | null = null
  let renderer: WebGLRenderer | null = null
  const scene = new Scene()
  const camera = new Camera()
  const ambient = new AmbientLight(0xffffff, 1.6)
  const sun = new DirectionalLight(0xfff7e8, 2.2)
  scene.add(ambient, sun)
  // Walls and roofs (the vertex colours, dimmed at night) and windows (dark glass by day; at night
  // the lit ones glow warm).
  const solid = new MeshLambertMaterial({ vertexColors: true })
  const glass = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  const tiles = new Map<string, Tile>()
  let enabled = false
  let night = false
  let frame = 0
  let last = { tiles: 0, triangles: 0, houses: 0 }

  const setLight = () => {
    // As the figures layer and the world style: a low warm sun by day, a cool, dim moon at night.
    const [az, polar] = night ? [200, 50] : [210, 35]
    const a = (az * Math.PI) / 180
    const p = (polar * Math.PI) / 180
    sun.position.set(Math.sin(a) * Math.sin(p), Math.cos(a) * Math.sin(p), Math.cos(p))
    sun.color.set(night ? 0xc7d2fe : 0xfff7e8)
    sun.intensity = night ? 0.8 : 2
    ambient.color.set(night ? 0x8b9cc8 : 0xffffff)
    ambient.intensity = night ? 0.8 : 1.5
    solid.color.set(night ? 0x8c8aa8 : 0xffffff)
    glass.color.set(night ? 0xffcf7a : 0x55606e)
  }
  setLight()

  const free = (t: Tile) => {
    for (const mesh of [t.solid, t.glass]) {
      if (!mesh) continue
      scene.remove(mesh)
      mesh.geometry.dispose()
    }
    t.solid = t.glass = null
    t.lod = 0
    t.tris = 0
  }

  const load = (t: Tile) => {
    const get = BY_NAME.get(t.name)
    if (!get || t.loading || t.houses) return
    t.loading = true
    get()
      .then((doc) => {
        t.houses = decodeHouseTile(doc, t.name)
        map?.triggerRepaint()
      })
      .catch(() => {
        t.houses = []
      })
      .finally(() => {
        t.loading = false
      })
  }

  const build = (t: Tile, lod: HouseLod) => {
    free(t)
    const houses = t.houses ?? []
    const [mx0, my0] = t.origin
    const k = EARTH * t.cos // metres per mercator unit at the tile
    const list = houses.map((house) => {
      const [mx, my] = mercator(house.at[0], house.at[1])
      return { house, x: (mx - mx0) * k, y: -(my - my0) * k }
    })
    const out = buildHouses(list, lod)
    const gs = geometry(out.solid)
    const gg = geometry(out.glass)
    if (gs) {
      t.solid = new Mesh(gs, solid)
      t.solid.matrixAutoUpdate = false
      t.solid.frustumCulled = false // culled per tile
      scene.add(t.solid)
    }
    if (gg) {
      t.glass = new Mesh(gg, glass)
      t.glass.matrixAutoUpdate = false
      t.glass.frustumCulled = false
      scene.add(t.glass)
    }
    t.tris = triCount(out.solid) + triCount(out.glass)
    t.lod = lod
  }

  const S = new Matrix4()
  const local = new Matrix4()
  const intersects = (a: readonly number[], b: readonly number[]) => a[0]! <= b[2]! && a[2]! >= b[0]! && a[1]! <= b[3]! && a[3]! >= b[1]!

  const layer: HousesLayer = {
    id,
    type: 'custom',
    renderingMode: '3d',
    onAdd(m: MlMap, gl: WebGL2RenderingContext) {
      map = m
      renderer = new WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
    },
    onRemove() {
      for (const t of tiles.values()) free(t)
      tiles.clear()
      solid.dispose()
      glass.dispose()
      // The renderer shares MapLibre's context: never dispose or lose it here.
      renderer = null
      map = null
    },
    render(gl: WebGL2RenderingContext | WebGLRenderingContext, args: CustomRenderMethodInput) {
      const m = map
      if (!m || !renderer || !enabled || (typeof document !== 'undefined' && document.hidden)) return
      frame++
      const zoom = m.getZoom()
      const b = m.getBounds()
      const view = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()] as const
      const padY = (view[2] - view[0]) * 0.25
      const padX = (view[3] - view[1]) * 0.25
      const near = houseTilesIn([view[0] - padY, view[1] - padX, view[2] + padY, view[3] + padX], MAX_TILES).filter((n) => BY_NAME.has(n))
      const show = new Set(near)
      const t0 = performance.now()
      let pending = false
      for (const name of near) {
        let t = tiles.get(name)
        if (!t) {
          const [lat, lng] = houseTileOrigin(name)
          const box = houseTileBox(name)
          t = { name, houses: null, loading: false, origin: mercator(lat, lng), cos: Math.cos((((box[0] + box[2]) / 2) * Math.PI) / 180), lod: 0, solid: null, glass: null, tris: 0, used: frame }
          tiles.set(name, t)
        }
        t.used = frame
        if (!t.houses) {
          load(t)
          continue
        }
        // The close-up details only for tiles actually in view.
        const want: HouseLod = zoom >= HOUSES3D_DETAIL_ZOOM && intersects(houseTileBox(name), view) ? 2 : 1
        if (t.lod !== want) {
          if (performance.now() - t0 < BUILD_MS || !t.lod) build(t, want)
          else pending = true
        }
      }
      // Free the tiles furthest out of use.
      const built = [...tiles.values()].filter((t) => t.lod)
      if (built.length > KEEP_BUILT) {
        built.sort((a, c) => a.used - c.used)
        for (const t of built.slice(0, built.length - KEEP_BUILT)) free(t)
      }

      const centre = m.getCenter()
      const [ox, oy] = mercator(centre.lat, centre.lng)
      const cosC = Math.cos((centre.lat * Math.PI) / 180)
      const unit = 1 / (EARTH * cosC) // mercator units per metre here
      let tris = 0
      let count = 0
      let houses = 0
      for (const t of tiles.values()) {
        const on = show.has(t.name) && t.lod > 0
        for (const mesh of [t.solid, t.glass]) {
          if (!mesh) continue
          mesh.visible = on
          if (!on) continue
          // Tile metres -> metres at the view's middle, placed from the view's middle.
          const s = cosC / t.cos
          mesh.matrix.makeTranslation((t.origin[0] - ox) / unit, -(t.origin[1] - oy) / unit, 0).multiply(S.makeScale(s, s, 1))
          mesh.matrixWorldNeedsUpdate = true
        }
        if (on) {
          tris += t.tris
          count++
          houses += t.houses?.length ?? 0
        }
      }
      last = { tiles: count, triangles: tris, houses }

      // Camera: as the figures layer (MapLibre's matrix, then local metres round the view's middle).
      local.makeTranslation(ox, oy, 0).multiply(S.makeScale(unit, -unit, unit))
      camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(local)
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
      renderer.resetState()
      renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      renderer.render(scene, camera)
      renderer.resetState()
      if (pending) m.triggerRepaint()
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
    stats() {
      return last
    },
  }
  return layer
}
