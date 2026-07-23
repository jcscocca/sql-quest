// Text-to-speech via the browser's Web Speech API — the app's in-browser
// "engine". No network, no accounts: the same spirit as running a real SQL
// engine client-side, but for hearing the target language spoken aloud.

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

let warmed = false

/** Some browsers populate voices asynchronously; nudge them to load. */
function ensureVoices(): void {
  if (warmed || !speechSupported()) return
  warmed = true
  // Touching getVoices() and listening for the event primes the voice list.
  window.speechSynthesis.getVoices()
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    window.speechSynthesis.getVoices()
  })
}

function pickVoice(locale: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const lang = locale.slice(0, 2).toLowerCase()
  return (
    voices.find(v => v.lang.toLowerCase() === locale.toLowerCase()) ??
    voices.find(v => v.lang.toLowerCase().startsWith(lang))
  )
}

/** Speak `text` in `locale` (default Spanish). No-op where unsupported. */
export function speak(text: string, locale = 'es-ES'): void {
  if (!speechSupported() || !text) return
  ensureVoices()
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = locale
  u.rate = 0.9
  const v = pickVoice(locale)
  if (v) u.voice = v
  window.speechSynthesis.speak(u)
}
