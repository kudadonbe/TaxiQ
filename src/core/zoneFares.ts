// The government's taxi fares for Greater Malé (Ministry of Transport and Civil Aviation, in force
// from 20 May 2024): a flat fare per trip by zone, not per km. Drivers may not charge more. Outside
// these zones the center's own fare table applies (src/core/taxiFare.ts). Pure functions.
//
// Zones: Malé, Hulhulé (Velana airport), Hulhumalé Phase 1 and Phase 2. The boxes come from our place
// data (src/data/places-male.json); the Phase 1 / Phase 2 border is the line that splits HDC's lots
// (Phase 1 lots are numbered 1xxxx, Phase 2 lots 2xxxx) with no errors. Villimalé is not in the
// published list.

export type Zone = 'male' | 'airport' | 'hulhumale1' | 'hulhumale2'
export type SeatClass = 'small' | 'large' // under 6 seats; 7-10 seats

export const ZONE_FARES_SOURCE = 'Ministry of Transport and Civil Aviation, 20 May 2024'

export function zoneOf(p: readonly [number, number]): Zone | null {
  const [lat, lng] = p
  if (lat >= 4.166 && lat <= 4.1825 && lng >= 73.497 && lng <= 73.524) return 'male'
  if (lat > 4.1825 && lat <= 4.206 && lng >= 73.519 && lng < 73.5335) return 'airport'
  if (lat > 4.1825 && lat <= 4.2005 && lng >= 73.519 && lng <= 73.54) return 'airport'
  if (lat >= 4.2 && lat <= 4.246 && lng >= 73.5335 && lng <= 73.557) {
    return lat > 4.2237 - 0.45 * (lng - 73.54) ? 'hulhumale2' : 'hulhumale1'
  }
  return null
}

// MVR for each pair of zones (either way), [under 6 seats, 7-10 seats].
const FARES: Record<string, [number, number]> = {
  'male-male': [30, 45],
  'hulhumale1-hulhumale1': [30, 45],
  'hulhumale2-hulhumale2': [30, 45],
  'hulhumale1-hulhumale2': [40, 60],
  'hulhumale1-male': [85, 130],
  'hulhumale2-male': [100, 155],
  'airport-male': [70, 110],
  'airport-hulhumale1': [80, 125],
  'airport-hulhumale2': [85, 130],
}

// The official fare for a trip, or null when either end is outside the zones (or the pair has no
// published fare, such as within the airport).
export function zoneFare(from: readonly [number, number], to: readonly [number, number], seats: SeatClass = 'small'): number | null {
  const a = zoneOf(from)
  const b = zoneOf(to)
  if (!a || !b) return null
  const f = FARES[[a, b].sort().join('-')]
  return f ? f[seats === 'large' ? 1 : 0] : null
}

// Extras the regulation allows: the domestic terminal, and luggage over three pieces (7-10 seats).
export const DOMESTIC_TERMINAL_EXTRA: Record<SeatClass, number> = { small: 10, large: 15 }
export const LARGE_LUGGAGE_EXTRA_PER_PIECE = 5
