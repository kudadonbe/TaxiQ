import { useEffect, useState, type FormEvent } from 'react'
import { useAuth, type Role } from '../auth'
import { useI18n } from '../i18n'

const emailRule = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,}$/

// Admin only (live mode): who may use TaxiQ. Each entry is roles/{email} in Firestore; the
// security rules check it on every read and write.
export function StaffPanel() {
  const { fb, email: me } = useAuth()
  const { t } = useI18n()
  const [staff, setStaff] = useState<{ email: string; role: Role }[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('operator')
  const [armed, setArmed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const valid = emailRule.test(email.trim().toLowerCase())

  useEffect(() => {
    if (!fb) return
    return fb.onSnapshot(
      fb.collection(fb.db, 'roles'),
      (snap) =>
        setStaff(
          snap.docs
            .map((d) => ({ email: d.id, role: (d.data().role === 'admin' ? 'admin' : 'operator') as Role }))
            .sort((a, b) => a.email.localeCompare(b.email)),
        ),
      (e) => setError(e.code),
    )
  }, [fb])

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!fb || !valid) return
    setError(null)
    fb.setDoc(fb.doc(fb.db, 'roles', email.trim().toLowerCase()), { role, addedBy: me ?? '', addedAt: Date.now() })
      .then(() => setEmail(''))
      .catch((err: { code?: string }) => setError(err.code ?? 'error'))
  }

  const remove = (who: string) => {
    if (!fb) return
    fb.deleteDoc(fb.doc(fb.db, 'roles', who)).catch((err: { code?: string }) => setError(err.code ?? 'error'))
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 font-bold">{t.staff}</h2>
      <p className="mb-3 text-xs text-slate-500">{t.staffNote}</p>
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
        <input
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.staffEmail}
          aria-label={t.staffEmail}
          maxLength={254}
          autoComplete="off"
          className="min-h-10 rounded-lg border border-slate-300 px-3 text-base"
        />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="min-h-10 rounded-lg border border-slate-300 px-2 text-base" aria-label={t.role}>
          <option value="operator">{t.roles.operator}</option>
          <option value="admin">{t.roles.admin}</option>
        </select>
        <button type="submit" disabled={!valid} className="min-h-10 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">
          {t.addStaff}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-rose-700">{t.saveError(error)}</p>}
      <ul className="mt-3 divide-y divide-slate-100">
        {staff.map((s) => (
          <li key={s.email} className="flex items-center gap-2 py-2 text-sm">
            <bdi dir="ltr" className="min-w-0 flex-1 truncate">
              {s.email}
            </bdi>
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${s.role === 'admin' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {t.roles[s.role]}
            </span>
            {s.email !== me && (
              <button
                type="button"
                onClick={() => (armed === s.email ? (remove(s.email), setArmed(null)) : setArmed(s.email))}
                onBlur={() => armed === s.email && setArmed(null)}
                className={`min-h-9 rounded-lg px-3 text-xs font-medium ${armed === s.email ? 'bg-rose-600 text-white' : 'text-rose-700 hover:bg-rose-50'}`}
              >
                {armed === s.email ? t.confirmRemove : t.remove}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
