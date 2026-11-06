import { ArrowRight, CarTaxiFront, CircleCheck, MapPin } from 'lucide-react'
import { ic, icFlip } from './iconStyles'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { cancelRide, OFFER_SECONDS, requestRide, type PublicTaxi } from '../rides'
import { useMyRide, useNow } from '../useRides'
import { isFreeText } from '../validate'
import { PlaceInput } from './PlaceInput'
import { TripLine as TripLineInline } from './icons'

interface Props {
  taxis: PublicTaxi[]
  chosen: string | null // a taxi tapped on the map
  onClearChoice: () => void
  // The trip being planned (both ends picked from the house search), for the route on the map.
  onTrip?: (trip: { from: [number, number]; to: [number, number] } | undefined) => void
  // The pickup on its own (to pin it on the map before a destination is chosen).
  onPickup?: (at: [number, number] | undefined) => void
  // Pick a place by pinning it on the map: the map calls `apply` with the place.
  onPinRequest?: (kind: 'pickup' | 'destination', apply: (at: [number, number], name: string) => void) => void
  // Start with this pickup (Hire from here: the viewer's location).
  initialPickup?: { at: [number, number]; name: string }
  // Demo rides (developers and the demo site only): a taxi accepts by itself and drives the trip.
  // Nothing is saved and no real taxi comes.
  demoAllowed?: boolean
  demoRide?: DemoRide | null
  onDemoRide?: (r: Omit<DemoRide, 'taxiId' | 'status'> & { taxiId?: string }) => void
  onEndDemo?: () => void
}

export interface DemoRide {
  taxiId: string
  pickup: string
  pickupAt: [number, number]
  destination: string
  destinationAt: [number, number]
  status: 'offering' | 'accepted'
}

