import {
  SPEECH_CLEANUP_THRESHOLD, SPEECH_CLEANUP_VERSION,
  normalizeSpeechCleanupInput, speechCleanupCandidates,
  speechCleanupAlternatives, applySpeechCleanupEdits,
} from './speech-cleanup.mjs'

const TOP_K = 4096
const MAX_WINDOW_TOKENS = 128

export async function scoreSpeechAlternative(model, sequence, tokens, from, support = TOP_K) {
  await sequence.clearHistory()
  let sum = 0, missing = 0
  const items = tokens.map((token, i) => i >= from - 1 && i < tokens.length - 1
    ? [token, { generateNext: { probabilities: true, options: { temperature: 1, topK: support, topP: 1, minP: 0 } } }]
    : token)
  await sequence.controlledEvaluate(items, { onTokenResult: (i, result) => {
    if (i < from - 1 || i >= tokens.length - 1) return
    const probabilities = result.next?.probabilities
    if (!probabilities) throw new Error('Local cleanup probability data is unavailable.')
    const probability = probabilities.get(tokens[i + 1])
    if (!probability) missing++
    sum += Math.log(Math.max(probability || 0, 1e-9))
  } })
  return { sum, missing }
}

export async function compareSpeechAlternatives(model, sequence, alternatives) {
  const tokens = text => (model.tokens.bos != null ? [model.tokens.bos] : []).concat(model.tokenize(text))
  const originalTokens = tokens(alternatives.original), editedTokens = tokens(alternatives.edited)
  if (Math.max(originalTokens.length, editedTokens.length) > MAX_WINDOW_TOKENS) return { remove: false, skipped: 'long window' }
  let common = 0
  while (common < Math.min(originalTokens.length, editedTokens.length) && originalTokens[common] === editedTokens[common]) common++
  const from = Math.max(1, common)
  let original = await scoreSpeechAlternative(model, sequence, originalTokens, from)
  let edited = await scoreSpeechAlternative(model, sequence, editedTokens, from)
  let improvement = edited.sum - original.sum
  // Avoid decisions driven by out-of-support probabilities or a close threshold.
  const fullVocabulary = original.missing > 0 || edited.missing > 0 || Math.abs(improvement - SPEECH_CLEANUP_THRESHOLD) < 1
  if (fullVocabulary) {
    original = await scoreSpeechAlternative(model, sequence, originalTokens, from, 0)
    edited = await scoreSpeechAlternative(model, sequence, editedTokens, from, 0)
    improvement = edited.sum - original.sum
  }
  return {
    remove: original.missing === 0 && edited.missing === 0 && improvement > SPEECH_CLEANUP_THRESHOLD,
    improvement, fullVocabulary,
  }
}

// A single cleanup operation, with no generated rewrite or second editing pass.
export async function cleanupSpeechWithModel({ text, model, sequence, compare, budgetMs = 12000 }) {
  const input = normalizeSpeechCleanupInput(text)
  const candidates = speechCleanupCandidates(input)
  const edits = [], judgments = []
  const start = performance.now()
  const judge = compare ?? (alternatives => compareSpeechAlternatives(model, sequence, alternatives))
  let limited = false
  for (const hit of candidates) {
    if (hit.guard) continue
    if (performance.now() - start >= budgetMs) { limited = true; break }
    const result = await judge(speechCleanupAlternatives(input, hit))
    judgments.push({ ...hit, ...result })
    if (result.remove) edits.push(hit)
  }
  return {
    text: applySpeechCleanupEdits(input, edits),
    version: SPEECH_CLEANUP_VERSION,
    edits,
    judgments,
    stats: { candidates: candidates.length, scored: judgments.length, removed: edits.length, limited, durationMs: Math.round(performance.now() - start) },
  }
}
