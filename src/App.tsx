import { lazy, Suspense, useState } from 'react'
import { AdminPanel } from './components/AdminPanel'
import { CallPanel } from './components/CallPanel'
import { DispatchLog } from './components/DispatchLog'
import { QueueRow } from './components/QueueRow'
import { useI18n } from './i18n'
import { useQueue } from './useQueue'
import { validateCall } from './validate'

// Leaflet is only loaded when the map is opened.
const MapView = lazy(() => import('./components/MapView'))

type View = 'queue' | 'map' | 'admin'

export default function App() {
  const q = useQueue()
  const { queue, history, interested, pick, call, setCall, callInProgress, canUndo, toggle, clear, undo } = q
  const callValid = Object.keys(validateCall(call)).length === 0
  // Invalid passenger details block assigning, so bad input is never attached to a dispatch.
  const assign = (id: string) => callValid && q.assign(id)
  const [view, setView] = useState<View>('queue')
  const { lang, t, toggleLang, driverName } = useI18n()

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-2 sm:py-3">
          <h1 className="flex shrink-0 items-center gap-2 text-xl font-black tracking-tight" dir="ltr">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8 sm:size-9" />
            <span>
              Taxi<span className="text-emerald-600">Q</span>
            </span>
          </h1>
          <div className="flex items-center gap-1 text-sm sm:gap-2">
            <span className="hidden rounded-full bg-slate-100 px-3 py-1 font-medium tabular-nums sm:inline">{t.inQueue(queue.length)}</span>
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo || callInProgress}
              className="min-h-10 rounded-lg px-3 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              {t.undo}
            </button>
            <button
              type="button"
              onClick={toggleLang}
              lang={lang === 'en' ? 'dv' : 'en'}
              className="min-h-10 rounded-lg border border-slate-200 px-3 font-medium text-slate-700 hover:bg-slate-100"
            >
              {t.switchTo}
            </button>
          </div>
        </div>

        <nav className="mx-auto grid max-w-5xl grid-cols-3 gap-1 px-4 pb-2 text-sm sm:flex" aria-label={t.nav}>
          {(['queue', 'map', 'admin'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-current={view === v ? 'page' : undefined}
              className={`min-h-10 rounded-lg px-3 font-semibold ${
                view === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {{ queue: t.queue, map: t.map, admin: t.admin }[v]}
              {v === 'queue' && <span className="ms-1 tabular-nums opacity-70 sm:hidden">({queue.length})</span>}
            </button>
          ))}
        </nav>

        {view === 'queue' && (
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
                  {!callValid && <span className="block font-semibold text-rose-700">{t.callTitle}: {t.notValid}</span>}
                </p>
                <button type="button" onClick={clear} className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
                  {t.cancelCall}
                </button>
              </>
            ) : (
              <p className="flex-1 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 sm:px-4 sm:py-3">
                {t.hint}
              </p>
            )}
          </div>
        )}
      </header>

      {view === 'admin' ? (
        <main className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
          <AdminPanel taxis={queue} onRegister={q.register} onRemove={q.remove} onSuspend={q.suspend} onLift={q.lift} />
        </main>
      ) : view === 'map' ? (
        <main className="isolate mx-auto max-w-5xl px-2 py-2 sm:px-4 sm:py-6">
          <Suspense fallback={<p className="text-sm text-slate-500">…</p>}>
            <MapView taxis={queue} interested={interested} pickupAt={call.pickupAt} />
          </Suspense>
        </main>
      ) : (
        <main className="mx-auto grid max-w-5xl gap-6 px-4 py-4 sm:py-6 lg:grid-cols-[1fr_18rem]">
          <section className="space-y-3">
            <CallPanel call={call} onChange={setCall} />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{t.queue}</h2>
            {/* Left gutter is the room a row slides into when its driver answers. */}
            <ol className="space-y-2 pl-20">
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

          <aside className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{t.recent}</h2>
            <DispatchLog history={history} queue={queue} callInProgress={callInProgress} onReopen={q.reopen} />
            <button type="button" onClick={q.reset} className="text-sm text-slate-500 underline hover:text-slate-700">
              {t.reset}
            </button>
          </aside>
        </main>
      )}
    </div>
  )
}
