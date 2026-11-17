// One tap menu for every figure on the map (3D figures and the flat drawings alike): what it asks
// ("Need a ride?", "Need a fix?", "That's you") and which buttons it offers, from what was tapped.
// Pure, so the choices are testable; MapView fills in the words and wires the buttons.

import type { ServiceKind } from './services'

export type FigureMenuHeading = 'fix' | 'tyres' | 'battery' | 'tow' | 'ride' | 'bus' | 'person' | 'you'
export type FigureMenuAction = 'call' | 'route' | 'details' | 'hire' | 'follow' | 'unfollow' | 'changeLook'

export type FigureSubject =
  // A service: a mobile helper (drawn as a mechanic or delivery rider) or a fixed place.
  | { kind: 'service'; kinds: readonly ServiceKind[]; phone: string; canRoute: boolean }
  // A private vehicle for hire (or its driver). `canHire`: hiring is possible on this screen today.
  // `available`: the viewer is on the map as their own vehicle (then they can't hire).
  | { kind: 'vehicle'; mine: boolean; canHire: boolean; available: boolean; followed: boolean }
  | { kind: 'taxi'; suspended: boolean; canHire: boolean; available: boolean; followed: boolean }
  | { kind: 'bus'; followed: boolean }
  // Someone sharing their location (Show me): Follow only, never an offer.
  | { kind: 'person'; followed: boolean }
  // The viewer's own avatar.
  | { kind: 'me'; canChangeLook: boolean }

export interface FigureMenuButton {
  id: FigureMenuAction
  primary: boolean
}
export interface FigureMenuContent {
  heading: FigureMenuHeading
  buttons: FigureMenuButton[]
}

// "Need tyres?" and the like for the first kind; a general "Need a fix?" for the rest.
export function serviceHeading(kinds: readonly ServiceKind[]): FigureMenuHeading {
  const k = kinds[0]
  return k === 'tyre' ? 'tyres' : k === 'battery' ? 'battery' : k === 'towing' ? 'tow' : 'fix'
}

const PHONE = /^\d{7}$/
const follow = (followed: boolean): FigureMenuButton => ({ id: followed ? 'unfollow' : 'follow', primary: false })

export function figureMenu(s: FigureSubject): FigureMenuContent {
  switch (s.kind) {
    case 'service': {
      const buttons: FigureMenuButton[] = []
      if (PHONE.test(s.phone)) buttons.push({ id: 'call', primary: true })
      if (s.canRoute) buttons.push({ id: 'route', primary: false })
      buttons.push({ id: 'details', primary: false })
      return { heading: serviceHeading(s.kinds), buttons }
    }
    case 'vehicle': {
      const buttons: FigureMenuButton[] = []
      if (s.canHire && !s.mine && !s.available) buttons.push({ id: 'hire', primary: true })
      buttons.push(follow(s.followed))
      return { heading: 'ride', buttons }
    }
    case 'taxi': {
      const buttons: FigureMenuButton[] = []
      if (s.canHire && !s.suspended && !s.available) buttons.push({ id: 'hire', primary: true })
      buttons.push(follow(s.followed))
      return { heading: 'ride', buttons }
    }
    case 'bus':
      return { heading: 'bus', buttons: [follow(s.followed)] }
    case 'person':
      return { heading: 'person', buttons: [follow(s.followed)] }
    case 'me':
      return { heading: 'you', buttons: s.canChangeLook ? [{ id: 'changeLook', primary: false }] : [] }
  }
}

// Only the first name of a name the viewer already has (never more than that in a menu).
export function firstName(name: string | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

// Tapping a 3D figure: each figure on screen as a short upright line from where it stands (`base`,
// screen px) to the top of the model (`top`), with a reach of `r` px around it (a vehicle's half
// length). The nearest one within its reach (at least `radius`) is the one tapped; none: null.
export interface FigureHitCandidate {
  id: string
  base: [number, number]
  top: [number, number]
  r: number
}
export function hitFigure(cands: Iterable<FigureHitCandidate>, at: [number, number], radius = 24): string | null {
  let best: string | null = null
  let bestD = Infinity
  for (const c of cands) {
    const d = toSegment(at, c.base, c.top)
    if (d <= Math.max(radius, c.r) && d < bestD) {
      bestD = d
      best = c.id
    }
  }
  return best
}

function toSegment(p: [number, number], a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = dx * dx + dy * dy
  const t = len > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}
