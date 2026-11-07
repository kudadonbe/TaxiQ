// Run with: pnpm test:rules (needs Java for the Firestore emulator). Uses fake sign-ins only.
// Tests the TaxiQ Game rules against the local Firestore emulator (no real data).
const P = 'kd-taxiq'
const BASE = `http://127.0.0.1:8085/v1/projects/${P}/databases/(default)/documents`
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const tok = (uid) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: uid, user_id: uid, email: `${uid}@test.example`, email_verified: true, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, aud: P, iss: `https://securetoken.google.com/${P}`, firebase: { sign_in_provider: 'google.com' } })}.`
const val = (v) => {
  if (v === null) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } }
}
const NOW = Symbol('now')
function write(path, data, { merge } = {}) {
  const fields = {}
  const transforms = []
  for (const [k, v] of Object.entries(data)) {
    if (v === NOW) transforms.push({ fieldPath: k, setToServerValue: 'REQUEST_TIME' })
    else fields[k] = val(v)
  }
  const w = { update: { name: `projects/${P}/databases/(default)/documents/${path}`, fields }, updateTransforms: transforms }
  if (merge) w.updateMask = { fieldPaths: Object.keys(fields) }
  return w
}
async function commit(uid, writes) {
  const r = await fetch(`${BASE}:commit`, { method: 'POST', headers: { Authorization: `Bearer ${tok(uid)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) })
  return r.ok
}
let fails = 0
async function expect(name, uid, writes, ok) {
  const got = await commit(uid, writes)
  const pass = got === ok
  if (!pass) fails++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${ok ? 'allowed' : 'denied '}  ${name}`)
}
const game = { name: 'TaxiQ World', code: 'KDHWRD', seed: 'world', hostUid: 'world', hostName: 'TaxiQ', status: 'running', preset: 'standard', bots: true, createdAt: NOW, startedAt: NOW, pausedMs: 0, pausedAt: null }
const roster = { drivers: [{ e: 'Ali Ahmed', d: 'ޢަލީ' }], citizens: [], centers: [] }
const player = (role) => ({ name: 'Test', role, online: true, joinedAt: NOW })
const lease = (uid, s = 30) => ({ uid, until: new Date(Date.now() + s * 1000) })
const car = (driverUid) => ({ driverUid, plan: { k: 'roam', n: 1, t0: 0, v: 5 }, queuedAt: 0, waitT: 0 })
const trip = (o) => ({ riderUid: 'bot', riderName: '', bot: true, pLat: 6.62, pLng: 73.07, pName: 'A', dLat: 6.63, dLng: 73.07, dName: 'B', status: 'searching', createdT: 0, offerCar: null, offerT: null, response: null, declined: [], carNo: null, driverName: null, t0: null, dPick: null, dTotal: null, km: null, fare: null, doneT: null, createdAt: NOW, ...o })

await expect('anyone signed in creates the shared world once, with its people', 'a', [write('games/world', game), write('games/world/world/roster', roster)], true)
await expect('the world cannot be created again', 'b', [write('games/world', game)], false)
await expect('its people cannot be made again', 'b', [write('games/world/world/roster', roster)], false)
await expect('nobody can pause or change the shared world', 'a', [write('games/world', { status: 'paused' }, { merge: true })], false)
await expect('A joins the world as a driver', 'a', [write('games/world/players/a', player('driver'))], true)
await expect('A cannot write B\'s player entry', 'a', [write('games/world/players/b', player('driver'))], false)
await expect('B (not in the world) cannot take the engine', 'b', [write('games/world/engine/lease', lease('b'))], false)
await expect('A takes the engine lease', 'a', [write('games/world/engine/lease', lease('a'))], true)
await expect('a lease longer than a minute is refused', 'a', [write('games/world/engine/lease', lease('a', 120))], false)
await expect('B joins as a citizen', 'b', [write('games/world/players/b', player('citizen'))], true)
await expect('B cannot take the lease while A holds it', 'b', [write('games/world/engine/lease', lease('b'))], false)
await expect('the engine (A) writes cars', 'a', [write('games/world/cars/1', car(null)), write('games/world/cars/2', car('c'))], true)
await expect('B (not the engine) cannot write cars', 'b', [write('games/world/cars/1', car('b'))], false)
await expect('the engine books a bot ride', 'a', [write('games/world/trips/t1', trip({}))], true)
await expect('B cannot book a bot ride', 'b', [write('games/world/trips/t2', trip({}))], false)
await expect('B books their own ride', 'b', [write('games/world/trips/t3', trip({ riderUid: 'b', bot: false, riderName: 'B' }))], true)
await expect('B cannot book a ride in someone else\'s name', 'b', [write('games/world/trips/t4', trip({ riderUid: 'a', bot: false }))], false)
await expect('C (not in the world) cannot book a ride', 'c', [write('games/world/trips/t5', trip({ riderUid: 'c', bot: false }))], false)
await expect('a ride cannot be created with a fare already set', 'b', [write('games/world/trips/t6', trip({ riderUid: 'b', bot: false, fare: 1 }))], false)
await expect('the engine offers ride t1 to car 2 (driver C)', 'a', [write('games/world/trips/t1', { offerCar: 2, offerT: 10 }, { merge: true })], true)
await expect('C, the driver of car 2, accepts it', 'c', [write('games/world/trips/t1', { response: 'accept' }, { merge: true })], true)
await expect('B cannot answer an offer to someone else\'s car', 'b', [write('games/world/trips/t1', { response: 'decline' }, { merge: true })], false)
await expect('C cannot set a fare', 'c', [write('games/world/trips/t1', { fare: 999 }, { merge: true })], false)
await expect('B cancels their own searching ride', 'b', [write('games/world/trips/t3', { status: 'cancelled' }, { merge: true })], true)
await expect('A (not the rider) cannot cancel B\'s ride… as a non-engine field change', 'c', [write('games/world/trips/t3', { status: 'cancelled' }, { merge: true })], false)
await expect('the engine completes a trip', 'a', [write('games/world/trips/t1', { status: 'done', doneT: 50 }, { merge: true })], true)
await expect('B switches to the operator role', 'b', [write('games/world/players/b', player('operator'))], true)
await expect('a made-up role is refused', 'b', [write('games/world/players/b', player('admin'))], false)
// Money (G3)
const wallet = { cash: 15000, job: false, car: 'none', deals: [], day: 0, lastDay: null }
const entry = (seq) => ({ seq, day: 0, from: 'outside', to: 'bank', amount: 100, reason: 'capital', prev: '0', hash: 'h', createdAt: NOW })
await expect('the engine writes the money head, a wallet and a ledger entry', 'a', [write('games/world/money/state', { bank: 1, island: 1, charity: 0, outsideIn: 2, outsideOut: 0, seq: 1, lastHash: 'h' }), write('games/world/wallets/b', wallet), write('games/world/ledger/000000000', entry(0))], true)
await expect('a player cannot change their own wallet', 'b', [write('games/world/wallets/b', { ...wallet, cash: 9999999 })], false)
await expect('nobody can change a ledger entry, not even the engine', 'a', [write('games/world/ledger/000000000', { ...entry(0), amount: 5 })], false)
await expect('a player cannot write the ledger', 'b', [write('games/world/ledger/000000001', entry(1))], false)
await expect('a player applies for a Murabaha car deal', 'b', [write('games/world/applications/p1', { uid: 'b', kind: 'murabaha', days: 720, amount: 0, status: 'new', reason: '', createdAt: NOW })], true)
await expect('a player cannot apply in someone else\'s name', 'b', [write('games/world/applications/p2', { uid: 'a', kind: 'qard', days: 0, amount: 100, status: 'new', reason: '', createdAt: NOW })], false)
await expect('a player cannot approve their own application', 'b', [write('games/world/applications/p1', { status: 'approved' }, { merge: true })], false)
await expect('the engine approves it', 'a', [write('games/world/applications/p1', { status: 'approved', reason: '' }, { merge: true })], true)
await expect('the money head never goes backwards', 'a', [write('games/world/money/state', { bank: 1, island: 1, charity: 0, outsideIn: 2, outsideOut: 0, seq: 0, lastHash: 'x' })], false)
// Showing yourself on the map
const soon = () => new Date(Date.now() + 30 * 60_000)
const pres = (o = {}) => ({ name: 'B', at: [4.17, 73.5], mode: 'walk', modeAuto: true, visibility: 'public', updatedAt: NOW, expiresAt: soon(), ...o })
const pub = (o = {}) => ({ at: [4.17, 73.5], mode: 'walk', modeAuto: true, updatedAt: NOW, expiresAt: soon(), ...o })
await expect('a person shares their own position (staff copy and public copy)', 'b', [write('presence/b', pres()), write('presencePublic/b', pub())], true)
await expect('nobody can share a position for someone else', 'c', [write('presence/b', pres())], false)
await expect('the public copy cannot carry a name', 'b', [write('presencePublic/b', { ...pub(), name: 'B' })], false)
await expect('sharing cannot be set to last more than an hour', 'b', [write('presence/b', pres({ expiresAt: new Date(Date.now() + 3 * 3600_000) }))], false)
await expect('only the listed ways of moving', 'b', [write('presence/b', pres({ mode: 'flying' }))], false)
async function canRead(name, uid, path, ok) {
  const r = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${tok(uid)}` } })
  const pass = r.ok === ok
  if (!pass) fails++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${ok ? 'allowed' : 'denied '}  ${name}`)
}
await canRead('a signed-in member of the public cannot read the copy with the name', 'c', 'presence/b', false)
await canRead('a signed-in member of the public can read the nameless public copy', 'c', 'presencePublic/b', true)
await canRead('the person reads their own copy', 'b', 'presence/b', true)
// Private vehicles for hire
const seed = await fetch(`${BASE}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [write('roles/op@test.example', { role: 'operator' })] }) })
if (!seed.ok) { fails++; console.log('FAIL  could not set up a test operator') }
const veh = (o = {}) => ({ ownerUid: 'b', ownerName: 'B', kind: 'private', type: 'motorbike', reg: 'P1234', colour: 'red', seats: 1, priceBase: 25, pricePerKm: 5, phone: '7771234', note: '', status: 'pending', reason: '', decidedBy: null, decidedAt: null, createdAt: NOW, updatedAt: NOW, ...o })
await expect('a citizen applies to offer their motorbike for hire', 'b', [write('vehicles/v1', veh())], true)
await expect('nobody can apply already approved', 'b', [write('vehicles/v2', veh({ status: 'approved' }))], false)
await expect('nobody can apply in someone else\'s name', 'c', [write('vehicles/v3', veh())], false)
await expect('the owner cannot approve their own vehicle', 'b', [write('vehicles/v1', { status: 'approved', decidedBy: 'b@test.example', decidedAt: NOW, updatedAt: NOW }, { merge: true })], false)
await expect('a vehicle not approved cannot go on the map', 'b', [write('publicVehicles/v1', { type: 'motorbike', colour: 'red', seats: 1, firstName: 'B', priceBase: 25, pricePerKm: 5, at: [4.17, 73.5], heading: 0, updatedAt: NOW })], false)
await expect('an operator approves it', 'op', [write('vehicles/v1', { status: 'approved', reason: '', decidedBy: 'op@test.example', decidedAt: NOW, updatedAt: NOW }, { merge: true })], true)
await expect('the approval is logged', 'op', [write('vehicleLog/l1', { vehicleId: 'v1', ownerUid: 'b', action: 'approved', by: 'op@test.example', reason: '', at: NOW })], true)
await expect('nobody can change the log', 'op', [write('vehicleLog/l1', { vehicleId: 'v1', ownerUid: 'b', action: 'rejected', by: 'op@test.example', reason: 'x', at: NOW })], false)
await expect('once approved, the owner shows it on the map', 'b', [write('publicVehicles/v1', { type: 'motorbike', colour: 'red', seats: 1, firstName: 'B', priceBase: 25, pricePerKm: 5, at: [4.17, 73.5], heading: 0, updatedAt: NOW })], true)
await expect('the map copy cannot carry a phone number', 'b', [write('publicVehicles/v1', { type: 'motorbike', colour: 'red', seats: 1, firstName: 'B', priceBase: 25, pricePerKm: 5, at: [4.17, 73.5], heading: 0, updatedAt: NOW, phone: '7771234' })], false)
await expect('the owner changes their price once approved', 'b', [write('vehicles/v1', { priceBase: 30, updatedAt: NOW }, { merge: true })], true)
await expect('but not the registration once approved', 'b', [write('vehicles/v1', { reg: 'P9999', updatedAt: NOW }, { merge: true })], false)
await expect('rejecting needs a reason', 'op', [write('vehicles/v1', { status: 'rejected', reason: '', decidedBy: 'op@test.example', decidedAt: NOW, updatedAt: NOW }, { merge: true })], false)
await canRead('another citizen cannot read the vehicle record (phone number)', 'c', 'vehicles/v1', false)
console.log(fails ? `\n${fails} FAILED` : '\nAll rules checks passed')
process.exit(fails ? 1 : 0)
