// Switches the 3D houses (./layer.ts) on and off for a map: on TaxiQ's own map, in 3D view, from
// zoom 17 (below it, and in 2D, the world style draws the same houses as simple blocks). The layer
// (and three.js) is downloaded the first time it's needed, then stays on the map and is switched.

import { useEffect, useRef, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { HOUSES3D_MIN_ZOOM } from '../core/houseTiles'
import type { HousesLayer } from './layer'

export function useHouses3d(map: MlMap | null, ready: boolean, ownMap3d: boolean, night: boolean) {
  const layer = useRef<HousesLayer | null>(null)
  const [zoomed, setZoomed] = useState(false)
  useEffect(() => {
    if (!map || !ready) return
    const z = () => setZoomed(map.getZoom() >= HOUSES3D_MIN_ZOOM)
    z()
    map.on('zoom', z)
    return () => {
      map.off('zoom', z)
    }
  }, [map, ready])

  const on = ownMap3d && zoomed
  useEffect(() => {
    if (!map || !ready) return
    if (!on) {
      layer.current?.setEnabled(false)
      return
    }
    let live = true
    const start = (l: HousesLayer) => {
      l.setNight(night)
      l.setEnabled(true)
    }
    if (layer.current) start(layer.current)
    else
      void import('./layer').then(({ createHousesLayer }) => {
        if (!live || layer.current) return
        const l = createHousesLayer()
        layer.current = l
        // Under the 3D figures when they're there (both share the depth buffer either way).
        map.addLayer(l, map.getLayer('figures-3d') ? 'figures-3d' : undefined)
        start(l)
      })
    return () => {
      live = false
    }
  }, [map, ready, on, night])
}
