---
title: TaxiQ v2 - Ride Sharing and Live Map Brief
status: idea
created: 2026-11-04
tags: [taxiq, product-brief, maps, real-time]
---

# TaxiQ v2 - Ride Sharing and Live Map Brief

> Feature brief for the existing TaxiQ v2 app (`kudadonbe/TaxiQ`, branch `v2`). Read `CLAUDE.md` first. See also `taxiq-male-map-plan.md`.

## How to use this brief

- **Confirmed** means it came directly from Hussain. Do not change it without asking.
- **Proposed** means it is a suggested interpretation. It can change.
- **Open** means it is undecided. Ask Hussain if it blocks the work; otherwise make the choice easy to change and record it.

Build on the existing stack: React 19, TypeScript, Vite, Tailwind CSS v4, Leaflet, and Firebase (Auth and Firestore). Propose any change to that stack or to the Firestore data model, and wait for Hussain's approval.

## Already in TaxiQ v2

- Live map with rotating car markers. Positions are still simulated (`src/positions.ts`).
- Tap a car to send a direct request, or send a request to the queue (`src/rides.ts`, `src/useRides.ts`).
- Driver screen with Accept and Decline. Offers last 20 seconds.
- Roles: `admin`, `operator`, `driver`, `dev`, and the public.
- English and Dhivehi, with a phone-first layout.
- `publicTaxis/{id}` is the public projection of taxis.

**The main new work:** passenger counts, sharing, private levels and fares, real GPS, and the game-like and city views.

## 1. Summary

Citizens see online taxis on a live map, tap the taxi they want, and request a ride. Rides are shared by default. A passenger can pay more to make a ride private.

**Goal:** Make things easy for everyone: citizens, drivers, and operators.

**Experience references:**
- **GTA and PUBG:** Vehicle interaction that feels very real.
- **SimCity:** A big-picture view of the city.

## 2. Confirmed requirements

| ID | Requirement |
|---|---|
| C1 | A citizen can pick a taxi on the map by tapping it. |
| C2 | A citizen can request a ride from the selected taxi. |
| C3 | Online taxis on the road appear on the map. |
| C4 | Each visible taxi shows how many passengers it has. |
| C5 | Each visible taxi shows whether it can share with other passengers. |
| C6 | When a taxi is hired, sharing with other passengers is allowed by default. |
| C7 | A passenger can ask to make the ride private. |
| C8 | Making a ride private costs the passenger more. |
| C9 | A taxi on a maximum private ride does not appear on the public map. |
| C10 | The product must work well for citizens, drivers, and operators. |

**Regulation check:** Fares follow Ministry pricing, so C6 and C8 may need approval. Keep shared rides and private surcharges behind a setting until confirmed. See `taxiq-multi-center-platform.md`.

## 3. Users (Proposed)

| User | Main need | Main screen |
|---|---|---|
| Citizen | Find and request a suitable taxi quickly | Live map |
| Driver | Go online and handle requests with minimal distraction | Driver mode |
| Operator | Monitor the fleet and spot problems | City view |

In the current app, the operator is call-center staff with the `operator` or `admin` role. Keep that meaning unless Hussain changes it (see Open question 1).

## 4. Core flows (Proposed)

### Citizen
1. Open the map and see nearby online taxis.
2. Tap a taxi to see its passenger count, sharing status, and estimated arrival.
3. Enter a destination and choose a privacy level.
4. Review the fare and send the request.
5. Track the taxi to pickup and through the trip.

### Driver
1. Go online.
2. Receive a request showing pickup, destination, privacy level, and fare.
3. Accept or decline.
4. Mark each step: arrived, picked up, dropped off.
5. Go offline when finished.

### Operator
1. View all online taxis, including hidden private rides.
2. See demand, availability, and problem areas.
3. Look up a driver or trip when needed.

## 5. Privacy levels and map visibility

| Level | New passengers can join | On public map | Price |
|---|---|---|---|
| `shared` (default) | Yes, if seats are free | Yes | Base fare |
| `private` (Proposed) | No | Yes, shown as unavailable | Higher |
| `maximum_private` | No | No | Higher |

Rules:
- Confirmed: `shared` is the default, private costs more, and `maximum_private` hides the taxi from the public map.
- Proposed: The `private` middle level is an assumption. Keep levels configurable so it can be removed (see Open question 2).
- Proposed: Hidden taxis stay visible to their driver, their passengers, and operators.
- Proposed: The public map never shows passenger names, faces, phone numbers, or destinations. It shows only the count.

## 6. Experience requirements (Proposed)

### Close-up view: inspired by GTA and PUBG
- Taxis move smoothly and stay on the road instead of jumping between GPS points.
- Tapping a taxi is easy, even when several are close together.
- Seats and availability appear on or beside the vehicle, like a game HUD.
- Every action gets immediate feedback through animation, sound, or vibration.
- Requesting a ride takes as few steps as possible.

