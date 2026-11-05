import { loadConfig } from './config'
import { createPool } from './db'

// Bootstrap: give a platform role to someone who has signed in once.
//   pnpm --filter @taxiq/server exec tsx src/grant.ts someone@example.com system_admin|dev|none
const [email, role] = process.argv.slice(2)
if (!email || !['system_admin', 'dev', 'none'].includes(role ?? '')) {
  console.error('usage: grant.ts <email> <system_admin|dev|none>')
  process.exit(1)
}
const db = createPool(loadConfig().databaseUrl)
const u = await db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])
if (!u.rows[0]) {
  console.error('user not found: they must call the API once while signed in')
  process.exit(1)
}
if (role === 'none') await db.query('DELETE FROM platform_roles WHERE user_id = $1', [u.rows[0].id])
else await db.query('INSERT INTO platform_roles (user_id, role) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role', [u.rows[0].id, role])
await db.query("INSERT INTO audit_log (actor, action, target, after) VALUES ('cli', 'platform.grant', $1, $2)", [u.rows[0].id, JSON.stringify({ role })])
console.log(`${email}: ${role}`)
await db.end()
