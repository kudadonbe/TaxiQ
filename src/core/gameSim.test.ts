import { describe, expect, it } from 'vitest'
import { GameCar, gameClock, isJoinCode, newJoinCode, PRESETS, rng } from './gameSim'
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

describe('shared game world', () => {
  it('every device gets the same car position for the same game and time', () => {
    const a = new GameCar(g, 'game-1', 7)
    const b = new GameCar(g, 'game-1', 7)
    for (const t of [0, 5, 60, 600, 3600]) expect(a.at(t)).toEqual(b.at(t))
  })
  it('stepping forward bit by bit matches jumping straight there', () => {
    const steady = new GameCar(g, 'game-1', 3)
    for (let t = 0; t <= 900; t += 0.5) steady.at(t)
    const jump = new GameCar(g, 'game-1', 3)
    expect(steady.at(900)).toEqual(jump.at(900))
  })
  it('handles time going backwards (a reload) by starting over', () => {
    const c = new GameCar(g, 'game-1', 3)
    const early = c.at(10)
    c.at(500)
    expect(c.at(10)).toEqual(early)
  })
  it('different games and cars drive differently', () => {
    const poses = new Set([1, 2, 3, 4, 5, 6].map((n) => JSON.stringify(new GameCar(g, 'game-2', n).at(300))))
    expect(poses.size).toBeGreaterThan(1)
  })
  it('stays on the roads', () => {
    const c = new GameCar(g, 'game-3', 1)
    for (let t = 0; t < 2000; t += 37) {
      const p = c.at(t)
      expect(p.lat).toBeGreaterThanOrEqual(6.62 - 1e-9)
      expect(p.lat).toBeLessThanOrEqual(6.6215 + 1e-9)
    }
  })
})

describe('game clock', () => {
  it('runs 1 real minute = 1 game hour, from 06:00 on day 1', () => {
    expect(gameClock(0, 0)).toMatchObject({ day: 1, hh: 6, mm: 0 })
    expect(gameClock(0, 60_000)).toMatchObject({ day: 1, hh: 7, mm: 0 })
    expect(gameClock(0, 24 * 60_000)).toMatchObject({ day: 2, hh: 6, mm: 0 })
  })
  it('does not count paused time', () => {
    expect(gameClock(0, 120_000, 60_000)).toMatchObject({ hh: 7, mm: 0 })
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
