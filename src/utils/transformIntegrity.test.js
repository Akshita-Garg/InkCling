import { describe, expect, it } from 'vitest'
import { checkConciseIntegrity, checkTransformIntegrity } from './transformIntegrity'

describe('checkConciseIntegrity', () => {
  it('accepts controlled compression that preserves meaning markers', () => {
    const result = checkConciseIntegrity(
      'I want you to review 404 errors because I am not sure the retry is safe.',
      'I want you to review 404 errors because I am not sure retrying is safe.',
    )
    expect(result.ok).toBe(true)
  })

  it('rejects excessive deletion and lost semantic markers', () => {
    const result = checkConciseIntegrity(
      'I want you to review this because I am not sure it should not ship before version 12 is tested with the complete customer workflow.',
      'Review this before shipping.',
    )
    expect(result.ok).toBe(false)
    expect(result.reasons).toContain('lost first-person request')
    expect(result.reasons).toContain('lost uncertainty')
    expect(result.reasons).toContain('lost negation')
    expect(result.reasons).toContain('lost or changed number: 12')
  })

  it('protects questions, exact values, dictated spelling, and numbers', () => {
    const result = checkTransformIntegrity(
      'Could you email test@example.com about version 12 and I N K C L I N G?',
      'Email them about the new version.',
    )
    expect(result.ok).toBe(false)
    expect(result.reasons).toContain('lost question form')
    expect(result.reasons).toContain('lost or changed number: 12')
    expect(result.reasons).toContain('lost exact value: test@example.com')
    expect(result.reasons).toContain('lost dictated spelling: inkcling')
  })

  it('does not treat a changed decimal as the same number', () => {
    const result = checkTransformIntegrity('Set the threshold to 1.5 seconds.', 'Set the threshold to 15 seconds.')
    expect(result.ok).toBe(false)
    expect(result.reasons).toContain('lost or changed number: 1.5 seconds')
  })

  it('accepts equivalent uncertainty and normalized technical numbers', () => {
    const result = checkTransformIntegrity(
      'Maybe review the four hundred and four errors because I am not sure it is safe.',
      'Perhaps review the 404 errors because I am unsure whether it is safe.',
    )
    expect(result.ok).toBe(true)
  })

  it('rejects prompt leakage and unexpected expansion', () => {
    const result = checkTransformIntegrity(
      'Review this short note for me please.',
      'Task: SMART REFINE. Return only the refined text. Review this short note for me with many extra invented details that were never requested.',
    )
    expect(result.ok).toBe(false)
    expect(result.reasons).toContain('prompt text leaked into output')
    expect(result.reasons.some(reason => reason.startsWith('unexpected expansion'))).toBe(true)
  })

  it('rejects deletion of an entire closing thought', () => {
    const result = checkTransformIntegrity(
      'The comments were detailed and the evaluator marked the margins carefully. All of it made a lot of sense to me.',
      'The comments were detailed and the evaluator marked the margins carefully.',
      { preset: 'structure' },
    )
    expect(result.ok).toBe(false)
    expect(result.reasons).toContain('lost closing thought')
  })

  it('does not mistake a sentence fragment beginning with could for a question', () => {
    const result = checkTransformIntegrity('Could work better with the local model.', 'It could work better with the local model.')
    expect(result.ok).toBe(true)
  })
})
