import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { transcribe } from './services/asr'
import { refineTranscriptForMode } from './services/transformPipeline'
import { normalizeRefinementMode } from './utils/refinementSettings'
import { DEFAULT_TRANSFORM_PRESET, defaultPromptForPreset } from './utils/composePrompt'
import { DEFAULT_RECORDING_SHORTCUT } from './utils/shortcut'
import './index.css'

function formatShortcutLabel(accelerator) {
  return accelerator
    .replace(/Command/g, 'Cmd')
    .replace(/Control/g, 'Ctrl')
    .replace(/Alt/g, 'Option')
    .replace(/\+/g, '+')
}

const DEFAULT_HOTKEY_LABEL = formatShortcutLabel(DEFAULT_RECORDING_SHORTCUT)

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

async function readOverlayRefinementSettings() {
  const settings = await window.voicerefine?.getRefinementSettings?.()
  return {
    provider: settings?.provider ?? 'builtin',
    apiKey: settings?.apiKey ?? '',
    refinementMode: normalizeRefinementMode(settings?.refinementMode),
    transformPreset: DEFAULT_TRANSFORM_PRESET,
    transformPrompt: settings?.transformPrompt?.trim() || defaultPromptForPreset(DEFAULT_TRANSFORM_PRESET),
  }
}

async function refineForPaste(transcript) {
  // Nothing was said: skip refinement entirely so a model can't invent text.
  if (!transcript?.trim()) {
    return { refinementMode: null, transformPreset: null, text: '', refined: false }
  }
  const settings = await readOverlayRefinementSettings()
  const result = await refineTranscriptForMode({
    prompt: settings.transformPrompt,
    transcript,
    refinementMode: settings.refinementMode,
    preset: settings.transformPreset,
    providerConfig: settings,
  })
  return { ...result, refined: !!result.text?.trim() }
}

