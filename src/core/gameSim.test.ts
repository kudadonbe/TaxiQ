import { describe, expect, it } from 'vitest'
import { CarRunner, clockAt, gameClock, initialPlan, isJoinCode, newJoinCode, PRESETS, rng, type CarPlan } from './gameSim'
import type { RoadGraph } from './route'

// A small loop of roads with a branch.
const g: RoadGraph = {
  nodes: [
    [6.62, 73.07],
    [6.62, 73.071],
    [6.621, 73.071],
    [6.621, 73.07],
    [6.6215, 73.0705],
  ],
  next: [[1, 3], [0, 2], [1, 3, 4], [2, 0], [2]],
}
const roam: CarPlan = { k: 'roam', n: 0, t0: 0, v: 7 }

describe('shared game world', () => {
  it('every device gets the same car position for the same plan and time', () => {
    const a = new CarRunner(g, 'game-1', 7, roam)
    const b = new CarRunner(g, 'game-1', 7, roam)
    for (const t of [0, 5, 60, 600, 3600]) expect(a.at(t)).toEqual(b.at(t))
  })
  it('stepping forward bit by bit matches jumping straight there', () => {
    const steady = new CarRunner(g, 'game-1', 3, roam)
    for (let t = 0; t <= 900; t += 0.5) steady.at(t)
    expect(steady.at(900)).toEqual(new CarRunner(g, 'game-1', 3, roam).at(900))
  })
  it('handles time going backwards (a reload) by starting over', () => {
    const c = new CarRunner(g, 'game-1', 3, roam)
    const early = c.at(10)
    c.at(500)
    expect(c.at(10)).toEqual(early)
  })
  it('different games and cars start in different places', () => {
    const plans = new Set([1, 2, 3, 4, 5, 6].map((n) => JSON.stringify(initialPlan(g, 'game-2', n))))
    expect(plans.size).toBeGreaterThan(1)
  })
  it('stays on the roads', () => {
    const c = new CarRunner(g, 'game-3', 1, roam)
    for (let t = 0; t < 2000; t += 37) {
      const p = c.at(t)
      expect(p.lat).toBeGreaterThanOrEqual(6.62 - 1e-9)
      expect(p.lat).toBeLessThanOrEqual(6.6215 + 1e-9)
    }
  })
  it('follows a path plan and parks at its end', () => {
    const path: CarPlan = { k: 'path', p: [6.62, 73.07, 6.62, 73.071], t0: 100, v: 10 }
    const c = new CarRunner(g, 'x', 1, path)
    expect(c.at(50)).toMatchObject({ lat: 6.62, lng: 73.07 })
    expect(c.at(105).lng).toBeGreaterThan(73.07)
    expect(c.at(10_000)).toMatchObject({ lat: 6.62, lng: 73.071 })
  })
})

describe('game clock', () => {
  it('runs 1 real minute = 6 game minutes, from 06:00 on day 1', () => {
    expect(gameClock(0, 0)).toMatchObject({ day: 1, hh: 6, mm: 0 })
    expect(gameClock(0, 10 * 60_000)).toMatchObject({ day: 1, hh: 7, mm: 0 })
    expect(gameClock(0, 240 * 60_000)).toMatchObject({ day: 2, hh: 6, mm: 0 })
  })
  it('does not count paused time', () => {
    expect(gameClock(0, 20 * 60_000, 10 * 60_000)).toMatchObject({ hh: 7, mm: 0 })
  })
  it('turns game seconds into day and time', () => {
    expect(clockAt(3600)).toEqual({ day: 1, hh: 7, mm: 0 })
  })
})

describe('join codes and presets', () => {
  it('makes 6-character codes without look-alike letters', () => {
    const r = rng(42)
    for (let i = 0; i < 200; i++) expect(isJoinCode(newJoinCode(r))).toBe(true)
    expect(isJoinCode('ABC1O0')).toBe(false)
  })
  it('has the Standard preset from the design', () => {
    expect(PRESETS.standard).toEqual({ maxPlayers: 8, cars: 20, centers: 2, bankCapitalMvr: 6_000_000 })
  })
})

describe('world roster', async () => {
  const { makeRoster } = await import('./gameNames')
  it('is the same every time for the same world, with one driver per car', () => {
    expect(makeRoster('w', 20, 2)).toEqual(makeRoster('w', 20, 2))
    const r = makeRoster('w', 20, 2)
    expect(r.drivers).toHaveLength(20)
    expect(r.centers).toHaveLength(2)
    expect(r.drivers.every((n) => n.e.split(' ').length === 2 && n.d.length > 0)).toBe(true)
  })
})
