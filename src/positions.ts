// Taxi positions feed. PLACEHOLDER: positions are simulated along Malé roads.
//
// When the driver app exists, replace `subscribePositions` with a real feed (e.g. a WebSocket to
// the TaxiQ server, authenticated with eFaas) that calls `onUpdate` with the same shape.
// The map only depends on this interface.

export interface Position {
  lat: number
  lng: number
  heading: number // degrees, 0 = north
}

export type Positions = ReadonlyMap<string, Position>

type LatLng = [number, number]

// Approximate loops along Malé's main roads (Boduthakurufaanu Magu ring, Majeedhee Magu,
// Sosun Magu, Chaandhanee Magu). Good enough for a demo, not survey-accurate.
const ring: LatLng[] = [
  [4.17905, 73.50095], [4.17880, 73.50400], [4.17830, 73.50760], [4.17790, 73.51100],
  [4.17760, 73.51400], [4.17700, 73.51700], [4.17590, 73.51960], [4.17400, 73.52130],
  [4.17200, 73.52110], [4.17020, 73.51900], [4.16900, 73.51550], [4.16860, 73.51150],
  [4.16880, 73.50750], [4.16960, 73.50350], [4.17120, 73.50100], [4.17400, 73.49990],
  [4.17700, 73.49990],
]
const majeedhee: LatLng[] = [
  [4.17330, 73.50050], [4.17325, 73.50500], [4.17320, 73.50950], [4.17310, 73.51400],
  [4.17300, 73.51800], [4.17290, 73.52080], [4.17020, 73.51900], [4.16880, 73.51150],
  [4.16960, 73.50350], [4.17120, 73.50100],
]
const sosun: LatLng[] = [
  [4.17800, 73.50930], [4.17560, 73.50935], [4.17320, 73.50950], [4.17080, 73.50955],
  [4.16870, 73.50960], [4.16880, 73.50750], [4.16960, 73.50350], [4.17330, 73.50050],
  [4.17700, 73.49990], [4.17905, 73.50095], [4.17880, 73.50400],
]
const chaandhanee: LatLng[] = [
  [4.17800, 73.51120], [4.17560, 73.51115], [4.17315, 73.51110], [4.17310, 73.51400],
  [4.17300, 73.51800], [4.17590, 73.51960], [4.17760, 73.51400],
]
const routes = [ring, majeedhee, sosun, chaandhanee]

const M_PER_DEG = 111_320
const cosLat = Math.cos((4.175 * Math.PI) / 180)

interface Route {
  points: LatLng[]
  cum: number[] // cumulative metres at each point (loop closed back to the start)
  length: number
}

function build(points: LatLng[]): Route {
  const closed = [...points, points[0]!]
  const cum = [0]
  for (let i = 1; i < closed.length; i++) {
    const [a, b] = [closed[i - 1]!, closed[i]!]
    const dy = (b[0] - a[0]) * M_PER_DEG
    const dx = (b[1] - a[1]) * M_PER_DEG * cosLat
    cum.push(cum[i - 1]! + Math.hypot(dx, dy))
  }
  return { points: closed, cum, length: cum.at(-1)! }
}

const built = routes.map(build)

function at(route: Route, metres: number): Position {
  const d = ((metres % route.length) + route.length) % route.length
  let i = 1
  while (route.cum[i]! < d) i++
  const [a, b] = [route.points[i - 1]!, route.points[i]!]
  const f = (d - route.cum[i - 1]!) / (route.cum[i]! - route.cum[i - 1]!)
  const heading = (Math.atan2((b[1] - a[1]) * cosLat, b[0] - a[0]) * 180) / Math.PI
  return { lat: a[0] + (b[0] - a[0]) * f, lng: a[1] + (b[1] - a[1]) * f, heading: (heading + 360) % 360 }
}

// Stable pseudo-random per taxi id, so each taxi keeps its route and speed across renders.
function hash(id: string) {
  let h = 2166136261
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

export function subscribePositions(ids: readonly string[], onUpdate: (p: Positions) => void): () => void {
  const sims = ids.map((id) => {
    const h = hash(id)
    const route = built[h % built.length]!
    return {
      id,
      route,
      start: ((h >>> 8) % 1000) / 1000 * route.length,
      speed: 6 + ((h >>> 16) % 60) / 10, // 6–12 m/s, i.e. ~20–43 km/h
      parked: (h >>> 4) % 4 === 0, // some taxis are waiting at the rank
    }
  })
  const t0 = performance.now()
  let frame = 0
  const tick = (now: number) => {
    const s = (now - t0) / 1000
    onUpdate(new Map(sims.map((x) => [x.id, at(x.route, x.start + (x.parked ? 0 : x.speed * s))])))
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}
