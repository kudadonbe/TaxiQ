import { Lock } from 'lucide-react'

// A large on/off switch (like phone settings), easy to tap on a phone. When `locked`, it shows a
// lock and can't be changed.
export function Switch({ on, onChange, label, locked = false }: { on: boolean; onChange: (on: boolean) => void; label: string; locked?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={locked}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-emerald-500 ${on ? 'bg-emerald-600' : 'bg-slate-300'} ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <span className={`grid size-6 place-items-center rounded-full bg-white shadow transition-transform ${on ? 'translate-x-7 rtl:-translate-x-7' : 'translate-x-1 rtl:-translate-x-1'}`}>
        {locked && <Lock className="size-3.5 text-slate-500" aria-hidden="true" />}
      </span>
    </button>
  )
}
