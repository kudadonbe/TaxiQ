// TaxiQ Game engine (G2): one step of the ride service, run every second on the host's device.
// Pure: it reads the room and returns the writes to make. Same queue idea as real TaxiQ: a ride is
// offered to the free car that has waited longest; accepting sends it to the back of the queue.

import { fare } from './fares'
import { botSpeed, CarRunner, initialPlan, TRIP_SPEED, type CarPlan } from './gameSim'
import { metres, nearestNode, route, type RoadGraph } from './route'

export const OFFER_GAME_SEC = 120 // 20 real seconds at SIM_RATE 6
export const BOT_ANSWER_GAME_SEC = 15 // a bot driver thinks for 2.5 real seconds
export const SEARCH_GIVE_UP_GAME_SEC = 20 * 60 // a ride nobody takes expires after 20 game minutes

export type TripStatus = 'searching' | 'assigned' | 'done' | 'cancelled' | 'expired'

export interface CarDoc {
  driverUid: string | null
  plan: CarPlan
  queuedAt: number // game second the car joined the back of the queue
  waitT: number // last "wait at" request handled
}

export interface TripDoc {
  id: string
  riderUid: string
  riderName: string
  bot: boolean
  pLat: number
  pLng: number
  pName: string
  dLat: number
  dLng: number
  dName: string
  status: TripStatus
  createdT: number
  offerCar: number | null
  offerT: number | null
  response: 'accept' | 'decline' | null
  declined: number[]
  carNo: number | null
  driverName: string | null
  t0: number | null
  dPick: number | null
  dTotal: number | null
  km: number | null
  fare: number | null
  doneT: number | null
}

export interface PlayerState {
  uid: string
  name: string
  role: 'citizen' | 'driver' | 'operator' | 'owner'
  online: boolean
  waitLat: number | null
  waitLng: number | null
  waitT: number
}

export interface SpawnPoint {
  lat: number
  lng: number
  name: string
}

export interface StepInput {
  g: RoadGraph
  seed: string
  t: number // game seconds now
  dt: number // game seconds since the last step
  hh: number // game hour now
  cars: number
  bots: boolean
  players: PlayerState[]
  carDocs: ReadonlyMap<number, CarDoc>
  trips: TripDoc[]
  spawn: SpawnPoint[]
  rand: () => number
  // The world's saved people (games/{id}/world/roster), for names on trips.
  botDriverName?: (n: number) => string
  citizenNames?: string[]
}

export type Write =
  | { kind: 'car'; n: number; data: CarDoc }
  | { kind: 'trip'; id: string; data: Partial<Omit<TripDoc, 'id'>> }
  | { kind: 'newTrip'; data: Omit<TripDoc, 'id'> }

export const defaultCar = (g: RoadGraph, seed: string, n: number): CarDoc => ({ driverUid: null, plan: initialPlan(g, seed, n), queuedAt: n - 1_000_000, waitT: 0 })

export const tripEnd = (trip: Pick<TripDoc, 't0' | 'dTotal'>) => (trip.t0 ?? 0) + (trip.dTotal ?? 0) / TRIP_SPEED
export const tripPickupAt = (trip: Pick<TripDoc, 't0' | 'dPick'>) => (trip.t0 ?? 0) + (trip.dPick ?? 0) / TRIP_SPEED

// More rides at rush hours, few at night. Rides per car per game hour.
export function demand(hh: number) {
  if (hh >= 7 && hh < 9) return 1.6
  if (hh >= 12 && hh < 14) return 1.2
  if (hh >= 17 && hh < 22) return 1.5
  if (hh >= 22 || hh < 6) return 0.3
  return 0.9
}

const flat = (pts: readonly (readonly [number, number])[]) => pts.flatMap((p) => [p[0], p[1]])

