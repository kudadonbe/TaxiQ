import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// Sign-in with Google (Firebase Auth). A Google account alone grants nothing: the user needs a
// staff entry in Firestore roles/{email} (admin or operator). Without one the app stays in demo mode.
// (MDS exception: the standard requires eFaas; see SECURITY.md.)

export type Role = 'admin' | 'operator'

type Fb = typeof import('./firebase')

interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn'
  email: string | null
  name: string | null
  role: Role | null
  error: string | null
  fb: Fb | null
  signIn: () => void
  signOut: () => void
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [fb, setFb] = useState<Fb | null>(null)
  const [status, setStatus] = useState<AuthState['status']>('loading')
  const [user, setUser] = useState<{ email: string; name: string } | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load the SDK in the background and follow the sign-in state.
  useEffect(() => {
    let stop = () => {}
    let cancelled = false
    import('./firebase')
      .then((mod) => {
        if (cancelled) return
        setFb(mod)
        stop = mod.onAuthStateChanged(mod.auth, (u) => {
          if (u?.email && u.emailVerified) {
            setUser({ email: u.email.toLowerCase(), name: u.displayName ?? u.email })
            setStatus('signedIn')
          } else {
            setUser(null)
            setRole(null)
            setStatus('signedOut')
          }
        })
      })
      .catch(() => {
        // Offline or blocked: demo mode still works.
        if (!cancelled) setStatus('signedOut')
      })
    return () => {
      cancelled = true
      stop()
    }
  }, [])

  // Follow this user's staff entry (role can be granted or revoked while signed in).
  useEffect(() => {
    if (!fb || !user) return
    return fb.onSnapshot(
      fb.doc(fb.db, 'roles', user.email),
      (snap) => {
        const r = snap.exists() ? snap.data().role : null
        setRole(r === 'admin' || r === 'operator' ? r : null)
      },
      () => setRole(null),
    )
  }, [fb, user])

  const signIn = () => {
    if (!fb) return
    setError(null)
    fb.signInWithPopup(fb.auth, fb.googleProvider).catch((e: { code?: string }) => {
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
        setError(e.code ?? 'auth/error')
      }
    })
  }

  const signOut = () => {
    if (fb) void fb.signOut(fb.auth)
  }

  const value: AuthState = {
    status,
    email: user?.email ?? null,
    name: user?.name ?? null,
    role,
    error,
    fb,
    signIn,
    signOut,
  }
  return <Ctx value={value}>{children}</Ctx>
}

// oxlint-disable-next-line react/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
