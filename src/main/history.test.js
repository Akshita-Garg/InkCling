import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { HISTORY_LIMIT, addDictation, clearEntries, updateEntry, countWords, createHistoryStore, emptyHistory, normalizeHistory } from './history.js'

describe('countWords', () => {
  it('counts whitespace-separated words and ignores padding', () => {
    expect(countWords('  let us meet\nat four  ')).toBe(5)
  })

  it('returns zero for empty or non-string input', () => {
    expect(countWords('   ')).toBe(0)
    expect(countWords(undefined)).toBe(0)
  })
})

describe('addDictation', () => {
  it('counts the spoken words, not the refined text', () => {
    const next = addDictation(emptyHistory(), {
      rawText: 'um so basically let us meet at four',
      text: 'Let us meet at four.',
      source: 'shortcut',
    }, 1000)
    expect(next.totalWords).toBe(8)
    expect(next.entries[0]).toMatchObject({
      text: 'Let us meet at four.',
      rawText: 'um so basically let us meet at four',
      words: 8,
      source: 'shortcut',
      createdAt: 1000,
    })
  })

  it('falls back to the final text when there is no raw transcript', () => {
    const next = addDictation(emptyHistory(), { text: 'three words here', source: 'app' })
    expect(next.totalWords).toBe(3)
    expect(next.entries[0].source).toBe('app')
    expect(next.entries[0].rawText).toBe('three words here')
  })

  it('ignores empty dictations', () => {
    const history = emptyHistory()
    expect(addDictation(history, { text: '  ', rawText: '' })).toBe(history)
  })

  it('keeps the newest entries first and caps the list, but keeps the full total', () => {
    let history = emptyHistory()
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) {
      history = addDictation(history, { text: `entry ${i}` }, i)
    }
    expect(history.entries).toHaveLength(HISTORY_LIMIT)
    expect(history.entries[0].text).toBe(`entry ${HISTORY_LIMIT + 4}`)
    expect(history.totalWords).toBe((HISTORY_LIMIT + 5) * 2)
  })
})

describe('clearEntries', () => {
  it('empties the list and keeps the all-time total', () => {
    const history = addDictation(emptyHistory(), { text: 'two words' })
    expect(clearEntries(history)).toEqual({ totalWords: 2, entries: [] })
  })
})

describe('updateEntry', () => {
  it('replaces the final text and mode but keeps words and total', () => {
    const h = addDictation(emptyHistory(), { rawText: 'um meet at four', text: 'Meet at four.', refinementMode: 'clean' }, 5)
    const id = h.entries[0].id
    const next = updateEntry(h, id, { text: 'Let us meet at four.', refinementMode: 'transform', transformPreset: 'clarity' })
    expect(next.entries[0]).toMatchObject({ text: 'Let us meet at four.', rawText: 'um meet at four', words: 4, refinementMode: 'transform', transformPreset: 'clarity' })
    expect(next.totalWords).toBe(4)
  })

  it('ignores unknown ids and empty text', () => {
    const h = addDictation(emptyHistory(), { text: 'hello there' })
    expect(updateEntry(h, 'nope', { text: 'x' })).toBe(h)
    expect(updateEntry(h, h.entries[0].id, { text: '  ' })).toBe(h)
  })
})

describe('normalizeHistory', () => {
  it('recovers from missing or malformed data', () => {
    expect(normalizeHistory(null)).toEqual(emptyHistory())
    expect(normalizeHistory({ totalWords: -3, entries: [{ text: '' }, { text: 'ok' }, 'junk'] }))
      .toEqual({ totalWords: 0, entries: [{ text: 'ok' }] })
  })
})

describe('createHistoryStore', () => {
  it('persists across store instances', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ic-history-'))
    try {
      createHistoryStore(dir).add({ rawText: 'one two three', text: 'One, two, three.' })
      const reopened = createHistoryStore(dir).get()
      expect(reopened.totalWords).toBe(3)
      expect(reopened.entries[0].text).toBe('One, two, three.')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('starts empty when the file is corrupt', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ic-history-'))
    try {
      fs.writeFileSync(path.join(dir, 'dictation-history.json'), '{not json')
      expect(createHistoryStore(dir).get()).toEqual(emptyHistory())
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
