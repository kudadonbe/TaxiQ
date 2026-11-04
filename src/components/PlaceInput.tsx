import { useState } from 'react'
import { useI18n } from '../i18n'
import { loadPlaces, searchPlaces, type Place } from '../places'

interface Props {
  id: string
  label: string
  hint: string
  value: string
  error?: boolean
  // `at` is set when a place was picked from the list, cleared when the text is typed by hand.
  onChange: (text: string, at?: [number, number]) => void
}

const typeIcon = { h: '🏠', r: '🛣️', l: '📍', p: '▫️' } as const

// Text field with Kulhudhuffushi house/road/landmark suggestions. Free text is still allowed.
export function PlaceInput({ id, label, hint, value, error, onChange }: Props) {
  const { lang, t } = useI18n()
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [open, setOpen] = useState(false)
  const results = open && places ? searchPlaces(places, value, 6) : []
  const name = (p: Place) => (lang === 'dv' && p.d ? p.d : p.e)

  return (
    <div className="relative">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onFocus={() => {
          setOpen(true)
          void loadPlaces().then(setPlaces)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        maxLength={120}
        autoComplete="off"
        aria-invalid={error}
        aria-describedby={`${id}-hint`}
        className={`mt-1 block min-h-11 w-full rounded-lg border px-3 text-base ${
          error ? 'border-rose-500' : 'border-slate-300'
        } focus:outline-2 focus:outline-emerald-500`}
      />
      <span id={`${id}-hint`} className={`text-xs ${error ? 'text-rose-600' : 'text-slate-500'}`}>
        {error ? t.notValid : hint}
      </span>
      {results.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {results.map((p, i) => (
            <li key={`${p.e}-${i}`}>
              <button
                type="button"
                // mousedown fires before the input's blur, so the pick isn't lost.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const label = p.pl && p.t !== 'p' ? `${name(p)} (${t.plot} ${p.pl})` : name(p)
                  onChange(label, p.p[0])
                  setOpen(false)
                }}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-start hover:bg-slate-50"
              >
                <span aria-hidden>{typeIcon[p.t]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{name(p)}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {t.placeTypes[p.t]}
                    {p.pl && p.t !== 'p' ? ` · ${t.plot} ${p.pl}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