function Overlay() {
  const [status, setStatus] = useState('idle')
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [hotkeyLabel, setHotkeyLabel] = useState(DEFAULT_HOTKEY_LABEL)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(null)
  const timerRef = useRef(null)
  // Monotonic id for the current recording session. Bumped on each start and on
  // cancel so an in-flight transcription can detect it was superseded/cancelled.
  const sessionRef = useRef(0)
  const startingRef = useRef(false)

  const cleanupRecorder = () => {
    clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    recorderRef.current = null
  }

  const startRecording = async () => {
    if (recorderRef.current?.state === 'recording' || startingRef.current) return
    startingRef.current = true
    const session = ++sessionRef.current

    setStatus('starting')
    setElapsed(0)
    setTranscript('')
    chunksRef.current = []

    try {
      if (window.voicerefine?.requestMicrophoneAccess && !await window.voicerefine.requestMicrophoneAccess()) {
        throw new DOMException('Microphone access denied', 'NotAllowedError')
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Cancelled or superseded while waiting for mic permission, release the
      // stream we just acquired rather than leaking a live mic track.
      if (sessionRef.current !== session) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      streamRef.current = stream

      const options = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : {}
      const recorder = new MediaRecorder(stream, options)
      recorderRef.current = recorder

      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0
        cleanupRecorder()
        setStatus('transcribing')
        setElapsed(0)
        window.voicerefine.overlayRecordingStopped({
          bytes: blob.size,
          mimeType: blob.type,
          durationMs,
        })

        try {
          const startedAt = Date.now()
          const text = await transcribe(blob)
          let output = text
          let refinement = { refined: false, refinementMode: null, transformPreset: null }

          try {
            setStatus('refining')
            refinement = await refineForPaste(text)
            output = refinement.text
          } catch (err) {
            console.warn('[overlay] refinement failed, pasting transcript', err)
          }

          // Cancelled (Esc) or a new recording started while we were busy, drop
          // this result so we don't paste stale text or clobber the new session.
          if (sessionRef.current !== session) return

          setTranscript(output)
          setStatus('complete')
          window.voicerefine.overlayTranscriptionComplete({
            text: output,
            rawText: text,
            chars: output.length,
            rawChars: text.length,
            refined: refinement.refined,
            refinementMode: refinement.refinementMode,
            transformPreset: refinement.transformPreset,
            durationMs: Date.now() - startedAt,
          })
        } catch (err) {
          if (sessionRef.current !== session) return
          setStatus('error')
          window.voicerefine.overlayRecordingFailed(err?.message ?? 'Transcription failed')
        }
      }

      startedAtRef.current = Date.now()
      recorder.start()
      setStatus('recording')
      window.voicerefine.overlayRecordingStarted()
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
      }, 250)
    } catch (err) {
      if (sessionRef.current === session) {
        cleanupRecorder()
        setStatus('error')
        window.voicerefine.overlayRecordingFailed(err?.message ?? 'Microphone unavailable')
      }
    } finally {
      startingRef.current = false
    }
  }

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      setStatus('stopping')
      recorderRef.current.stop()
    }
  }

  const cancelRecording = () => {
    sessionRef.current++ // invalidate any in-flight session (recording or transcribing)
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.onstop = null
      recorderRef.current.stop()
    }
    cleanupRecorder()
    setStatus('idle')
    setElapsed(0)
    setTranscript('')
  }

  useEffect(() => {
    window.voicerefine?.getRecordingShortcut?.().then(result => {
      if (result?.accelerator) setHotkeyLabel(formatShortcutLabel(result.accelerator))
    }).catch(err => {
      console.warn('[overlay] Could not read recording shortcut', err)
    })
    const unsubscribeShortcut = window.voicerefine.onRecordingShortcutChanged?.(accelerator => {
      if (accelerator) setHotkeyLabel(formatShortcutLabel(accelerator))
    })

    const unsubscribe = window.voicerefine.onOverlayCommand(command => {
      if (command === 'start-recording') void startRecording()
      if (command === 'stop-recording') stopRecording()
      if (command === 'cancel-recording') cancelRecording()
      if (command === 'paste-failed') setStatus('paste-error')
    })

    window.voicerefine.overlayReady()
    return () => {
      unsubscribe()
      unsubscribeShortcut?.()
      cancelRecording()
    }
  }, [])

  const isRecording = status === 'recording'
  const isBusy = status === 'starting' || status === 'stopping' || status === 'transcribing' || status === 'refining'
  const isComplete = status === 'complete'
  const isClipboardFallback = status === 'paste-error'
  const title =
    status === 'error' ? 'Something went wrong'
      : isClipboardFallback ? 'Copied to clipboard'
      : status === 'transcribing' ? 'Transcribing...'
        : status === 'refining' ? 'Refining...'
        : isBusy ? 'Preparing...'
          : isComplete ? (transcript ? 'Inserted' : 'No speech detected')
            : 'Recording...'
  const subtitle =
    status === 'transcribing' ? 'Converting your recording locally'
      : status === 'refining' ? 'Preparing your final text'
      : isClipboardFallback ? 'Press Cmd+V to paste.'
      : isComplete ? (transcript || 'Nothing was pasted')
        : `Press ${hotkeyLabel} again to stop recording`
  const pillState =
    status === 'recording' ? 'recording'
      : status === 'error' ? 'error'
        : (isComplete || isClipboardFallback) ? 'complete'
          : 'busy'

  return (
    // Pinned to the bottom of the (taller, shadow-sized) overlay window so the
    // bubble sits where it did before the redesign: see OVERLAY_* in main.js.
    <div className="min-h-screen bg-transparent flex items-end justify-center pb-11">
      <div className="ic-overlay-pill" data-state={pillState}>
        <span className="ic-overlay-wash" aria-hidden="true" />
        <span className="ic-overlay-pen" aria-hidden="true" />
        <div className="min-w-0">
          <div className="ic-overlay-title">{title}</div>
          <div className="ic-overlay-sub">{subtitle}</div>
        </div>
        {isRecording && <div className="ic-overlay-time">{formatTime(elapsed)}</div>}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
)
