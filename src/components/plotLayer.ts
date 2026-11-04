import L from 'leaflet'

// The Kulhudhuffushi City Council plot chart (the "CAD map": every land plot, coloured by ward),
// stitched from the mapkf.vercel.app tiles at zoom 5 and used with permission. The chart is not
// north-up (its top edge runs south → north), so it can't be a plain L.imageOverlay. This layer
// places one <img> and maps three of its corners onto the map with a CSS matrix.
//
// Corner coordinates come from the same georeference as the place names (scripts/import-places.py,
// normToGeo of (0,0), (1,0) and (0,1)).
const CORNERS = {
  topLeft: L.latLng(6.6093803, 73.060327),
  topRight: L.latLng(6.6361156, 73.0604647),
  bottomLeft: L.latLng(6.6092892, 73.0780002),
}
const SIZE = { w: 5877, h: 3885 }

export class PlotLayer extends L.Layer {
  private img: HTMLImageElement | null = null

  onAdd(map: L.Map) {
    const img = L.DomUtil.create('img', 'leaflet-zoom-hide') as HTMLImageElement
    img.src = `${import.meta.env.BASE_URL}kulhudhuffushi-plots.jpg`
    img.alt = ''
    img.decoding = 'async'
    Object.assign(img.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${SIZE.w}px`,
      height: `${SIZE.h}px`,
      transformOrigin: '0 0',
      opacity: '0.85',
      pointerEvents: 'none',
      maxWidth: 'none',
    })
    map.getPanes().overlayPane.appendChild(img)
    this.img = img
    map.on('zoomend viewreset moveend', this.place, this)
    this.place()
    return this
  }

  onRemove(map: L.Map) {
    map.off('zoomend viewreset moveend', this.place, this)
    this.img?.remove()
    this.img = null
    return this
  }

  private place() {
    const map = this._map
    if (!map || !this.img) return
    const a = map.latLngToLayerPoint(CORNERS.topLeft)
    const b = map.latLngToLayerPoint(CORNERS.topRight)
    const c = map.latLngToLayerPoint(CORNERS.bottomLeft)
    // (0,0) → a, (w,0) → b, (0,h) → c
    const m = [(b.x - a.x) / SIZE.w, (b.y - a.y) / SIZE.w, (c.x - a.x) / SIZE.h, (c.y - a.y) / SIZE.h, a.x, a.y]
    this.img.style.transform = `matrix(${m.join(',')})`
  }
}
