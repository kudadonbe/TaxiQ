# Vision: a real digital Maldives ("Digital Raajje")

From Hussain's ideas, November 2026. TaxiQ grows from a taxi queue into a platform where anyone in
the Maldives can be found for what they do and offer, and where people hire, book, buy and pay
safely. The game (TaxiQ World) mirrors the same world. v2 starts pieces of it on Firestore; v3's
server (`plans/v3-core-api.md`) runs it at scale. Working name: **Digital Raajje** (Raajje Ride,
Raajje Map, Raajje World); check domains, app stores and the trademark register before release.

## 1. Registries: everyone who offers something

One registry system, built once: **apply, verify, approve or reject with a reason, and every
decision logged**, the same steps for every registry (v2 already does it for vehicles and services).

| Group | Examples | Checked before approval |
|---|---|---|
| Transport | taxi centers (registered by the owner), vehicle owners, rentals, towing | taxi centers: Transport Authority licence; vehicles: registration |
| Vehicle services | mechanics, tyres, batteries, car wash, AC | operator check |
| Health | doctors, nurses, physiotherapists, hakeems | doctors: Maldives Medical and Dental Council; nurses: Maldives Nursing and Midwifery Council |
| Legal and finance | lawyers, notaries, accountants | licence to practise |
| Sea and tourism | divers and dive instructors (PADI/SSI), boat operators, guides, stays | certification; boat registration and safety papers; tourism registration |
| Arts and media | musicians, actors, dancers, photographers, social media creators | identity |
| Trades and home | electricians, plumbers, carpenters, cleaners | licence where the trade needs one |
| Teaching | tutors, Quran teachers, swimming instructors | identity, qualifications |
| Business | entrepreneurs, shops, cafés, home businesses, freelancers | business registration (Ministry of Economic Development) |
| Property | houses, flats and land for sale; house and flat leases; agents | proof of ownership or the owner's consent; real photos and address |
| Rentals | vehicles, tools, generators, sound systems, cameras, boats, diving gear, event items | identity; boats: registration and safety papers |

Professions are data (admins add them), not code.

**Three trust levels**, shown as a badge: **Licensed** (the official licence checked), **Identity
verified** (eFaas; until then phone by SMS plus an operator check), **Self-listed** (labelled, fewer
features).

**Profiles each person controls:** name or stage name, professions, a place or "comes to you" (shown
only while Available, so a home is never shown), hours, prices, languages, portfolio links. The
person chooses what's public; licence documents are staff-only.

## 2. On the map

Category chips: **All, Taxi, Bus, Private, Services, Health, Legal, Sea, Arts, Shops, Property,
Rentals, Stays** and more as registries grow; each chip shows its layer and its own panel (hire,
call, route, book, order). Taxis always in taxi colours; a car also offered as private hire in its
real colour in the Private view; taxi centers and shops with their logo. Zoomed out: clear badges;
zoomed in: real-size shapes from the vehicle model library.

## 3. Shops, orders and payments

- A shop has its logo, place or delivery area, hours, and a **catalog** (photos, price, stock,
  options, categories) managed from the Offer tab.
- Customers order from the catalog; the shop accepts, prepares and marks it ready or delivered;
  both sides confirm, as with trips. Prices and stock are fixed when the order is placed.
- **Payments:** cash on pickup or delivery first (recorded in both money accounts, as trips are);
  then card and wallet through a **licensed payment gateway**, transfers between people, payouts to
  banks, refunds to the wallet. Follow the Maldives Monetary Authority's rules; never hold
  customers' money without a licence. Money records are append-only and, on the server,
  hash-chained.
- Deliveries go to drivers and private vehicles through the same queue and offer system as rides.

## 4. Property, leases and rentals

Listings with place, price (sale, per month, per day), photos and availability. The exact address
of a house for lease is shown only after both sides agree (mutual reveal); until then an approximate
area. Against scams: verified listers only, operator-checked photos, deposits only through the app
once payments exist, a Report button on every listing.

## 5. Identity and safety

- Vehicle numbers public for taxis and buses; a private vehicle's plate on tap to signed-in users
  (logged), because a plate plus a live position can be used to follow a person.
- Taxi drivers: a driver card (name, photo, with consent).
- Private hire and other person-to-person deals: identity hidden by default; a **mutual reveal**: a
  verified person must offer their own identity to ask for the other's; both see, or neither; every
  request logged.
- Residents update their own address details: private at once; public after 10 approvals by
  different signed-in people or one operator/admin; the public never sees who submitted it.

## 6. MDS and data

Every profile is a person with personal data: consent, minimal public details, staff-only
documents, clear reasons for every rejection or suspension, logged decisions, retention limits.
Health and legal listings are a directory, not advice. Office or government data never goes into
personal services. Record each registry in `SECURITY.md` before it holds real data.

## 7. Where it runs

- **v2 (Firestore rules, no server):** registries that follow the vehicles/services pattern (taxi
  centers first), map chips, the model library, cash records.
- **v3 (server):** search and ranking across thousands of profiles, booking, the licensed payment
  gateway and wallet with a hash-chained ledger, push notifications, licence-expiry checks,
  traffic, abuse detection, the corpus and the vehicle model table as shared services, and the
  queues and timeouts that v2 runs on clients.
