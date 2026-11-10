import { describe, expect, it } from 'vitest'
import {
  bare, buildExport, diffSnapshot, emptyForm, emptyRoot, emptySentence, emptySource, emptyWord, exportFilename, hasThaana, matches,
  medicineDraft, MEDICINE_DRAFTS, plain, snapshot, validateForm, validateRoot, validateSentence, validateSource, validateWord, wordMatches,
} from './corpus'

describe('corpus validation', () => {
  it('knows Thaana letters', () => {
    expect(hasThaana('ބޭސް')).toBe(true)
    expect(hasThaana('beys')).toBe(false)
    expect(hasThaana('')).toBe(false)
  })
  it('needs Thaana on a root', () => {
    expect(validateRoot({ ...emptyRoot(), thaana: 'ބޭސް' })).toEqual({})
    expect(validateRoot(emptyRoot()).thaana).toBe('required')
    expect(validateRoot({ ...emptyRoot(), thaana: 'beys' }).thaana).toBe('not_thaana')
    expect(validateRoot({ ...emptyRoot(), thaana: 'ބ'.repeat(81) }).thaana).toBe('too_long')
    expect(validateRoot({ ...emptyRoot(), thaana: 'ބ', origin: 'latin' as never }).origin).toBe('bad_value')
  })
  it('lets a draft word have Latin only, but not nothing', () => {
    expect(validateWord({ ...emptyWord(), latin: 'laagulha' })).toEqual({})
    expect(validateWord(emptyWord()).thaana).toBe('required')
    expect(validateWord({ ...emptyWord(), thaana: 'abc' }).thaana).toBe('not_thaana')
    expect(validateWord({ ...emptyWord(), latin: 'x', meaningEn: 'm'.repeat(501) }).meaningEn).toBe('too_long')
    expect(validateWord({ ...emptyWord(), latin: 'x', notes: 'n'.repeat(1001) }).notes).toBe('too_long')
    expect(validateWord({ ...emptyWord(), latin: 'x', category: 'animal' as never }).category).toBe('bad_value')
  })
  it('keeps speaker labels short and free of contact details', () => {
    expect(validateForm({ ...emptyForm(), speaker: 'elder, Hithadhoo' })).toEqual({})
    expect(validateForm({ ...emptyForm(), speaker: '7771234' }).speaker).toBe('bad_value')
    expect(validateForm({ ...emptyForm(), speaker: 'a@b.mv' }).speaker).toBe('bad_value')
    expect(validateForm({ ...emptyForm(), speaker: 's'.repeat(61) }).speaker).toBe('too_long')
  })
  it('checks sentences and sources', () => {
    expect(validateSentence({ ...emptySentence(), thaana: 'މިއީ ބޭހެކެވެ', dialect: 'addu' })).toEqual({})
    expect(validateSentence({ ...emptySentence(), thaana: 'x' }).thaana).toBe('not_thaana')
    expect(validateSentence({ ...emptySentence(), thaana: 'ބ', dialect: 'nowhere' as never }).dialect).toBe('bad_value')
    expect(validateSource({ ...emptySource(), title: 'Notes' })).toEqual({})
    expect(validateSource(emptySource()).title).toBe('required')
    expect(validateSource({ ...emptySource(), title: 't', details: 'd'.repeat(301) }).details).toBe('too_long')
  })
})

describe('history diffs', () => {
  it('lists changed fields, leaving out who and when', () => {
    const before = { thaana: 'ބޭސް', sources: ['a'], updatedAt: 1, updatedBy: 'x' }
    const after = { thaana: 'ބޭސް', sources: ['a', 'b'], notes: 'new', updatedAt: 2, updatedBy: 'y' }
    expect(diffSnapshot(before, after)).toEqual([
      { field: 'notes', before: null, after: 'new' },
      { field: 'sources', before: ['a'], after: ['a', 'b'] },
    ])
  })
  it('handles created and deleted documents', () => {
    expect(diffSnapshot(null, { latin: 'a' })).toEqual([{ field: 'latin', before: null, after: 'a' }])
    expect(diffSnapshot({ latin: 'a' }, null)).toEqual([{ field: 'latin', before: 'a', after: null }])
    expect(diffSnapshot(null, null)).toEqual([])
  })
  it('snapshots content only', () => {
    expect(snapshot({ id: 'w1', latin: 'a', createdAt: 1, historyId: 'h' })).toEqual({ latin: 'a' })
    expect(snapshot(null)).toBeNull()
  })
})

describe('search', () => {
  it('matches Latin case-insensitively', () => {
    expect(matches('LAAG', ['laagulha'])).toBe(true)
    expect(matches('xyz', ['laagulha'])).toBe(false)
    expect(matches('  ', ['anything'])).toBe(true)
  })
  it('matches Thaana with or without vowel signs', () => {
    expect(bare('ބޭސް')).toBe('ބސ')
    expect(matches('ބޭސް', ['ބޭސް'])).toBe(true)
    expect(matches('ބސ', ['ބޭސް'])).toBe(true)
    expect(matches('ބޭ', ['ފަތް'])).toBe(false)
  })
  it('looks at meanings, scientific names and dialect forms', () => {
    const w = { ...emptyWord(), latin: 'laagulha', scientificName: 'Caesalpinia bonduc' }
    expect(wordMatches('bonduc', w)).toBe(true)
    expect(wordMatches('lagula', w, [{ thaana: '', latin: 'lagula' }])).toBe(true)
  })
})

describe('export', () => {
  it('nests forms in their words and turns timestamps into dates', () => {
    const ts = { toMillis: () => Date.UTC(2026, 0, 2) }
    const out = buildExport({
      roots: [], sources: [{ id: 's1', title: 'T' }], sentences: [], history: [{ id: 'h1', at: ts }],
      words: [{ id: 'w2', latin: 'b' }, { id: 'w1', latin: 'a', createdAt: ts }],
      forms: { w1: [{ id: 'addu', latin: 'x' }] },
    }, new Date(Date.UTC(2026, 10, 10)))
    expect(out.counts).toEqual({ roots: 0, words: 2, forms: 1, sentences: 0, sources: 1, history: 1 })
    expect(out.words).toEqual([
      { id: 'w1', latin: 'a', createdAt: '2026-01-02T00:00:00.000Z', forms: [{ id: 'addu', latin: 'x' }] },
      { id: 'w2', latin: 'b', forms: [] },
    ])
    expect(out.history).toEqual([{ id: 'h1', at: '2026-01-02T00:00:00.000Z' }])
    expect(JSON.parse(JSON.stringify(out)).exportedAt).toBe('2026-11-10T00:00:00.000Z')
  })
  it('names the file by the day', () => {
    expect(exportFilename(new Date(2026, 10, 3))).toBe('dhivehi-corpus-2026-11-03.json')
  })
  it('keeps plain values as they are', () => {
    expect(plain({ a: [1, 'x', null, undefined] })).toEqual({ a: [1, 'x', null, null] })
  })
})

describe('medicine drafts', () => {
  it('are Latin only, with laagulha cited', () => {
    expect(MEDICINE_DRAFTS).toHaveLength(7)
    for (const l of MEDICINE_DRAFTS) {
      const w = medicineDraft(l, 's1')
      expect(w.thaana).toBe('')
      expect(w.meaningEn).toBe('')
      expect(w.category).toBe('medicine')
      expect(validateWord(w)).toEqual({})
    }
    expect(medicineDraft('laagulha', 's1')).toMatchObject({ scientificName: 'Caesalpinia bonduc', partUsed: 'seed', sources: ['s1'] })
    expect(medicineDraft('esmaa', 's1').sources).toEqual([])
  })
})
