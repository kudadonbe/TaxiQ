import { Bus, CarFront, CarTaxiFront, Layers, Wrench, type LucideIcon } from 'lucide-react'

// What a map marker is, for the category chips.
export type MarkerKind = 'taxi' | 'private' | 'bus' | 'service' | 'person' | 'center'

export type MapChipId = 'all' | 'taxi' | 'bus' | 'private' | 'services'

type ChipLabel = 'chipAll' | 'chipTaxi' | 'chipBus' | 'chipPrivate' | 'chipServices'

// The category chips on the full-screen maps, in order. One is active at a time; `shows` says which
// markers it keeps on the map. Add future categories (rentals, stays, shops, registries) here.
export const MAP_CHIPS: readonly { id: MapChipId; icon: LucideIcon; label: ChipLabel; shows: (kind: MarkerKind) => boolean }[] = [
  { id: 'all', icon: Layers, label: 'chipAll', shows: () => true },
  { id: 'taxi', icon: CarTaxiFront, label: 'chipTaxi', shows: (k) => k === 'taxi' || k === 'center' }, // taxi centers show with their taxis
  { id: 'bus', icon: Bus, label: 'chipBus', shows: (k) => k === 'bus' },
  { id: 'private', icon: CarFront, label: 'chipPrivate', shows: (k) => k === 'private' },
  { id: 'services', icon: Wrench, label: 'chipServices', shows: (k) => k === 'service' },
]

export const chipShows = (id: MapChipId, kind: MarkerKind) => (MAP_CHIPS.find((c) => c.id === id) ?? MAP_CHIPS[0]!).shows(kind)

const KEY = 'taxiq.mapChip'

// The chip chosen last on this device (anything unknown reads as All).
export function loadChip(): MapChipId {
  try {
    const v = localStorage.getItem(KEY)
    return MAP_CHIPS.find((c) => c.id === v)?.id ?? 'all'
  } catch {
    return 'all'
  }
}

export function saveChip(id: MapChipId) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Storage blocked (private window): the choice lasts until the page closes.
  }
}
