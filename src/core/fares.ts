// TaxiQ Game fares. PLACEHOLDER values until the real Kulhudhuffushi fare table is known
// (plans/game-mode.md §5.1). Change them here only; the game and its tests read them from here.

export const FARES_ARE_PLACEHOLDER = true

export const FARES = {
  base: 20, // MVR when the trip starts
  perKm: 5, // MVR per km driven with the passenger
  minimum: 25, // MVR, the least any trip costs
  night: 10, // MVR extra from 22:00 to 06:00
}

export const isNight = (hh: number) => hh >= 22 || hh < 6

// Fare in whole MVR for a trip of `km` starting at game hour `hh`.
export function fare(km: number, hh: number): number {
  const day = Math.max(FARES.minimum, Math.round(FARES.base + FARES.perKm * Math.max(0, km)))
  return day + (isNight(hh) ? FARES.night : 0)
}
