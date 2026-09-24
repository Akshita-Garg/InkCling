// Cloud providers speak the OpenAI chat/completions format.
// Gemini supports it via their OpenAI-compatible layer at a different base URL.
import { readProviderConfig } from '../utils/providerConfig'
import { capitalizeSentenceStarts, cleanRefinementOutput, cleanSpeechArtifacts, finalizeTransformOutput } from '../utils/refinementOutput'

const PROVIDERS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
  },
}

export async function warmBuiltinRefinement() {
  if (!window.voicerefine?.warmBuiltin) return null
  return await window.voicerefine.warmBuiltin()
}

/**
 * Read provider config from localStorage.
 * Falls back to the bundled local model for the desktop app.
 */
function getProviderConfig() {
  return readProviderConfig(globalThis.localStorage)
}

export function cleanTranscriptText(text) {
  return capitalizeSentenceStarts(cleanSpeechArtifacts(cleanRefinementOutput(text)))
}

function transformSamplingFor({ preset }) {
  if (preset === 'clarity' || preset === 'bullets') {
    return { temperature: 0, topP: 1, topK: 1, seed: 42 }
  }
  if (preset === 'structure') {
    return { temperature: 0, topP: 1, topK: 1, seed: 42 }
  }
  return { temperature: 0.9, topP: 0.95, topK: 64 }
}

/**
 * Send the composed prompt to the configured LLM provider
 * and return the refined text.
 *
 * Throws with a specific, user-readable message for auth failures, rate limits,
 * and network errors, not a generic "something went wrong".
 */
export async function refine({ system, user, preset, providerConfig, maxTokens }) {
  const { provider, apiKey } = providerConfig ?? getProviderConfig()
  if (provider === 'browser') return null

  // Built-in: runs Gemma locally via IPC to the main process.
  if (provider === 'builtin') {
    if (!window.voicerefine?.refineBuiltin) {
      throw new Error('Built-in refinement is unavailable. Restart the desktop app and try again.')
    }
    const output = finalizeTransformOutput(await window.voicerefine.refineBuiltin(system, user, {
      maxTokens,
      ...transformSamplingFor({ preset }),
    }))
    return output
  }

  const config = PROVIDERS[provider]
  if (!config) throw new Error(`Unknown provider: "${provider}"`)

  let response
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          ...(system?.trim() ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: user },
        ],
        ...(Number.isInteger(maxTokens) ? { max_tokens: maxTokens } : {}),
        stream: false,
      }),
    })
  } catch (err) {
    // fetch() itself throws only on network-level failures (offline, CORS, DNS)
    throw new Error(`Network error. Is your internet connected? (${err.message})`, { cause: err })
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const detail = body?.error?.message ?? `HTTP ${response.status}`
    if (response.status === 401) throw new Error(`Invalid or expired API key. Check your key in Settings. (${detail})`)
    if (response.status === 429) throw new Error(`Rate limit reached. Wait a moment and try again. (${detail})`)
    throw new Error(`Provider error: ${detail}`)
  }

  const data = await response.json().catch(() => null)
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('Provider returned an unreadable or empty response.')
  return finalizeTransformOutput(content)
}

/**
 * Fire a minimal 1-token call to check whether an API key is valid.
 * Throws with a user-readable message on failure.
 * A 429 (rate limit) means the key is real, so caller should treat it as valid.
 */
export async function validateKey({ provider, apiKey }) {
  const config = PROVIDERS[provider]
  if (!config) throw new Error(`Unknown provider: "${provider}"`)

  let response
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: false,
      }),
    })
  } catch (err) {
    throw new Error(`Network error during validation. (${err.message})`, { cause: err })
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const detail = body?.error?.message ?? `HTTP ${response.status}`
    if (response.status === 401) throw new Error(`Invalid or expired API key. (${detail})`)
    if (response.status === 429) throw new Error('rate_limited')
    throw new Error(`Validation failed: ${detail}`)
  }
}
