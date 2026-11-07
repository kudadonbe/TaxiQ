import { MapPin, Phone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { ANSWER_SECONDS, bookPrivate, bookPrivateOffer, cancelPrivate, confirmPrivateDone, estimate, problemPrivate, tripKm, type PrivateRide } from '../privateRides'
import { CONFIRM_FINISH_MINUTES } from '../core/taxiFare'
import { secondsLeft } from '../core/openTrip'
import { announce } from '../announce'
import { isFreeText } from '../validate'
import type { PublicVehicle } from '../vehicles'
import { TripLine } from './icons'
import { PlaceInput } from './PlaceInput'

interface Props {
  vehicle: PublicVehicle | null // the vehicle tapped on the map
  ride: PrivateRide | null // this passenger's booking
  offered?: PublicVehicle | null // open trip: the vehicle it is offered to now
  onNoThanks?: () => void // open trip: pass this vehicle, on to the next
  onClose: () => void
  tripMetres?: number | null // the road distance from the map's route, for the total
  onTrip?: (trip: { from: [number, number]; to: [number, number] } | undefined) => void
  onPinRequest?: (kind: 'pickup' | 'destination', apply: (at: [number, number], name: string) => void) => void
  initialPickup?: { at: [number, number]; name: string }
}

// Hiring a private vehicle: pickup, destination, phone; the owner's price shown before sending.
export function PrivateHirePanel({ vehicle, ride, offered = null, onNoThanks, onClose, tripMetres = null, onTrip, onPinRequest, initialPickup }: Props) {
  const { fb, uid, name, status, signIn } = useAuth()
  const { lang, t } = useI18n()
  const [pickup, setPickup] = useState(() => initialPickup?.name ?? '')
  const [pickupAt, setPickupAt] = useState<[number, number] | undefined>(() => initialPickup?.at)
  const [destination, setDestination] = useState('')
  const [destinationAt, setDestinationAt] = useState<[number, number] | undefined>()
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  // A voice message when a vehicle offers to take the passenger.
  const offerKey = ride?.status === 'interest' ? `${ride.createdAt}:${ride.offerAt}` : ''
  useEffect(() => {
    if (offerKey) announce('offerReceived', lang, { en: t.voiceOfferEn, dv: t.voiceOfferDv })
  }, [offerKey, lang, t])
  const tripKey = pickupAt && destinationAt ? JSON.stringify([pickupAt, destinationAt]) : ''
  useEffect(() => {
    if (!onTrip) return
    if (!tripKey) return onTrip(undefined)
    const [from, to] = JSON.parse(tripKey) as [[number, number], [number, number]]
    onTrip({ from, to })
  }, [tripKey, onTrip])

  if (status !== 'signedIn' || !fb || !uid)
    return (
      <section className="space-y-3 p-2">
        <p className="text-sm text-slate-600">{t.hireSignIn}</p>
        <button type="button" onClick={signIn} className="min-h-11 rounded-lg bg-slate-900 px-4 font-semibold text-white">
          {t.signIn}
        </button>
      </section>
    )

  const typeName = (v: { type: string }) => t.vehTypes[v.type as keyof typeof t.vehTypes] ?? v.type

  // A booking in progress (or just finished).
  const live = ride && ride.status !== 'cancelled'
  if (ride && live) {
    const open = ride.mode === 'queue'
    const left = open
      ? ride.status === 'offering' || ride.status === 'interest' || ride.status === 'confirmed'
        ? secondsLeft(ride.status, ride.offerAt, now)
        : 0
      : Math.max(0, ANSWER_SECONDS - Math.floor((now - ride.createdAt) / 1000))
    const noAnswer = !open && ride.status === 'offering' && ride.createdAt > 0 && left === 0
    const who = offered ? `${typeName(offered)}${offered.firstName ? ` · ${offered.firstName}` : ''}${offered.colour ? ` · ${offered.colour}` : ''}` : ''
    return (
      <section className="space-y-3 p-2" aria-live="polite">
        <p className="text-sm">
          <TripLine from={ride.pickup} to={ride.destination} />
        </p>
        <p className="text-lg font-black">{t.tripTotal(ride.price)}</p>
        <div className="rounded-lg bg-white/60 p-3">
          {ride.status === 'offering' && !noAnswer && <p className="font-bold">{open ? t.privQueueAsking(left) : t.privAsking(left)}</p>}
          {ride.status === 'interest' && (
            <div className="space-y-2">
              <p className="flex items-center justify-between gap-2 font-black text-emerald-900">
                <span>{t.privOffers(who)}</span>
                <span className="shrink-0 tabular-nums" dir="ltr">
                  {t.secondsLeft(left)}
                </span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void bookPrivateOffer(fb, uid).catch((e: { code?: string }) => setError(e.code ?? 'error'))} className="min-h-11 rounded-xl bg-emerald-600 font-bold text-white">
                  {t.bookIt}
                </button>
                <button type="button" onClick={onNoThanks} className="min-h-11 rounded-xl border border-slate-300 bg-white/70 font-semibold">
                  {t.noThanks}
                </button>
              </div>
            </div>
          )}
          {ride.status === 'confirmed' && <p className="font-bold text-emerald-800">{t.privBooking}</p>}
          {ride.status === 'expired' && <p className="font-bold text-rose-700">{t.privNoneTook}</p>}
          {noAnswer && <p className="font-bold text-amber-800">{t.privNoAnswer}</p>}
          {ride.status === 'declined' && <p className="font-bold text-rose-700">{t.privDeclined}</p>}
          {(ride.status === 'accepted' || ride.status === 'onboard') && (
            <>
              <p className="font-bold text-emerald-800">{ride.status === 'accepted' ? t.privAccepted(ride.ownerFirstName) : t.privOnboard}</p>
              {ride.ownerPhone && (
                <a href={`tel:${ride.ownerPhone}`} dir="ltr" className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg bg-slate-900 px-3 font-semibold text-white">
                  <Phone className="size-4" aria-hidden="true" /> {t.privCall(ride.ownerFirstName)}
                </a>
              )}
            </>
          )}
          {ride.status === 'arrived' && (
            <div className="space-y-2">
              <p className="text-lg font-black">{t.tripFinishedQ}</p>
              <p className="font-bold">{t.payDriver(ride.price)}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void confirmPrivateDone(fb, uid).catch((e: { code?: string }) => setError(e.code ?? 'error'))} className="min-h-12 rounded-xl bg-emerald-600 font-bold text-white">
                  {t.yesFinished}
                </button>
                <button type="button" onClick={() => void problemPrivate(fb, uid).catch((e: { code?: string }) => setError(e.code ?? 'error'))} className="min-h-12 rounded-xl border border-rose-300 bg-rose-50 font-semibold text-rose-800">
                  {t.reportProblem}
                </button>
              </div>
              <p className="text-xs text-slate-500">{t.autoFinish(Math.max(0, Math.ceil((ride.arrivedAt + CONFIRM_FINISH_MINUTES * 60_000 - now) / 60_000)))}</p>
            </div>
          )}
          {ride.status === 'problem' && <p className="font-bold text-amber-800">{t.problemReported}</p>}
          {ride.status === 'done' && <p className="font-bold text-emerald-800">{t.tripDoneThanks}</p>}
        </div>
        <div className="flex gap-2">
          {(ride.status === 'offering' || ride.status === 'interest' || ride.status === 'confirmed' || ride.status === 'accepted') && (
            <button type="button" onClick={() => void cancelPrivate(fb, uid).catch((e: { code?: string }) => setError(e.code ?? 'error'))} className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white/70 font-semibold">
              {t.cancelRide}
            </button>
          )}
          {(ride.status === 'done' || ride.status === 'problem' || ride.status === 'declined' || ride.status === 'expired' || noAnswer) && (
            <button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-xl bg-slate-900 font-semibold text-white">
              {t.close}
            </button>
          )}
        </div>
        {error && <p className="text-sm font-semibold text-rose-700">{t.requestFailed(error)}</p>}
      </section>
    )
  }

  if (!vehicle) return <p className="p-2 text-sm text-slate-600">{t.privPickVehicle}</p>
  const valid = !!pickupAt && !!destinationAt && pickup.trim().length > 0 && isFreeText(pickup.trim()) && isFreeText(destination.trim()) && isFreeText(note.trim()) && /^\d{7}$/.test(phone.trim())
  const own = vehicle.ownerUid === uid
  const pin = (kind: 'pickup' | 'destination') =>
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
  const box = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base'
  return (
    <section className="space-y-3 p-2">
      <p className="rounded-lg bg-white/60 p-2 text-sm">
        <span className="font-bold">
          {typeName(vehicle)}
          {vehicle.firstName ? ` · ${vehicle.firstName}` : ''}
        </span>
        <span className="block text-xs text-slate-600">
          {vehicle.colour ? `${vehicle.colour} · ` : ''}
          {t.vehPrice(vehicle.priceBase, vehicle.pricePerKm)}
        </span>
      </p>
      {own && <p className="text-sm font-semibold text-amber-800">{t.privOwn}</p>}
      <PlaceInput id="priv-pickup" label={t.pickup} hint={t.pickupHint} value={pickup} onChange={(text, at) => {
          setPickup(text)
          setPickupAt(at)
        }} />
      {pin('pickup')}
      <PlaceInput id="priv-destination" label={t.destination} hint={t.pickupHint} value={destination} onChange={(text, at) => {
          setDestination(text)
          setDestinationAt(at)
        }} />
      {pin('destination')}
      {!pickupAt && pickup && <p className="text-xs text-amber-800">{t.privNeedsPin}</p>}
      <label className="block">
        <span className="text-sm font-medium">{t.yourPhone}</span>
        <input type="tel" inputMode="numeric" maxLength={7} value={phone} dir="ltr" onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} className={box} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">
          {t.callNote} ({t.optional})
        </span>
        <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} className={box} />
      </label>
      {pickupAt && destinationAt ? (
        <p className="text-lg font-black">
          {t.tripTotal(estimate(vehicle, pickupAt, destinationAt, tripMetres))} <span className="text-sm font-normal text-slate-500">· {tripKm(pickupAt, destinationAt, tripMetres)} km</span>
        </p>
      ) : (
        <p className="text-sm text-slate-600">{t.pickBothForPrice}</p>
      )}
      {error && <p className="text-sm font-semibold text-rose-700">{t.requestFailed(error)}</p>}
      <button
        type="button"
        disabled={!valid || busy || own}
        onClick={() => {
          if (!pickupAt) return
          setBusy(true)
          setError(null)
          bookPrivate(fb, { uid, name: name ?? '' }, vehicle, { phone, pickup, pickupAt, destination, destinationAt: destinationAt ?? null, note, metres: tripMetres })
            .catch((e: { code?: string }) => setError(e.code ?? 'error'))
            .finally(() => setBusy(false))
        }}
        className="min-h-12 w-full rounded-xl bg-emerald-500 px-4 font-bold text-slate-950 disabled:opacity-40"
      >
        {t.privSend}
      </button>
    </section>
  )
}
