import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function RecordButton({ onAudioReady, isProcessing, onRecordingChange, disabled, variant, idleLabel, busyLabel, beforeStart }) {
  const { state, countdown, audioBlob, error, toggle } = useAudioRecorder()
  const lastProcessedBlob = useRef(null)
  const [modelError, setModelError] = useState('')

  // Fire onAudioReady once per recording. The blob stays set between recordings
  // and onAudioReady's identity changes on every parent render, so without this
  // guard the effect re-fires and re-transcribes the same audio in a loop.
  useEffect(() => {
    if (audioBlob && audioBlob !== lastProcessedBlob.current) {
      lastProcessedBlob.current = audioBlob
      onAudioReady?.(audioBlob)
    }
  }, [audioBlob, onAudioReady])

  useEffect(() => {
    onRecordingChange?.(state === 'recording')
  }, [state, onRecordingChange])

  const handleToggle = async () => {
    setModelError('')
    try {
      if (state !== 'recording' && beforeStart && !await beforeStart()) return
      toggle()
    } catch (err) { setModelError(err.message || 'Could not prepare your models.') }
  }

  const isRecording = state === 'recording'
  const isBlocked   = disabled || isProcessing

  const errorText = modelError || (error === 'permission_denied'
    ? 'Microphone access denied. Allow microphone access in System Settings and try again.'
    : error === 'unavailable'
      ? 'Could not access your microphone. Make sure it is connected and try again.'
      : null)

  // Compact row used at the top of the journal: button on the left, status beside it.
  if (variant === 'bar') {
    return (
      <div className="ic-recbar">
        <button
          onClick={handleToggle}
          disabled={isBlocked}
          className="ic-record ic-record-sm"
          data-recording={isRecording}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording && <span className="ic-record-ping" aria-hidden="true" />}
          <span className={`relative ${isProcessing ? 'ic-spin' : ''}`}>
            {isRecording
              ? <Square size={20} strokeWidth={1.75} fill="currentColor" />
              : <Mic size={22} strokeWidth={1.75} />}
          </span>
        </button>
        <div className="min-w-0">
          <p className="ic-recbar-label tabular-nums">
            {isProcessing
              ? (busyLabel || 'Transcribing…')
              : isRecording
                ? `Recording · ${formatTime(countdown)} / 03:00. Click to stop.`
                : idleLabel}
          </p>
          {errorText && <p className="ic-error">{errorText}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="ic-record-wrap gap-3">
      <button
        onClick={handleToggle}
        disabled={isBlocked}
        className="ic-record"
        data-recording={isRecording}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      >
        {isRecording && <span className="ic-record-ping" aria-hidden="true" />}
        <span className={`relative ${isProcessing ? 'ic-spin' : ''}`}>
          {isRecording
            ? <Square size={28} strokeWidth={1.75} fill="currentColor" />
            : <Mic size={28} strokeWidth={1.75} />
          }
        </span>
      </button>

      <div className="ic-muted h-5 tabular-nums">
        {isProcessing
          ? 'Transcribing...'
          : isRecording
            ? `${formatTime(countdown)} / 03:00`
            : 'Click to record'}
      </div>

      {error === 'permission_denied' && (
        <p className="ic-error text-center max-w-xs">
          Microphone access denied. Allow microphone access in system settings and reload.
        </p>
      )}
      {error === 'unavailable' && (
        <p className="ic-error text-center max-w-xs">
          Could not access your microphone. Make sure it is connected and try again.
        </p>
      )}
    </div>
  )
}
