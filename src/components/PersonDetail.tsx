import { useEffect, useState } from 'react'
import { Check, Minus, Plus, X } from 'lucide-react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { useActivity, logActivity } from '../activity'
import { rideChecks } from '../core/readiness'
import { useMyVehicles } from '../vehicles'
import { cancelRide, finishRide, parseRequest, type RideRequest } from '../rides'
import { staffCancelPrivate } from '../privateRides'
import { ic } from './iconStyles'
import { addCorrection, useAccount } from '../account'
import { totals, validCorrection } from '../core/account'
import { MoneyEntries, MoneyTotals } from './MoneyList'

// Management -> Users: one person, as staff see them. Why they can or can't take rides, their open
// rides (taxi request and private booking), the fixes staff can make, their money account (with
// corrections), and their activity log.
// Reads only what the rules already let staff read; never their location or phone number.

const AVAILABLE_MS = 10 * 60_000 // a publicVehicles update within this long counts as available now
const TAXI_OPEN = ['offering', 'interest', 'confirmed', 'accepted']
const PRIVATE_OPEN = ['offering', 'interest', 'confirmed', 'accepted', 'onboard']
// Still worth showing (and fixing) to staff.
const TAXI_SHOWN = [...TAXI_OPEN, 'onboard', 'arrived', 'problem']
const PRIVATE_SHOWN = [...PRIVATE_OPEN, 'arrived', 'problem']

interface Booking {
  status: string
  price: number | null
  createdAt: number
}

