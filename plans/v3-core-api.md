# TaxiQ v3: an API-first core engine

Status: direction from Hussain, 2026-11-07 (decision D6). Design notes for review; the existing v3 plans
([implementation plan](taxiq-v3-implementation-plan.md), [core API and hosting](taxiq-v2-core-api-hosting-plan.md),
[multi-center platform](taxiq-multi-center-platform.md)) stay valid and fit inside this.

## 1. The idea

v3 is **one core engine behind one API**. The TaxiQ web app, the driver app, TaxiQ Game, center back
offices and partner apps are all **clients** of that API; none of them holds the business rules. The
engine covers the whole vehicle economy, not just taxi queues:

```
            TaxiQ web   Driver app   TaxiQ Game   Center back office   Partners
                 \           |            |               |               /
                  +----------+------ API /v1 (OpenAPI, eFaas) -----------+
                                          |
   +--------------------------------------+--------------------------------------+
   | Identity & orgs | Vehicles | Hire | Leasing | Bank & ledger | Manage | Places |
   |            Tracking (GPS, heartbeat) | Pricing | Events & audit              |
   +-----------------------------------------------------------------------------+
                      pure core modules (src/core) + PostgreSQL
```

- **Pure core, thin server.** Each rule lives in a pure TypeScript module in `src/core` (no database,
  no network), with tests. The server (`server/`) loads data, calls the core, saves the result in one
  transaction, and publishes events. v2 already works this way for the queue, routes, the game and
  money, so those modules move across almost unchanged.
- **One engine, many tenants.** A taxi center, a rental company, a private owner, KD-Bank and a game
  world are all **organisations** using the same engine. The game is a **sandbox tenant**: same rules,
  play money, no effect on the real service.
- **API first.** Every action a screen can take is an API call, documented in `server/openapi.yaml`,
  versioned (`/v1`), permission-checked on the server, and logged.

## 2. Modules

| Module | What it does | From v2 (core) | New in v3 |
|--------|--------------|----------------|-----------|
| **Identity & orgs** | People (eFaas), organisations (centers, companies, banks, game worlds), roles per organisation (D3) | roles, View as | eFaas, organisations, invitations |
| **Vehicles** | Registry of any land vehicle: type, registration, owner, provider (center or private), approval, documents with expiry | private vehicle approval and log | documents, expiry, any type, fleets |
| **Hire** | Rides now or booked: queue dispatch (centers), direct, private hire, quotes for jobs; offers, accept, trip states | `queue.ts`, `offers.ts`, reorder, private bookings | one booking model for every provider |
| **Leasing** | Rent or lease a vehicle: by the hour, day or month, lease-to-own (Ijara), hire purchase; schedules, deposits, returns | KD-Bank Ijara and Murabaha offers (game) | real contracts for companies and owners |
| **Bank & ledger** | Accounts, Islamic finance products (Murabaha, Ijara, Musharaka, Qard Hasan), schedules, late charges to charity, an **append-only, hash-chained ledger** | `money.ts`, `moneyEngine.ts`, ledger | multi-organisation accounts; real money only via a licensed partner (D6) |
| **Pricing** | Fare tables (center taxis), owner prices (private hire), lease rates, estimates | `fares.ts`, private price estimate | per-organisation price lists, approvals |
| **Manage** | Center and company back office: staff, members, queue settings, subscriptions (D4), reports, suspensions | Management tab, People, reorder log | per-organisation management API |
| **Places & routing** | House, road and plot data per island, postcodes, road graphs, routes | `route.ts`, `osmRoads.ts`, places, postcodes | server-side road graphs per area, cached |
| **Tracking** | Live positions with rest levels, presence, who may see whom | `heartbeat.ts`, `presence.ts` | WebSocket feed, driver app GPS |
| **Events & audit** | Every change is an event: a permanent audit log, webhooks for partners, push notifications | queue change log, vehicle log, ledger | webhooks, push, exports |

## 3. Rules that hold across the engine

1. **Money:** the engine keeps contracts, schedules and an append-only ledger for every organisation.
   **Real money moves only through a licensed partner** (a bank or payment provider licensed by MMA),
   added later; until then real tenants record payments, and the game uses play money. This refines D4.
2. **Islamic finance:** no interest (riba); every deal's total is fixed and shown before signing
   (no gharar); late charges are fixed and go to charity; no chance-based features (maysir).
3. **Permissions on the server:** the screen only chooses a view; every call is checked against the
   person's roles in that organisation. `dev` never exists in production (D3).
4. **One source of truth:** the server writes; clients read and ask. Positions, offers and the game
   clock are computed by the engine, not trusted from a phone.
5. **MDS standard:** eFaas login, allow-list input validation, safe errors, encryption in transit and
   at rest, least privilege, audit logs, MDS-whitelisted dependencies (`SECURITY.md`).

## 4. Order of work (fits the implementation plan's phases)

1. **Bring the v2 core across** (`plans/v2-features-to-port.md`): route, reorder, heartbeat, presence,
   fares, game, money and ledger modules into `src/core`, with their tests.
2. **Organisations and vehicles** (Phase 2–3): one organisation table for centers, companies, banks and
   game worlds; the vehicle registry with types and approval.
3. **Hire for every provider** (Phase 4–5): one booking model (queue, direct, private) on the API; the v2
   web app becomes the first client.
4. **Bank & ledger** on the server: accounts and the hash-chained ledger in PostgreSQL inside each
   transaction; the game moves onto it first (play money).
5. **Leasing**: rental and lease contracts for companies and owners, using the bank's schedules.
6. **Public API, events and webhooks** (Phase 8) for partners.

## 5. Questions for Hussain

1. **First leasing customers:** rental companies, private owners leasing to drivers, or centers leasing
   cars to their drivers?
2. **KD-Bank:** a game-only bank for now, or should the API be ready for a real partner bank later?
3. **Partner API:** who would use it first (other dispatch apps, councils, insurers)?
