---
title: TaxiQ v2 - Multi-Center Platform and Rules
status: idea, regulation-check-needed
created: 2026-11-04
tags: [taxiq, multi-tenant, roles, regulation]
---

# TaxiQ v2 - Multi-Center Platform and Rules

**Goal:** One application for citizens, drivers, and taxi centers. Any center can register and run its own separate queue.

This is not legal advice. Regulation findings come mostly from news reports and a Ministry service list. The Taxi Regulation text itself has not been read.

Labels:
- **Confirmed:** Hussain's decision.
- **Regulation:** Reported rule. Check against the current gazetted text.
- **Proposed:** Suggested design. It can change.

## 1. Confirmed decisions

| ID | Decision |
|---|---|
| M1 | One application serves citizens, drivers, operators, and private and public sector users. |
| M2 | A taxi center can register itself in the app. |
| M3 | A person can log in and request to register as a driver. |
| M4 | A center sees the drivers who applied to it, and chooses whether to accept them. |
| M5 | Each center has its own separate queue. |
| M6 | A center handles subscriptions for its drivers. |
| M7 | A taxi can belong to several centers if the center allows it and the driver wants it, subject to regulation. |
| M8 | After login, a user can switch between acting as a citizen, driver, or operator. |
| M9 | Operator options appear only if a system administrator gave that role, or the user has a physical taxi center. |
| M10 | A driver must have a registered vehicle. |

## 2. Regulation findings

| Finding | Status | Effect on TaxiQ |
|---|---|---|
| A vehicle with a taxi license must be registered with a licensed taxi center. It also needs roadworthiness, third-party insurance, and an annual fee. | Regulation. The report gives the amendment as 17 September but not the year | No independent driver mode for licensed taxis. Track expiry dates |
| The Ministry lists center registration and renewal, driver permits, vehicle permits, their renewals, and **Taxi Center Transfer**. | Regulation. Requirements not listed on that page | Store and verify these permits. **A transfer service may mean a taxi has one registered center at a time. This is an inference and could limit M7** |
| Taxi registration requires proof of a garage. | Regulation, reported 22 September 2024 | Possibly part of vehicle checks. Ask whether TaxiQ needs to record it |
| Fares follow Ministry pricing. For example, MTCC charges MVR 30 within Malé and Hulhumalé. | Reported 19 April 2026. It is unclear how far this binds other taxis | **The private surcharge and shared fare split may need approval. Keep them disabled until confirmed** |
| In 2019, new taxis in the Malé area had to use approved apps: Avas Ride, PickMe, and E'AEE. | Reported 2019. Current status unknown | TaxiQ may need Ministry approval before public use |
| A 2013 rule required a taxi to show its center's name and phone number. | Old. May have been replaced by the 2022 regulation | If still valid, several centers on one taxi creates a display problem |
| The Data Protection Bill reached committee stage in June 2026. | No later result found | Build for consent, breach handling, and retention now. Recheck before launch |

MTCC's government taxi service already operates in the Greater Malé area, with pre-booking, online payment, and digital tracking.

