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
}

// One taxi in the rank. Tapping marks the driver as having answered the radio call: the row slides left.
export function QueueRow({ taxi, position, interested, picked, onToggle }: Props) {
  const { t, driverName } = useI18n()
  const name = driverName(taxi.driver)
  return (
    <li className="relative">
      <span className="absolute inset-y-0 right-2 flex w-18 items-center justify-end text-end text-[11px] font-semibold uppercase tracking-widest text-emerald-700">
        {picked ? t.getsRide : interested ? t.answered : ''}
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={interested}
        aria-label={t.rowLabel(taxi.taxiNo, name, position, interested)}
        className={`relative flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-start shadow-sm transition-[translate,border-color,box-shadow] duration-300 ease-out focus-visible:outline-2 focus-visible:outline-emerald-500 ${
          interested ? '-translate-x-20' : 'translate-x-0'
        } ${picked ? 'border-emerald-500 ring-2 ring-emerald-500/40' : interested ? 'border-emerald-300' : 'border-slate-200'}`}
      >
        <span className="w-6 text-center text-sm font-medium text-slate-400 tabular-nums">{position}</span>
        <span className="w-12 text-center text-2xl font-black text-slate-900 tabular-nums">{taxi.taxiNo}</span>
        <Plate reg={taxi.taxiReg} />
        <Avatar name={taxi.driver.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-slate-900">{name}</span>
          <span className="block text-sm text-slate-500 tabular-nums">{taxi.driver.phone}</span>
        </span>
      </button>
    </li>
  )
}
