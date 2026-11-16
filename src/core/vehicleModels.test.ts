import { describe, expect, it } from 'vitest'
import { DEFAULT_DIMS, dimsFor, isKnownModel, MODEL_ID_RE, modelById, modelLabel, modelsForType, searchModels, SHAPES_FOR_TYPE, VEHICLE_MODELS, VEHICLE_SHAPES, type ModelType } from './vehicleModels'

describe('vehicle models', () => {
  it('every model is valid', () => {
    for (const m of VEHICLE_MODELS) {
      expect(m.id, m.id).toMatch(MODEL_ID_RE)
      expect(m.length, m.id).toBeGreaterThan(0)
      expect(m.width, m.id).toBeGreaterThan(0)
      expect(m.wheelbase, m.id).toBeGreaterThan(0)
      expect(m.wheelbase, m.id).toBeLessThan(m.length)
      expect(m.width, m.id).toBeLessThan(m.length)
      expect(Number.isInteger(m.seats) && m.seats >= 1, m.id).toBe(true)
      expect(VEHICLE_SHAPES, m.id).toContain(m.shape)
      expect(SHAPES_FOR_TYPE[m.type], m.id).toContain(m.shape)
      expect(m.make.length > 0 && m.model.length > 0, m.id).toBe(true)
    }
  })
  it('ids are unique, and the list has the common ones', () => {
    expect(new Set(VEHICLE_MODELS.map((m) => m.id)).size).toBe(VEHICLE_MODELS.length)
    for (const id of ['honda-dio', 'yamaha-ray-zr', 'tvs-ntorq', 'suzuki-swift', 'hyundai-grand-i10', 'toyota-hiace', 'toyota-hilux', 'isuzu-d-max', 'suzuki-carry', 'hyundai-h1']) expect(isKnownModel(id), id).toBe(true)
    expect(isKnownModel('nope')).toBe(false)
    expect(isKnownModel(3)).toBe(false)
  })
  it('every type with private hire has models', () => {
    for (const t of ['car', 'van', 'pickup', 'motorbike', 'ebike', 'bicycle'] as ModelType[]) expect(modelsForType(t).length, t).toBeGreaterThan(2)
    expect(modelsForType('bicycle').every((m) => m.type === 'bicycle')).toBe(true)
  })
  it('falls back to the type defaults', () => {
    expect(dimsFor('car')).toEqual({ shape: 'hatchback', length: 4.5, width: 1.7, wheelbase: 2.6 })
    expect(dimsFor('van').length).toBe(5.2)
    expect(dimsFor('pickup').length).toBe(5.3)
    expect(dimsFor('motorbike').length).toBe(2)
    expect(dimsFor('ebike').length).toBe(1.8)
    expect(dimsFor('bicycle')).toEqual({ shape: 'bicycle', length: 1.75, width: 0.6, wheelbase: 1.1 })
    expect(dimsFor('bus').length).toBe(12)
    expect(dimsFor('car', 'unknown-model')).toEqual(DEFAULT_DIMS.car)
    expect(dimsFor('car', null)).toEqual(DEFAULT_DIMS.car)
    // A model of another type is ignored (the type wins).
    expect(dimsFor('car', 'honda-dio')).toEqual(DEFAULT_DIMS.car)
  })
  it('uses the model when it fits the type', () => {
    expect(dimsFor('pickup', 'toyota-hilux')).toEqual({ shape: 'pickup', length: 5.33, width: 1.86, wheelbase: 3.09 })
    expect(dimsFor('motorbike', 'honda-dio').shape).toBe('scooter')
    expect(dimsFor('pickup', 'isuzu-elf').shape).toBe('lorry')
    expect(modelById('kia-picanto')?.make).toBe('Kia')
  })
  it('searches make and model, ignoring case, spaces and dashes', () => {
    expect(searchModels('grand i10').map((m) => m.id)).toEqual(['hyundai-grand-i10'])
    expect(searchModels('GRANDI10').map((m) => m.id)).toEqual(['hyundai-grand-i10'])
    expect(searchModels('i-10').map((m) => m.id)).toEqual(['hyundai-i10', 'hyundai-grand-i10'])
    expect(searchModels('dio').map((m) => m.id)).toEqual(['honda-dio'])
    expect(searchModels('toyota hiace').map((m) => m.id)).toEqual(['toyota-hiace', 'toyota-hiace-commuter'])
    expect(searchModels('honda', 'car').every((m) => m.make === 'Honda' && m.type === 'car')).toBe(true)
    expect(searchModels('', 'van')).toEqual(modelsForType('van'))
    expect(searchModels('zzz')).toEqual([])
  })
  it('labels models', () => {
    expect(modelLabel(modelById('honda-dio')!)).toBe('Honda Dio 110')
    expect(modelLabel(modelById('bicycle-city')!)).toBe('City bicycle')
  })
})
