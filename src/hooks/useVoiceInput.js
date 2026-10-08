import { useRef, useState } from 'react'
import { SPEECH_TO_TEXT_FUNCTION_URL, VOICE_DIGIT_FIELDS } from '../constants'
import { wordsToDigits } from '../utils'

// Releasing the mic almost immediately produces a near-empty clip that's not
// worth sending — checked client-side to give a clear, immediate message
// instead of a wasted round trip.
const MIN_RECORDING_MS = 1000

// If the mic is left open with no one stopping it (forgot, or nothing to
// say), stop it automatically instead of recording indefinitely. This is a
// safety cap, not the normal stop condition — TRAILING_SILENCE_MS below
// already stops right after the speaker pauses, so this only kicks in for
// long continuous speech (e.g. a full Remarks sentence).
const AUTO_STOP_MS = 20 * 1000

// Root-mean-square level (0-1 scale) above which the mic input counts as
// real speech rather than silence/background noise.
const SOUND_RMS_THRESHOLD = 0.02
const SOUND_CHECK_INTERVAL_MS = 150

// Once real speech has started, a pause this long means they're done talking
// — stop right then instead of waiting out the rest of AUTO_STOP_MS.
const TRAILING_SILENCE_MS = 500

// Guesses a filename extension from the recorder's mimeType so the backend
// can tell the audio container apart.
function extensionForMimeType(mimeType) {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('wav')) return 'wav'
  return 'webm'
}

// Short beeps so "recording started" / "recording stopped" are audible, not
// just text labels — generated with WebAudio so no audio asset is needed.
// The stop tone is lower-pitched than the start tone so the two are
// distinguishable by ear.
function playTone(frequency) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.frequency.value = frequency
    gain.gain.value = 0.15
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.12)
    oscillator.onended = () => ctx.close()
  } catch {
    // Audio feedback is a nice-to-have — never block recording over it.
  }
}

const playStartBeep = () => playTone(880)
const playStopBeep = () => playTone(440)

// Records a short clip via MediaRecorder and sends it to the speech_to_text
// function for server-side transcription (Sarvam AI), instead of the browser's
// native SpeechRecognition — that API is unreliable across devices (confirmed
// on this project: hangs on iOS Safari, and on at least one Android browser it
// fails fast and double-fires into a fallback, causing a double-beep and a
// stuck "Listening…" state). MediaRecorder + getUserMedia is the one path
// that has tested cleanly everywhere.
export function useVoiceInput(onResult) {
  const [isSupported] = useState(
    () => Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== 'undefined'
  )
  const [activeField, setActiveField] = useState(null)
  const [lastField, setLastField] = useState(null)
  const [error, setError] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const recordingStartRef = useRef(0)
  // getUserMedia is async — a very quick tap can call stop() before the
  // recorder even exists yet. Without this flag that release is silently
  // lost, and the mic keeps recording forever with no visible feedback.
  const pendingStopRef = useRef(false)
  const autoStopTimerRef = useRef(null)
  // Real-time mic level monitoring — lets a truly silent recording be
  // rejected instantly, without a slow, pointless round trip to AssemblyAI.
  const soundDetectedRef = useRef(false)
  const soundAnalysisRef = useRef(null)

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const startSoundDetection = (stream, recorder) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      audioCtx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      let lastSoundAt = 0

      const checkInterval = setInterval(() => {
        analyser.getByteTimeDomainData(data)
        let sumSquares = 0
        for (let i = 0; i < data.length; i++) {
          const normalized = (data[i] - 128) / 128
          sumSquares += normalized * normalized
        }

        if (Math.sqrt(sumSquares / data.length) > SOUND_RMS_THRESHOLD) {
          soundDetectedRef.current = true
          lastSoundAt = Date.now()
          return
        }

        if (soundDetectedRef.current && Date.now() - lastSoundAt >= TRAILING_SILENCE_MS) {
          if (recorder.state !== 'inactive') recorder.stop()
        }
      }, SOUND_CHECK_INTERVAL_MS)

      soundAnalysisRef.current = { audioCtx, checkInterval }
    } catch {
      // If level monitoring can't start, fall back to always trusting the
      // recording — never block voice input over this being unavailable.
      soundDetectedRef.current = true
    }
  }

  const stopSoundDetection = () => {
    if (soundAnalysisRef.current) {
      clearInterval(soundAnalysisRef.current.checkInterval)
      soundAnalysisRef.current.audioCtx.close().catch(() => {})
      soundAnalysisRef.current = null
    }
  }

  const transcribe = async (blob) => {
    const formData = new FormData()
    formData.append('audio', blob, `input.${extensionForMimeType(blob.type)}`)

    const response = await fetch(SPEECH_TO_TEXT_FUNCTION_URL, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) throw new Error('Transcription failed')
    const { text } = await response.json()
    return (text || '').trim()
  }

  const start = async (field) => {
    if (!isSupported || activeField) return

    setError('')
    chunksRef.current = []
    pendingStopRef.current = false
    soundDetectedRef.current = false
    setActiveField(field)
    setLastField(field)

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setActiveField(null)
      setError('Microphone permission denied — enable it in browser settings.')
      return
    }

    streamRef.current = stream
    const recorder = new MediaRecorder(stream)
    mediaRecorderRef.current = recorder
    startSoundDetection(stream, recorder)

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }

    recorder.onstop = async () => {
      clearTimeout(autoStopTimerRef.current)
      stopSoundDetection()
      releaseStream()
      setActiveField(null)
      playStopBeep()

      const recordedMs = Date.now() - recordingStartRef.current
      if (recordedMs < MIN_RECORDING_MS || !soundDetectedRef.current) {
        setError("Didn't catch that — try again.")
        return
      }

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      if (blob.size === 0) {
        setError("Didn't catch that — try again.")
        return
      }

      setIsTranscribing(true)
      try {
        const transcript = await transcribe(blob)
        const isDigitField = VOICE_DIGIT_FIELDS.has(field)
        const value = isDigitField ? wordsToDigits(transcript) : transcript

        if (!value) {
          setError(
            isDigitField ? "Couldn't hear the numbers clearly — try again." : "Didn't catch that — try again."
          )
          return
        }

        onResult(field, value)
      } catch {
        setError('Voice input failed. Try again.')
      } finally {
        setIsTranscribing(false)
      }
    }

    recordingStartRef.current = Date.now()
    recorder.start()
    playStartBeep()

    // The release happened while we were still waiting on getUserMedia —
    // honor it now instead of leaving the mic recording indefinitely.
    if (pendingStopRef.current) {
      recorder.stop()
    } else {
      autoStopTimerRef.current = setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop()
      }, AUTO_STOP_MS)
    }
  }

  const stop = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
    } else {
      pendingStopRef.current = true
    }
  }

  return { isSupported, activeField, lastField, error, isTranscribing, start, stop }
}
