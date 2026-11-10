import { ArrowUpDown, BookOpen, Car, CarTaxiFront, Eye, Gamepad2, Hand, Languages, ListOrdered, LogIn, LogOut, Map as MapIcon, MapPin, Pencil, Settings2, Undo2, UserRound, type LucideIcon } from 'lucide-react'
import { ic } from './components/iconStyles'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './auth'
import { AdminPanel } from './components/AdminPanel'
import { CallPanel } from './components/CallPanel'
import { DispatchLog } from './components/DispatchLog'
import { DriverView } from './components/DriverView'
import { HirePanel, type DemoRide } from './components/HirePanel'
import { QueueRow } from './components/QueueRow'
import { RequestsPanel } from './components/RequestsPanel'
import { QueueChangesLog, ReorderPanel } from './components/ReorderPanel'
import { TranslationEditor } from './components/TranslationEditor'
import { ManagementView } from './components/ManagementView'
import { usePublicVehicles, type PublicVehicle } from './vehicles'
import { movePrivateOn, openPrivate, useMyPrivateRide } from './privateRides'
import { privateQueue, timedOut } from './core/openTrip'
import { PrivateHirePanel } from './components/PrivateHirePanel'
import { VoiceMessagesPanel } from './components/VoiceMessagesPanel'
import { TaxiFaresPanel } from './components/TaxiFaresPanel'
import { useVoiceClips } from './voiceClips'
import { MAIN, moveToMainCenter, useCenters } from './centers'
import { CentersPanel } from './components/CentersPanel'
import { Building2 } from 'lucide-react'
import { IncomingRides } from './components/IncomingRides'
import { PeoplePanel } from './components/PeoplePanel'
import { useI18n } from './i18n'
import { asMapTaxi } from './rides'
import { parseOverrides } from './translations'
import { useLiveQueue } from './useLiveQueue'
import { useLocalQueue } from './useQueue'
import { useMyRide, usePublicTaxis } from './useRides'
import { usePeople, useShareMe } from './usePresence'
import { useAvailableVehicle } from './availability'
import { ShareMe } from './components/ShareMe'
import { validateCall } from './validate'

// Leaflet is only loaded when a map is shown.
const MapView = lazy(() => import('./components/MapView'))
const MyVehicles = lazy(() => import('./components/MyVehicles').then((m) => ({ default: m.MyVehicles })))
const MyAccount = lazy(() => import('./components/MyAccount').then((m) => ({ default: m.MyAccount })))
const VehiclesAdmin = lazy(() => import('./components/VehiclesAdmin').then((m) => ({ default: m.VehiclesAdmin })))
const CorpusView = lazy(() => import('./components/CorpusView').then((m) => ({ default: m.CorpusView })))
const GameTab = lazy(() => import('./game/GameTab').then((m) => ({ default: m.GameTab })))

// The GitHub Pages copy can't sign in (Firebase only allows its own domains), so it runs the
// local demo of the operator screens.
const DEMO_HOST = location.hostname.endsWith('github.io')

// Who sees what:
//   demo     GitHub Pages: the operator screens on local data
//   staff    admin / operator: queue, map, admin (admins only)
//   driver   their offers and the map
//   public   signed out, or signed in without a role: the map and Hire a taxi
//   dev      full access, for testing: every screen, incl. driver (any taxi) and hire
type Mode = 'demo' | 'staff' | 'driver' | 'public' | 'dev'
type View = 'queue' | 'map' | 'admin' | 'driver' | 'hire' | 'game' | 'vehicles' | 'account' | 'corpus'

const EMPTY = new Set<string>()

// Each tab's icon (phones show the icon with a small label; wide screens the icon and the name).
const TAB_ICONS: Record<View, (l: Record<View, string>) => { Icon: LucideIcon; label: string }> = {
  queue: (l) => ({ Icon: ListOrdered, label: l.queue }),
  map: (l) => ({ Icon: MapIcon, label: l.map }),
  admin: (l) => ({ Icon: Settings2, label: l.admin }),
  driver: (l) => ({ Icon: CarTaxiFront, label: l.driver }),
  hire: (l) => ({ Icon: l.hire === l.map ? MapIcon : Hand, label: l.hire }),
  vehicles: (l) => ({ Icon: Car, label: l.vehicles }),
  account: (l) => ({ Icon: UserRound, label: l.account }),
  corpus: (l) => ({ Icon: BookOpen, label: l.corpus }),
  game: (l) => ({ Icon: Gamepad2, label: l.game }),
}

