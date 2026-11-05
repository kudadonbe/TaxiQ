import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useAuth } from './auth'
import { AdminPanel } from './components/AdminPanel'
import { CallPanel } from './components/CallPanel'
import { DispatchLog } from './components/DispatchLog'
import { DriverView } from './components/DriverView'
import { HirePanel } from './components/HirePanel'
import { QueueRow } from './components/QueueRow'
import { RequestsPanel } from './components/RequestsPanel'
import { QueueChangesLog, ReorderPanel } from './components/ReorderPanel'
import { TranslationEditor } from './components/TranslationEditor'
import { PeoplePanel } from './components/PeoplePanel'
import { useI18n } from './i18n'
import { asMapTaxi } from './rides'
import { parseOverrides } from './translations'
import { useLiveQueue } from './useLiveQueue'
import { useLocalQueue } from './useQueue'
import { usePublicTaxis } from './useRides'
import { validateCall } from './validate'

// Leaflet is only loaded when a map is shown.
const MapView = lazy(() => import('./components/MapView'))
const GameTab = lazy(() => import('./game/GameTab').then((m) => ({ default: m.GameTab })))

// The GitHub Pages copy can't sign in (Firebase only allows its own domains), so it runs the
// local demo of the operator screens.
const DEMO_HOST = location.hostname.endsWith('github.io')

// Who sees what:
//   demo     GitHub Pages: the operator screens on local data
//   staff    admin / operator: queue, map, admin (admins only)
//   driver   their offers and the map
//   public   signed out, or signed in without a role: the map and Hire a taxi
//   dev      full access, for testing: every screen, incl. driver (any taxi) and hire
type Mode = 'demo' | 'staff' | 'driver' | 'public' | 'dev'
type View = 'queue' | 'map' | 'admin' | 'driver' | 'hire' | 'game'

const EMPTY = new Set<string>()

const VIEW_AS = ['dev', 'admin', 'operator', 'driver', 'citizen'] as const
type ViewAs = (typeof VIEW_AS)[number]
const VIEW_AS_KEY = 'taxiq.viewAs'

