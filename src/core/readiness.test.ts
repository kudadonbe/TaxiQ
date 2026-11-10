import { describe, expect, it } from 'vitest'
import { readyForRides, rideChecks, type ReadinessInput } from './readiness'

const ALL_OK: ReadinessInput = { approvedVehicle: true, canPrivate: true, availableOn: true, locationOk: true, passengerRide: false }
const failing = (x: ReadinessInput) => rideChecks(x).filter((c) => !c.ok).map((c) => c.id)

describe('rideChecks', () => {
  it('lists the checks in the order to fix them', () => {
    expect(rideChecks(ALL_OK).map((c) => c.id)).toEqual(['vehicle', 'role', 'passenger', 'available', 'location'])
  })

  it('passes everything when all is ready', () => {
    expect(rideChecks(ALL_OK).every((c) => c.ok)).toBe(true)
    expect(failing(ALL_OK)).toEqual([])
  })

  it('fails vehicle without an approved vehicle', () => {
    expect(failing({ ...ALL_OK, approvedVehicle: false })).toEqual(['vehicle'])
  })

  it('fails role without the Private driver role', () => {
    expect(failing({ ...ALL_OK, canPrivate: false })).toEqual(['role'])
  })

  it('fails passenger while their own booking is open', () => {
    expect(failing({ ...ALL_OK, passengerRide: true })).toEqual(['passenger'])
  })

  it('fails available when Available is off', () => {
    expect(failing({ ...ALL_OK, availableOn: false })).toEqual(['available'])
  })

  it('fails location only while Available is on', () => {
    expect(failing({ ...ALL_OK, locationOk: false })).toEqual(['location'])
    // With Available off the location isn't needed yet, so only Available fails.
    expect(failing({ ...ALL_OK, availableOn: false, locationOk: false })).toEqual(['available'])
  })

  it('reports every failing check at once, in order', () => {
    expect(failing({ approvedVehicle: false, canPrivate: false, availableOn: true, locationOk: false, passengerRide: true })).toEqual(['vehicle', 'role', 'passenger', 'location'])
  })
})

describe('readyForRides', () => {
  it('is true only when every check passes', () => {
    expect(readyForRides(ALL_OK)).toBe(true)
    expect(readyForRides({ ...ALL_OK, approvedVehicle: false })).toBe(false)
    expect(readyForRides({ ...ALL_OK, canPrivate: false })).toBe(false)
    expect(readyForRides({ ...ALL_OK, passengerRide: true })).toBe(false)
    expect(readyForRides({ ...ALL_OK, availableOn: false })).toBe(false)
    expect(readyForRides({ ...ALL_OK, locationOk: false })).toBe(false)
  })
})
