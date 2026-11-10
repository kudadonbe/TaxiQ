# Vehicles, traffic, reports, parts, guides and services (plan)

From Hussain's ideas, November 2026. One connected plan: owners give real vehicle details, and get
parts and guides that fit, help nearby, and a real traffic picture back. Nothing here is built yet.

## 1. Vehicle table (the base)

- `vehicleModels/{id}` in Firestore, curated by admins: make, model, year range, engine, type, real
  length and width, seats. Built ourselves from the vehicles common in the Maldives (Japanese and
  Korean scooters and cars, vans, pickups, lorries, buses, e-bikes); never copied from a commercial
  database.
- Each model uses one of about 12 top-down shapes (hatchback, sedan, SUV, van, pickup, lorry, bus,
  scooter, motorbike, e-bike, ...), drawn at its real size (`realScale`) in the owner's colour.
- Owners pick their model in My vehicles (and when sharing traffic). The public sees the model, never
  the registration number or the owner.

## 2. Traffic

- Opt-in: "Help show traffic". Each phone reports which road it is on and its speed; only counts
  per road are kept (never a person's track). A road shows only when 3-5 or more vehicles were there.
- Zoomed out: roads coloured free / busy / jam, jam markers with the estimated delay.
- Zoom 18+: individual vehicles at real scale, **only for people who chose to be visible** (like
  Show me on the map). Anonymous contributors only colour the roads: a live icon, even nameless, can
  be followed home.
- Fill the gaps with RTL buses and Available taxis and private vehicles.

## 3. Reports from citizens

- Types: road blocked, accident, flooding, road works, event. **Police checkpoints: left out** (it
  helps people avoid drink-driving and licence checks; only "road closed", by whoever). Ask the
  Maldives Police Service before ever adding them.
- Unconfirmed at first; public after **3 different accounts** report it within 200 m and 30 minutes.
  The reporter's phone must be within about 300 m. Reports expire; passers-by are asked "Still
  there?", and enough "Gone" answers remove it.
- Against overpowering: signed-in accounts only, a few reports per hour per person, one person counts
  once, a **trust score** (confirmed reports raise it, rejected ones lower it; low trust needs more
  confirmations), moderators remove reports and suspend reporters.
- Accountable but anonymous: the public sees "reported by 3 people"; who reported is kept for staff.
- Safety: one tap, only when stopped or as a passenger. No typing while driving.

## 4. Spare parts

- Each part lists the models it fits; an owner sees "parts for your Honda Dio 2019".
- Sellers: TaxiQ, then local shops (accounts approved by admins, like vehicles), with price, stock,
  pickup or delivery.
- Buying: reserve and pay at the shop first; then the payment gateway, through the money account.

## 5. Repair and care guides (Dhivehi and English)

- Step-by-step guides per model: photos, tools, parts used, difficulty, time (brake pads, battery,
  tyres, AC, warning lights). Useful information: service intervals, tyre pressures, safe e-bike
  charging, what to do after a flood (salt water), roadworthiness and registration reminders.
- Written by TaxiQ, trusted mechanics and the community; reviewed before publishing.
- **Don't copy iFixit**: its guides are CC BY-NC-SA (non-commercial only), and TaxiQ is commercial.

## 6. Services on the map

- Mechanics (workshop and mobile), tyre and puncture repair, batteries and jump-starts, towing, car
  wash, AC repair, parts shops, fuel, e-bike charging and repair.
- Register from **My services**, like vehicles: an operator approves; every decision is logged.
  Name (English and Dhivehi), services, hours, phone, price notes.
- Fixed places: a pin at the real place, "open now" from the hours. Mobile helpers: shown only while
  Available (a home-based mechanic's home is never shown).
- For drivers: a **Services** layer (Lucide icons), **Help near me** (nearest open, by road), call or
  route; later **request a mechanic or tow**, like hiring a ride, with the money account.
- Trust: ratings from people who used it; wrong or closed listings reported and confirmed by several
  people; moderators suspend listings.

## 7. The agreement (before anyone shares)

A clear screen before the first share: what is shared, who sees it, how long it is kept, the rules
(no false reports; false reports lead to suspension and may be passed to the authorities where the
law requires), safety (no reporting while driving), and that consent can be withdrawn at any time.
Covers the MDS standard's privacy notice and consent; record it in `SECURITY.md`.

## 8. Where it runs, and order

- **v2 (Firestore rules):** the vehicle table and owners' models; reports with confirmations by
  different accounts, expiry and rate limits; the agreement; the services map (fixed and Available
  mobile helpers).
- **v3 (server):** traffic speeds per road, trust scores and abuse detection, the parts shop and
  payments, guides with review, requesting a mechanic or tow.

Suggested order: vehicle table -> agreement -> services map -> reports -> traffic -> guides -> parts.

## Open questions

- Police checkpoints left out (recommended)?
- Individual vehicles only for people who chose to be visible (recommended)?
- Who writes the first guides, and who reviews them?
- Shops selling parts: commission, or a listing fee?
