# TaxiQ API server (v3)

Node.js + TypeScript + PostgreSQL. Runs the core engine (`../src/core`) for many taxi centers.
API reference: [`openapi.yaml`](openapi.yaml). Roles: `../plans/decisions.md` (D3).

## Run locally

```sh
pnpm install                                   # from the repo root
export DATABASE_URL=postgres://taxiq@127.0.0.1:5432/taxiq
pnpm --filter @taxiq/server migrate           # create/upgrade tables
pnpm --filter @taxiq/server dev               # http://127.0.0.1:8080/v1/health
```

Environment:

| Variable | Default | Meaning |
|----------|---------|---------|
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `PORT` / `HOST` | `8080` / `127.0.0.1` | Listen address. Keep it on localhost behind the reverse proxy |
| `FIREBASE_PROJECT_ID` | `kd-taxiq` | Accepts Firebase ID tokens (Google sign-in) from this project |
| `CORS_ORIGINS` | `https://kd-taxiq.web.app,http://localhost:5173` | Browser origins allowed to call the API |
| `OFFER_SWEEP_MS` | `2000` | How often timed-out ride offers are moved on |

Bootstrap the first system admin (they must have called the API once while signed in):

```sh
pnpm --filter @taxiq/server exec tsx src/grant.ts someone@gmail.com system_admin
```

## Tests

Integration tests need a throwaway PostgreSQL (the test wipes the schema):

```sh
TEST_DATABASE_URL=postgres://taxiq@127.0.0.1:54329/taxiq_test pnpm --filter @taxiq/server test
```

CI runs them against a PostgreSQL service container.

## What the server guarantees

- Every route checks the caller's platform role and their roles **in that center**; one center can't
  read or change another's data (tested).
- Queue changes lock the center's queue row and run the core rule in one transaction.
- Ride offers: the server picks the next taxi in queue order and moves timed-out offers on by itself
  (`sweepTimedOut`), so no screen needs to be open and no client can skip ahead.
- Every state change is written to `audit_log` (who, when, center, before/after).
- Errors return stable codes only (no stack traces or SQL).

## VPS deployment (outline)

1. Ubuntu 24.04 LTS, SSH keys only, firewall open for 22/80/443 only, automatic security updates.
2. Install Node.js 22 and PostgreSQL 17; create a `taxiq` database and user (password in an env file, not in git).
3. Check out the repo, `pnpm install --frozen-lockfile`, run `migrate`.
4. Run `pnpm --filter @taxiq/server start` as a systemd service under a dedicated user, env from `/etc/taxiq/api.env` (mode 600).
5. Reverse proxy (Caddy or Nginx) with TLS on the API domain → `127.0.0.1:8080`.
6. Daily `pg_dump` off-site, and a tested restore. Uptime check on `/v1/health`.

Rollback: keep the previous release directory and database dump; switch the service back and restore if a migration fails.