### Still unread or unknown
- The current **Taxi Regulation 2022** and all later amendments.
- [The Sun article on amendments to ease center registration and enable digital service](https://english.sun.mv/102717). It could not be opened from here, and its title suggests it matters directly.
- ePortal requirements for each permit.
- Any rules for sharing a taxi among unrelated passengers.
- Whether the rules differ between Malé and Kulhudhuffushi.

### Questions for the Ministry
Send these to the Ministry of Transport in writing, and check the responsible ministry first, because the sources name different ones:

1. Does a software platform serving several licensed centers need approval or a license?
2. Can one taxi or driver work with more than one center at the same time?
3. Can a taxi carry unrelated passengers on a shared ride, and how may the fare be charged?
4. Can a passenger be charged more for a private ride?
5. Can a center's permit status be verified digitally, and can TaxiQ access that data?
6. Do the fare and app rules apply outside the Greater Malé area?

## 3. Roles

Every user has one account. The switcher only changes the view. **It never grants access.** `firestore.rules` must check every action on the server.

| Act as | Who can use it |
|---|---|
| Citizen | Any signed-in user |
| Driver | Approved driver with an approved vehicle and at least one active center membership |
| Operator | Staff member or owner of an approved center. Choose which center if there are several |
| System admin | Only users assigned by an existing system admin |

Proposed:
- Applying to be a driver does not unlock driver mode. Show an application status screen until approved.
- Show only the options the user has, plus "Apply as driver" and "Register a taxi center".
- A person cannot approve their own center, driver application, or vehicle.
- System admins verify centers. Centers verify their drivers and vehicles.
- Keep the existing `dev` role out of production.

## 4. Main flows (Proposed)

### Register a center
1. A user submits the center name, type (`private` or `government`), location, contact, and license details.
2. A system admin verifies them and approves or rejects the center.
3. The applicant becomes center owner, and can add operators.

### Register a driver
1. A user completes a driver profile: permit, expiry date, and contact details.
2. The user adds a vehicle: plate, seats, permit, insurance, and expiry dates.
3. The user applies to one or more centers.
4. Each center approves or rejects independently, and assigns its own center number.
5. The driver joins the back of that center's queue.

### Run a center
- Operators see only their own center's applicants, queue, dispatches, and subscriptions.
- Suspending a driver applies only in that center. A system admin can block an account platform-wide.

### Book a ride
- **Queue request:** The passenger selects a center, or the app suggests one. The offer goes down that center's queue.
- **Direct request:** The passenger taps a taxi, as now. Record which center receives the dispatch.

## 5. Multi-center rules (Proposed)

- Each vehicle has a `primaryCenterId`, its legally registered center. Additional memberships stay disabled until the Ministry answers question 2.
- A center can set `allowsMultiCenter` to false. Accepting a driver who has another membership is then blocked.
- A vehicle can have only one active trip, across all centers.
- A driver who accepts a ride becomes unavailable in every queue.
- The taxi moves to the back only in the center that dispatched it. In other centers it keeps its place and is skipped while busy.
- A suspension in one center does not change the driver's position elsewhere.
- Expired permits or insurance block the driver from all queues.

## 6. Data model changes (Proposed)

Today TaxiQ assumes one center: `roles/{email}`, `taxis/{id}`, `queue/state`, and `dispatches/{id}`.

| Path | Holds |
|---|---|
| `users/{uid}` | Profile and last-used view |
| `platformRoles/{uid}` | System admin |
| `centers/{centerId}` | Details, type, status, license, `allowsMultiCenter` |
| `centers/{centerId}/staff/{uid}` | `owner` or `operator` |
| `drivers/{uid}` | Driver permit, expiry, status |
| `vehicles/{id}` | Owner, plate, seats, permits, expiry, `primaryCenterId` |
| `centers/{centerId}/memberships/{uid}` | Status, center number, vehicle, suspension |
| `centers/{centerId}/queue/state` | That center's order and answering drivers |
| `centers/{centerId}/dispatches/{id}` | That center's dispatch log |
| `centers/{centerId}/subscriptions/{id}` | Driver, period, status, paid date |
| `requests/{uid}` | Add `centerId` |
| `publicTaxis/{id}` | Add public center details, with no personal data |

Notes:
- `taxiNo`, suspension, and queue position move to the center membership, because each differs per center.
- `useQueue`, `useLiveQueue`, and `firestore.rules` need the most changes.
- Write a rules test suite first. Tenant isolation is the main security risk.
- Write a migration that moves current data into a first center.
- Use `runTransaction` across all affected queues when a ride is accepted, or a Cloud Function if that becomes unreliable.

## 7. Public API

Build the multi-center app first. Firestore rules are not an API for outside systems. Add a versioned API through Cloud Functions, with per-center keys and an audit log, only when a center needs to connect its own software.

## 8. Suggested order

1. **Legal check:** Read the current regulation and get Ministry answers.
2. **Tenant foundation:** Centers, staff, per-center queues, rules tests, and migration.
3. **Role switcher:** Views driven by real permissions.
4. **Registration:** Center and driver applications, and vehicle records.
5. **Center tools:** Applicant review, suspensions, and subscriptions.
6. **Multi-center membership:** Only if allowed.
7. **Sharing and private fares:** Only if allowed.

## 9. Questions for Hussain

1. Subscription: Do drivers pay centers, do centers pay TaxiQ, or both? Should the app only record payments, or also collect them? I assumed only recording, drivers paying centers.
2. Who is the first system admin, and who verifies center licenses?
3. Which public sector users do you mean: a government taxi service, a council, or a regulator with read-only access?
4. If a citizen has no center preference, which center receives a queue request?
5. Does the driver own the vehicle, or can a center or another owner assign it?

## Sources

- [Taxi licenses and center registration (PSM News)](https://www.psmnews.mv/en/144358)
- [Ministry land transport services](https://trade.gov.mv/en/land-transport-services/)
- [Garage letter requirement (Corporate Maldives, 2024)](https://corporatemaldives.com/taxi-registration-policy-updated-to-require-garage-letter/)
- [MTCC fares and booking (The Standard, 2026)](https://standard.mv/mtcc-rolls-out-online-booking-platform-as-male-taxi-line-introduces-fares/)
- [Mobile apps made mandatory (Maldives Independent, 2019)](https://maldivesindependent.com/society/mobile-apps-made-mandatory-for-taxis-147183)
- [Registered taxis exempted (Maldives Independent, 2019)](https://maldivesindependent.com/society/registered-taxis-exempted-from-using-mobile-app-147279)
- [2013 taxi rules (Minivan News archive)](https://minivannewsarchive.com/tag/taxi-regulations)
- [Data Protection Bill, committee stage (MMTV, June 2026)](https://en.mmtv.mv/10387)
- [Malé Taxi Line app](https://apps.apple.com/us/app/mal%C3%A9-taxi-line/id6761259497)
