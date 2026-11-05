import { describe, expect, it } from 'vitest'
import { defaultCar, engineStep, newTrip, OFFER_GAME_SEC, tripEnd, type CarDoc, type PlayerState, type StepInput, type TripDoc } from './gameEngine'
import type { RoadGraph } from './route'

// A two-way grid of 3 x 3 junctions about 110 m apart.
const nodes: [number, number][] = []
const next: number[][] = []
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) nodes.push([6.62 + r * 0.001, 73.07 + c * 0.001])
for (let i = 0; i < 9; i++) {
  const r = Math.floor(i / 3)
  const c = i % 3
  next.push([r > 0 ? i - 3 : -1, r < 2 ? i + 3 : -1, c > 0 ? i - 1 : -1, c < 2 ? i + 1 : -1].filter((x) => x >= 0))
}
const g: RoadGraph = { nodes, next }

const A = { lat: 6.62, lng: 73.07, name: 'A' }
const B = { lat: 6.622, lng: 73.072, name: 'B' }

function input(over: Partial<StepInput> = {}): StepInput {
  return { g, seed: 's', t: 1000, dt: 6, hh: 12, cars: 3, bots: true, players: [], carDocs: new Map(), trips: [], spawn: [], rand: () => 0.5, ...over }
}
const ride = (over: Partial<TripDoc> = {}): TripDoc => ({ id: 'r1', ...newTrip({ riderUid: 'u', riderName: 'Ali', bot: false, from: A, to: B, t: 990 }), ...over })
const queued = (order: number[]): Map<number, CarDoc> => new Map(order.map((n, i) => [n, { ...defaultCar(g, 's', n), queuedAt: i }]))

describe('ride engine', () => {
  it('offers a new ride to the car that has waited longest', () => {
    const w = engineStep(input({ trips: [ride()], carDocs: queued([2, 3, 1]) }))
    expect(w).toContainEqual({ kind: 'trip', id: 'r1', data: { offerCar: 2, offerT: 1000, response: null } })
  })
  it('a decline passes the ride to the next car', () => {
    const w = engineStep(input({ trips: [ride({ offerCar: 2, offerT: 995, response: 'decline' })], carDocs: queued([2, 3, 1]) }))
    expect(w).toContainEqual({ kind: 'trip', id: 'r1', data: { offerCar: null, offerT: null, response: null, declined: [2] } })
    expect(w).toContainEqual({ kind: 'trip', id: 'r1', data: { offerCar: 3, offerT: 1000, response: null } })
  })
  it('an offer nobody answers in time counts as a decline', () => {
    const players: PlayerState[] = [{ uid: 'd', name: 'Driver', role: 'driver', online: true, waitLat: null, waitLng: null, waitT: 0 }]
    const cars = queued([2, 3, 1])
    cars.set(2, { ...cars.get(2)!, driverUid: 'd' })
    const w = engineStep(input({ players, trips: [ride({ offerCar: 2, offerT: 1000 - OFFER_GAME_SEC - 1 })], carDocs: cars }))
    expect(w.find((x) => x.kind === 'trip' && 'declined' in x.data)).toBeTruthy()
  })
  it('accepting assigns the trip with a route, a fare, and moves the car to the back', () => {
    const w = engineStep(input({ trips: [ride({ offerCar: 2, offerT: 995, response: 'accept' })], carDocs: queued([2, 3, 1]) }))
    const trip = w.find((x) => x.kind === 'trip' && x.data.status === 'assigned')
    expect(trip?.kind === 'trip' && trip.data).toMatchObject({ carNo: 2, t0: 1000 })
    if (trip?.kind === 'trip') {
      expect(trip.data.km).toBeGreaterThan(0.3)
      expect(trip.data.fare).toBeGreaterThanOrEqual(25)
      expect(trip.data.dTotal!).toBeGreaterThan(trip.data.dPick!)
    }
    const car = w.find((x) => x.kind === 'car' && x.n === 2)
    expect(car?.kind === 'car' && car.data.plan.k).toBe('path')
    expect(car?.kind === 'car' && car.data.queuedAt).toBe(1000)
  })
  it('a finished trip is done and the car joins the back of the queue', () => {
    const trip = ride({ status: 'assigned', carNo: 2, t0: 0, dPick: 100, dTotal: 500, km: 0.4, fare: 25 })
    const w = engineStep(input({ t: tripEnd(trip) + 1, trips: [trip], carDocs: queued([2, 3, 1]) }))
    expect(w).toContainEqual({ kind: 'trip', id: 'r1', data: { status: 'done', doneT: tripEnd(trip) + 1 } })
    const car = w.find((x) => x.kind === 'car' && x.n === 2)
    expect(car?.kind === 'car' && car.data.queuedAt).toBe(tripEnd(trip) + 1)
  })
  it('a player driver gets a car, and offline drivers get no offers', () => {
    const players: PlayerState[] = [{ uid: 'd', name: 'Driver', role: 'driver', online: false, waitLat: null, waitLng: null, waitT: 0 }]
    const w = engineStep(input({ players, bots: false, trips: [ride()], carDocs: queued([1, 2, 3]) }))
    expect(w).toContainEqual(expect.objectContaining({ kind: 'car', n: 1, data: expect.objectContaining({ driverUid: 'd' }) }))
    expect(w.some((x) => x.kind === 'trip' && x.data.offerCar)).toBe(false)
  })
  it('bot citizens ask for rides when bots are on', () => {
    const w = engineStep(input({ spawn: [A, { lat: 6.625, lng: 73.072, name: 'C' }], dt: 100_000, rand: (() => { let i = 0; return () => [0, 0, 0.9][i++ % 3]! })() }))
    expect(w.some((x) => x.kind === 'newTrip')).toBe(true)
  })
})
