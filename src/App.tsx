import { useState } from 'react'
import { AdminPanel } from './components/AdminPanel'
import { QueueRow } from './components/QueueRow'
import { useI18n } from './i18n'
import { useQueue } from './useQueue'

export default function App() {
  const { queue, history, interested, pick, toggle, clear, assign, undo, register, remove, reset } = useQueue()
  const [view, setView] = useState<'queue' | 'admin'>('queue')
  const { lang, t, toggleLang, driverName, time } = useI18n()

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-black tracking-tight">
            Taxi<span className="text-emerald-600">Q</span>
          </h1>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium tabular-nums">{t.inQueue(queue.length)}</span>
            <button
              type="button"
              onClick={undo}
              disabled={!history.length}
              className="rounded-lg px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              {t.undo}
            </button>
            <button
              type="button"
              onClick={() => setView(view === 'queue' ? 'admin' : 'queue')}
              aria-pressed={view === 'admin'}
              className="rounded-lg px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
            >
              {view === 'queue' ? t.admin : t.backToQueue}
            </button>
            <button
              type="button"
              onClick={toggleLang}
              lang={lang === 'en' ? 'dv' : 'en'}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
            >
              {t.switchTo}
            </button>
          </div>
        </div>

        {view === 'queue' && (
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 pb-3">
            {pick ? (
              <>
                <button
                  type="button"
                  onClick={assign}
                  className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-start font-bold text-slate-950 transition hover:bg-emerald-400 active:scale-[0.99] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                >
                  {t.assignTo} <span className="tabular-nums">{pick.taxiNo}</span>
                  <span className="font-medium"> · {driverName(pick.driver)}</span>
                  <span className="block text-sm font-medium text-emerald-950/70">
                    {t.answeredCount(interested.size)}
                  </span>
                </button>
                <button type="button" onClick={clear} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
                  {t.clear}
                </button>
              </>
            ) : (
              <p className="flex-1 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
                {t.hint}
              </p>
            )}
          </div>
        )}
      </header>

      {view === 'admin' ? (
        <main className="mx-auto max-w-5xl px-4 py-6">
          <AdminPanel taxis={queue} onRegister={register} onRemove={remove} />
        </main>
      ) : (
        <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1fr_18rem]">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-500">{t.queue}</h2>
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
                />
              ))}
            </ol>
          </section>

          <aside className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{t.recent}</h2>
            {history.length ? (
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {history.map(({ taxi, at }) => (
                  <li key={`${taxi.id}-${at}`} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>
                      <span className="font-bold tabular-nums">{taxi.taxiNo}</span>{' '}
                      <span className="text-slate-500">{driverName(taxi.driver)}</span>
                    </span>
                    <time className="text-slate-400 tabular-nums" dateTime={new Date(at).toISOString()}>
                      {time.format(at)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                {t.noRides}
              </p>
            )}
            <button type="button" onClick={reset} className="text-sm text-slate-500 underline hover:text-slate-700">
              {t.reset}
            </button>
          </aside>
        </main>
      )}
    </div>
  )
}
