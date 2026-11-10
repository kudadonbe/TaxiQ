import { useState } from 'react'
import { useAuth } from '../auth'
import { taxiFare, validFares, type FareTable } from '../core/taxiFare'
import { useI18n } from '../i18n'
import { saveFares, useFareTable } from '../taxiFares'

// Management -> Taxis (admins): the taxi fare. Passengers see each trip's total from it before
// sending the trip; it's fixed once booked.
export function TaxiFaresPanel({ center = 'main' }: { center?: string }) {
  const { fb, email } = useAuth()
  const { t } = useI18n()
  const current = useFareTable(fb, true, center)
  const [draft, setDraft] = useState<FareTable | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const f = draft ?? current ?? { base: 0, perKm: 0, minimum: 0 }
  const field = (k: keyof FareTable, label: string) => (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        min={0}
        max={10000}
        inputMode="decimal"
        value={f[k]}
        onChange={(e) => setDraft({ ...f, [k]: Number(e.target.value) })}
        className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base"
      />
    </label>
  )
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-bold">{t.fareTitle}</h3>
      <p className="text-sm text-slate-600">{current ? t.fareExample(taxiFare(current, 2000)) : t.fareNotSet}</p>
      <p className="rounded-lg bg-sky-50 p-2 text-sm text-sky-900">{t.fareGreaterMale}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {field('base', t.fareBase)}
        {field('perKm', t.farePerKm)}
        {field('minimum', t.fareMinimum)}
      </div>
      {msg && <p className="text-sm font-semibold text-slate-700">{msg}</p>}
      <button
        type="button"
        disabled={!fb || !draft || !validFares(f)}
        onClick={() =>
          fb &&
          saveFares(fb, f, email ?? '', center)
            .then(() => {
              setDraft(null)
              setMsg(t.fareSaved)
            })
            .catch((e: { code?: string; message?: string }) => setMsg(t.saveError(e.code ?? e.message ?? 'error')))
        }
        className="min-h-11 rounded-xl bg-slate-900 px-4 font-semibold text-white disabled:opacity-40"
      >
        {t.fareSave}
      </button>
    </section>
  )
}
