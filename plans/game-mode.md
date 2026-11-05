# TaxiQ Game Mode: design (draft for review)

Status: design draft, 2026-11-05. Owner: Hussain. Nothing is built yet.
Decisions so far: **multiplayer from the start**, **build in v2 if possible, otherwise v3**, design first.

## Decisions (Hussain, 2026-11-05)

| # | Decision |
|---|----------|
| G-D1 | Name: **TaxiQ Game**. |
| G-D2 | **Real fares**: the real fare table (see §5.1). |
| G-D3 | Audience: **both** learning (drivers, centers) and fun (public). |
| G-D4 | A bank, **KD-Bank**, lends to players by the same rules for everyone, **the Islamic way (no interest)**. See §6.1. |
| G-D5 | KD-Bank's capital: **7 billion** (in Dinar and Dirham; see open question 6). |
| G-D6 | The base currency is the **gold Dinar** and **silver Dirham**, each worth its real gold or silver weight and **moving with live gold and silver prices**. Players can also hold **digital MVR**, converted at the current rate. See §5.2. |
| G-D7 | How much drivers control: **still to decide**. The options are in §8.1. |

> This is an **original** TaxiQ game. It's a business and economy game in the same family as
> property-trading and "get out of the rat race" games, but it uses none of their names, boards,
> cards, rules text or artwork. Its board is the real island map, and its rules are TaxiQ's own queue.

## 1. The idea

Players run the island's taxi economy on the real TaxiQ map. Citizens need rides, drivers earn fares
and pay their costs, and center owners build fleets. Everything runs on the same engine as the real
app: the radio queue, offers in queue order, routes along the real roads, and cars that move.

**Goal: "Off the meter".** A player wins when their **passive income** (earnings that come in without
them driving: cars rented to other drivers, center fees, subscriptions) is **higher than their
monthly expenses**. Driving yourself pays the bills, but only owning things sets you free.

## 2. Roles

Every player starts in one role and can move up during the game.

| Role | Starts with | Earns from | Pays for | Moves up by |
|------|-------------|------------|----------|-------------|
| **Citizen** | Small cash, a salary | Salary (fixed, active) | Rides, rent, living costs | Saving to buy or lease a car → Driver |
| **Driver** | One leased or bought car, a membership in a center | Fares (active) | Fuel per km, car lease or loan, center fee, upkeep | Buying more cars and renting them out → Owner |
| **Center owner** | A licence, a little cash | Driver subscriptions, a share of each fare (passive) | Licence renewal, office rent, staff wages | Growing the fleet, opening a second center |

- **At least one center and one or two cars** are needed for a game to start. The host can add **bots** to fill any role (bot citizens make ride requests, bot drivers accept offers, a bot center runs the queue).
- A player can hold several roles: for example a driver who also owns two cars rented to other drivers.

## 3. The board: the real map

- The real island map (Kulhudhuffushi first, then Malé when its map is ready), with plots, house names and real roads.
- Pickups and destinations are real houses from the house search, and routes use `src/core/route.ts`.
- Cars drive the route on their own. The driver's job is the decisions: accept or decline, when to go online, where to wait.

## 4. Time

- Real-time with a game clock: by default **1 real minute = 1 game hour**, so a game day is 24 minutes. The host can choose a faster or slower clock.
- **Payday** is every game month (for example every 7 game days): salaries, subscriptions, rents, lease and loan payments, and licence fees are all settled.
- A typical session is 30–90 minutes, and games can be saved and resumed.

## 5. Money

Each player has a simple statement on screen:

- **Income:** salary (active), fares (active), rent from cars (passive), center earnings (passive).
- **Expenses:** living costs, fuel, lease and loan payments, fees, licence.
- **Assets:** cash, cars, center licence.
- **Liabilities:** loans.

The **"off the meter" bar** shows passive income against expenses. When it passes 100%, you win.

Starting values (all host-adjustable):

| | Citizen | Driver | Owner |
|---|---|---|---|
| Cash | 3,000 | 2,000 | 15,000 |
| Monthly fixed costs | 2,500 | 3,500 | 8,000 |
| Salary | 6,000 | none | none |

Fares follow the real model: a base fare plus a per-km amount. The center takes a fee (for example 10%), and fuel is charged per km driven, including the empty km driving to the pickup.

### 5.1 Real fares (G-D2)

