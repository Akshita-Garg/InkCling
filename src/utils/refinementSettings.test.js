import { describe, expect, it } from 'vitest'
import {
  REFINEMENT_MODE_TRANSFORM,
  REFINEMENT_MODE_CLEAN,
  TRANSFORM_PROMPT_MODE_CUSTOM,
  TRANSFORM_PROMPT_MODE_PRESET,
  normalizeRefinementMode,
  migrateSingleRefineSettings,
  normalizeTransformPromptMode,
  promptStorageKeyForPreset,
  isStaleBuiltInPromptCopy,
  readRefinementMode,
  readTransformPreset,
  readTransformPrompt,
  readTransformPromptForPreset,
  readTransformPromptMode,
} from './refinementSettings'

function storage(values = {}) {
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null
    },
  }
}

describe('refinementSettings', () => {
  it('preserves Clean and Transform selections', () => {
    expect(normalizeRefinementMode('unknown')).toBe(REFINEMENT_MODE_CLEAN)
    expect(normalizeRefinementMode('clean')).toBe(REFINEMENT_MODE_CLEAN)
    expect(normalizeRefinementMode(REFINEMENT_MODE_TRANSFORM)).toBe(REFINEMENT_MODE_TRANSFORM)
  })

  it('reads the stored refinement mode', () => {
    expect(readRefinementMode(storage({ vr_refinement_mode: REFINEMENT_MODE_TRANSFORM }))).toBe(REFINEMENT_MODE_TRANSFORM)
    expect(readRefinementMode(storage())).toBe(REFINEMENT_MODE_CLEAN)
    expect(readRefinementMode(storage({ vr_refinement_mode: 'clean' }))).toBe(REFINEMENT_MODE_CLEAN)
  })

  it('reads the stored transform preset with fallback', () => {
    expect(readTransformPreset(storage({ vr_transform_preset: 'clarity' }))).toBe('structure')
    expect(readTransformPreset(storage({ vr_transform_preset: 'nope' }))).toBe('structure')
  })

  it('reads the stored transform prompt with preset fallback', () => {
    expect(readTransformPrompt(storage())).toContain('CONCISE & ORGANISE spoken dictation')
  })

  it('keeps built-in prompts unless custom prompt mode is enabled', () => {
    expect(readTransformPrompt(storage({
      vr_transform_prompt_mode: TRANSFORM_PROMPT_MODE_PRESET,
      vr_transform_prompt_clarity: 'Custom clarity prompt',
    }))).toContain('CONCISE & ORGANISE spoken dictation')
  })

  it('reads the custom prompt for the selected transform preset', () => {
    const customStorage = storage({
      vr_transform_prompt_mode: TRANSFORM_PROMPT_MODE_CUSTOM,
      vr_transform_preset: 'structure',
      vr_transform_prompt_clarity: 'Custom clarity prompt',
      [promptStorageKeyForPreset('structure')]: 'Custom structure prompt',
    })

    expect(readTransformPrompt(customStorage)).toBe('Custom structure prompt')
    expect(readTransformPromptForPreset('clarity', customStorage)).toBe('Custom structure prompt')
  })

  it('falls back from stale built-in prompt copies in custom storage', () => {
    const stalePrompt = [
      'Rules:',
      '- Use bullets only for explicit lists, task lists, steps, or clearly separate points.',
    ].join('\n')
    const customStorage = storage({
      vr_transform_prompt_mode: TRANSFORM_PROMPT_MODE_CUSTOM,
      vr_transform_preset: 'structure',
      [promptStorageKeyForPreset('structure')]: stalePrompt,
    })

    expect(isStaleBuiltInPromptCopy('structure', stalePrompt)).toBe(true)
    expect(readTransformPrompt(customStorage)).toContain('CONCISE & ORGANISE spoken dictation')
    expect(readTransformPrompt(customStorage)).not.toContain('clearly separate points')
  })

  it('consolidates Transform presets without changing Clean or custom drafts', () => {
    const values = {
      vr_refinement_mode: 'clean', vr_transform_preset: 'clarity',
      vr_transform_prompt_mode: 'custom', vr_transform_prompt_clarity: 'Old custom draft',
      vr_transform_prompt_structure: 'Custom concise draft',
    }
    const store = { getItem: key => values[key] ?? null, setItem: (key, value) => { values[key] = value } }
    migrateSingleRefineSettings(store)
    expect(values).toMatchObject({ vr_refinement_mode: 'clean', vr_transform_preset: 'structure', vr_transform_prompt_mode: 'preset' })
    expect(values.vr_transform_prompt_clarity).toBe('Old custom draft')
    expect(values.vr_transform_prompt_structure).toBe('Custom concise draft')
    expect(readTransformPrompt(store)).toContain('CONCISE & ORGANISE spoken dictation')
    values.vr_transform_prompt_mode = 'custom'
    migrateSingleRefineSettings(store)
    expect(readTransformPrompt(store)).toBe('Custom concise draft')
  })

  it('normalizes transform prompt mode' , () => {
    expect(normalizeTransformPromptMode(TRANSFORM_PROMPT_MODE_CUSTOM)).toBe(TRANSFORM_PROMPT_MODE_CUSTOM)
    expect(normalizeTransformPromptMode('unknown')).toBe(TRANSFORM_PROMPT_MODE_PRESET)
    expect(readTransformPromptMode(storage({ vr_transform_prompt_mode: TRANSFORM_PROMPT_MODE_CUSTOM }))).toBe(TRANSFORM_PROMPT_MODE_CUSTOM)
  })
})
