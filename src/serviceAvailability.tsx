import { createContext, useContext, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { useMyServices, useServiceAvailability } from './services'
import { logMine } from './activity'

// The mobile service (a mechanic who comes to you, a tow truck) this helper has switched to
// Available, for the whole app: they stay on the map on every tab until they switch it off (or close
// the app). Remembered on this device across reloads. Like availability.tsx for vehicles.

const KEY = 'taxiq.availableService'
interface Ctx {
  serviceId: string | null
  setService: (id: string | null) => void
  error: string | null
}
const ServiceAvailabilityContext = createContext<Ctx>({ serviceId: null, setService: () => {}, error: null })

export function ServiceAvailabilityProvider({ children }: { children: ReactNode }) {
  const { fb, uid } = useAuth()
  const [wanted, setWanted] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  })
  const mine = useMyServices(fb, uid)
  // Called only from the helper's own switch: log the change, not the heartbeats.
  const setService = (id: string | null) => {
    if (id !== wanted) {
      const name = mine.find((s) => s.id === (id ?? wanted))?.name ?? ''
      logMine(fb, id ? 'availableOn' : 'availableOff', name)
    }
    setWanted(id)
    try {
      if (id) localStorage.setItem(KEY, id)
      else localStorage.removeItem(KEY)
    } catch {
      // Storage unavailable: it lasts until reload.
    }
  }
  const service = mine.find((s) => s.id === wanted && s.status === 'approved' && s.mode === 'mobile') ?? null
  const run = useServiceAvailability(fb, service)
  return <ServiceAvailabilityContext.Provider value={{ serviceId: service ? service.id : null, setService, error: run.error }}>{children}</ServiceAvailabilityContext.Provider>
}

// The provider and its hook live together, like useAuth in auth.tsx.
// oxlint-disable-next-line react/only-export-components
export const useAvailableService = () => useContext(ServiceAvailabilityContext)
