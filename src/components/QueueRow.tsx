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
        className={`relative flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-start shadow-sm transition-[translate,border-color,box-shadow] duration-300 ease-out focus-visible:outline-2 focus-visible:outline-emerald-500 ${
          interested ? '-translate-x-20' : 'translate-x-0'
        } ${assigned ? 'border-slate-900 ring-2 ring-slate-900/30' : picked ? 'border-emerald-500 ring-2 ring-emerald-500/40' : interested ? 'border-emerald-300' : 'border-slate-200'}`}
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
