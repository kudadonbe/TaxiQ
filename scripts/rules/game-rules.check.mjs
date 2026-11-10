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
const seed = await fetch(`${BASE}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [write('roles/op@test.example', { role: 'operator' }), write('roles/b@test.example', { role: 'private' }), write('vehicles/v9', { ownerUid: 'e', ownerName: 'E', kind: 'private', type: 'car', reg: 'E1', colour: '', seats: 4, priceBase: 25, pricePerKm: 5, phone: '7770001', note: '', status: 'approved', reason: '', decidedBy: 'op@test.example', decidedAt: new Date(), createdAt: new Date(), updatedAt: new Date() })] }) })
if (!seed.ok) { fails++; console.log('FAIL  could not set up a test operator') }
const veh = (o = {}) => ({ ownerUid: 'b', ownerName: 'B', kind: 'private', type: 'motorbike', reg: 'P1234', colour: 'red', seats: 1, priceBase: 25, pricePerKm: 5, phone: '7771234', note: '', status: 'pending', reason: '', decidedBy: null, decidedAt: null, createdAt: NOW, updatedAt: NOW, ...o })
await expect('a citizen applies to offer their motorbike for hire', 'b', [write('vehicles/v1', veh())], true)
await expect('an edit that sends back the record id is refused (only details may be sent)', 'b', [write('vehicles/v4', { ...veh(), id: 'v4' })], false)
await expect('nobody can apply already approved', 'b', [write('vehicles/v2', veh({ status: 'approved' }))], false)
await expect('nobody can apply in someone else\'s name', 'c', [write('vehicles/v3', veh())], false)
await expect('the owner cannot approve their own vehicle', 'b', [write('vehicles/v1', { status: 'approved', decidedBy: 'b@test.example', decidedAt: NOW, updatedAt: NOW }, { merge: true })], false)
await expect('a vehicle not approved cannot go on the map', 'b', [write('publicVehicles/v1', { ownerUid: 'b', type: 'motorbike', colour: 'red', seats: 1, firstName: 'B', priceBase: 25, pricePerKm: 5, at: [4.17, 73.5], heading: 0, updatedAt: NOW })], false)
await expect('an operator approves it', 'op', [write('vehicles/v1', { status: 'approved', reason: '', decidedBy: 'op@test.example', decidedAt: NOW, updatedAt: NOW }, { merge: true })], true)
await expect('the approval is logged', 'op', [write('vehicleLog/l1', { vehicleId: 'v1', ownerUid: 'b', action: 'approved', by: 'op@test.example', reason: '', at: NOW })], true)
await expect('nobody can change the log', 'op', [write('vehicleLog/l1', { vehicleId: 'v1', ownerUid: 'b', action: 'rejected', by: 'op@test.example', reason: 'x', at: NOW })], false)
await expect('once approved, the owner shows it on the map', 'b', [write('publicVehicles/v1', { ownerUid: 'b', type: 'motorbike', colour: 'red', seats: 1, firstName: 'B', priceBase: 25, pricePerKm: 5, at: [4.17, 73.5], heading: 0, updatedAt: NOW })], true)
await expect('an approved vehicle whose owner lacks the Private driver role cannot go on the map', 'e', [write('publicVehicles/v9', { ownerUid: 'e', type: 'car', colour: '', seats: 4, firstName: 'E', priceBase: 25, pricePerKm: 5, at: [4.17, 73.5], heading: 0, updatedAt: NOW })], false)
await expect('the map copy cannot carry a phone number', 'b', [write('publicVehicles/v1', { ownerUid: 'b', type: 'motorbike', colour: 'red', seats: 1, firstName: 'B', priceBase: 25, pricePerKm: 5, at: [4.17, 73.5], heading: 0, updatedAt: NOW, phone: '7771234' })], false)
await expect('the owner changes their price once approved', 'b', [write('vehicles/v1', { priceBase: 30, updatedAt: NOW }, { merge: true })], true)
await expect('the owner chooses who rides it on the map, once approved', 'b', [write('vehicles/v1', { rider: 'woman', updatedAt: NOW }, { merge: true })], true)
await expect('only the listed riders', 'b', [write('vehicles/v1', { rider: 'robot', updatedAt: NOW }, { merge: true })], false)
await expect('but not the registration once approved', 'b', [write('vehicles/v1', { reg: 'P9999', updatedAt: NOW }, { merge: true })], false)
await expect('rejecting needs a reason', 'op', [write('vehicles/v1', { status: 'rejected', reason: '', decidedBy: 'op@test.example', decidedAt: NOW, updatedAt: NOW }, { merge: true })], false)
await canRead('another citizen cannot read the vehicle record (phone number)', 'c', 'vehicles/v1', false)
// Booking a private vehicle (v1 is approved and on the map from the checks above; its owner is b)
const ride = (o = {}) => ({ uid: 'c', name: 'C', phone: '7770000', vehicleId: 'v1', ownerUid: 'b', ownerFirstName: '', ownerPhone: '', pickup: 'Here', pickupAt: [4.17, 73.5], destination: 'There', destinationAt: [4.175, 73.51], note: '', price: 40, status: 'offering', createdAt: NOW, updatedAt: NOW, ...o })
await expect('a passenger books an available private vehicle', 'c', [write('privateRides/c', ride())], true)
await expect('nobody can book in someone else\'s name', 'd', [write('privateRides/c', ride({ uid: 'd' }))], false)
await expect('a booking cannot name a different owner than the vehicle\'s', 'd', [write('privateRides/d', ride({ uid: 'd', ownerUid: 'x' }))], false)
await canRead('the owner sees the booking', 'b', 'privateRides/c', true)
await canRead('someone else does not', 'd', 'privateRides/c', false)
await expect('the passenger cannot accept their own booking', 'c', [write('privateRides/c', { status: 'accepted', ownerFirstName: 'B', ownerPhone: '7771234', updatedAt: NOW }, { merge: true })], false)
await expect('the owner accepts, sharing their first name and phone', 'b', [write('privateRides/c', { status: 'accepted', ownerFirstName: 'B', ownerPhone: '7771234', updatedAt: NOW }, { merge: true })], true)
await expect('the owner cannot jump straight to done', 'b', [write('privateRides/c', { status: 'done', updatedAt: NOW }, { merge: true })], false)
await expect('the owner marks the passenger picked up', 'b', [write('privateRides/c', { status: 'onboard', updatedAt: NOW }, { merge: true })], true)
await expect('the passenger cannot cancel once on board', 'c', [write('privateRides/c', { status: 'cancelled', updatedAt: NOW }, { merge: true })], false)
await expect('the owner cannot mark the trip done (the passenger confirms)', 'b', [write('privateRides/c', { status: 'done', updatedAt: NOW }, { merge: true })], false)
await expect('the owner arrives at the destination', 'b', [write('privateRides/c', { status: 'arrived', arrivedAt: NOW, updatedAt: NOW }, { merge: true })], true)
await expect('the owner cannot mark it done before the 10 minutes', 'b', [write('privateRides/c', { status: 'done', updatedAt: NOW }, { merge: true })], false)
await expect('the passenger confirms the trip finished', 'c', [write('privateRides/c', { status: 'done', updatedAt: NOW }, { merge: true })], true)
await expect('the owner cannot book their own vehicle', 'b', [write('privateRides/b', ride({ uid: 'b' }))], false)
// Open trips by private hire: the top of the private queue offers, the passenger books.
const seed2 = await fetch(`${BASE}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [
  write('vehicles/v8', { ownerUid: 'f', ownerName: 'F', kind: 'private', type: 'car', reg: 'F1', colour: '', seats: 4, priceBase: 25, pricePerKm: 5, phone: '7770002', note: '', status: 'approved', reason: '', decidedBy: 'op@test.example', decidedAt: new Date(), createdAt: new Date(), updatedAt: new Date() }),
  write('publicVehicles/v8', { ownerUid: 'f', type: 'car', colour: '', seats: 4, firstName: 'F', priceBase: 25, pricePerKm: 5, at: [4.17, 73.5], heading: 0, updatedAt: new Date() }),
  write('roles/f@test.example', { role: 'private' }),
  write('queue/state', { order: ['t1', 't2'], interested: [] }),
  write('taxis/t1', { taxiNo: '34', taxiReg: 'A1', driver: { name: 'D', nameDv: '', phone: '7770004' } }),
  write('taxis/t2', { taxiNo: '35', taxiReg: 'A2', driver: { name: 'E', nameDv: '', phone: '7770006' } }),
  write('roles/drv@test.example', { role: 'driver', taxiId: 't1' }),
] }) })
if (!seed2.ok) { fails++; console.log('FAIL  could not set up the open-trip checks') }
const open = (o = {}) => ride({ mode: 'queue', skipped: [], offerAt: NOW, ...o })
await expect('a passenger sends an open trip to the top of the private queue', 'c', [write('privateRides/c', open())], true)
await expect('the owner cannot accept an open trip before the passenger books it', 'b', [write('privateRides/c', { status: 'accepted', ownerFirstName: 'B', ownerPhone: '7771234', updatedAt: NOW }, { merge: true })], false)
await expect('the passenger cannot book before a vehicle offers', 'c', [write('privateRides/c', { status: 'confirmed', offerAt: NOW, updatedAt: NOW }, { merge: true })], false)
await expect('the owner offers to take it', 'b', [write('privateRides/c', { status: 'interest', offerAt: NOW, updatedAt: NOW }, { merge: true })], true)
await expect('the passenger books it', 'c', [write('privateRides/c', { status: 'confirmed', offerAt: NOW, updatedAt: NOW }, { merge: true })], true)
await expect("the owner's phone completes it, sharing first name and phone", 'b', [write('privateRides/c', { status: 'accepted', ownerFirstName: 'B', ownerPhone: '7771234', updatedAt: NOW }, { merge: true })], true)
await expect('the vehicle goes to the back of the private queue', 'b', [write('publicVehicles/v1', { since: NOW, updatedAt: NOW }, { merge: true })], true)
await expect('nobody can put their vehicle at the front of the queue', 'b', [write('publicVehicles/v1', { since: new Date(2020, 0, 1), updatedAt: NOW }, { merge: true })], false)
await expect('another passenger sends an open trip', 'd', [write('privateRides/d', open({ uid: 'd' }))], true)
await expect('the passenger cannot skip the vehicle before its time is up', 'd', [write('privateRides/d', { vehicleId: 'v8', ownerUid: 'f', price: 40, skipped: ['v1'], offerAt: NOW, status: 'offering', updatedAt: NOW }, { merge: true })], false)
await expect('the offered owner passes: on to the next vehicle', 'b', [write('privateRides/d', { vehicleId: 'v8', ownerUid: 'f', price: 40, skipped: ['v1'], offerAt: NOW, status: 'offering', updatedAt: NOW }, { merge: true })], true)
await canRead('the owner who passed no longer sees it', 'b', 'privateRides/d', false)
await canRead('the next owner sees it', 'f', 'privateRides/d', true)
await expect('the next owner cannot pass it back to a vehicle that passed', 'f', [write('privateRides/d', { vehicleId: 'v1', ownerUid: 'b', price: 40, skipped: ['v1', 'v8'], offerAt: NOW, status: 'offering', updatedAt: NOW }, { merge: true })], false)
await expect('the next owner passes too: no vehicle left, expired', 'f', [write('privateRides/d', { skipped: ['v1', 'v8'], offerAt: NOW, status: 'expired', updatedAt: NOW }, { merge: true })], true)
// Open trips by taxi: the top taxi offers, the passenger books, the driver completes it.
const req = (o = {}) => ({ uid: 'p', name: 'Aisha', mode: 'queue', pickup: 'Here', destination: 'There', phone: '7770003', note: '', status: 'offering', offerTo: 't1', offerAt: NOW, skipped: [], acceptedBy: null, price: 35, km: 3, createdAt: NOW, ...o })
await expect('a passenger sends an open trip to the taxi queue', 'p', [write('requests/p', req())], true)
await expect('the driver cannot book it straight away (the passenger decides)', 'drv', [write('requests/p', { status: 'accepted', acceptedBy: 't1' }, { merge: true })], false)
await expect('the passenger cannot say no thanks before a taxi offers', 'p', [write('requests/p', { status: 'offering', offerTo: 't2', skipped: ['t1'], offerAt: NOW }, { merge: true })], false)
await expect("the driver cannot offer in someone else's account", 'drv', [write('requests/p', { status: 'interest', offerAt: NOW, driverUid: 'x' }, { merge: true })], false)
await expect('the driver offers without naming their account: refused', 'drv', [write('requests/p', { status: 'interest', offerAt: NOW }, { merge: true })], false)
await expect('the top driver offers to take it', 'drv', [write('requests/p', { status: 'interest', offerAt: NOW, driverUid: 'drv' }, { merge: true })], true)
await expect('the passenger books it', 'p', [write('requests/p', { status: 'confirmed', offerAt: NOW }, { merge: true })], true)
await expect("the driver's phone completes the booking", 'drv', [write('requests/p', { status: 'accepted', acceptedBy: 't1' }, { merge: true })], true)
await expect("the driver's account cannot change after booking", 'p', [write('requests/p', { driverUid: 'p' }, { merge: true })], false)
await expect('the price cannot change after booking', 'p', [write('requests/p', { price: 1 }, { merge: true })], false)
await expect('the driver cannot jump to arrived before picking up', 'drv', [write('requests/p', { status: 'arrived', arrivedAt: NOW }, { merge: true })], false)
await expect('the driver picks the passenger up', 'drv', [write('requests/p', { status: 'onboard' }, { merge: true })], true)
await expect('the passenger cannot cancel once on board', 'p', [write('requests/p', { status: 'cancelled' }, { merge: true })], false)
await expect('the driver arrives at the destination', 'drv', [write('requests/p', { status: 'arrived', arrivedAt: NOW }, { merge: true })], true)
await expect('the driver cannot mark it done (the passenger confirms)', 'drv', [write('requests/p', { status: 'done' }, { merge: true })], false)
await expect('the passenger reports a problem', 'p', [write('requests/p', { status: 'problem' }, { merge: true })], true)
await expect('an operator closes the problem', 'op', [write('requests/p', { status: 'done' }, { merge: true })], true)
await expect('a passenger sends another open trip', 'p', [write('requests/p', req())], true)
await expect('the driver offers', 'drv', [write('requests/p', { status: 'interest', offerAt: NOW, driverUid: 'drv' }, { merge: true })], true)
await expect('the passenger says no thanks: on to the next taxi', 'p', [write('requests/p', { status: 'offering', offerTo: 't2', skipped: ['t1'], offerAt: NOW }, { merge: true })], true)
await fetch(`${BASE}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [write('roles/adm@test.example', { role: 'admin' })] }) })
await expect('an admin sets the taxi fare', 'adm', [write('config/fares', { base: 20, perKm: 5, minimum: 25, updatedBy: 'adm@test.example', updatedAt: NOW })], true)
await expect('an operator cannot set the fare', 'op', [write('config/fares', { base: 1, perKm: 0, minimum: 0, updatedBy: 'op@test.example', updatedAt: NOW })], false)
await canRead('a passenger reads the fare', 'p', 'config/fares', true)
// 7-10 seat trips: only to a 7-10 seat taxi (t1 has 4 seats, t2 has 8).
await fetch(`${BASE}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [write('publicTaxis/t1', { taxiNo: '34', name: 'D', nameDv: '', suspended: false, seats: 4 }), write('publicTaxis/t2', { taxiNo: '35', name: 'E', nameDv: '', suspended: false, seats: 8 })] }) })
await expect('a 7-10 seat trip cannot go to a small taxi', 'q', [write('requests/q', req({ uid: 'q', size: 'large', offerTo: 't1' }))], false)
await expect('a 7-10 seat trip goes to a 7-10 seat taxi', 'q', [write('requests/q', req({ uid: 'q', size: 'large', offerTo: 't2' }))], true)
await expect('an admin sets a taxi\'s seats', 'adm', [write('taxis/t1', { seats: 7 }, { merge: true })], true)
await expect('seats must be 1 to 15', 'adm', [write('taxis/t1', { seats: 40 }, { merge: true })], false)
// Recorded voice messages: admins record them, everyone signed in plays them.
const clip = (o = {}) => ({ data: 'AAAA', mime: 'audio/webm;codecs=opus', by: 'adm@test.example', updatedAt: NOW, ...o })
await expect('an admin saves a Dhivehi clip for a new trip', 'adm', [write('voiceClips/tripNew-dv', clip())], true)
await expect('an operator cannot', 'op', [write('voiceClips/tripNew-dv', clip({ by: 'op@test.example' }))], false)
await expect('only the known messages', 'adm', [write('voiceClips/anything-dv', clip())], false)
await expect('only audio', 'adm', [write('voiceClips/tripNew-en', clip({ mime: 'text/html' }))], false)
await canRead('a driver can play it', 'drv', 'voiceClips/tripNew-dv', true)
// One vehicle as private hire and a center taxi (P6017 and T6017); both roles for one person.
const vehG = { ownerUid: 'g', ownerName: 'G', kind: 'private', type: 'car', reg: 'P6017', colour: 'white', seats: 4, priceBase: 25, pricePerKm: 5, phone: '7770005', note: '', status: 'approved', reason: '', decidedBy: 'op@test.example', decidedAt: new Date(), createdAt: new Date(), updatedAt: new Date() }
await fetch(`${BASE}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [
  write('vehicles/v7', vehG),
  write('vehicles/v6', { ...vehG, ownerUid: 'h', reg: 'P6018' }),
  write('roles/h@test.example', { role: 'driver', taxiId: 't1' }),
] }) })
await expect('an admin gives a center driver private hire too', 'adm', [write('roles/g@test.example', { role: 'driver', taxiId: 't2', private: true, addedBy: 'adm@test.example', addedAt: NOW })], true)
await expect('the private flag must be yes or no', 'adm', [write('roles/g2@test.example', { role: 'driver', taxiId: 't2', private: 'yes', addedBy: 'adm@test.example', addedAt: NOW })], false)
const onMap = (owner) => ({ ownerUid: owner, type: 'car', colour: 'white', seats: 4, firstName: 'G', priceBase: 25, pricePerKm: 5, at: [4.17, 73.5], heading: 0, since: NOW, updatedAt: NOW })
await expect('a driver with private hire puts their vehicle on the map', 'g', [write('publicVehicles/v7', onMap('g'))], true)
await expect('a driver without private hire cannot', 'h', [write('publicVehicles/v6', onMap('h'))], false)
// (the server time inside a field of a map, as the app's serverTimestamp() does)
const ask = write('vehicles/v7', { updatedAt: NOW }, { merge: true })
ask.updateMask = { fieldPaths: ['taxiRequest'] }
ask.updateTransforms.push({ fieldPath: 'taxiRequest.at', setToServerValue: 'REQUEST_TIME' })
await expect('the owner asks to run the vehicle as a center taxi too', 'g', [ask], true)
await expect('the owner cannot link it themselves', 'g', [write('vehicles/v7', { taxiId: 't2', taxiRequest: null, updatedAt: NOW }, { merge: true })], false)
await expect('an admin links it as taxi t2', 'adm', [write('vehicles/v7', { taxiId: 't2', taxiRequest: null, updatedAt: NOW }, { merge: true }), write('taxis/t2', { vehicleId: 'v7' }, { merge: true })], true)
await expect('the owner changes the colour straight away', 'g', [write('vehicles/v7', { colour: 'silver', updatedAt: NOW }, { merge: true })], true)
await expect('a new registration cannot stay approved', 'g', [write('vehicles/v7', { reg: 'P6020', updatedAt: NOW }, { merge: true })], false)
await expect('the owner cannot drop the taxi link', 'g', [write('vehicles/v7', { taxiId: null, updatedAt: NOW }, { merge: true })], false)
// One at a time: while v7 is out on private hire, its taxi t2 can't take queue offers.
await expect('a passenger sends an open trip to taxi t2', 'z', [write('requests/z', req({ uid: 'z', offerTo: 't2' }))], true)
await expect('the driver cannot offer while the vehicle is on private hire', 'g', [write('requests/z', { status: 'interest', offerAt: NOW, driverUid: 'g' }, { merge: true })], false)
await expect('the driver switches private hire off', 'g', [{ delete: `projects/${P}/databases/(default)/documents/publicVehicles/v7` }], true)
await expect('now the driver can offer as the taxi', 'g', [write('requests/z', { status: 'interest', offerAt: NOW, driverUid: 'g' }, { merge: true })], true)
await expect('a new registration sends it back to Pending', 'g', [write('vehicles/v7', { reg: 'P6020', status: 'pending', reason: '', updatedAt: NOW }, { merge: true })], true)
// Multiple taxi centers: each center's staff see and change only their center.
async function canQuery(name, uid, collection, centerId, ok) {
  const r = await fetch(`${BASE}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${tok(uid)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: 'centerId' }, op: 'EQUAL', value: { stringValue: centerId } } } } }) })
  const pass = r.ok === ok
  if (!pass) fails++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${ok ? 'allowed' : 'denied '}  ${name}`)
}
await fetch(`${BASE}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [
  write('centers/c2', { name: 'Male Taxi', nameDv: '', at: [4.175, 73.51], updatedBy: 'x', updatedAt: new Date() }),
  write('roles/ca@test.example', { role: 'admin', centerId: 'c2' }),
  write('roles/co@test.example', { role: 'operator', centerId: 'c2' }),
  write('roles/mo@test.example', { role: 'operator' }),
  write('queues/c2', { order: ['m1'], interested: [] }),
  write('taxis/m1', { taxiNo: '7', taxiReg: 'M1', driver: { name: 'M', nameDv: '', phone: '7770007' }, centerId: 'c2' }),
] }) })
const mTaxi = (c) => ({ taxiNo: '8', taxiReg: 'M2', driver: { name: 'N', nameDv: '', phone: '7770008' }, centerId: c })
await expect("a center admin registers a taxi in their center", 'ca', [write('taxis/m2', mTaxi('c2'))], true)
await expect("but not in another center", 'ca', [write('taxis/m3', mTaxi('main'))], false)
await canQuery("a center's operator lists their center's taxis", 'co', 'taxis', 'c2', true)
await canQuery("but not another center's", 'co', 'taxis', 'main', false)
await canQuery('a platform admin lists any center', 'adm', 'taxis', 'c2', true)
await expect("the first center's operator works its queue", 'mo', [write('queue/state', { order: ['t1', 't2'], interested: [] })], true)
await expect("another center's operator cannot", 'co', [write('queue/state', { order: ['t2', 't1'], interested: [] })], false)
await expect('they work their own queue', 'co', [write('queues/c2', { order: ['m1', 'm2'], interested: [] })], true)
await expect('a center admin makes an operator for their center', 'ca', [write('roles/new@test.example', { role: 'operator', centerId: 'c2', addedBy: 'ca@test.example', addedAt: NOW })], true)
await expect('but not for another center', 'ca', [write('roles/new2@test.example', { role: 'operator', centerId: 'main', addedBy: 'ca@test.example', addedAt: NOW })], false)
await expect('nor a platform admin', 'ca', [write('roles/new3@test.example', { role: 'admin', addedBy: 'ca@test.example', addedAt: NOW })], false)
await expect("nor change a platform admin's entry", 'ca', [write('roles/adm@test.example', { role: 'operator', centerId: 'c2', addedBy: 'ca@test.example', addedAt: NOW })], false)
await expect("a center admin sets their center's fare", 'ca', [write('fares/c2', { base: 30, perKm: 0, minimum: 30, updatedBy: 'ca@test.example', updatedAt: NOW })], true)
await expect("not the first center's fare", 'ca', [write('config/fares', { base: 1, perKm: 0, minimum: 0, updatedBy: 'ca@test.example', updatedAt: NOW })], false)
await expect('a center admin cannot create a center', 'ca', [write('centers/c9', { name: 'Mine', nameDv: '', at: null, updatedBy: 'ca@test.example', updatedAt: NOW })], false)
await expect('a platform admin creates a center', 'adm', [write('centers/c3', { name: 'Hulhumale Taxi', nameDv: '', at: [4.21, 73.54], updatedBy: 'adm@test.example', updatedAt: NOW })], true)
await expect('an open trip goes to the top of the chosen center\'s queue', 'w', [write('requests/w', req({ uid: 'w', offerTo: 'm1', centerId: 'c2' }))], true)
await expect("not to a taxi outside that center's queue", 'w', [write('requests/w', req({ uid: 'w', offerTo: 't1', centerId: 'c2' }))], false)
await canQuery("the center's operator sees its requests", 'co', 'requests', 'c2', true)
await canQuery("another center's operator does not", 'mo', 'requests', 'c2', false)
await expect('a center admin cannot change the voice clips (platform only)', 'ca', [write('voiceClips/tripNew-en', clip({ by: 'ca@test.example' }))], false)
// Activity log: append-only, the person and staff read it.
const act = (o = {}) => ({ uid: 'c', kind: 'bookingSent', detail: 'taxi', by: 'c@test.example', at: NOW, expireAt: new Date(Date.now() + 90 * 86_400_000), ...o })
await expect('a person logs their own event', 'c', [write('activity/a1', act())], true)
await expect('nobody logs an event for someone else', 'd', [write('activity/a2', act({ by: 'd@test.example' }))], false)
await expect('staff log an event for the person they acted on', 'op', [write('activity/a3', act({ kind: 'rideFixed', by: 'op@test.example' }))], true)
await expect('only the listed kinds', 'c', [write('activity/a4', act({ kind: 'anything' }))], false)
await expect('a log entry cannot be kept longer than 91 days', 'c', [write('activity/a5', act({ expireAt: new Date(Date.now() + 200 * 86_400_000) }))], false)
await expect('the by field must be the writer', 'c', [write('activity/a6', act({ by: 'x@test.example' }))], false)
await expect('nobody changes a log entry', 'c', [write('activity/a1', { detail: 'x' }, { merge: true })], false)
const del = async (name, uid, path) => {
  const r = await fetch(`${BASE}:commit`, { method: 'POST', headers: { Authorization: `Bearer ${tok(uid)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [{ delete: `projects/${P}/databases/(default)/documents/${path}` }] }) })
  const pass = !r.ok
  if (!pass) fails++
  console.log(`${pass ? 'PASS' : 'FAIL'}  denied   ${name}`)
}
await del('nobody deletes a log entry, not even staff', 'adm', 'activity/a1')
await canRead('another citizen cannot read it', 'd', 'activity/a1', false)
await canRead('the person reads their own log', 'c', 'activity/a1', true)
await canRead('staff read it', 'op', 'activity/a1', true)
// Staff cancel a stuck private booking
const seed3 = await fetch(`${BASE}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [write('privateRides/s1', { ...ride({ uid: 's1', status: 'onboard' }), createdAt: new Date(), updatedAt: new Date() })] }) })
if (!seed3.ok) { fails++; console.log('FAIL  could not set up the staff-cancel check') }
await expect('a citizen cannot cancel a booking that is not theirs', 'c', [write('privateRides/s1', { status: 'cancelled', updatedAt: NOW }, { merge: true })], false)
await expect('staff cannot change anything else while cancelling', 'op', [write('privateRides/s1', { status: 'cancelled', price: 0, updatedAt: NOW }, { merge: true })], false)
await expect('staff cancel a stuck private booking', 'op', [write('privateRides/s1', { status: 'cancelled', updatedAt: NOW }, { merge: true })], true)
await expect('a passenger picks taxi t1 on the map (direct)', 'pd', [write('requests/pd', req({ uid: 'pd', mode: 'direct' }))], true)
await expect("the driver cannot accept it into someone else's account", 'drv', [write('requests/pd', { status: 'accepted', acceptedBy: 't1', driverUid: 'x' }, { merge: true })], false)
await expect('the driver accepts it into their own account', 'drv', [write('requests/pd', { status: 'accepted', acceptedBy: 't1', driverUid: 'drv' }, { merge: true })], true)
// Money accounts: a finished trip records Paid and Earned at its fixed total, checked against the trip.
const T0 = new Date(Date.now() - 3600_000)
const T0ms = T0.getTime()
const doneLater = (o) => ({ ...req(o), offerAt: T0, createdAt: T0, arrivedAt: T0, acceptedBy: 't1', driverUid: 'drv' })
await fetch(`${BASE}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [
  write('requests/pa', doneLater({ uid: 'pa', status: 'arrived' })),
  write('requests/pb', doneLater({ uid: 'pb', status: 'done' })),
  write('requests/pc', doneLater({ uid: 'pc', status: 'arrived' })),
  write('privateRides/pr', { ...ride({ uid: 'pr', status: 'arrived' }), offerAt: T0, arrivedAt: T0, createdAt: T0, updatedAt: T0 }),
] }) })
const key = (kind, p) => `${kind}-${p}-${T0ms}`
const ent = (kind, p, side, uid, o = {}) => ({ uid, passengerUid: p, side, amount: kind === 'taxi' ? 35 : 40, method: 'cash', kind, tripKey: key(kind, p), note: '', by: `${o.writer ?? p}@test.example`, at: NOW, ...o.data })
const entW = (kind, p, side, uid, o = {}) => write(`accountEntries/${o.id ?? `${key(kind, p)}-${side}`}`, ent(kind, p, side, uid, o))
await expect('the passenger finishes a taxi trip: done and both entries in one commit', 'pa', [write('requests/pa', { status: 'done' }, { merge: true }), entW('taxi', 'pa', 'paid', 'pa'), entW('taxi', 'pa', 'earned', 'drv')], true)
await expect('a trip cannot be recorded twice (the same entry again)', 'pa', [entW('taxi', 'pa', 'paid', 'pa')], false)
await expect('the wrong amount is refused', 'pb', [entW('taxi', 'pb', 'paid', 'pb', { data: { amount: 99 } })], false)
await expect('Paid on someone else\'s account is refused', 'pb', [entW('taxi', 'pb', 'paid', 'zz')], false)
await expect('Earned for someone other than the driver is refused', 'pb', [entW('taxi', 'pb', 'earned', 'pb')], false)
await expect('an entry under another id is refused', 'pb', [entW('taxi', 'pb', 'paid', 'pb', { id: 'x1' })], false)
await expect('an entry by an outsider is refused', 'd', [entW('taxi', 'pb', 'paid', 'pb', { writer: 'd' })], false)
await expect('the driver records a done trip\'s entries later', 'drv', [entW('taxi', 'pb', 'earned', 'drv', { writer: 'drv' }), entW('taxi', 'pb', 'paid', 'pb', { writer: 'drv' })], true)
await expect('no entries for a trip that is not done', 'pc', [entW('taxi', 'pc', 'paid', 'pc')], false)
await expect('the passenger finishes a private trip: done and both entries', 'pr', [write('privateRides/pr', { status: 'done', updatedAt: NOW }, { merge: true }), entW('private', 'pr', 'paid', 'pr'), entW('private', 'pr', 'earned', 'b')], true)
const corr = (o = {}) => ({ uid: 'pa', side: 'correction', amount: -10, method: 'cash', kind: null, tripKey: '', note: 'Charged twice', by: 'op@test.example', at: NOW, ...o })
await expect('a citizen cannot write a correction', 'pa', [write('accountEntries/c1', corr({ by: 'pa@test.example' }))], false)
await expect('staff write a correction with a reason', 'op', [write('accountEntries/c2', corr())], true)
await expect('a correction needs a reason', 'op', [write('accountEntries/c3', corr({ note: '' }))], false)
await expect('a correction cannot be zero', 'op', [write('accountEntries/c4', corr({ amount: 0 }))], false)
await expect('nobody updates an entry, not even staff', 'adm', [write('accountEntries/c2', corr({ amount: 10, by: 'adm@test.example' }))], false)
await del('nobody deletes an entry, not even staff', 'adm', `accountEntries/${key('taxi', 'pa')}-paid`)
await canRead("another citizen cannot read someone's entries", 'd', `accountEntries/${key('taxi', 'pa')}-paid`, false)
await canRead('the person reads their own entries', 'pa', `accountEntries/${key('taxi', 'pa')}-paid`, true)
await canRead('the driver reads their Earned entry', 'drv', `accountEntries/${key('taxi', 'pa')}-earned`, true)
await canRead('staff read them', 'op', `accountEntries/${key('taxi', 'pa')}-paid`, true)
// Dhivehi corpus: editors only (platform admins, or roles corpus: true); every write logs history.
const cMeta = (by) => ({ createdBy: `${by}@test.example`, createdAt: NOW, updatedBy: `${by}@test.example`, updatedAt: NOW })
const cWord = (o = {}) => ({ thaana: 'ބޭސް', latin: 'beys', rootId: '', pos: 'noun', meaningEn: '', meaningDv: '', category: 'medicine', scientificName: '', partUsed: '', notes: '', sources: [], verified: false, verifiedBy: '', ...o })
const cHist = (by, docId, o = {}) => ({ collection: 'corpusWords', docId, action: 'create', before: null, after: { latin: 'beys' }, by: `${by}@test.example`, at: NOW, ...o })
const wordWrites = (by, id, h, o = {}) => [write(`corpusWords/${id}`, { ...cWord(o), ...cMeta(by), historyId: h }), write(`corpusHistory/${h}`, cHist(by, id))]
await expect('a platform admin creates a word with its history entry', 'adm', wordWrites('adm', 'w1', 'h1'), true)
await expect('a draft word may have Latin only', 'adm', wordWrites('adm', 'w2', 'h2', { thaana: '', latin: 'laagulha' }), true)
await expect('a non-Thaana thaana is refused', 'adm', wordWrites('adm', 'w3', 'h3', { thaana: 'beys' }), false)
await expect('a word without its history entry is refused', 'adm', [write('corpusWords/w4', { ...cWord(), ...cMeta('adm'), historyId: 'nope' })], false)
await expect('a history entry for another document does not count', 'adm', [write('corpusWords/w4', { ...cWord(), ...cMeta('adm'), historyId: 'h4' }), write('corpusHistory/h4', cHist('adm', 'other'))], false)
await expect('a citizen cannot write a word', 'c', wordWrites('c', 'w5', 'h5'), false)
await expect('a citizen cannot write history', 'c', [write('corpusHistory/h6', cHist('c', 'w1'))], false)
await canRead('a citizen cannot read the corpus', 'c', 'corpusWords/w1', false)
await canRead('a citizen cannot read the history', 'c', 'corpusHistory/h1', false)
await canRead('an operator (not a corpus editor) cannot read it', 'op', 'corpusWords/w1', false)
await canRead('the editor reads it', 'adm', 'corpusWords/w1', true)
await expect('nobody changes a history entry', 'adm', [write('corpusHistory/h1', { after: null }, { merge: true })], false)
await del('nobody deletes a history entry', 'adm', 'corpusHistory/h1')
await expect('the editor verifies the word as themselves', 'adm', [write('corpusWords/w1', { verified: true, verifiedBy: 'adm@test.example', updatedBy: 'adm@test.example', updatedAt: NOW, historyId: 'h7' }, { merge: true }), write('corpusHistory/h7', cHist('adm', 'w1', { action: 'verify' }))], true)
await expect('nor in someone else\'s name', 'adm', [write('corpusWords/w2', { verified: true, verifiedBy: 'x@test.example', updatedBy: 'adm@test.example', updatedAt: NOW, historyId: 'h8' }, { merge: true }), write('corpusHistory/h8', cHist('adm', 'w2', { action: 'verify' }))], false)
await expect('created fields cannot be changed', 'adm', [write('corpusWords/w1', { createdBy: 'x@test.example', updatedBy: 'adm@test.example', updatedAt: NOW, historyId: 'h9' }, { merge: true }), write('corpusHistory/h9', cHist('adm', 'w1', { action: 'update' }))], false)
await expect('a dialect form with its history', 'adm', [write('corpusWords/w1/forms/addu', { thaana: 'ބޭސް', latin: 'beys', pronunciation: '', notes: '', speaker: 'elder, Hithadhoo', sources: [], ...cMeta('adm'), historyId: 'h10' }), write('corpusHistory/h10', cHist('adm', 'w1/addu', { collection: 'corpusForms' }))], true)
await expect('only the known dialects', 'adm', [write('corpusWords/w1/forms/mars', { thaana: '', latin: 'x', pronunciation: '', notes: '', speaker: '', sources: [], ...cMeta('adm'), historyId: 'h11' }), write('corpusHistory/h11', cHist('adm', 'w1/mars', { collection: 'corpusForms' }))], false)
await expect('a speaker label is not a phone number', 'adm', [write('corpusWords/w1/forms/male', { thaana: '', latin: 'x', pronunciation: '', notes: '', speaker: '7771234', sources: [], ...cMeta('adm'), historyId: 'h12' }), write('corpusHistory/h12', cHist('adm', 'w1/male', { collection: 'corpusForms' }))], false)
await expect('a source with its history', 'adm', [write('corpusSources/s1', { kind: 'list', title: 'MFDA list', author: '', year: '2023', details: 'row 177', permission: 'cited', ...cMeta('adm'), historyId: 'h13' }), write('corpusHistory/h13', cHist('adm', 's1', { collection: 'corpusSources' }))], true)
await expect('a root needs Thaana', 'adm', [write('corpusRoots/r1', { thaana: '', latin: 'b', meaningEn: '', meaningDv: '', origin: 'sanskrit', notes: '', sources: ['s1'], verified: false, verifiedBy: '', ...cMeta('adm'), historyId: 'h14' }), write('corpusHistory/h14', cHist('adm', 'r1', { collection: 'corpusRoots' }))], false)
await expect('an editor deletes a word, keeping the before snapshot', 'adm', [{ delete: `projects/${P}/databases/(default)/documents/corpusWords/w2` }, write('corpusHistory/h15', cHist('adm', 'w2', { action: 'delete', before: { latin: 'laagulha' }, after: null }))], true)
const formsQuery = async (name, uid, ok) => {
  const r = await fetch(`${BASE}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${tok(uid)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'forms', allDescendants: true }] } }) })
  const pass = r.ok === ok
  if (!pass) fails++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${ok ? 'allowed' : 'denied '}  ${name}`)
}
await formsQuery('the editor lists every word\'s forms at once', 'adm', true)
await formsQuery('a citizen cannot', 'c', false)
await fetch(`${BASE}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [write('roles/ed@test.example', { corpus: true }), write('roles/edop@test.example', { role: 'operator', corpus: true })] }) })
await expect('a corpus editor (corpus: true, no role) writes a word', 'ed', wordWrites('ed', 'w6', 'h16'), true)
await expect('an operator who is also a corpus editor writes a word', 'edop', wordWrites('edop', 'w7', 'h17'), true)
await canRead('a corpus editor reads the corpus', 'ed', 'corpusWords/w1', true)
await expect('a center admin cannot make someone a corpus editor', 'ca', [write('roles/z@test.example', { role: 'operator', centerId: 'c2', corpus: true, addedBy: 'ca@test.example', addedAt: NOW })], false)
await expect('a platform admin can', 'adm', [write('roles/z@test.example', { role: 'operator', centerId: 'c2', corpus: true, addedBy: 'adm@test.example', addedAt: NOW })], true)
// Services on the map (mechanics, tyres, towing...). m is a citizen offering a service; op an operator.
const wk = (open = '08:00', close = '18:00') => [null, { open, close }, { open, close }, { open, close }, { open, close }, { open, close }, null]
const svc = (o = {}) => ({ name: 'Ali Garage', nameDv: 'ޢަލީ ގަރާޖް', kinds: ['mechanic', 'tyre'], mode: 'fixed', at: [4.17, 73.5], hours: wk(), phone: '7771234', priceNote: 'Puncture from MVR 50', note: '', ownerUid: 'm', ownerName: 'M', status: 'pending', reason: '', decidedBy: null, decidedAt: null, createdAt: NOW, updatedAt: NOW, ...o })
const svcPub = (o = {}) => ({ ownerUid: 'm', name: 'Ali Garage', nameDv: 'ޢަލީ ގަރާޖް', kinds: ['mechanic', 'tyre'], mode: 'fixed', at: [4.17, 73.5], hours: wk(), phone: '7771234', priceNote: 'Puncture from MVR 50', level: 'nap', updatedAt: NOW, ...o })
const svcLog = (o = {}) => ({ serviceId: 's1', ownerUid: 'm', action: 'applied', by: 'm@test.example', reason: '', at: NOW, ...o })
const decide = (status, reason = '', by = 'op@test.example') => write('services/s1', { status, reason, decidedBy: by, decidedAt: NOW, updatedAt: NOW }, { merge: true })
const delW = (path) => ({ delete: `projects/${P}/databases/(default)/documents/${path}` })
await expect('a citizen offers a workshop (fixed place), and it is logged', 'm', [write('services/s1', svc()), write('serviceLog/sl1', svcLog())], true)
await expect('nobody applies already approved', 'm', [write('services/s2', svc({ status: 'approved' }))], false)
await expect('nobody applies in someone else\'s name', 'n', [write('services/s3', svc())], false)
await expect('an unknown kind is refused', 'm', [write('services/s4', svc({ kinds: ['mechanic', 'spaceship'] }))], false)
await expect('the same kind twice is refused', 'm', [write('services/s4', svc({ kinds: ['tyre', 'tyre'] }))], false)
await expect('no kind at all is refused', 'm', [write('services/s4', svc({ kinds: [] }))], false)
await expect('a fixed place needs where it is', 'm', [write('services/s4', svc({ at: null }))], false)
await expect('a fixed place needs at least one open day', 'm', [write('services/s4', svc({ hours: [null, null, null, null, null, null, null] }))], false)
await expect('hours must be seven days', 'm', [write('services/s4', svc({ hours: wk().slice(0, 6) }))], false)
await expect('hours must be HH:MM', 'm', [write('services/s4', svc({ hours: wk('8am', '18:00') }))], false)
await expect('a mobile helper gives no place (a home is never stored)', 'm', [write('services/s4', svc({ mode: 'mobile', at: [4.17, 73.5] }))], false)
await expect('a mobile helper applies with no place and no hours', 'm', [write('services/s5', svc({ mode: 'mobile', at: null, hours: [null, null, null, null, null, null, null], kinds: ['towing'] })), write('serviceLog/sl2', svcLog({ serviceId: 's5' }))], true)
await expect('the phone must be 7 digits', 'm', [write('services/s4', svc({ phone: '12345' }))], false)
await expect('an extra field is refused', 'm', [write('services/s4', { ...svc(), id: 's4' })], false)
await expect('a missing field is refused', 'm', [write('services/s4', (({ note: _n, ...x }) => x)(svc()))], false)
await canRead('another citizen cannot read the listing', 'n', 'services/s1', false)
await canRead('the owner reads it', 'm', 'services/s1', true)
await canRead('an operator reads it', 'op', 'services/s1', true)
await expect('a listing not approved cannot go on the map', 'm', [write('publicServices/s1', svcPub())], false)
await expect('the owner cannot approve their own listing', 'm', [decide('approved', '', 'm@test.example')], false)
await expect('rejecting needs a reason', 'op', [decide('rejected')], false)
await expect('an operator rejects it with a reason, logged', 'op', [decide('rejected', 'Phone did not answer'), write('serviceLog/sl3', svcLog({ action: 'rejected', by: 'op@test.example', reason: 'Phone did not answer' }))], true)
await expect('the owner cannot log a decision', 'm', [write('serviceLog/sl4', svcLog({ action: 'approved' }))], false)
await expect('a log entry in someone else\'s name is refused', 'm', [write('serviceLog/sl4', svcLog({ by: 'x@test.example' }))], false)
await expect('the owner sends it again (back to pending)', 'm', [write('services/s1', svc({ createdAt: new Date(), phone: '7771235' }))], true)
await expect('re-sending cannot keep the decision', 'm', [write('services/s1', svc({ createdAt: new Date(), decidedBy: 'op@test.example' }))], false)
await expect('an operator approves it in their own name only', 'op', [decide('approved', '', 'x@test.example')], false)
await expect('an operator approves it', 'op', [decide('approved')], true)
await expect('approved: the owner\'s app puts the place on the map', 'm', [write('publicServices/s1', svcPub({ phone: '7771235' }))], true)
await expect('only what was approved: another name is refused', 'm', [write('publicServices/s1', svcPub({ phone: '7771235', name: 'Best Garage' }))], false)
await expect('a fixed place shows where it is, not elsewhere', 'm', [write('publicServices/s1', svcPub({ phone: '7771235', at: [4.2, 73.5] }))], false)
await expect('the mode must be the listing\'s', 'm', [write('publicServices/s1', svcPub({ phone: '7771235', mode: 'mobile' }))], false)
await expect('only the listed rest levels', 'm', [write('publicServices/s1', svcPub({ phone: '7771235', level: 'asleep' }))], false)
await expect('someone else cannot put it on the map', 'n', [write('publicServices/s1', svcPub({ ownerUid: 'n', phone: '7771235' }))], false)
await canRead('a signed-in driver sees it on the map', 'n', 'publicServices/s1', true)
await expect('approved: the owner changes hours and price note straight away', 'm', [write('services/s1', { hours: wk('07:00', '22:00'), priceNote: 'From MVR 40', updatedAt: NOW }, { merge: true })], true)
await expect('approved: a new name alone (still approved) is refused', 'm', [write('services/s1', { name: 'Best Garage', updatedAt: NOW }, { merge: true })], false)
await expect('approved: a new name goes back to pending', 'm', [write('services/s1', { name: 'Best Garage', status: 'pending', reason: '', updatedAt: NOW }, { merge: true })], true)
await expect('pending: it cannot stay on the map', 'm', [write('publicServices/s1', svcPub({ phone: '7771235', name: 'Best Garage', hours: wk('07:00', '22:00'), priceNote: 'From MVR 40' }))], false)
await expect('suspending needs a reason', 'op', [decide('suspended')], false)
await expect('an operator suspends it with a reason and takes it off the map', 'op', [decide('suspended', 'Complaints'), delW('publicServices/s1')], true)
await expect('the owner cannot lift a suspension', 'm', [write('services/s1', { status: 'pending', reason: '', updatedAt: NOW }, { merge: true })], false)
await expect('nobody changes the log', 'op', [write('serviceLog/sl3', svcLog({ action: 'approved' }))], false)
await del('nobody deletes a service log entry', 'op', 'serviceLog/sl3')
await canRead('another citizen cannot read the service log', 'n', 'serviceLog/sl1', false)
await canRead('the owner reads their service log', 'm', 'serviceLog/sl1', true)
await fetch(`${BASE}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [write('services/s5', { status: 'approved', decidedBy: 'op@test.example', decidedAt: new Date() }, { merge: true })] }) })
const mob = svcPub({ kinds: ['towing'], mode: 'mobile', hours: [null, null, null, null, null, null, null], at: [4.18, 73.51], level: 'active' })
await expect('an approved mobile helper shows where they are while Available', 'm', [write('publicServices/s5', mob)], true)
await expect('and moves', 'm', [write('publicServices/s5', { ...mob, at: [4.181, 73.511], level: 'rest' })], true)
await expect('someone else cannot take a helper off the map', 'n', [delW('publicServices/s5')], false)
await expect('the helper switches Available off', 'm', [delW('publicServices/s5')], true)
await expect('someone else cannot withdraw the listing', 'n', [delW('services/s5')], false)
await expect('the owner withdraws it, logged', 'm', [write('serviceLog/sl5', svcLog({ serviceId: 's5', action: 'withdrawn' })), delW('services/s5')], true)
console.log(fails ? `\n${fails} FAILED` : '\nAll rules checks passed')
process.exit(fails ? 1 : 0)
