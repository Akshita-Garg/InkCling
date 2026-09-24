import { LivingInk } from './components/LivingInk'
import { useState, useEffect, useCallback } from 'react'
import { Eraser, Sparkles, Settings } from 'lucide-react'
import { RecordButton } from './components/RecordButton'
import { formatShortcutLabel } from './utils/shortcut'
import { SettingsPanel } from './components/SettingsPanel'
import { Onboarding } from './components/Onboarding'
import { JournalEntries } from './components/JournalEntries'
import { currentNativeAsrModel, preloadNativeAsrModel, syncSelectedNativeAsrModel, transcribe } from './services/asr'
import { TRANSFORM_PRESETS, DEFAULT_TRANSFORM_PRESET } from './utils/composePrompt'
import { warmBuiltinRefinement } from './services/llm'
import { refineTranscriptForMode } from './services/transformPipeline'
import {
  REFINEMENT_MODE_CLEAN,
  REFINEMENT_MODE_TRANSFORM,
  normalizeRefinementMode,
  readRefinementMode,
  readTransformPreset,
  readTransformPrompt,
  migrateSingleRefineSettings,
} from './utils/refinementSettings'

migrateSingleRefineSettings()

const REFINEMENT_MODES = [
  {
    value: REFINEMENT_MODE_CLEAN,
    Icon: Eraser,
    label: 'Clean',
    description: 'Keeps your wording and removes speech artifacts without a language model.',
  },
  {
    value: REFINEMENT_MODE_TRANSFORM,
    Icon: Sparkles,
    label: 'Smart Refine',
    description: TRANSFORM_PRESETS[DEFAULT_TRANSFORM_PRESET].description,
  },
]

function readProvider() {
  const stored = localStorage.getItem('vr_provider') ?? 'builtin'
  return stored === 'browser' || stored === 'ollama' || stored === 'none' ? 'builtin' : stored
}

function readApiKey() {
  return localStorage.getItem('vr_api_key') ?? ''
}

function readOnboardingDone() {
  return !!localStorage.getItem('vr_onboarding_done')
}

function syncRefinementSettings() {
  return window.voicerefine?.setRefinementSettings?.({
    provider: readProvider(),
    apiKey: readApiKey(),
    refinementMode: readRefinementMode(),
    transformPreset: readTransformPreset(),
    transformPrompt: readTransformPrompt(),
  })
}

function warmSelectedRefinementProvider({ refinementMode = readRefinementMode(), provider = readProvider() } = {}) {
  if (provider !== 'builtin' || refinementMode !== REFINEMENT_MODE_TRANSFORM) return
  warmBuiltinRefinement().catch(err => {
    console.warn('[refine] warmup failed', err)
  })
}

