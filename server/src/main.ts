import { buildApp } from './app'
import { loadConfig } from './config'
import { createPool, migrate } from './db'
import { firebaseVerifier } from './identity'
import { sweepTimedOut } from './offerStore'

const config = loadConfig()
const db = createPool(config.databaseUrl)
const applied = await migrate(db)
if (applied.length) console.log('migrations applied:', applied.join(', '))

const app = buildApp({ db, verifyToken: firebaseVerifier(config.firebaseProjectId), corsOrigins: config.corsOrigins })

// The server moves timed-out ride offers on by itself.
const sweeper = setInterval(() => void sweepTimedOut(db).catch((e: Error) => console.error('sweep failed', e.message)), config.offerSweepMs)

await app.listen({ port: config.port, host: config.host })
console.log(`TaxiQ API listening on ${config.host}:${config.port}`)

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    clearInterval(sweeper)
    void app.close().then(() => db.end()).then(() => process.exit(0))
  })
}