// Public: ask for a ride. Either a specific taxi (tapped on the map) or the queue, where the offer
// goes to each taxi in turn. Needs Google sign-in (no staff role).
export function HirePanel({ taxis, chosen, onClearChoice, onTrip, onPickup, onPinRequest, initialPickup, demoAllowed = false, demoRide = null, onDemoRide, onEndDemo }: Props) {
  const { fb, uid, name, status, signIn } = useAuth()
  const { lang, t } = useI18n()
  const ride = useMyRide(fb, uid)
  const now = useNow(ride?.status === 'offering')
  const [pickup, setPickup] = useState(() => (initialPickup ? (initialPickup.name || t.pinnedPlace).slice(0, 120) : ''))
  const [pickupAt, setPickupAt] = useState<[number, number] | undefined>(() => initialPickup?.at)
  const [destination, setDestination] = useState('')
  const [destinationAt, setDestinationAt] = useState<[number, number] | undefined>()
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A finished request the passenger cleared from the screen (it stays in the database until replaced).
  const [dismissed, setDismissed] = useState<number | null>(null)

  const tripKey = pickupAt && destinationAt ? JSON.stringify([pickupAt, destinationAt]) : ''
  useEffect(() => {
    if (!onTrip) return
    if (!tripKey) return onTrip(undefined)
    const [from, to] = JSON.parse(tripKey) as [[number, number], [number, number]]
    onTrip({ from, to })
  }, [tripKey, onTrip])
  const pickupKey = pickupAt ? pickupAt.join(',') : ''
  useEffect(() => {
    onPickup?.(pickupKey ? (pickupKey.split(',').map(Number) as [number, number]) : undefined)
  }, [pickupKey, onPickup])
  const pinButton = (kind: 'pickup' | 'destination') =>
    onPinRequest && (
      <button
        type="button"
        onClick={() =>
          onPinRequest(kind, (at, placeName) => {
            const text = (placeName || t.pinnedPlace).slice(0, 120)
            if (kind === 'pickup') {
              setPickup(text)
              setPickupAt(at)
            } else {
              setDestination(text)
              setDestinationAt(at)
            }
          })
        }
        className="-mt-1 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
      >
        <MapPin className="size-4" aria-hidden="true" /> {t.pickOnMap}
      </button>
    )

  const byId = new Map(taxis.map((x) => [x.id, x]))
  const label = (id: string | null) => {
    const x = id ? byId.get(id) : undefined
    return x ? { no: x.taxiNo, name: lang === 'dv' && x.nameDv ? x.nameDv : x.name } : { no: '?', name: '' }
  }
  const chosenTaxi = chosen ? byId.get(chosen) : undefined
  const valid =
    pickup.trim().length > 0 && isFreeText(pickup.trim()) && isFreeText(destination.trim()) && isFreeText(note.trim()) && /^\d{7}$/.test(phone.trim())

  const send = (taxiId?: string) => {
    if (!fb || !uid || busy) return
    setBusy(true)
    setError(null)
    requestRide(fb, uid, { name: name ?? '', pickup, pickupAt, destination, destinationAt, phone, note, taxiId })
      .catch((e: { code?: string }) => setError(e.code ?? 'error'))
      .finally(() => setBusy(false))
  }
  const resend = (taxiId?: string) => {
    if (!ride) return
    setPickup(ride.pickup)
    setPickupAt(ride.pickupAt)
    setDestination(ride.destination)
    setPhone(ride.phone)
    setNote(ride.note)
    if (!fb || !uid) return
    setBusy(true)
    requestRide(fb, uid, { name: name ?? '', pickup: ride.pickup, pickupAt: ride.pickupAt, destination: ride.destination, destinationAt: ride.destinationAt, phone: ride.phone, note: ride.note, taxiId })
      .catch((e: { code?: string }) => setError(e.code ?? 'error'))
      .finally(() => setBusy(false))
  }

  const [demoState, setDemo] = useState(() => demoAllowed && status !== 'signedIn')
  const demo = demoAllowed && demoState
  const demoValid = !!pickupAt && pickup.trim().length > 0 && isFreeText(pickup.trim()) && isFreeText(destination.trim())
  const demoSwitch = demoAllowed && (
    <label className="flex items-start gap-2 rounded-lg border border-fuchsia-300 bg-fuchsia-50/80 p-2 text-sm">
      <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="mt-0.5 size-4 accent-fuchsia-600" />
      <span>
        <span className="me-1 rounded bg-fuchsia-600 px-1.5 text-xs font-black text-white">DEMO</span>
        {t.demoRideToggle}
      </span>
    </label>
  )

  // A demo ride in progress.
  if (demoRide) {
    const x = label(demoRide.taxiId)
    return (
      <section className="space-y-3 p-2" aria-live="polite">
        <p className="text-sm">
          <span className="me-1 rounded bg-fuchsia-600 px-1.5 text-xs font-black text-white">DEMO</span>
          <TripLineInline from={demoRide.pickup} to={demoRide.destination} />
        </p>
        <p className="rounded-lg bg-emerald-50/80 p-3 font-semibold text-emerald-900">{demoRide.status === 'offering' ? t.demoAsking(x.no) : t.demoAccepted(x.no, x.name)}</p>
        <button type="button" onClick={onEndDemo} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white/70 font-semibold">
          {t.demoEnd}
        </button>
      </section>
    )
  }

  if (status !== 'signedIn' && !demo) {
    return (
      <section className="space-y-3 p-2">
        {demoSwitch}
        <p className="mt-1 text-sm text-slate-600">{t.hireSignIn}</p>
        <button
          type="button"
          onClick={signIn}
          disabled={status === 'loading'}
          className="mt-3 min-h-11 rounded-lg bg-slate-900 px-4 font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
        >
          {t.signIn}
        </button>
      </section>
    )
  }

  // An active request: show its progress.
  if (!demo && ride && ride.createdAt !== dismissed && (ride.status === 'offering' || ride.status === 'accepted' || ride.status === 'expired')) {
    const left = Math.max(0, Math.ceil((ride.offerAt + OFFER_SECONDS * 1000 - now) / 1000))
    const offered = label(ride.offerTo)
    const taker = label(ride.acceptedBy)
    return (
      <section className="space-y-3 p-2" aria-live="polite">
        <p className="text-sm text-slate-600">
          <MapPin className={`${ic} text-emerald-600`} aria-hidden="true" /> <bdi>{ride.pickup}</bdi>
          {ride.destination && (
            <>
              {' '}
              <ArrowRight className={`${icFlip} text-slate-400`} aria-hidden="true" /> <bdi>{ride.destination}</bdi>
            </>
          )}
        </p>
        {ride.status === 'offering' && (
          <div className="flex items-center gap-3 rounded-lg bg-amber-50 p-3 text-amber-900">
            <span className="size-3 animate-pulse rounded-full bg-amber-500" aria-hidden />
            <span className="flex-1 font-semibold">{ride.mode === 'direct' ? t.waitingFor(offered.no) : t.offeringTo(offered.no)}</span>
            <span className="tabular-nums" dir="ltr">
              {t.secondsLeft(left)}
            </span>
          </div>
        )}
        {ride.status === 'accepted' && (
          <p className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-900"><CircleCheck className={ic} aria-hidden="true" /> {t.acceptedBy(taker.no, taker.name)}</p>
        )}
        {ride.status === 'expired' && (
          <div className="space-y-2">
            <p className="rounded-lg bg-rose-50 p-3 font-semibold text-rose-800">{t.noTaxi}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => resend()} disabled={busy} className="min-h-10 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-400">
                {ride.mode === 'direct' ? t.sendToQueue : t.tryAgain}
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {ride.status !== 'expired' && (
            <button
              type="button"
              onClick={() => fb && uid && void cancelRide(fb, uid).catch(() => {})}
              className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t.cancelRide}
            </button>
          )}
          {ride.status !== 'offering' && (
            <button
              type="button"
              onClick={() => setDismissed(ride.createdAt)}
              className="min-h-10 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t.newRequest}
            </button>
          )}
        </div>
      </section>
    )
  }

  // The request form.
  return (
    <section className="space-y-3 p-2">
      {demoSwitch}
      <p className="text-xs text-slate-500">{t.hireTapHint}</p>
      {ride?.status === 'cancelled' && <p className="text-sm text-slate-500">{t.rideCancelled}</p>}
      <PlaceInput
        id="hire-pickup"
        label={t.pickup}
        hint={t.pickupHint}
        value={pickup}
        error={!!pickup.trim() && !isFreeText(pickup.trim())}
        onChange={(text, at) => {
          setPickup(text)
          setPickupAt(at)
        }}
      />
      {pinButton('pickup')}
      <PlaceInput
        id="hire-destination"
        label={`${t.destination} (${t.optional})`}
        hint={t.pickupHint}
        value={destination}
        error={!!destination.trim() && !isFreeText(destination.trim())}
        onChange={(text, at) => {
          setDestination(text)
          setDestinationAt(at)
        }}
      />
      {pinButton('destination')}
      <label className="block">
        <span className="text-sm font-medium text-slate-700">{t.yourPhone}</span>
        <input
          type="tel"
          inputMode="numeric"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={7}
          autoComplete="tel-national"
          className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:outline-2 focus:outline-emerald-500"
        />
        <span className="text-xs text-slate-500">{t.phoneRequired}</span>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          {t.callNote} ({t.optional})
        </span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={120}
          autoComplete="off"
          className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:outline-2 focus:outline-emerald-500"
        />
      </label>

      {chosenTaxi && !chosenTaxi.suspended && (
        <p className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm">
          <span className="flex-1 font-semibold"><CarTaxiFront className={ic} aria-hidden="true" /> {t.chosenTaxi(chosenTaxi.taxiNo, label(chosenTaxi.id).name)}</span>
          <button type="button" onClick={onClearChoice} className="min-h-9 rounded-lg px-2 text-slate-600 hover:bg-white">
            {t.clearChoice}
          </button>
        </p>
      )}

      {error && <p className="text-sm font-semibold text-rose-700">{t.requestFailed(error)}</p>}
      {demo ? (
        <>
          {!pickupAt && <p className="text-xs text-fuchsia-800">{t.demoNeedsPin}</p>}
          <button
            type="button"
            disabled={!demoValid}
            onClick={() =>
              pickupAt &&
              onDemoRide?.({ pickup: pickup.trim(), pickupAt, destination: destination.trim(), destinationAt: destinationAt ?? pickupAt, taxiId: chosenTaxi && !chosenTaxi.suspended ? chosenTaxi.id : undefined })
            }
            className="min-h-12 w-full rounded-xl bg-fuchsia-600 px-4 font-bold text-white hover:bg-fuchsia-500 disabled:opacity-40"
          >
            {t.demoStart}
          </button>
        </>
      ) : (
      <button
        type="button"
        disabled={!valid || busy}
        onClick={() => send(chosenTaxi && !chosenTaxi.suspended ? chosenTaxi.id : undefined)}
        className="min-h-12 w-full rounded-xl bg-emerald-500 px-4 font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
      >
        {chosenTaxi && !chosenTaxi.suspended ? t.hireThis(chosenTaxi.taxiNo) : t.hireAny}
      </button>
      )}
    </section>
  )
}
