import { Banknote, Car, Check, CircleCheck, Copy, History, LogIn, Map as MapIcon, Route, UserRound, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { useAvailableVehicle } from '../availability'
import { useMyVehicles } from '../vehicles'
import { useDriverRides, useMyRide } from '../useRides'
import { cancelPrivate, useIncomingPrivateRides, useMyPrivateRide } from '../privateRides'
import { cancelRide } from '../rides'
import { readyForRides, rideChecks, type CheckId } from '../core/readiness'
import { ACTIVITY_DAYS, useActivity } from '../activity'
import { useAccount } from '../account'
import { totals } from '../core/account'
import { MoneyEntries, MoneyMonths, MoneyTotals } from './MoneyList'

// My account: who you are, why you can or can't take rides (and how to fix it), your bookings as a
// passenger, your trips as a driver or owner, your money account, and your activity log.

type GoTo = 'vehicles' | 'hire'
const card = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4'
const btn = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800'

// Still open as a passenger (blocks taking rides), and still cancellable.
const TAXI_OPEN = ['offering', 'interest', 'confirmed', 'accepted']
const PRIVATE_OPEN = ['offering', 'interest', 'confirmed', 'accepted', 'onboard']
const PRIVATE_CANCEL = ['offering', 'interest', 'confirmed', 'accepted']
const GONE = ['cancelled', 'expired']

export function MyAccount({ onGoTo }: { onGoTo?: (view: GoTo) => void }) {
  const { fb, uid, email, name, role, canPrivate, taxiId, status, signIn } = useAuth()
  const { t, lang } = useI18n()
  const mine = useMyVehicles(fb, uid)
  const avail = useAvailableVehicle()
  const taxiRide = useMyRide(fb, uid)
  const privateRide = useMyPrivateRide(fb, uid)
  const { accepted: taxiTrips } = useDriverRides(fb, taxiId)
  const privateTrips = useIncomingPrivateRides(fb, uid)
  const activity = useActivity(fb, uid, 50)
  const money = useAccount(fb, uid)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  if (status === 'loading') return <p className="text-sm text-slate-500">{t.loading}</p>
  if (!fb || !uid) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">{t.acctSignIn}</p>
        <button type="button" onClick={signIn} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white">
          <LogIn className="size-4" aria-hidden="true" /> {t.signIn}
        </button>
      </div>
    )
  }

  const taxiOpen = !!taxiRide && TAXI_OPEN.includes(taxiRide.status)
  const privateOpen = !!privateRide && PRIVATE_OPEN.includes(privateRide.status)
  const taxiCancellable = taxiOpen
  const privateCancellable = !!privateRide && PRIVATE_CANCEL.includes(privateRide.status)
  const input = {
    approvedVehicle: mine.some((v) => v.status === 'approved'),
    canPrivate,
    availableOn: !!avail.availableId && mine.some((v) => v.id === avail.availableId),
    locationOk: !avail.error,
    passengerRide: taxiOpen || privateOpen,
  }
  const checks = rideChecks(input)
  const showReadiness = mine.length > 0 || canPrivate

  const run = async (job: () => Promise<unknown>) => {
    setBusy(true)
    setFailed(false)
    try {
      await job()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  const cancelOpen = () =>
    run(async () => {
      if (taxiCancellable) await cancelRide(fb, uid)
      if (privateCancellable) await cancelPrivate(fb, uid)
    })
  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(email ?? '')
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const roleText = role ? t.roles[role] : t.citizen
  const price = (n: number | null | undefined) => (typeof n === 'number' ? t.tripTotal(n) : t.acctNoPrice)
  const when = new Intl.DateTimeFormat(lang === 'dv' ? 'dv-MV' : undefined, { dateStyle: 'medium', timeStyle: 'short' })

  const fix = (id: CheckId) => {
    switch (id) {
      case 'vehicle':
      case 'available':
        return onGoTo ? (
          <button type="button" onClick={() => onGoTo('vehicles')} className={btn}>
            <Car className="size-4" aria-hidden="true" /> {t.acctGoVehicles}
          </button>
        ) : null
      case 'role':
        return (
          <button type="button" onClick={() => void copyEmail()} className={btn}>
            <Copy className="size-4" aria-hidden="true" /> {copied ? t.acctCopied : t.acctCopyEmail}
          </button>
        )
      case 'passenger':
        return taxiCancellable || privateCancellable ? (
          <button type="button" disabled={busy} onClick={() => void cancelOpen()} className={`${btn} border-red-300 text-red-700 disabled:opacity-50`}>
            <X className="size-4" aria-hidden="true" /> {t.acctCancelBooking}
          </button>
        ) : null
      case 'location':
        return null
    }
  }

  const showTaxi = !!taxiRide && !GONE.includes(taxiRide.status)
  const showPrivate = !!privateRide && !GONE.includes(privateRide.status)
  const trips = [
    ...taxiTrips.map((r) => ({ id: `t-${r.id}`, kind: t.acctTaxi, status: r.status, place: r.pickup, price: r.price })),
    ...privateTrips.map((r) => ({ id: `p-${r.uid}`, kind: t.acctPrivate, status: r.status, place: r.pickup, price: r.price as number | null })),
  ]
  const finished = trips.filter((r) => r.status === 'done')
  const sums = totals(money)
  // The account is the record (it has finished private trips too); the trips list is the fallback.
  const earned = money.length > 0 ? sums.earned : finished.reduce((sum, r) => sum + (r.price ?? 0), 0)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h2 className="text-xl font-black">{t.acctTitle}</h2>

      <section className={card}>
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
            <UserRound className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{name}</p>
            <p className="truncate text-sm text-slate-600" dir="ltr">
              {email}
            </p>
          </div>
        </div>
        <p className="text-sm">
          <span className="text-slate-500">{t.acctRole}: </span>
          <span className="font-bold">{roleText}</span>
          {role === 'driver' && canPrivate && <span className="text-slate-600"> · {t.acctAlsoPrivate}</span>}
        </p>
      </section>

      {showReadiness && (
        <section className={card}>
          <h3 className="font-black">{t.acctReadyTitle}</h3>
          {readyForRides(input) ? (
            <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
              <CircleCheck className="size-5 shrink-0" aria-hidden="true" /> {t.acctReady}
            </p>
          ) : (
            <ul className="space-y-3">
              {checks.map((c) => (
                <li key={c.id} className="flex gap-3">
                  {c.ok ? <Check className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" /> : <X className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden="true" />}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-bold">
                      {t.acctChecks[c.id]}
                      <span className="sr-only">: {c.ok ? t.acctOk : t.acctNotYet}</span>
                    </p>
                    {!c.ok && (
                      <>
                        <p className="text-sm text-slate-600">{t.acctCheckWhy[c.id]}</p>
                        {fix(c.id)}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {failed && (
            <p role="alert" className="text-sm text-red-700">
              {t.acctFailed}
            </p>
          )}
        </section>
      )}

      <section className={card}>
        <h3 className="font-black">{t.acctBookings}</h3>
        {!showTaxi && !showPrivate && <p className="text-sm text-slate-500">{t.acctNoBookings}</p>}
        {showTaxi && taxiRide && (
          <Row kind={t.acctTaxi} status={t.acctStatus[taxiRide.status]} place={taxiRide.pickup} price={price(taxiRide.price)}>
            {taxiCancellable && (
              <button type="button" disabled={busy} onClick={() => void run(() => cancelRide(fb, uid))} className={`${btn} border-red-300 text-red-700 disabled:opacity-50`}>
                <X className="size-4" aria-hidden="true" /> {t.cancel}
              </button>
            )}
          </Row>
        )}
        {showPrivate && privateRide && (
          <Row kind={t.acctPrivate} status={t.acctStatus[privateRide.status]} place={privateRide.pickup} price={price(privateRide.price)}>
            {privateCancellable && (
              <button type="button" disabled={busy} onClick={() => void run(() => cancelPrivate(fb, uid))} className={`${btn} border-red-300 text-red-700 disabled:opacity-50`}>
                <X className="size-4" aria-hidden="true" /> {t.cancel}
              </button>
            )}
          </Row>
        )}
        {onGoTo && (
          <button type="button" onClick={() => onGoTo('hire')} className={btn}>
            <MapIcon className="size-4" aria-hidden="true" /> {t.acctOpenMap}
          </button>
        )}
        {failed && !showReadiness && (
          <p role="alert" className="text-sm text-red-700">
            {t.acctFailed}
          </p>
        )}
      </section>

      {(taxiId || mine.length > 0 || canPrivate) && (
        <section className={card}>
          <h3 className="flex items-center gap-2 font-black">
            <Route className="size-4" aria-hidden="true" /> {t.acctTrips}
          </h3>
          {trips.length === 0 && <p className="text-sm text-slate-500">{t.acctNoTrips}</p>}
          {trips.map((r) => (
            <Row key={r.id} kind={r.kind} status={t.acctStatus[r.status]} place={r.place} price={price(r.price)} />
          ))}
          {finished.length > 0 && <p className="text-sm font-bold text-emerald-800">{t.acctFinished(finished.length, earned)}</p>}
        </section>
      )}

      <section className={card}>
        <h3 className="flex items-center gap-2 font-black">
          <Banknote className="size-4" aria-hidden="true" /> {t.moneyTitle}
        </h3>
        {money.length > 0 && (
          <>
            <MoneyTotals sums={sums} />
            <MoneyMonths entries={money} />
            <h4 className="text-sm font-bold">{t.moneyEntryList}</h4>
          </>
        )}
        <MoneyEntries entries={money} max={30} />
        <p className="text-xs text-slate-500">{t.moneyCashNote}</p>
      </section>

      <section className={card}>
        <h3 className="flex items-center gap-2 font-black">
          <History className="size-4" aria-hidden="true" /> {t.acctActivity}
        </h3>
        {activity.length === 0 && <p className="text-sm text-slate-500">{t.acctNoActivity}</p>}
        <ul className="divide-y divide-slate-100">
          {activity.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 py-2 text-sm">
              <span className="font-bold">{t.acctKinds[a.kind]}</span>
              {a.detail && <span className="min-w-0 text-slate-600">{a.detail}</span>}
              <span className="ms-auto text-xs text-slate-500">{a.at ? when.format(a.at) : ''}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">{t.acctKept(ACTIVITY_DAYS)}</p>
      </section>
    </div>
  )
}

function Row({ kind, status, place, price, children }: { kind: string; status: string; place: string; price: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">
          {kind} · {status}
        </p>
        {place && <p className="truncate text-sm text-slate-600">{place}</p>}
        <p className="text-sm text-slate-700">{price}</p>
      </div>
      {children}
    </div>
  )
}
