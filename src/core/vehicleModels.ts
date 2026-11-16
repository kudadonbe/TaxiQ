// Vehicle models common in the Maldives, so an owner can pick their real model and the map can draw
// its shape at its real size (plans/vehicles-traffic-services.md §1). v2 keeps a built-in list here;
// v3 moves it to an admin-curated Firestore list. Sizes are approximate, publicly known manufacturer
// figures (one common version of each model), in metres. Pure data and functions.

// Our vehicle types (src/vehicles.ts), plus buses (RTL and the like, not offered for private hire).
export type ModelType = 'car' | 'van' | 'pickup' | 'motorbike' | 'ebike' | 'bicycle' | 'bus'

// Top-down shapes the map can draw (src/components/vehicleShapes.ts).
export type VehicleShape = 'hatchback' | 'sedan' | 'suv' | 'van' | 'minibus' | 'pickup' | 'lorry' | 'bus' | 'scooter' | 'motorbike' | 'ebike' | 'bicycle'
export const VEHICLE_SHAPES: VehicleShape[] = ['hatchback', 'sedan', 'suv', 'van', 'minibus', 'pickup', 'lorry', 'bus', 'scooter', 'motorbike', 'ebike', 'bicycle']

// Which shapes fit each type (lorries are goods vehicles, so they go under pickup).
export const SHAPES_FOR_TYPE: Record<ModelType, VehicleShape[]> = {
  car: ['hatchback', 'sedan', 'suv'],
  van: ['van', 'minibus'],
  pickup: ['pickup', 'lorry'],
  motorbike: ['scooter', 'motorbike'],
  ebike: ['ebike', 'scooter'],
  bicycle: ['bicycle'],
  bus: ['bus', 'minibus'],
}

export interface Dims {
  shape: VehicleShape
  length: number // m
  width: number // m
  wheelbase: number // m, rear axle to front axle
}
export interface VehicleModel extends Dims {
  id: string // ^[a-z0-9-]+$, at most 40 characters (the rules check the same)
  make: string
  model: string
  type: ModelType
  seats: number
}

export const MODEL_ID_RE = /^[a-z0-9-]{1,40}$/

