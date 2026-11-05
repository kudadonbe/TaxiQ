# TaxiQ product direction: two sides, then any land vehicle

Status: direction from Hussain, 2026-11-05. Design notes for review; nothing is built yet.

## 1. Two sides, in the app and in the game

| | **Public service (taxi)** | **Private hire** |
|---|---|---|
| Who provides it | Licensed taxis belonging to a **center** | **People and companies** offering their own vehicles |
| How a ride is matched | The center's **queue**: the operator calls on the radio, offers go in queue order (what TaxiQ does today) | The rider picks a listed vehicle, or sends a request that nearby private-hire vehicles can take |
| Price | The **official fare table** | Set by the provider (shown before booking), within any rules the authority sets |
| Who runs it | The center (owner, operators) | Each provider manages their own vehicles, hours and prices |
| On the map | Taxis (as now) | Private-hire vehicles, marked differently, with their price |

Both sides share the same pieces: sign-in, the map and places, routes, trip records, ratings and the
driver app. A rider sees both and chooses, for example "Taxi (fare MVR 25)" or "Private: Ali's van
(MVR 40)".

**In TaxiQ Game:** the same two sides. Taxi drivers work through a center's queue, and a player can
also become a **private-hire provider**: buy or lease their own car (KD-Bank, G3), set their price and
compete for riders. This gives the game a second path to getting "off the meter".

## 2. v3: hire any land vehicle

v3 grows from taxis to **any land vehicle**, with or without a driver:

- **Vehicle types:** car, van, pickup, lorry or truck, bus or minibus, motorbike, buggy or golf cart, bicycle; the list is set per island.
- **Ways to hire:** a ride now (on demand), a booking for later, by the hour or day, or a job (moving goods, a wedding, an airport transfer).
- **Providers:** taxi centers (public service), companies (fleets) and individuals.
- **Matching** depends on the type: queue (taxis), choose from a list (private hire, rentals) or quotes (lorries, jobs).

This fits v3's multi-center core: a "center" becomes a **provider** (a taxi center, a company or a person), and a "taxi" becomes a **vehicle** with a type.

## 3. Before building: questions for Hussain

1. **Permits:** private hire and vehicle rental in the Maldives need a Transport Authority permit or registration. Should TaxiQ check providers' permits, and which documents (vehicle registration, driving licence, insurance, permit)?
2. **With a driver or without:** is private hire with a driver only to start, or also self-drive rental?
3. **Payments:** cash to the driver as now, or payment in the app later (an MMA-licensed payment provider)?
4. **Prices:** free for providers to set, or a maximum per vehicle type?
5. **First vehicle types** for v3: cars and vans, then lorries?
6. **Commission:** does TaxiQ or the center take a share of private-hire trips?

## 4. Security and data (MDS)

- Providers are verified (eFaas, plus vehicle and permit documents) before going live: a new **Tier 1** data set (identity documents) with access logging.
- Vehicle locations from private providers are personal data: same rules as taxis (shown only while working).
- Prices and bookings go into an append-only record, like dispatches.
