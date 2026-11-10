# Open items

What's waiting, so any session (on any machine, or in the cloud at claude.ai/code) can pick up
where the last one stopped. Update it when something is done or new: tick it, or remove it once
it's merged and released. Last updated 2026-11-10.

## In progress

- [ ] **Services on the map** (branch `services-map`, pull request into `v2` open): mechanics,
  tyres, towing and other helpers. **Done:** the shared core, the Firestore rules and rule checks,
  My services, Management -> Services, the **map layer** (markers per kind, faded when closed, a
  Services toggle in the map key, a card with Call and Route) and **Help near me** (kind filter, 5
  nearest open helpers), the CLAUDE.md bullet and the SECURITY.md row. **Left:** run
  `pnpm test:rules` (needs Java), review and merge the pull request, then deploy with
  `pnpm release` (new rules); check the Dhivehi labels; add the v3 port line. Help near me ranks by
  straight line (by road for the top few is a later step). Later: request a mechanic or tow,
  ratings and reports (plan §6). `services-map-wip` can be deleted once merged.
- [ ] **Automatic deploy** ([PR #2](https://github.com/kudadonbe/TaxiQ/pull/2), branch `ci-deploy`):
  every merge to `v2` checks, then deploys hosting, rules and indexes. Before merging: create the
  deploy-only service account and the `FIREBASE_SERVICE_ACCOUNT` secret (SECURITY.md, "Automatic
  deploy"). Then optionally protect `v2` (pull requests only) and require approval on the
  `production` environment.

## Needs a decision or an outside step

- [ ] **Old activity-log entries** (90 days): Firestore TTL needs the Blaze plan (kd-taxiq is on
  Spark; `gcloud firestore fields ttls update expireAt --collection-group=activity --enable-ttl`
  failed for billing). Options: switch to Blaze with a budget alert, or a free in-app cleanup (a
  platform admin's app deletes only entries past `expireAt`; rules allow nothing else).
- [ ] **Email to the Dhivehi Language Academy** asking to use Radheef data in the corpus: a draft is
  in the owner's Gmail (to info@dhivehiacademy.edu.mv, from a directory listing: confirm it). The
  owner proofreads the Dhivehi and sends it. Don't import Radheef data without their permission.
- [ ] **MTCC**: a formal OK (or an official API) for the RTL bus feed.
- [ ] **Rufiyaa sign** (U+20C2, Unicode 18.0): no font draws it yet. Option chosen: our own tiny font
  for that one character, traced from the MMA's official artwork (the owner to send it).
- [ ] **Project name** for release: "Digital Raajje" suggested (Raajje Ride / Map / World under it);
  check domains, app stores and the Maldives trademark register.

## Small next steps

- [ ] A **Corpus editor** checkbox in Management -> Users (today `roles/{email}.corpus` is set in
  the Firebase console).
- [ ] The **Dhivehi labels** written by agents (My account, money, corpus, services): check with the
  translation editor.
- [ ] The v3 port list: branch `worktree-v3-port-centers` (`fc6a6d5`) holds another session's entry,
  numbered §24 like the one already in `v3`; merge it as §25 (one line per feature, per CLAUDE.md),
  then remove the old worktrees in `.claude/worktrees/`.
- [ ] Taxi fare for TaxiQ Center (Kulhudhuffushi) in Management -> Taxis; seats on 7-10 seat taxis.
- [ ] Extras not in the fare yet: domestic terminal (+MVR 10/15) and luggage (7-10 seats); decide
  whether private hire in Greater Malé is capped at the official fare.
- [ ] Large build chunks (map, Malé places): split further so the map opens faster.

## Later (plans written)

- `plans/vehicles-traffic-services.md`: vehicle model table, the sharing agreement, citizen reports
  (police checkpoints left out), traffic (individual vehicles only for people who chose to be
  visible), repair guides in Dhivehi, spare parts, ratings and "request a mechanic".
- Game cars on the driving rules (a deterministic version).
- The Dhivehi beys ingredients table (laagulha = Caesalpinia bonduc, MFDA list 2023 row 177;
  madhoshi, kunburu and the others from Radheef and Dr. Hassan Hameed's book, in the owner's own
  words) in the corpus.
- v3: the server (queues, timeouts, payments and a hash-chained ledger, traffic counting, the corpus
  as a shared service).
