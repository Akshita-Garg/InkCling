import { DEFAULT_TRANSFORM_PRESET, defaultPromptForPreset, normalizeTransformPreset } from './composePrompt'

export const REFINEMENT_MODE_CLEAN = 'clean'
export const REFINEMENT_MODE_TRANSFORM = 'transform'
export const TRANSFORM_PROMPT_MODE_PRESET = 'preset'
export const TRANSFORM_PROMPT_MODE_CUSTOM = 'custom'

// Consolidate Transform presets without changing the Clean/Transform choice.
// One-time migration selects the tested built-in prompt without deleting custom
// drafts. Subsequent explicit edits in Settings continue to work as before.
export function migrateSingleRefineSettings(storage = globalThis.localStorage) {
  if (!storage?.setItem || storage.getItem('vr_single_refine_version') === '1') return
  storage.setItem('vr_transform_preset', DEFAULT_TRANSFORM_PRESET)
  storage.setItem('vr_transform_prompt_mode', TRANSFORM_PROMPT_MODE_PRESET)
  storage.setItem('vr_single_refine_version', '1')
}

export function normalizeRefinementMode(value) {
  return value === REFINEMENT_MODE_TRANSFORM ? REFINEMENT_MODE_TRANSFORM : REFINEMENT_MODE_CLEAN
}

export function readRefinementMode(storage = globalThis.localStorage) {
  return normalizeRefinementMode(storage?.getItem('vr_refinement_mode'))
}

export function readTransformPreset(storage = globalThis.localStorage) {
  return normalizeTransformPreset(storage?.getItem('vr_transform_preset') ?? DEFAULT_TRANSFORM_PRESET)
}

export function normalizeTransformPromptMode(value) {
  return value === TRANSFORM_PROMPT_MODE_CUSTOM ? TRANSFORM_PROMPT_MODE_CUSTOM : TRANSFORM_PROMPT_MODE_PRESET
}

export function readTransformPromptMode(storage = globalThis.localStorage) {
  return normalizeTransformPromptMode(storage?.getItem('vr_transform_prompt_mode'))
}

export function promptStorageKeyForPreset(preset) {
  return `vr_transform_prompt_${normalizeTransformPreset(preset)}`
}

export function isStaleBuiltInPromptCopy(preset, prompt) {
  const normalizedPreset = normalizeTransformPreset(preset)
  if (!prompt) return false
  if (normalizedPreset === 'structure') {
    return prompt.includes('Use bullets only for explicit lists, task lists, steps, or clearly separate points.')
  }
  return false
}

export function readTransformPromptForPreset(preset, storage = globalThis.localStorage) {
  const normalizedPreset = normalizeTransformPreset(preset)
  if (readTransformPromptMode(storage) !== TRANSFORM_PROMPT_MODE_CUSTOM) {
    return defaultPromptForPreset(normalizedPreset)
  }

  const stored = storage?.getItem(promptStorageKeyForPreset(normalizedPreset))?.trim()
  const legacyStored = storage?.getItem('vr_transform_prompt')?.trim()
  const customPrompt = stored || legacyStored
  if (!customPrompt || isStaleBuiltInPromptCopy(normalizedPreset, customPrompt)) {
    return defaultPromptForPreset(normalizedPreset)
  }
  return customPrompt
}

export function readTransformPrompt(storage = globalThis.localStorage) {
  const preset = readTransformPreset(storage)
  return readTransformPromptForPreset(preset, storage)
}

export function readStoredPromptDraftForPreset(preset, storage = globalThis.localStorage) {
  const normalizedPreset = normalizeTransformPreset(preset)
  const stored = storage?.getItem(promptStorageKeyForPreset(normalizedPreset))?.trim()
  if (!stored || isStaleBuiltInPromptCopy(normalizedPreset, stored)) {
    return defaultPromptForPreset(normalizedPreset)
  }
  return stored
}
