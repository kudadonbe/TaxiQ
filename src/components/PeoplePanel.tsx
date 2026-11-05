import { useEffect, useMemo, useState } from 'react'
import { useAuth, type Role } from '../auth'
import { useI18n } from '../i18n'
import type { Taxi } from '../types'

// Admin (and dev): everyone who has signed in, with their role, and a way to change it.
// "Citizen" means signed in with no role (they can only hire). Roles live in roles/{email};
// profiles in users/{uid} are written by each person on sign-in. The rules check every change.

type RoleOrCitizen = Role | 'citizen'
const FILTERS: (RoleOrCitizen | 'all' | 'online')[] = ['all', 'online', 'citizen', 'driver', 'operator', 'admin', 'dev']
// Seen within this long counts as online now (the app sends a heartbeat every minute).
const ONLINE_MS = 150_000
const emailRule = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/

interface Person {
  email: string
  name: string
  lastSeen: number | null // null: given a role but hasn't signed in yet
  role: RoleOrCitizen
  taxiId?: string
}

const ms = (x: unknown) => (x && typeof (x as { toMillis?: () => number }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : null)

export function PeoplePanel({ taxis }: { taxis: Taxi[] }) {
  const { fb, email: me, role: myRole } = useAuth()
  const { lang, t } = useI18n()
  const [profiles, setProfiles] = useState<{ email: string; name: string; lastSeen: number | null }[]>([])
  const [roles, setRoles] = useState<Map<string, { role: Role; taxiId?: string }>>(new Map())
  const [filter, setFilter] = useState<RoleOrCitizen | 'all' | 'online'>('all')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const isOnline = (p: Person) => p.lastSeen !== null && now - p.lastSeen < ONLINE_MS
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<{ email: string; role: RoleOrCitizen; taxiId: string } | null>(null)
  const [adding, setAdding] = useState({ email: '', role: 'operator' as Role, taxiId: '' })
  const [error, setError] = useState<string | null>(null)
  const isDev = myRole === 'dev'

  useEffect(() => {
    if (!fb) return
    const stops = [
      fb.onSnapshot(
        fb.collection(fb.db, 'users'),
        (snap) =>
          setProfiles(
            snap.docs.map((d) => ({
              email: String(d.data().email ?? '').toLowerCase(),
              name: String(d.data().name ?? ''),
              lastSeen: ms(d.data().lastSeen),
            })),
          ),
        (e) => setError(e.code),
      ),
      fb.onSnapshot(
        fb.collection(fb.db, 'roles'),
        (snap) => {
          const m = new Map<string, { role: Role; taxiId?: string }>()
          for (const d of snap.docs) {
            const r = d.data().role
            if (r === 'admin' || r === 'operator' || r === 'driver' || r === 'dev')
              m.set(d.id, { role: r, taxiId: typeof d.data().taxiId === 'string' ? d.data().taxiId : undefined })
          }
          setRoles(m)
        },
        (e) => setError(e.code),
      ),
    ]
    return () => stops.forEach((s) => s())
  }, [fb])

  // Everyone: signed-in profiles, plus role entries for people who haven't signed in yet.
  const people = useMemo<Person[]>(() => {
    const byEmail = new Map<string, Person>()
    for (const p of profiles) if (p.email) byEmail.set(p.email, { ...p, role: roles.get(p.email)?.role ?? 'citizen', taxiId: roles.get(p.email)?.taxiId })
    for (const [email, r] of roles) if (!byEmail.has(email)) byEmail.set(email, { email, name: '', lastSeen: null, role: r.role, taxiId: r.taxiId })
    return [...byEmail.values()].sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0) || a.email.localeCompare(b.email))
  }, [profiles, roles])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: people.length, online: 0 }
    const on: Record<string, number> = { all: 0 }
    for (const p of people) {
      c[p.role] = (c[p.role] ?? 0) + 1
      if (p.lastSeen !== null && now - p.lastSeen < ONLINE_MS) {
        c.online!++
        on.all!++
        on[p.role] = (on[p.role] ?? 0) + 1
      }
    }
    return { total: c, online: on }
  }, [people, now])

  const q = search.trim().toLowerCase()
  // Online people first, then most recently seen.
  const shown = people
    .filter((p) => (filter === 'all' || (filter === 'online' ? isOnline(p) : p.role === filter)) && (!q || p.email.includes(q) || p.name.toLowerCase().includes(q)))
    .sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)))
  const taxiNo = (id?: string) => taxis.find((x) => x.id === id)?.taxiNo ?? '?'
  const time = new Intl.DateTimeFormat(lang === 'dv' ? 'dv-MV' : undefined, { dateStyle: 'medium', timeStyle: 'short' })

  // Give a role (or none = citizen). Driver needs a taxi.
  const save = (email: string, role: RoleOrCitizen, taxiId: string) => {
    if (!fb) return
    setError(null)
    const ref = fb.doc(fb.db, 'roles', email)
    const p =
      role === 'citizen'
        ? fb.deleteDoc(ref)
        : fb.setDoc(ref, { role, ...(role === 'driver' || role === 'dev' ? (taxiId ? { taxiId } : {}) : {}), addedBy: me ?? '', addedAt: fb.serverTimestamp() })
    p.then(() => setEditing(null)).catch((e: { code?: string }) => setError(e.code ?? 'error'))
  }

  const roleOptions = (current: RoleOrCitizen): RoleOrCitizen[] => ['citizen', 'operator', 'driver', 'admin', ...(isDev || current === 'dev' ? (['dev'] as const) : [])]
  const roleLabel = (r: RoleOrCitizen) => (r === 'citizen' ? t.citizen : t.roles[r])
  const badge: Record<RoleOrCitizen, string> = {
    citizen: 'bg-slate-100 text-slate-700',
    operator: 'bg-sky-100 text-sky-800',
    driver: 'bg-yellow-300 text-slate-900',
    admin: 'bg-slate-900 text-white',
    dev: 'bg-violet-600 text-white',
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="font-bold">{t.people}</h2>
        <p className="text-xs text-slate-500">{t.peopleNote}</p>
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`min-h-9 rounded-full px-3 text-sm font-semibold ${filter === f ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {f === 'all' ? t.filterAll : f === 'online' ? `🟢 ${t.onlineNow}` : roleLabel(f)} <span className="tabular-nums opacity-70">{counts.total[f] ?? 0}</span>
            {f !== 'online' && (counts.online[f] ?? 0) > 0 && <span className="ms-1 text-xs tabular-nums">· 🟢 {counts.online[f]}</span>}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t.searchPeople}
        aria-label={t.searchPeople}
        maxLength={80}
        className="min-h-10 w-full rounded-lg border border-slate-300 px-3 text-base"
      />
      {error && <p className="text-sm font-semibold text-rose-700">{t.saveError(error)}</p>}

      <ul className="divide-y divide-slate-100">
        {shown.map((p) => {
          const self = p.email === me
          const canEdit = !self && (p.role !== 'dev' || isDev)
          const ed = editing?.email === p.email ? editing : null
          return (
            <li key={p.email} className="space-y-2 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate font-semibold">
                    {isOnline(p) && <span className="size-2.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-200" title={t.onlineNow} aria-label={t.onlineNow} />}
                    {p.name || '—'}
                  </span>
                  <bdi dir="ltr" className="block truncate text-xs text-slate-500">
                    {p.email}
                  </bdi>
                </span>
                <span className={`text-xs ${isOnline(p) ? 'font-semibold text-emerald-700' : 'text-slate-400'}`}>
                  {isOnline(p) ? t.onlineNow : p.lastSeen ? `${t.lastSeen}: ${time.format(p.lastSeen)}` : t.notSignedIn}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badge[p.role]}`}>
                  {roleLabel(p.role)}
                  {p.role === 'driver' && ` · ${taxiNo(p.taxiId)}`}
                </span>
                {self && <span className="text-xs text-slate-400">({t.you})</span>}
                {canEdit && !ed && (
                  <button
                    type="button"
                    onClick={() => setEditing({ email: p.email, role: p.role, taxiId: p.taxiId ?? '' })}
                    className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-medium hover:bg-slate-50"
                  >
                    {t.changeRole}
                  </button>
                )}
              </div>
              {ed && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
                  <select value={ed.role} onChange={(e) => setEditing({ ...ed, role: e.target.value as RoleOrCitizen })} aria-label={t.role} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-base">
                    {roleOptions(p.role).map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                  {ed.role === 'driver' && (
                    <select value={ed.taxiId} onChange={(e) => setEditing({ ...ed, taxiId: e.target.value })} aria-label={t.taxiForDriver} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-base">
                      <option value="">{t.taxiForDriver}</option>
                      {[...taxis]
                        .sort((a, b) => Number(a.taxiNo) - Number(b.taxiNo))
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.taxiNo}
                          </option>
                        ))}
                    </select>
                  )}
                  <button
                    type="button"
                    disabled={ed.role === 'driver' && !ed.taxiId}
                    onClick={() => save(p.email, ed.role, ed.taxiId)}
                    className="min-h-10 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
                  >
                    {t.saveRole}
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="min-h-10 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100">
                    {t.cancel}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Give a role to someone before they first sign in. */}
      <form
        className="grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_9rem_7rem_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          const email = adding.email.trim().toLowerCase()
          if (!emailRule.test(email) || (adding.role === 'driver' && !adding.taxiId)) return
          save(email, adding.role, adding.taxiId)
          setAdding({ ...adding, email: '' })
        }}
      >
        <input
          type="email"
          dir="ltr"
          value={adding.email}
          onChange={(e) => setAdding({ ...adding, email: e.target.value })}
          placeholder={t.staffEmail}
          aria-label={t.staffEmail}
          maxLength={254}
          autoComplete="off"
          className="min-h-10 rounded-lg border border-slate-300 px-3 text-base"
        />
        <select value={adding.role} onChange={(e) => setAdding({ ...adding, role: e.target.value as Role })} aria-label={t.role} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-base">
          {roleOptions('citizen')
            .filter((r): r is Role => r !== 'citizen')
            .map((r) => (
              <option key={r} value={r}>
                {t.roles[r]}
              </option>
            ))}
        </select>
        <select
          value={adding.taxiId}
          onChange={(e) => setAdding({ ...adding, taxiId: e.target.value })}
          disabled={adding.role !== 'driver'}
          aria-label={t.taxiForDriver}
          className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-base disabled:opacity-40"
        >
          <option value="">{t.taxiForDriver}</option>
          {[...taxis]
            .sort((a, b) => Number(a.taxiNo) - Number(b.taxiNo))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.taxiNo}
              </option>
            ))}
        </select>
        <button type="submit" className="min-h-10 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-400">
          {t.addStaff}
        </button>
      </form>
    </section>
  )
}
