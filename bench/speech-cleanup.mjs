import { capitalizeSentenceStarts } from '../src/utils/refinementOutput.js'

export const SPEECH_CLEANUP_VERSION = 1
export const SPEECH_CLEANUP_THRESHOLD = 4

export function protectedSpeechRanges(text) {
  const ranges = [...text.matchAll(/https?:\/\/\S+|\b[\w.+-]+@[\w.-]+\.\w+|```[\s\S]*?```|`[^`]*`/g)]
    .map(m => [m.index, m.index + m[0].length])
  let open = null
  for (let i = 0; i < text.length; i++) {
    if (ranges.some(([a, b]) => i >= a && i < b)) continue
    const ch = text[i]
    if ((ch === "'" || ch === '’') && /[\p{L}\p{N}]/u.test(text[i - 1] ?? '') && /[\p{L}\p{N}]/u.test(text[i + 1] ?? '')) continue
    if (open) {
      if (ch === open.close) { ranges.push([open.start, i + 1]); open = null }
    } else if ('"“‘\''.includes(ch)) {
      open = { start: i, close: ch === '“' ? '”' : ch === '‘' ? '’' : ch }
    }
  }
  if (open) ranges.push([open.start, text.length])
  return ranges
}

function protectedAt(text, start, end, ranges) {
  return ranges.some(([a, b]) => start < b && end > a)
    || /\b(?:word|phrase|term|expression|named|called)\s+$/i.test(text.slice(0, start))
}

// This mode never interprets spoken formatting commands or guesses names/numbers.
export function normalizeSpeechCleanupInput(value) {
  const text = String(value ?? '')
  const ranges = protectedSpeechRanges(text)
  const edits = []
  for (const m of text.matchAll(/\b(?:um|uh)\b[,;:]?[ \t]*/gi)) {
    if (protectedAt(text, m.index, m.index + m[0].length, ranges)) continue
    edits.push({ start: m.index, end: m.index + m[0].length })
  }
  return applySpeechCleanupEdits(text, edits, false)
}

export function cleanupGuard(input, hit) {
  const before = input.slice(0, hit.start)
  const after = input.slice(hit.end)
  if (input.trim().split(/\s+/).length <= 3) return 'short utterance'
  if (/^i mean\b/i.test(hit.original)) {
    if (!hit.original.includes(',') || /^\s*(?:what|every|each|exactly|precisely|this|that|these|those|it|you|tomorrow|today|yesterday|\d)\b/i.test(after)) return 'possible statement of intention'
  }
  if (/^you know\b/i.test(hit.original) && !hit.original.includes(',') && !/^\s*[.!?]/.test(after) && after.trim()) return 'possible statement of knowledge'
  if (/^like\b/i.test(hit.original)) {
    if (/\b(?:looks?|looked|sounds?|sounded|tastes?|tasted|smells?|smelled|seems?|seemed|acts?|acted|works?|worked|exactly|just)\s*$/i.test(before)) return 'comparison context'
    // Article-led phrases may be estimates ("like an hour", "like a dozen").
    // Keep them even though that also keeps some fillers ("like a problem").
    if (/^\s*(?:\d|an?\b|one\b|two\b|three\b|four\b|five\b|six\b|seven\b|eight\b|nine\b|ten\b|eleven\b|twelve\b|thirteen\b|fourteen\b|fifteen\b|sixteen\b|seventeen\b|eighteen\b|nineteen\b|twenty\b|thirty\b|forty\b|fifty\b|sixty\b|seventy\b|eighty\b|ninety\b|hundred\b|thousand\b|million\b|billion\b|half\b|new\b|this\b|that\b|me\b|you\b)/i.test(after)) return 'comparison or approximation'
  }
  return null
}

export function speechCleanupCandidates(input) {
  const ranges = protectedSpeechRanges(input)
  return [...input.matchAll(/\b(?:so[, ]+yeah|you know|i mean|like)\b[,;:]?[ \t]*/gi)].map(m => {
    const hit = { start: m.index, end: m.index + m[0].length, original: m[0] }
    const guard = protectedAt(input, hit.start, hit.end, ranges) ? 'protected text' : cleanupGuard(input, hit)
    return { ...hit, guard }
  })
}

export function cleanupScoringText(text) {
  return capitalizeSentenceStarts(text
    .replace(/[,;:]\s*([.!?])/g, '$1')
    .replace(/([.!?])\s*[,;:]+/g, '$1 ')
    .replace(/[,;:]\s*[,;:]/g, ',')
    .replace(/[ \t]{2,}/g, ' ').trim())
}

export function speechCleanupAlternatives(input, hit) {
  const beforeTokens = [...input.slice(0, hit.start).matchAll(/\S+/g)]
  const from = beforeTokens.length > 24 ? beforeTokens[beforeTokens.length - 24].index : 0
  const afterTokens = [...input.slice(hit.end).matchAll(/\S+/g)]
  const to = afterTokens.length > 8 ? hit.end + afterTokens[8].index : input.length
  const before = input.slice(from, hit.start)
  const after = input.slice(hit.end, to)
  return {
    original: cleanupScoringText(before + input.slice(hit.start, hit.end) + after),
    edited: cleanupScoringText(before + after),
  }
}

export function applySpeechCleanupEdits(input, edits, finalize = true) {
  let text = input
  // Only exact, non-overlapping source spans are eligible for application.
  let previousStart = input.length
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < 0 || edit.end > previousStart || edit.end <= edit.start) continue
    if (edit.original != null && input.slice(edit.start, edit.end) !== edit.original) continue
    let end = edit.end
    if (!edit.replacement && /[.!?]\s*$/.test(input.slice(0, edit.start)) && /^[.!?]/.test(input.slice(end))) end++
    text = text.slice(0, edit.start) + (edit.replacement ?? '') + text.slice(end)
    previousStart = edit.start
  }
  const replaceOutside = (value, pattern, replacement) => {
    const ranges = protectedSpeechRanges(value)
    return value.replace(pattern, (...args) => {
      const match = args[0], index = args.at(-2)
      if (ranges.some(([a, b]) => index < b && index + match.length > a)) return match
      return match.replace(new RegExp(pattern.source, pattern.flags), replacement)
    })
  }
  text = replaceOutside(text, /[,;:]\s*([.!?])/g, '$1')
  text = replaceOutside(text, /([.!?])\s*[,;:]+/g, '$1 ')
  text = replaceOutside(text, /[,;:]\s*[,;:]/g, ',')
  text = replaceOutside(text, /[ \t]{2,}/g, ' ').trim()
  const protectedRanges = protectedSpeechRanges(text)
  const cleaned = text.replace(/(^|[.!?][)"']?\s+|\n)([a-z])/g, (match, prefix, letter, index) => {
    const at = index + prefix.length
    return protectedRanges.some(([a, b]) => at >= a && at < b) ? match : prefix + letter.toUpperCase()
  })
  if (!finalize) return cleaned
  // Preserve protected quotations verbatim; the older finalizer also removes um/uh.
  if (!cleaned || /[.!?)]$/.test(cleaned) || !/[a-z0-9]$/i.test(cleaned)) return cleaned
  return `${cleaned}.`
}

export function speechCleanupFallback(text) {
  return applySpeechCleanupEdits(normalizeSpeechCleanupInput(text), [])
}

// Cloud providers can suggest deletions, but cannot replace or add content.
export function acceptCloudSpeechCleanup(source, candidate) {
  const tokens = s => s.toLowerCase().replaceAll('’', "'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? []
  const target = tokens(candidate)
  let pos = 0, cursor = 0
  const removed = []
  const match = words => words.every((word, i) => target[pos + i] === word)
  for (const hit of speechCleanupCandidates(source).filter(hit => !hit.guard)) {
    const required = tokens(source.slice(cursor, hit.start))
    if (!match(required)) return applySpeechCleanupEdits(source, [])
    pos += required.length
    const optional = tokens(hit.original)
    if (match(optional)) pos += optional.length
    else removed.push(hit)
    cursor = hit.end
  }
  const tail = tokens(source.slice(cursor))
  if (!match(tail) || pos + tail.length !== target.length) return applySpeechCleanupEdits(source, [])
  return applySpeechCleanupEdits(source, removed)
}
