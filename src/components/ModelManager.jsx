import { useEffect, useState } from 'react'
import { currentNativeAsrModel, syncSelectedNativeAsrModel, preloadNativeAsrModel } from '../services/asr'

export function ModelManager({ setup = false, needsGemma = false, onComplete, onChanged }) {
  const [models, setModels] = useState([])
  const [selected, setSelected] = useState(currentNativeAsrModel)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = async () => setModels(await window.voicerefine.listModels())
  useEffect(() => {
    refresh().catch(e => setError(e.message))
    const unsub = window.voicerefine.onModelDownloadProgress(data => {
      if (data.phase === 'idle') refresh().catch(e => setError(e.message))
      else setModels(ms => ms.map(m => m.id === data.id ? { ...m, downloading: true, progress: data } : m))
    })
    return unsub
  }, [])
  const choose = async id => {
    setError('')
    try {
      if (!setup && !models.find(m => m.id === id)?.available) return
      setSelected(id)
      if (!setup) {
        localStorage.setItem('vr_native_asr_model', id)
        await syncSelectedNativeAsrModel(id)
        await preloadNativeAsrModel(id)
        onChanged?.()
      }
    } catch (e) { setError(e.message) }
  }
  const download = async id => {
    setError('')
    setModels(ms => ms.map(m => m.id === id ? { ...m, downloading: true } : m))
    try { const r = await window.voicerefine.downloadModel(id); if (!r.ok) setError(r.reason); }
    catch (e) { setError(e.message) }
    finally { await refresh(); onChanged?.() }
  }
  const remove = async id => {
    setError('')
    try { await window.voicerefine.removeModel(id); await refresh(); onChanged?.() }
    catch (e) { setError(e.message) }
  }
  const required = [selected, ...(needsGemma ? ['gemma'] : [])]
  const pending = models.filter(m => required.includes(m.id) && !m.available)
  const downloading = models.some(m => m.downloading)
  const start = async () => {
    setBusy(true); setError('')
    try {
      for (const m of pending) {
        const r = await window.voicerefine.downloadModel(m.id)
        if (!r.ok) throw new Error(r.reason)
      }
      localStorage.setItem('vr_native_asr_model', selected)
      await syncSelectedNativeAsrModel(selected)
      await preloadNativeAsrModel(selected)
      if (needsGemma) await window.voicerefine.warmBuiltin()
      await refresh()
      onComplete?.()
    } catch (e) { setError(e.message) }
    finally { setBusy(false); await refresh() }
  }
  const size = bytes => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${Math.ceil(bytes / 1e6)} MB`
  return <div className="flex flex-col gap-4 w-full">
    <p className="ic-muted">Download once, dictate offline. Choose one speech model. Smart Refine also needs Gemma when using the local provider.</p>
    {models.filter(m => !setup || m.kind === 'speech' || needsGemma).map(m => <div key={m.id} className="rounded-xl border border-[var(--ic-rule)] p-3 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        {m.kind === 'speech' && <input type="radio" name="speech-model" aria-label={m.label} checked={selected === m.id} disabled={busy || downloading || (!setup && !m.available)} onChange={() => choose(m.id)} className="mt-1" />}
        <div className="flex-1"><div className="text-sm font-semibold">{m.label} {m.id === 'parakeet-q4' && <span className="ic-badge">Recommended</span>}</div><p className="ic-muted">{m.description}</p></div>
        <span className="text-xs whitespace-nowrap text-[var(--ic-ink-faint)]">{m.available ? 'Installed' : size(m.bytes)}</span>
      </div>
      {m.downloading ? <div className="flex flex-col gap-2" role="status">
        <div className="flex justify-between text-xs"><span>{m.progress?.phase === 'verifying' ? 'Checking download…' : `Downloading ${m.progress?.percent ?? 0}%`}</span><button type="button" onClick={() => window.voicerefine.cancelModelDownload(m.id)}>Pause</button></div>
        <div className="ic-progress"><div style={{ width: `${m.progress?.percent ?? 0}%` }} /></div>
      </div> : !setup && <div className="flex gap-3">
        {!m.available && <button type="button" disabled={busy || downloading} className="ic-btn ic-btn-secondary text-xs" onClick={() => download(m.id)}>Download / resume · {size(m.bytes)}</button>}
        {m.removable && <button type="button" disabled={busy || downloading || m.id === selected || (m.id === 'gemma' && needsGemma)} className="text-xs text-[var(--ic-ink-faint)]" onClick={() => remove(m.id)}>Remove download</button>}
      </div>}
    </div>)}
    {!models.length && !error && <p className="ic-muted">Checking installed models…</p>}
    {error && <p className="ic-error" role="alert">{error}</p>}
    {setup && <><p className="ic-muted text-center">{pending.length ? `${size(pending.reduce((sum, m) => sum + m.bytes, 0))} for your selection. Interrupted downloads resume when you retry.` : 'Your selected models are installed.'}</p><button type="button" className="ic-btn ic-btn-primary self-center" disabled={!models.length || busy || downloading} onClick={start}>{busy ? 'Preparing your models…' : pending.length ? 'Download and get started' : 'Get started'}</button></>}
  </div>
}
