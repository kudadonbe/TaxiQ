import { ArrowRight, BadgeCheck, Briefcase, CarTaxiFront, HandCoins, Landmark, ShieldAlert, Wallet as WalletIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ic, icFlip } from '../components/iconStyles'
import { DINAR_MVR, DIRHAM_MVR, MONEY_IS_PLACEHOLDER, offer, PRICES, salaryPerDay, TERMS, type DealKind } from '../core/money'
import type { Application, Role, Wallet } from '../core/moneyEngine'
import { useI18n } from '../i18n'
import type { GamePlayer } from './gameData'
import { apply, verifyLedger, type LedgerEntry, type MoneyHead } from './moneyData'

type Fb = typeof import('../firebase')

interface Props {
  fb: Fb
  gameId: string
  me: GamePlayer
  players: GamePlayer[]
  day: number // money day now
  state: MoneyHead | null
  wallet: Wallet | undefined
  apps: Application[]
  ledger: LedgerEntry[]
  onError: (code: string) => void
}

const mvr = (n: number) => `MVR ${Math.round(n).toLocaleString()}`

// G3: the player's money: cash, yesterday's statement, car and job, KD-Bank deals and offers.
export function WalletPanel({ fb, gameId, me, players, day, state, wallet, apps, ledger, onError }: Props) {
  const { t } = useI18n()
  const [qard, setQard] = useState(2000)
  const mine = apps.filter((a) => a.uid === me.uid)
  const pending = mine.filter((a) => a.status === 'new')
  const lastDecided = [...mine].reverse().find((a) => a.status !== 'new')
  const ask = (kind: Application['kind'], days = 0, amount = 0) => void apply(fb, gameId, me.uid, kind, days, amount).catch((e: { code?: string }) => onError(e.code ?? 'error'))

  if (!wallet) return <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{t.moneyOpening}</p>
  const active = wallet.deals.filter((d) => d.paid < d.total)
  const hasCarDeal = active.some((d) => d.kind !== 'qard')
  const hasQard = active.some((d) => d.kind === 'qard')
  const role = me.role as Role
  const lineName = (k: string) => t.moneyLines[k.split(':')[0]!] ?? k
  const dealName = (k: DealKind) => t.moneyDeals[k]

  return (
    <section className="space-y-3 rounded-xl border-2 border-emerald-400 bg-white p-4">
      <div className="flex items-center gap-2">
        <WalletIcon className="size-5 text-emerald-600" aria-hidden="true" />
        <h3 className="flex-1 font-bold">{t.moneyWallet}</h3>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums">{t.moneyDay(day)}</span>
      </div>
      <div>
        <p className={`text-3xl font-black tabular-nums ${wallet.cash < 0 ? 'text-rose-600' : ''}`}>{mvr(wallet.cash)}</p>
        <p className="text-xs text-slate-500 tabular-nums">{t.moneyInMetal((wallet.cash / DINAR_MVR).toFixed(2), Math.round(wallet.cash / DIRHAM_MVR).toLocaleString())}</p>
      </div>

      <p className="flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 font-semibold">
          <CarTaxiFront className={ic} aria-hidden="true" /> {t.moneyCar[wallet.car]}
        </span>
        {wallet.job && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1 font-semibold text-sky-800">
            <Briefcase className={ic} aria-hidden="true" /> {t.moneyHasJob(salaryPerDay())}
          </span>
        )}
      </p>

      {wallet.lastDay && wallet.lastDay.lines.length > 0 && (
        <div className="rounded-lg bg-slate-50 p-2 text-sm">
          <p className="mb-1 text-xs font-semibold text-slate-500">{t.moneyYesterday(wallet.lastDay.day)}</p>
          <ul className="space-y-0.5">
            {wallet.lastDay.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{lineName(l.k)}</span>
                {l.amount !== 0 && <span className={`tabular-nums ${l.amount > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>{l.amount > 0 ? '+' : '−'}{Math.abs(l.amount).toLocaleString()}</span>}
              </li>
            ))}
            <li className="flex justify-between gap-2 border-t border-slate-200 pt-0.5 font-bold">
              <span>{t.moneyNet}</span>
              <span className="tabular-nums">{wallet.lastDay.lines.reduce((s, l) => s + l.amount, 0).toLocaleString()}</span>
            </li>
          </ul>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-500">{t.moneyMyDeals}</h4>
          {active.map((d) => (
            <div key={d.id} className="rounded-lg border border-slate-200 p-2 text-sm">
              <p className="flex justify-between font-semibold">
                <span>{dealName(d.kind)}</span>
                <span className="tabular-nums">{t.moneyPerDay(d.daily)}</span>
              </p>
              <div className="my-1 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round((d.paid / d.total) * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-emerald-500" style={{ width: `${(d.paid / d.total) * 100}%` }} />
              </div>
              <p className="text-xs text-slate-500 tabular-nums">{t.moneyPaidOf(d.paid, d.total)}</p>
              {d.missed > 0 && (
                <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-rose-700">
                  <ShieldAlert className={ic} aria-hidden="true" /> {t.moneyMissed(d.missed, PRICES.missedLimit)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{t.moneyPending}</p>}
      {lastDecided && lastDecided.status === 'declined' && <p className="rounded-lg bg-rose-50 p-2 text-sm text-rose-800">{t.moneyDeclined(t.moneyReasons[lastDecided.reason] ?? lastDecided.reason)}</p>}

      <details className="rounded-lg border border-slate-200 p-2" open={!wallet.job && wallet.car !== 'own' && wallet.car !== 'bank' && !active.length}>
        <summary className="cursor-pointer text-sm font-bold">{t.moneyChoices}</summary>
        <div className="mt-2 space-y-3 text-sm">
          {role !== 'driver' && (
            <div className="flex items-center gap-2">
              <Briefcase className="size-4 shrink-0 text-sky-600" aria-hidden="true" />
              <p className="flex-1">{wallet.job ? t.moneyJobNow : t.moneyJobOffer(PRICES.salaryPerMonth, salaryPerDay())}</p>
              <button type="button" disabled={pending.length > 0} onClick={() => ask(wallet.job ? 'quit' : 'job')} className="min-h-9 rounded-lg bg-sky-600 px-3 font-semibold text-white disabled:opacity-40">
                {wallet.job ? t.moneyQuit : t.moneyTakeJob}
              </button>
            </div>
          )}
          {!hasCarDeal && wallet.car !== 'own' && wallet.car !== 'bank' && (
            <div className="space-y-2">
              <p className="flex items-center gap-1 font-semibold">
                <Landmark className={ic} aria-hidden="true" /> {t.moneyCarDeals(PRICES.car)}
              </p>
              {(['murabaha', 'ijara'] as const).map((kind) => (
                <div key={kind} className="rounded-lg bg-slate-50 p-2">
                  <p className="font-semibold">{dealName(kind)}</p>
                  <p className="text-xs text-slate-600">{t.moneyDealHow[kind]}</p>
                  <div className="mt-1 grid gap-1 sm:grid-cols-2">
                    {TERMS.map((days) => {
                      const o = offer(kind, days)
                      return (
                        <button
                          key={days}
                          type="button"
                          disabled={pending.length > 0 || o.deposit > wallet.cash}
                          onClick={() => ask(kind, days)}
                          className="rounded-lg border border-slate-300 bg-white p-2 text-start text-xs hover:border-emerald-500 disabled:opacity-40"
                        >
                          <span className="block font-bold">{t.moneyDays(days)}</span>
                          <span className="block tabular-nums">{t.moneyOfferLine(o.deposit, o.daily, o.total, o.profit)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!hasQard && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 font-semibold">
                <HandCoins className={ic} aria-hidden="true" /> {t.moneyDeals.qard}
              </p>
              <p className="text-xs text-slate-600">{t.moneyDealHow.qard}</p>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={500}
                  max={PRICES.qardMax}
                  step={500}
                  value={qard}
                  onChange={(e) => setQard(Number(e.target.value))}
                  aria-label={t.moneyAmount}
                  className="flex-1 accent-emerald-600"
                />
                <span className="w-24 text-end font-semibold tabular-nums">{mvr(qard)}</span>
              </div>
              <button type="button" disabled={pending.length > 0} onClick={() => ask('qard', 0, qard)} className="min-h-9 rounded-lg bg-emerald-600 px-3 font-semibold text-white disabled:opacity-40">
                {t.moneyBorrow(offer('qard', 0, qard).daily)}
              </button>
            </div>
          )}
        </div>
      </details>

      <Ledger players={players} me={me} state={state} ledger={ledger} />
      {MONEY_IS_PLACEHOLDER && <p className="text-xs text-amber-700">{t.moneyPlaceholder}</p>}
    </section>
  )
}

// The open ledger: KD-Bank, the island and charity, and the latest payments, re-checked on screen.
function Ledger({ players, me, state, ledger }: { players: GamePlayer[]; me: GamePlayer; state: MoneyHead | null; ledger: LedgerEntry[] }) {
  const { t } = useI18n()
  const [ok, setOk] = useState<boolean | null>(null)
  const key = ledger.map((e) => e.hash).join()
  useEffect(() => {
    let live = true
    void verifyLedger(ledger).then((v) => live && setOk(v))
    return () => {
      live = false
    }
    // Re-check when the entries change.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const names = new Map(players.map((p) => [p.uid, p.name || '—']))
  const who = (a: string) => (a === me.uid ? t.moneyYou : (t.moneyAccounts[a] ?? names.get(a) ?? t.moneyPlayer))
  return (
    <details className="rounded-lg border border-slate-200 p-2">
      <summary className="cursor-pointer text-sm font-bold">{t.moneyLedger}</summary>
      {state && (
        <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
          <dt className="text-slate-500">{t.moneyAccounts.bank}</dt>
          <dd className="text-end tabular-nums">{mvr(state.bank)}</dd>
          <dt className="text-slate-500">{t.moneyAccounts.charity}</dt>
          <dd className="text-end tabular-nums">{mvr(state.charity)}</dd>
          <dt className="text-slate-500">{t.moneyEntries}</dt>
          <dd className="text-end tabular-nums">{state.seq.toLocaleString()}</dd>
        </dl>
      )}
      {ok !== null && ledger.length > 0 && (
        <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {ok ? <BadgeCheck className={ic} aria-hidden="true" /> : <ShieldAlert className={ic} aria-hidden="true" />} {ok ? t.moneyChainOk(ledger.length) : t.moneyChainBad}
        </p>
      )}
      <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto text-xs">
        {ledger.map((e) => (
          <li key={e.seq} className="flex items-center gap-2 py-1">
            <span className="w-10 shrink-0 font-mono text-slate-400">#{e.seq}</span>
            <span className="min-w-0 flex-1 truncate">
              {who(e.from)} <ArrowRight className={icFlip} aria-hidden="true" /> {who(e.to)} · {t.moneyLines[e.reason.split(':')[0]!] ?? e.reason.split(':')[0]}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{e.amount.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
