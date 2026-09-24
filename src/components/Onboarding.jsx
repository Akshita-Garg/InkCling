import { useState, useEffect, useRef } from 'react'
import { Eraser, Sparkles } from 'lucide-react'
import { validateKey } from '../services/llm'
import { DEFAULT_TRANSFORM_PRESET, defaultPromptForPreset } from '../utils/composePrompt'
import {
  REFINEMENT_MODE_CLEAN,
  REFINEMENT_MODE_TRANSFORM,
  TRANSFORM_PROMPT_MODE_PRESET,
  promptStorageKeyForPreset,
} from '../utils/refinementSettings'
import { DEFAULT_RECORDING_SHORTCUT, formatShortcutLabel, isModifierOnlyEvent, isReservedAccelerator, shortcutFromEvent } from '../utils/shortcut'

const REFINEMENT_CHOICES = [
  {
    value: REFINEMENT_MODE_CLEAN,
    Icon: Eraser,
    label: 'Clean',
    description: 'Fast local cleanup with no LLM. Best for dictation and overlay use.',
  },
  {
    value: REFINEMENT_MODE_TRANSFORM,
    Icon: Sparkles,
    label: 'Smart Refine',
    description: 'Smart Refine cleans up fillers, repetition, and grammar in one model pass.',
  },
]

const PROVIDERS = [
  { value: 'builtin', label: 'Built-in (Recommended)', needsKey: false, description: 'Smart Refine runs locally on your device using a bundled model. No internet required.' },
  { value: 'gemini',  label: 'Cloud (Gemini)',         needsKey: true, description: 'Free API key from Google AI Studio.' },
  { value: 'openai',  label: 'Cloud (OpenAI)',         needsKey: true, description: 'Requires an OpenAI API key.' },
]

function Step1({ refinementMode, onSelect, onContinue }) {
  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-xl">
      <div className="ic-hero">
        <div className="ic-hero-art" role="img" aria-label="InkCling" />
        <div className="ic-hero-text">
          <div className="ic-hero-wordmark">InkCling</div>
          <div className="ic-hero-tagline">Your voice, in ink.</div>
        </div>
      </div>
      <div className="text-center">
        <h1 className="ic-h1 mb-2">How should InkCling write for you?</h1>
        <p className="ic-muted">Choose instant cleanup, or let a model reshape longer thoughts.</p>
      </div>

      <div className="flex flex-col gap-3 w-full">
        {REFINEMENT_CHOICES.map(({ value, Icon, label, description }) => {
          const selected = refinementMode === value
          return (
            <button
              key={value}
              onClick={() => onSelect(value)}
              className="ic-option"
              data-selected={selected}
            >
              <Icon size={18} strokeWidth={1.75} className={selected ? 'text-[var(--ic-indigo)]' : 'text-[var(--ic-ink-faint)]'} />
              <span><span className="ic-option-title">{label}</span><span className="ic-option-desc">{description}</span></span>
            </button>
          )
        })}
      </div>

      <button
        onClick={onContinue}
        disabled={!refinementMode}
        className="ic-btn ic-btn-primary"
      >
        Continue
      </button>
    </div>
  )
}

