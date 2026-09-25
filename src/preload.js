import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('voicerefine', {
  platform: process.platform,
  requestMicrophoneAccess: () => ipcRenderer.invoke('request-microphone-access'),
  refineBuiltin: (system, user, options) => ipcRenderer.invoke('refine-builtin', system, user, options),
  warmBuiltin: () => ipcRenderer.invoke('warm-builtin'),
  transcribeNative: (payload) => ipcRenderer.invoke('transcribe-native', payload),
  preloadNativeAsrModel: (payload) => ipcRenderer.invoke('preload-native-asr-model', payload),
  unloadNativeAsrModels: (payload) => ipcRenderer.invoke('unload-native-asr-models', payload),
  getSelectedNativeAsrModel: () => ipcRenderer.invoke('get-selected-native-asr-model'),
  setSelectedNativeAsrModel: (payload) => ipcRenderer.invoke('set-selected-native-asr-model', payload),
  pasteTextIntoActiveApp: (text) => ipcRenderer.invoke('paste-text-into-active-app', text),
  getRecordingShortcut: () => ipcRenderer.invoke('get-recording-shortcut'),
  setRecordingShortcut: (accelerator) => ipcRenderer.invoke('set-recording-shortcut', accelerator),
  getRefinementSettings: () => ipcRenderer.invoke('get-refinement-settings'),
  setRefinementSettings: (settings) => ipcRenderer.invoke('set-refinement-settings', settings),
  getDictationHistory: () => ipcRenderer.invoke('get-dictation-history'),
  recordDictation: (dictation) => ipcRenderer.invoke('record-dictation', dictation),
  updateDictation: (id, patch) => ipcRenderer.invoke('update-dictation', id, patch),
  clearDictationHistory: () => ipcRenderer.invoke('clear-dictation-history'),
  onDictationHistoryUpdated: (handler) => {
    const listener = (_event, history) => handler(history);
    ipcRenderer.on('dictation-history-updated', listener);
    return () => ipcRenderer.removeListener('dictation-history-updated', listener);
  },
  quitApp: () => ipcRenderer.invoke('quit-app'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  onShowCloseOptions: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('show-close-options', listener);
    return () => ipcRenderer.removeListener('show-close-options', listener);
  },
  getOverlayRecordingState: () => ipcRenderer.invoke('get-overlay-recording-state'),
  onOverlayRecordingChanged: (handler) => {
    const listener = (_event, recording) => handler(recording);
    ipcRenderer.on('overlay-recording-changed', listener);
    return () => ipcRenderer.removeListener('overlay-recording-changed', listener);
  },
  overlayReady: () => ipcRenderer.send('overlay-ready'),
  overlayRecordingStarted: () => ipcRenderer.send('overlay-recording-started'),
  overlayRecordingStopped: (metadata) => ipcRenderer.send('overlay-recording-stopped', metadata),
  overlayTranscriptionComplete: (payload) => ipcRenderer.send('overlay-transcription-complete', payload),
  overlayRecordingFailed: (message) => ipcRenderer.send('overlay-recording-failed', message),
  onOverlayCommand: (handler) => {
    const listener = (_event, command) => handler(command);
    ipcRenderer.on('overlay-command', listener);
    return () => ipcRenderer.removeListener('overlay-command', listener);
  },
  onRecordingShortcutChanged: (handler) => {
    const listener = (_event, accelerator) => handler(accelerator);
    ipcRenderer.on('recording-shortcut-changed', listener);
    return () => ipcRenderer.removeListener('recording-shortcut-changed', listener);
  },
  onOverlayTranscriptionResult: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('overlay-transcription-result', listener);
    return () => ipcRenderer.removeListener('overlay-transcription-result', listener);
  },
  listModels: () => ipcRenderer.invoke('list-models'),
  downloadModel: id => ipcRenderer.invoke('download-model', id),
  cancelModelDownload: id => ipcRenderer.invoke('cancel-model-download', id),
  removeModel: id => ipcRenderer.invoke('remove-model', id),
  checkRecordingModels: () => ipcRenderer.invoke('check-recording-models'),
  onModelsRequired: handler => {
    const listener = () => handler(); ipcRenderer.on('models-required', listener);
    return () => ipcRenderer.removeListener('models-required', listener);
  },
  onModelDownloadProgress: handler => {
    const listener = (_event, data) => handler(data); ipcRenderer.on('model-download-progress', listener);
    return () => ipcRenderer.removeListener('model-download-progress', listener);
  },
});