export default function App() {
  const auth = useAuth()
  const signedIn = auth.status === 'signedIn'
  // Developers can view the app as any role ("View as" in the header). It only changes what this
  // screen shows; the real role stays dev, and the rules still treat them as dev.
  const [viewAs, setViewAsState] = useState<ViewAs>(() => {
    try {
      const v = sessionStorage.getItem(VIEW_AS_KEY)
      return VIEW_AS.find((x) => x === v) ?? 'dev'
    } catch {
      return 'dev'
    }
  })
  const setViewAs = (v: ViewAs) => {
    setViewAsState(v)
    try {
      sessionStorage.setItem(VIEW_AS_KEY, v)
    } catch {
      // Storage unavailable: the choice lasts until reload.
    }
  }
  const isDev = signedIn && auth.role === 'dev'
  const role = isDev ? (viewAs === 'citizen' ? null : viewAs) : auth.role
  const mode: Mode = DEMO_HOST
    ? 'demo'
    : signedIn && role === 'dev'
      ? 'dev'
      : signedIn && (role === 'admin' || role === 'operator')
      ? 'staff'
      : signedIn && role === 'driver'
        ? 'driver'
        : 'public'

  const local = useLocalQueue()
  const live = mode === 'staff' || mode === 'dev'
  const remote = useLiveQueue(auth.fb, live, auth.email, role === 'admin' || role === 'dev')
  const q = live ? remote : local
  const publicTaxis = usePublicTaxis(auth.fb, mode === 'public' || mode === 'driver' || mode === 'dev')
  const mapTaxis = useMemo(() => publicTaxis.map(asMapTaxi), [publicTaxis])
  const [chosen, setChosen] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  const [hireTrip, setHireTrip] = useState<{ from: [number, number]; to: [number, number] } | undefined>()

  const canAdmin = mode === 'demo' || role === 'admin' || role === 'dev'
  const { queue, history, interested, pick, call, setCall, callInProgress, canUndo, toggle, clear, undo } = q
  const callValid = Object.keys(validateCall(call)).length === 0
  // Invalid passenger details block assigning, so bad input is never attached to a dispatch.
  const assign = (id: string) => callValid && q.assign(id)

  // TaxiQ Game is open to everyone on the live site (not the demo host).
  const game: View[] = DEMO_HOST ? [] : ['game']
  const tabs: View[] =
    mode === 'dev'
      ? ['queue', 'map', 'admin', 'driver', 'hire', ...game]
      : mode === 'driver'
        ? ['driver', 'map', ...game]
        : mode === 'public'
          ? DEMO_HOST
            ? []
            : ['hire', ...game]
          : canAdmin
            ? ['queue', 'map', 'admin', ...game]
            : ['queue', 'map', ...game]
  const [viewState, setView] = useState<View>('queue')
  const view: View = tabs.includes(viewState) ? viewState : (tabs[0] ?? 'map')
  const { lang, t, toggleLang, driverName, setDvFixes } = useI18n()
  const [editingTranslations, setEditingTranslations] = useState(false)
  const canTranslate = !DEMO_HOST && (role === 'admin' || role === 'dev')

  // Live Dhivehi fixes (Admin → Translations), readable by everyone.
  const fb = auth.fb
  useEffect(() => {
    if (!fb || DEMO_HOST) return
    return fb.onSnapshot(
      fb.doc(fb.db, 'translations', 'dv'),
      (snap) => setDvFixes(parseOverrides(snap.data())),
      () => {},
    )
  }, [fb, setDvFixes])
  const operatorScreens = mode === 'demo' || mode === 'staff' || mode === 'dev'

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      {editingTranslations && canTranslate && <TranslationEditor onClose={() => setEditingTranslations(false)} />}
      <header className="sticky top-0 z-[1200] border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-2 sm:py-3">
          <h1 className="flex shrink-0 items-center gap-2 text-xl font-black tracking-tight" dir="ltr">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8 sm:size-9" />
            <span>
              Taxi<span className="text-emerald-600">Q</span>
            </span>
          </h1>
          <div className="flex items-center gap-1 text-sm sm:gap-2">
            {operatorScreens && (
              <>
                <span className="hidden rounded-full bg-slate-100 px-3 py-1 font-medium tabular-nums sm:inline">{t.inQueue(queue.length)}</span>
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo || callInProgress}
                  className="min-h-10 rounded-lg px-3 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  {t.undo}
                </button>
              </>
            )}
            {isDev && (
              <select
                value={viewAs}
                onChange={(e) => setViewAs(e.target.value as ViewAs)}
                aria-label={t.viewAs}
                title={t.viewAs}
                className={`min-h-10 rounded-lg border px-1 text-sm font-semibold ${viewAs === 'dev' ? 'border-slate-200 bg-white' : 'border-fuchsia-400 bg-fuchsia-50 text-fuchsia-800'}`}
              >
                {VIEW_AS.map((v) => (
                  <option key={v} value={v}>
                    👁 {t.viewAsRoles[v]}
                  </option>
                ))}
              </select>
            )}
            {canTranslate && (
              <button
                type="button"
                onClick={() => setEditingTranslations(true)}
                title={t.translations}
                aria-label={t.translations}
                className="min-h-10 rounded-lg border border-slate-200 px-3 hover:bg-slate-100"
              >
                ✏️
              </button>
            )}
            <button
              type="button"
              onClick={toggleLang}
              lang={lang === 'en' ? 'dv' : 'en'}
              className="min-h-10 rounded-lg border border-slate-200 px-3 font-medium text-slate-700 hover:bg-slate-100"
            >
              {t.switchTo}
            </button>
            {!DEMO_HOST &&
              (signedIn ? (
                <button type="button" onClick={auth.signOut} title={auth.email ?? ''} className="min-h-10 rounded-lg px-2 font-medium text-slate-700 hover:bg-slate-100">
                  {t.signOut}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={auth.signIn}
                  disabled={auth.status === 'loading'}
                  className="min-h-10 rounded-lg bg-slate-900 px-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
                >
                  {t.signIn}
                </button>
              ))}
          </div>
        </div>

        {tabs.length > 0 && (
          <nav className={`mx-auto grid max-w-5xl gap-1 px-4 pb-2 text-sm sm:flex ${({ 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6' } as Record<number, string>)[tabs.length] ?? 'grid-cols-3'}`} aria-label={t.nav}>
            {tabs.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-current={view === v ? 'page' : undefined}
                className={`min-h-10 rounded-lg px-3 font-semibold ${view === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {{ queue: t.queue, map: t.map, admin: t.admin, driver: t.driver, hire: t.hireTab, game: `🎮 ${t.gameTab}` }[v]}
                {v === 'queue' && <span className="ms-1 tabular-nums opacity-70 sm:hidden">({queue.length})</span>}
              </button>
            ))}
          </nav>
        )}

        {/* Mode and account status. */}
        <div className="mx-auto max-w-5xl px-4 pb-2 text-xs">
          {mode === 'staff' || mode === 'driver' || mode === 'dev' ? (
            <p className="flex items-center gap-2 text-emerald-800">
              <span className="rounded bg-emerald-600 px-1.5 py-0.5 font-bold text-white">{t.liveBadge}</span>
              <bdi dir="ltr" className="truncate">
                {auth.email}
              </bdi>
              <span className="text-slate-500">· {t.roles[auth.role!]}</span>
            </p>
          ) : mode === 'demo' ? (
            <p className="flex items-center gap-2 text-slate-500">
              <span className="rounded bg-slate-200 px-1.5 py-0.5 font-bold text-slate-700">{t.demoBadge}</span>
              <span>{t.demoNote}</span>
            </p>
          ) : (
            signedIn && (
              <p className="text-slate-500">
                <bdi dir="ltr">{auth.email}</bdi>
              </p>
            )
          )}
          {auth.error && <p className="mt-1 font-semibold text-rose-700">{t.signInError(auth.error)}</p>}
          {operatorScreens && q.error && <p className="mt-1 font-semibold text-rose-700">{t.saveError(q.error)}</p>}
        </div>

        {operatorScreens && view === 'queue' && (
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 pb-3 sm:gap-3">
            {pick || callInProgress ? (
              <>
                <p className="min-w-0 flex-1 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 sm:px-4 sm:py-3">
                  {pick ? (
                    <>
                      <span className="font-bold">{t.answeredCount(interested.size)}</span>
                      <span className="block truncate">
                        {t.nextInLine} <span className="font-bold tabular-nums">{pick.taxiNo}</span> · {driverName(pick.driver)}
                      </span>
                    </>
                  ) : (
                    <span className="block">{t.hint}</span>
                  )}
                  {call.pickup && (
                    <span className="block truncate text-emerald-800">
                      📍 <bdi>{call.pickup}</bdi>
                    </span>
                  )}
                  {!callValid && (
                    <span className="block font-semibold text-rose-700">
                      {t.callTitle}: {t.notValid}
                    </span>
                  )}
                </p>
                <button type="button" onClick={clear} className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
                  {t.cancelCall}
                </button>
              </>
            ) : (
              <p className="flex-1 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 sm:px-4 sm:py-3">{t.hint}</p>
            )}
          </div>
        )}
      </header>

      {view === 'game' ? (
        <main className="isolate mx-auto max-w-6xl px-2 py-3 sm:px-4 sm:py-6">
          <Suspense fallback={<p className="text-sm text-slate-500">{t.loading}</p>}>
            <GameTab />
          </Suspense>
        </main>
      ) : mode === 'public' || view === 'hire' ? (
        <main className="isolate mx-auto grid max-w-5xl gap-4 px-2 py-3 sm:px-4 sm:py-6 lg:grid-cols-[22rem_1fr]">
          <div className="lg:self-start">
            <HirePanel taxis={publicTaxis} chosen={chosen} onClearChoice={() => setChosen(null)} onTrip={setHireTrip} />
          </div>
          <Suspense fallback={<p className="text-sm text-slate-500">{t.loading}</p>}>
            <MapView taxis={mapTaxis} interested={EMPTY} pickupAt={undefined} onPickTaxi={setChosen} trip={hireTrip} />
          </Suspense>
        </main>
      ) : view === 'driver' ? (
        <main className="mx-auto max-w-xl px-4 py-4 sm:py-6">
          <DriverView taxis={publicTaxis} />
        </main>
      ) : view === 'admin' ? (
        <main className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
          <div className="space-y-6">
            {live && canAdmin && <PeoplePanel taxis={queue} />}
            <AdminPanel taxis={queue} onRegister={q.register} onRemove={q.remove} onSuspend={q.suspend} onLift={q.lift} />
          </div>
        </main>
      ) : view === 'map' ? (
        <main className="isolate mx-auto max-w-5xl px-2 py-2 sm:px-4 sm:py-6">
          <Suspense fallback={<p className="text-sm text-slate-500">{t.loading}</p>}>
            {mode === 'driver' ? (
              <MapView taxis={mapTaxis} interested={EMPTY} pickupAt={undefined} />
            ) : (
              <MapView taxis={queue} interested={interested} pickupAt={call.pickupAt} trip={call.pickupAt && call.destinationAt ? { from: call.pickupAt, to: call.destinationAt } : undefined} />
            )}
          </Suspense>
        </main>
      ) : (
        <main className="mx-auto grid max-w-5xl gap-6 px-4 py-4 sm:py-6 lg:grid-cols-[1fr_18rem]">
          <section className="space-y-3">
            <CallPanel call={call} onChange={setCall} />
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{t.queue}</h2>
              {!reordering && queue.length > 1 && (
                <button
                  type="button"
                  onClick={() => setReordering(true)}
                  disabled={callInProgress}
                  title={callInProgress ? t.callBusy : undefined}
                  className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
                >
                  ↕ {t.reorder}
                </button>
              )}
            </div>
            {reordering && (
              <ReorderPanel
                queue={queue}
                onClose={() => setReordering(false)}
                onSave={(order, kind, reason, note) => {
                  q.reorder(order, kind, reason, note)
                  setReordering(false)
                }}
              />
            )}
            {live && !q.loaded && <p className="text-sm text-slate-500">{t.loading}</p>}
            {live && q.loaded && !queue.length && (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                <p>{t.liveEmpty}</p>
                {q.seedDemo && canAdmin && (
                  <button type="button" onClick={q.seedDemo} className="mt-2 min-h-10 rounded-lg bg-emerald-500 px-4 font-bold text-slate-950 hover:bg-emerald-400">
                    {t.seedDemo}
                  </button>
                )}
              </div>
            )}
            {/* Left gutter is the room a row slides into when its driver answers. */}
            <ol className={`space-y-2 pl-20 ${reordering ? 'hidden' : ''}`}>
              {queue.map((taxi, i) => (
                <QueueRow
                  key={taxi.id}
                  taxi={taxi}
                  position={i + 1}
                  interested={interested.has(taxi.id)}
                  picked={pick?.id === taxi.id}
                  onToggle={() => toggle(taxi.id)}
                  onAssign={() => assign(taxi.id)}
                />
              ))}
            </ol>
          </section>

          <aside className="space-y-4">
            {live && <RequestsPanel taxis={queue} />}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{t.recent}</h2>
              <DispatchLog history={history} queue={queue} callInProgress={callInProgress} onReopen={q.reopen} />
              <QueueChangesLog changes={q.changes} queue={queue} />
              {q.reset && (
                <button type="button" onClick={q.reset} className="text-sm text-slate-500 underline hover:text-slate-700">
                  {t.reset}
                </button>
              )}
            </section>
          </aside>
        </main>
      )}
    </div>
  )
}
