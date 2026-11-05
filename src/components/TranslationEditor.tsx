import { useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { builtInStrings, useI18n } from '../i18n'
import { checkFix, flatten } from '../translations'

// Admins and devs: fix any Dhivehi string from inside the app. Opens as a side panel from the ✏️
// button, so you can fix a label while looking at it. Saved fixes go to Firestore
// (translations/dv) and show for everyone at once; Export gives English → Dhivehi pairs to write
// back into src/i18n.tsx.

export function TranslationEditor({ onClose }: { onClose: () => void }) {
  const { fb, email } = useAuth()
  const { t, dvFixes } = useI18n()
  const entries = useMemo(() => {
    const en = new Map(flatten(builtInStrings.en).map((e) => [e.key, e]))
    return flatten(builtInStrings.dv)
      .filter((e) => en.has(e.key))
      .map((e) => ({ key: e.key, en: en.get(e.key)!.value, dv: e.value }))
  }, [])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const current = (key: string, builtIn: string) => (key in drafts ? drafts[key]! : removed.has(key) ? builtIn : (dvFixes[key] ?? builtIn))
  const q = search.trim().toLowerCase()
  const shown = entries.filter((e) => {
    const value = current(e.key, e.dv)
    if (onlyChanged && !(e.key in dvFixes) && !(e.key in drafts)) return false
    return !q || e.en.toLowerCase().includes(q) || value.includes(search.trim()) || e.key.toLowerCase().includes(q)
  })
  const problems = Object.entries(drafts)
    .map(([key, v]) => ({ key, r: checkFix(entries.find((e) => e.key === key)!.en, v) }))
    .filter((p) => p.r !== 'ok')
  const pending = Object.keys(drafts).length + removed.size

  const save = () => {
    if (!fb || problems.length) return
    const next: Record<string, string> = { ...dvFixes }
    for (const k of removed) delete next[k]
    for (const [k, v] of Object.entries(drafts)) {
      const builtIn = entries.find((e) => e.key === k)!.dv
      if (v.trim() === builtIn) delete next[k]
      else next[k] = v.trim()
    }
    setStatus(null)
    fb.setDoc(fb.doc(fb.db, 'translations', 'dv'), { entries: next, updatedBy: email ?? '', updatedAt: fb.serverTimestamp() })
      .then(() => {
        setDrafts({})
        setRemoved(new Set())
        setStatus(t.trSaved)
      })
      .catch((e: { code?: string }) => setStatus(t.saveError(e.code ?? 'error')))
  }

  const exportFixes = () => {
    const out = Object.fromEntries(Object.entries(dvFixes).map(([k, dv]) => [k, { en: entries.find((e) => e.key === k)?.en ?? '', dv }]))
    void navigator.clipboard
      .writeText(JSON.stringify(out, null, 2))
      .then(() => setStatus(t.trCopied))
      .catch(() => setStatus(t.saveError('clipboard')))
  }

  return (
    <div className="fixed inset-0 z-[1300] flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={t.translations}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
      >
        <header className="space-y-2 border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 font-bold">✏️ {t.translations}</h2>
            <button type="button" onClick={onClose} aria-label={t.cancel} className="min-h-10 rounded-lg px-3 text-slate-600 hover:bg-slate-100">
              ✕
            </button>
          </div>
          <p className="text-xs text-slate-500">{t.trNote}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.trSearch}
              aria-label={t.trSearch}
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-base"
            />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} className="size-4 accent-emerald-600" />
              {t.trOnlyChanged(Object.keys(dvFixes).length)}
            </label>
          </div>
        </header>

        <ul className="flex-1 divide-y divide-slate-100 overflow-auto">
          {shown.map((e) => {
            const value = current(e.key, e.dv)
            const fixed = !removed.has(e.key) && e.key in dvFixes
            const problem = e.key in drafts ? checkFix(e.en, drafts[e.key]!) : 'ok'
            return (
              <li key={e.key} className="space-y-1 p-3">
                <div className="flex items-center gap-2">
                  <bdi dir="ltr" className="min-w-0 flex-1 text-sm text-slate-700">
                    {e.en}
                  </bdi>
                  {(fixed || e.key in drafts) && <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-bold uppercase text-emerald-800">{t.trFixed}</span>}
                </div>
                <textarea
                  dir="rtl"
                  lang="dv"
                  rows={value.length > 60 ? 3 : 1}
                  value={value}
                  onChange={(ev) => setDrafts({ ...drafts, [e.key]: ev.target.value })}
                  className={`block w-full resize-y rounded-lg border px-3 py-2 text-base ${problem === 'ok' ? 'border-slate-300' : 'border-rose-500'}`}
                  style={{ fontFamily: 'var(--font-sans)' }}
                />
                <div className="flex items-center gap-2 text-xs">
                  <code dir="ltr" className="text-slate-400">
                    {e.key}
                  </code>
                  {problem !== 'ok' && <span className="font-semibold text-rose-700">{t.trProblem[problem]}</span>}
                  {(fixed || e.key in drafts) && (
                    <button
                      type="button"
                      onClick={() => {
                        const d = { ...drafts }
                        delete d[e.key]
                        setDrafts(d)
                        if (fixed) setRemoved(new Set([...removed, e.key]))
                      }}
                      className="ms-auto rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
                    >
                      {t.trReset}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={save}
            disabled={!pending || problems.length > 0}
            className="min-h-11 rounded-lg bg-emerald-500 px-5 font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
          >
            {t.trSave(pending)}
          </button>
          <button type="button" onClick={exportFixes} disabled={!Object.keys(dvFixes).length} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50 disabled:opacity-40">
            {t.trExport}
          </button>
          {status && <span className="text-sm text-slate-600">{status}</span>}
        </footer>
      </aside>
    </div>
  )
}