const VIEW_AS = ['dev', 'admin', 'operator', 'driver', 'private', 'citizen'] as const
type ViewAs = (typeof VIEW_AS)[number]
const VIEW_AS_KEY = 'taxiq.viewAs'

export default function App() {
  const auth = useAuth()
  const signedIn = auth.status === 'signedIn'
  // Developers can view the app as any role ("View as" in the header). It only changes what this
  // screen shows; the real role stays dev, and the rules still treat them as dev.
  const [viewAs, setViewAsState] = useState<ViewAs>(() => {
    try {
      const v = sessionStorage.getItem(VIEW_AS_KEY)
      return VIEW_AS.find((x) => x === v) ?? 'dev'
    } catch {
      return 'dev'
    }
  })
  const setViewAs = (v: ViewAs) => {
    setViewAsState(v)
    try {
      sessionStorage.setItem(VIEW_AS_KEY, v)
    } catch {
      // Storage unavailable: the choice lasts until reload.
    }
  }
  const isDev = signedIn && auth.role === 'dev'
  const role = isDev ? (viewAs === 'citizen' ? null : viewAs) : auth.role
  const mode: Mode = DEMO_HOST
    ? 'demo'
    : signedIn && role === 'dev'
      ? 'dev'
      : signedIn && (role === 'admin' || role === 'operator')
      ? 'staff'
      : signedIn && role === 'driver'
        ? 'driver'
        : 'public'

  const local = useLocalQueue()
  const live = mode === 'staff' || mode === 'dev'
  // Taxi centers. Staff work on their own center; platform admins (and developers) pick one.
  const centers = useCenters(auth.fb, signedIn && !DEMO_HOST)
  const [pickedCenter, setPickedCenterState] = useState<string>(() => {
    try {
      return sessionStorage.getItem('taxiq.center') || MAIN
    } catch {
      return MAIN
    }
  })
  const setPickedCenter = (c: string) => {
    setPickedCenterState(c)
    try {
      sessionStorage.setItem('taxiq.center', c)
    } catch {
      // Storage unavailable: the choice lasts until reload.
    }
  }
  const staffCenter = auth.isPlatform ? pickedCenter : auth.centerId
  // Once, on a platform admin's app: today's records (no center) go to the first center.
  useEffect(() => {
    if (live && auth.isPlatform && auth.fb && auth.email) void moveToMainCenter(auth.fb, auth.email).catch(() => {})
  }, [live, auth.isPlatform, auth.fb, auth.email])
  const remote = useLiveQueue(auth.fb, live, auth.email, role === 'admin' || role === 'dev', staffCenter)
  const q = live ? remote : local
  const publicTaxis = usePublicTaxis(auth.fb, mode === 'public' || mode === 'driver' || mode === 'dev')
  const mapTaxis = useMemo(() => publicTaxis.map(asMapTaxi), [publicTaxis])
  // The demo site has no live service: hiring there (demo rides only) uses the local demo taxis.
  const hireTaxis = useMemo(
    () => (DEMO_HOST ? q.queue.map((x) => ({ id: x.id, taxiNo: x.taxiNo, name: x.driver.name, nameDv: x.driver.nameDv, suspended: !!x.suspended, seats: x.seats ?? 4, vehicleId: x.vehicleId ?? null, centerId: x.centerId ?? 'main' })) : publicTaxis),
    [q.queue, publicTaxis],
  )
  const hireMapTaxis = DEMO_HOST ? q.queue : mapTaxis
  const [chosen, setChosen] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  // The hire form only shows when the viewer chose Hire on a taxi, or has a ride in progress (then
  // as a small bar they can open). Closing it hides it until they hire again.
  const [hireShown, setHireShown] = useState(false)
  const [hireFrom, setHireFrom] = useState<{ at: [number, number]; name: string; n: number } | null>(null)
  const [hireOpen, setHireOpen] = useState(false)
  const myRide = useMyRide(auth.fb, auth.uid ?? null)
  const [closedRide, setClosedRide] = useState<number | null>(null)
  // Booked and until the passenger confirms it finished: the taxi's trip on the map.
  const riding = myRide?.status === 'accepted' || myRide?.status === 'onboard' || myRide?.status === 'arrived'
  const acceptedTrip = riding && myRide?.pickupAt && myRide.destinationAt && myRide.createdAt !== closedRide ? { from: myRide.pickupAt, to: myRide.destinationAt } : undefined
  // Demo rides (developers, and the demo site): no real taxi, nothing saved. The taxi accepts by
  // itself after a moment, then drives the trip on the map.
  const demoAllowed = DEMO_HOST
  const [demoRide, setDemoRide] = useState<DemoRide | null>(null)
  useEffect(() => {
    if (demoRide?.status !== 'offering') return
    const timer = setTimeout(() => setDemoRide((r) => (r ? { ...r, status: 'accepted' } : r)), 3000)
    return () => clearTimeout(timer)
  }, [demoRide?.status])
  // People showing themselves on the map (opt-in). Drivers and centers see names; others an icon.
  const seesNames = signedIn && (role === 'admin' || role === 'operator' || role === 'dev' || role === 'driver')
  const people = usePeople(auth.fb, signedIn && !DEMO_HOST, seesNames, auth.uid ?? null)
  // One way of moving at a time: while your vehicle is Available you're on the map as the vehicle,
  // so Show me pauses and you can't hire. Switching it off (park and walk) is fine.
  const { availableId } = useAvailableVehicle()
  const driving = !!availableId
  const shareMe = useShareMe(auth.fb, signedIn && !DEMO_HOST ? (auth.uid ?? null) : null, auth.name ?? '', !!riding, driving)
  const vehicles = usePublicVehicles(auth.fb, signedIn && !DEMO_HOST)
  // Recorded voice messages (Management -> Voice messages), kept in memory to play.
  useVoiceClips(auth.fb, signedIn && !DEMO_HOST)
  // Booking a private vehicle: the vehicle tapped on the map, and this passenger's booking.
  const [chosenVehicle, setChosenVehicle] = useState<PublicVehicle | null>(null)
  // See it on the map (from My vehicles): fly to and follow that vehicle.
  const [focusVehicle, setFocusVehicle] = useState<{ id: string; n: number } | null>(null)
  const myPrivate = useMyPrivateRide(auth.fb, signedIn && !DEMO_HOST ? (auth.uid ?? null) : null)
  const [closedPrivate, setClosedPrivate] = useState<number | null>(null)
  const privateLive = !!myPrivate && myPrivate.createdAt !== closedPrivate && myPrivate.status !== 'cancelled'
  // The private queue (open trips by private hire): vehicles on the map, first available first.
  const privateQ = useMemo(() => privateQueue(vehicles, auth.uid ?? ''), [vehicles, auth.uid])
  // An open private trip waits its time at each step, then moves on to the next vehicle (the
  // passenger's phone does it; the rules check the time).
  const movedPrivate = useRef('')
  useEffect(() => {
    const fb = auth.fb
    const r = myPrivate
    if (!fb || !r || r.mode !== 'queue' || !(r.status === 'offering' || r.status === 'interest' || r.status === 'confirmed')) return
    const step = r.status
    const tick = () => {
      const key = `${r.createdAt}:${r.offerAt}`
      if (movedPrivate.current === key || !timedOut(step, r.offerAt, Date.now())) return
      movedPrivate.current = key
      movePrivateOn(fb, r, privateQueue(vehicles, r.uid, r.skipped)).catch(() => {
        movedPrivate.current = ''
      })
    }
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [auth.fb, myPrivate, vehicles])
  const privateMode = !!chosenVehicle || privateLive
  const shareControl = signedIn && !DEMO_HOST && !driving ? <ShareMe me={shareMe} /> : undefined
  const rideInProgress = !!myRide && myRide.createdAt !== closedRide && (myRide.status === 'offering' || myRide.status === 'interest' || myRide.status === 'confirmed' || myRide.status === 'accepted' || myRide.status === 'onboard' || myRide.status === 'arrived' || myRide.status === 'problem')
  const [hirePickup, setHirePickup] = useState<[number, number] | undefined>()
  const [tripMetres, setTripMetres] = useState<number | null>(null)
  const [pinMode, setPinMode] = useState<'pickup' | 'destination' | null>(null)
  const pinApply = useRef<((at: [number, number], name: string) => void) | null>(null)
  const [hireTrip, setHireTrip] = useState<{ from: [number, number]; to: [number, number] } | undefined>()

  const canAdmin = mode === 'demo' || role === 'admin' || role === 'dev'
  const { queue, history, interested, pick, call, setCall, callInProgress, canUndo, toggle, clear, undo } = q
  const callValid = Object.keys(validateCall(call)).length === 0
  // Invalid passenger details block assigning, so bad input is never attached to a dispatch.
  const assign = (id: string) => callValid && q.assign(id)

  // TaxiQ Game is open to everyone on the live site (not the demo host).
  // My account: everyone signed in (not the demo host).
  // The Dhivehi corpus: corpus editors only (platform admins, or roles/{email}.corpus).
  const game: View[] = DEMO_HOST ? [] : ['vehicles', ...(signedIn ? (['account'] as View[]) : []), ...(auth.corpusEditor ? (['corpus'] as View[]) : []), 'game']
  const tabs: View[] =
    mode === 'dev'
      ? ['queue', 'map', 'admin', 'driver', 'hire', ...game]
      : mode === 'driver'
        ? ['driver', 'map', ...game]
        : mode === 'public'
          ? DEMO_HOST
            ? []
            : ['hire', ...game]
          : canAdmin
            ? ['queue', 'map', ...(DEMO_HOST ? (['hire'] as View[]) : []), 'admin', ...game]
            : ['queue', 'map', ...game]
  const [viewState, setView] = useState<View>('queue')
  const view: View = tabs.includes(viewState) ? viewState : (tabs[0] ?? 'map')
  const { lang, t, toggleLang, driverName, setDvFixes } = useI18n()
  // Without a staff role, the Hire screen is the full-screen map (taxis, vehicles, hiring): call it Map.
  const tabLabels = { queue: t.queue, map: t.map, admin: t.admin, driver: t.driver, hire: mode === 'public' && !DEMO_HOST ? t.map : t.hireTab, vehicles: t.vehTab, account: t.acctTab, corpus: t.corpusTab, game: t.gameTab }
  // The map views fill the screen under the header; everything else floats over the map.
  // Only the map screens fill the screen (no page scroll); My vehicles and the game scroll normally.
  const fullMap = view === 'map' || (view !== 'game' && view !== 'vehicles' && view !== 'account' && view !== 'corpus' && (mode === 'public' || view === 'hire'))
  const [editingTranslations, setEditingTranslations] = useState(false)
  const canTranslate = !DEMO_HOST && (role === 'admin' || role === 'dev')

  // Live Dhivehi fixes (Admin → Translations), readable by everyone.
  const fb = auth.fb
  useEffect(() => {
    if (!fb || DEMO_HOST) return
    return fb.onSnapshot(
      fb.doc(fb.db, 'translations', 'dv'),
      (snap) => setDvFixes(parseOverrides(snap.data())),
      () => {},
    )
  }, [fb, setDvFixes])
  const operatorScreens = mode === 'demo' || mode === 'staff' || mode === 'dev'

  return (
    <div className={`bg-slate-100 text-slate-900 ${fullMap ? 'flex h-dvh flex-col overflow-hidden' : 'min-h-dvh'}`}>
      {editingTranslations && canTranslate && <TranslationEditor onClose={() => setEditingTranslations(false)} />}
      {signedIn && !DEMO_HOST && <IncomingRides />}
      <header className="sticky top-0 z-[1200] border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-2 sm:py-3">
          <h1 className="flex shrink-0 items-center gap-2 text-xl font-black tracking-tight" dir="ltr">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8 sm:size-9" />
            <span>
              Taxi<span className="text-emerald-600">Q</span>
            </span>
          </h1>
          <div className="flex items-center gap-1 text-sm sm:gap-2">
            {operatorScreens && (
              <>
                <span className="hidden rounded-full bg-slate-100 px-3 py-1 font-medium tabular-nums sm:inline">{t.inQueue(queue.length)}</span>
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo || callInProgress}
                  aria-label={t.undo}
                  title={t.undo}
                  className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-lg px-2 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 sm:px-3"
                >
                  <Undo2 className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t.undo}</span>
                </button>
              </>
            )}
            {live && auth.isPlatform && centers.length > 1 && (
              <label className="flex items-center gap-1">
                <Building2 className="size-4 text-slate-500" aria-hidden="true" />
                <select
                  value={staffCenter}
                  onChange={(e) => setPickedCenter(e.target.value)}
                  aria-label={t.centerPick}
                  title={t.centerPick}
                  className="min-h-10 max-w-[9rem] rounded-lg border border-slate-200 bg-white px-1 text-sm font-semibold"
                >
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {lang === 'dv' && c.nameDv ? c.nameDv : c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {isDev && (
              <label className="flex items-center gap-1">
                <Eye className={`size-4 ${viewAs === 'dev' ? 'text-slate-500' : 'text-fuchsia-600'}`} aria-hidden="true" />
              <select
                value={viewAs}
                onChange={(e) => setViewAs(e.target.value as ViewAs)}
                aria-label={t.viewAs}
                title={t.viewAs}
                className={`min-h-10 rounded-lg border px-1 text-sm font-semibold ${viewAs === 'dev' ? 'border-slate-200 bg-white' : 'border-fuchsia-400 bg-fuchsia-50 text-fuchsia-800'}`}
              >
                {VIEW_AS.map((v) => (
                  <option key={v} value={v}>
                    {t.viewAsRoles[v]}
                  </option>
                ))}
              </select>
              </label>
            )}
            {canTranslate && (
              <button
                type="button"
                onClick={() => setEditingTranslations(true)}
                title={t.translations}
                aria-label={t.translations}
                className="min-h-10 rounded-lg border border-slate-200 px-3 hover:bg-slate-100"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleLang}
              lang={lang === 'en' ? 'dv' : 'en'}
              aria-label={t.switchTo}
              title={t.switchTo}
              className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 font-medium text-slate-700 hover:bg-slate-100 sm:px-3"
            >
              <Languages className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t.switchTo}</span>
            </button>
            {!DEMO_HOST &&
              (signedIn ? (
                <button type="button" onClick={auth.signOut} title={auth.email ?? ''} aria-label={t.signOut} className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-lg px-2 font-medium text-slate-700 hover:bg-slate-100">
                  <LogOut className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t.signOut}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={auth.signIn}
                  disabled={auth.status === 'loading'}
                  className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-slate-900 px-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
                >
                  <LogIn className="size-4" aria-hidden="true" />
                  {t.signIn}
                </button>
              ))}
          </div>
        </div>

        {tabs.length > 0 && (
          <nav className={`mx-auto grid max-w-5xl gap-1 px-4 pb-2 text-sm sm:flex ${({ 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6', 7: 'grid-cols-7' } as Record<number, string>)[tabs.length] ?? 'grid-cols-3'}`} aria-label={t.nav}>
            {tabs.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-current={view === v ? 'page' : undefined}
                aria-label={TAB_ICONS[v](tabLabels).label}
                className={`relative min-h-12 min-w-0 rounded-lg px-1 font-semibold sm:min-h-10 sm:px-3 ${view === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {(() => {
                  const { Icon, label } = TAB_ICONS[v](tabLabels)
                  return (
                    <span className="flex flex-col items-center gap-0.5 sm:flex-row sm:gap-1.5">
                      <Icon className="size-5 sm:size-4" aria-hidden="true" />
                      <span className="max-w-full truncate text-[10px] leading-tight sm:text-sm">{label}</span>
                    </span>
                  )
                })()}
                {v === 'queue' && <span className="absolute end-1 top-0.5 text-[10px] tabular-nums opacity-70 sm:hidden">{queue.length}</span>}
              </button>
            ))}
          </nav>
        )}

        {/* Mode and account status. */}
        <div className="mx-auto max-w-5xl px-4 pb-2 text-xs">
          {mode === 'staff' || mode === 'driver' || mode === 'dev' ? (
            <p className="flex items-center gap-2 text-emerald-800">
              <span className="rounded bg-emerald-600 px-1.5 py-0.5 font-bold text-white">{t.liveBadge}</span>
              <bdi dir="ltr" className="truncate">
                {auth.email}
              </bdi>
              <span className="text-slate-500">· {t.roles[auth.role!]}</span>
            </p>
          ) : mode === 'demo' ? (
            <p className="flex items-center gap-2 text-slate-500">
              <span className="rounded bg-slate-200 px-1.5 py-0.5 font-bold text-slate-700">{t.demoBadge}</span>
              <span>{t.demoNote}</span>
            </p>
          ) : (
            signedIn && (
              <p className="text-slate-500">
                <bdi dir="ltr">{auth.email}</bdi>
              </p>
            )
          )}
          {auth.error && <p className="mt-1 font-semibold text-rose-700">{t.signInError(auth.error)}</p>}
          {operatorScreens && q.error && <p className="mt-1 font-semibold text-rose-700">{t.saveError(q.error)}</p>}
        </div>

        {operatorScreens && view === 'queue' && (
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 pb-3 sm:gap-3">
            {pick || callInProgress ? (
              <>
                <p className="min-w-0 flex-1 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 sm:px-4 sm:py-3">
                  {pick ? (
                    <>
                      <span className="font-bold">{t.answeredCount(interested.size)}</span>
                      <span className="block truncate">
                        {t.nextInLine} <span className="font-bold tabular-nums">{pick.taxiNo}</span> · {driverName(pick.driver)}
                      </span>
                    </>
                  ) : (
                    <span className="block">{t.hint}</span>
                  )}
                  {call.pickup && (
                    <span className="block truncate text-emerald-800">
                      <MapPin className={`${ic} text-emerald-600`} aria-hidden="true" /> <bdi>{call.pickup}</bdi>
                    </span>
                  )}
                  {!callValid && (
                    <span className="block font-semibold text-rose-700">
                      {t.callTitle}: {t.notValid}
                    </span>
                  )}
                </p>
                <button type="button" onClick={clear} className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
                  {t.cancelCall}
                </button>
              </>
            ) : (
              <p className="flex-1 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 sm:px-4 sm:py-3">{t.hint}</p>
            )}
          </div>
        )}
      </header>

      {view === 'vehicles' ? (
        <main className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
          <Suspense fallback={<p className="text-sm text-slate-500">{t.loading}</p>}>
            <MyVehicles
              onShowOnMap={(id) => {
                setFocusVehicle({ id, n: Date.now() })
                setView('hire')
              }}
            />
          </Suspense>
        </main>
      ) : view === 'account' ? (
        <main className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
          <Suspense fallback={<p className="text-sm text-slate-500">{t.loading}</p>}>
            <MyAccount onGoTo={(v) => setView(v === 'vehicles' ? 'vehicles' : tabs.includes('hire') ? 'hire' : 'map')} />
          </Suspense>
        </main>
      ) : view === 'corpus' ? (
        <main className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
          <Suspense fallback={<p className="text-sm text-slate-500">{t.loading}</p>}>
            <CorpusView />
          </Suspense>
        </main>
      ) : view === 'game' ? (
        <main className="isolate mx-auto max-w-6xl px-2 py-3 sm:px-4 sm:py-6">
          <Suspense fallback={<p className="text-sm text-slate-500">{t.loading}</p>}>
            <GameTab />
          </Suspense>
        </main>
      ) : mode === 'public' || view === 'hire' ? (
        <main className="relative isolate min-h-0 flex-1">
          <Suspense fallback={<p className="p-4 text-sm text-slate-500">{t.loading}</p>}>
            <MapView
              fullscreen
              people={people}
              vehicles={vehicles}
              focusVehicle={focusVehicle}
              myUid={auth.uid ?? null}
              onHireVehicle={
                driving
                  ? undefined
                  : (v) => {
                      setChosenVehicle(v)
                      setChosen(null)
                      setHireShown(true)
                      setHireOpen(true)
                    }
              }
              privateRide={
                privateLive && myPrivate && (myPrivate.status === 'offering' || myPrivate.status === 'accepted' || myPrivate.status === 'onboard' || myPrivate.status === 'arrived')
                  ? { vehicleId: myPrivate.vehicleId, pickup: myPrivate.pickupAt, destination: myPrivate.destinationAt ?? myPrivate.pickupAt, status: myPrivate.status === 'arrived' ? 'onboard' : myPrivate.status }
                  : undefined
              }
              shareControl={shareControl}
              taxis={hireMapTaxis}
              interested={EMPTY}
              pickupAt={hireTrip ? undefined : hirePickup}
              onPickTaxi={
                driving
                  ? undefined
                  : (id) => {
                      setChosen(id)
                      setHireShown(true)
                      setHireOpen(true)
                    }
              }
              driving={driving}
              trip={
                demoRide?.status === 'accepted'
                  ? { from: demoRide.pickupAt, to: demoRide.destinationAt }
                  : privateLive && myPrivate && myPrivate.destinationAt && (myPrivate.status === 'accepted' || myPrivate.status === 'onboard' || myPrivate.status === 'arrived')
                    ? { from: myPrivate.pickupAt, to: myPrivate.destinationAt }
                    : (acceptedTrip ?? hireTrip)
              }
              activeTrip={
                demoRide?.status === 'accepted'
                  ? { taxiId: demoRide.taxiId, pickup: demoRide.pickupAt, destination: demoRide.destinationAt }
                  : riding && myRide?.acceptedBy && myRide.pickupAt && myRide.createdAt !== closedRide
                  ? { taxiId: myRide.acceptedBy, pickup: myRide.pickupAt, destination: myRide.destinationAt ?? myRide.pickupAt }
                  : undefined
              }
              panelTitle={privateMode ? t.privTitle : t.hire}
              panelOpen={hireOpen}
              onTripMetres={setTripMetres}
              onPanelOpenChange={setHireOpen}
              onPanelClose={() => {
                setChosenVehicle(null)
                if (myPrivate) setClosedPrivate(myPrivate.createdAt)
                setHireShown(false)
                setHireOpen(false)
                setChosen(null)
                if (myRide) setClosedRide(myRide.createdAt)
              }}
              onHireFrom={driving ? undefined : (at, placeName) => {
                setHireFrom({ at, name: placeName, n: Date.now() })
                setChosen(null)
                setHireShown(true)
                setHireOpen(true)
              }}
              pinMode={pinMode}
              onPin={(at, placeName) => {
                pinApply.current?.(at, placeName)
                setPinMode(null)
                setHireOpen(true)
              }}
              onPinCancel={() => {
                setPinMode(null)
                setHireOpen(true)
              }}
              panel={
                (hireShown || rideInProgress || pinMode || demoRide || privateLive) &&
                (privateMode ? (
                  <PrivateHirePanel
                    key={`${chosenVehicle?.id ?? ''}-${hireFrom?.n ?? 0}`}
                    vehicle={chosenVehicle}
                    ride={privateLive ? myPrivate : null}
                    tripMetres={tripMetres}
                    offered={myPrivate ? (vehicles.find((x) => x.id === myPrivate.vehicleId) ?? null) : null}
                    onNoThanks={() => auth.fb && myPrivate && void movePrivateOn(auth.fb, myPrivate, privateQueue(vehicles, myPrivate.uid, myPrivate.skipped)).catch(() => {})}
                    initialPickup={hireFrom ?? undefined}
                    onTrip={setHireTrip}
                    onPinRequest={(kind, apply) => {
                      pinApply.current = apply
                      setPinMode(kind)
                    }}
                    onClose={() => {
                      setChosenVehicle(null)
                      if (myPrivate) setClosedPrivate(myPrivate.createdAt)
                      setHireShown(false)
                      setHireOpen(false)
                    }}
                  />
                ) : (
                <HirePanel
                  key={hireFrom?.n ?? 0}
                  tripMetres={tripMetres}
                  onOpenPrivate={
                    signedIn && !DEMO_HOST && auth.fb && auth.uid
                      ? privateQ.length
                        ? (b) => openPrivate(auth.fb!, { uid: auth.uid!, name: auth.name ?? '' }, privateQ, b)
                        : null
                      : undefined
                  }
                  initialPickup={hireFrom ?? undefined}
                  taxis={hireTaxis}
                  demoAllowed={demoAllowed}
                  demoRide={demoRide}
                  onDemoRide={(r) => {
                    const free = hireTaxis.filter((x) => !x.suspended)
                    const taxiId = r.taxiId ?? free[Math.floor(Math.random() * free.length)]?.id
                    if (taxiId) setDemoRide({ ...r, taxiId, status: 'offering' })
                  }}
                  onEndDemo={() => {
                    setDemoRide(null)
                    setChosen(null)
                  }}
                  chosen={chosen}
                  onClearChoice={() => setChosen(null)}
                  onTrip={setHireTrip}
                  onPickup={setHirePickup}
                  onPinRequest={(kind, apply) => {
                    pinApply.current = apply
                    setPinMode(kind)
                  }}
                />
                ))
              }
            />
          </Suspense>
        </main>
      ) : view === 'driver' ? (
        <main className="mx-auto max-w-xl px-4 py-4 sm:py-6">
          <DriverView taxis={publicTaxis} />
        </main>
      ) : view === 'admin' ? (
        <main className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
          <ManagementView
            users={live && canAdmin ? <PeoplePanel taxis={queue} center={staffCenter} centers={centers} /> : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">{t.mgmtUsersNeedLive}</p>}
            taxis={
              <div className="space-y-4">
                {live && canAdmin && <TaxiFaresPanel center={staffCenter} />}
                <AdminPanel taxis={queue} onRegister={q.register} onRemove={q.remove} onSuspend={q.suspend} onLift={q.lift} onSeats={q.setSeats} />
              </div>
            }
            vehicles={live ? <Suspense fallback={<p className="text-sm text-slate-500">{t.loading}</p>}><VehiclesAdmin taxis={queue} center={staffCenter} /></Suspense> : undefined}
            voice={live && auth.isPlatform ? <VoiceMessagesPanel /> : undefined}
            centers={live && auth.isPlatform ? <CentersPanel centers={centers} /> : undefined}
          />
        </main>
      ) : view === 'map' ? (
        <main className="relative isolate min-h-0 flex-1">
          <Suspense fallback={<p className="p-4 text-sm text-slate-500">{t.loading}</p>}>
            {mode === 'driver' ? (
              <MapView fullscreen people={people} vehicles={vehicles} shareControl={shareControl} taxis={mapTaxis} interested={EMPTY} pickupAt={undefined} />
            ) : (
              <MapView fullscreen people={people} vehicles={vehicles} shareControl={shareControl} taxis={queue} interested={interested} pickupAt={call.pickupAt} trip={call.pickupAt && call.destinationAt ? { from: call.pickupAt, to: call.destinationAt } : undefined} />
            )}
          </Suspense>
        </main>
      ) : (
        <main className="mx-auto grid max-w-5xl gap-6 px-4 py-4 sm:py-6 lg:grid-cols-[1fr_18rem]">
          <section className="space-y-3">
            <CallPanel call={call} onChange={setCall} />
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{t.queue}</h2>
              {!reordering && queue.length > 1 && (
                <button
                  type="button"
                  onClick={() => setReordering(true)}
                  disabled={callInProgress}
                  title={callInProgress ? t.callBusy : undefined}
                  className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
                >
                  <ArrowUpDown className={ic} aria-hidden="true" /> {t.reorder}
                </button>
              )}
            </div>
            {reordering && (
              <ReorderPanel
                queue={queue}
                onClose={() => setReordering(false)}
                onSave={(order, kind, reason, note) => {
                  q.reorder(order, kind, reason, note)
                  setReordering(false)
                }}
              />
            )}
            {live && !q.loaded && <p className="text-sm text-slate-500">{t.loading}</p>}
            {live && q.loaded && !queue.length && (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                <p>{t.liveEmpty}</p>
                {q.seedDemo && canAdmin && (
                  <button type="button" onClick={q.seedDemo} className="mt-2 min-h-10 rounded-lg bg-emerald-500 px-4 font-bold text-slate-950 hover:bg-emerald-400">
                    {t.seedDemo}
                  </button>
                )}
              </div>
            )}
            {/* Left gutter is the room a row slides into when its driver answers. */}
            <ol className={`space-y-2 pl-20 ${reordering ? 'hidden' : ''}`}>
              {queue.map((taxi, i) => (
                <QueueRow
                  key={taxi.id}
                  taxi={taxi}
                  position={i + 1}
                  interested={interested.has(taxi.id)}
                  picked={pick?.id === taxi.id}
                  onToggle={() => toggle(taxi.id)}
                  onAssign={() => assign(taxi.id)}
                />
              ))}
            </ol>
          </section>

          <aside className="space-y-4">
            {live && <RequestsPanel taxis={queue} center={staffCenter} />}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{t.recent}</h2>
              <DispatchLog history={history} queue={queue} callInProgress={callInProgress} onReopen={q.reopen} />
              <QueueChangesLog changes={q.changes} queue={queue} />
              {q.reset && (
                <button type="button" onClick={q.reset} className="text-sm text-slate-500 underline hover:text-slate-700">
                  {t.reset}
                </button>
              )}
            </section>
          </aside>
        </main>
      )}
    </div>
  )
}
