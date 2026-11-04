import { useI18n } from '../i18n'
import type { Taxi } from '../types'
import { Avatar } from './Avatar'
import { Plate } from './Plate'

interface Props {
  taxi: Taxi
  position: number
  interested: boolean
  picked: boolean
  onToggle: () => void
  onAssign: () => void
}

// One taxi in the rank. Tapping marks the driver as having answered the radio call: the row slides
// left and uncovers an Assign button. The answered driver highest in the queue ("picked") gets the
// filled button, but the operator can assign any answered driver. A suspended taxi shows the red
// side of its card, like the flipped physical tag: same place in the queue, but it can't be tapped.
export function QueueRow({ taxi, position, interested, picked, onToggle, onAssign }: Props) {
  const { t, driverName } = useI18n()
  const name = driverName(taxi.driver)
  const suspended = taxi.suspended

  if (suspended) {
    return (
      <li>
        <div
          key="red"
          role="group"
          aria-label={t.suspendedRowLabel(taxi.taxiNo, name, t.reasons[suspended.reason])}
          className="flex min-h-14 w-full animate-flip items-center gap-2 rounded-xl border-2 border-rose-800 bg-rose-600 p-2.5 text-white shadow-sm sm:gap-3 sm:p-3"
        >
          <span className="w-5 shrink-0 text-center text-xs font-medium text-rose-200 tabular-nums sm:w-6 sm:text-sm">{position}</span>
          <span className="w-10 shrink-0 text-center text-xl font-black tabular-nums sm:w-12 sm:text-2xl">{taxi.taxiNo}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{name}</span>
            <span className="block truncate text-xs font-semibold uppercase tracking-widest text-rose-100">
              {t.suspended} · {t.reasons[suspended.reason]}
              {suspended.note && <span className="normal-case tracking-normal"> · {suspended.note}</span>}
            </span>
          </span>
        </div>
      </li>
    )
  }

  return (
    <li className="relative">
      {/* Only rendered while slid out, so it is never focusable hidden under the row. */}
      {interested && (
        <button
          type="button"
          onClick={onAssign}
          aria-label={t.assignRowLabel(taxi.taxiNo, name)}
          className={`absolute inset-y-1 right-0 w-[4.5rem] rounded-xl text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
            picked
              ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              : 'border-2 border-emerald-500 bg-white text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          {t.assign}
        </button>
      )}
      <button
        key="front"
        type="button"
        onClick={onToggle}
        aria-pressed={interested}
        aria-label={t.rowLabel(taxi.taxiNo, name, position, interested)}
        className={`relative flex min-h-14 w-full items-center gap-2 rounded-xl border bg-white p-2.5 text-start shadow-sm transition-[translate,border-color,box-shadow] duration-300 ease-out focus-visible:outline-2 focus-visible:outline-emerald-500 sm:gap-3 sm:p-3 ${
          interested ? '-translate-x-20' : 'translate-x-0'
        } ${picked ? 'border-emerald-500 ring-2 ring-emerald-500/40' : interested ? 'border-emerald-300' : 'border-slate-200'}`}
      >
        <span className="w-5 shrink-0 text-center text-xs font-medium text-slate-400 tabular-nums sm:w-6 sm:text-sm">{position}</span>
        <span className="w-10 shrink-0 text-center text-xl font-black text-slate-900 tabular-nums sm:w-12 sm:text-2xl">{taxi.taxiNo}</span>
        <span className="hidden shrink-0 sm:block">
          <Plate reg={taxi.taxiReg} />
        </span>
        <span className="hidden shrink-0 md:block">
          <Avatar name={taxi.driver.name} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-slate-900">{name}</span>
          <span className="block text-xs text-slate-500 tabular-nums sm:text-sm">{taxi.driver.phone}</span>
        </span>
      </button>
    </li>
  )
}
