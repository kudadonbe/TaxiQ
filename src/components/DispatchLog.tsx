import { ArrowRight, MapPin, Phone } from 'lucide-react'
import { ic, icFlip } from './iconStyles'
import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { loadPlacesAround, metresBetween } from '../places'
import { shareLink } from '../core/shareLink'
import type { Taxi } from '../types'
import type { Dispatch } from '../useQueue'

interface Props {
  history: Dispatch[]
  queue: Taxi[]
  callInProgress: boolean
  onReopen: (id: string) => void
}

// The pickup's text, if it is one of our own place names at that spot (so a link never carries
// whatever else was typed there, such as a passenger's name).
async function knownPlaceName(at: [number, number], text: string): Promise<string | undefined> {
  const name = text.trim()
  if (!name) return undefined
  const list = await loadPlacesAround(at)
  return list.some((p) => (p.e === name || p.d === name) && p.p.some((pt) => metresBetween(pt, at) <= 150)) ? name : undefined
}

// Recent dispatches with their passenger details. Any dispatch can be reopened (e.g. the driver
// broke down before completing the trip) while no other call is being taken.
export function DispatchLog({ history, queue, callInProgress, onReopen }: Props) {
  const { t, driverName, time } = useI18n()
  const [copied, setCopied] = useState<string | null>(null)
  // Each dispatch's pickup name for its link, worked out ahead so Share stays in the tap (phones
  // only open the share sheet straight from a tap).
  const [names, setNames] = useState<Record<string, string | undefined>>({})
  const pickupsKey = JSON.stringify(history.filter((d) => d.call?.pickupAt).map((d) => [d.id, d.call!.pickupAt, d.call!.pickup]))
  useEffect(() => {
    let live = true
    const list = JSON.parse(pickupsKey) as [string, [number, number], string][]
    void Promise.all(list.map(async ([id, at, text]) => [id, await knownPlaceName(at, text).catch(() => undefined)] as const)).then((pairs) => {
      if (live) setNames(Object.fromEntries(pairs))
    })
    return () => {
      live = false
    }
  }, [pickupsKey])

  // Share pickup: a link to our own map (src/core/shareLink.ts) with the position and, at most, our
  // own place name. Never the phone, the passenger or the note.
  const share = async (d: Dispatch) => {
    const at = d.call?.pickupAt
    if (!at) return
    const name = names[d.id]
    const url = shareLink(at, name)
    try {
      if (navigator.share) await navigator.share({ title: name ? `${t.pickup}: ${name}` : t.pickup, url })
      else {
        await navigator.clipboard.writeText(url)
        setCopied(d.id)
        setTimeout(() => setCopied(null), 2000)
      }
    } catch {
      // Share sheet dismissed or clipboard blocked: nothing to do.
    }
  }

  if (!history.length) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">{t.noRides}</p>
  }

  return (
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
      {history.map((d) => {
        const stillRegistered = queue.some((x) => x.id === d.taxi.id)
        return (
          <li key={d.id} className={`space-y-1 px-3 py-2 text-sm ${d.reopened ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                <span className="font-bold tabular-nums">{d.taxi.taxiNo}</span>{' '}
                <span className="text-slate-500">{driverName(d.taxi.driver)}</span>
              </span>
              <time dir="ltr" className="shrink-0 text-slate-400 tabular-nums" dateTime={new Date(d.at).toISOString()}>
                {time.format(d.at)}
              </time>
            </div>
            {d.call && (
              <p className="text-slate-700">
                {d.call.pickup && (
                  <span>
                    <MapPin className={`${ic} text-emerald-600`} aria-hidden="true" /> <bdi>{d.call.pickup}</bdi>
                  </span>
                )}
                {d.call.destination && (
                  <span>
                    {' '}
                    <ArrowRight className={`${icFlip} text-slate-400`} aria-hidden="true" /> <bdi>{d.call.destination}</bdi>
                  </span>
                )}
                {d.call.phone && (
                  <bdi className="block tabular-nums text-slate-500" dir="ltr">
                    <Phone className={ic} aria-hidden="true" /> {d.call.phone}
                  </bdi>
                )}
                {d.call.note && (
                  <bdi className="block text-xs text-slate-500">{d.call.note}</bdi>
                )}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {d.reopened ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{t.reopened}</span>
              ) : (
                stillRegistered && (
                  <button
                    type="button"
                    onClick={() => onReopen(d.id)}
                    disabled={callInProgress}
                    title={callInProgress ? t.callBusy : undefined}
                    className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {t.reopen}
                  </button>
                )
              )}
              {d.call?.pickupAt && !d.reopened && (
                <button
                  type="button"
                  onClick={() => void share(d)}
                  className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {copied === d.id ? t.linkCopied : t.sharePickup}
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
