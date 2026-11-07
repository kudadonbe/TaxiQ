import { useState, type FormEvent } from 'react'
import { initialTaxis } from '../data/taxis'
import { useI18n } from '../i18n'
import { seatsOf, type SuspendReason, type Taxi } from '../types'
import { isFreeText, normalize, SUSPEND_REASONS, validate, type Field, type FieldError, type TaxiInput } from '../validate'
import { Plate } from './Plate'

// The sample drivers that ship with the app (shown with a Demo badge).
const demoIds = new Set(initialTaxis.map((t) => t.id))

const empty: TaxiInput = { taxiNo: '', taxiReg: '', name: '', nameDv: '', phone: '', seats: '4' }
const fields: { key: Field; inputMode?: 'numeric'; dir?: 'ltr' | 'rtl' }[] = [
  { key: 'taxiNo', inputMode: 'numeric', dir: 'ltr' },
  { key: 'taxiReg', dir: 'ltr' },
  { key: 'name', dir: 'ltr' },
  { key: 'nameDv', dir: 'rtl' },
  { key: 'phone', inputMode: 'numeric', dir: 'ltr' },
  { key: 'seats', inputMode: 'numeric', dir: 'ltr' },
]

interface Props {
  taxis: Taxi[]
  onRegister: (input: TaxiInput) => void
  onRemove: (id: string) => void
  onSuspend: (id: string, reason: SuspendReason, note: string) => void
  onLift: (id: string) => void
  onSeats?: (id: string, seats: number) => void
}

