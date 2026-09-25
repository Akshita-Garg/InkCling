import { app, net, BrowserWindow } from 'electron';
import path from 'node:path';
import catalog from '../shared/modelCatalog.json';
import { createModelStore } from './modelStore.js';
let store;
export function models() {
  store ??= createModelStore({ catalog, directory: path.join(app.getPath('userData'), 'models'),
    bundledRoot: app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources/models'),
    fetcher: (url, options) => net.fetch(url, options),
    onProgress: data => BrowserWindow.getAllWindows().forEach(w => { if (!w.isDestroyed()) w.webContents.send('model-download-progress', data); }),
  });
  return store;
}
export function missingModels(speech, refinement) {
  const required = [speech, ...(refinement.provider === 'builtin' && refinement.refinementMode === 'transform' ? ['gemma'] : [])];
  return models().list().filter(m => required.includes(m.id) && !m.available);
}
