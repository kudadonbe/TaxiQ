import { GameCar, gameClock } from '../core/gameSim'
import { ROAD_GRAPH, type Position, type Positions } from '../positions'
import type { Game } from './gameData'

export type PositionSource = (ids: readonly string[], onUpdate: (p: Positions) => void) => () => void

// Game cars on the map. Every device computes the same positions from the game's seed and how long
// it has been running (paused time excluded), so no positions are written to the database.
// In the lobby the cars wait at their starting spots.
export function gamePositionSource(game: Game): PositionSource {
  return (ids, onUpdate) => {
    const cars = new Map(ids.map((id) => [id, new GameCar(ROAD_GRAPH, game.seed, Number(id.replace(/\D/g, '')) || 0)]))
    let frame = 0
    const tick = () => {
      const now = game.status === 'paused' && game.pausedAt ? game.pausedAt : Date.now()
      const elapsed = game.startedAt && game.status !== 'lobby' ? gameClock(game.startedAt, now, game.pausedMs).realSec : 0
      const out = new Map<string, Position>()
      for (const [id, car] of cars) out.set(id, car.at(elapsed))
      onUpdate(out)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }
}
