import { useEffect, useState } from 'react'
import type { Deal, DealKind } from '../core/money'
import type { AppKind, Application, Entry, MoneyOutput, MoneyState, Wallet } from '../core/moneyEngine'

// TaxiQ Game money in Firestore (G3), all written only by the world's engine (firestore.rules):
//   games/{id}/money/state       KD-Bank, the island, charity, money in and out, ledger head
//   games/{id}/wallets/{uid}     each player's money (everyone can read: it's an open economy)
//   games/{id}/ledger/{seq}      every payment, append-only, each linked to the one before by a hash
//   games/{id}/applications/{id} a player's request (job, quit, Murabaha, Ijara, Qard Hasan)

type Fb = typeof import('../firebase')

export interface MoneyHead extends MoneyState {
  seq: number // entries so far
  lastHash: string
}
export interface LedgerEntry extends Entry {
  seq: number
  prev: string
  hash: string
}

const num = (x: unknown, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d)
const str = (x: unknown, max = 128) => (typeof x === 'string' ? x.slice(0, max) : '')

function parseState(d: Record<string, unknown> | undefined): MoneyHead | null {
  if (!d) return null
  return { bank: num(d.bank), island: num(d.island), charity: num(d.charity), outsideIn: num(d.outsideIn), outsideOut: num(d.outsideOut), seq: num(d.seq), lastHash: str(d.lastHash, 80) }
}
const KINDS: DealKind[] = ['murabaha', 'ijara', 'qard']
function parseWallet(d: Record<string, unknown>): Wallet {
  const deals: Deal[] = Array.isArray(d.deals)
    ? d.deals.flatMap((x: Record<string, unknown>) => {
        const kind = KINDS.find((k) => k === x?.kind)
        return kind ? [{ id: str(x.id, 80), kind, total: num(x.total), paid: num(x.paid), daily: num(x.daily), startDay: num(x.startDay), days: num(x.days), missed: num(x.missed) }] : []
      })
    : []
  const car = (['none', 'rent', 'own', 'bank'] as const).find((c) => c === d.car) ?? 'none'
  const last = d.lastDay as { day?: unknown; lines?: unknown } | null
  return {
    cash: num(d.cash),
    job: d.job === true,
    car,
    deals,
    day: num(d.day),
    lastDay: last && Array.isArray(last.lines) ? { day: num(last.day), lines: last.lines.map((l: Record<string, unknown>) => ({ k: str(l?.k, 60), amount: num(l?.amount) })) } : null,
  }
}
const APP_KINDS: AppKind[] = ['job', 'quit', 'murabaha', 'ijara', 'qard']
function parseApp(id: string, d: Record<string, unknown>): Application | null {
  const kind = APP_KINDS.find((k) => k === d.kind)
  const status = (['new', 'approved', 'declined'] as const).find((s) => s === d.status)
  if (!kind || !status) return null
  return { id, uid: str(d.uid), kind, days: num(d.days), amount: num(d.amount), status, reason: str(d.reason, 40) }
}

// The room's money, live: the head, every wallet, recent applications and the latest ledger entries.
export function useGameMoney(fb: Fb | null, gameId: string | null) {
  const [state, setState] = useState<MoneyHead | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [wallets, setWallets] = useState<Map<string, Wallet>>(() => new Map())
  const [apps, setApps] = useState<Application[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  useEffect(() => {
    if (!fb || !gameId) return
    const col = (name: string) => fb.collection(fb.db, 'games', gameId, name)
    const stops = [
      fb.onSnapshot(fb.doc(fb.db, 'games', gameId, 'money', 'state'), (s) => {
        setState(parseState(s.data()))
        setLoaded(true)
      }),
      fb.onSnapshot(col('wallets'), (s) => setWallets(new Map(s.docs.map((d) => [d.id, parseWallet(d.data())])))),
      fb.onSnapshot(fb.query(col('applications'), fb.orderBy('createdAt', 'desc'), fb.limit(100)), (s) =>
        setApps(
          s.docs
            .flatMap((d) => {
              const a = parseApp(d.id, d.data())
              return a ? [a] : []
            })
            .reverse(),
        ),
      ),
      fb.onSnapshot(fb.query(col('ledger'), fb.orderBy('seq', 'desc'), fb.limit(40)), (s) =>
        setLedger(
          s.docs.map((d) => {
            const x = d.data()
            return { seq: num(x.seq), day: num(x.day), from: str(x.from), to: str(x.to), amount: num(x.amount), reason: str(x.reason, 80), prev: str(x.prev, 80), hash: str(x.hash, 80) }
          }),
        ),
      ),
    ]
    return () => stops.forEach((x) => x())
  }, [fb, gameId])
  const live = fb && gameId
  return { state: live ? state : null, loaded: live ? loaded : false, wallets: live ? wallets : new Map<string, Wallet>(), apps: live ? apps : [], ledger: live ? ledger : [] }
}

// A player asks: a job, quit, or a KD-Bank deal.
export async function apply(fb: Fb, gameId: string, uid: string, kind: AppKind, days = 0, amount = 0) {
  await fb.setDoc(fb.doc(fb.collection(fb.db, 'games', gameId, 'applications')), { uid, kind, days, amount, status: 'new', reason: '', createdAt: fb.serverTimestamp() })
}

// Each entry's hash covers the one before it, so changing any old entry breaks every hash after it.
export async function entryHash(prev: string, seq: number, e: Entry) {
  const text = [prev, seq, e.day, e.from, e.to, e.amount, e.reason].join('|')
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Re-checks the latest entries: each one's hash is right and links to the one before.
export async function verifyLedger(entries: LedgerEntry[]): Promise<boolean> {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq)
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]!
    if ((await entryHash(e.prev, e.seq, e)) !== e.hash) return false
    if (i > 0 && sorted[i - 1]!.seq === e.seq - 1 && sorted[i - 1]!.hash !== e.prev) return false
  }
  return true
}

const seqId = (n: number) => String(n).padStart(9, '0')

// Engine: save one money step in one batch (head, wallets, applications, new ledger entries).
export async function commitMoney(fb: Fb, gameId: string, head: MoneyHead | null, out: MoneyOutput) {
  if (!out.entries.length && !out.wallets.size && !out.apps.length) return
  const batch = fb.writeBatch(fb.db)
  let seq = head?.seq ?? 0
  let last = head?.lastHash ?? '0'
  for (const e of out.entries) {
    const hash = await entryHash(last, seq, e)
    batch.set(fb.doc(fb.db, 'games', gameId, 'ledger', seqId(seq)), { seq, ...e, prev: last, hash, createdAt: fb.serverTimestamp() })
    last = hash
    seq++
  }
  batch.set(fb.doc(fb.db, 'games', gameId, 'money', 'state'), { ...out.state, seq, lastHash: last })
  for (const [uid, w] of out.wallets) batch.set(fb.doc(fb.db, 'games', gameId, 'wallets', uid), w)
  for (const a of out.apps) batch.update(fb.doc(fb.db, 'games', gameId, 'applications', a.id), { status: a.status, reason: a.reason })
  await batch.commit()
}
