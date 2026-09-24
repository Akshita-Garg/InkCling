import { useState } from 'react'
import { TRANSFORM_PRESETS } from '../utils/composePrompt'

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

function clockTime(d) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase()
}

function stampFor(ts, now = new Date()) {
  const d = new Date(ts)
  if (sameDay(d, now)) return clockTime(d)
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${clockTime(d)}`
}

function modeLabel(entry) {
  if (entry.refinementMode === 'transform') return TRANSFORM_PRESETS[entry.transformPreset]?.label ?? 'Smart Refine'
  if (entry.refinementMode === 'clean') return 'Clean'
  return null
}

function Entry({ entry, onRetransform, busy }) {
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)
  const raw = entry.rawText && entry.rawText !== entry.text ? entry.rawText : null
  const mode = modeLabel(entry)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(entry.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <li className="ic-page-wrap">
      <article className="ic-page">
        <div className="ic-page-top">
          <p className="ic-page-text">{entry.text}</p>
          <time className="ic-page-time" dateTime={new Date(entry.createdAt).toISOString()}>{stampFor(entry.createdAt)}</time>
        </div>
        {showRaw && raw && <p className="ic-page-raw">“{raw}”</p>}
        <div className="ic-page-meta">
          <span>{entry.words} {entry.words === 1 ? 'word' : 'words'}{mode ? ` · ${mode}` : ''}</span>
          <span className="ic-page-actions">
            {raw && <button onClick={() => setShowRaw(v => !v)}>{showRaw ? 'Hide what you said' : 'Show what you said'}</button>}
            <button onClick={() => onRetransform(entry)} disabled={busy}>{busy ? 'Working…' : 'Re-transform'}</button>
            <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </span>
        </div>
      </article>
    </li>
  )
}

// The journal: the only scrolling region of the main window.
export function JournalEntries({ entries, onRetransform, busyId, onClear }) {
  const now = new Date()
  const today = entries.filter(e => sameDay(new Date(e.createdAt), now))
  const earlier = entries.filter(e => !sameDay(new Date(e.createdAt), now))

  return (
    <section className="ic-journal" aria-label="Your transcripts">
      <div className="ic-journal-scroll">
        {entries.length === 0 ? (
          <div className="ic-journal-empty ic-page-wrap"><div className="ic-page"><p>Your transcripts will appear here.</p></div></div>
        ) : (
          <>
            {[['Today', today], ['Earlier', earlier]].map(([label, list], i) => list.length > 0 && (
              <div key={label} className="ic-journal-group">
                <div className="ic-journal-head">
                  <h2 className="ic-label">{label}</h2>
                  {i === 0 || today.length === 0 ? <button className="ic-journal-clear" onClick={onClear}>Clear list</button> : null}
                </div>
                <ul className="ic-journal-list">
                  {list.map(e => <Entry key={e.id} entry={e} onRetransform={onRetransform} busy={busyId === e.id} />)}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  )
}