export function AdminPanel({ taxis, onRegister, onRemove, onSuspend, onLift, onSeats }: Props) {
  const { t, driverName } = useI18n()
  const [form, setForm] = useState<TaxiInput>(empty)
  const [errors, setErrors] = useState<Partial<Record<Field, FieldError>>>({})
  const [done, setDone] = useState<string | null>(null)
  // Two-tap remove instead of a blocking confirm() dialog.
  const [armed, setArmed] = useState<string | null>(null)
  // Taxi whose suspend form is open, with the reason and note being entered.
  const [suspending, setSuspending] = useState<{ id: string; reason: SuspendReason; note: string } | null>(null)
  const noteValid = !suspending || isFreeText(suspending.note.trim())

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const input = normalize(form)
    const errs = validate(input, taxis)
    setErrors(errs)
    if (Object.keys(errs).length) return
    onRegister(input)
    setForm(empty)
    setDone(t.registered(input.taxiNo))
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <section className="h-fit rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-4 font-bold">{t.registerTitle}</h2>
        <form onSubmit={submit} noValidate className="space-y-3">
          {fields.map(({ key, inputMode, dir }) => (
            <label key={key} className="block">
              <span className="text-sm font-medium text-slate-700">{t.fields[key]}</span>
              <input
                value={form[key]}
                onChange={(e) => {
                  setForm({ ...form, [key]: e.target.value })
                  setDone(null)
                }}
                inputMode={inputMode}
                dir={dir}
                maxLength={60}
                autoComplete="off"
                aria-invalid={!!errors[key]}
                aria-describedby={`${key}-hint`}
                className={`mt-1 block w-full rounded-lg border px-3 py-2 text-base ${
                  errors[key] ? 'border-rose-500' : 'border-slate-300'
                } focus:outline-2 focus:outline-emerald-500`}
              />
              <span id={`${key}-hint`} className={`text-xs ${errors[key] ? 'text-rose-600' : 'text-slate-500'}`}>
                {errors[key] ? t.errors[errors[key]] : t.hints[key]}
              </span>
            </label>
          ))}
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-500 py-3 font-bold text-slate-950 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            {t.register}
          </button>
          {done && (
            <p role="status" className="text-sm text-emerald-700">
              {done}
            </p>
          )}
        </form>
        <p className="mt-4 text-xs text-slate-500">{t.adminNote}</p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-500">
          {t.registeredTitle(taxis.length)}
        </h2>
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {[...taxis]
            .sort((a, b) => Number(a.taxiNo) - Number(b.taxiNo))
            .map((taxi) => (
              <li key={taxi.id} className={`px-3 py-2 ${taxi.suspended ? 'bg-rose-50' : ''}`}>
                <div className="flex items-center gap-3">
                  <span
                    className={`w-10 shrink-0 rounded-lg text-center text-xl font-black tabular-nums sm:w-12 ${
                      taxi.suspended ? 'bg-rose-600 text-white' : ''
                    }`}
                  >
                    {taxi.taxiNo}
                  </span>
                  <span className="hidden shrink-0 sm:block">
                    <Plate reg={taxi.taxiReg} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">{driverName(taxi.driver)}</span>
                      {demoIds.has(taxi.id) && (
                        <span className="shrink-0 rounded bg-slate-200 px-1.5 text-[10px] font-bold uppercase text-slate-600">{t.demo}</span>
                      )}
                    </span>
                    <span className="block text-sm text-slate-500 tabular-nums">
                      {taxi.driver.phone}
                      <span className="ms-2 font-mono sm:hidden">{taxi.taxiReg}</span>
                    </span>
                    {taxi.suspended && (
                      <span className="block text-xs font-semibold text-rose-700">
                        {t.suspended} · {t.reasons[taxi.suspended.reason]}
                        {taxi.suspended.note && ` · ${taxi.suspended.note}`}
                      </span>
                    )}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  {onSeats && (
                    <label className="me-auto flex items-center gap-1 text-sm text-slate-600">
                      {t.seatsShort}
                      <select
                        value={seatsOf(taxi)}
                        onChange={(e) => onSeats(taxi.id, Number(e.target.value))}
                        className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-base tabular-nums"
                      >
                        {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {taxi.suspended ? (
                    <button
                      type="button"
                      onClick={() => onLift(taxi.id)}
                      className="min-h-10 rounded-lg border border-emerald-600 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                    >
                      {t.lift}
                    </button>
                  ) : (
                    suspending?.id !== taxi.id && (
                      <button
                        type="button"
                        onClick={() => setSuspending({ id: taxi.id, reason: 'fees', note: '' })}
                        className="min-h-10 rounded-lg border border-rose-300 px-3 text-sm font-medium text-rose-700 hover:bg-rose-50"
                      >
                        {t.suspend}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (armed === taxi.id) {
                        onRemove(taxi.id)
                        setArmed(null)
                      } else setArmed(taxi.id)
                    }}
                    onBlur={() => armed === taxi.id && setArmed(null)}
                    className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium ${
                      armed === taxi.id ? 'bg-rose-600 text-white' : 'text-rose-700 hover:bg-rose-50'
                    }`}
                  >
                    {armed === taxi.id ? t.confirmRemove : t.remove}
                  </button>
                </div>

                {suspending?.id === taxi.id && (
                  <form
                    className="mt-2 grid gap-2 rounded-lg border border-rose-200 bg-white p-3 sm:grid-cols-[10rem_1fr_auto_auto] sm:items-end"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (!noteValid) return
                      onSuspend(taxi.id, suspending.reason, suspending.note)
                      setSuspending(null)
                    }}
                  >
                    <label className="block">
                      <span className="text-xs font-medium text-slate-700">{t.suspendReason}</span>
                      <select
                        value={suspending.reason}
                        onChange={(e) => setSuspending({ ...suspending, reason: e.target.value as SuspendReason })}
                        className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-2 text-base"
                      >
                        {SUSPEND_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {t.reasons[r]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-700">{t.suspendNote}</span>
                      <input
                        value={suspending.note}
                        onChange={(e) => setSuspending({ ...suspending, note: e.target.value })}
                        maxLength={120}
                        autoComplete="off"
                        aria-invalid={!noteValid}
                        className={`mt-1 block min-h-10 w-full rounded-lg border px-3 text-base ${
                          noteValid ? 'border-slate-300' : 'border-rose-500'
                        }`}
                      />
                    </label>
                    <button type="submit" className="min-h-10 rounded-lg bg-rose-600 px-3 text-sm font-bold text-white hover:bg-rose-500">
                      {t.confirmSuspend}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSuspending(null)}
                      className="min-h-10 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
                    >
                      {t.cancel}
                    </button>
                  </form>
                )}
              </li>
            ))}
        </ul>
      </section>
    </div>
  )
}
