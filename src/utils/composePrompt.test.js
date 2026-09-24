import { describe, expect, it } from 'vitest'
import {
  composeShortcutTransformPrompt,
  composeTransformPrompt,
  DEFAULT_TRANSFORM_PRESET,
  TRANSFORM_PRESETS,
  defaultPromptForPreset,
  normalizeTranscriptForTransform,
  normalizeTransformPreset,
} from './composePrompt'

const transcript = 'Hello this is a test transcript'

describe('composeTransformPrompt', () => {
  it('returns an object with system and user string fields', () => {
    const { system, user } = composeTransformPrompt({
      prompt: defaultPromptForPreset(DEFAULT_TRANSFORM_PRESET),
      transcript,
    })
    expect(typeof system).toBe('string')
    expect(typeof user).toBe('string')
  })

  it('uses a plain Gemma-friendly transcript block', () => {
    const { system, user } = composeTransformPrompt({
      prompt: defaultPromptForPreset(DEFAULT_TRANSFORM_PRESET),
      transcript,
    })
    expect(system).toBe('')
    expect(user).toContain('Transcript:')
    expect(user).toContain(transcript)
    expect(user).toContain('Final text:')
  })

  it('throws when the transform prompt is empty', () => {
    expect(() => composeTransformPrompt({ prompt: '   ', transcript }))
      .toThrow('Transform prompt is empty.')
  })
})

describe('transform presets', () => {
  it('normalizes unknown presets to the default', () => {
    expect(normalizeTransformPreset('unknown')).toBe(DEFAULT_TRANSFORM_PRESET)
  })

  it('returns a default prompt for every preset', () => {
    for (const preset of Object.keys(TRANSFORM_PRESETS)) {
      expect(defaultPromptForPreset(preset)).toBeTruthy()
    }
  })
})

describe('normalizeTranscriptForTransform', () => {
  it('normalizes bracket cues to side-note cues', () => {
    expect(normalizeTranscriptForTransform('the quote is fine in brackets check whether this includes tax'))
      .toBe('the quote is fine side note check whether this includes tax')
  })

  it('normalizes common spoken error codes before prompting', () => {
    expect(normalizeTranscriptForTransform('log four hundred and four errors separately from five hundred errors'))
      .toBe('log 404 errors separately from 500 errors')
  })

  it('repairs high-confidence ASR duplication and a malformed junction before prompting', () => {
    expect(normalizeTranscriptForTransform('right now it the ink can can be black and I might have have it saved'))
      .toBe('right now the ink can be black and I might have it saved')
  })

  it('preserves correction content while normalizing a paragraph cue', () => {
    expect(normalizeTranscriptForTransform('send the invoice to ops scratch that send it to finance before five'))
      .toBe('send the invoice to ops scratch that send it to finance before five')
    expect(normalizeTranscriptForTransform('first thought new thought second thought'))
      .toBe('first thought\n\nsecond thought')
  })
})

describe('composeShortcutTransformPrompt', () => {
  it('creates a compact shortcut prompt', () => {
    const full = composeTransformPrompt({
      prompt: defaultPromptForPreset('clarity'),
      transcript,
    })
    const shortcut = composeShortcutTransformPrompt({
      prompt: defaultPromptForPreset('clarity'),
      transcript,
    })

    expect(shortcut.system).toBe('')
    expect(shortcut.user).toBe(full.user)
    expect(shortcut.user).toContain(transcript)
    expect(shortcut.user).toContain('The examples above are examples only. Transform only the transcript below.')
    expect(shortcut.user).toContain('Return only the final text.')
  })

  it('throws when the shortcut transform prompt is empty', () => {
    expect(() => composeShortcutTransformPrompt({ prompt: '', transcript }))
      .toThrow('Transform prompt is empty.')
  })

  it('adds transcript-specific perspective and spelling checks', () => {
    const { user } = composeShortcutTransformPrompt({
      prompt: defaultPromptForPreset('structure'),
      transcript: 'I want you to design Ink Link I N K C L I N G with I and C both capital',
    })
    expect(user).toContain('must preserve the words "I want you to"')
    expect(user).toContain('resolve to "InkCling"')
    expect(user).toContain('Use "InkCling" exactly as the name')
  })
})

describe('transform prompt presets', () => {
  it('migrates legacy selections to the single Smart Refine preset', () => {
    expect(Object.keys(TRANSFORM_PRESETS)).toEqual(['structure'])
    for (const legacy of ['clarity', 'structure', 'rewrite', undefined, 'unknown']) {
      expect(normalizeTransformPreset(legacy)).toBe('structure')
      expect(defaultPromptForPreset(legacy)).toBe(defaultPromptForPreset('structure'))
    }
  })

  it('uses the concise prompt for Smart Refine', () => {
    const prompt = defaultPromptForPreset('structure')
    expect(TRANSFORM_PRESETS.structure.label).toBe('Smart Refine')
    expect(prompt).toContain('Preserve the speaker\'s meaning, viewpoint, speech act, and every distinct idea.')
    expect(prompt).toContain('Keep every unique request, detail, reason, constraint, example, and design idea.')
    expect(prompt).toContain('Never replace it with an imperative or a third-person specification.')
    expect(prompt).toContain('Do not make the speaker sound more certain.')
    expect(prompt).toContain('70–90%')
    expect(prompt).toContain('Treat this as a deletion edit, not a summary.')
  })

  it('removes exact adjacent ASR duplicates before prompting', () => {
    expect(normalizeTranscriptForTransform('the ink can can be black and I might have have it saved'))
      .toBe('the ink can be black and I might have it saved')
  })

  it('preserves common intentional emphasis and grammatical repetition', () => {
    expect(normalizeTranscriptForTransform('this is very very useful and I had had enough'))
      .toBe('this is very very useful and I had had enough')
  })

  it('tells the model that ASR punctuation is provisional', () => {
    const prompt = defaultPromptForPreset('clarity')
    expect(prompt).toContain('punctuation and sentence breaks in the transcript as provisional')
  })
})
