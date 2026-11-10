// The owner's own Dhivehi corpus: words grouped by root, each word's forms in the dialects, example
// sentences, and the sources behind all of it. Nothing here comes from Radheef or any other
// dictionary: every entry is the owner's (or a chosen editor's) research, in their own words, with
// its sources cited. Pure parts only (constants, validation, diffs, search, export); the Firestore
// reads and writes are in src/corpus.ts, and firestore.rules (corpus section) checks the same shapes.

// Dialects with their own forms. Add more here (and to the rules' list in firestore.rules,
// corpusWords/{wordId}/forms/{dialect}) and the editor shows a row for each.
export const DIALECTS = ['male', 'addu', 'huvadhu', 'mulaku', 'naifaru'] as const
export type Dialect = (typeof DIALECTS)[number]

export const ORIGINS = ['', 'sanskrit', 'pali', 'arabic', 'persian', 'urdu', 'hindi', 'english', 'portuguese', 'other'] as const
export type Origin = (typeof ORIGINS)[number]
export const POS = ['', 'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'particle', 'other'] as const
export type Pos = (typeof POS)[number]
export const CATEGORIES = ['', 'medicine', 'plant', 'vehicle', 'place', 'food', 'sea', 'general', 'other'] as const
export type Category = (typeof CATEGORIES)[number]
export const PARTS = ['', 'seed', 'leaf', 'root', 'bark', 'fruit', 'flower', 'oil', 'whole', 'other'] as const
export type PartUsed = (typeof PARTS)[number]
export const SOURCE_KINDS = ['book', 'list', 'person', 'fieldwork', 'website', 'other'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

// Length limits (the rules use the same numbers).
export const LIMITS = {
  word: 80, // thaana, latin of a root, word or form
  meaning: 500, // meanings, a sentence and its translation
  notes: 1000,
  title: 200, // a source's title, author, permission
  details: 300,
  year: 20,
  pronunciation: 200,
  speaker: 60, // a short label like 'elder, Hithadhoo', never a full name or phone
  sources: 30, // sources cited on one entry
  wordIds: 50, // words one sentence is linked to
} as const

export type Collection = 'corpusRoots' | 'corpusWords' | 'corpusForms' | 'corpusSentences' | 'corpusSources'
export type HistoryAction = 'create' | 'update' | 'delete' | 'verify'

export interface RootData {
  thaana: string
  latin: string
  meaningEn: string
  meaningDv: string
  origin: Origin
  notes: string
  sources: string[]
  verified: boolean
  verifiedBy: string
}
export interface WordData {
  thaana: string
  latin: string
  rootId: string
  pos: Pos
  meaningEn: string
  meaningDv: string
  category: Category
  scientificName: string
  partUsed: PartUsed
  notes: string
  sources: string[]
  verified: boolean
  verifiedBy: string
}
export interface FormData {
  thaana: string
  latin: string
  pronunciation: string
  notes: string
  speaker: string
  sources: string[]
}
export interface SentenceData {
  thaana: string
  translationEn: string
  dialect: Dialect | ''
  wordIds: string[]
  sources: string[]
  notes: string
}
export interface SourceData {
  kind: SourceKind
  title: string
  author: string
  year: string
  details: string
  permission: string
}

// Who and when, kept on every document (set by src/corpus.ts, checked by the rules).
export interface Meta {
  createdBy: string
  createdAt: number
  updatedBy: string
  updatedAt: number
}
export type Root = RootData & Meta & { id: string }
export type Word = WordData & Meta & { id: string }
export type Form = FormData & Meta & { id: Dialect }
export type Sentence = SentenceData & Meta & { id: string }
export type Source = SourceData & Meta & { id: string }

export interface HistoryEntry {
  id: string
  collection: Collection
  docId: string
  action: HistoryAction
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  by: string
  at: number
}

export const emptyRoot = (): RootData => ({ thaana: '', latin: '', meaningEn: '', meaningDv: '', origin: '', notes: '', sources: [], verified: false, verifiedBy: '' })
export const emptyWord = (): WordData => ({
  thaana: '', latin: '', rootId: '', pos: '', meaningEn: '', meaningDv: '', category: '', scientificName: '', partUsed: '', notes: '', sources: [], verified: false, verifiedBy: '',
})
export const emptyForm = (): FormData => ({ thaana: '', latin: '', pronunciation: '', notes: '', speaker: '', sources: [] })
export const emptySentence = (): SentenceData => ({ thaana: '', translationEn: '', dialect: '', wordIds: [], sources: [], notes: '' })
export const emptySource = (): SourceData => ({ kind: 'book', title: '', author: '', year: '', details: '', permission: '' })

// Thaana letters and signs: U+0780 to U+07BF.
const THAANA = /[ހ-޿]/
export function hasThaana(s: string): boolean {
  return THAANA.test(s)
}

export type FieldError = 'required' | 'too_long' | 'not_thaana' | 'bad_value'
export type Errors = Partial<Record<string, FieldError>>

function len(errs: Errors, key: string, v: string, max: number, required = false) {
  if (required && !v.trim()) errs[key] = 'required'
  else if (v.length > max) errs[key] = 'too_long'
}
// Thaana fields: Thaana letters (or empty where allowed).
function thaana(errs: Errors, key: string, v: string, max: number, allowEmpty: boolean) {
  if (!v.trim()) {
    if (!allowEmpty) errs[key] = 'required'
  } else if (v.length > max) errs[key] = 'too_long'
  else if (!hasThaana(v)) errs[key] = 'not_thaana'
}
function list(errs: Errors, key: string, v: string[], max: number) {
  if (v.length > max || v.some((x) => typeof x !== 'string' || !x || x.length > 128)) errs[key] = 'bad_value'
}
function oneOf<T extends string>(errs: Errors, key: string, v: string, allowed: readonly T[]) {
  if (!(allowed as readonly string[]).includes(v)) errs[key] = 'bad_value'
}

export function validateRoot(d: RootData): Errors {
  const e: Errors = {}
  thaana(e, 'thaana', d.thaana, LIMITS.word, false)
  len(e, 'latin', d.latin, LIMITS.word)
  len(e, 'meaningEn', d.meaningEn, LIMITS.meaning)
  len(e, 'meaningDv', d.meaningDv, LIMITS.meaning)
  oneOf(e, 'origin', d.origin, ORIGINS)
  len(e, 'notes', d.notes, LIMITS.notes)
  list(e, 'sources', d.sources, LIMITS.sources)
  return e
}

// A word may be saved without Thaana yet (a draft known only by its Latin spelling), but it needs one of the two.
export function validateWord(d: WordData): Errors {
  const e: Errors = {}
  thaana(e, 'thaana', d.thaana, LIMITS.word, true)
  len(e, 'latin', d.latin, LIMITS.word)
  if (!d.thaana.trim() && !d.latin.trim()) e.thaana = 'required'
  if (d.rootId.length > 128) e.rootId = 'bad_value'
  oneOf(e, 'pos', d.pos, POS)
  len(e, 'meaningEn', d.meaningEn, LIMITS.meaning)
  len(e, 'meaningDv', d.meaningDv, LIMITS.meaning)
  oneOf(e, 'category', d.category, CATEGORIES)
  len(e, 'scientificName', d.scientificName, LIMITS.word)
  oneOf(e, 'partUsed', d.partUsed, PARTS)
  len(e, 'notes', d.notes, LIMITS.notes)
  list(e, 'sources', d.sources, LIMITS.sources)
  return e
}

export function validateForm(d: FormData): Errors {
  const e: Errors = {}
  thaana(e, 'thaana', d.thaana, LIMITS.word, true)
  len(e, 'latin', d.latin, LIMITS.word)
  len(e, 'pronunciation', d.pronunciation, LIMITS.pronunciation)
  len(e, 'notes', d.notes, LIMITS.notes)
  len(e, 'speaker', d.speaker, LIMITS.speaker)
  // A speaker label, not contact details: no phone numbers or emails.
  if (/\d{5,}|@/.test(d.speaker)) e.speaker = 'bad_value'
  list(e, 'sources', d.sources, LIMITS.sources)
  return e
}

export function validateSentence(d: SentenceData): Errors {
  const e: Errors = {}
  thaana(e, 'thaana', d.thaana, LIMITS.meaning, false)
  len(e, 'translationEn', d.translationEn, LIMITS.meaning)
  if (d.dialect !== '') oneOf(e, 'dialect', d.dialect, DIALECTS)
  list(e, 'wordIds', d.wordIds, LIMITS.wordIds)
  list(e, 'sources', d.sources, LIMITS.sources)
  len(e, 'notes', d.notes, LIMITS.notes)
  return e
}

export function validateSource(d: SourceData): Errors {
  const e: Errors = {}
  oneOf(e, 'kind', d.kind, SOURCE_KINDS)
  len(e, 'title', d.title, LIMITS.title, true)
  len(e, 'author', d.author, LIMITS.title)
  len(e, 'year', d.year, LIMITS.year)
  len(e, 'details', d.details, LIMITS.details)
  len(e, 'permission', d.permission, LIMITS.title)
  return e
}

export const isValid = (e: Errors) => Object.keys(e).length === 0

// The content of a document as kept in the history (no who/when fields, which the entry has itself).
const NOT_CONTENT = new Set(['id', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'historyId'])
export function snapshot(d: object | null | undefined): Record<string, unknown> | null {
  if (!d) return null
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(d)) if (!NOT_CONTENT.has(k) && v !== undefined) out[k] = v
  return out
}

export interface Change {
  field: string
  before: unknown
  after: unknown
}
// What changed between two snapshots (either may be null: created or deleted), field by field,
// in a stable order. Who/when fields are left out.
export function diffSnapshot(before: Record<string, unknown> | null, after: Record<string, unknown> | null): Change[] {
  const b = snapshot(before) ?? {}
  const a = snapshot(after) ?? {}
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort()
  const out: Change[] = []
  for (const k of keys) {
    if (JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null)) out.push({ field: k, before: b[k] ?? null, after: a[k] ?? null })
  }
  return out
}