- Use each center's **real fare table**: base fare, per-km rate, night or holiday rates, and waiting time. It's stored per map/island, and the game charges exactly what a real ride would cost.
- Known so far: MTCC charges **MVR 30 within Malé and Hulhumalé** (reported April 2026). **Still needed:** the Kulhudhuffushi fare table, from a center or the council.
- Fares are set in MVR (the real price) and converted to Dinar and Dirham at the current rate.

### 5.2 Currency: gold Dinar, silver Dirham, digital MVR (G-D6)

- **Dinar (gold):** the classical weight of **4.25 g of 22-carat gold** (≈ 3.9 g of pure gold).
- **Dirham (silver):** the classical weight of **2.975 g of pure silver**.
- Their value follows **live gold and silver prices**, updated at least daily, so prices in the game move as they do in the real world.
- **Digital MVR:** players can hold MVR too, converted to and from Dinar and Dirham at the current rate. The rate uses the gold and silver price in USD and the MVR/USD exchange rate.
- **Price source:** a gold/silver price feed (to choose; see open question 7). If the feed is down, the last known price is used, and an admin can set the price by hand. Every rate is saved with its time, so a game's history can always be explained.
- Statements show both: for example "12.5 Dirham (≈ MVR 480)".

## 6. Assets and deals

- **Cars:** buy outright, or take a loan (deposit + monthly payment + interest), or lease. A car can be driven by its owner or **rented to another driver** for a monthly fee, which is passive income.
- **Center licence:** expensive, but it earns subscriptions from every member driver and a share of every fare in its queue.
- **Deals between players:** sell a car, rent a car, hire someone as an operator, join or leave a center. Both players must accept.
- **Bank:** KD-Bank (§6.1). A player with negative cash at payday must sell assets, or they go bankrupt.

### 6.1 KD-Bank: Islamic finance, no interest (G-D4, G-D5)

KD-Bank is the only bank in the game. It applies the **same rules to every player** and never charges interest (*riba*). Every deal is clear up front, with a fixed price and no hidden costs (avoiding *gharar*). It offers:

| Product | How it works in the game | Used for |
|---------|--------------------------|----------|
| **Murabaha** (cost-plus sale) | The bank buys the car, then sells it to the player at cost plus a **fixed, agreed profit**, paid in instalments. The total never grows, even if payments are late. | Buying a car |
| **Ijara wa iqtina** (lease to own) | The bank owns the car and leases it to the player for monthly rent. At the end the player owns it. The bank, as owner, pays for major repairs and insurance. | Leasing a car |
| **Diminishing Musharaka** (partnership) | The bank and the player co-own a center or a fleet and share its profit by ownership. The player buys the bank's share bit by bit until they own it all. | Buying a center licence |
| **Qard Hasan** (goodwill loan) | A small interest-free loan, repaid at the same amount, for emergencies (a repair, rent). Limited per player. | Hard times |

- **Late payments:** no interest and no compounding penalties. A fixed late charge can be **given to charity** (a game charity pool), which is the common Islamic-banking practice. Repeated missed payments lead to the asset being sold to repay what's owed.
- **Capital: 7 billion.** The bank lends only from its capital and what is repaid. If it is fully lent out, new financing waits, so money in the game is limited and realistic.
- **Zakat (optional rule):** a yearly 2.5% on savings above the *nisab* (85 g of gold, or 595 g of silver), paid to the game charity pool. This teaches the real rule.
- Chance-heavy features (betting, lottery-like rewards) are left out to stay clear of *maysir*. Events are life events (§7), not gambling.

## 7. Events

At random times, an event card affects everyone or one player. These are original events about life on the island:
- **Island-wide:** festival night (lots of ride requests), heavy rain (more requests, slower cars), a fuel price rise, a road closed for works (routes change), the Friday rush.
- **Personal:** flat tyre (repair cost, car off the road for an hour), a good-service tip, a parking fine, the car's annual check, an insurance renewal.
- **Opportunities:** a used car for sale cheap, a center owner retiring (licence for sale), a school-run contract (fixed monthly income).

## 8. How a turn of play feels (the core loop)

1. A citizen (player or bot) requests a ride with pickup and destination on the map.
2. The center's queue makes the offer **exactly as the real TaxiQ does**: to the first available taxi, 20 seconds each.
3. The driver accepts. The car drives the road route to the pickup, then to the destination. The fare is paid, the center takes its fee, and fuel is deducted.
4. The taxi joins the back of the queue. Center owners and operators can reorder it, with a reason, as in the real app.
5. Payday settles everything, and the "off the meter" bars move.