export function engineStep(input: StepInput): Write[] {
  const { g, seed, t, players } = input
  const writes: Write[] = []
  const cars = new Map<number, CarDoc>()
  for (let n = 1; n <= input.cars; n++) cars.set(n, input.carDocs.get(n) ?? defaultCar(g, seed, n))
  const changed = new Set<number>()
  const setCar = (n: number, data: CarDoc) => {
    cars.set(n, data)
    changed.add(n)
  }
  const trips = input.trips.map((x) => ({ ...x }))
  const tripWrite = (trip: TripDoc, data: Partial<Omit<TripDoc, 'id'>>) => {
    Object.assign(trip, data)
    writes.push({ kind: 'trip', id: trip.id, data })
  }
  const byUid = new Map(players.map((p) => [p.uid, p]))
  const busy = new Set(trips.filter((x) => x.status === 'assigned' && x.carNo !== null).map((x) => x.carNo!))
  const runner = (n: number) => new CarRunner(g, seed, n, cars.get(n)!.plan)

  // 1. Player drivers get a car; cars of players who left or changed role go back to bots.
  for (const [n, car] of cars) {
    const p = car.driverUid ? byUid.get(car.driverUid) : null
    if (car.driverUid && (!p || p.role !== 'driver')) setCar(n, { ...car, driverUid: null })
  }
  for (const p of players) {
    if (p.role !== 'driver' || [...cars.values()].some((c) => c.driverUid === p.uid)) continue
    const free = [...cars].find(([n, c]) => !c.driverUid && !busy.has(n) && !trips.some((x) => x.status === 'searching' && x.offerCar === n))
    if (free) setCar(free[0], { ...free[1], driverUid: p.uid })
  }
  const driverOf = (n: number) => {
    const uid = cars.get(n)!.driverUid
    return uid ? (byUid.get(uid) ?? null) : null
  }
  const active = (n: number) => {
    const d = driverOf(n)
    return d ? d.online : input.bots
  }

  // 2. Finished trips: the car parks (player) or cruises on (bot) at the destination and joins the
  // back of the queue.
  for (const trip of trips) {
    if (trip.status !== 'assigned' || trip.carNo === null || t < tripEnd(trip)) continue
    const n = trip.carNo
    tripWrite(trip, { status: 'done', doneT: t })
    busy.delete(n)
    const node = nearestNode(g, [trip.dLat, trip.dLng])
    setCar(n, { ...cars.get(n)!, plan: { k: 'roam', n: node, t0: t, v: driverOf(n) ? 0 : botSpeed(seed, n) }, queuedAt: t })
  }

  // 3. Answers to offers: player answers, bot answers, and offers nobody answered in time.
  const assign = (trip: TripDoc, n: number) => {
    const { pose, node } = runner(n).start(t)
    const from = g.nodes[node]!
    const toPickup = route(g, [from[0], from[1]], [trip.pLat, trip.pLng], 'taxi')
    const ride = route(g, [trip.pLat, trip.pLng], [trip.dLat, trip.dLng], 'taxi')
    if (!toPickup || !ride) {
      tripWrite(trip, { status: 'expired', offerCar: null, response: null })
      return
    }
    const lead = metres([pose.lat, pose.lng], from)
    const p = flat([[pose.lat, pose.lng], ...toPickup.path, ...ride.path])
    const km = Math.round(ride.metres / 10) / 100
    const d = driverOf(n)
    tripWrite(trip, {
      status: 'assigned',
      carNo: n,
      driverName: d ? d.name : (input.botDriverName?.(n) ?? null),
      offerCar: null,
      response: null,
      t0: t,
      dPick: lead + toPickup.metres,
      dTotal: lead + toPickup.metres + ride.metres,
      km,
      fare: fare(km, input.hh),
    })
    busy.add(n)
    setCar(n, { ...cars.get(n)!, plan: { k: 'path', p, t0: t, v: TRIP_SPEED }, queuedAt: t })
  }
  for (const trip of trips) {
    if (trip.status !== 'searching' || trip.offerCar === null) continue
    const n = trip.offerCar
    const bot = !driverOf(n)
    let answer = trip.response
    if (!answer && bot && t - (trip.offerT ?? t) >= BOT_ANSWER_GAME_SEC) answer = input.rand() < 0.9 ? 'accept' : 'decline'
    if (!answer && t - (trip.offerT ?? t) > OFFER_GAME_SEC) answer = 'decline' // missed
    if (answer === 'accept' && !busy.has(n) && cars.has(n)) assign(trip, n)
    else if (answer) tripWrite(trip, { offerCar: null, offerT: null, response: null, declined: [...trip.declined, n] })
  }

  // 4. "Wait at" requests from player drivers whose car is free: drive there, then park.
  for (const [n, car] of cars) {
    const d = driverOf(n)
    if (!d || d.waitLat === null || d.waitLng === null || d.waitT <= car.waitT || busy.has(n)) continue
    const { pose, node } = runner(n).start(t)
    const from = g.nodes[node]!
    const r = route(g, [from[0], from[1]], [d.waitLat, d.waitLng], 'taxi')
    setCar(n, { ...cars.get(n)!, waitT: d.waitT, plan: r ? { k: 'path', p: flat([[pose.lat, pose.lng], ...r.path]), t0: t, v: TRIP_SPEED } : car.plan })
  }

  // 5. Offer waiting rides (oldest first) to the free car that has waited longest.
  const offered = new Set(trips.filter((x) => x.status === 'searching' && x.offerCar !== null).map((x) => x.offerCar!))
  for (const trip of [...trips].sort((a, b) => a.createdT - b.createdT)) {
    if (trip.status !== 'searching' || trip.offerCar !== null) continue
    if (t - trip.createdT > SEARCH_GIVE_UP_GAME_SEC) {
      tripWrite(trip, { status: 'expired' })
      continue
    }
    const queue = [...cars]
      .filter(([n]) => active(n) && !busy.has(n) && !offered.has(n) && !trip.declined.includes(n))
      .sort((a, b) => a[1].queuedAt - b[1].queuedAt || a[0] - b[0])
    const next = queue[0]
    if (next) {
      tripWrite(trip, { offerCar: next[0], offerT: t, response: null })
      offered.add(next[0])
    } else if (trip.declined.length && [...cars.keys()].some((n) => active(n) && !busy.has(n) && !offered.has(n))) {
      // Every free car has said no: go round the queue again.
      tripWrite(trip, { declined: [] })
    }
  }

  // 6. Bot citizens ask for rides, more at rush hours.
  const searching = trips.filter((x) => x.status === 'searching').length
  if (input.bots && input.spawn.length > 1 && searching < Math.max(2, Math.floor(input.cars / 4))) {
    const perSec = (input.cars * demand(input.hh)) / 3600
    if (input.rand() < 1 - Math.exp(-perSec * input.dt)) {
      for (let tries = 0; tries < 6; tries++) {
        const a = input.spawn[Math.floor(input.rand() * input.spawn.length)]!
        const b = input.spawn[Math.floor(input.rand() * input.spawn.length)]!
        if (metres([a.lat, a.lng], [b.lat, b.lng]) < 400) continue
        const names = input.citizenNames ?? []
        const riderName = names.length ? names[Math.floor(input.rand() * names.length)]! : ''
        writes.push({ kind: 'newTrip', data: newTrip({ riderUid: 'bot', riderName, bot: true, from: a, to: b, t }) })
        break
      }
    }
  }

  for (const n of changed) writes.push({ kind: 'car', n, data: cars.get(n)! })
  return writes
}

export function newTrip(x: { riderUid: string; riderName: string; bot: boolean; from: SpawnPoint; to: SpawnPoint; t: number }): Omit<TripDoc, 'id'> {
  return {
    riderUid: x.riderUid,
    riderName: x.riderName.slice(0, 80),
    bot: x.bot,
    pLat: x.from.lat,
    pLng: x.from.lng,
    pName: x.from.name.slice(0, 80),
    dLat: x.to.lat,
    dLng: x.to.lng,
    dName: x.to.name.slice(0, 80),
    status: 'searching',
    createdT: x.t,
    offerCar: null,
    offerT: null,
    response: null,
    declined: [],
    carNo: null,
    driverName: null,
    t0: null,
    dPick: null,
    dTotal: null,
    km: null,
    fare: null,
    doneT: null,
  }
}