// Search: Latin case-insensitively, Thaana as typed, and Thaana also without its vowel signs
// (fili and sukun, U+07A6 to U+07B0), so a search typed with or without them still finds the word.
export function normalise(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}
export function bare(s: string): string {
  return normalise(s).replace(/[ަ-ް]/g, '')
}
export function matches(query: string, fields: readonly (string | undefined)[]): boolean {
  const q = normalise(query)
  if (!q) return true
  const qb = bare(query)
  return fields.some((f) => {
    if (!f) return false
    if (normalise(f).includes(q)) return true
    return hasThaana(q) && qb !== '' && bare(f).includes(qb)
  })
}
export function wordMatches(query: string, w: Pick<WordData, 'thaana' | 'latin' | 'meaningEn' | 'meaningDv' | 'scientificName'>, forms: readonly Pick<FormData, 'thaana' | 'latin'>[] = []): boolean {
  return matches(query, [w.thaana, w.latin, w.meaningEn, w.meaningDv, w.scientificName, ...forms.flatMap((f) => [f.thaana, f.latin])])
}

// Firestore values (Timestamps) as plain JSON: Timestamps become ISO strings.
export function plain(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return v.map(plain)
  if (typeof v === 'object') {
    const o = v as { toMillis?: () => number }
    if (typeof o.toMillis === 'function') return new Date(o.toMillis()).toISOString()
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plain(x)]))
  }
  return v
}

