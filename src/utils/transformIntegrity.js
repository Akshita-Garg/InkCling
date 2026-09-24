const UNCERTAINTY_PATTERN = /\b(?:maybe|perhaps|probably|possibly|might|may|could|uncertain|unsure|not sure|don't know|do not know)\b/i
const NEGATION_PATTERN = /\b(?:no|not|never|neither|nor|without|cannot|can't|couldn't|didn't|doesn't|don't|hadn't|hasn't|isn't|mustn't|shouldn't|wasn't|weren't|won't|wouldn't)\b/i
const QUESTION_OPENER_PATTERN = /^\s*(?:(?:who|what|when|where|why|how)\b|(?:can|could|would|should|will|do|does|did|is|are|am|was|were|have|has|had)\s+(?:i|you|we|they|he|she|it|this|that|there)\b)/i
const PROMPT_LEAK_PATTERN = /(?:task:\s*(?:smart refine|concise)|required preservation checks|return only the (?:refined|concise|final) text|^\s*transcript:\s*)/im
const CONTENT_STOP_WORDS = new Set([
  'a', 'all', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'been', 'being', 'but', 'by', 'do', 'does', 'for', 'from',
  'had', 'has', 'have', 'he', 'her', 'hers', 'him', 'his', 'i', 'if', 'in', 'is', 'it', 'its', 'like', 'me', 'my',
  'of', 'on', 'or', 'our', 'ours', 'right', 'she', 'so', 'that', 'the', 'their', 'theirs', 'them', 'they', 'this',
  'to', 'uh', 'um', 'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'with', 'you', 'your', 'yours',
  'yeah', 'basically', 'honestly', 'actually', 'just',
])

function wordCount(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).length
}

function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\bfour hundred and four\b/g, '404')
    .replace(/\bfive hundred\b/g, '500')
}

function canonicalNumber(value) {
  const match = value.toLowerCase().match(/^([^\d]*)([\d][\d,._]*(?:\.\d+)?)(.*)$/)
  if (!match) return value.toLowerCase()
  return `${match[1]}${match[2].replace(/[,_]/g, '')}${match[3]}`
}

function extractNumbers(text) {
  const values = normalize(text).match(/(?:[$€£₹]\s*)?\b\d[\d,._]*(?:\.\d+)?(?:%|\s*(?:am|pm|ms|s|sec|secs|seconds|minutes|hours|kb|mb|gb|tb|hz|khz|mhz|ghz))?\b/gi) ?? []
  return [...new Set(values.map(canonicalNumber))]
}

function extractExactAnchors(text) {
  const source = String(text ?? '')
  const emails = source.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? []
  const urls = source.match(/\b(?:https?:\/\/|www\.)[^\s<>()]+/gi) ?? []
  return [...new Set([...emails, ...urls].map(value => value.replace(/[.,!?]+$/, '').toLowerCase()))]
}

function extractSpelledSequences(text) {
  return [...String(text ?? '').matchAll(/\b(?:[A-Z]\s+){2,}[A-Z]\b/g)]
    .map(match => match[0].replace(/\s+/g, '').toLowerCase())
}

function hasQuestionForm(text) {
  return String(text ?? '').includes('?') || QUESTION_OPENER_PATTERN.test(String(text ?? ''))
}

function textWithoutUncertaintyNegation(text) {
  return text
    .replace(/\b(?:i\s*(?:am|'m)\s*)?not sure\b/gi, ' uncertain ')
    .replace(/\b(?:i\s*)?(?:don't|do not) know\b/gi, ' uncertain ')
}

function contentWords(text) {
  return normalize(text)
    .match(/[a-z0-9]+(?:'[a-z]+)?/g)?.filter(word => word.length > 2 && !CONTENT_STOP_WORDS.has(word)) ?? []
}

function endingContentWords(text) {
  const value = String(text ?? '').trim()
  const lastSentence = value.split(/[.!?]+\s+/).filter(Boolean).at(-1) ?? ''
  const sentenceContent = [...new Set(contentWords(lastSentence))]
  if (sentenceContent.length >= 2) return sentenceContent
  const tail = value.split(/\s+/).slice(-12).join(' ')
  return [...new Set(contentWords(tail))]
}

/**
 * Reject only high-confidence failures. The source supplies semantic anchors;
 * baseline supplies the expected length after deterministic input cleanup.
 */
export function checkTransformIntegrity(source, output, { preset = 'clarity', baseline = source } = {}) {
  const reasons = []
  const normalizedInput = normalize(source)
  const normalizedOutput = normalize(output)
  const inputWords = wordCount(baseline)
  const lengthRatio = inputWords > 0 ? wordCount(output) / inputWords : 1

  if (!String(output ?? '').trim()) reasons.push('empty output')
  if (PROMPT_LEAK_PATTERN.test(String(output ?? ''))) reasons.push('prompt text leaked into output')
  if (inputWords >= 8) {
    const minimum = preset === 'structure' ? 0.5 : 0.58
    if (lengthRatio < minimum) reasons.push(`excessive compression (${lengthRatio.toFixed(2)})`)
  }
  if (inputWords >= 4) {
    const maximum = preset === 'structure' ? 1.25 : 1.45
    if (lengthRatio > maximum) reasons.push(`unexpected expansion (${lengthRatio.toFixed(2)})`)
  }

  if (normalizedInput.includes('i want you to') && !normalizedOutput.includes('i want you to')) {
    reasons.push('lost first-person request')
  }
  if (UNCERTAINTY_PATTERN.test(normalizedInput) && !UNCERTAINTY_PATTERN.test(normalizedOutput)) {
    reasons.push('lost uncertainty')
  }
  if (NEGATION_PATTERN.test(textWithoutUncertaintyNegation(normalizedInput)) && !NEGATION_PATTERN.test(textWithoutUncertaintyNegation(normalizedOutput))) {
    reasons.push('lost negation')
  }
  if (hasQuestionForm(source) && !String(output ?? '').includes('?')) reasons.push('lost question form')

  const outputNumbers = new Set(extractNumbers(output))
  for (const number of extractNumbers(source)) {
    if (!outputNumbers.has(number)) reasons.push(`lost or changed number: ${number}`)
  }

  const normalizedExactOutput = normalizedOutput.replace(/[.,!?]+(?=\s|$)/g, '')
  for (const anchor of extractExactAnchors(source)) {
    if (!normalizedExactOutput.includes(anchor)) reasons.push(`lost exact value: ${anchor}`)
  }

  const compactOutput = normalizedOutput.replace(/[^a-z0-9]+/g, '')
  for (const spelling of extractSpelledSequences(source)) {
    if (!compactOutput.includes(spelling)) reasons.push(`lost dictated spelling: ${spelling}`)
  }

  const endingWords = endingContentWords(baseline)
  if (endingWords.length >= 2) {
    const outputContent = new Set(contentWords(output))
    if (!endingWords.some(word => outputContent.has(word))) reasons.push('lost closing thought')
  }

  return { ok: reasons.length === 0, reasons, lengthRatio }
}

// Compatibility wrapper for the evaluator and any older callers.
export function checkConciseIntegrity(input, output) {
  return checkTransformIntegrity(input, output, { preset: 'structure' })
}
