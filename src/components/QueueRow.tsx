import { useI18n } from '../i18n'
import type { Taxi } from '../types'
import { Avatar } from './Avatar'
import { Plate } from './Plate'

interface Props {
  taxi: Taxi
  position: number
  interested: boolean
  picked: boolean
  // This taxi holds the open call's assignment.
  assigned: boolean
  // The open call is already assigned to someone else, so this row's button reassigns.
  reassign: boolean
  onToggle: () => void
  onAssign: () => void
}

// One taxi in the rank. Tapping marks the driver as having answered the radio call: the row slides
// left and uncovers an Assign button. The answered driver highest in the queue ("picked") gets the
// filled button, but the operator can assign any answered driver.
export function QueueRow({ taxi, position, interested, picked, assigned, reassign, onToggle, onAssign }: Props) {
  const { t, driverName } = useI18n()
  const name = driverName(taxi.driver)
  return (
    <li className="relative">
      {/* Only rendered while slid out, so it is never focusable hidden under the row. */}
      {assigned ? (
        <span className="absolute inset-y-1 right-0 flex w-[4.5rem] items-center justify-center rounded-xl bg-slate-900 text-center text-xs font-bold text-white">
          {t.assignedBadge}
        </span>
      ) : interested && (
        <button
          type="button"
          onClick={onAssign}
          aria-label={(reassign ? t.reassignRowLabel : t.assignRowLabel)(taxi.taxiNo, name)}
          className={`absolute inset-y-1 right-0 w-[4.5rem] rounded-xl text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
            picked
              ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              : 'border-2 border-emerald-500 bg-white text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          {reassign ? t.reassign : t.assign}
        </button>
      )}
      <button
        type="button"
        onClick={onToggle}
        disabled={assigned}
        aria-pressed={interested}
        aria-label={t.rowLabel(taxi.taxiNo, name, position, interested)}
        className={`relative flex min-h-14 w-full items-center gap-2 rounded-xl border bg-white p-2.5 sm:gap-3 sm:p-3 text-start shadow-sm transition-[translate,border-color,box-shadow] duration-300 ease-out focus-visible:outline-2 focus-visible:outline-emerald-500 ${
          interested ? '-translate-x-20' : 'translate-x-0'
        } ${assigned ? 'border-slate-900 ring-2 ring-slate-900/30' : picked ? 'border-emerald-500 ring-2 ring-emerald-500/40' : interested ? 'border-emerald-300' : 'border-slate-200'}`}
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
