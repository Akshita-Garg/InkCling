import fs from 'node:fs';
import path from 'node:path';

// Recent dictations plus an all-time word count, persisted in userData.
// The main process owns this so global-shortcut dictations are recorded even
// when the review window is hidden, and survive restarts.

export const HISTORY_LIMIT = 20;
const HISTORY_FILE = 'dictation-history.json';

export function countWords(text) {
  if (typeof text !== 'string') return 0;
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function emptyHistory() {
  return { totalWords: 0, entries: [] };
}

// Pure: returns the next history state. Words are counted from what was spoken
// (rawText), falling back to the final text when no raw transcript exists.
export function addDictation(history, { text, rawText, source, refinementMode, transformPreset }, now = Date.now()) {
  const finalText = (text ?? rawText ?? '').trim();
  if (!finalText) return history;
  const words = countWords(rawText?.trim() ? rawText : finalText);
  const entry = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    text: finalText,
    rawText: rawText?.trim() || finalText,
    words,
    source: source === 'app' ? 'app' : 'shortcut',
    refinementMode: refinementMode ?? null,
    transformPreset: transformPreset ?? null,
    createdAt: now,
  };
  return {
    totalWords: (history.totalWords ?? 0) + words,
    entries: [entry, ...(history.entries ?? [])].slice(0, HISTORY_LIMIT),
  };
}

// Replaces an entry's final text (e.g. after Re-transform). Word counts and the
// total are unchanged: they count what was spoken, which hasn't changed.
export function updateEntry(history, id, { text, refinementMode, transformPreset }) {
  const finalText = typeof text === 'string' ? text.trim() : '';
  if (!finalText) return history;
  let found = false;
  const entries = (history.entries ?? []).map(e => {
    if (e.id !== id) return e;
    found = true;
    return { ...e, text: finalText, refinementMode: refinementMode ?? e.refinementMode ?? null, transformPreset: transformPreset ?? null };
  });
  return found ? { ...history, entries } : history;
}

// Clears the list only. The all-time total is a running tally and is kept.
export function clearEntries(history) {
  return { ...history, entries: [] };
}

export function normalizeHistory(value) {
  if (!value || typeof value !== 'object') return emptyHistory();
  const totalWords = Number.isFinite(value.totalWords) && value.totalWords > 0 ? Math.floor(value.totalWords) : 0;
  const entries = Array.isArray(value.entries)
    ? value.entries.filter(e => e && typeof e.text === 'string' && e.text.trim()).slice(0, HISTORY_LIMIT)
    : [];
  return { totalWords, entries };
}

export function createHistoryStore(userDataDir) {
  const file = path.join(userDataDir, HISTORY_FILE);
  let state = null;

  const load = () => {
    if (state) return state;
    try {
      state = normalizeHistory(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      state = emptyHistory();
    }
    return state;
  };

  const save = (next) => {
    state = next;
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
      fs.renameSync(tmp, file);
    } catch (err) {
      console.warn('[history] could not save dictation history', err?.message);
    }
    return next;
  };

  return {
    get: () => load(),
    add: (dictation) => save(addDictation(load(), dictation)),
    update: (id, patch) => save(updateEntry(load(), id, patch)),
    clear: () => save(clearEntries(load())),
  };
}
