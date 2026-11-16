import { MonitorSmartphone, TriangleAlert, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useAvailableVehicle } from '../availability'
import { useI18n } from '../i18n'
import { useAvailableService } from '../serviceAvailability'
import { useStayAwake } from '../wakeLock'

// On every screen while the person is Available (a vehicle or a mobile service): keeps the screen on
// (useStayAwake) and warns when TaxiQ was in the background, since positions and ride requests pause
// then. When the screen can't be kept on, a one-time hint (remembered on this device) says to keep
// TaxiQ open and use a charger.

const HINT_KEY = 'taxiq.wakeHintSeen'

export function StayOpenBanner() {
  const { t } = useI18n()
  const { availableId } = useAvailableVehicle()
  const { serviceId } = useAvailableService()
  const active = !!(availableId || serviceId)
  const { wake, wasHidden, dismissHidden } = useStayAwake(active)
  const [hintSeen, setHintSeen] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === '1'
    } catch {
      return false
    }
  })
  const closeHint = () => {
    setHintSeen(true)
    try {
      localStorage.setItem(HINT_KEY, '1')
    } catch {
      // Storage unavailable: hidden until reload.
    }
  }
  const showHint = active && !hintSeen && (wake === 'unsupported' || wake === 'refused')
  if (!active || (!wasHidden && !showHint)) return null
  return (
    <div className="pointer-events-none fixed inset-x-2 top-16 z-[1300] mx-auto max-w-md space-y-2 sm:top-20">
      {wasHidden && (
        <Notice icon={<TriangleAlert className="size-5 shrink-0 text-amber-600" aria-hidden />} text={t.wakeWasHidden} close={dismissHidden} label={t.wakeClose} />
      )}
      {showHint && (
        <Notice icon={<MonitorSmartphone className="size-5 shrink-0 text-sky-600" aria-hidden />} text={t.wakeHint} close={closeHint} label={t.wakeClose} />
      )}
    </div>
  )
}

function Notice({ icon, text, close, label }: { icon: ReactNode; text: string; close: () => void; label: string }) {
  return (
    <div role="status" className="pointer-events-auto flex items-start gap-2 rounded-xl border border-amber-200 bg-white/95 p-3 text-sm text-slate-800 shadow-lg">
      {icon}
      <p className="flex-1 text-start">{text}</p>
      <button type="button" onClick={close} aria-label={label} className="-m-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
        <X className="size-5" aria-hidden />
      </button>
    </div>
  )
}
