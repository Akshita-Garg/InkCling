import { useState, useRef, useCallback, useEffect } from 'react'

const MAX_SECONDS = 180

export function useAudioRecorder() {
  const [state, setState] = useState('idle') // 'idle' | 'recording'
  const [countdown, setCountdown] = useState(MAX_SECONDS)
  const [audioBlob, setAudioBlob] = useState(null)
  const [error, setError] = useState(null) // null | 'permission_denied' | 'unavailable'

  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const timerRef = useRef(null)

  const clearTimer = useCallback(() => {
    clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const stop = useCallback(() => {
    clearTimer()
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [clearTimer])

  const start = useCallback(async () => {
    setError(null)
    setAudioBlob(null)
    chunksRef.current = []

    try {
      if (window.voicerefine?.requestMicrophoneAccess && !await window.voicerefine.requestMicrophoneAccess()) {
        throw new DOMException('Microphone access denied', 'NotAllowedError')
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const options = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : {}
      const recorder = new MediaRecorder(stream, options)
      recorderRef.current = recorder

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      // onstop fires after stop() drains the final chunk, this is where the
      // usable audio blob is assembled from all collected chunks.
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorderRef.current.mimeType })
        setAudioBlob(blob)
        setCountdown(MAX_SECONDS)
        setState('idle')
      }

      recorder.start()
      // Reset countdown in the same synchronous block as setState('recording') so
      // they batch into one render, prevents a stale timer value flashing on screen.
      setCountdown(MAX_SECONDS)
      setState('recording')

      let secondsLeft = MAX_SECONDS
      timerRef.current = setInterval(() => {
        secondsLeft -= 1
        setCountdown(secondsLeft)
        if (secondsLeft <= 0) stop()
      }, 1000)
    } catch (err) {
      const isPermission =
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
      setError(isPermission ? 'permission_denied' : 'unavailable')
    }
  }, [stop])

  const toggle = useCallback(() => {
    if (state === 'recording') stop()
    else if (state === 'idle') start()
  }, [state, start, stop])

  // Stop recording and release mic/interval if the component unmounts mid-recording.
  useEffect(() => () => stop(), [stop])

  return { state, countdown, audioBlob, error, toggle }
}
