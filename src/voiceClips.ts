import { useEffect, useState } from 'react'
import { setVoiceClips, VOICE_KEYS, type VoiceKey, type VoiceLang } from './announce'

// Recorded voice messages (firestore.rules: voiceClips): voiceClips/{key}-{lang} holds a short
// audio clip (base64, at most about 350 KB), recorded or uploaded by an admin. Everyone signed in
// reads them; the app keeps them in memory and plays them (src/announce.ts).

type Fb = typeof import('./firebase')
export const MAX_CLIP_BYTES = 350_000
export const MAX_RECORD_SECONDS = 8

export interface Clip {
  id: string
  data: string
  mime: string
  by: string
  updatedAt: number
}
const ms = (x: unknown) => (x && typeof (x as { toMillis?: () => number }).toMillis === 'function' ? (x as { toMillis: () => number }).toMillis() : 0)
const IDS = new Set(VOICE_KEYS.flatMap((k) => [`${k}-en`, `${k}-dv`]))

// Keep the clips in memory for the whole app (call once).
export function useVoiceClips(fb: Fb | null, enabled: boolean): Clip[] {
  const [list, setList] = useState<Clip[]>([])
  useEffect(() => {
    if (!fb || !enabled) return
    return fb.onSnapshot(
      fb.collection(fb.db, 'voiceClips'),
      (s) => {
        const clips = s.docs.flatMap((d) => {
          const x = d.data()
          return IDS.has(d.id) && typeof x.data === 'string' && typeof x.mime === 'string'
            ? [{ id: d.id, data: x.data, mime: x.mime, by: typeof x.by === 'string' ? x.by : '', updatedAt: ms(x.updatedAt) }]
            : []
        })
        setVoiceClips(clips)
        setList(clips)
      },
      () => setList([]),
    )
  }, [fb, enabled])
  return fb && enabled ? list : []
}

export function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('read_failed'))
    r.readAsDataURL(b)
  })
}

export async function saveClip(fb: Fb, key: VoiceKey, lang: VoiceLang, clip: Blob, email: string) {
  if (clip.size > MAX_CLIP_BYTES) throw new Error('too_big')
  const mime = (clip.type || 'audio/webm').slice(0, 60)
  if (!/^audio\//.test(mime)) throw new Error('not_audio')
  await fb.setDoc(fb.doc(fb.db, 'voiceClips', `${key}-${lang}`), { data: await blobToBase64(clip), mime, by: email, updatedAt: fb.serverTimestamp() })
}
export const deleteClip = (fb: Fb, key: VoiceKey, lang: VoiceLang) => fb.deleteDoc(fb.doc(fb.db, 'voiceClips', `${key}-${lang}`))
