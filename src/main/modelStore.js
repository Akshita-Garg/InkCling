import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export function createModelStore({ catalog, directory, bundledRoot, fetcher = fetch, onProgress = () => {} }) {
  const active = new Map();
  const model = id => { const m = catalog.find(m => m.id === id); if (!m) throw new Error('Unknown model.'); return m; };
  const matches = (p, bytes) => { try { return fs.statSync(p).isFile() && fs.statSync(p).size === bytes; } catch { return false; } };
  function resolveFile(file) {
    const downloaded = path.join(directory, file.path);
    if (matches(downloaded, file.bytes)) return downloaded;
    const bundled = bundledRoot && path.join(bundledRoot, file.path);
    return bundled && matches(bundled, file.bytes) ? bundled : null;
  }
  function list() {
    return catalog.map(m => ({ ...m, available: m.files.every(f => resolveFile(f)), downloading: active.has(m.id), progress: active.get(m.id)?.progress ?? null,
      removable: m.files.some(f => fs.existsSync(path.join(directory, f.path))) }));
  }
  async function digest(p) {
    const h = createHash('sha256');
    for await (const chunk of fs.createReadStream(p)) h.update(chunk);
    return h.digest('hex');
  }
  async function installFile(file, state, report) {
    if (resolveFile(file)) { report(file.bytes); return; }
    const dest = path.join(directory, file.path), part = dest + '.part';
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    let offset = 0;
    try { offset = (await fs.promises.stat(part)).size; } catch { /* new download */ }
    if (offset > file.bytes) { await fs.promises.unlink(part); offset = 0; }
    const disk = await fs.promises.statfs(directory);
    if (disk.bavail * disk.bsize < file.bytes - offset + 16 * 1024 * 1024) throw new Error('Not enough disk space for this model. Free some space and retry.');
    if (offset < file.bytes) {
      const headerTimeout = setTimeout(() => state.controller.abort(), 60000);
      let response;
      try { response = await fetcher(file.url, { headers: offset ? { Range: `bytes=${offset}-`, 'Accept-Encoding': 'identity' } : {}, signal: state.controller.signal }); }
      finally { clearTimeout(headerTimeout); }
      if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}). Check your connection and retry.`);
      if (response.status === 206) {
        const range = response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
        if (!range || Number(range[1]) !== offset || Number(range[3]) !== file.bytes) { await response.body.cancel(); throw new Error('Invalid resume response. Please retry.'); }
      } else if (response.status === 200) offset = 0;
      else { await response.body.cancel(); throw new Error(`Unexpected download response (${response.status}).`); }
      let received = offset;
      const progress = new Transform({ transform(chunk, _enc, done) {
        received += chunk.length;
        if (received > file.bytes) return done(new Error('Model download exceeds expected size.'));
        report(received); done(null, chunk);
      } });
      const watchdog = setInterval(() => {
        if (Date.now() - state.lastActivity > 60000) state.controller.abort();
      }, 5000);
      state.lastActivity = Date.now();
      try { await pipeline(Readable.fromWeb(response.body), progress, fs.createWriteStream(part, { flags: offset ? 'a' : 'w' }), { signal: state.controller.signal }); }
      finally { clearInterval(watchdog); }
    }
    report(file.bytes, 'verifying');
    if (!matches(part, file.bytes) || await digest(part) !== file.sha256) {
      await fs.promises.unlink(part).catch(() => {});
      throw new Error('Model download was incomplete or corrupted. Please retry.');
    }
    if (state.controller.signal.aborted) throw new Error('Download paused. Resume when ready.');
    await fs.promises.rename(part, dest);
  }
  async function download(id) {
    const m = model(id);
    if (active.has(id)) return { ok: false, reason: 'This model is already downloading.' };
    const state = { controller: new AbortController(), progress: null, lastActivity: Date.now() };
    active.set(id, state);
    let completed = 0, lastSent = 0;
    try {
      for (const f of m.files) {
        if (state.controller.signal.aborted) throw new Error('Download paused. Resume when ready.');
        await installFile(f, state, (bytes, phase = 'downloading') => {
          state.lastActivity = Date.now();
          state.progress = { id, phase, downloaded: completed + bytes, total: m.bytes, percent: Math.min(100, Math.floor((completed + bytes) / m.bytes * 100)) };
          if (Date.now() - lastSent > 150 || phase === 'verifying') { onProgress(state.progress); lastSent = Date.now(); }
        });
        completed += f.bytes;
      }
      return { ok: true };
    } catch (err) { return { ok: false, reason: state.controller.signal.aborted ? 'Download paused. Resume when ready.' : err.message }; }
    finally { active.delete(id); onProgress({ id, phase: 'idle' }); }
  }
  function cancel(id) { model(id); active.get(id)?.controller.abort(); }
  async function remove(id) {
    const m = model(id);
    if (active.has(id)) throw new Error('Pause the download before removing this model.');
    for (const f of m.files) for (const suffix of ['', '.part']) await fs.promises.rm(path.join(directory, f.path) + suffix, { force: true });
  }
  function requireFile(id, index = 0) {
    const m = model(id), p = resolveFile(m.files[index]);
    if (!p) throw new Error(`Download ${m.label} in Settings > Models before using it.`);
    return p;
  }
  return { list, download, cancel, remove, requireFile };
}
