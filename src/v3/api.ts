import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth'

// v3: the web app talks only to the TaxiQ API (server/). Enabled when VITE_API_URL is set at build
// time; otherwise the v2 Firebase app runs.
export const API_URL: string | undefined = import.meta.env.VITE_API_URL || undefined

export class ApiFailure extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

type Fb = typeof import('../firebase')

export async function apiCall<T = Record<string, unknown>>(fb: Fb | null, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  if (!API_URL) throw new ApiFailure(0, 'no_api')
  const token = fb?.auth.currentUser ? await fb.auth.currentUser.getIdToken() : null
  const res = await fetch(API_URL.replace(/\/$/, '') + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiFailure(res.status, (data as { error?: string }).error ?? `http_${res.status}`)
  return data
}

// The API bound to the signed-in user.
export function useApi() {
  const { fb } = useAuth()
  return useCallback(<T = Record<string, unknown>>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) => apiCall<T>(fb, method, path, body), [fb])
}

// Load a path and refresh it every `ms` (no realtime channel yet; WebSocket comes later).
export function usePoll<T>(path: string | null, ms = 2000) {
  const call = useApi()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!path) return
    try {
      setData(await call<T>('GET', path))
      setError(null)
    } catch (e) {
      setError(e instanceof ApiFailure ? e.code : 'network')
    }
  }, [call, path])

  useEffect(() => {
    if (!path) return
    // load() sets state only after the network call resolves, not synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
    if (!ms) return
    const t = setInterval(() => void load(), ms)
    return () => clearInterval(t)
  }, [load, ms, path])

  const reload = useCallback(() => void load(), [load])

  return { data: path ? data : null, error: path ? error : null, reload }
}

// Run an action, keep its error for the UI, and refresh afterwards.
export function useAction(after?: () => void) {
  const call = useApi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(
    async <T,>(method: 'POST' | 'DELETE', path: string, body?: unknown): Promise<T | null> => {
      setBusy(true)
      setError(null)
      try {
        const out = await call<T>(method, path, body)
        after?.()
        return out
      } catch (e) {
        setError(e instanceof ApiFailure ? e.code : 'network')
        return null
      } finally {
        setBusy(false)
      }
    },
    [after, call],
  )
  return { run, busy, error }
}

// Shapes returned by the API (see server/openapi.yaml).
export interface Me {
  uid: string
  email: string
  name: string
  platform: 'dev' | 'system_admin' | null
  staff: { centerId: string; name: string; role: 'owner' | 'partner' | 'manager' | 'operator' }[]
  memberships: { id: string; centerId: string; centerName: string; taxiNo: string | null; status: string; suspended: unknown }[]
  centersApplied: { id: string; name: string; status: string }[]
}
export interface Center {
  id: string
  name: string
  type: string
  island: string
}
export interface QueueView {
  version: number
  suggestion: string | null
  interested: string[]
  taxis: { membershipId: string; position: number; taxiNo: string; driverName: string; driverNameDv: string; suspended: { reason: 'conduct' | 'fees' | 'other'; note: string; at: number } | null }[]
}
