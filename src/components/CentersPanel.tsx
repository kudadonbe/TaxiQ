import { Building2, LocateFixed } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth'
import { MAIN, saveCenter, type Center } from '../centers'
import { useI18n } from '../i18n'

// Management -> Centers (platform admins and developers): the taxi centers. Each has its own queue,
// taxis, dispatch log, fare table and staff. Add a center here, then give its admins the Admin role
// with this center in Management -> Users.
export function CentersPanel({ centers }: { centers: Center[] }) {
  const { fb, email } = useAuth()
  const { t } = useI18n()
  const [draft, setDraft] = useState<{ id?: string; name: string; nameDv: string; at: [number, number] | null } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const valid = !!draft && draft.name.trim().length > 1 && draft.name.trim().length <= 60 && draft.nameDv.length <= 60
  const here = () => {
    if (!draft || !('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (p) => setDraft({ ...draft, at: [Math.round(p.coords.latitude * 1e4) / 1e4, Math.round(p.coords.longitude * 1e4) / 1e4] }),
      () => setMsg(t.shareDenied),
      { enableHighAccuracy: false, timeout: 15_000 },
    )
  }
  const box = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base'
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t.centersIntro}</p>
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {centers.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-2">
            <Building2 className="size-5 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{c.name}</span>
              {c.nameDv && <bdi className="block truncate text-sm text-slate-500">{c.nameDv}</bdi>}
              {c.id === MAIN && <span className="text-xs text-slate-400">{t.centerFirst}</span>}
            </span>
            <button type="button" onClick={() => setDraft({ id: c.id, name: c.name, nameDv: c.nameDv, at: c.at })} className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm font-semibold">
              {t.vehEdit}
            </button>
          </li>
        ))}
      </ul>
      {!draft && (
        <button type="button" onClick={() => setDraft({ name: '', nameDv: '', at: null })} className="min-h-11 rounded-xl bg-slate-900 px-4 font-semibold text-white">
          {t.centerAdd}
        </button>
      )}
      {draft && (
        <section className="space-y-3 rounded-xl border-2 border-emerald-300 bg-white p-4">
          <label className="block">
            <span className="text-sm font-medium">{t.centerName}</span>
            <input value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={box} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">{t.centerNameDv}</span>
            <input value={draft.nameDv} maxLength={60} dir="rtl" onChange={(e) => setDraft({ ...draft, nameDv: e.target.value })} className={box} />
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">{draft.at ? t.centerAt(draft.at[0], draft.at[1]) : t.centerNoPlace}</span>
            <button type="button" onClick={here} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 px-3 font-semibold">
              <LocateFixed className="size-4" aria-hidden="true" /> {t.centerUseHere}
            </button>
          </div>
          {msg && <p className="text-sm font-semibold text-slate-700">{msg}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!valid || busy || !fb}
              onClick={() => {
                if (!fb || !draft) return
                setBusy(true)
                saveCenter(fb, draft, email ?? '')
                  .then(() => {
                    setDraft(null)
                    setMsg(t.centerSaved)
                  })
                  .catch((e: { code?: string }) => setMsg(t.saveError(e.code ?? 'error')))
                  .finally(() => setBusy(false))
              }}
              className="min-h-11 flex-1 rounded-lg bg-emerald-600 font-bold text-white disabled:opacity-40"
            >
              {t.save}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold">
              {t.cancel}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
