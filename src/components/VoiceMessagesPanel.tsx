import { Mic, Play, Square, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { announce, clipUrl, VOICE_KEYS, type VoiceKey, type VoiceLang } from '../announce'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { deleteClip, MAX_CLIP_BYTES, MAX_RECORD_SECONDS, saveClip, useVoiceClips } from '../voiceClips'

// Management -> Voice messages (admins and devs): for each voice message, record or upload a clip
// in English and in Dhivehi. A clip plays instead of the phone's own voice.
export function VoiceMessagesPanel() {
  const { fb, email } = useAuth()
  const { t } = useI18n()
  const clips = useVoiceClips(fb, true)
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState<string | null>(null) // clip id being recorded
  const [seconds, setSeconds] = useState(0)
  const [draft, setDraft] = useState<{ id: string; key: VoiceKey; lang: VoiceLang; blob: Blob; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const rec = useRef<MediaRecorder | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current)
      rec.current?.stream.getTracks().forEach((x) => x.stop())
    },
    [],
  )

  const texts: Record<VoiceKey, { en: string; dv: string; who: string }> = {
    tripNew: { en: t.voiceTrip(''), dv: t.voiceTripDv(''), who: t.voiceForDriver },
    tripBooked: { en: t.voiceBookedEn, dv: t.voiceBookedDv, who: t.voiceForDriver },
    offerReceived: { en: t.voiceOfferEn, dv: t.voiceOfferDv, who: t.voiceForPassenger },
  }

  const keep = (key: VoiceKey, lang: VoiceLang, blob: Blob) => {
    if (blob.size > MAX_CLIP_BYTES) return setError(t.voiceTooBig)
    if (draft) URL.revokeObjectURL(draft.url)
    setDraft({ id: `${key}-${lang}`, key, lang, blob, url: URL.createObjectURL(blob) })
  }

  const start = async (key: VoiceKey, lang: VoiceLang) => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return setError(t.voiceMicOff)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = new MediaRecorder(stream)
      const parts: Blob[] = []
      r.ondataavailable = (e) => e.data.size && parts.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach((x) => x.stop())
        if (timer.current) clearInterval(timer.current)
        setRecording(null)
        keep(key, lang, new Blob(parts, { type: r.mimeType || 'audio/webm' }))
      }
      rec.current = r
      r.start()
      setRecording(`${key}-${lang}`)
      setSeconds(0)
      const began = Date.now()
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - began) / 1000)
        setSeconds(s)
        if (s >= MAX_RECORD_SECONDS && r.state === 'recording') r.stop()
      }, 250)
    } catch {
      setError(t.voiceMicOff)
    }
  }
  const stop = () => rec.current?.state === 'recording' && rec.current.stop()

  const save = () => {
    if (!fb || !draft || busy) return
    setBusy(true)
    setError(null)
    saveClip(fb, draft.key, draft.lang, draft.blob, email ?? '')
      .then(() => {
        URL.revokeObjectURL(draft.url)
        setDraft(null)
      })
      .catch((e: { code?: string; message?: string }) => setError(e.message === 'too_big' ? t.voiceTooBig : t.saveError(e.code ?? e.message ?? 'error')))
      .finally(() => setBusy(false))
  }

  const btn = 'inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold disabled:opacity-40'
  return (
    <section className="space-y-3">
      <p className="text-sm text-slate-600">{t.voiceIntro}</p>
      {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}
      {VOICE_KEYS.map((key) => (
        <div key={key} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{texts[key].who}</p>
          {(['en', 'dv'] as const).map((lang) => {
            const id = `${key}-${lang}`
            const saved = clips.find((c) => c.id === id)
            const isDraft = draft?.id === id
            return (
              <div key={lang} className="space-y-2 border-t border-slate-100 pt-2 first:border-0 first:pt-0">
                <p className="text-sm">
                  <span className="me-2 rounded bg-slate-100 px-1.5 text-xs font-bold">{lang === 'en' ? 'English' : 'ދިވެހި'}</span>
                  <bdi dir={lang === 'dv' ? 'rtl' : 'ltr'}>{texts[key][lang]}</bdi>
                </p>
                <p className="text-xs text-slate-500">{saved ? t.voiceSaved(saved.by) : t.voiceNone}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={btn} onClick={() => announce(key, lang, { en: texts[key].en, dv: texts[key].dv })} disabled={!!recording}>
                    <Play className="size-4" aria-hidden="true" /> {t.voicePlay}
                  </button>
                  {recording === id ? (
                    <button type="button" className={`${btn} border-rose-400 bg-rose-50 text-rose-800`} onClick={stop}>
                      <Square className="size-4" aria-hidden="true" /> {t.voiceStop} <span className="tabular-nums">{MAX_RECORD_SECONDS - seconds}s</span>
                    </button>
                  ) : (
                    <button type="button" className={btn} onClick={() => void start(key, lang)} disabled={!!recording || busy}>
                      <Mic className="size-4" aria-hidden="true" /> {t.voiceRecord}
                    </button>
                  )}
                  <label className={`${btn} cursor-pointer`}>
                    <Upload className="size-4" aria-hidden="true" /> {t.voiceUpload}
                    <input
                      type="file"
                      accept="audio/*"
                      className="sr-only"
                      disabled={!!recording || busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (!f) return
                        if (!f.type.startsWith('audio/')) return setError(t.voiceNotAudio)
                        keep(key, lang, f)
                      }}
                    />
                  </label>
                  {saved && !isDraft && (
                    <button type="button" className={`${btn} text-rose-700`} disabled={busy} onClick={() => fb && void deleteClip(fb, key, lang).catch((e: { code?: string }) => setError(t.saveError(e.code ?? 'error')))}>
                      <Trash2 className="size-4" aria-hidden="true" /> {t.voiceDelete}
                    </button>
                  )}
                </div>
                {isDraft && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 p-2">
                    <audio src={draft.url} controls className="h-10 max-w-full" />
                    <button type="button" className="min-h-10 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-40" disabled={busy} onClick={save}>
                      {t.voiceSave}
                    </button>
                    <button
                      type="button"
                      className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate-600"
                      onClick={() => {
                        URL.revokeObjectURL(draft.url)
                        setDraft(null)
                      }}
                    >
                      {t.cancel}
                    </button>
                  </div>
                )}
                {saved && !isDraft && clipUrl(key, lang) && <audio src={clipUrl(key, lang)} controls className="h-10 max-w-full" />}
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}
