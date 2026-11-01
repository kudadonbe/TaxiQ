import type { Taxi } from '../types'

// Seed data carried over from v1 (db.json). taxiNo is the center number the taxi center gives each taxi.
// Phone numbers are masked placeholders.
const seed: [string, string, string, string, string][] = [
  ['34', 'T5110', 'Ali Hussain', 'ޢަލީ ހުސައިން', '989X250'],
  ['2', 'T5111', 'Fathmath Naail', 'ފާތިމަތު ނާއިލް', '989X251'],
  ['17', 'T5112', 'Ahmed Shifan', 'އަޙްމަދު ޝިފާން', '989X252'],
  ['8', 'T5113', 'Aishath Shifa', 'އައިޝަތު ޝިފާ', '989X253'],
  ['41', 'T5114', 'Mohamed Shareef', 'މުޙައްމަދު ޝަރީފް', '989X254'],
  ['23', 'T5115', 'Fathimath Shaana', 'ފާތިމަތު ޝާނާ', '989X255'],
  ['5', 'T5116', 'Ibrahim Waheed', 'އިބްރާހީމް ވަޙީދު', '989X256'],
  ['29', 'T5117', 'Aishath Naaila', 'އައިޝަތު ނާއިލާ', '989X257'],
  ['12', 'T5118', 'Mohamed Ameen', 'މުޙައްމަދު އަމީން', '989X258'],
  ['36', 'T5119', 'Fathimath Nashwa', 'ފާތިމަތު ނަޝްވާ', '989X259'],
]

export const initialTaxis: Taxi[] = seed.map(([taxiNo, taxiReg, name, nameDv, phone], i) => ({
  id: String(i + 1),
  taxiNo,
  taxiReg,
  driver: { id: String(i + 1), name, nameDv, phone },
}))
