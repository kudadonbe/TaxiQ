import type { FeatureCollection, Polygon } from 'geojson'

// The Kulhudhuffushi City Council plot chart redrawn as vector polygons (src/data/plots.json, built
// by scripts/build-plots.py from the chart on mapkf.vercel.app, used with permission). Drawn by
// MapLibre as a GeoJSON fill layer, so it stays sharp at any zoom and rotates with the map; each
// plot knows the houses on it.

export interface Plot {
  c: string // ward fill colour
  p: [number, number][] // outline, lat/lng
  h?: [string, string][] // houses on the plot: [English, Dhivehi]
  pl?: string // plot number
}

let cache: Promise<Plot[]> | null = null
export function loadPlots(): Promise<Plot[]> {
  cache ??= import('../data/plots.json').then((m) => m.default as Plot[])
  return cache
}

// GeoJSON for MapLibre (lng/lat order, closed rings). `i` points back into the plots array.
export function plotsGeoJSON(plots: Plot[]): FeatureCollection<Polygon, { c: string; i: number }> {
  return {
    type: 'FeatureCollection',
    features: plots.map((plot, i) => {
      const ring = plot.p.map(([lat, lng]) => [lng, lat])
      ring.push(ring[0]!)
      return { type: 'Feature', properties: { c: plot.c, i }, geometry: { type: 'Polygon', coordinates: [ring] } }
    }),
  }
}

// Popup content for a tapped plot. Built with DOM text nodes only: names come from data, never
// parsed as HTML.
export function plotPopup(plot: Plot, lang: 'en' | 'dv', plotWord: string): HTMLElement | null {
  if (!plot.h && !plot.pl) return null
  const el = document.createElement('div')
  el.dir = lang === 'dv' ? 'rtl' : 'ltr'
  for (const [en, dv] of plot.h ?? []) {
    const line = document.createElement('div')
    line.style.fontWeight = '700'
    line.textContent = lang === 'dv' && dv ? dv : en
    el.append(line)
    const sub = document.createElement('div')
    sub.style.cssText = 'font-size:11px;color:#64748b'
    sub.textContent = lang === 'dv' ? en : dv
    if (sub.textContent) el.append(sub)
  }
  if (plot.pl) {
    const no = document.createElement('div')
    no.style.cssText = 'margin-top:4px;font-size:12px;color:#b91c1c;font-weight:600'
    no.textContent = `${plotWord} ${plot.pl}`
    el.append(no)
  }
  return el
}
