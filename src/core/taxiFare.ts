// The taxi fare (set by the center's admins in Management -> Taxis: config/fares): a trip price
// plus a price per km of road, never less than the minimum. The passenger sees the total before
// sending the trip, and it is fixed once booked. Pure functions.

export interface FareTable {
  base: number // MVR a trip
  perKm: number // MVR per km
  minimum: number // MVR at least
}

export const validFares = (f: FareTable) =>
  [f.base, f.perKm, f.minimum].every((x) => Number.isFinite(x) && x >= 0 && x <= 10_000)

// The total for `metres` of road, in whole MVR.
export function taxiFare(f: FareTable, metres: number) {
  return Math.max(Math.round(f.minimum), Math.round(f.base + (f.perKm * Math.max(0, metres)) / 1000))
}

// After the driver taps Arrived, the passenger has this long to confirm (or report a problem);
// no answer counts as finished.
export const CONFIRM_FINISH_MINUTES = 10
export const finishDue = (arrivedAt: number, now: number) => !!arrivedAt && now >= arrivedAt + (CONFIRM_FINISH_MINUTES * 60 + 5) * 1000
