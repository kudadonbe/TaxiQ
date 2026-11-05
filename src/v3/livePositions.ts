import { glideAt, isStale, startGlide, type Drawn, type Glide } from '../core/motion'
import type { Position, Positions } from '../positions'
import { apiCall } from './api'

// Real GPS for the map (Phase 5). Polls a center's public positions and glides each car between
// fixes every animation frame. Taxis that are offline or stale are left out, so the map hides them.
// Same shape as the simulated feed in src/positions.ts, so MapView doesn't care which it gets.

export type PositionSource = (ids: readonly string[], onUpdate: (p: Positions) => void) => () => void

interface ApiPosition {
  membershipId: string
  lat: number
  lng: number
  heading: number | null
  atMs: number
}

const POLL_MS = 3000

export function apiPositionSource(centerId: string): PositionSource {
  return (ids, onUpdate) => {
    const wanted = new Set(ids)
    const glides = new Map<string, Glide & { lastFix: number }>()
    const drawn = new Map<string, Drawn>()
    let staleMs = 120_000
    let stopped = false
    let frame = 0

    const poll = async () => {
      try {
        const r = await apiCall<{ positions: ApiPosition[]; staleAfterSeconds: number }>(null, 'GET', `/v1/centers/${centerId}/positions`)
        staleMs = r.staleAfterSeconds * 1000
        const now = performance.now()
        const seen = new Set<string>()
        for (const p of r.positions) {
          if (!wanted.has(p.membershipId)) continue
          seen.add(p.membershipId)
          const prev = glides.get(p.membershipId)
          if (prev && prev.lastFix === p.atMs) continue // same fix as before
          const { glide } = startGlide(drawn.get(p.membershipId) ?? null, { lat: p.lat, lng: p.lng, heading: p.heading, at: p.atMs }, now, POLL_MS)
          glides.set(p.membershipId, { ...glide, lastFix: p.atMs })
        }
        // Offline taxis drop out of the feed: forget them so the map hides them.
        for (const id of glides.keys()) {
          if (!seen.has(id)) {
            glides.delete(id)
            drawn.delete(id)
          }
        }
      } catch {
        // Network hiccup: keep the last known positions until they go stale.
      }
    }

    const tick = () => {
      const now = performance.now()
      const out = new Map<string, Position>()
      for (const [id, g] of glides) {
        if (isStale(g.lastFix, Date.now(), staleMs)) continue
        const d = glideAt(g, now)
        drawn.set(id, d)
        out.set(id, { lat: d.lat, lng: d.lng, heading: d.heading })
      }
      onUpdate(out)
      if (!stopped) frame = requestAnimationFrame(tick)
    }

    void poll()
    const timer = setInterval(() => void poll(), POLL_MS)
    frame = requestAnimationFrame(tick)
    return () => {
      stopped = true
      clearInterval(timer)
      cancelAnimationFrame(frame)
    }
  }
}
