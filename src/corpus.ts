import { useEffect, useState } from 'react'
import { collectionGroup, type DocumentData, type DocumentReference, type Query } from 'firebase/firestore'
import {
  buildExport, emptyForm, emptyRoot, emptySentence, emptySource, emptyWord, medicineDraft, MEDICINE_DRAFTS, MEDICINE_SOURCE, snapshot,
  DIALECTS, type Collection, type Dialect, type Form, type FormData, type HistoryAction, type HistoryEntry, type Meta, type Root, type RootData,
  type Sentence, type SentenceData, type Source, type SourceData, type Word, type WordData,
} from './core/corpus'

// The Dhivehi corpus in Firestore (firestore.rules: corpus section). Read and written only by corpus
// editors (platform admins, or roles/{email}.corpus). Every write also adds one corpusHistory entry
// (before and after) in the same batch, and the document records that entry's id (historyId) so the
// rules can check it was written. History entries are never changed or deleted.

type Fb = typeof import('./firebase')

const ms = (x: unknown) => (x && typeof (x as { toMillis?: () => number }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : Date.now())

// A stored document with every field present and of the right type (defaults fill the gaps).
function fill<T extends object>(empty: T, x: Record<string, unknown>): T {
  const out = { ...empty } as Record<string, unknown>
  for (const [k, def] of Object.entries(empty)) {
    const v = x[k]
    if (Array.isArray(def)) out[k] = Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
    else if (typeof v === typeof def) out[k] = v
  }
  return out as T
}
function meta(x: Record<string, unknown>): Meta {
  return { createdBy: String(x.createdBy ?? ''), createdAt: ms(x.createdAt), updatedBy: String(x.updatedBy ?? ''), updatedAt: ms(x.updatedAt) }
}

function useCol<T>(fb: Fb | null, on: boolean, make: () => Query<DocumentData> | null, parse: (id: string, x: Record<string, unknown>) => T, deps: unknown[]): T[] {
  const [list, setList] = useState<T[]>([])
  useEffect(() => {
    if (!fb || !on) return
    const q = make()
    if (!q) return
    return fb.onSnapshot(
      q,
      (s) => setList(s.docs.map((d) => parse(d.id, d.data()))),
      () => setList([]),
    )
    // make and parse are fixed per call site; deps say when to re-subscribe.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [fb, on, ...deps])
  return fb && on ? list : []
}

const parseRoot = (id: string, x: Record<string, unknown>): Root => ({ ...fill(emptyRoot(), x), ...meta(x), id })
const parseWord = (id: string, x: Record<string, unknown>): Word => ({ ...fill(emptyWord(), x), ...meta(x), id })
const parseSentence = (id: string, x: Record<string, unknown>): Sentence => ({ ...fill(emptySentence(), x), ...meta(x), id })
const parseSource = (id: string, x: Record<string, unknown>): Source => ({ ...fill(emptySource(), x), ...meta(x), id })

export function useCorpusWords(fb: Fb | null, on: boolean): Word[] {
  return useCol(fb, on, () => fb && fb.collection(fb.db, 'corpusWords'), parseWord, [])
}
export function useCorpusRoots(fb: Fb | null, on: boolean): Root[] {
  return useCol(fb, on, () => fb && fb.collection(fb.db, 'corpusRoots'), parseRoot, [])
}
export function useCorpusSources(fb: Fb | null, on: boolean): Source[] {
  return useCol(fb, on, () => fb && fb.collection(fb.db, 'corpusSources'), parseSource, [])
}
// One word's dialect forms (only dialects in DIALECTS).
export function useForms(fb: Fb | null, wordId: string | null): Form[] {
  return useCol(
    fb,
    !!wordId,
    () => fb && wordId ? fb.collection(fb.db, 'corpusWords', wordId, 'forms') : null,
    (id, x) => ({ ...fill(emptyForm(), x), ...meta(x), id: id as Dialect }),
    [wordId],
  ).filter((f) => (DIALECTS as readonly string[]).includes(f.id))
}
// Every word's forms, by word id (one collection-group query): dialect counts and search in the list.
export function useAllForms(fb: Fb | null, on: boolean): Map<string, Form[]> {
  const [map, setMap] = useState<Map<string, Form[]>>(new Map())
  useEffect(() => {
    if (!fb || !on) return
    return fb.onSnapshot(
      collectionGroup(fb.db, 'forms'),
      (s) => {
        const m = new Map<string, Form[]>()
        for (const d of s.docs) {
          const word = d.ref.parent.parent
          if (!word || word.parent.id !== 'corpusWords' || !(DIALECTS as readonly string[]).includes(d.id)) continue
          m.set(word.id, [...(m.get(word.id) ?? []), { ...fill(emptyForm(), d.data()), ...meta(d.data()), id: d.id as Dialect }])
        }
        setMap(m)
      },
      () => setMap(new Map()),
    )
  }, [fb, on])
  return fb && on ? map : EMPTY_FORMS
}
const EMPTY_FORMS = new Map<string, Form[]>()

// Sentences that use a word.
export function useSentences(fb: Fb | null, wordId: string | null): Sentence[] {
  return useCol(fb, !!wordId, () => fb && wordId ? fb.query(fb.collection(fb.db, 'corpusSentences'), fb.where('wordIds', 'array-contains', wordId)) : null, parseSentence, [wordId])
}
// One document's history, newest first (two equality filters: no composite index needed).
export function useHistory(fb: Fb | null, collection: Collection, docId: string | null): HistoryEntry[] {
  const list = useCol(
    fb,
    !!docId,
    () => fb && docId ? fb.query(fb.collection(fb.db, 'corpusHistory'), fb.where('collection', '==', collection), fb.where('docId', '==', docId)) : null,
    (id, x): HistoryEntry => ({
      id,
      collection,
      docId: String(x.docId ?? ''),
      action: (['create', 'update', 'delete', 'verify'] as const).find((a) => a === x.action) ?? 'update',
      before: x.before && typeof x.before === 'object' ? (x.before as Record<string, unknown>) : null,
      after: x.after && typeof x.after === 'object' ? (x.after as Record<string, unknown>) : null,
      by: String(x.by ?? ''),
      at: ms(x.at),
    }),
    [collection, docId],
  )
  return [...list].sort((a, b) => b.at - a.at)
}

// ---- Writes. `prev` is the document as loaded (null when creating).

function me(fb: Fb): string {
  const e = fb.auth.currentUser?.email
  if (!e) throw new Error('signed_out')
  return e.toLowerCase()
}

type Batch = ReturnType<Fb['writeBatch']>
function put(fb: Fb, b: Batch, col: Collection, ref: DocumentReference, docId: string, content: object, prev: object | null, action?: HistoryAction) {
  const by = me(fb)
  const h = fb.doc(fb.collection(fb.db, 'corpusHistory'))
  const now = fb.serverTimestamp()
  const data = snapshot(content) ?? {}
  if (prev) b.set(ref, { ...data, updatedBy: by, updatedAt: now, historyId: h.id }, { merge: true })
  else b.set(ref, { ...data, createdBy: by, createdAt: now, updatedBy: by, updatedAt: now, historyId: h.id })
  b.set(h, { collection: col, docId, action: action ?? (prev ? 'update' : 'create'), before: snapshot(prev), after: data, by, at: now })
}
function drop(fb: Fb, b: Batch, col: Collection, ref: DocumentReference, docId: string, prev: object) {
  b.delete(ref)
  b.set(fb.doc(fb.collection(fb.db, 'corpusHistory')), { collection: col, docId, action: 'delete', before: snapshot(prev), after: null, by: me(fb), at: fb.serverTimestamp() })
}
const content = <T extends object>(empty: T, d: T): T => fill(empty, d as Record<string, unknown>)

async function saveTop<T extends object>(fb: Fb, col: Collection, empty: T, id: string | null, d: T, prev: object | null, action?: HistoryAction): Promise<string> {
  const ref = id ? fb.doc(fb.db, col, id) : fb.doc(fb.collection(fb.db, col))
  const b = fb.writeBatch(fb.db)
  put(fb, b, col, ref, ref.id, content(empty, d), prev, action)
  await b.commit()
  return ref.id
}

export const saveRoot = (fb: Fb, d: RootData, prev: Root | null) => saveTop(fb, 'corpusRoots', emptyRoot(), prev?.id ?? null, d, prev)
export const saveWord = (fb: Fb, d: WordData, prev: Word | null) => saveTop(fb, 'corpusWords', emptyWord(), prev?.id ?? null, d, prev)
export const saveSentence = (fb: Fb, d: SentenceData, prev: Sentence | null) => saveTop(fb, 'corpusSentences', emptySentence(), prev?.id ?? null, d, prev)
export const saveSource = (fb: Fb, d: SourceData, prev: Source | null) => saveTop(fb, 'corpusSources', emptySource(), prev?.id ?? null, d, prev)

// A dialect form lives at corpusWords/{wordId}/forms/{dialect}; its history docId is 'wordId/dialect'.
export async function saveForm(fb: Fb, wordId: string, dialect: Dialect, d: FormData, prev: Form | null) {
  const b = fb.writeBatch(fb.db)
  put(fb, b, 'corpusForms', fb.doc(fb.db, 'corpusWords', wordId, 'forms', dialect), `${wordId}/${dialect}`, content(emptyForm(), d), prev)
  await b.commit()
}

// Verify (marks it checked by you) or take the mark off.
export function verifyWord(fb: Fb, w: Word, on: boolean) {
  const d: WordData = { ...content(emptyWord(), w), verified: on, verifiedBy: on ? me(fb) : '' }
  return saveTop(fb, 'corpusWords', emptyWord(), w.id, d, w, 'verify')
}
export function verifyRoot(fb: Fb, r: Root, on: boolean) {
  const d: RootData = { ...content(emptyRoot(), r), verified: on, verifiedBy: on ? me(fb) : '' }
  return saveTop(fb, 'corpusRoots', emptyRoot(), r.id, d, r, 'verify')
}

// Deleting keeps the before snapshot in the history. A word goes with its dialect forms.
export async function deleteWord(fb: Fb, w: Word, forms: Form[]) {
  const b = fb.writeBatch(fb.db)
  for (const f of forms) drop(fb, b, 'corpusForms', fb.doc(fb.db, 'corpusWords', w.id, 'forms', f.id), `${w.id}/${f.id}`, f)
  drop(fb, b, 'corpusWords', fb.doc(fb.db, 'corpusWords', w.id), w.id, w)
  await b.commit()
}
export async function deleteForm(fb: Fb, wordId: string, f: Form) {
  const b = fb.writeBatch(fb.db)
  drop(fb, b, 'corpusForms', fb.doc(fb.db, 'corpusWords', wordId, 'forms', f.id), `${wordId}/${f.id}`, f)
  await b.commit()
}
async function deleteTop(fb: Fb, col: Collection, x: { id: string }) {
  const b = fb.writeBatch(fb.db)
  drop(fb, b, col, fb.doc(fb.db, col, x.id), x.id, x)
  await b.commit()
}
export const deleteRoot = (fb: Fb, r: Root) => deleteTop(fb, 'corpusRoots', r)
export const deleteSentence = (fb: Fb, s: Sentence) => deleteTop(fb, 'corpusSentences', s)
export const deleteSource = (fb: Fb, s: Source) => deleteTop(fb, 'corpusSources', s)

// Start with the medicine words: the cited list as a source, and Latin-only draft words (category
// medicine, meanings and Thaana left for the owner to write), all in one batch.
export async function addMedicineDrafts(fb: Fb) {
  const b = fb.writeBatch(fb.db)
  const src = fb.doc(fb.collection(fb.db, 'corpusSources'))
  put(fb, b, 'corpusSources', src, src.id, MEDICINE_SOURCE, null)
  for (const latin of MEDICINE_DRAFTS) {
    const ref = fb.doc(fb.collection(fb.db, 'corpusWords'))
    put(fb, b, 'corpusWords', ref, ref.id, medicineDraft(latin, src.id), null)
  }
  await b.commit()
}

// The whole corpus (with every word's forms and the full history) as JSON text, for a download.
export async function exportCorpus(fb: Fb): Promise<string> {
  const all = async (name: string) => (await fb.getDocs(fb.collection(fb.db, name))).docs.map((d) => ({ id: d.id, ...d.data() }))
  const [roots, words, sentences, sources, history] = await Promise.all(['corpusRoots', 'corpusWords', 'corpusSentences', 'corpusSources', 'corpusHistory'].map(all))
  const forms: Record<string, Record<string, unknown>[]> = {}
  for (const d of (await fb.getDocs(collectionGroup(fb.db, 'forms'))).docs) {
    const word = d.ref.parent.parent
    if (!word || word.parent.id !== 'corpusWords') continue
    ;(forms[word.id] ??= []).push({ id: d.id, ...d.data() })
  }
  return JSON.stringify(buildExport({ roots, words, forms, sentences, sources, history }, new Date()), null, 2)
}
