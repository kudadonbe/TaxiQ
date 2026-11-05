import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { useV3Strings } from './strings'

// Small shared building blocks for the v3 screens.

export function Card({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`space-y-3 rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      {title && <h2 className="font-bold">{title}</h2>}
      {children}
    </section>
  )
}

export function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input {...props} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:outline-2 focus:outline-emerald-500" />
    </label>
  )
}

export function Select({ label, children, ...props }: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select {...props} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-base">
        {children}
      </select>
    </label>
  )
}

const tones = {
  primary: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold',
  dark: 'bg-slate-900 text-white hover:bg-slate-700 font-semibold',
  ghost: 'border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium',
  danger: 'border border-rose-300 text-rose-700 hover:bg-rose-50 font-medium',
}

export function Btn({ tone = 'ghost', className = '', ...props }: { tone?: keyof typeof tones } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`min-h-10 rounded-lg px-4 text-sm disabled:opacity-40 ${tones[tone]} ${className}`} />
}

export function ErrorLine({ code }: { code: string | null }) {
  const s = useV3Strings()
  return code ? <p className="text-sm font-semibold text-rose-700">{s.error(code)}</p> : null
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' }) {
  const c = { slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-900', red: 'bg-rose-100 text-rose-800' }[tone]
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${c}`}>{children}</span>
}

