export interface Driver {
  id: string
  name: string
  nameDv: string
  phone: string
}

export type SuspendReason = 'conduct' | 'fees' | 'other'

// A suspended taxi keeps its place in the queue (like the physical tag flipped to red) but can't
// answer calls or be assigned until the suspension is lifted.
export interface Suspension {
  reason: SuspendReason
  note: string
  at: number
}

export interface Taxi {
  id: string
  taxiNo: string
  taxiReg: string
  driver: Driver
  // Passenger seats (1-15). 7 or more is a 7-10 seat taxi, with its own official fares in Greater
  // Malé (src/core/zoneFares.ts). Older records have none: 4.
  seats?: number
  // The same vehicle offered for private hire (vehicles/{id}): while it is on the private map, the
  // taxi gets no queue offers (one at a time).
  vehicleId?: string
  centerId?: string // its taxi center (src/centers.ts); none = the first center
  suspended?: Suspension
}
export const seatsOf = (t: Pick<Taxi, 'seats'>) => t.seats ?? 4
export const isLargeTaxi = (t: Pick<Taxi, 'seats'>) => seatsOf(t) >= 7

// Passenger details for a call. Held in memory only (never written to localStorage): it is personal
// data and there is no authenticated backend yet.
export interface CallInfo {
  pickup: string
  pickupAt?: [number, number] // set when the pickup was chosen from the place search
  destinationAt?: [number, number] // same for the destination (used to draw the route)
  destination: string
  phone: string
  note: string
}
