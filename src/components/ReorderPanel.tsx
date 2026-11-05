import { useState } from 'react'
import { move, REORDER_REASONS, reasonOk, shuffle, type ReorderReason } from '../core/reorder'
import { useI18n } from '../i18n'
import type { Taxi } from '../types'
import type { QueueChange } from '../useQueue'

// Staff: change the queue order by hand (move up/down, to front/back) or shuffle it, then save
// with a reason. The change is logged (who, when, why, before/after).
export function ReorderPanel({
  queue,
  onSave,
  onClose,
}: {
  queue: Taxi[]
  onSave: (order: string[], kind: QueueChange['kind'], reason: ReorderReason, note: string) => void
  onClose: () => void
}) {
  const { t, driverName } = useI18n()
  const byId = new Map(queue.map((x) => [x.id, x]))
  const [draft, setDraft] = useState(() => queue.map((x) => x.id))
  const [kind, setKind] = useState<QueueChange['kind']>('reorder')
  const [reason, setReason] = useState<ReorderReason | ''>('')
  const [note, setNote] = useState('')
  const changed = draft.some((id, i) => queue[i]?.id !== id)
  const ok = changed && reason !== '' && reasonOk(reason, note)

  const btn = 'grid min-h-9 min-w-9 place-items-center rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-50 disabled:opacity-30'

  return (
    <section className="space-y-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 font-bold">↕ {t.reorderTitle}</h3>
        <button
          type="button"
          onClick={() => {
            setDraft(shuffle(draft))
            setKind('shuffle')
            if (!reason) setReason('shift')
          }}
          className="min-h-10 rounded-lg border border-amber-500 bg-white px-3 text-sm font-semibold hover:bg-amber-100"
        >
          🔀 {t.shuffle}
        </button>
        <button type="button" onClick={onClose} className="min-h-10 rounded-lg px-3 text-sm text-slate-600 hover:bg-white">
          {t.cancel}
        </button>
      </div>
      <p className="text-xs text-amber-900">{t.reorderNote}</p>

      <ol className="space-y-1">
        {draft.map((id, i) => {
          const x = byId.get(id)!
          const moved = queue[i]?.id !== id
          return (
            <li key={id} className={`flex items-center gap-2 rounded-lg border bg-white px-2 py-1.5 ${moved ? 'border-amber-500' : 'border-slate-200'}`}>
              <span className="w-6 text-center text-xs text-slate-400 tabular-nums">{i + 1}</span>
              <span className="w-10 text-center text-lg font-black tabular-nums">{x.taxiNo}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{driverName(x.driver)}</span>
              <span className="flex gap-1" dir="ltr">
                <button type="button" aria-label={t.moveFront} title={t.moveFront} disabled={i === 0} onClick={() => (setDraft(move(draft, id, 'front')), setKind('reorder'))} className={btn}>
                  ⤒
                </button>
                <button type="button" aria-label={t.moveUp} title={t.moveUp} disabled={i === 0} onClick={() => (setDraft(move(draft, id, 'up')), setKind('reorder'))} className={btn}>
                  ↑
                </button>
                <button type="button" aria-label={t.moveDown} title={t.moveDown} disabled={i === draft.length - 1} onClick={() => (setDraft(move(draft, id, 'down')), setKind('reorder'))} className={btn}>
                  ↓
                </button>
                <button type="button" aria-label={t.moveBack} title={t.moveBack} disabled={i === draft.length - 1} onClick={() => (setDraft(move(draft, id, 'back')), setKind('reorder'))} className={btn}>
                  ⤓
                </button>
              </span>
            </li>
          )
        })}
      </ol>

      <div className="grid gap-2 sm:grid-cols-[14rem_1fr_auto] sm:items-end">
        <label className="block">
          <span className="text-sm font-medium">{t.reorderReason}</span>
          <select value={reason} onChange={(e) => setReason(e.target.value as ReorderReason)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-base">
            <option value="" disabled>
              {t.chooseReason}
            </option>
            {REORDER_REASONS.map((r) => (
              <option key={r} value={r}>
                {t.reorderReasons[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">
            {t.callNote}
            {reason === 'other' ? '' : ` (${t.optional})`}
          </span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base" />
        </label>
        <button
          type="button"
          disabled={!ok}
          onClick={() => onSave(draft, kind, reason as ReorderReason, note)}
          className="min-h-11 rounded-lg bg-emerald-500 px-5 font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          {t.saveOrder}
        </button>
      </div>
    </section>
  )
}

// The log of manual changes, newest first.
export function QueueChangesLog({ changes, queue }: { changes: QueueChange[]; queue: Taxi[] }) {
  const { t, time } = useI18n()
  const no = (id: string) => queue.find((x) => x.id === id)?.taxiNo ?? '?'
  if (!changes.length) return null
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{t.queueChanges}</h2>
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white text-sm">
        {changes.slice(0, 10).map((c) => (
          <li key={c.id} className="space-y-0.5 px-3 py-2">
            <p className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                {c.kind === 'shuffle' ? '🔀' : '↕'} {t.reorderReasons[c.reason]}
              </span>
              <time dir="ltr" className="text-xs text-slate-400">
                {time.format(c.at)}
              </time>
            </p>
            {c.note && <bdi className="block text-xs text-slate-600">{c.note}</bdi>}
            <p dir="ltr" className="truncate text-xs tabular-nums text-slate-500">
              {c.after.map(no).join(' · ')}
            </p>
            <bdi dir="ltr" className="block truncate text-[11px] text-slate-400">
              {c.by}
            </bdi>
          </li>
        ))}
      </ul>
    </section>
  )
}
