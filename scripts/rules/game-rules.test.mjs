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
console.log(fails ? `\n${fails} FAILED` : '\nAll rules checks passed')
process.exit(fails ? 1 : 0)
