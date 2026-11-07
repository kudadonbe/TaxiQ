import { Radar } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MOVING } from '../core/presence'
import { MOVING_ICONS } from './iconStyles'
import { useI18n } from '../i18n'
import type { useShareMe, Visibility } from '../usePresence'

// Show me on the map (opt-in): who may see me, how I'm moving (guessed, can be corrected), Stop.
export function ShareMe({ me }: { me: ReturnType<typeof useShareMe> }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])
  const left = me.sharing ? Math.max(1, Math.ceil((me.sharing.until - now) / 60_000)) : 0

  // Sharing and folded: one line, with Change and Stop.
  if (me.sharing && !open)
    return (
      <div className="flex items-center gap-2 text-sm">
        <Radar className="size-4 shrink-0 text-sky-600" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-semibold">{t.shareOn(left)}</span>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-lg bg-white/70 px-2 py-1 text-xs font-bold">
          {t.shareChange}
        </button>
        <button type="button" onClick={me.stop} className="shrink-0 rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-white">
          {t.stopFollowing}
        </button>
      </div>
    )

  if (!me.sharing && !open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white/70 px-2 text-xs font-bold text-slate-800 shadow-sm">
        <Radar className="size-4 text-sky-600" aria-hidden="true" /> {t.shareMe}
      </button>
    )

  const choice = (v: Visibility, label: string, note: string) => (
    <label className={`flex cursor-pointer items-start gap-2 rounded-lg p-2 ${me.sharing?.visibility === v ? 'bg-sky-100/80' : 'bg-white/50'}`}>
      <input
        type="radio"
        name="share-visibility"
        checked={me.sharing?.visibility === v}
        onChange={() => {
          if (me.sharing) me.setVisibility(v)
          else me.start(v)
          setOpen(false) // chosen: fold to one line
        }}
        className="mt-0.5 accent-sky-600"
      />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-slate-600">{note}</span>
      </span>
    </label>
  )

  return (
    <div className="space-y-2 rounded-xl border border-white/60 bg-white/60 p-2 text-sm backdrop-blur-[3px]">
      <p className="flex items-center gap-1.5 font-bold">
        <Radar className="size-4 text-sky-600" aria-hidden="true" /> {me.sharing ? t.shareOn(left) : t.shareMe}
      </p>
      {!me.sharing && <p className="text-xs text-slate-600">{t.shareIntro}</p>}
      {choice('staff', t.shareStaff, t.shareStaffNote)}
      {choice('public', t.sharePublic, t.sharePublicNote)}
      {me.sharing && (
        <div>
          <p className="mb-1 text-xs text-slate-600">{me.picked ? t.sharePicked : t.shareGuessed}</p>
          <div className="grid grid-cols-6 gap-1" role="group" aria-label={t.shareHow}>
            {MOVING.map((m) => {
              const Icon = MOVING_ICONS[m]
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => me.pick(me.picked === m ? null : m)}
                  aria-pressed={me.mode === m}
                  title={t.moving[m]}
                  aria-label={t.moving[m]}
                  className={`grid min-h-9 place-items-center rounded-lg ${me.mode === m ? 'bg-sky-600 text-white' : 'bg-white/70 text-slate-700'}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-xs font-semibold">{t.moving[me.mode]}</p>
        </div>
      )}
      {me.error && <p className="text-xs font-semibold text-rose-700">{me.error === 'location_denied' ? t.shareDenied : t.saveError(me.error)}</p>}
      <div className="flex gap-2">
        {me.sharing ? (
          <>
            <button type="button" onClick={() => setOpen(false)} className="min-h-9 flex-1 rounded-lg bg-white/70 font-semibold">
              {t.close}
            </button>
            <button type="button" onClick={me.stop} className="min-h-9 flex-1 rounded-lg bg-slate-900 font-bold text-white">
              {t.shareStop}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setOpen(false)} className="min-h-9 flex-1 rounded-lg bg-white/70 font-semibold">
            {t.cancel}
          </button>
        )}
      </div>
    </div>
  )
}
