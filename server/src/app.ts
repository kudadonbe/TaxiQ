import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import { loadActor, type Actor } from './access'
import type { Db } from './db'
import { ApiError, unauthorized } from './errors'
import type { VerifyToken } from './identity'
import { centerRoutes } from './routes/centers'
import { queueRoutes } from './routes/queue'
import { reportRoutes } from './routes/reports'
import { rideRoutes } from './routes/rides'

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor | null
  }
}

export interface AppDeps {
  db: Db
  verifyToken: VerifyToken
  corsOrigins: string[]
}

// Routes anyone may call without signing in (the public map).
const PUBLIC = [/^\/v1\/health$/, /^\/v1\/centers$/, /^\/v1\/centers\/[0-9a-f-]{36}\/taxis$/i]

export function signedIn(req: FastifyRequest): Actor {
  if (!req.actor) throw unauthorized()
  return req.actor
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 16 * 1024, trustProxy: true })
  app.decorateRequest('actor', null)

  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin
    if (origin && deps.corsOrigins.includes(origin)) {
      reply.header('access-control-allow-origin', origin)
      reply.header('vary', 'origin')
      reply.header('access-control-allow-headers', 'authorization, content-type')
      reply.header('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS')
    }
    reply.header('x-content-type-options', 'nosniff')
    reply.header('cache-control', 'no-store')
    if (req.method === 'OPTIONS') return reply.code(204).send()

    const path = req.url.split('?')[0]!
    const auth = req.headers.authorization
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (token) {
      const id = await deps.verifyToken(token)
      if (!id) throw unauthorized()
      req.actor = await loadActor(deps.db, id)
    } else if (!PUBLIC.some((re) => re.test(path))) {
      throw unauthorized()
    }
  })

  // Safe errors: stable codes, never stack traces or SQL.
  app.setErrorHandler((err: Error & { code?: string; statusCode?: number; validation?: unknown }, _req, reply) => {
    if (err instanceof ApiError) return reply.code(err.status).send({ error: err.code })
    if (err.code === '23505') return reply.code(409).send({ error: 'conflict' })
    if (err.code === '23514' || err.code === '22P02' || err.code === '22007' || err.code === '22008') return reply.code(400).send({ error: 'invalid' })
    if (err.validation || (err.statusCode && err.statusCode < 500)) return reply.code(err.statusCode ?? 400).send({ error: 'bad_request' })
    console.error('internal error', err.message)
    return reply.code(500).send({ error: 'internal' })
  })

  app.get('/v1/health', async () => ({ ok: true }))

  const ctx = { db: deps.db }
  app.register(async (a) => centerRoutes(a, ctx))
  app.register(async (a) => queueRoutes(a, ctx))
  app.register(async (a) => rideRoutes(a, ctx))
  app.register(async (a) => reportRoutes(a, ctx))
  return app
}
