import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { createPool, migrate, type Db } from '../src/db'
import type { VerifyToken } from '../src/identity'

// Integration tests run against a real PostgreSQL given by TEST_DATABASE_URL. Each test file starts
// from an empty schema. Test tokens are "uid|email|name"; the real server verifies Firebase tokens.

export const testVerifier: VerifyToken = async (token) => {
  const [uid, email, name] = token.split('|')
  return uid && email ? { uid, email, name: name ?? '' } : null
}

export async function setup(): Promise<{ app: FastifyInstance; db: Db }> {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL is required for server tests')
  const db = createPool(url)
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await migrate(db)
  const app = buildApp({ db, verifyToken: testVerifier, corsOrigins: ['https://kd-taxiq.web.app'] })
  await app.ready()
  return { app, db }
}

export interface Person {
  uid: string
  email: string
  token: string
}
export const person = (uid: string): Person => ({ uid, email: `${uid}@example.com`, token: `${uid}|${uid}@example.com|${uid}` })

// Call the API as someone (or nobody).
export function api(app: FastifyInstance) {
  return async (who: Person | null, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      payload: payload as Record<string, unknown> | undefined,
      headers: who ? { authorization: `Bearer ${who.token}` } : {},
    })
    return { status: res.statusCode, body: res.body ? (JSON.parse(res.body) as Record<string, any>) : {} }
  }
}
