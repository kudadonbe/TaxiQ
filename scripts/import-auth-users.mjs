// One-time admin tool: add a People profile (users/{uid}) for everyone in Firebase Auth who signed
// in before profiles existed. It only creates missing profiles and never changes existing ones.
// It prints counts only, never emails or names.
//
//   firebase auth:export <export.json> --format=json --project kd-taxiq
//   ACCESS_TOKEN=$(gcloud auth print-access-token) node scripts/import-auth-users.mjs <export.json>
//   rm <export.json>        # the export holds personal data: delete it straight away
//
// The token is an admin (project owner) token, so Firestore rules don't apply to these writes.

import { readFileSync } from 'node:fs'

const PROJECT = 'kd-taxiq'
const file = process.argv[2]
const token = process.env.ACCESS_TOKEN
if (!file || !token) {
  console.error('usage: ACCESS_TOKEN=$(gcloud auth print-access-token) node scripts/import-auth-users.mjs <auth-export.json>')
  process.exit(2)
}

const users = JSON.parse(readFileSync(file, 'utf8')).users ?? []
const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const ts = (ms) => ({ timestampValue: new Date(Number(ms) || Date.now()).toISOString() })
const counts = { added: 0, alreadyThere: 0, noEmail: 0, failed: 0 }

for (const u of users) {
  if (!u.email || !/^[A-Za-z0-9_-]{1,128}$/.test(u.localId ?? '')) {
    counts.noEmail++
    continue
  }
  const name = String(u.displayName ?? u.providerUserInfo?.[0]?.displayName ?? '').slice(0, 80)
  const write = {
    update: {
      name: `projects/${PROJECT}/databases/(default)/documents/users/${u.localId}`,
      fields: {
        email: { stringValue: u.email },
        name: { stringValue: name },
        createdAt: ts(u.createdAt),
        lastSeen: ts(u.lastSignedInAt ?? u.createdAt),
      },
    },
    currentDocument: { exists: false }, // only if they have no profile yet
  }
  const r = await fetch(`${base}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT },
    body: JSON.stringify({ writes: [write] }),
  })
  if (r.ok) counts.added++
  else if (r.status === 400 || r.status === 409) counts.alreadyThere++ // precondition failed: profile exists
  else {
    counts.failed++
    if (counts.failed === 1) console.error('first failure:', r.status, (await r.text()).slice(0, 200))
  }
}

console.log(`Auth users: ${users.length}. Profiles added: ${counts.added}. Already had one: ${counts.alreadyThere}. Skipped (no email): ${counts.noEmail}. Failed: ${counts.failed}.`)
