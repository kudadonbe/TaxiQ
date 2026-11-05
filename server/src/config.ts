// Server settings from the environment. Nothing secret is hard-coded.
export interface Config {
  port: number
  host: string
  databaseUrl: string
  // Identity: 'firebase' verifies Firebase ID tokens (Google sign-in) for this project.
  firebaseProjectId: string
  // Allowed browser origins for CORS (comma-separated), e.g. https://kd-taxiq.web.app
  corsOrigins: string[]
  offerSweepMs: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? '127.0.0.1', // behind the reverse proxy; don't listen publicly by default
    databaseUrl,
    firebaseProjectId: env.FIREBASE_PROJECT_ID ?? 'kd-taxiq',
    corsOrigins: (env.CORS_ORIGINS ?? 'https://kd-taxiq.web.app,http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    offerSweepMs: Number(env.OFFER_SWEEP_MS ?? 2000),
  }
}
