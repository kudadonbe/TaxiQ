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
  suspended?: Suspension
}

// Passenger details for a call. Held in memory only (never written to localStorage): it is personal
// data and there is no authenticated backend yet.
export interface CallInfo {
  pickup: string
  pickupAt?: [number, number] // set when the pickup was chosen from the place search
  destination: string
  phone: string
  note: string
}
