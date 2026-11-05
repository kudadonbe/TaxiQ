// App icons. Never use emoji in the UI: use Lucide icons (lucide-react, ISC licence), imported from
// 'lucide-react' directly or through the helpers here. Decorative icons are aria-hidden; meaning
// always comes from the text or an aria-label next to them.

import { ArrowRight, Flag, House, Landmark, LandPlot, MapPin, Route, type LucideIcon } from 'lucide-react'
import { ic, icFlip } from './iconStyles'
import type { PlaceType } from '../places'

const PLACE_ICONS: Record<PlaceType, LucideIcon> = { h: House, r: Route, l: Landmark, p: LandPlot }

// The icon for a place type in the house search: house, road, landmark or plot.
export function PlaceTypeIcon({ type, className = 'size-4 shrink-0 text-slate-400' }: { type: PlaceType; className?: string }) {
  const Icon = PLACE_ICONS[type]
  return <Icon className={className} aria-hidden="true" />
}

// "Pickup → destination" on one line, arrow mirrored in Dhivehi.
export function TripLine({ from, to, flag = true }: { from: string; to: string; flag?: boolean }) {
  return (
    <>
      <MapPin className={`${ic} text-emerald-600`} aria-hidden="true" /> <bdi>{from || '—'}</bdi> <ArrowRight className={`${icFlip} text-slate-400`} aria-hidden="true" />{' '}
      {flag && <Flag className={`${ic} text-rose-600`} aria-hidden="true" />} <bdi>{to || '—'}</bdi>
    </>
  )
}
