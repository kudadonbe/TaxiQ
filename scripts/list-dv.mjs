// Lists every UI string (English and Dhivehi) added or changed in src/i18n.tsx since a git tag,
// so the Dhivehi can be checked in one list.
//
//   node scripts/list-dv.mjs              # since v2.6.0, Markdown to stdout
//   node scripts/list-dv.mjs v2.9.0       # since another tag
//   node scripts/list-dv.mjs > plans/dhivehi-to-check.md
//
// Reads the strings as text (no build needed): each top-level key in the en and dv blocks, with its
// whole value (several lines for functions and nested groups). A key counts as new or changed when
// its English or its Dhivehi differs from the tag's.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const tag = process.argv[2] || 'v2.6.0'
const FILE = 'src/i18n.tsx'

// { en: Map(key -> text), dv: Map(key -> text) }
function parse(src) {
  const out = { en: new Map(), dv: new Map() }
  let lang = null
  let key = null
  let buf = []
  const flush = () => {
    if (lang && key) out[lang].set(key, buf.join('\n').trim().replace(/,$/, ''))
    key = null
    buf = []
  }
  for (const line of src.split('\n')) {
    const block = /^  (en|dv): \{$/.exec(line)
    if (block) {
      flush()
      lang = block[1]
      continue
    }
    if (/^  \},?$/.test(line)) {
      flush()
      lang = null
      continue
    }
    if (!lang) continue
    const m = /^    ([A-Za-z0-9_]+):\s?(.*)$/.exec(line)
    if (m) {
      flush()
      key = m[1]
      buf = [m[2]]
    } else if (key) buf.push(line.trim())
  }
  flush()
  return out
}

const before = parse(execFileSync('git', ['show', `${tag}:${FILE}`], { encoding: 'utf8', maxBuffer: 1 << 26 }))
const now = parse(readFileSync(FILE, 'utf8'))

const cell = (s) => (s ?? '(missing)').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const rows = []
for (const [key, en] of now.en) {
  const dv = now.dv.get(key)
  const isNew = !before.en.has(key)
  if (!isNew && before.en.get(key) === en && before.dv.get(key) === dv) continue
  rows.push(`| \`${key}\` | ${isNew ? 'new' : 'changed'} | ${cell(en)} | ${cell(dv)} |`)
}

console.log(`# Dhivehi to check

Every UI string added or changed since \`${tag}\`, English beside Dhivehi, so the Dhivehi can be
checked in one pass. Fix a label in the app with the translation editor (the pencil button in the
header), or in \`src/i18n.tsx\`. Made by \`node scripts/list-dv.mjs ${tag} > plans/dhivehi-to-check.md\`.

${rows.length} strings.

| Key | | English | Dhivehi |
| --- | --- | --- | --- |
${rows.join('\n')}`)
