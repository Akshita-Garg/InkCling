import { describe, expect, it } from 'vitest'
import { calculateMaxTokens, calculateShortcutMaxTokens } from './refinementBudget'

describe('calculateMaxTokens', () => {
  it('uses a minimum budget for short prompts', () => {
    expect(calculateMaxTokens('short prompt')).toBe(96)
  })

  it('scales with input length for medium prompts', () => {
    const words = Array.from({ length: 100 }, () => 'word').join(' ')
    expect(calculateMaxTokens(words)).toBe(150)
  })

  it('caps long prompts', () => {
    const words = Array.from({ length: 1000 }, () => 'word').join(' ')
    expect(calculateMaxTokens(words)).toBe(768)
  })
})

describe('calculateShortcutMaxTokens', () => {
  it('uses a larger minimum for shortcut refinement quality', () => {
    expect(calculateShortcutMaxTokens('short transcript', { intent: 'clean' })).toBe(128)
  })

  it('uses a smaller transform minimum for short shortcut requests', () => {
    expect(calculateShortcutMaxTokens('short transcript', { intent: 'transform' })).toBe(64)
  })

  it('gives clean mode more room to preserve wording', () => {
    const transcript = Array.from({ length: 100 }, () => 'word').join(' ')
    expect(calculateShortcutMaxTokens(transcript, { intent: 'clean' })).toBe(221)
    expect(calculateShortcutMaxTokens(transcript, { intent: 'transform' })).toBe(180)
  })

  it('supports roughly three-minute transcripts without forcing heavy compression', () => {
    const transcript = Array.from({ length: 450 }, () => 'word').join(' ')
    expect(calculateShortcutMaxTokens(transcript, { intent: 'clean' })).toBe(991)
  })

  it('caps extremely long shortcut requests to fit the current context size', () => {
    const transcript = Array.from({ length: 1000 }, () => 'word').join(' ')
    expect(calculateShortcutMaxTokens(transcript, { intent: 'clean' })).toBe(1024)
  })
})