This is inspiration for how the app feels. It should still look like a dependable transport service, and must not copy assets or designs from these games.

### City view: inspired by SimCity
- One live map shows taxis, demand, and traffic across the city.
- Toggleable layers show waiting passengers, taxi shortages, and heavy traffic.
- Busy areas can be highlighted for drivers.
- Later: use trip patterns to inform planning, and simulate changes such as more taxis or new fares.

### Driver safety
- Driver screens use large controls and minimal text.
- Do not require complex interaction while the vehicle is moving.

## 7. Technical notes (Proposed)

Real GPS is delayed and sometimes inaccurate, so the game-like feel depends on these areas:
- **Position updates:** Replace `subscribePositions` in `src/positions.ts` with the real driver feed, and keep the `Position` shape.
- **Smooth motion:** Interpolate between updates and match positions to roads.
- **Stale data:** Remove or mark taxis that stop sending updates.
- **Request conflicts:** Assign seats in a Firestore transaction, with `firestore.rules` enforcing the result, so two passengers cannot take the last seat.
- **Visibility enforcement:** There is no app server, so remove hidden taxis from public data and enforce it in `firestore.rules`. Never send them to public clients and hide them only in the UI. Note that `publicTaxis` is currently kept in sync by admin sessions, so a hidden ride cannot depend on an admin screen being open. Propose a solution, such as a Cloud Function.
- **Location privacy:** Set a retention policy for location history, and stop public tracking when a driver goes offline.

Proposed additions (map these onto the existing `requests`, `taxis`, `publicTaxis`, and `dispatches` collections instead of creating a parallel model):

- `User`: id, role (`citizen`, `driver`, `operator`), contact details
- `Vehicle`: id, driver_id, plate, seat_capacity
- `DriverSession`: driver_id, vehicle_id, online status, last location and timestamp
- `RideRequest`: passenger_id, vehicle_id, pickup, destination, privacy_level, quoted_fare, status
- `Trip`: vehicle_id, privacy_level, status, started_at, ended_at
- `TripPassenger`: trip_id, passenger_id, seats, pickup, dropoff, fare

Status values:

- `RideRequest`: `pending` -> `accepted` | `declined` | `cancelled` | `expired`
- `Trip`: `driver_en_route` -> `arrived` -> `in_progress` -> `completed` | `cancelled`

## 8. Build phases (Proposed)

### Phase 1: Prove the core
- Driver goes online and shares live location, replacing the simulation
- Citizen sees moving taxis, passenger counts, and sharing status
- Keep the existing tap-to-request flow and add the privacy choice
- Driver accepts or declines (exists), then completes the trip
- Shared rides and at least one private level, including map hiding
- Simple, configurable fares

### Phase 2: Make it feel great
- Road-matched smooth movement
- HUD-style vehicle details, feedback, and sound
- Fuller operator live fleet map

### Phase 3: Add the city view
- Demand and traffic layers
- Driver demand hints
- Trip analytics

### Phase 4: Plan and simulate
- Planning reports
- Simulation of fleet size and fare changes

## 9. Phase 1 acceptance criteria (Proposed)

- [ ] An online taxi appears on the citizen map, and an offline taxi disappears.
- [ ] Passenger count and sharing status update without a manual refresh.
- [ ] A citizen can request a specific taxi by tapping it.
- [ ] A new ride is `shared` unless the passenger chooses otherwise.
- [ ] The private fare is shown and is higher than the shared fare before the passenger confirms.
- [ ] A `maximum_private` taxi is absent from public API responses as well as the UI.
- [ ] The driver, passenger, and operator can still see a `maximum_private` trip.
- [ ] A full or private taxi cannot accept new passengers.
- [ ] Two simultaneous requests cannot take the same last seat.
- [ ] No passenger personal details appear on the public map.

## 10. Open questions

1. Is the operator still the taxi center's call-center staff, or will it also include a taxi company, a government authority, or the platform owner?
2. Is there a `private` middle level, or only `shared` and `maximum_private`?
3. How is the private price calculated: a fixed extra, a percentage, or payment for the empty seats?
4. How are shared fares split?
5. How close must a new passenger's route be to the current trip before they can join?
6. Must the current passenger approve a new shared passenger?
7. What happens if a driver declines or does not respond? Should the app suggest another taxi?
8. Which city launches first: Kulhudhuffushi or Malé?
9. How will passengers pay: cash, bank transfer, card, or in-app?
10. Does the phone-first web app remain the only platform, or is a native driver app needed for background GPS?
11. What driver verification and local licensing rules apply, and when will eFaas replace Google sign-in (see `SECURITY.md`)?
12. Should women-only or other passenger preferences be supported on shared rides?

## 11. Out of scope for now

- Advanced simulation
- Automated fleet dispatching
- Game mechanics such as scores or rewards (not requested)

Before real passenger or location data goes live, clear the blockers in `SECURITY.md`.
