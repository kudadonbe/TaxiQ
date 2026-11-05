import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { usePoll, type Me } from './api'
import { CenterScreen } from './CenterScreen'
import { CitizenScreen } from './CitizenScreen'
import { DriverScreen } from './DriverScreen'
import { PlatformScreen } from './PlatformScreen'
import { useV3Strings } from './strings'
import { Btn, Card, ErrorLine } from './ui'

// TaxiQ v3 web app: every screen talks only to the TaxiQ API. The "Act as" switcher shows only the
// roles the API reports for this person (GET /v1/me); it changes the view, never the permissions.

type View = { kind: 'citizen' } | { kind: 'platform' } | { kind: 'center'; centerId: string } | { kind: 'driver'; membershipId: string }
const VIEW_KEY = 'taxiq.v3.view'

const key = (v: View) => (v.kind === 'center' ? `center:${v.centerId}` : v.kind === 'driver' ? `driver:${v.membershipId}` : v.kind)
const parse = (k: string | null): View | null => {
  if (!k) return null
  if (k === 'citizen' || k === 'platform') return { kind: k }
  const [kind, id] = k.split(':')
  if (kind === 'center' && id) return { kind: 'center', centerId: id }
  if (kind === 'driver' && id) return { kind: 'driver', membershipId: id }
  return null
}

export function V3App() {
  const auth = useAuth()
  const s = useV3Strings()
  const { lang, t, toggleLang } = useI18n()
  const signedIn = auth.status === 'signedIn'
  const me = usePoll<Me>(signedIn ? '/v1/me' : null, 30000)
  const [view, setViewState] = useState<View | null>(() => {
    try {
      return parse(localStorage.getItem(VIEW_KEY))
    } catch {
      return null
    }
  })
  const setView = (v: View) => {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, key(v))
    } catch {
      // Storage unavailable: the choice just won't be remembered.
    }
  }

  // Views this person may use, from the API.
  const m = me.data
  const centers = new Map<string, { name: string; roles: Me['staff'][number]['role'][] }>()
  for (const x of m?.staff ?? []) {
    const c = centers.get(x.centerId) ?? { name: x.name, roles: [] }
    c.roles.push(x.role)
    centers.set(x.centerId, c)
  }
  const options: { view: View; label: string }[] = m
    ? [
        { view: { kind: 'citizen' }, label: s.asCitizen },
        ...(m.memberships ?? []).filter((x) => x.status === 'approved').map((x) => ({ view: { kind: 'driver' as const, membershipId: x.id }, label: s.asDriver(x.centerName, x.taxiNo ?? '') })),
        ...[...centers.entries()].map(([id, c]) => ({ view: { kind: 'center' as const, centerId: id }, label: s.asCenter(c.name) })),
        ...(m.platform ? [{ view: { kind: 'platform' as const }, label: s.asPlatform }] : []),
      ]
    : []
  const current = options.find((o) => view && key(o.view) === key(view))?.view ?? options[0]?.view

  useEffect(() => {
    document.title = 'TaxiQ'
  }, [])

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-[1200] border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <h1 className="flex shrink-0 items-center gap-2 text-xl font-black tracking-tight" dir="ltr">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8" />
            <span>
              Taxi<span className="text-emerald-600">Q</span>
            </span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {options.length > 1 && current && (
              <label className="flex items-center gap-2">
                <span className="text-slate-500">{s.actAs}</span>
                <select
                  value={key(current)}
                  onChange={(e) => {
                    const v = parse(e.target.value)
                    if (v) setView(v)
                  }}
                  className="min-h-10 max-w-56 rounded-lg border border-slate-300 bg-white px-2"
                >
                  {options.map((o) => (
                    <option key={key(o.view)} value={key(o.view)}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" onClick={toggleLang} lang={lang === 'en' ? 'dv' : 'en'} className="min-h-10 rounded-lg border border-slate-200 px-3 font-medium text-slate-700 hover:bg-slate-100">
              {t.switchTo}
            </button>
            {signedIn ? (
              <Btn onClick={auth.signOut} title={auth.email ?? ''}>
                {t.signOut}
              </Btn>
            ) : (
              <Btn tone="dark" onClick={auth.signIn} disabled={auth.status === 'loading'}>
                {t.signIn}
              </Btn>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4">
        {!signedIn ? (
          <Card className="mx-auto max-w-md">
            <p>{s.signInFirst}</p>
            <Btn tone="dark" onClick={auth.signIn} disabled={auth.status === 'loading'}>
              {t.signIn}
            </Btn>
            {auth.error && <p className="text-sm text-rose-700">{t.signInError(auth.error)}</p>}
          </Card>
        ) : !m ? (
          me.error ? <ErrorLine code={me.error} /> : <p className="text-sm text-slate-500">{s.loading}</p>
        ) : current?.kind === 'platform' ? (
          <PlatformScreen />
        ) : current?.kind === 'center' ? (
          <CenterScreen key={current.centerId} centerId={current.centerId} roles={centers.get(current.centerId)?.roles ?? []} dev={m.platform === 'dev'} />
        ) : current?.kind === 'driver' ? (
          <DriverScreen membership={m.memberships.find((x) => x.id === current.membershipId)!} />
        ) : (
          <CitizenScreen me={m} onChanged={me.reload} />
        )}
      </main>
    </div>
  )
}
