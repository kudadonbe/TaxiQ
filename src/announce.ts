// Voice messages (the driver may be driving, with the phone on the dashboard; the passenger may be
// away from the screen). Each message can have a recorded clip per language, recorded or uploaded
// by an admin in Management -> Voice messages (src/voiceClips.ts). Without one, the phone's own voice
// says the English text (with the passenger's first name or the taxi number), or the Dhivehi text
// where the phone has a Dhivehi voice. The phone also vibrates. Clips come from the database and
// play from memory (blob URLs); speech runs on the phone.

export const VOICE_KEYS = ['tripNew', 'tripBooked', 'offerReceived'] as const
export type VoiceKey = (typeof VOICE_KEYS)[number]
export type VoiceLang = 'en' | 'dv'
export const clipId = (key: VoiceKey, lang: VoiceLang) => `${key}-${lang}`

const clips = new Map<string, string>() // clip id -> blob URL

export function setVoiceClips(list: { id: string; data: string; mime: string }[]) {
  for (const url of clips.values()) URL.revokeObjectURL(url)
  clips.clear()
  for (const c of list) {
    try {
      const bytes = Uint8Array.from(atob(c.data), (ch) => ch.charCodeAt(0))
      clips.set(c.id, URL.createObjectURL(new Blob([bytes], { type: c.mime })))
    } catch {
      // A damaged clip: the phone's voice speaks instead.
    }
  }
}
export const hasClip = (key: VoiceKey, lang: VoiceLang) => clips.has(clipId(key, lang))
export const clipUrl = (key: VoiceKey, lang: VoiceLang) => clips.get(clipId(key, lang))

function speak(text: string, lang: VoiceLang) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text)
  const dv = lang === 'dv' ? window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('dv')) : undefined
  u.lang = dv ? dv.lang : 'en'
  if (dv) u.voice = dv
  u.rate = 0.95
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}
const hasDhivehiVoice = () => 'speechSynthesis' in window && window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith('dv'))

// `texts.en` is always given (the fallback); `texts.dv` is spoken only by a Dhivehi voice.
export function announce(key: VoiceKey, lang: VoiceLang, texts: { en: string; dv: string }) {
  try {
    navigator.vibrate?.([300, 150, 300])
  } catch {
    // no vibration on this device
  }
  const fallback = () => (lang === 'dv' && hasDhivehiVoice() ? speak(texts.dv, 'dv') : speak(texts.en, 'en'))
  const url = clips.get(clipId(key, lang))
  if (!url) return fallback()
  let done = false
  const audio = new Audio(url)
  const once = () => {
    if (done) return
    done = true
    fallback()
  }
  audio.addEventListener('error', once)
  audio.play().catch(once) // not allowed to play yet (no tap on the page)
}
