// "Can I take rides?": the conditions a person must meet to receive private-hire rides, each with
// its own fix (My account, and the admin's view of a person in Management -> Users). Pure.

export type CheckId = 'vehicle' | 'role' | 'available' | 'location' | 'passenger'
export interface Check {
  id: CheckId
  ok: boolean
}
export interface ReadinessInput {
  approvedVehicle: boolean // has at least one approved vehicle
  canPrivate: boolean // Private driver role (or developer, or a driver also allowed private hire)
  availableOn: boolean // Available is switched on for one of their vehicles
  locationOk: boolean // the phone is sending its location (no location error while available)
  passengerRide: boolean // they have their own passenger booking still open
}

// In the order a person should fix them.
export function rideChecks(x: ReadinessInput): Check[] {
  return [
    { id: 'vehicle', ok: x.approvedVehicle },
    { id: 'role', ok: x.canPrivate },
    { id: 'passenger', ok: !x.passengerRide },
    { id: 'available', ok: x.availableOn },
    { id: 'location', ok: !x.availableOn || x.locationOk },
  ]
}
export const readyForRides = (x: ReadinessInput) => rideChecks(x).every((c) => c.ok)
