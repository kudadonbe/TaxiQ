import L from 'leaflet'

// The Kulhudhuffushi City Council plot chart redrawn as vector polygons (src/data/plots.json, built
// by scripts/build-plots.py from the chart on mapkf.vercel.app, used with permission). Vector
// shapes stay sharp at any zoom, and each plot knows the houses on it.

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

interface Options {
  lang: 'en' | 'dv'
  plotWord: string
}

// Canvas-rendered so 3,400 polygons pan and zoom smoothly. Tapping a plot shows its houses.
export function createPlotLayer(plots: Plot[], { lang, plotWord }: Options): L.LayerGroup {
  const renderer = L.canvas({ padding: 0.3 })
  const group = L.layerGroup()
  for (const plot of plots) {
    const poly = L.polygon(plot.p, {
      renderer,
      color: '#1f2937',
      weight: 0.8,
      fillColor: plot.c,
      fillOpacity: 0.95,
      interactive: !!plot.h || !!plot.pl,
    })
    if (plot.h || plot.pl) {
      // Built with DOM text nodes only: names come from data, never parsed as HTML.
      poly.bindPopup(() => {
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
      })
    }
    group.addLayer(poly)
  }
  return group
}
