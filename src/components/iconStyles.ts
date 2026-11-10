import { BatteryCharging, Bike, Building2, Car, CarTaxiFront, CircleDot, Cog, Droplets, Footprints, Fuel, Motorbike, PersonStanding, PlugZap, Radio, Scooter, Snowflake, Truck, User, Van, Wrench, type LucideIcon } from 'lucide-react'
import type { VehicleType } from '../vehicles'
import type { Moving } from '../core/presence'
import type { ServiceKind } from '../core/services'

// Icon class names (Lucide icons inline with text), and the RTL-mirrored version for arrows.
export const ic = 'inline-block size-4 shrink-0 align-[-0.2em]'
export const icFlip = `${ic} rtl:-scale-x-100`

// TaxiQ Game roles.
export const ROLE_ICONS: Record<'citizen' | 'driver' | 'operator' | 'owner', LucideIcon> = { citizen: User, driver: CarTaxiFront, operator: Radio, owner: Building2 }

// How a person sharing their position is moving.
export const MOVING_ICONS: Record<Moving, LucideIcon> = { walk: Footprints, run: PersonStanding, bike: Bike, ebike: Scooter, motorbike: Motorbike, taxi: CarTaxiFront }

// Private vehicles for hire.
export const VEHICLE_ICONS: Record<VehicleType, LucideIcon> = { car: Car, van: Van, pickup: Truck, motorbike: Motorbike, ebike: Scooter }

// Services on the map (mechanics, tyres, towing...).
export const SERVICE_ICONS: Record<ServiceKind, LucideIcon> = { mechanic: Wrench, tyre: CircleDot, battery: BatteryCharging, towing: Truck, carwash: Droplets, ac: Snowflake, parts: Cog, fuel: Fuel, ebike: PlugZap }
