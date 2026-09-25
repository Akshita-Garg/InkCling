import { ModelManager } from './ModelManager'
import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { validateKey } from '../services/llm'
import { TRANSFORM_PRESETS, defaultPromptForPreset } from '../utils/composePrompt'
import {
  TRANSFORM_PROMPT_MODE_CUSTOM,
  TRANSFORM_PROMPT_MODE_PRESET,
  promptStorageKeyForPreset,
  readStoredPromptDraftForPreset,
  readTransformPromptMode,
} from '../utils/refinementSettings'
import { formatShortcutLabel, isModifierOnlyEvent, isReservedAccelerator, shortcutFromEvent } from '../utils/shortcut'

const PROVIDER_OPTIONS = [
  { value: 'builtin', label: 'Built-in (Recommended)', needsKey: false, description: 'Smart Refine runs locally on your device using a downloaded model. Offline after setup.' },
  { value: 'gemini',  label: 'Cloud (Gemini)',         needsKey: true,  description: 'Free API key from Google AI Studio.' },
  { value: 'openai',  label: 'Cloud (OpenAI)',         needsKey: true,  description: 'Requires an OpenAI API key.' },
]

export function SettingsPanel({ open, onClose, onSaved }) {
  const [provider, setProvider] = useState('builtin')
  const [apiKey, setApiKey] = useState('')
  const [recordingShortcut, setRecordingShortcut] = useState('')
  const [defaultRecordingShortcut, setDefaultRecordingShortcut] = useState('')
  const [isCapturingShortcut, setIsCapturingShortcut] = useState(false)
  const [shortcutStatus, setShortcutStatus] = useState('idle')
  const [shortcutError, setShortcutError] = useState('')
  const [transformPromptMode, setTransformPromptMode] = useState(TRANSFORM_PROMPT_MODE_PRESET)
  const [transformPromptEditorOpen, setTransformPromptEditorOpen] = useState(false)
  const [structurePrompt, setStructurePrompt] = useState('')
  const [keyStatus, setKeyStatus] = useState('idle')
  const [keyError, setKeyError] = useState('')
  const shortcutButtonRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const stored = localStorage.getItem('vr_provider') ?? 'builtin'
    setProvider(stored === 'browser' || stored === 'ollama' || stored === 'none' ? 'builtin' : stored)
    setApiKey(localStorage.getItem('vr_api_key') ?? '')
    window.voicerefine?.getRecordingShortcut?.().then(result => {
      setRecordingShortcut(result?.accelerator ?? '')
      setDefaultRecordingShortcut(result?.defaultAccelerator ?? '')
    }).catch(err => {
      console.warn('[settings] Could not load recording shortcut', err)
    })
    const storedTransformPromptMode = readTransformPromptMode()
    setTransformPromptMode(storedTransformPromptMode)
    setTransformPromptEditorOpen(storedTransformPromptMode === TRANSFORM_PROMPT_MODE_CUSTOM)
    setStructurePrompt(storedTransformPromptMode === TRANSFORM_PROMPT_MODE_CUSTOM
      ? readStoredPromptDraftForPreset('structure')
      : defaultPromptForPreset('structure'))
    setKeyStatus('idle')
    setKeyError('')
    setShortcutStatus('idle')
    setShortcutError('')
    setIsCapturingShortcut(false)
  }, [open])

  useEffect(() => {
    if (isCapturingShortcut) shortcutButtonRef.current?.focus()
  }, [isCapturingShortcut])

  // Some system combos (e.g. Control+Space) are swallowed by macOS before the field
  // ever receives a keydown, so capture would just sit there silently. If
  // nothing lands within a few seconds, surface a hint instead of dead air.
  useEffect(() => {
    if (!isCapturingShortcut) return
    const timer = setTimeout(() => {
      setIsCapturingShortcut(false)
      setShortcutStatus('error')
      setShortcutError("Didn't catch a shortcut. If a key seems to do nothing, it's likely reserved by macOS (like Ctrl+Space). Try adding Shift or a different key.")
    }, 5000)
    return () => clearTimeout(timer)
  }, [isCapturingShortcut])

  const needsKey = PROVIDER_OPTIONS.find(p => p.value === provider)?.needsKey ?? false
  const providerNeedsKey = (value) => PROVIDER_OPTIONS.find(p => p.value === value)?.needsKey ?? false

  const handleProviderChange = (val) => {
    setProvider(val)
    setKeyStatus('idle')
    setKeyError('')
    localStorage.setItem('vr_provider', val)
    if (!providerNeedsKey(val)) {
      setApiKey('')
      localStorage.removeItem('vr_api_key')
    }
    onSaved?.()
  }

  const handleApiKeyChange = (value) => {
    setApiKey(value)
    setKeyStatus('idle')
    setKeyError('')
    if (value.trim()) {
      localStorage.setItem('vr_api_key', value)
    } else {
      localStorage.removeItem('vr_api_key')
    }
    onSaved?.({ warm: false })
  }

  const handleValidate = async () => {
    setKeyStatus('validating')
    setKeyError('')
    try {
      await validateKey({ provider, apiKey })
      setKeyStatus('valid')
    } catch (err) {
      if (err.message === 'rate_limited') {
        setKeyStatus('rate_limited')
      } else {
        setKeyStatus('invalid')
        setKeyError(err.message)
      }
    }
  }

  const handleTransformPromptChange = (preset, value) => {
    setTransformPromptMode(TRANSFORM_PROMPT_MODE_CUSTOM)
    setStructurePrompt(value)
    localStorage.setItem('vr_transform_prompt_mode', TRANSFORM_PROMPT_MODE_CUSTOM)
    localStorage.setItem(promptStorageKeyForPreset(preset), value.trim() || defaultPromptForPreset(preset))
    onSaved?.({ warm: false })
  }

  const handleResetTransformPrompt = (preset) => {
    setTransformPromptMode(TRANSFORM_PROMPT_MODE_CUSTOM)
    const defaultPrompt = defaultPromptForPreset(preset)
    setStructurePrompt(defaultPrompt)
    localStorage.setItem('vr_transform_prompt_mode', TRANSFORM_PROMPT_MODE_CUSTOM)
    localStorage.setItem(promptStorageKeyForPreset(preset), defaultPrompt)
    onSaved?.({ warm: false })
  }

  const handleUseBuiltInTransformPrompts = () => {
    setTransformPromptMode(TRANSFORM_PROMPT_MODE_PRESET)
    setStructurePrompt(defaultPromptForPreset('structure'))
    localStorage.setItem('vr_transform_prompt_mode', TRANSFORM_PROMPT_MODE_PRESET)
    localStorage.removeItem(promptStorageKeyForPreset('structure'))
    localStorage.removeItem('vr_transform_prompt')
    onSaved?.({ warm: false })
  }

  const handleShortcutKeyDown = (event) => {
    if (!isCapturingShortcut) return
    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
      setIsCapturingShortcut(false)
      setShortcutStatus('idle')
      setShortcutError('')
      return
    }

    // Keep waiting while only modifiers are held (e.g. Alt before Space) so we
    // don't flash an error before the user finishes the combo.
    if (isModifierOnlyEvent(event)) return

    const nextShortcut = shortcutFromEvent(event)
    if (!nextShortcut) {
      setShortcutStatus('error')
      setShortcutError('Hold Control, Option, or Command and press another key.')
      return
    }
    if (isReservedAccelerator(nextShortcut)) {
      setIsCapturingShortcut(false)
      setShortcutStatus('error')
      setShortcutError(`${formatShortcutLabel(nextShortcut)} is reserved by macOS and won't work as a shortcut. Try another combination.`)
      return
    }

    setRecordingShortcut(nextShortcut)
    setIsCapturingShortcut(false)
    void applyRecordingShortcut(nextShortcut)
  }

  const applyRecordingShortcut = async (accelerator) => {
    if (!accelerator) return
    setShortcutStatus('saving')
    setShortcutError('')
    try {
      const shortcutResult = await window.voicerefine?.setRecordingShortcut?.(accelerator)
      if (shortcutResult && !shortcutResult.ok) {
        setShortcutStatus('error')
        setShortcutError(`${formatShortcutLabel(shortcutResult.failedAccelerator)} is already in use by another app and can't be used. Still using ${formatShortcutLabel(shortcutResult.accelerator)}.`)
        setRecordingShortcut(shortcutResult.accelerator)
        return
      }
      setShortcutStatus('ready')
      setRecordingShortcut(shortcutResult?.accelerator ?? accelerator)
    } catch (err) {
      setShortcutStatus('error')
      setShortcutError(err?.message ?? 'Could not update the recording shortcut.')
    }
  }

  const handleReset = async () => {
    try {
      const shortcut = await window.voicerefine?.getRecordingShortcut?.()
      if (shortcut?.defaultAccelerator) {
        await window.voicerefine?.setRecordingShortcut?.(shortcut.defaultAccelerator)
      }
    } catch (err) {
      console.warn('[settings] Could not reset recording shortcut', err)
    }
    localStorage.clear()
    onClose()
    window.location.reload()
  }

  if (!open) return null

  return (
    <>
      <div className="ic-settings-scrim fixed inset-0 z-40" onClick={onClose} />

      <div className="ic-settings-drawer top-0 right-0 h-full w-96 border-l z-50 flex flex-col">
        <span className="ic-bloom ic-bloom-indigo ic-settings-bloom" aria-hidden="true" />
        <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--ic-rule)]">
          <h2 className="ic-title">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="ic-btn ic-btn-ghost px-2"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6">
          <section>
            <h3 className="ic-label mb-3">Refinement provider</h3>
            <div className="flex flex-col gap-2">
              {PROVIDER_OPTIONS.map(p => (
                <label key={p.value} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="provider"
                    value={p.value}
                    checked={provider === p.value}
                    onChange={() => handleProviderChange(p.value)}
                    className="mt-0.5 flex-shrink-0"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm text-[var(--ic-ink)] font-medium">{p.label}</span>
                    <span className="text-xs text-[var(--ic-ink-faint)] leading-snug">{p.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {needsKey && (
            <section>
              <h3 className="ic-label mb-3">API Key</h3>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => handleApiKeyChange(e.target.value)}
                  placeholder="Paste your key here"
                  className="ic-input flex-1"
                />
                <button
                  onClick={handleValidate}
                  disabled={!apiKey || keyStatus === 'validating'}
                  className="ic-btn ic-btn-secondary"
                >
                  {keyStatus === 'validating' ? '...' : 'Validate'}
                </button>
              </div>

              {keyStatus === 'valid' && <p className="ic-success mt-2">Key is valid</p>}
              {keyStatus === 'rate_limited' && <p className="ic-warn mt-2">Key is valid (rate limited, quota resets soon)</p>}
              {keyStatus === 'invalid' && (
                <div className="mt-2">
                  <p className="ic-error">{keyError}</p>
                </div>
              )}

              <p className="mt-3 text-xs text-[var(--ic-ink-faint)]">
                Your key is saved on this device as you type and never sent to any server we own.
              </p>
            </section>
          )}

          <section>
            <h3 className="ic-label mb-3">Models</h3>
            <ModelManager needsGemma={provider === 'builtin' && localStorage.getItem('vr_refinement_mode') === 'transform'} onChanged={() => onSaved?.({ warm: false })} />
          </section>

          <section>
            <h3 className="ic-label mb-3">Shortcut</h3>
            <div className="flex flex-col gap-2">
              <span className="text-sm text-[var(--ic-ink)] font-medium">Start and stop recording</span>
              <button
                ref={shortcutButtonRef}
                type="button"
                onClick={() => {
                  setIsCapturingShortcut(true)
                  setShortcutStatus('idle')
                  setShortcutError('')
                }}
                onKeyDown={handleShortcutKeyDown}
                className="ic-input text-left"
              >
                {isCapturingShortcut
                  ? 'Press your shortcut...'
                  : recordingShortcut ? formatShortcutLabel(recordingShortcut) : 'Click to set shortcut'}
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRecordingShortcut(defaultRecordingShortcut)
                    setShortcutError('')
                    setIsCapturingShortcut(false)
                    void applyRecordingShortcut(defaultRecordingShortcut)
                  }}
                  className="text-xs text-[var(--ic-ink-faint)] transition-colors hover:text-[var(--ic-ink)]"
                >
                  Use default
                </button>
                {isCapturingShortcut && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCapturingShortcut(false)
                      setShortcutStatus('idle')
                      setShortcutError('')
                    }}
                    className="text-xs text-[var(--ic-ink-faint)] transition-colors hover:text-[var(--ic-ink)]"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--ic-ink-faint)] leading-snug">
              This shortcut works globally and toggles the overlay recording in other apps. Use Control, Option, or Command with another key. Press Esc while recording to cancel.
            </p>
            {shortcutStatus === 'error' && <p className="ic-error mt-2">{shortcutError}</p>}
            {shortcutStatus === 'ready' && <p className="ic-success mt-2">Shortcut updated.</p>}
          </section>

          <section>
            <h3 className="ic-label mb-3">Smart Refine prompt</h3>
            <div className="flex flex-col gap-3">
              <p className="text-xs text-[var(--ic-ink-faint)] leading-snug">
                InkCling uses the built-in Smart Refine prompt by default. Edit it only if you want custom behavior.
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="ic-badge">
                  {transformPromptMode === TRANSFORM_PROMPT_MODE_CUSTOM ? 'Using a custom prompt' : 'Using the built-in prompt'}
                </span>
                <button
                  type="button"
                  onClick={() => setTransformPromptEditorOpen(open => !open)}
                  className="ic-btn ic-btn-secondary"
                >
                  {transformPromptEditorOpen ? 'Hide prompt' : 'Edit prompt'}
                </button>
              </div>
            </div>

            {transformPromptEditorOpen && (
              <div className="mt-4 flex flex-col gap-4">
                <div className="rounded-xl border border-[rgba(58,47,42,0.08)] px-3 py-3 bg-[rgba(58,47,42,0.04)]">
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-[var(--ic-ink-soft)] leading-snug">
                      Editing this prompt switches Smart Refine to your custom prompt. Changes apply in the app and overlay automatically.
                    </p>
                    <button
                      type="button"
                      onClick={handleUseBuiltInTransformPrompts}
                      className="self-start text-xs text-[var(--ic-ink-faint)] hover:text-[var(--ic-ink)] transition-colors"
                    >
                      Restore built-in prompt
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="structure-prompt" className="text-sm font-medium text-[var(--ic-ink)]">
                      {TRANSFORM_PRESETS.structure.label}
                    </label>
                    <button
                      type="button"
                      onClick={() => handleResetTransformPrompt('structure')}
                      className="text-xs text-[var(--ic-ink-faint)] hover:text-[var(--ic-ink)] transition-colors"
                    >
                      Reset this prompt
                    </button>
                  </div>
                  <textarea
                    id="structure-prompt"
                    value={structurePrompt}
                    onChange={e => handleTransformPromptChange('structure', e.target.value)}
                    className="ic-textarea h-40 resize-none"
                    />
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="relative z-10 px-6 py-4 border-t border-[var(--ic-rule)] flex flex-col gap-3">
          <p className="text-center text-xs text-[var(--ic-ink-faint)]">Changes apply automatically.</p>
          <button
            onClick={handleReset}
            className="w-full py-2 rounded-xl text-sm text-[var(--ic-ink-soft)] hover:text-[var(--ic-ink)] transition-colors"
          >
            Reset onboarding
          </button>
        </div>
      </div>
    </>
  )
}
