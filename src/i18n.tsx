import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Driver } from './types'

export type Lang = 'en' | 'dv'

const STORAGE_KEY = 'taxiq.lang'

const strings = {
  en: {
    inQueue: (n: number) => `${n} in queue`,
    undo: 'Undo',
    assign: 'Assign',
    assignRowLabel: (no: string, name: string) => `Assign ride to taxi ${no}, ${name}`,
    answeredCount: (n: number) => `${n} answered`,
    nextInLine: 'Highest in queue:',
    reassign: 'Reassign',
    reassignRowLabel: (no: string, name: string) => `Reassign ride to taxi ${no}, ${name}`,
    assignedBadge: 'Assigned',
    assignedTo: 'Assigned to',
    reassignHint: 'No response? Reassign to another driver below.',
    done: 'Done',
    clear: 'Clear',
    hint: 'Call the ride on the radio, then tap each driver who answers.',
    queue: 'Queue',
    recent: 'Recent dispatches',
    noRides: 'No rides assigned yet.',
    reset: 'Reset queue',
    rowLabel: (no: string, name: string, pos: number, answered: boolean) =>
      `Taxi ${no}, ${name}, position ${pos}${answered ? ', answered' : ''}`,
    admin: 'Admin',
    nav: 'Sections',
    map: 'Map',
    mapIdle: 'Waiting',
    mapAnswered: 'Answered call',
    mapAssigned: 'Assigned',
    mapPlaceholder: 'Demo: taxi positions are simulated. Live GPS will come from the driver app.',
    searchPlaces: 'Search house, road or place',
    noPlace: 'No matching name. Check the spelling.',
    nearestTaxis: 'Nearest taxis',
    plot: 'Plot',
    placeTypes: { h: 'House', r: 'Road', l: 'Landmark', p: 'Plot' },
    registerTitle: 'Register a taxi',
    fields: {
      taxiNo: 'Center number',
      taxiReg: 'Registration',
      name: 'Driver name (English)',
      nameDv: 'Driver name (Dhivehi)',
      phone: 'Phone',
    },
    hints: {
      taxiNo: 'e.g. 34',
      taxiReg: 'e.g. T5110',
      name: 'Letters only',
      nameDv: 'Thaana only',
      phone: '7 digits',
    },
    errors: {
      required: 'Required',
      format: 'Not valid',
      taken: 'Already registered',
    },
    register: 'Register',
    registered: (no: string) => `Taxi ${no} added to the back of the queue.`,
    registeredTitle: (n: number) => `Registered taxis (${n})`,
    remove: 'Remove',
    confirmRemove: 'Tap again to remove',
    adminNote: 'Changes are saved in this browser only. There is no server yet.',
    switchTo: 'ދިވެހި',
  },
  dv: {
    inQueue: (n: number) => `ކިއުގައި ${n}`,
    undo: 'އަނބުރާލާ',
    assign: 'ހަވާލުކުރޭ',
    assignRowLabel: (no: string, name: string) => `ޓެކްސީ ${no}، ${name} އަށް ދަތުރު ހަވާލުކުރޭ`,
    answeredCount: (n: number) => `${n} ޑްރައިވަރުން ޖަވާބުދިނެވެ`,
    nextInLine: 'ކިއުގައި އެންމެ ކުރީގައި:',
    reassign: 'ބަދަލުކުރޭ',
    reassignRowLabel: (no: string, name: string) => `ދަތުރު ޓެކްސީ ${no}، ${name} އަށް ބަދަލުކުރޭ`,
    assignedBadge: 'ހަވާލުކުރީ',
    assignedTo: 'ހަވާލުކުރީ',
    reassignHint: 'ޖަވާބެއް ނުލިބިއްޖެނަމަ، ތިރީގައިވާ އެހެން ޑްރައިވަރަކަށް ބަދަލުކުރޭ.',
    done: 'ނިމުނީ',
    clear: 'ސާފުކުރޭ',
    hint: 'ރޭޑިއޯއިން ދަތުރު ގޮވާ، ދެން ޖަވާބުދޭ ކޮންމެ ޑްރައިވަރެއްގެ ނަމަށް ފިއްތާ.',
    queue: 'ކިއު',
    recent: 'ފަހުގެ ދަތުރުތައް',
    noRides: 'އަދި އެއްވެސް ދަތުރެއް ހަވާލުކޮށްފައެއް ނުވޭ.',
    reset: 'ކިއު ރީސެޓްކުރޭ',
    rowLabel: (no: string, name: string, pos: number, answered: boolean) =>
      `ޓެކްސީ ${no}، ${name}، ކިއުގެ ${pos} ވަނަ${answered ? '، ޖަވާބުދިން' : ''}`,
    admin: 'އެޑްމިން',
    nav: 'ބައިތައް',
    map: 'މެޕް',
    mapIdle: 'މަޑުކުރަނީ',
    mapAnswered: 'ޖަވާބުދިން',
    mapAssigned: 'ހަވާލުކުރީ',
    mapPlaceholder: 'ޑެމޯ: ޓެކްސީތަކުގެ ތަން ދައްކަނީ ސިމިއުލޭޓްކޮށް. ޑްރައިވަރ އެޕުން ލައިވް ޖީޕީއެސް ލިބޭނެ.',
    searchPlaces: 'ގެ، މަގު ނުވަތަ ތަނެއް ހޯދާ',
    noPlace: 'މި ނަމެއް ނުފެނުނު. އިމްލާ ޗެކްކޮށްލާ.',
    nearestTaxis: 'އެންމެ ކައިރި ޓެކްސީ',
    plot: 'ބިން',
    placeTypes: { h: 'ގެ', r: 'މަގު', l: 'ތަން', p: 'ބިން' },
    registerTitle: 'ޓެކްސީއެއް ރަޖިސްޓަރީކުރޭ',
    fields: {
      taxiNo: 'ސެންޓަރ ނަންބަރު',
      taxiReg: 'ރަޖިސްޓްރޭޝަން',
      name: 'ޑްރައިވަރުގެ ނަން (އިނގިރޭސިން)',
      nameDv: 'ޑްރައިވަރުގެ ނަން (ދިވެހިން)',
      phone: 'ފޯނު',
    },
    hints: {
      taxiNo: 'މިސާލު: 34',
      taxiReg: 'މިސާލު: T5110',
      name: 'އިނގިރޭސި އަކުރު',
      nameDv: 'ތާނަ އަކުރު',
      phone: '7 ޑިޖިޓް',
    },
    errors: {
      required: 'ލިޔުން ލާޒިމް',
      format: 'ރަނގަޅެއް ނޫން',
      taken: 'ކުރިން ރަޖިސްޓަރީކޮށްފައި',
    },
    register: 'ރަޖިސްޓަރީކުރޭ',
    registered: (no: string) => `ޓެކްސީ ${no} ކިއުގެ ފަހަތަށް އެޅީ.`,
    registeredTitle: (n: number) => `ރަޖިސްޓަރީކޮށްފައިވާ ޓެކްސީ (${n})`,
    remove: 'ނައްތާލާ',
    confirmRemove: 'ނައްތާލަން އަނެއްކާ ފިއްތާ',
    adminNote: 'ބަދަލުތައް ރައްކާވަނީ މި ބްރައުޒަރުގައި އެކަނި. އަދި ސާވަރެއް ނެތް.',
    switchTo: 'English',
  },
} satisfies Record<Lang, Record<string, unknown>>

export type Strings = (typeof strings)['en']

function loadLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dv' ? 'dv' : 'en'
  } catch {
    return 'en'
  }
}

interface I18n {
  lang: Lang
  t: Strings
  toggleLang: () => void
  driverName: (d: Driver) => string
  time: Intl.DateTimeFormat
}

const Ctx = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(loadLang)

  useEffect(() => {
    // Dhivehi (Thaana) is written right to left.
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'dv' ? 'rtl' : 'ltr'
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // Storage unavailable; the choice just won't persist.
    }
  }, [lang])

  const value: I18n = {
    lang,
    t: strings[lang],
    toggleLang: () => setLang(lang === 'en' ? 'dv' : 'en'),
    driverName: (d) => (lang === 'dv' ? d.nameDv : d.name),
    time: new Intl.DateTimeFormat(lang === 'dv' ? 'dv-MV' : undefined, { hour: '2-digit', minute: '2-digit' }),
  }
  return <Ctx value={value}>{children}</Ctx>
}

// oxlint-disable-next-line react/only-export-components
export function useI18n(): I18n {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