function App() {
  const [onboardingDone, setOnboardingDone] = useState(readOnboardingDone)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isShortcutRecording, setIsShortcutRecording] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [notice, setNotice] = useState(null)
  const [retransformingId, setRetransformingId] = useState(null)
  const [provider, setProvider] = useState(readProvider)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [refinementMode, setRefinementMode] = useState(readRefinementMode)
  const [recordingShortcut, setRecordingShortcut] = useState('')
  const [closeOptionsOpen, setCloseOptionsOpen] = useState(false)
  const [history, setHistory] = useState({ totalWords: 0, entries: [] })

  useEffect(() => {
    window.voicerefine?.getDictationHistory?.()
      .then(next => { if (next) setHistory(next) })
      .catch(err => console.warn('[app] could not load dictation history', err))
    const unsubscribe = window.voicerefine?.onDictationHistoryUpdated?.(next => { if (next) setHistory(next) })
    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    let active = true
    let receivedEvent = false
    const unsubscribe = window.voicerefine?.onOverlayRecordingChanged?.(recording => {
      receivedEvent = true
      if (active) setIsShortcutRecording(recording)
    })
    window.voicerefine?.getOverlayRecordingState?.().then(recording => {
      if (active && !receivedEvent) setIsShortcutRecording(recording)
    }).catch(err => console.warn('[app] could not read recording state', err))
    return () => { active = false; unsubscribe?.() }
  }, [])

  const refreshRecordingShortcut = useCallback(() => {
    window.voicerefine?.getRecordingShortcut?.()
      .then(result => {
        if (result?.accelerator) setRecordingShortcut(result.accelerator)
      })
      .catch(err => console.warn('[app] could not load recording shortcut', err))
  }, [])

  useEffect(() => {
    refreshRecordingShortcut()
    // Settings and onboarding change the shortcut through the main process,
    // which broadcasts it; keep the tip in step without a reload.
    const unsubscribe = window.voicerefine?.onRecordingShortcutChanged?.(accelerator => {
      if (accelerator) setRecordingShortcut(accelerator)
    })
    return () => unsubscribe?.()
  }, [refreshRecordingShortcut])

  useEffect(() => {
    const unsubscribe = window.voicerefine?.onShowCloseOptions?.(() => setCloseOptionsOpen(true))
    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    if (!closeOptionsOpen) return
    const onKey = (event) => { if (event.key === 'Escape') setCloseOptionsOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeOptionsOpen])

  useEffect(() => {
    let cancelled = false
    const model = currentNativeAsrModel()
    syncSelectedNativeAsrModel(model)
      .then(() => preloadNativeAsrModel(model))
      .catch(err => {
        if (!cancelled) console.warn('[asr] default model preload failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void syncRefinementSettings()
    const warmupTimer = setTimeout(warmSelectedRefinementProvider, 1500)
    return () => clearTimeout(warmupTimer)
  }, [])

  const saveRefinementState = (nextMode) => {
    localStorage.setItem('vr_refinement_mode', nextMode)
    setRefinementMode(nextMode)
    void syncRefinementSettings()
    warmSelectedRefinementProvider({ refinementMode: nextMode, provider })
  }

  const refineWithCurrentMode = useCallback(async (transcript) => {
    return refineTranscriptForMode({
      transcript,
      refinementMode: readRefinementMode(),
      prompt: readTransformPrompt(),
      preset: readTransformPreset(),
      providerConfig: { provider: readProvider(), apiKey: readApiKey() },
    })
  }, [])

  const showNotice = (text, kind = 'info') => {
    setNotice({ text, kind })
    setTimeout(() => setNotice(n => (n?.text === text ? null : n)), 4000)
  }

  // In-app recording: transcribe, refine with the current mode, add to the journal.
  const handleAudioReady = useCallback(async (blob) => {
    setNotice(null)
    setIsTranscribing(true)
    setBusyLabel('Transcribing…')
    try {
      const rawText = await transcribe(blob)
      if (!rawText?.trim()) {
        showNotice('No speech detected. Nothing was added.')
        return
      }
      setBusyLabel(readRefinementMode() === REFINEMENT_MODE_CLEAN ? 'Cleaning up…' : 'Refining…')
      let refined
      try {
        refined = await refineWithCurrentMode(rawText)
      } catch (err) {
        console.warn('[App] refinement failed; saving the transcript as spoken', err)
        refined = { text: rawText, refinementMode: null, transformPreset: null }
        showNotice(`Couldn't refine this one (${err.message}). Saved it as spoken.`, 'error')
      }
      const next = await window.voicerefine?.recordDictation?.({ rawText, ...refined })
      if (next) setHistory(next)
    } catch (err) {
      console.error('[App] Transcription failed:', err)
      showNotice('Transcription failed. Check the app console for details.', 'error')
    } finally {
      setIsTranscribing(false)
      setBusyLabel('')
    }
  }, [refineWithCurrentMode])

  // Re-run a saved dictation through the mode selected now.
  const handleRetransform = async (entry) => {
    const source = entry.rawText || entry.text
    setRetransformingId(entry.id)
    try {
      const refined = await refineWithCurrentMode(source)
      const next = await window.voicerefine?.updateDictation?.(entry.id, refined)
      if (next) setHistory(next)
    } catch (err) {
      console.error('[App] Re-transform failed:', err)
      showNotice(`Re-transform failed: ${err.message}`, 'error')
    } finally {
      setRetransformingId(null)
    }
  }

  const handleSettingsSaved = ({ warm = true } = {}) => {
    const nextProvider = readProvider()
    const nextMode = readRefinementMode()
    setProvider(nextProvider)
    setRefinementMode(nextMode)
    void syncRefinementSettings()
    refreshRecordingShortcut()
    if (warm) warmSelectedRefinementProvider({ refinementMode: nextMode, provider: nextProvider })
  }

  const handleRefinementModeChange = (value) => {
    saveRefinementState(normalizeRefinementMode(value))
  }

  const shortcutLabel = recordingShortcut ? formatShortcutLabel(recordingShortcut) : '…'

  return (
    <div className="h-screen flex flex-col ic-paper-bg ic-window-bg text-[var(--ic-ink)]">
      {/* Fixed strip: macOS traffic lights (drawn by the OS at the left) and the
          settings button. No title, no divider, so it reads as part of the window. */}
      <header className="ic-titlebar ic-drag shrink-0 flex items-center justify-end pr-4">
        <button onClick={() => setSettingsOpen(true)} className="ic-no-drag ic-settings-btn" aria-label="Settings" title="Settings">
          <Settings size={17} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </header>

      {/* Sidebar + journal. Only the journal sheet scrolls. */}
      <div className="ic-shell flex-1 min-h-0">
        <aside className="ic-sidebar">
          <div className="ic-sidebar-brand">
            <h1 className="ic-app-title ic-app-title-lg">InkCling</h1>
            <p className="ic-hero-tagline ic-sidebar-tagline">Your voice, in ink.</p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="ic-label self-start">Mode</h2>
            <div className="ic-seg" role="radiogroup" aria-label="Mode">
              {REFINEMENT_MODES.map(({ value, Icon, label }) => (
                <button key={value} role="radio" aria-checked={refinementMode === value} data-selected={refinementMode === value} onClick={() => handleRefinementModeChange(value)}>
                  <Icon size={14} strokeWidth={1.75} aria-hidden="true" />{label}
                </button>
              ))}
            </div>
            <div className="ic-option ic-mode-description px-3 py-2" data-selected="true" aria-live="polite">
              {REFINEMENT_MODES.map(({ value, description }) => (
                <span key={value} className="ic-option-desc" data-active={value === refinementMode} aria-hidden={value !== refinementMode}>
                  {description}
                </span>
              ))}
            </div>
            <p className="ic-muted">Applies to your next dictation, in any app.</p>
          </div>
          <div className="ic-sidebar-illustration" aria-hidden="true">
            <LivingInk recording={isRecording || isShortcutRecording} />
          </div>
          <div className="ic-sidebar-footer">
            {/* No card: the stamp is ink pressed onto the sidebar paper. A card
                would also clip the rotated stamp, since .ic-card hides overflow. */}
            <div className="ic-stat-card" title="Words you have spoken into InkCling">
              {/* data-digits lets the stamp shrink its type as the total grows,
                  so a long number never wraps or outgrows the border. */}
              <div className="ic-stamp" data-digits={history.totalWords.toLocaleString().length}>
                <div className="ic-stamp-num">{history.totalWords.toLocaleString()}</div>
                <div className="ic-stamp-label">{history.totalWords === 1 ? 'Word dictated' : 'Words dictated'}</div>
              </div>
              <div className="ic-muted mt-3">since you started</div>
            </div>
          </div>
        </aside>

        <main className="ic-main">
          <div className="ic-main-inner">
            {/* Always shown; the keycap follows the shortcut the user has set. */}
            <div className="ic-tip">
              InkCling works in any app. Press{' '}
              <kbd className="ic-kbd">{shortcutLabel}</kbd>{' '}
              anywhere to dictate into whatever window you're typing in. Every dictation is copied to your clipboard too.
            </div>

            <div className="ic-card ic-recbar-card">
              <RecordButton
                variant="bar"
                onAudioReady={handleAudioReady}
                onRecordingChange={setIsRecording}
                isProcessing={isTranscribing}
                busyLabel={busyLabel}
                idleLabel={`Click to record, or press ${shortcutLabel} anywhere`}
              />
              {notice && <p className={notice.kind === 'error' ? 'ic-error' : 'ic-muted'}>{notice.text}</p>}
            </div>

            <JournalEntries
              entries={history.entries}
              onRetransform={handleRetransform}
              busyId={retransformingId}
              onClear={() => window.voicerefine?.clearDictationHistory?.().then(setHistory)}
            />
          </div>
        </main>
      </div>

      {closeOptionsOpen && (
        <div className="ic-modal-scrim fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setCloseOptionsOpen(false)}>
          <div className="ic-card ic-modal w-[340px] p-5" onClick={e => e.stopPropagation()}>
            <h2 className="ic-h1 text-base mb-1">Close InkCling?</h2>
            <p className="ic-muted mb-4">Choose what happens when you close this window.</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => { setCloseOptionsOpen(false); window.voicerefine?.closeWindow?.() }} className="ic-option">
                <span><span className="ic-option-title">Close window</span><span className="ic-option-desc">Keep InkCling running. Your shortcut still works in every app. Relaunch the app to reopen this window.</span></span>
              </button>
              <button onClick={() => window.voicerefine?.quitApp?.()} className="ic-option ic-option-danger">
                <span><span className="ic-option-title">Quit InkCling</span><span className="ic-option-desc">Stop the app completely. The shortcut won't work until you open it again.</span></span>
              </button>
            </div>
            <button onClick={() => setCloseOptionsOpen(false)} className="ic-btn ic-btn-ghost mt-3 w-full justify-center">Cancel</button>
          </div>
        </div>
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={handleSettingsSaved} />
      {!onboardingDone && (
        <Onboarding onComplete={() => {
          setOnboardingDone(true)
          refreshRecordingShortcut()
          const nextProvider = readProvider()
          const nextMode = readRefinementMode()
          setProvider(nextProvider)
          setRefinementMode(nextMode)
          void syncRefinementSettings()
          warmSelectedRefinementProvider({ refinementMode: nextMode, provider: nextProvider })
        }} />
      )}
    </div>
  )
}

export default App
