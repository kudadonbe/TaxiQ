// Our house tiles (src/data/houses/<area>/, src/core/houseTiles.ts), loaded once and shared: the 3D
// houses layer (./layer.ts) draws them and the map's tap on a house (MapView, src/core/houseHit.ts)
// tests them. No three.js here, so the tap check never pulls in the 3D chunk.

import { decodeHouseTile, type House, type HouseTileDoc } from '../core/houseTiles'

const FILES = import.meta.glob<HouseTileDoc>('../data/houses/*/*.json', { import: 'default' })
const BY_NAME = new Map<string, () => Promise<HouseTileDoc>>()
for (const [path, load] of Object.entries(FILES)) BY_NAME.set(path.slice(path.lastIndexOf('/') + 1, -5), load)

const loaded = new Map<string, House[]>()
const loading = new Map<string, Promise<House[]>>()

export const hasHouseTile = (name: string) => BY_NAME.has(name)

// The houses of a tile (an empty list when it has none or fails to load).
export function loadHouseTile(name: string): Promise<House[]> {
  const done = loaded.get(name)
  if (done) return Promise.resolve(done)
  let p = loading.get(name)
  if (!p) {
    const get = BY_NAME.get(name)
    p = (get ? get().then((doc) => decodeHouseTile(doc, name)) : Promise.resolve([] as House[]))
      .catch(() => [] as House[])
      .then((houses) => {
        loaded.set(name, houses)
        loading.delete(name)
        return houses
      })
    loading.set(name, p)
  }
  return p
}
