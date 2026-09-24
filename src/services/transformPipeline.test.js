import { beforeEach, describe, expect, it, vi } from 'vitest'
const { refineMock } = vi.hoisted(() => ({ refineMock: vi.fn() }))
vi.mock('./llm', async importOriginal => ({ ...await importOriginal(), refine: refineMock }))
import { transformTranscript, refineTranscriptForMode } from './transformPipeline'
import { defaultPromptForPreset } from '../utils/composePrompt'

const source = 'I want you to email test@example.com about version 12 because I am not sure it is ready'
const prompt = defaultPromptForPreset('structure')

describe('single-pass Smart Refine', () => {
  beforeEach(() => refineMock.mockReset())

  it.each(['', '   ', '\n\t', undefined])('does not generate for silence (%j)', async transcript => {
    expect(await transformTranscript({ transcript, prompt, providerConfig: { provider: 'builtin' } })).toBe('')
    expect(refineMock).not.toHaveBeenCalled()
  })

  it.each(['builtin', 'openai', 'gemini'])('generates once with the concise prompt for %s', async provider => {
    const output = `${source}.`
    refineMock.mockResolvedValueOnce(output)
    expect(await transformTranscript({
      transcript: source, prompt, preset: 'clarity', providerConfig: { provider, singlePassStructure: false },
      clarityPrompt: 'Legacy preliminary prompt must never run',
    })).toBe(output)
    expect(refineMock).toHaveBeenCalledTimes(1)
    const call = refineMock.mock.calls[0][0]
    expect(call.preset).toBe('structure')
    expect(call.user).toContain('CONCISE & ORGANISE spoken dictation')
    expect(call.user).toContain(source)
    expect(call.user).not.toContain('Legacy preliminary prompt')
    expect(call.maxTokens).toBeGreaterThan(0)
  })

  it.each(['Send it.', 'I want you to email the team about version 13 because it is ready.', ''])('falls back without another generation for a rejected result (%j)', async output => {
    refineMock.mockResolvedValueOnce(output)
    expect(await transformTranscript({ transcript: source, prompt, preset: 'structure', providerConfig: { provider: 'builtin' } })).toBe(`${source}.`)
    expect(refineMock).toHaveBeenCalledTimes(1)
  })

  it('propagates model failure to the recording path without retrying', async () => {
    refineMock.mockRejectedValueOnce(new Error('Model unavailable'))
    await expect(transformTranscript({ transcript: source, prompt, providerConfig: { provider: 'builtin' } })).rejects.toThrow('Model unavailable')
    expect(refineMock).toHaveBeenCalledTimes(1)
  })
})

describe('Clean versus Transform routing shared by app and shortcut', () => {
  beforeEach(() => refineMock.mockReset())

  it.each(['builtin', 'openai', 'gemini'])('Clean performs local cleanup without calling %s', async provider => {
    expect(await refineTranscriptForMode({
      transcript: 'um the documents are ready', refinementMode: 'clean',
      prompt, preset: 'structure', providerConfig: { provider },
    })).toEqual({ text: 'The documents are ready', refinementMode: 'clean', transformPreset: null })
    expect(refineMock).not.toHaveBeenCalled()
  })

  it('Transform uses Smart Refine with one generation', async () => {
    refineMock.mockResolvedValueOnce('The documents are ready.')
    expect(await refineTranscriptForMode({
      transcript: 'um the documents are ready', refinementMode: 'transform',
      prompt, preset: 'clarity', providerConfig: { provider: 'builtin' },
    })).toEqual({ text: 'The documents are ready.', refinementMode: 'transform', transformPreset: 'structure' })
    expect(refineMock).toHaveBeenCalledTimes(1)
  })
})
