import { useEffect, useRef } from 'react'
import { Bus, CarTaxiFront, House, Info, LocateFixed, LocateOff, MapPin, Phone, Route, Shirt, User, UserRound, Wrench, X, type LucideIcon } from 'lucide-react'
import type { FigureMenuAction, FigureMenuHeading } from '../core/figureMenu'

// The tap menu on a figure (a vehicle, a person, a service helper, yourself), shown in a see-through
// MapLibre popup that moves with the figure. Rendered by React into the popup (outside the app's
// providers, so every word comes in as a prop); text only, never HTML strings.

export interface FigureMenuProps {
  heading: FigureMenuHeading
  headingText: string
  title: string
  lines: { text: string; tone?: 'ok' | 'warn' | 'muted' }[]
  buttons: { id: FigureMenuAction; label: string; primary: boolean }[]
  closeLabel: string
  dir: 'ltr' | 'rtl'
  onAction: (id: FigureMenuAction) => void
  onClose: () => void
}

const HEADING_ICONS: Record<FigureMenuHeading, LucideIcon> = { fix: Wrench, tyres: Wrench, battery: Wrench, tow: Wrench, ride: CarTaxiFront, bus: Bus, person: User, you: UserRound, house: House }
const ACTION_ICONS: Record<FigureMenuAction, LucideIcon> = { call: Phone, route: Route, details: Info, hire: CarTaxiFront, follow: LocateFixed, unfollow: LocateOff, changeLook: Shirt, pickup: MapPin }
const TONES = { ok: '#065f46', warn: '#be123c', muted: '#334155' }

export function FigureMenu({ heading, headingText, title, lines, buttons, closeLabel, dir, onAction, onClose }: FigureMenuProps) {
  const box = useRef<HTMLDivElement>(null)
  // Escape closes it; it takes focus so a keyboard user lands in it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    box.current?.focus({ preventScroll: true })
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  const Head = HEADING_ICONS[heading]
  return (
    <div ref={box} role="dialog" aria-label={headingText} tabIndex={-1} dir={dir} className="taxi-menu-body outline-none" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-1.5">
        <Head className="mt-0.5 size-4 shrink-0 text-slate-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="taxi-menu-title" style={{ padding: 0 }}>
            {headingText}
          </p>
          {title && <p className="truncate text-xs font-semibold text-slate-800">{title}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className="-me-1 -mt-1 grid size-10 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-white/60 hover:text-slate-900">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {lines.map((l, i) =>
        l.text ? (
          <p key={i} className="taxi-menu-note" style={{ color: TONES[l.tone ?? 'muted'] }}>
            {l.text}
          </p>
        ) : null,
      )}
      {buttons.map((b) => {
        const Icon = ACTION_ICONS[b.id]
        return (
          <button key={b.id} type="button" onClick={() => onAction(b.id)} className={`taxi-menu-button ${b.primary ? 'primary' : 'plain'} flex items-center gap-2`}>
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {b.label}
          </button>
        )
      })}
    </div>
  )
}
