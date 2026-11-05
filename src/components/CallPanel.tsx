import { ArrowRight, ChevronDown, ChevronUp, Phone } from 'lucide-react'
import { icFlip } from './iconStyles'
import { useState } from 'react'
import { useI18n } from '../i18n'
import type { CallInfo } from '../types'
import { hasCallInfo, validateCall } from '../validate'
import { PlaceInput } from './PlaceInput'

interface Props {
  call: CallInfo
  onChange: (call: CallInfo) => void
}

// Passenger details for the call being taken. Collapsed to a one-line summary until opened, so
// the queue stays visible on a phone. Nothing here is saved to storage.
export function CallPanel({ call, onChange }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const errors = validateCall(call)
  const filled = hasCallInfo(call)

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open || undefined}
        className="flex min-h-12 w-full items-center gap-2 px-3 text-start"
      >
        <Phone className="size-5 shrink-0 text-slate-500" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t.callTitle}</span>
          {!open && (
            <span className={`block truncate text-sm ${filled ? 'text-slate-700' : 'text-slate-400'}`}>
              {filled ? (
                call.pickup || call.destination ? (
                  <>
                    <bdi>{call.pickup}</bdi>
                    {call.destination && (
                      <>
                        {' '}
                        <ArrowRight className={icFlip} aria-hidden="true" /> <bdi>{call.destination}</bdi>
                      </>
                    )}
                    {call.phone && <bdi dir="ltr"> {call.phone}</bdi>}
                  </>
                ) : (
                  <bdi>{call.phone || call.note}</bdi>
                )
              ) : `${t.pickup}, ${t.destination}, ${t.passengerPhone}`}
            </span>
          )}
        </span>
        <span aria-hidden className="text-slate-400">
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </span>
      </button>

      {open && (
        <div className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-2">
          <PlaceInput
            id="call-pickup"
            label={t.pickup}
            hint={t.pickupHint}
            value={call.pickup}
            error={!!errors.pickup}
            onChange={(pickup, pickupAt) => onChange({ ...call, pickup, pickupAt })}
          />
          <PlaceInput
            id="call-destination"
            label={`${t.destination} (${t.optional})`}
            hint={t.pickupHint}
            value={call.destination}
            error={!!errors.destination}
            onChange={(destination, destinationAt) => onChange({ ...call, destination, destinationAt })}
          />
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              {t.passengerPhone} ({t.optional})
            </span>
            <input
              type="tel"
              inputMode="numeric"
              dir="ltr"
              value={call.phone}
              onChange={(e) => onChange({ ...call, phone: e.target.value })}
              maxLength={7}
              autoComplete="off"
              aria-invalid={!!errors.phone}
              className={`mt-1 block min-h-11 w-full rounded-lg border px-3 text-base ${
                errors.phone ? 'border-rose-500' : 'border-slate-300'
              } focus:outline-2 focus:outline-emerald-500`}
            />
            <span className={`text-xs ${errors.phone ? 'text-rose-600' : 'text-slate-500'}`}>
              {errors.phone ? t.notValid : t.hints.phone}
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              {t.callNote} ({t.optional})
            </span>
            <input
              value={call.note}
              onChange={(e) => onChange({ ...call, note: e.target.value })}
              maxLength={120}
              autoComplete="off"
              aria-invalid={!!errors.note}
              className={`mt-1 block min-h-11 w-full rounded-lg border px-3 text-base ${
                errors.note ? 'border-rose-500' : 'border-slate-300'
              } focus:outline-2 focus:outline-emerald-500`}
            />
            {errors.note && <span className="text-xs text-rose-600">{t.notValid}</span>}
          </label>
        </div>
      )}
    </section>
  )
}
