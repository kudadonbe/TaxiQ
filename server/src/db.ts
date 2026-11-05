import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

export type Db = pg.Pool
export type Tx = pg.PoolClient

export function createPool(url: string): Db {
  return new pg.Pool({ connectionString: url, max: 10 })
}

// Run fn in one transaction. Queue changes lock their center's queue row (SELECT ... FOR UPDATE),
// so two operators can't interleave.
export async function tx<T>(db: Db, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await db.connect()
  try {
    await c.query('BEGIN')
    const out = await fn(c)
    await c.query('COMMIT')
    return out
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    c.release()
  }
}

// Apply migrations/NNN_*.sql in order, once each.
export async function migrate(db: Db): Promise<string[]> {
  const dir = fileURLToPath(new URL('../migrations/', import.meta.url))
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  const done = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
  const files = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()
  const applied: string[] = []
  for (const f of files) {
    if (done.has(f)) continue
    const sql = await readFile(dir + f, 'utf8')
    await tx(db, async (c) => {
      await c.query(sql)
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f])
    })
    applied.push(f)
  }
  return applied
}
