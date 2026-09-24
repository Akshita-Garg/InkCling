import { describe, expect, it } from 'vitest'
import { normalizeProvider, readProviderConfig } from './providerConfig'

function storage(values = {}, shouldThrow = false) {
  return {
    getItem(key) {
      if (shouldThrow) throw new Error('storage unavailable')
      return values[key] ?? null
    },
  }
}

describe('providerConfig', () => {
  it('defaults to builtin with no stored provider', () => {
    expect(readProviderConfig(storage())).toEqual({ provider: 'builtin', apiKey: '' })
  })

  it('maps old unsupported providers to builtin for desktop', () => {
    expect(normalizeProvider('browser')).toBe('builtin')
    expect(normalizeProvider('ollama')).toBe('builtin')
    expect(normalizeProvider('none')).toBe('builtin')
  })

  it('preserves current desktop providers and api keys', () => {
    expect(readProviderConfig(storage({ vr_provider: 'openai', vr_api_key: 'sk-test' })))
      .toEqual({ provider: 'openai', apiKey: 'sk-test' })
    expect(readProviderConfig(storage({ vr_provider: 'none' })))
      .toEqual({ provider: 'builtin', apiKey: '' })
  })

  it('falls back to builtin when storage is unavailable', () => {
    expect(readProviderConfig(storage({}, true))).toEqual({ provider: 'builtin', apiKey: '' })
  })
})
