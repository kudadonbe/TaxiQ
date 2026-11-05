import { loadConfig } from './config'
import { createPool, migrate } from './db'

const db = createPool(loadConfig().databaseUrl)
const applied = await migrate(db)
console.log(applied.length ? `applied: ${applied.join(', ')}` : 'up to date')
await db.end()