### 8.1 How much the driver controls (G-D7, to decide)

| Option | What the driver does | Feels like | Effort |
|--------|----------------------|-----------|--------|
| **A. Decide only** | Go online or offline, accept or decline offers. The car drives itself along the best route. | The real driver app | Lowest; works well on phones and in multiplayer |
| **B. + Choose where to wait** | Also send the empty car to a spot: a stand, near the hospital, the harbour at ferry time. Waiting near demand gets more offers but uses fuel. | Strategy (where's the money tonight?) | Medium |
| **C. + Choose the route** | For each trip, pick from two or three routes: shortest, main road, avoid the market. These trade time against fuel and passenger rating. | Planning | Medium |
| **D. Drive it yourself** | Steer the car along the roads with on-screen controls, like a driving game. The fare and rating depend on driving well. | An action game | Highest; hard to keep fair in multiplayer, and needs good phones |

**Recommendation:** start with **A + B**, add **C** in phase G5, and keep **D** as a separate mini-game later.

## 9. Winning and losing

- **Win:** passive income ≥ monthly expenses at a payday. The game can then continue, scored by net worth.
- **Lose:** bankrupt, meaning you can't cover a payday after selling assets. The player can restart as a citizen in the same game.
- **Scoreboard:** time to get off the meter, net worth, trips, ratings.

## 10. Multiplayer

- **Rooms:** the host creates a game (map, clock speed, starting values, bots on or off) and shares a **join code**, and players join and pick a role.
- 2–8 human players, plus bots.
- Everyone sees the same map and cars live. Chat is optional and can come later.

## 11. Can it be built in v2? Yes, with limits

| | v2 (Firebase, now) | v3 (server, later) |
|---|---|---|
| Rooms and live updates | Firestore `games/{id}` with subcollections `players`, `cars`, `trips`, `events`, `ledger` | Game tables in the API, live updates over WebSocket |
| Game clock and bots | Run on the **host's device**. If the host leaves, the game pauses, or another player takes over as host | Run on the server, always on |
| Fairness | Rules let each player write only their own moves. Money transfers go into an append-only ledger. A modified app on the host's device could still cheat | Server-authoritative: no client can cheat |
| Cost | Inside Firebase's free tier for small games | On the VPS |

**Recommendation:** build v2 for games between friends (trust is fine), and make v3 the fair, server-run version.
The game uses the same core engine (`src/core/queue.ts`, `offers.ts`, `route.ts`, `motion.ts`), so porting is mostly storage.

## 12. Kept apart from the real service

- Separate data (`games/...`), separate screens (a **Game** tab), and a clear "GAME" badge everywhere.
- Play money only, with no real payments. Bot and player names only, with no real phone numbers or passenger data.
- Game actions never touch the real queue, dispatches, drivers or roles.

## 13. Build phases

| Phase | What | Result |
|-------|------|--------|
| G1 | Rooms: create, join by code, pick a role, host settings; the map with game cars | Friends in one shared game world |
| G2 | Core loop: ride requests (players and bots), queue offers, auto-driving along routes, fares | A playable taxi day |
| G3 | Economy: statements, payday, buying or leasing cars, loans, center fees and subscriptions | Money that matters |
| G4 | Winning ("off the meter"), bankruptcy, scoreboard, save and resume | A complete game |
| G5 | Events, deals between players, renting cars to others | Variety and strategy |
| G6 | Port to v3: server-run clock and bots, fair play, more maps (Malé) | The fair, always-on version |

## 14. Open questions for Hussain

Answered: name (TaxiQ Game), fares (real), audience (both), bank (KD-Bank, Islamic), currency (Dinar and Dirham).

3. **Driver control:** A, B, C, D or a mix (§8.1)?
5. **Real-money link:** confirm the game stays **play money only**, with no real deposits, prizes or purchases. The Dinar, Dirham and MVR in the game track real prices, but they aren't real money. Real money would bring financial-regulation and gambling questions.
6. **"7 billion":** is that 7 billion **Dirham** (silver), 7 billion **Dinar** (gold), or 7 billion MVR worth? At today's prices these are very different sizes.
7. **Gold and silver price source:** is there a source you prefer (for example a Maldivian bank's or MMA's published rate, or an international feed)? Some international feeds need a paid key.
8. **Kulhudhuffushi fare table:** who can give us the official fares?
9. **Zakat rule:** on by default, optional, or off?
