export function normalizeProvider(provider) {
  return provider === 'browser' || provider === 'ollama' || provider === 'none' ? 'builtin' : provider
}

export function readProviderConfig(storage) {
  try {
    const storedProvider = storage?.getItem('vr_provider') ?? 'builtin'
    const provider = normalizeProvider(storedProvider)
    const apiKey = storage?.getItem('vr_api_key') ?? ''
    return { provider, apiKey }
  } catch {
    return { provider: 'builtin', apiKey: '' }
  }
}
