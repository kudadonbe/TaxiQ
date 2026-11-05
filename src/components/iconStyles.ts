import { Building2, CarTaxiFront, Radio, User, type LucideIcon } from 'lucide-react'

// Icon class names (Lucide icons inline with text), and the RTL-mirrored version for arrows.
export const ic = 'inline-block size-4 shrink-0 align-[-0.2em]'
export const icFlip = `${ic} rtl:-scale-x-100`

// TaxiQ Game roles.
export const ROLE_ICONS: Record<'citizen' | 'driver' | 'operator' | 'owner', LucideIcon> = { citizen: User, driver: CarTaxiFront, operator: Radio, owner: Building2 }