function ShortcutStep({ onContinue }) {
  // Placeholder until the main process reports the saved shortcut.
  const [shortcut, setShortcut] = useState(DEFAULT_RECORDING_SHORTCUT)
  const [defaultShortcut, setDefaultShortcut] = useState(DEFAULT_RECORDING_SHORTCUT)
  const [capturing, setCapturing] = useState(false)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const buttonRef = useRef(null)

  useEffect(() => {
    window.voicerefine?.getRecordingShortcut?.().then(result => {
      const nextDefault = result?.defaultAccelerator ?? DEFAULT_RECORDING_SHORTCUT
      setDefaultShortcut(nextDefault)
      setShortcut(result?.accelerator ?? nextDefault)
    }).catch(err => {
      console.warn('[onboarding] Could not load recording shortcut', err)
    })
  }, [])

  useEffect(() => {
    if (capturing) buttonRef.current?.focus()
  }, [capturing])

  // macOS swallows some system combos (e.g. Control+Space) before the field gets a
  // keydown, so capture would sit silently. Surface a hint if nothing lands.
  useEffect(() => {
    if (!capturing) return
    const timer = setTimeout(() => {
      setCapturing(false)
      setStatus('error')
      setError("Didn't catch a shortcut. If a key seems to do nothing, it's likely reserved by macOS (like Ctrl+Space). Try adding Shift or a different key.")
    }, 5000)
    return () => clearTimeout(timer)
  }, [capturing])

  const handleKeyDown = (event) => {
    if (!capturing) return
    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
      setCapturing(false)
      setStatus('idle')
      setError('')
      return
    }

    // Keep waiting while only modifiers are held (e.g. Option before Space) so we
    // don't flash an error before the user finishes the combo.
    if (isModifierOnlyEvent(event)) return

    const nextShortcut = shortcutFromEvent(event)
    if (!nextShortcut) {
      setStatus('error')
      setError('Hold Control, Option, or Command and press another key.')
      return
    }
    if (isReservedAccelerator(nextShortcut)) {
      setCapturing(false)
      setStatus('error')
      setError(`${formatShortcutLabel(nextShortcut)} is reserved by macOS and won't work. Try another combination.`)
      return
    }

    setShortcut(nextShortcut)
    setCapturing(false)
    setStatus('idle')
    setError('')
  }

  const handleContinue = async () => {
    setStatus('saving')
    setError('')
    try {
      const result = await window.voicerefine?.setRecordingShortcut?.(shortcut)
      if (result && !result.ok) {
        setStatus('error')
        setShortcut(result.accelerator ?? defaultShortcut)
        setError(`${formatShortcutLabel(result.failedAccelerator)} is already in use by another app and can't be used. Pick a different shortcut.`)
        return
      }
      onContinue()
    } catch (err) {
      setStatus('error')
      setError(err?.message ?? 'Could not save shortcut.')
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xl">
      <div className="text-center">
        <h1 className="ic-h1 mb-2">Choose your recording shortcut</h1>
        <p className="ic-muted">Use it anywhere to start recording, then press it again to stop.</p>
      </div>

      <div className="w-full flex flex-col gap-3">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            setCapturing(true)
            setStatus('idle')
            setError('')
          }}
          onKeyDown={handleKeyDown}
          className="ic-input py-5 text-center text-base font-semibold"
        >
          {capturing ? 'Press your shortcut...' : formatShortcutLabel(shortcut)}
        </button>

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => {
              setShortcut(defaultShortcut)
              setCapturing(false)
              setStatus('idle')
              setError('')
            }}
            className="text-xs text-[var(--ic-ink-faint)] hover:text-[var(--ic-ink)] transition-colors"
          >
            Use default
          </button>
          {capturing && (
            <button
              type="button"
              onClick={() => {
                setCapturing(false)
                setStatus('idle')
                setError('')
              }}
              className="text-xs text-[var(--ic-ink-faint)] hover:text-[var(--ic-ink)] transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        <p className="ic-muted text-center">
          Default is {formatShortcutLabel(defaultShortcut)}. If a shortcut is already used by your system, InkCling will ask you to choose another. Press Esc while recording to cancel.
        </p>
        {status === 'error' && <p className="ic-error text-center">{error}</p>}
      </div>

      <button
        onClick={handleContinue}
        disabled={!shortcut || status === 'saving'}
        className="ic-btn ic-btn-primary"
      >
        {status === 'saving' ? 'Saving...' : 'Continue'}
      </button>
    </div>
  )
}

