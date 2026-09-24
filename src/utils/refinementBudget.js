export function calculateMaxTokens(inputText) {
  const inputWordCount = inputText.split(/\s+/).filter(Boolean).length
  return Math.min(768, Math.max(96, Math.ceil(inputWordCount * 1.5)))
}

export function calculateShortcutMaxTokens(transcript, { intent } = {}) {
  const transcriptWordCount = transcript.split(/\s+/).filter(Boolean).length
  const multiplier = intent === 'clean' ? 2.2 : 1.8
  const minimum = intent === 'transform' ? 64 : 128
  return Math.min(1024, Math.max(minimum, Math.ceil(transcriptWordCount * multiplier)))
}