// [id, make, model, type, shape, length, width, wheelbase, seats]
type Row = [string, string, string, ModelType, VehicleShape, number, number, number, number]
const ROWS: Row[] = [
  // Scooters
  ['honda-dio', 'Honda', 'Dio 110', 'motorbike', 'scooter', 1.81, 0.72, 1.26, 2],
  ['honda-activa', 'Honda', 'Activa 6G', 'motorbike', 'scooter', 1.83, 0.7, 1.26, 2],
  ['honda-click-125', 'Honda', 'Click 125i', 'motorbike', 'scooter', 1.92, 0.68, 1.28, 2],
  ['honda-pcx-160', 'Honda', 'PCX 160', 'motorbike', 'scooter', 1.94, 0.74, 1.31, 2],
  ['yamaha-ray-zr', 'Yamaha', 'Ray ZR 125', 'motorbike', 'scooter', 1.88, 0.69, 1.28, 2],
  ['yamaha-fascino', 'Yamaha', 'Fascino 125', 'motorbike', 'scooter', 1.92, 0.69, 1.28, 2],
  ['yamaha-nmax-155', 'Yamaha', 'NMAX 155', 'motorbike', 'scooter', 1.94, 0.74, 1.34, 2],
  ['yamaha-aerox-155', 'Yamaha', 'Aerox 155', 'motorbike', 'scooter', 1.98, 0.7, 1.35, 2],
  ['tvs-ntorq', 'TVS', 'Ntorq 125', 'motorbike', 'scooter', 1.87, 0.71, 1.29, 2],
  ['suzuki-access-125', 'Suzuki', 'Access 125', 'motorbike', 'scooter', 1.87, 0.69, 1.27, 2],
  ['suzuki-burgman-street', 'Suzuki', 'Burgman Street 125', 'motorbike', 'scooter', 1.88, 0.72, 1.27, 2],
  ['vespa-lx-125', 'Vespa', 'LX 125', 'motorbike', 'scooter', 1.77, 0.71, 1.29, 2],
  // Motorbikes
  ['honda-wave-110', 'Honda', 'Wave 110', 'motorbike', 'motorbike', 1.92, 0.71, 1.23, 2],
  ['honda-cb-shine', 'Honda', 'CB Shine', 'motorbike', 'motorbike', 2.01, 0.74, 1.29, 2],
  ['honda-cbr150r', 'Honda', 'CBR150R', 'motorbike', 'motorbike', 1.98, 0.7, 1.31, 2],
  ['yamaha-fz-s', 'Yamaha', 'FZ-S', 'motorbike', 'motorbike', 1.99, 0.78, 1.33, 2],
  ['yamaha-mt-15', 'Yamaha', 'MT-15', 'motorbike', 'motorbike', 2.02, 0.8, 1.34, 2],
  ['bajaj-pulsar-150', 'Bajaj', 'Pulsar 150', 'motorbike', 'motorbike', 2.06, 0.76, 1.35, 2],
  ['tvs-apache-160', 'TVS', 'Apache RTR 160', 'motorbike', 'motorbike', 2.05, 0.79, 1.3, 2],
  ['hero-splendor', 'Hero', 'Splendor Plus', 'motorbike', 'motorbike', 2.0, 0.72, 1.24, 2],
  // E-bikes and electric scooters
  ['yadea-g5', 'Yadea', 'G5', 'ebike', 'scooter', 1.79, 0.7, 1.29, 2],
  ['niu-nqi', 'NIU', 'NQi', 'ebike', 'scooter', 1.8, 0.69, 1.28, 2],
  ['niu-mqi', 'NIU', 'MQi+', 'ebike', 'ebike', 1.72, 0.67, 1.23, 2],
  ['super-soco-cux', 'Super Soco', 'CUx', 'ebike', 'ebike', 1.78, 0.69, 1.25, 2],
  ['ebike-pedal-assist', 'Generic', 'Pedal-assist e-bike', 'ebike', 'ebike', 1.75, 0.65, 1.12, 1],
  // Bicycles
  ['bicycle-city', 'Generic', 'City bicycle', 'bicycle', 'bicycle', 1.75, 0.6, 1.1, 1],
  ['bicycle-mountain', 'Generic', 'Mountain bike', 'bicycle', 'bicycle', 1.8, 0.7, 1.12, 1],
  ['bicycle-folding', 'Generic', 'Folding bicycle', 'bicycle', 'bicycle', 1.5, 0.58, 1.0, 1],
  ['bicycle-kids', 'Generic', 'Children\'s bicycle', 'bicycle', 'bicycle', 1.3, 0.5, 0.85, 1],
  // Cars: hatchbacks
  ['suzuki-alto-k10', 'Suzuki', 'Alto K10', 'car', 'hatchback', 3.53, 1.49, 2.38, 4],
  ['suzuki-celerio', 'Suzuki', 'Celerio', 'car', 'hatchback', 3.7, 1.6, 2.43, 4],
  ['suzuki-wagon-r', 'Suzuki', 'Wagon R', 'car', 'hatchback', 3.66, 1.62, 2.44, 4],
  ['suzuki-swift', 'Suzuki', 'Swift', 'car', 'hatchback', 3.84, 1.7, 2.45, 4],
  ['hyundai-i10', 'Hyundai', 'i10', 'car', 'hatchback', 3.67, 1.66, 2.39, 4],
  ['hyundai-grand-i10', 'Hyundai', 'Grand i10', 'car', 'hatchback', 3.77, 1.66, 2.43, 4],
  ['kia-picanto', 'Kia', 'Picanto', 'car', 'hatchback', 3.6, 1.6, 2.4, 4],
  ['toyota-vitz', 'Toyota', 'Vitz / Yaris', 'car', 'hatchback', 3.89, 1.7, 2.51, 4],
  ['toyota-aqua', 'Toyota', 'Aqua', 'car', 'hatchback', 4.0, 1.7, 2.55, 4],
  ['honda-fit', 'Honda', 'Fit / Jazz', 'car', 'hatchback', 4.0, 1.7, 2.53, 4],
  ['nissan-march', 'Nissan', 'March / Micra', 'car', 'hatchback', 3.78, 1.67, 2.45, 4],
  ['nissan-note', 'Nissan', 'Note', 'car', 'hatchback', 4.1, 1.7, 2.6, 4],
  // Cars: sedans
  ['toyota-corolla-axio', 'Toyota', 'Corolla Axio', 'car', 'sedan', 4.4, 1.7, 2.6, 4],
  ['toyota-corolla', 'Toyota', 'Corolla', 'car', 'sedan', 4.63, 1.78, 2.7, 4],
  ['toyota-premio', 'Toyota', 'Premio', 'car', 'sedan', 4.6, 1.7, 2.7, 4],
  ['toyota-camry', 'Toyota', 'Camry', 'car', 'sedan', 4.89, 1.84, 2.83, 4],
  ['honda-civic', 'Honda', 'Civic', 'car', 'sedan', 4.63, 1.8, 2.7, 4],
  ['hyundai-accent', 'Hyundai', 'Accent', 'car', 'sedan', 4.37, 1.7, 2.57, 4],
  ['hyundai-elantra', 'Hyundai', 'Elantra', 'car', 'sedan', 4.57, 1.8, 2.7, 4],
  ['kia-cerato', 'Kia', 'Cerato', 'car', 'sedan', 4.64, 1.8, 2.7, 4],
  ['nissan-sunny', 'Nissan', 'Sunny', 'car', 'sedan', 4.46, 1.7, 2.6, 4],
  // Cars: SUVs
  ['suzuki-vitara', 'Suzuki', 'Vitara', 'car', 'suv', 4.18, 1.78, 2.5, 4],
  ['hyundai-creta', 'Hyundai', 'Creta', 'car', 'suv', 4.27, 1.78, 2.59, 4],
  ['hyundai-tucson', 'Hyundai', 'Tucson', 'car', 'suv', 4.48, 1.85, 2.67, 4],
  ['kia-sportage', 'Kia', 'Sportage', 'car', 'suv', 4.48, 1.86, 2.67, 4],
  ['toyota-rav4', 'Toyota', 'RAV4', 'car', 'suv', 4.6, 1.86, 2.69, 4],
  ['honda-cr-v', 'Honda', 'CR-V', 'car', 'suv', 4.59, 1.86, 2.66, 4],
  ['nissan-x-trail', 'Nissan', 'X-Trail', 'car', 'suv', 4.69, 1.82, 2.71, 6],
  ['toyota-fortuner', 'Toyota', 'Fortuner', 'car', 'suv', 4.8, 1.86, 2.75, 6],
  ['toyota-prado', 'Toyota', 'Land Cruiser Prado', 'car', 'suv', 4.84, 1.89, 2.79, 6],
  // Vans and minibuses
  ['suzuki-every', 'Suzuki', 'Every', 'van', 'van', 3.4, 1.48, 2.43, 4],
  ['suzuki-apv', 'Suzuki', 'APV', 'van', 'van', 4.16, 1.66, 2.63, 7],
  ['toyota-noah', 'Toyota', 'Noah', 'van', 'van', 4.7, 1.7, 2.85, 7],
  ['toyota-hiace', 'Toyota', 'Hiace', 'van', 'van', 4.7, 1.7, 2.57, 9],
  ['nissan-nv350', 'Nissan', 'NV350 Caravan', 'van', 'van', 4.7, 1.7, 2.56, 9],
  ['kia-carnival', 'Kia', 'Carnival', 'van', 'van', 5.16, 2.0, 3.09, 7],
  ['hyundai-h1', 'Hyundai', 'H1 / Starex', 'van', 'minibus', 5.15, 1.92, 3.2, 11],
  ['toyota-hiace-commuter', 'Toyota', 'Hiace Commuter', 'van', 'minibus', 5.38, 1.88, 3.11, 14],
  // Pickups
  ['suzuki-carry', 'Suzuki', 'Carry', 'pickup', 'pickup', 3.4, 1.48, 1.91, 2],
  ['tata-ace', 'Tata', 'Ace', 'pickup', 'pickup', 3.8, 1.5, 2.1, 2],
  ['mahindra-bolero-pikup', 'Mahindra', 'Bolero Pik-Up', 'pickup', 'pickup', 5.22, 1.7, 3.15, 2],
  ['toyota-hilux', 'Toyota', 'Hilux', 'pickup', 'pickup', 5.33, 1.86, 3.09, 5],
  ['isuzu-d-max', 'Isuzu', 'D-Max', 'pickup', 'pickup', 5.27, 1.87, 3.13, 5],
  ['mitsubishi-triton', 'Mitsubishi', 'Triton / L200', 'pickup', 'pickup', 5.31, 1.82, 3.0, 5],
  ['nissan-navara', 'Nissan', 'Navara', 'pickup', 'pickup', 5.26, 1.85, 3.15, 5],
  ['ford-ranger', 'Ford', 'Ranger', 'pickup', 'pickup', 5.36, 1.85, 3.22, 5],
  // Small lorries (goods)
  ['isuzu-elf', 'Isuzu', 'Elf (N-series)', 'pickup', 'lorry', 4.69, 1.7, 2.49, 3],
  ['mitsubishi-canter', 'Mitsubishi Fuso', 'Canter', 'pickup', 'lorry', 4.69, 1.7, 2.5, 3],
  ['hino-300', 'Hino', '300 / Dutro', 'pickup', 'lorry', 5.0, 1.9, 2.87, 3],
  // Buses
  ['toyota-coaster', 'Toyota', 'Coaster', 'bus', 'minibus', 6.99, 2.04, 3.94, 26],
  ['bus-city-12m', 'Generic', 'City bus (12 m)', 'bus', 'bus', 12, 2.55, 6, 40],
]