const ms = (x: unknown) => (x && typeof (x as { toMillis?: () => number }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : 0)

export function PersonDetail({ uid, canPrivate, onClose }: { uid: string; email: string; role: string; canPrivate: boolean; onClose: () => void }) {
  const { fb, email: me } = useAuth()
  const { lang, t } = useI18n()
  const vehicles = useMyVehicles(fb, uid)
  const activity = useActivity(fb, uid, 30)
  const [lastUpdate, setLastUpdate] = useState(0) // newest publicVehicles update of theirs
  const [taxi, setTaxi] = useState<RideRequest | null>(null)
  const [priv, setPriv] = useState<Booking | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!fb) return
    const fail = (e: { code?: string }) => setError(e.code ?? 'error')
    const stops = [
      fb.onSnapshot(
        fb.query(fb.collection(fb.db, 'publicVehicles'), fb.where('ownerUid', '==', uid)),
        (s) => setLastUpdate(Math.max(0, ...s.docs.map((d) => ms(d.data().updatedAt)))),
        fail,
      ),
      fb.onSnapshot(fb.doc(fb.db, 'requests', uid), (d) => setTaxi(d.exists() ? parseRequest(d.data()) : null), fail),
      fb.onSnapshot(
        fb.doc(fb.db, 'privateRides', uid),
        (d) => {
          const x = d.exists() ? d.data() : null
          setPriv(x && typeof x.status === 'string' ? { status: x.status, price: typeof x.price === 'number' ? x.price : null, createdAt: ms(x.createdAt) } : null)
        },
        fail,
      ),
    ]
    return () => stops.forEach((s) => s())
  }, [fb, uid])

  const availableOn = lastUpdate > 0 && now - lastUpdate < AVAILABLE_MS
  const taxiOpen = !!taxi && TAXI_OPEN.includes(taxi.status)
  const privOpen = !!priv && PRIVATE_OPEN.includes(priv.status)
  const checks = rideChecks({
    approvedVehicle: vehicles.some((v) => v.status === 'approved'),
    canPrivate,
    availableOn,
    locationOk: availableOn,
    passengerRide: taxiOpen || privOpen,
  })

  const time = new Intl.DateTimeFormat(lang === 'dv' ? 'dv-MV' : undefined, { dateStyle: 'medium', timeStyle: 'short' })
  const status = (s: string) => t.personStatus[s] ?? s
  const price = (n: number | null) => (n === null ? '' : ` · ${t.privPrice(n)}`)

  // Run a fix; log it when the function doesn't already.
  const fix = (run: () => Promise<unknown>, detail: string, log: boolean) => {
    if (!fb || busy) return
    setBusy(true)
    setError(null)
    setDone(false)
    run()
      .then(() => {
        if (log) logActivity(fb, uid, 'rideFixed', me, detail)
        setDone(true)
      })
      .catch((e: { code?: string }) => setError(e.code ?? 'error'))
      .finally(() => setBusy(false))
  }

  const btn = 'min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40'
  const showTaxi = taxi && TAXI_SHOWN.includes(taxi.status) ? taxi : null
  const showPriv = priv && PRIVATE_SHOWN.includes(priv.status) ? priv : null

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">{t.personTitle}</h3>
        <button type="button" onClick={onClose} className="min-h-10 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100">
          {t.personHide}
        </button>
      </div>

      <ul className="space-y-1.5">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2">
            {c.ok ? <Check className={`${ic} mt-0.5 text-emerald-600`} aria-hidden="true" /> : <X className={`${ic} mt-0.5 text-rose-600`} aria-hidden="true" />}
            <span className="min-w-0">
              <span className={c.ok ? 'text-slate-700' : 'font-semibold text-rose-800'}>{c.ok ? t.personCheckOk[c.id] : t.personCheckNo[c.id]}</span>
              {c.id === 'role' && !c.ok && <span className="block text-xs text-slate-500">{t.personRoleHint}</span>}
              {c.id === 'location' && availableOn && <span className="block text-xs text-slate-500">{t.personLocationHint}</span>}
            </span>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <h4 className="text-sm font-bold">{t.personRides}</h4>
        {!showTaxi && !showPriv && <p className="text-sm text-slate-500">{t.personNoRides}</p>}
        {showTaxi && (
          <div className="space-y-2 rounded-lg bg-white p-2 text-sm">
            <p>
              <span className="font-semibold">{t.personTaxiRequest}</span>: {status(showTaxi.status)}
              {price(showTaxi.price)}
              {showTaxi.createdAt > 0 && <span className="block text-xs text-slate-500">{time.format(showTaxi.createdAt)}</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {taxiOpen && fb && (
                <button type="button" disabled={busy} onClick={() => fix(() => cancelRide(fb, uid), `taxi ${showTaxi.status}`, true)} className={btn}>
                  {t.personCancelTaxi}
                </button>
              )}
              {showTaxi.status === 'problem' && fb && (
                <button type="button" disabled={busy} onClick={() => fix(() => finishRide(fb, uid), 'taxi problem', true)} className={btn}>
                  {t.personCloseProblem}
                </button>
              )}
            </div>
          </div>
        )}
        {showPriv && (
          <div className="space-y-2 rounded-lg bg-white p-2 text-sm">
            <p>
              <span className="font-semibold">{t.personPrivateBooking}</span>: {status(showPriv.status)}
              {price(showPriv.price)}
              {showPriv.createdAt > 0 && <span className="block text-xs text-slate-500">{time.format(showPriv.createdAt)}</span>}
            </p>
            {fb && (
              <button type="button" disabled={busy} onClick={() => fix(() => staffCancelPrivate(fb, uid), `private ${showPriv.status}`, false)} className={btn}>
                {t.personCancelPrivate}
              </button>
            )}
          </div>
        )}
        {done && <p className="text-sm font-semibold text-emerald-700">{t.personFixed}</p>}
        {error && <p className="text-sm font-semibold text-rose-700">{t.saveError(error)}</p>}
      </div>

      <PersonMoney uid={uid} />

      <div className="space-y-1">
        <h4 className="text-sm font-bold">{t.personActivity}</h4>
        {activity.length === 0 ? (
          <p className="text-sm text-slate-500">{t.personNoActivity}</p>
        ) : (
          <ul className="divide-y divide-slate-200 text-sm">
            {activity.map((a) => (
              <li key={a.id} className="py-1.5">
                <span className="font-semibold">{t.personKind[a.kind]}</span>
                {a.detail && <bdi className="ms-1 text-slate-600">· {a.detail}</bdi>}
                <span className="block text-xs text-slate-500">
                  {a.at > 0 ? time.format(a.at) : ''}
                  {a.by && (
                    <>
                      {' · '}
                      <bdi>{t.personBy(a.by)}</bdi>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// Their money account: totals, the latest entries, and a correction (append-only, with a reason).
function PersonMoney({ uid }: { uid: string }) {
  const { fb, email: me } = useAuth()
  const { t } = useI18n()
  const entries = useAccount(fb, uid)
  const [sign, setSign] = useState<1 | -1>(1)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [saved, setSaved] = useState(false)

  const value = /^[0-9]{1,6}$/.test(amount) ? sign * Number(amount) : NaN
  const save = () => {
    if (!fb || !me || busy) return
    setError(null)
    setSaved(false)
    if (!validCorrection(value, reason)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setBusy(true)
    addCorrection(fb, uid, value, reason, me)
      .then(() => {
        setAmount('')
        setReason('')
        setSign(1)
        setSaved(true)
      })
      .catch((e: { code?: string }) => setError(e.code ?? 'error'))
      .finally(() => setBusy(false))
  }

  const toggle = (on: boolean) => `inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg border px-2 text-sm font-semibold ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-bold">{t.moneyStaffTitle}</h4>
      {entries.length > 0 && <MoneyTotals sums={totals(entries)} />}
      <div className="rounded-lg bg-white p-2">
        <MoneyEntries entries={entries} max={20} showBy />
      </div>
      <form
        className="space-y-2 rounded-lg bg-white p-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <h5 className="text-sm font-bold">{t.moneyAddCorrection}</h5>
        <div className="flex gap-2" role="group" aria-label={t.moneyAddCorrection}>
          <button type="button" aria-pressed={sign === 1} onClick={() => setSign(1)} className={toggle(sign === 1)}>
            <Plus className={ic} aria-hidden="true" /> {t.moneyCorrAdd}
          </button>
          <button type="button" aria-pressed={sign === -1} onClick={() => setSign(-1)} className={toggle(sign === -1)}>
            <Minus className={ic} aria-hidden="true" /> {t.moneyCorrTake}
          </button>
        </div>
        <label className="block text-sm">
          <span className="text-slate-600">{t.moneyCorrAmount}</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
            className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">{t.moneyCorrReason}</span>
          <input value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3" />
        </label>
        <p className="text-xs text-slate-500">{t.moneyCorrHint}</p>
        <button type="submit" disabled={busy || !fb || !me} className="min-h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-40">
          {t.save}
        </button>
        {invalid && <p className="text-sm font-semibold text-rose-700">{t.moneyCorrInvalid}</p>}
        {error && <p className="text-sm font-semibold text-rose-700">{t.saveError(error)}</p>}
        {saved && <p className="text-sm font-semibold text-emerald-700">{t.moneyCorrSaved}</p>}
      </form>
    </div>
  )
}
