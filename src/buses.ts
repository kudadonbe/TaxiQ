import { useEffect, useState } from 'react'

// MTCC RTL buses (Greater Malé): routes and live GPS positions from RTL's own public feed, the one the
// RTL app uses (no login or key, served with Access-Control-Allow-Origin: *). It is not a documented
// API with published terms, so we are a polite guest: only while the map is open, visible and in the
// Greater Malé area; one request a second at most (15 routes every 15 s); nothing is stored. Credit:
// "Bus positions: RTL (MTCC)". v3 should fetch it once on the server for everyone.

const API = 'https://bo.rtl.mv:4455/maldives/api'
export const BUS_POLL_MS = 15_000 // RTL's positions move on about an 11 s cycle

export interface BusRoute {
  code: string
  number: string // e.g. R1
  name: string
  nameDv: string
  colour: string // e.g. #e9222a
  stops: { name: string; nameDv: string; at: [number, number] }[] // in route order
}
export interface Bus {
  id: string // the bus code (also its plate)
  plate: string
  route: BusRoute
  at: [number, number]
}

let routesCache: Promise<BusRoute[]> | null = null
export function loadBusRoutes(): Promise<BusRoute[]> {
  routesCache ??= fetch(`${API}/booking/v2/bus/routedetails`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d: { routeResponse?: unknown }) => {
      const list = Array.isArray(d.routeResponse) ? d.routeResponse : []
      return list.flatMap((x: Record<string, unknown>) => {
        const code = typeof x.code === 'string' ? x.code : ''
        if (!code) return []
        const colour = typeof x.color === 'string' && /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : '#0f766e'
        const stops = (Array.isArray(x.busRouteStopList) ? x.busRouteStopList : [])
          .map((st: Record<string, unknown>) => ({ order: Number(st.order), name: String(st.name ?? '').slice(0, 60), nameDv: String(st.dvname ?? '').slice(0, 60), at: [Number(st.latitude), Number(st.longitude)] as [number, number] }))
          .filter((st) => Number.isFinite(st.order) && st.at.every(Number.isFinite))
          .sort((a, b) => a.order - b.order)
          .map(({ name, nameDv, at }) => ({ name, nameDv, at }))
        return [{ code, number: String(x.routeNumber ?? '').slice(0, 6), name: String(x.name ?? '').slice(0, 60), nameDv: String(x.dvname ?? '').slice(0, 60), colour, stops }]
      })
    })
    .catch(() => {
      routesCache = null // try again next time
      return []
    })
  return routesCache
}

async function liveOn(route: BusRoute, signal: AbortSignal): Promise<Bus[]> {
  const r = await fetch(`${API}/booking/v1/bus/livecoordinates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routeCode: route.code }), signal })
  if (!r.ok) return []
  const d = (await r.json()) as { busList?: unknown }
  return (Array.isArray(d.busList) ? d.busList : []).flatMap((b: Record<string, unknown>) => {
    const lat = b.latitude
    const lng = b.longitude
    const id = typeof b.busCode === 'string' ? b.busCode.slice(0, 20) : ''
    if (!id || typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return []
    return [{ id, plate: typeof b.plateNumber === 'string' ? b.plateNumber.slice(0, 20) : id, route, at: [lat, lng] as [number, number] }]
  })
}

// Live buses while `enabled` (the map is open in the Greater Malé area) and the tab is visible.
// Routes are asked one after another, a second apart, every BUS_POLL_MS.
export function useLiveBuses(enabled: boolean): Bus[] {
  const [buses, setBuses] = useState<Map<string, Bus>>(() => new Map())
  useEffect(() => {
    if (!enabled) return
    const ctl = new AbortController()
    let stopped = false
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    void (async () => {
      const routes = await loadBusRoutes()
      while (!stopped) {
        if (document.visibilityState === 'visible') {
          const seen = new Map<string, Bus>()
          for (const route of routes) {
            if (stopped) return
            try {
              for (const b of await liveOn(route, ctl.signal)) seen.set(b.id, b)
            } catch {
              // One route failing (or a blocked port 4455) shouldn't stop the others.
            }
            await wait(Math.max(300, BUS_POLL_MS / Math.max(1, routes.length)))
          }
          if (!stopped) setBuses(seen)
        } else await wait(2000)
      }
    })()
    return () => {
      stopped = true
      ctl.abort()
    }
  }, [enabled])
  return enabled ? [...buses.values()] : []
}
