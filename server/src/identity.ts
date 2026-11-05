import { createRemoteJWKSet, jwtVerify } from 'jose'

// Identity adapter: turns a bearer token into a verified person. Firebase (Google sign-in) now;
// eFaas can replace this without touching the routes.
export interface Identity {
  uid: string
  email: string
  name: string
}
export type VerifyToken = (token: string) => Promise<Identity | null>

const FIREBASE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'))

export function firebaseVerifier(projectId: string): VerifyToken {
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
        algorithms: ['RS256'],
      })
      const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : ''
      if (!payload.sub || !email || payload.email_verified !== true) return null
      return { uid: payload.sub, email, name: typeof payload.name === 'string' ? payload.name.slice(0, 80) : '' }
    } catch {
      return null
    }
  }
}
