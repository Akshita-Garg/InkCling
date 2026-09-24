export function cleanRefinementOutput(text) {
  if (!text) return text

  return text
    .trim()
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^(refined (?:text|bullet list|output)|output|result)\s*:\s*/i, '')
    .replace(/^here(?:'s| is)\s+(?:the\s+)?(?:refined|cleaned|rewritten)\s+(?:text|transcript|bullet list|output)\s*:\s*/i, '')
    .replace(/^here(?:'s| is)\s+a\s+polished\s+version\s+of\s+the\s+text[^\n]*:\s*/i, '')
    .trim()
}

export function cleanSpeechArtifacts(text) {
  if (!text) return text

  return text
    .replace(/(^|[\s([{])(?:uh|um)[,.;:!?]?(?=\s|$)/gi, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim()
}

export function capitalizeSentenceStarts(text) {
  if (!text) return text
  return text
    // First letter of the text, and the start of each line (paragraphs/bullets),
    // skipping any leading bullet or number marker.
    .replace(/(^|\n)([ \t]*(?:[-*]\s+|\d+[.)]\s+)?)([a-z])/g, (_m, lead, prefix, ch) => `${lead}${prefix}${ch.toUpperCase()}`)
    // First letter after sentence-ending punctuation (the model often adds the
    // period but leaves the next sentence lowercase).
    .replace(/([.!?][)"']?\s+)([a-z])/g, (_m, boundary, ch) => `${boundary}${ch.toUpperCase()}`)
}

// No em dashes in InkCling's output: a spaced or tight dash between words
// becomes a comma; a dash at a line start or end is dropped.
export function removeEmDashes(text) {
  if (!text) return text
  return text
    .replace(/[ \t]*\u2014[ \t]*(?=\n|$)/g, '')
    .replace(/(^|\n)[ \t]*\u2014[ \t]*/g, '$1')
    .replace(/[ \t]*\u2014[ \t]*/g, ', ')
    .replace(/,\s*([,.;:!?])/g, '$1')
}

export function finalizeTransformOutput(text) {
  if (!text) return text

  // Keep this stage mechanical. Semantic deletion and correction belong to the
  // model, whose candidate is checked against the original transcript later.
  const cleaned = capitalizeSentenceStarts(removeEmDashes(cleanSpeechArtifacts(cleanRefinementOutput(text))))
    .replace(/\.\s*:\s*/g, '. ')
  const lines = cleaned.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const bulletLines = lines.filter(line => /^([-*]|\d+[.)])\s+/.test(line))
  if (bulletLines.length >= 2) return cleaned
  if (/[.!?)]$/.test(cleaned)) return cleaned
  if (!/[a-z0-9]$/i.test(cleaned)) return cleaned

  return `${cleaned}.`
}
