import { createContext, useContext, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { useAvailability, useMyVehicles } from './vehicles'
import { logMine } from './activity'

// The vehicle this owner has switched to Available, for the whole app: it stays on the map on every
// tab until they switch it off (or close the app). Remembered on this device across reloads.

const KEY = 'taxiq.availableVehicle'
interface Ctx {
  availableId: string | null
  setAvailable: (id: string | null) => void
  error: string | null
}
const AvailabilityContext = createContext<Ctx>({ availableId: null, setAvailable: () => {}, error: null })

export function AvailabilityProvider({ children }: { children: ReactNode }) {
  const { fb, uid, name } = useAuth()
  const [wanted, setWanted] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  })
  const mine = useMyVehicles(fb, uid)
  // Called only from the person's own switch: log the change, not the heartbeats.
  const setAvailable = (id: string | null) => {
    if (id !== wanted) {
      const reg = mine.find((v) => v.id === (id ?? wanted))?.reg ?? ''
      logMine(fb, id ? 'availableOn' : 'availableOff', reg)
    }
    setWanted(id)
    try {
      if (id) localStorage.setItem(KEY, id)
      else localStorage.removeItem(KEY)
    } catch {
      // Storage unavailable: it lasts until reload.
    }
  }
  const vehicle = mine.find((v) => v.id === wanted && v.status === 'approved') ?? null
  const run = useAvailability(fb, vehicle, (name ?? '').split(' ')[0] ?? '')
  return <AvailabilityContext.Provider value={{ availableId: vehicle ? vehicle.id : null, setAvailable, error: run.error }}>{children}</AvailabilityContext.Provider>
}

// The provider and its hook live together, like useAuth in auth.tsx.
// oxlint-disable-next-line react/only-export-components
export const useAvailableVehicle = () => useContext(AvailabilityContext)