export const VEHICLE_MODELS: VehicleModel[] = ROWS.map(([id, make, model, type, shape, length, width, wheelbase, seats]) => ({ id, make, model, type, shape, length, width, wheelbase, seats }))

const BY_ID = new Map(VEHICLE_MODELS.map((m) => [m.id, m]))

// The type's own size when no model is picked (the map's earlier sizes).
export const DEFAULT_DIMS: Record<ModelType, Dims> = {
  car: { shape: 'hatchback', length: 4.5, width: 1.7, wheelbase: 2.6 },
  van: { shape: 'van', length: 5.2, width: 1.8, wheelbase: 3 },
  pickup: { shape: 'pickup', length: 5.3, width: 1.85, wheelbase: 3 },
  motorbike: { shape: 'motorbike', length: 2, width: 0.75, wheelbase: 1.3 },
  ebike: { shape: 'ebike', length: 1.8, width: 0.7, wheelbase: 1.3 },
  bicycle: { shape: 'bicycle', length: 1.75, width: 0.6, wheelbase: 1.1 },
  bus: { shape: 'bus', length: 12, width: 2.55, wheelbase: 6 },
}

export const modelById = (id: string | null | undefined): VehicleModel | undefined => (id ? BY_ID.get(id) : undefined)
export const isKnownModel = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id)
export const modelsForType = (type: ModelType): VehicleModel[] => VEHICLE_MODELS.filter((m) => m.type === type)
export const modelLabel = (m: Pick<VehicleModel, 'make' | 'model'>) => (m.make === 'Generic' ? m.model : `${m.make} ${m.model}`)

// The size and shape to draw: the model's, when it is a known model of this type; else the type's.
export function dimsFor(type: ModelType, modelId?: string | null): Dims {
  const m = modelById(modelId)
  const d = m && m.type === type ? m : DEFAULT_DIMS[type] ?? DEFAULT_DIMS.car
  return { shape: d.shape, length: d.length, width: d.width, wheelbase: d.wheelbase }
}

// Search by make and model (every word must match; spaces, dashes and case don't matter, so
// "grand i10", "grandi10" and "Hyundai i-10" all find the Grand i10). Optionally one type only.
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
export function searchModels(q: string, type?: ModelType): VehicleModel[] {
  const words = q.split(/\s+/).map(squash).filter(Boolean)
  const list = type ? modelsForType(type) : VEHICLE_MODELS
  if (!words.length) return list
  return list.filter((m) => {
    const hay = squash(`${m.make} ${m.model} ${m.id}`)
    return words.every((w) => hay.includes(w))
  })
}
