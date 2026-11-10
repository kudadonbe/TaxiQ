import { BadgeCheck, BookOpen, ChevronDown, ChevronLeft, Download, History, Plus, Search, Sprout, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { icFlip } from './iconStyles'
import {
  addMedicineDrafts, deleteForm, deleteRoot, deleteSentence, deleteSource, deleteWord, exportCorpus, saveForm, saveRoot, saveSentence, saveSource,
  saveWord, useAllForms, useCorpusRoots, useCorpusSources, useCorpusWords, useForms, useHistory, useSentences, verifyRoot, verifyWord,
} from '../corpus'
import {
  CATEGORIES, DIALECTS, ORIGINS, PARTS, POS, SOURCE_KINDS, diffSnapshot, emptyForm, emptyRoot, emptySentence, emptySource, emptyWord, exportFilename,
  isValid, matches, snapshot, validateForm, validateRoot, validateSentence, validateSource, validateWord, wordMatches,
  type Collection, type Dialect, type Errors, type FieldError, type Form, type FormData, type Root, type RootData, type Sentence, type SentenceData,
  type Source, type SourceData, type Word, type WordData,
} from '../core/corpus'

// The owner's own Dhivehi corpus (src/corpus.ts, src/core/corpus.ts): words by root, dialect forms,
// sentences and sources, with every change kept in the history. Corpus editors only.

type Fb = typeof import('../firebase')
type Tab = 'words' | 'roots' | 'sources'

const card = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4'
const btn = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 disabled:opacity-50'
const primary = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50'
const danger = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 text-sm font-bold text-red-700'
const inputCls = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const thaanaCls = `${inputCls} text-lg`

// The content of a stored document, to compare with the form's draft.
const same = (a: object | null, b: object) => diffSnapshot(snapshot(a), snapshot(b)).length === 0

export function CorpusView() {
  const { fb, corpusEditor, status } = useAuth()
  const { t } = useI18n()
  const on = !!fb && corpusEditor
  const words = useCorpusWords(fb, on)
  const roots = useCorpusRoots(fb, on)
  const sources = useCorpusSources(fb, on)
  const forms = useAllForms(fb, on)
  const [tab, setTab] = useState<Tab>('words')
  const [exporting, setExporting] = useState(false)
  const [exportFailed, setExportFailed] = useState(false)

  if (status === 'loading') return <p className="text-sm text-slate-500">{t.loading}</p>
  if (!fb || !corpusEditor) return <p className={`${card} text-sm text-slate-600`}>{t.corpusNoAccess}</p>

  const doExport = async () => {
    setExporting(true)
    setExportFailed(false)
    try {
      const json = await exportCorpus(fb)
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = exportFilename(new Date())
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setExportFailed(true)
    } finally {
      setExporting(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'words', label: t.corpusWords },
    { id: 'roots', label: t.corpusRoots },
    { id: 'sources', label: t.corpusSources },
  ]
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <BookOpen className="size-5" aria-hidden="true" /> {t.corpusTitle}
          </h2>
          <p className="text-sm text-slate-600">{t.corpusIntro}</p>
        </div>
        <button type="button" className={btn} onClick={doExport} disabled={exporting}>
          <Download className="size-4" aria-hidden="true" /> {exporting ? t.corpusExporting : t.corpusExport}
        </button>
      </div>
      {exportFailed && <p className="text-sm text-red-700">{t.corpusExportFailed}</p>}
      <div className="flex gap-1 rounded-xl bg-slate-200 p-1" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`min-h-10 flex-1 rounded-lg px-2 text-sm font-bold ${tab === x.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      {tab === 'words' ? (
        <WordsTab fb={fb} words={words} roots={roots} sources={sources} forms={forms} />
      ) : tab === 'roots' ? (
        <RootsTab fb={fb} roots={roots} words={words} sources={sources} />
      ) : (
        <SourcesTab fb={fb} sources={sources} />
      )}
    </div>
  )
}

// ---- Small parts

function Field({ label, err, children }: { label: string; err?: FieldError; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      {children}
      {err && <span className="block text-xs font-bold text-red-700">{t.corpusErr[err]}</span>}
    </label>
  )
}

function Text({ value, onChange, thaana, multiline, max }: { value: string; onChange: (v: string) => void; thaana?: boolean; multiline?: boolean; max: number }) {
  const props = thaana ? { dir: 'rtl' as const, lang: 'dv' } : {}
  const cls = thaana ? thaanaCls : inputCls
  return multiline ? (
    <textarea {...props} className={`${cls} min-h-20`} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input {...props} className={cls} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
  )
}

function Pick<T extends string>({ value, options, labels, onChange }: { value: T; options: readonly T[]; labels: Record<string, string>; onChange: (v: T) => void }) {
  const { t } = useI18n()
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o === '' ? t.corpusNone : (labels[o] ?? o)}
        </option>
      ))}
    </select>
  )
}

function Thaana({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span dir="rtl" lang="dv" className={className}>
      {children}
    </span>
  )
}

function VerifiedBadge() {
  const { t } = useI18n()
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
      <BadgeCheck className="size-3.5" aria-hidden="true" /> {t.corpusVerified}
    </span>
  )
}

// Two taps to delete (no browser dialog); the first tap arms it for a few seconds.
function DeleteButton({ onDelete }: { onDelete: () => Promise<unknown> }) {
  const { t } = useI18n()
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])
  return (
    <button
      type="button"
      className={armed ? `${danger} bg-red-600 text-white` : danger}
      disabled={busy}
      onClick={() => {
        if (!armed) return setArmed(true)
        setBusy(true)
        onDelete().catch(() => setBusy(false))
      }}
    >
      <Trash2 className="size-4" aria-hidden="true" /> {armed ? t.corpusDeleteConfirm : t.corpusDelete}
    </button>
  )
}

// Save with its state: busy, saved, failed.
function useSaver() {
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle')
  const run = async (f: () => Promise<unknown>) => {
    setState('busy')
    try {
      await f()
      setState('saved')
    } catch {
      setState('failed')
    }
  }
  return { state, run, reset: () => setState('idle') }
}

function SaveRow({ state, disabled, onSave, children }: { state: ReturnType<typeof useSaver>['state']; disabled: boolean; onSave: () => void; children?: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={primary} disabled={disabled || state === 'busy'} onClick={onSave}>
          {state === 'busy' ? t.corpusSaving : t.corpusSave}
        </button>
        {children}
        {state === 'saved' && <span className="text-sm text-emerald-700">{t.corpusSaved}</span>}
      </div>
      {state === 'failed' && <p className="text-sm text-red-700">{t.corpusSaveFailed}</p>}
    </div>
  )
}

// Cited sources: chips with Remove, a picker for the others, and Add a source inline.
function SourcePicker({ fb, value, sources, onChange }: { fb: Fb; value: string[]; sources: Source[]; onChange: (v: string[]) => void }) {
  const { t } = useI18n()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<SourceData>(emptySource())
  const saver = useSaver()
  const byId = new Map(sources.map((s) => [s.id, s]))
  const rest = sources.filter((s) => !value.includes(s.id)).sort((a, b) => a.title.localeCompare(b.title))
  const errs = validateSource(draft)
  return (
    <div className="space-y-2">
      <span className="text-xs font-bold text-slate-600">{t.corpusF.sources}</span>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const name = byId.get(id)?.title ?? t.corpusUnknownSource
            return (
              <li key={id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-sky-50 ps-3 text-xs font-bold text-sky-900">
                <span className="truncate">{name}</span>
                <button type="button" aria-label={t.corpusRemoveNamed(name)} className="inline-flex size-10 shrink-0 items-center justify-center" onClick={() => onChange(value.filter((x) => x !== id))}>
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {rest.length > 0 && (
          <select
            className={`${inputCls} w-auto max-w-full flex-1`}
            value=""
            aria-label={t.corpusPickSource}
            onChange={(e) => e.target.value && onChange([...value, e.target.value])}
          >
            <option value="">{t.corpusPickSource}</option>
            {rest.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}
        <button type="button" className={btn} onClick={() => setAdding(!adding)} aria-expanded={adding}>
          <Plus className="size-4" aria-hidden="true" /> {t.corpusAddSource}
        </button>
      </div>
      {adding && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <SourceFields d={draft} set={setDraft} errs={errs} />
          <SaveRow
            state={saver.state}
            disabled={!isValid(errs)}
            onSave={() =>
              saver.run(async () => {
                const id = await saveSource(fb, draft, null)
                onChange([...value, id])
                setDraft(emptySource())
                setAdding(false)
              })
            }
          >
            <button type="button" className={btn} onClick={() => setAdding(false)}>
              {t.corpusCancel}
            </button>
          </SaveRow>
        </div>
      )}
    </div>
  )
}

// The word's root: search roots and pick one, or add a new root inline.
function RootPicker({ fb, value, roots, onChange }: { fb: Fb; value: string; roots: Root[]; onChange: (id: string) => void }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<RootData>(emptyRoot())
  const saver = useSaver()
  const current = roots.find((r) => r.id === value)
  const found = q.trim() ? roots.filter((r) => matches(q, [r.thaana, r.latin, r.meaningEn, r.meaningDv])).slice(0, 8) : []
  const errs = validateRoot(draft)
  return (
    <div className="space-y-2">
      <span className="text-xs font-bold text-slate-600">{t.corpusF.rootId}</span>
      <div className="flex flex-wrap items-center gap-2">
        {value ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 ps-3 text-sm font-bold text-amber-900">
            {current ? (
              <>
                <Thaana className="text-base">{current.thaana}</Thaana>
                {current.latin && <span className="text-xs font-normal">{current.latin}</span>}
              </>
            ) : (
              t.corpusUnknownRoot
            )}
            <button type="button" aria-label={t.corpusRemove} className="inline-flex size-10 items-center justify-center" onClick={() => onChange('')}>
              <X className="size-4" aria-hidden="true" />
            </button>
          </span>
        ) : (
          <span className="text-sm text-slate-500">{t.corpusRootNone}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input className={`${inputCls} flex-1`} placeholder={t.corpusRootSearch} aria-label={t.corpusRootSearch} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className={btn} onClick={() => setAdding(!adding)} aria-expanded={adding}>
          <Plus className="size-4" aria-hidden="true" /> {t.corpusAddRoot}
        </button>
      </div>
      {found.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {found.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={btn}
                onClick={() => {
                  onChange(r.id)
                  setQ('')
                }}
              >
                <Thaana className="text-base">{r.thaana}</Thaana>
                {r.latin && <span className="text-xs font-normal">{r.latin}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t.corpusF.thaana} err={errs.thaana}>
              <Text thaana value={draft.thaana} max={80} onChange={(v) => setDraft({ ...draft, thaana: v })} />
            </Field>
            <Field label={t.corpusF.latin} err={errs.latin}>
              <Text value={draft.latin} max={80} onChange={(v) => setDraft({ ...draft, latin: v })} />
            </Field>
          </div>
          <SaveRow
            state={saver.state}
            disabled={!isValid(errs)}
            onSave={() =>
              saver.run(async () => {
                onChange(await saveRoot(fb, draft, null))
                setDraft(emptyRoot())
                setAdding(false)
              })
            }
          >
            <button type="button" className={btn} onClick={() => setAdding(false)}>
              {t.corpusCancel}
            </button>
          </SaveRow>
        </div>
      )}
    </div>
  )
}

function fmt(v: unknown, sources: Map<string, Source>, field: string): string {
  if (v === null || v === undefined || v === '') return '–'
  if (Array.isArray(v)) return v.map((x) => (field === 'sources' ? (sources.get(String(x))?.title ?? String(x)) : String(x))).join(', ') || '–'
  const s = String(v)
  return s.length > 120 ? `${s.slice(0, 120)}…` : s
}

// Who changed what and when, newest first.
function HistoryList({ fb, collection, docId, sources }: { fb: Fb; collection: Collection; docId: string; sources: Source[] }) {
  const { t, lang } = useI18n()
  const entries = useHistory(fb, collection, docId)
  const byId = new Map(sources.map((s) => [s.id, s]))
  const label = (f: string) => (t.corpusF as Record<string, string>)[f] ?? f
  if (!entries.length) return <p className="text-sm text-slate-500">{t.corpusNoHistory}</p>
  return (
    <ol className="space-y-2">
      {entries.slice(0, 50).map((e) => {
        const changes = diffSnapshot(e.before, e.after)
        return (
          <li key={e.id} className="rounded-lg border border-slate-200 p-2 text-sm">
            <p className="flex flex-wrap gap-x-2 text-xs text-slate-500">
              <span className="font-bold text-slate-800">{t.corpusActions[e.action]}</span>
              <span dir="ltr">{e.by}</span>
              <span>{new Date(e.at).toLocaleString(lang === 'dv' ? 'dv-MV' : 'en-GB')}</span>
            </p>
            {e.action !== 'delete' && changes.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {changes.map((c) => (
                  <li key={c.field} className="break-words">
                    <span className="font-bold">{label(c.field)}:</span> <span className="text-slate-500 line-through">{fmt(c.before, byId, c.field)}</span>{' '}
                    <span>{fmt(c.after, byId, c.field)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Section({ title, icon, children, open: start = false }: { title: string; icon?: ReactNode; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(start)
  return (
    <section className={card}>
      <button type="button" className="flex min-h-10 w-full items-center justify-between gap-2 text-start font-bold" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && children}
    </section>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n()
  return (
    <button type="button" className={btn} onClick={onClick}>
      <ChevronLeft className={icFlip} aria-hidden="true" /> {t.corpusBack}
    </button>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  return (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input type="search" className={`${inputCls} ps-9`} placeholder={t.corpusSearch} aria-label={t.corpusSearch} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

// ---- Words

function WordsTab({ fb, words, roots, sources, forms }: { fb: Fb; words: Word[]; roots: Root[]; sources: Source[]; forms: Map<string, Form[]> }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const seeding = useSaver()
  const list = useMemo(
    () => words.filter((w) => wordMatches(q, w, forms.get(w.id))).sort((a, b) => (a.latin || a.thaana).localeCompare(b.latin || b.thaana)),
    [words, forms, q],
  )
  if (editing) {
    const word = editing === 'new' ? null : words.find((w) => w.id === editing)
    if (word === undefined) return <BackButton onClick={() => setEditing(null)} />
    return <WordEditor key={editing} fb={fb} word={word} roots={roots} sources={sources} onClose={() => setEditing(null)} onCreated={setEditing} />
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} />
        <button type="button" className={primary} onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden="true" /> {t.corpusNewWord}
        </button>
      </div>
      {words.length === 0 && (
        <div className={card}>
          <p className="text-sm text-slate-600">{t.corpusNoWords}</p>
          <p className="text-sm text-slate-600">{t.corpusStartMedicineHint}</p>
          <button type="button" className={btn} disabled={seeding.state === 'busy'} onClick={() => seeding.run(() => addMedicineDrafts(fb))}>
            <Sprout className="size-4" aria-hidden="true" /> {t.corpusStartMedicine}
          </button>
          {seeding.state === 'failed' && <p className="text-sm text-red-700">{t.corpusSaveFailed}</p>}
        </div>
      )}
      {words.length > 0 && list.length === 0 && <p className="text-sm text-slate-500">{t.corpusNoMatch}</p>}
      <ul className="space-y-2">
        {list.map((w) => {
          const n = forms.get(w.id)?.length ?? 0
          return (
            <li key={w.id}>
              <button type="button" onClick={() => setEditing(w.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white p-3 text-start">
                {w.thaana ? <Thaana className="text-2xl">{w.thaana}</Thaana> : <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{t.corpusDraft}</span>}
                <span className="min-w-0 flex-1">
                  {w.latin && (
                    <span className="block font-bold" dir="ltr">
                      {w.latin}
                    </span>
                  )}
                  {w.meaningEn && <span className="block truncate text-sm text-slate-600">{w.meaningEn}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                  {w.category && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold">{t.corpusCats[w.category]}</span>}
                  {n > 0 && <span>{t.corpusDialectCount(n)}</span>}
                  {w.verified && <VerifiedBadge />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function WordEditor({ fb, word, roots, sources, onClose, onCreated }: { fb: Fb; word: Word | null; roots: Root[]; sources: Source[]; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n()
  const [d, setD] = useState<WordData>(() => (word ? { ...emptyWord(), ...pickWord(word) } : emptyWord()))
  const saver = useSaver()
  const verifier = useSaver()
  const errs: Errors = validateWord(d)
  const dirty = !word || !same(word, d)
  const set = (p: Partial<WordData>) => {
    setD({ ...d, ...p })
    saver.reset()
  }
  const forms = useForms(fb, word?.id ?? null)
  const plantish = d.category === 'medicine' || d.category === 'plant' || !!d.scientificName || !!d.partUsed
  return (
    <div className="space-y-3">
      <BackButton onClick={onClose} />
      <div className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-lg font-bold">{word ? (word.thaana ? <Thaana className="text-2xl">{word.thaana}</Thaana> : word.latin) : t.corpusNewWord}</h3>
          {word?.verified && <VerifiedBadge />}
        </div>
        {word?.verified && word.verifiedBy && <p className="text-xs text-slate-500" dir="auto">{t.corpusVerifiedBy(word.verifiedBy)}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.corpusF.thaana} err={errs.thaana}>
            <Text thaana value={d.thaana} max={80} onChange={(v) => set({ thaana: v })} />
          </Field>
          <Field label={t.corpusF.latin} err={errs.latin}>
            <Text value={d.latin} max={80} onChange={(v) => set({ latin: v })} />
          </Field>
          <Field label={t.corpusF.pos} err={errs.pos}>
            <Pick value={d.pos} options={POS} labels={t.corpusPos} onChange={(v) => set({ pos: v })} />
          </Field>
          <Field label={t.corpusF.category} err={errs.category}>
            <Pick value={d.category} options={CATEGORIES} labels={t.corpusCats} onChange={(v) => set({ category: v })} />
          </Field>
          <Field label={t.corpusF.meaningEn} err={errs.meaningEn}>
            <Text multiline value={d.meaningEn} max={500} onChange={(v) => set({ meaningEn: v })} />
          </Field>
          <Field label={t.corpusF.meaningDv} err={errs.meaningDv}>
            <Text multiline thaana value={d.meaningDv} max={500} onChange={(v) => set({ meaningDv: v })} />
          </Field>
          {plantish && (
            <>
              <Field label={t.corpusF.scientificName} err={errs.scientificName}>
                <Text value={d.scientificName} max={80} onChange={(v) => set({ scientificName: v })} />
              </Field>
              <Field label={t.corpusF.partUsed} err={errs.partUsed}>
                <Pick value={d.partUsed} options={PARTS} labels={t.corpusParts} onChange={(v) => set({ partUsed: v })} />
              </Field>
            </>
          )}
        </div>
        <RootPicker fb={fb} value={d.rootId} roots={roots} onChange={(v) => set({ rootId: v })} />
        <Field label={t.corpusF.notes} err={errs.notes}>
          <Text multiline value={d.notes} max={1000} onChange={(v) => set({ notes: v })} />
        </Field>
        <SourcePicker fb={fb} value={d.sources} sources={sources} onChange={(v) => set({ sources: v })} />
        <SaveRow
          state={saver.state}
          disabled={!isValid(errs) || !dirty}
          onSave={() =>
            saver.run(async () => {
              const id = await saveWord(fb, d, word)
              if (!word) onCreated(id)
            })
          }
        >
          {word && (
            <>
              <button type="button" className={btn} disabled={dirty || verifier.state === 'busy'} title={dirty ? t.corpusVerifySaveFirst : undefined} onClick={() => verifier.run(() => verifyWord(fb, word, !word.verified))}>
                <BadgeCheck className="size-4" aria-hidden="true" /> {word.verified ? t.corpusUnverify : t.corpusVerify}
              </button>
              <DeleteButton
                onDelete={async () => {
                  await deleteWord(fb, word, forms)
                  onClose()
                }}
              />
            </>
          )}
        </SaveRow>
        {word && dirty && <p className="text-xs text-slate-500">{t.corpusVerifySaveFirst}</p>}
        {verifier.state === 'failed' && <p className="text-sm text-red-700">{t.corpusSaveFailed}</p>}
      </div>
      {word ? (
        <>
          <Section title={t.corpusForms} open>
            <ul className="space-y-2">
              {DIALECTS.map((dl) => (
                <FormRow key={dl} fb={fb} wordId={word.id} dialect={dl} form={forms.find((f) => f.id === dl) ?? null} sources={sources} />
              ))}
            </ul>
          </Section>
          <Section title={t.corpusSentences} open>
            <Sentences fb={fb} wordId={word.id} sources={sources} />
          </Section>
          <Section title={t.corpusHistory} icon={<History className="size-4" aria-hidden="true" />}>
            <HistoryList fb={fb} collection="corpusWords" docId={word.id} sources={sources} />
          </Section>
        </>
      ) : (
        <p className="text-sm text-slate-500">{t.corpusSaveFirst}</p>
      )}
    </div>
  )
}

const pickWord = (w: Word): WordData => {
  const e = emptyWord()
  return Object.fromEntries(Object.keys(e).map((k) => [k, w[k as keyof WordData]])) as unknown as WordData
}
const pickForm = (f: Form): FormData => {
  const e = emptyForm()
  return Object.fromEntries(Object.keys(e).map((k) => [k, f[k as keyof FormData]])) as unknown as FormData
}

// One dialect's form of the word: folded to a summary until opened.
function FormRow({ fb, wordId, dialect, form, sources }: { fb: Fb; wordId: string; dialect: Dialect; form: Form | null; sources: Source[] }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [d, setD] = useState<FormData>(() => (form ? pickForm(form) : emptyForm()))
  const saver = useSaver()
  const errs = validateForm(d)
  const set = (p: Partial<FormData>) => {
    setD({ ...d, ...p })
    saver.reset()
  }
  const empty = !d.thaana && !d.latin && !d.pronunciation && !d.notes && !d.speaker && !d.sources.length
  return (
    <li className="rounded-lg border border-slate-200">
      <button
        type="button"
        className="flex min-h-11 w-full flex-wrap items-center gap-x-3 px-3 py-1 text-start"
        aria-expanded={open}
        onClick={() => {
          if (!open) setD(form ? pickForm(form) : emptyForm())
          setOpen(!open)
        }}
      >
        <span className="w-28 shrink-0 text-sm font-bold">{t.corpusDialects[dialect]}</span>
        {form ? (
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
            {form.thaana && <Thaana className="text-lg">{form.thaana}</Thaana>}
            {form.latin && (
              <span className="text-sm text-slate-600" dir="ltr">
                {form.latin}
              </span>
            )}
          </span>
        ) : (
          <span className="flex-1 text-sm text-slate-400">–</span>
        )}
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-200 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.corpusF.thaana} err={errs.thaana}>
              <Text thaana value={d.thaana} max={80} onChange={(v) => set({ thaana: v })} />
            </Field>
            <Field label={t.corpusF.latin} err={errs.latin}>
              <Text value={d.latin} max={80} onChange={(v) => set({ latin: v })} />
            </Field>
            <Field label={t.corpusF.pronunciation} err={errs.pronunciation}>
              <Text value={d.pronunciation} max={200} onChange={(v) => set({ pronunciation: v })} />
            </Field>
            <Field label={t.corpusF.speaker} err={errs.speaker}>
              <Text value={d.speaker} max={60} onChange={(v) => set({ speaker: v })} />
            </Field>
          </div>
          <Field label={t.corpusF.notes} err={errs.notes}>
            <Text multiline value={d.notes} max={1000} onChange={(v) => set({ notes: v })} />
          </Field>
          <SourcePicker fb={fb} value={d.sources} sources={sources} onChange={(v) => set({ sources: v })} />
          <SaveRow state={saver.state} disabled={!isValid(errs) || (form ? same(form, d) : empty)} onSave={() => saver.run(() => saveForm(fb, wordId, dialect, d, form))}>
            {form && <DeleteButton onDelete={() => deleteForm(fb, wordId, form).then(() => setD(emptyForm()))} />}
          </SaveRow>
          {form && (
            <Section title={t.corpusHistory} icon={<History className="size-4" aria-hidden="true" />}>
              <HistoryList fb={fb} collection="corpusForms" docId={`${wordId}/${dialect}`} sources={sources} />
            </Section>
          )}
        </div>
      )}
    </li>
  )
}

function Sentences({ fb, wordId, sources }: { fb: Fb; wordId: string; sources: Source[] }) {
  const { t } = useI18n()
  const list = useSentences(fb, wordId)
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <div className="space-y-2">
      {list.length === 0 && editing !== 'new' && <p className="text-sm text-slate-500">{t.corpusNoSentences}</p>}
      <ul className="space-y-2">
        {list.map((s) =>
          editing === s.id ? (
            <li key={s.id}>
              <SentenceEditor fb={fb} sentence={s} wordId={wordId} sources={sources} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={s.id}>
              <button type="button" className="w-full rounded-lg border border-slate-200 p-3 text-start" onClick={() => setEditing(s.id)}>
                <Thaana className="block text-lg">{s.thaana}</Thaana>
                {s.translationEn && (
                  <span className="block text-sm text-slate-600" dir="ltr">
                    {s.translationEn}
                  </span>
                )}
                {s.dialect && <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">{t.corpusDialects[s.dialect]}</span>}
              </button>
            </li>
          ),
        )}
      </ul>
      {editing === 'new' ? (
        <SentenceEditor fb={fb} sentence={null} wordId={wordId} sources={sources} onDone={() => setEditing(null)} />
      ) : (
        <button type="button" className={btn} onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden="true" /> {t.corpusAddSentence}
        </button>
      )}
    </div>
  )
}

function SentenceEditor({ fb, sentence, wordId, sources, onDone }: { fb: Fb; sentence: Sentence | null; wordId: string; sources: Source[]; onDone: () => void }) {
  const { t } = useI18n()
  const [d, setD] = useState<SentenceData>(() =>
    sentence
      ? { thaana: sentence.thaana, translationEn: sentence.translationEn, dialect: sentence.dialect, wordIds: sentence.wordIds, sources: sentence.sources, notes: sentence.notes }
      : { ...emptySentence(), wordIds: [wordId] },
  )
  const saver = useSaver()
  const errs = validateSentence(d)
  const set = (p: Partial<SentenceData>) => setD({ ...d, ...p })
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <Field label={t.corpusF.thaana} err={errs.thaana}>
        <Text thaana multiline value={d.thaana} max={500} onChange={(v) => set({ thaana: v })} />
      </Field>
      <Field label={t.corpusF.translationEn} err={errs.translationEn}>
        <Text multiline value={d.translationEn} max={500} onChange={(v) => set({ translationEn: v })} />
      </Field>
      <Field label={t.corpusF.dialect} err={errs.dialect}>
        <Pick value={d.dialect} options={['', ...DIALECTS]} labels={t.corpusDialects} onChange={(v) => set({ dialect: v })} />
      </Field>
      <Field label={t.corpusF.notes} err={errs.notes}>
        <Text multiline value={d.notes} max={1000} onChange={(v) => set({ notes: v })} />
      </Field>
      <SourcePicker fb={fb} value={d.sources} sources={sources} onChange={(v) => set({ sources: v })} />
      <SaveRow
        state={saver.state}
        disabled={!isValid(errs) || (!!sentence && same(sentence, d))}
        onSave={() =>
          saver.run(async () => {
            await saveSentence(fb, d, sentence)
            onDone()
          })
        }
      >
        <button type="button" className={btn} onClick={onDone}>
          {t.corpusCancel}
        </button>
        {sentence && <DeleteButton onDelete={() => deleteSentence(fb, sentence).then(onDone)} />}
      </SaveRow>
      {sentence && (
        <Section title={t.corpusHistory} icon={<History className="size-4" aria-hidden="true" />}>
          <HistoryList fb={fb} collection="corpusSentences" docId={sentence.id} sources={sources} />
        </Section>
      )}
    </div>
  )
}

// ---- Roots

function RootsTab({ fb, roots, words, sources }: { fb: Fb; roots: Root[]; words: Word[]; sources: Source[] }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of words) if (w.rootId) m.set(w.rootId, (m.get(w.rootId) ?? 0) + 1)
    return m
  }, [words])
  if (editing) {
    const root = editing === 'new' ? null : roots.find((r) => r.id === editing)
    if (root === undefined) return <BackButton onClick={() => setEditing(null)} />
    return <RootEditor key={editing} fb={fb} root={root} words={words} sources={sources} onClose={() => setEditing(null)} onCreated={setEditing} />
  }
  const list = roots.filter((r) => matches(q, [r.thaana, r.latin, r.meaningEn, r.meaningDv])).sort((a, b) => a.thaana.localeCompare(b.thaana))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} />
        <button type="button" className={primary} onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden="true" /> {t.corpusNewRoot}
        </button>
      </div>
      {roots.length === 0 ? <p className="text-sm text-slate-500">{t.corpusNoRoots}</p> : list.length === 0 && <p className="text-sm text-slate-500">{t.corpusNoMatch}</p>}
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setEditing(r.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white p-3 text-start">
              <Thaana className="text-2xl">{r.thaana}</Thaana>
              <span className="min-w-0 flex-1">
                {r.latin && (
                  <span className="block font-bold" dir="ltr">
                    {r.latin}
                  </span>
                )}
                {r.meaningEn && <span className="block truncate text-sm text-slate-600">{r.meaningEn}</span>}
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                {r.origin && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold">{t.corpusOrigins[r.origin]}</span>}
                <span>{t.corpusWordCount(counts.get(r.id) ?? 0)}</span>
                {r.verified && <VerifiedBadge />}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RootEditor({ fb, root, words, sources, onClose, onCreated }: { fb: Fb; root: Root | null; words: Word[]; sources: Source[]; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n()
  const [d, setD] = useState<RootData>(() =>
    root
      ? { thaana: root.thaana, latin: root.latin, meaningEn: root.meaningEn, meaningDv: root.meaningDv, origin: root.origin, notes: root.notes, sources: root.sources, verified: root.verified, verifiedBy: root.verifiedBy }
      : emptyRoot(),
  )
  const saver = useSaver()
  const verifier = useSaver()
  const errs = validateRoot(d)
  const dirty = !root || !same(root, d)
  const set = (p: Partial<RootData>) => {
    setD({ ...d, ...p })
    saver.reset()
  }
  const its = root ? words.filter((w) => w.rootId === root.id) : []
  return (
    <div className="space-y-3">
      <BackButton onClick={onClose} />
      <div className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-lg font-bold">{root ? <Thaana className="text-2xl">{root.thaana}</Thaana> : t.corpusNewRoot}</h3>
          {root?.verified && <VerifiedBadge />}
        </div>
        {root?.verified && root.verifiedBy && <p className="text-xs text-slate-500">{t.corpusVerifiedBy(root.verifiedBy)}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.corpusF.thaana} err={errs.thaana}>
            <Text thaana value={d.thaana} max={80} onChange={(v) => set({ thaana: v })} />
          </Field>
          <Field label={t.corpusF.latin} err={errs.latin}>
            <Text value={d.latin} max={80} onChange={(v) => set({ latin: v })} />
          </Field>
          <Field label={t.corpusF.meaningEn} err={errs.meaningEn}>
            <Text multiline value={d.meaningEn} max={500} onChange={(v) => set({ meaningEn: v })} />
          </Field>
          <Field label={t.corpusF.meaningDv} err={errs.meaningDv}>
            <Text multiline thaana value={d.meaningDv} max={500} onChange={(v) => set({ meaningDv: v })} />
          </Field>
          <Field label={t.corpusF.origin} err={errs.origin}>
            <Pick value={d.origin} options={ORIGINS} labels={t.corpusOrigins} onChange={(v) => set({ origin: v })} />
          </Field>
        </div>
        <Field label={t.corpusF.notes} err={errs.notes}>
          <Text multiline value={d.notes} max={1000} onChange={(v) => set({ notes: v })} />
        </Field>
        <SourcePicker fb={fb} value={d.sources} sources={sources} onChange={(v) => set({ sources: v })} />
        <SaveRow
          state={saver.state}
          disabled={!isValid(errs) || !dirty}
          onSave={() =>
            saver.run(async () => {
              const id = await saveRoot(fb, d, root)
              if (!root) onCreated(id)
            })
          }
        >
          {root && (
            <>
              <button type="button" className={btn} disabled={dirty || verifier.state === 'busy'} onClick={() => verifier.run(() => verifyRoot(fb, root, !root.verified))}>
                <BadgeCheck className="size-4" aria-hidden="true" /> {root.verified ? t.corpusUnverify : t.corpusVerify}
              </button>
              <DeleteButton
                onDelete={async () => {
                  await deleteRoot(fb, root)
                  onClose()
                }}
              />
            </>
          )}
        </SaveRow>
        {root && dirty && <p className="text-xs text-slate-500">{t.corpusVerifySaveFirst}</p>}
      </div>
      {root && (
        <>
          <Section title={`${t.corpusWords} (${its.length})`} open>
            {its.length ? (
              <ul className="flex flex-wrap gap-2">
                {its.map((w) => (
                  <li key={w.id} className="rounded-lg border border-slate-200 px-3 py-1.5">
                    {w.thaana ? <Thaana className="text-lg">{w.thaana}</Thaana> : null} <span className="text-sm text-slate-600">{w.latin}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{t.corpusNoWords}</p>
            )}
          </Section>
          <Section title={t.corpusHistory} icon={<History className="size-4" aria-hidden="true" />}>
            <HistoryList fb={fb} collection="corpusRoots" docId={root.id} sources={sources} />
          </Section>
        </>
      )}
    </div>
  )
}

// ---- Sources

function SourceFields({ d, set, errs }: { d: SourceData; set: (d: SourceData) => void; errs: Errors }) {
  const { t } = useI18n()
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t.corpusF.kind} err={errs.kind}>
        <Pick value={d.kind} options={SOURCE_KINDS} labels={t.corpusKinds} onChange={(v) => set({ ...d, kind: v })} />
      </Field>
      <Field label={t.corpusF.title} err={errs.title}>
        <Text value={d.title} max={200} onChange={(v) => set({ ...d, title: v })} />
      </Field>
      <Field label={t.corpusF.author} err={errs.author}>
        <Text value={d.author} max={200} onChange={(v) => set({ ...d, author: v })} />
      </Field>
      <Field label={t.corpusF.year} err={errs.year}>
        <Text value={d.year} max={20} onChange={(v) => set({ ...d, year: v })} />
      </Field>
      <Field label={t.corpusF.details} err={errs.details}>
        <Text multiline value={d.details} max={300} onChange={(v) => set({ ...d, details: v })} />
      </Field>
      <Field label={t.corpusF.permission} err={errs.permission}>
        <Text multiline value={d.permission} max={200} onChange={(v) => set({ ...d, permission: v })} />
      </Field>
    </div>
  )
}

function SourcesTab({ fb, sources }: { fb: Fb; sources: Source[] }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  if (editing) {
    const source = editing === 'new' ? null : sources.find((s) => s.id === editing)
    if (source === undefined) return <BackButton onClick={() => setEditing(null)} />
    return <SourceEditor key={editing} fb={fb} source={source} sources={sources} onClose={() => setEditing(null)} onCreated={setEditing} />
  }
  const list = sources.filter((s) => matches(q, [s.title, s.author, s.details, s.year])).sort((a, b) => a.title.localeCompare(b.title))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <SearchBox value={q} onChange={setQ} />
        <button type="button" className={primary} onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden="true" /> {t.corpusNewSource}
        </button>
      </div>
      {sources.length === 0 ? <p className="text-sm text-slate-500">{t.corpusNoSources}</p> : list.length === 0 && <p className="text-sm text-slate-500">{t.corpusNoMatch}</p>}
      <ul className="space-y-2">
        {list.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setEditing(s.id)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-start">
              <span className="block font-bold">{s.title}</span>
              <span className="block text-sm text-slate-600">{[t.corpusKinds[s.kind], s.author, s.year, s.details].filter(Boolean).join(' · ')}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SourceEditor({ fb, source, sources, onClose, onCreated }: { fb: Fb; source: Source | null; sources: Source[]; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n()
  const [d, setD] = useState<SourceData>(() =>
    source ? { kind: source.kind, title: source.title, author: source.author, year: source.year, details: source.details, permission: source.permission } : emptySource(),
  )
  const saver = useSaver()
  const errs = validateSource(d)
  const dirty = !source || !same(source, d)
  return (
    <div className="space-y-3">
      <BackButton onClick={onClose} />
      <div className={card}>
        <h3 className="text-lg font-bold">{source ? source.title : t.corpusNewSource}</h3>
        <SourceFields
          d={d}
          set={(x) => {
            setD(x)
            saver.reset()
          }}
          errs={errs}
        />
        <SaveRow
          state={saver.state}
          disabled={!isValid(errs) || !dirty}
          onSave={() =>
            saver.run(async () => {
              const id = await saveSource(fb, d, source)
              if (!source) onCreated(id)
            })
          }
        >
          {source && (
            <DeleteButton
              onDelete={async () => {
                await deleteSource(fb, source)
                onClose()
              }}
            />
          )}
        </SaveRow>
      </div>
      {source && (
        <Section title={t.corpusHistory} icon={<History className="size-4" aria-hidden="true" />}>
          <HistoryList fb={fb} collection="corpusSources" docId={source.id} sources={sources} />
        </Section>
      )}
    </div>
  )
}
