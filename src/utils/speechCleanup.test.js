import { describe, it, expect } from 'vitest'
import { normalizeSpeechCleanupInput, speechCleanupCandidates, speechCleanupFallback, applySpeechCleanupEdits, acceptCloudSpeechCleanup } from '../../bench/speech-cleanup.mjs'
import { cleanupSpeechWithModel } from '../../bench/speech-cleanup-engine.mjs'

describe('bounded speech cleanup experiment', () => {
  it('preserves quotations, repeated names, numbers, and spoken commands', () => {
    const text = 'Duran Duran wrote "um, like, you know". Mahi mahi costs 27 euros. Write a list. New paragraph.'
    expect(speechCleanupFallback(text)).toBe(text)
    expect(speechCleanupCandidates(text).every(hit => hit.guard)).toBe(true)
  })

  it('removes only unquoted hesitation sounds during deterministic cleanup', () => {
    expect(normalizeSpeechCleanupInput('um, please keep the word uh and "um, uh" exactly as written.'))
      .toBe('Please keep the word uh and "um, uh" exactly as written.')
  })

  it('protects approximate quantities, comparisons, intention, and knowledge', () => {
    for (const text of ['It took like an hour.', 'There were like a dozen chairs.', 'It cost like fifty dollars.', 'It looks like rain.', 'I mean what I said.', 'Do you know the time?']) {
      expect(speechCleanupCandidates(text).every(hit => hit.guard), text).toBe(true)
    }
  })

  it('applies exact source deletions without erasing neighbouring sentences', () => {
    const text = 'We can wait. So yeah. Do not cancel room 22.'
    expect(applySpeechCleanupEdits(text, speechCleanupCandidates(text))).toBe('We can wait. Do not cancel room 22.')
    expect(applySpeechCleanupEdits(text, [{ start: 0, end: 6, original: 'wrong' }])).toBe(text)
  })

  it('does not accept cloud additions, changed numbers, or dropped negation', () => {
    const source = 'So yeah, do not cancel room 22.'
    expect(acceptCloudSpeechCleanup(source, 'Do not cancel room 22.')).toBe('Do not cancel room 22.')
    for (const bad of ['Cancel room 22.', 'Do not cancel room 23.', 'Do not cancel room 22 tomorrow.']) {
      expect(acceptCloudSpeechCleanup(source, bad)).toBe(source)
    }
  })

  it('lets model decisions remove eligible fillers but never protected text', async () => {
    let calls = 0
    const text = 'So yeah, it looks like rain. I do not want to cancel.'
    const result = await cleanupSpeechWithModel({ text, compare: async () => { calls++; return { remove: true } } })
    expect(calls).toBe(1)
    expect(result.text).toBe('It looks like rain. I do not want to cancel.')
  })

  it('preserves the complete remaining text when the scoring budget is exhausted', async () => {
    const text = 'So yeah, please check like whether room 22 is free. Do not cancel it.'
    const result = await cleanupSpeechWithModel({ text, budgetMs: 0, compare: () => { throw new Error('must not score') } })
    expect(result.text).toBe(text)
    expect(result.stats.limited).toBe(true)
  })

  it('does not infer grammar repairs or interpret formatting requests', async () => {
    const text = 'The results was surprising. Make a list of three things.'
    const result = await cleanupSpeechWithModel({ text, compare: () => { throw new Error('must not score') } })
    expect(result.text).toBe(text)
  })
})
