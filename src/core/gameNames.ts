// The people of a TaxiQ Game world: bot drivers, bot citizens and the centers with their owners.
// Made once when a world is created (from its seed) and saved in games/{id}/world/roster, so the
// same people are always there. Fictional names (first + second name), English and Dhivehi.

import { hash, rng } from './gameSim'

export interface Name {
  e: string
  d: string
}
export interface Center {
  name: Name
  owner: Name
}
export interface Roster {
  drivers: Name[] // index n-1 drives car n
  citizens: Name[]
  centers: Center[] // car n belongs to center (n-1) % centers.length
}

const MEN: [string, string][] = [
  ['Ahmed', 'އަހުމަދު'],
  ['Ali', 'ޢަލީ'],
  ['Ibrahim', 'އިބްރާހީމް'],
  ['Hassan', 'ހަސަން'],
  ['Hussain', 'ހުސައިން'],
  ['Mohamed', 'މުހައްމަދު'],
  ['Ismail', 'އިސްމާޢީލް'],
  ['Yoosuf', 'ޔޫސުފް'],
  ['Abdulla', 'ޢަބްދުﷲ'],
  ['Moosa', 'މޫސާ'],
  ['Adam', 'އާދަމް'],
  ['Hamid', 'ހާމިދު'],
  ['Naseem', 'ނަސީމް'],
  ['Shareef', 'ޝަރީފް'],
  ['Rasheed', 'ރަޝީދު'],
  ['Zahir', 'ޒާހިރު'],
]
const WOMEN: [string, string][] = [
  ['Aishath', 'އާއިޝަތު'],
  ['Fathimath', 'ފާޠިމަތު'],
  ['Mariyam', 'މަރިޔަމް'],
  ['Hawwa', 'ހައްވާ'],
  ['Aminath', 'އާމިނަތު'],
  ['Khadheeja', 'ޚަދީޖާ'],
  ['Zeenath', 'ޒީނަތު'],
  ['Shiuna', 'ޝިއުނާ'],
]
const CENTERS: Name[] = [
  { e: 'Kulhudhuffushi Taxi', d: 'ކުޅުދުއްފުށި ޓެކްސީ' },
  { e: 'Harbour Taxi', d: 'ބަނދަރު ޓެކްސީ' },
  { e: 'North Star Taxi', d: 'އުތުރު ތަރި ޓެކްސީ' },
  { e: 'Island Ride', d: 'ރަށު ދަތުރު' },
]

// A first name (a man's, or for citizens sometimes a woman's) and a second name (a father's name).
function person(r: () => number, anyone: boolean): Name {
  const list = anyone && r() < 0.5 ? WOMEN : MEN
  const a = list[Math.floor(r() * list.length)]!
  let b = MEN[Math.floor(r() * MEN.length)]!
  if (b[0] === a[0]) b = MEN[(MEN.indexOf(b) + 1) % MEN.length]!
  return { e: `${a[0]} ${b[0]}`, d: `${a[1]} ${b[1]}` }
}

export function makeRoster(seed: string, cars: number, centers: number, citizens = 60): Roster {
  const r = rng(hash(`${seed}:roster`))
  return {
    drivers: Array.from({ length: cars }, () => person(r, false)),
    citizens: Array.from({ length: citizens }, () => person(r, true)),
    centers: CENTERS.slice(0, Math.max(1, Math.min(centers, CENTERS.length))).map((name) => ({ name, owner: person(r, false) })),
  }
}
