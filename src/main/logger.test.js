import { describe, expect, it } from 'vitest'
import { redactSensitive } from './logger.js'

describe('logger redaction', () => {
  it('keeps diagnostic text while redacting credentials recursively', () => {
    expect(redactSensitive({
      transcript: 'keep the full transcript',
      prompt: 'keep the full prompt',
      apiKey: 'secret-key',
      nested: { authorization: 'Bearer secret', output: 'keep the output' },
    })).toEqual({
      transcript: 'keep the full transcript',
      prompt: 'keep the full prompt',
      apiKey: '[REDACTED]',
      nested: { authorization: '[REDACTED]', output: 'keep the output' },
    })
  })

  it('removes dictated content from production diagnostics while keeping metadata', () => {
    expect(redactSensitive({
      transcript: 'private dictation',
      rawText: 'private raw text',
      output: 'private output',
      chars: 42,
      nested: { prompt: 'private prompt', durationMs: 320 },
    }, { includeContent: false })).toEqual({
      transcript: '[REDACTED]',
      rawText: '[REDACTED]',
      output: '[REDACTED]',
      chars: 42,
      nested: { prompt: '[REDACTED]', durationMs: 320 },
    })
  })
})
