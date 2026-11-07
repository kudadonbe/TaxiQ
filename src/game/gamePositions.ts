import { defaultCar, type CarDoc } from '../core/gameEngine'
import { CarRunner } from '../core/gameSim'
import { inLane } from '../core/lanes'
import { ROAD_GRAPH, type Position, type Positions } from '../positions'
import { simNow, type Game } from './gameData'

export type PositionSource = (ids: readonly string[], onUpdate: (p: Positions) => void) => () => void

// Game cars on the map. Every device computes the same positions from each car's plan and the game
// time, so no positions are written to the database. Car ids are `car-<n>`.
export function gamePositionSource(game: Game, getCars: () => ReadonlyMap<number, CarDoc>): PositionSource {
  return (ids, onUpdate) => {
    const runners = new Map<number, { plan: CarDoc['plan']; runner: CarRunner }>()
    const defaults = new Map<number, CarDoc['plan']>()
    let frame = 0
    const tick = () => {
      const t = simNow(game)
      const out = new Map<string, Position>()
      for (const id of ids) {
        const n = Number(id.replace(/\D/g, '')) || 0
        let plan = getCars().get(n)?.plan ?? defaults.get(n)
        if (!plan) defaults.set(n, (plan = defaultCar(ROAD_GRAPH, game.seed, n).plan))
        let r = runners.get(n)
        // Same plan object until the car's doc changes, so the runner keeps its progress.
        if (!r || r.plan !== plan) runners.set(n, (r = { plan, runner: new CarRunner(ROAD_GRAPH, game.seed, n, plan) }))
        // Keep left on two-way roads, like real traffic in the Maldives.
        const p = r.runner.at(t)
        const [lat, lng] = inLane(p.lat, p.lng, p.heading, p.twoWay ?? false)
        out.set(id, { lat, lng, heading: p.heading })
      }
      onUpdate(out)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }
}