export interface CorpusDump {
  roots: Record<string, unknown>[]
  words: (Record<string, unknown> & { id: string })[]
  forms: Record<string, Record<string, unknown>[]> // by word id
  sentences: Record<string, unknown>[]
  sources: Record<string, unknown>[]
  history: Record<string, unknown>[]
}
// The whole corpus as one JSON document: each word carries its forms; ids are kept so sources,
// roots and sentences still point at the right entries.
export function buildExport(d: CorpusDump, now: Date) {
  const byId = (a: Record<string, unknown>, b: Record<string, unknown>) => String(a.id).localeCompare(String(b.id))
  return {
    format: 'dhivehi-corpus',
    version: 1,
    exportedAt: now.toISOString(),
    note: 'Own research, with sources cited. Not taken from any dictionary.',
    counts: { roots: d.roots.length, words: d.words.length, forms: Object.values(d.forms).reduce((n, f) => n + f.length, 0), sentences: d.sentences.length, sources: d.sources.length, history: d.history.length },
    sources: plain([...d.sources].sort(byId)),
    roots: plain([...d.roots].sort(byId)),
    words: plain([...d.words].sort(byId).map((w) => ({ ...w, forms: d.forms[w.id] ?? [] }))),
    sentences: plain([...d.sentences].sort(byId)),
    history: plain(d.history),
  }
}
export function exportFilename(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `dhivehi-corpus-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`
}

// Draft words to start the medicine list: Latin spellings only, meanings and Thaana left for the
// owner to write in his own words.
export const MEDICINE_SOURCE: SourceData = {
  kind: 'list',
  title: 'Maldives Food and Drug Authority, Approved Raw Material List used in Alternative Medicines / Dhivehi Beys',
  author: 'Maldives Food and Drug Authority',
  year: '2023',
  details: 'MTG.RE-RM/Li005/2023-0002, row 177',
  permission: 'public government list, cited',
}
export const MEDICINE_DRAFTS: readonly string[] = ['laagulha', 'madhoshi', 'buroshi', 'aroshi', 'esmaa', 'thakoovah', 'kunburu']
// The draft word for one Latin spelling; the source id is filled in for the word it applies to.
export function medicineDraft(latin: string, sourceId: string): WordData {
  const w: WordData = { ...emptyWord(), latin, category: 'medicine' }
  if (latin === 'laagulha') return { ...w, scientificName: 'Caesalpinia bonduc', partUsed: 'seed', sources: [sourceId] }
  return w
}
