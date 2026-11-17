// The look this person chose for the 3D map (Show me on the map), remembered on this device only.
// MapView reads it to draw the viewer's own avatar where MapLibre's blue dot was; nothing is sent
// anywhere from here (Show me on the map writes it with the position only while they share).

import { lookColourOf, lookOf, type PersonLook } from './core/presence'

const LOOK_KEY = 'taxiq.look'
const EVENT = 'taxiq:look'

export interface MyLook {
  look: PersonLook
  colour: number
}

export function loadMyLook(): MyLook {
  try {
    const x = JSON.parse(localStorage.getItem(LOOK_KEY) ?? '{}') as { look?: unknown; colour?: unknown }
    return { look: lookOf(x.look), colour: lookColourOf(x.colour) }
  } catch {
    return { look: 'plain', colour: 0 }
  }
}

export function saveMyLook(next: MyLook) {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(next))
  } catch {
    // private window: kept for this visit only
  }
  window.dispatchEvent(new CustomEvent<MyLook>(EVENT, { detail: next }))
}

// Called with the new look whenever it changes on this device (this tab).
export function onMyLook(cb: (l: MyLook) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<MyLook>).detail)
  window.addEventListener(EVENT, h)
  return () => window.removeEventListener(EVENT, h)
}
