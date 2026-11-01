import { useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import type { Taxi } from '../types'
import { normalize, validate, type Field, type FieldError, type TaxiInput } from '../validate'
import { Plate } from './Plate'

const empty: TaxiInput = { taxiNo: '', taxiReg: '', name: '', nameDv: '', phone: '' }
const fields: { key: Field; inputMode?: 'numeric'; dir?: 'ltr' | 'rtl' }[] = [
  { key: 'taxiNo', inputMode: 'numeric', dir: 'ltr' },
  { key: 'taxiReg', dir: 'ltr' },
  { key: 'name', dir: 'ltr' },
  { key: 'nameDv', dir: 'rtl' },
  { key: 'phone', inputMode: 'numeric', dir: 'ltr' },
]

interface Props {
  taxis: Taxi[]
  onRegister: (input: TaxiInput) => void
  onRemove: (id: string) => void
}

export function AdminPanel({ taxis, onRegister, onRemove }: Props) {
  const { t, driverName } = useI18n()
  const [form, setForm] = useState<TaxiInput>(empty)
  const [errors, setErrors] = useState<Partial<Record<Field, FieldError>>>({})
  const [done, setDone] = useState<string | null>(null)
  // Two-tap remove instead of a blocking confirm() dialog.
  const [armed, setArmed] = useState<string | null>(null)

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
              <li key={taxi.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-10 shrink-0 text-center text-xl font-black tabular-nums sm:w-12">{taxi.taxiNo}</span>
                <span className="hidden shrink-0 sm:block">
                  <Plate reg={taxi.taxiReg} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{driverName(taxi.driver)}</span>
                  <span className="block text-sm text-slate-500 tabular-nums">
                    {taxi.driver.phone}
                    <span className="ms-2 font-mono sm:hidden">{taxi.taxiReg}</span>
                  </span>
                </span>
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
              </li>
            ))}
        </ul>
      </section>
    </div>
  )
}
