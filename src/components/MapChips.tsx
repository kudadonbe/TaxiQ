import { useI18n } from '../i18n'
import { MAP_CHIPS, type MapChipId } from '../mapChips'

// A row of chips that scrolls sideways on a narrow phone (never wraps).
export function MapChips({ chips, active, onChoose }: { chips: readonly MapChipId[]; active: MapChipId; onChoose: (id: MapChipId) => void }) {
  const { t } = useI18n()
  return (
    <div className="pointer-events-auto -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]" role="group" aria-label={t.chipsLabel} data-noswipe="">
      {MAP_CHIPS.filter((c) => chips.includes(c.id)).map((c) => {
        const Icon = c.icon
        const on = c.id === active
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChoose(c.id)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold shadow-md backdrop-blur-[3px] ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-white/60 bg-white/70 text-slate-800'}`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {t[c.label]}
          </button>
        )
      })}
    </div>
  )
}