function ProviderStep({ onComplete }) {
  const [provider, setProvider] = useState('builtin')
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [override, setOverride] = useState(false)

  const handleProviderChange = (val) => {
    setProvider(val)
    setStatus('idle')
    setStatusMsg('')
    setOverride(false)
    setApiKey('')
  }

  const handleValidate = async () => {
    setStatus('checking')
    setStatusMsg('')
    try {
      await validateKey({ provider, apiKey })
      setStatus('valid')
    } catch (err) {
      if (err.message === 'rate_limited') {
        setStatus('rate_limited')
      } else {
        setStatus('invalid')
        setStatusMsg(err.message)
      }
    }
  }

  const needsKey = PROVIDERS.find(p => p.value === provider)?.needsKey ?? false
  const canContinue =
    provider === 'builtin' ||
    status === 'valid' ||
    status === 'rate_limited' ||
    override

  const handleComplete = () => {
    localStorage.setItem('vr_provider', provider)
    localStorage.setItem('vr_transform_preset', DEFAULT_TRANSFORM_PRESET)
    localStorage.setItem('vr_transform_prompt_mode', TRANSFORM_PROMPT_MODE_PRESET)
    localStorage.setItem(promptStorageKeyForPreset('structure'), defaultPromptForPreset('structure'))
    if (needsKey && apiKey) localStorage.setItem('vr_api_key', apiKey)
    else localStorage.removeItem('vr_api_key')
    onComplete()
  }

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xl">
      <div className="text-center">
        <h1 className="ic-h1 mb-2">How do you want to power Smart Refine?</h1>
        <p className="ic-muted">Your key stays on this device. Clean mode never needs a model provider.</p>
      </div>

      <div className="flex flex-col gap-2 w-full">
        {PROVIDERS.map(({ value, label, description }) => {
          const selected = provider === value
          return (
            <button
              key={value}
              onClick={() => handleProviderChange(value)}
              className="ic-option"
              data-selected={selected}
            >
              <span><span className="ic-option-title">{label}</span><span className="ic-option-desc">{description}</span></span>
            </button>
          )
        })}
      </div>

      {provider && needsKey && (
        <div className="w-full flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setStatus('idle'); setOverride(false) }}
              placeholder={`Paste your ${provider === 'gemini' ? 'Gemini' : 'OpenAI'} API key`}
              className="ic-input flex-1"
            />
            <button
              onClick={handleValidate}
              disabled={!apiKey || status === 'checking'}
              className="ic-btn ic-btn-secondary"
            >
              {status === 'checking' ? '...' : 'Validate'}
            </button>
          </div>

          {status === 'checking' && <p className="ic-muted">Checking...</p>}
          {status === 'valid' && <p className="ic-success">Connected</p>}
          {status === 'rate_limited' && <p className="ic-warn">Valid key (rate limited, quota resets soon)</p>}
          {status === 'invalid' && (
            <div className="flex flex-col gap-2">
              <p className="ic-error">{statusMsg}</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={override}
                  onChange={e => setOverride(e.target.checked)}
                  
                />
                <span className="text-xs text-[var(--ic-ink-faint)]">Continue anyway, I know what I&apos;m doing</span>
              </label>
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleComplete}
        disabled={!canContinue}
        className="ic-btn ic-btn-primary"
      >
        Get started
      </button>
    </div>
  )
}

export function Onboarding({ onComplete }) {
  const [step, setStep] = useState(1)
  const [refinementMode, setRefinementMode] = useState(null)
  const [fading, setFading] = useState(false)
  const fadeTimerRef = useRef(null)

  useEffect(() => () => clearTimeout(fadeTimerRef.current), [])

  const handleStep1Continue = () => {
    localStorage.setItem('vr_refinement_mode', refinementMode)
    setStep(2)
  }

  const handleShortcutContinue = () => {
    if (refinementMode === REFINEMENT_MODE_CLEAN) {
      localStorage.setItem('vr_provider', 'builtin')
      localStorage.setItem('vr_transform_preset', DEFAULT_TRANSFORM_PRESET)
      localStorage.setItem('vr_transform_prompt_mode', TRANSFORM_PROMPT_MODE_PRESET)
      localStorage.setItem(promptStorageKeyForPreset('structure'), defaultPromptForPreset('structure'))
      localStorage.setItem('vr_onboarding_done', 'true')
      setFading(true)
      fadeTimerRef.current = setTimeout(onComplete, 500)
      return
    }
    setStep(3)
  }

  const handleProviderComplete = () => {
    localStorage.setItem('vr_refinement_mode', REFINEMENT_MODE_TRANSFORM)
    localStorage.setItem('vr_onboarding_done', 'true')
    setFading(true)
    fadeTimerRef.current = setTimeout(onComplete, 500)
  }

  return (
    <div className={`ic-paper-bg ic-onboarding ic-no-drag fixed inset-0 z-50 flex flex-col items-center justify-center px-6 transition-opacity duration-500 ${fading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      <div className="ic-titlebar ic-drag absolute top-0 left-0 right-0 flex items-center justify-end pr-6">
        <span className="ic-muted">Step {step} of {refinementMode === REFINEMENT_MODE_TRANSFORM ? 3 : 2}</span>
      </div>
      {step !== 1 && <h1 className="ic-app-title absolute left-6 top-[var(--ic-titlebar-h)]">InkCling</h1>}

      {step === 1 && <Step1 refinementMode={refinementMode} onSelect={setRefinementMode} onContinue={handleStep1Continue} />}
      {step === 2 && <ShortcutStep onContinue={handleShortcutContinue} />}
      {step === 3 && <ProviderStep onComplete={handleProviderComplete} />}
      <div className="ic-steps absolute bottom-8">
        {Array.from({ length: refinementMode === REFINEMENT_MODE_TRANSFORM ? 3 : 2 }, (_, index) => <span key={index} data-active={step === index + 1} />)}
      </div>
    </div>
  )
}
