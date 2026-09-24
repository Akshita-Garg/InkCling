import { composeShortcutTransformPrompt, normalizeTranscriptForTransform, normalizeTransformPreset } from '../utils/composePrompt'
import { calculateShortcutMaxTokens } from '../utils/refinementBudget'
import { finalizeTransformOutput } from '../utils/refinementOutput'
import { checkTransformIntegrity } from '../utils/transformIntegrity'
import { cleanTranscriptText, refine } from './llm'
import { normalizeRefinementMode, REFINEMENT_MODE_CLEAN, REFINEMENT_MODE_TRANSFORM } from '../utils/refinementSettings'

async function runTransform({ transcript, prompt, preset, providerConfig, maxTokens }) {
  const { system, user } = composeShortcutTransformPrompt({ prompt, transcript })
  return await refine({ system, user, preset, providerConfig, maxTokens })
}

function safeTranscriptFallback(transcript) {
  return finalizeTransformOutput(normalizeTranscriptForTransform(transcript))
}

function auditCandidate({ source, baseline, output, preset, stage }) {
  const integrity = checkTransformIntegrity(source, output, { preset, baseline })
  if (!integrity.ok) {
    console.warn('[refine] candidate rejected', {
      stage,
      reasons: integrity.reasons,
      lengthRatio: Number(integrity.lengthRatio.toFixed(3)),
      rejectedOutput: output,
    })
  } else {
    console.log('[refine] candidate accepted', {
      stage,
      lengthRatio: Number(integrity.lengthRatio.toFixed(3)),
    })
  }
  return integrity
}

export async function transformTranscript({ transcript, prompt, preset, providerConfig }) {
  // Silence must never reach the model, which could otherwise invent content.
  if (!transcript?.trim()) return ''

  const activePreset = normalizeTransformPreset(preset)
  const maxTokens = calculateShortcutMaxTokens(transcript, { intent: 'transform' })
  const normalizedOriginal = normalizeTranscriptForTransform(transcript)
  // Exactly one generation for Smart Refine. Failed checks return the source;
  // they never trigger a second model call or an automatic rewrite.
  const output = await runTransform({
    transcript,
    prompt,
    preset: activePreset,
    providerConfig,
    maxTokens,
  })
  const integrity = auditCandidate({
    source: transcript,
    baseline: normalizedOriginal,
    output,
    preset: activePreset,
    stage: 'smart-refine-single-pass',
  })
  return integrity.ok ? output : safeTranscriptFallback(transcript)
}

// Shared by in-app recording, journal reruns, and global-shortcut dictation.
export async function refineTranscriptForMode({ transcript, refinementMode, ...options }) {
  if (normalizeRefinementMode(refinementMode) === REFINEMENT_MODE_CLEAN) {
    return { text: cleanTranscriptText(transcript), refinementMode: REFINEMENT_MODE_CLEAN, transformPreset: null }
  }
  const preset = normalizeTransformPreset(options.preset)
  const output = await transformTranscript({ ...options, transcript, preset })
  return { text: output?.trim() ? output : transcript, refinementMode: REFINEMENT_MODE_TRANSFORM, transformPreset: preset }
}
