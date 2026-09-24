import { DEFAULT_TRANSFORM_PRESET, defaultPromptForPreset } from './utils/composePrompt';
import { DEFAULT_RECORDING_SHORTCUT as DEFAULT_HOTKEY_ACCELERATOR, isReservedAccelerator } from './utils/shortcut.js';
import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, net, screen, session, shell, systemPreferences } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import started from 'electron-squirrel-startup';
import { holdNativeAsrModels, isCohereModelAvailable, preloadNativeAsrModel, shutdownNativeAsrModels, transcribeNative, unloadNativeAsrModels } from './main/asr.js';
import { createHistoryStore } from './main/history.js';
import { pasteToMacTarget, readFrontmostMacApp } from './main/macPaste.js';
import { attachRendererLogging, initializeFileLogging } from './main/logger.js';
import { clearUnloadTimer, refineBuiltin, unloadBuiltinModel, warmBuiltin } from './main/refine.js';
import { COHERE_DOWNLOAD, verifyModelDownload } from './main/modelDownloads.js';
import { ensureTermsAccepted, installAppMenu } from './main/legal.js';

let cohereDownloadActive = false;

const execFileAsync = promisify(execFile);

if (started) {
  app.quit();
}

// Only one InkCling instance may run. After "Close window" hides the window,
// relaunching the app focuses the existing instance instead of starting a second.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

// Saved custom shortcuts still win over the shared default.
const CANCEL_ACCELERATOR = 'Esc';
// How long a notice stays in the overlay after dictation ends: "No speech
// detected", "Copied to clipboard" (paste failed), or a recording error.
const OVERLAY_NOTICE_MS = 2_000;
// The overlay window (400x150) is taller than the bubble to leave room for its
// shadow; overlay.jsx pins the bubble 44px above the window's bottom edge.
// 40 + 44 puts the bubble's bottom 84px above the Dock/work area, where it sat
// before the redesign (old 120px window, centred bubble, 56px offset).
const OVERLAY_BOTTOM_OFFSET = 40;

let mainWindow = null;
let overlayWindow = null;
let isQuitting = false;
let hotkeyAccelerator = DEFAULT_HOTKEY_ACCELERATOR;
let overlayReady = false;
let overlayRecording = false;
let overlayStarting = false;
let releaseRecordingAsrHold = null;
let overlaySession = 0;
let overlayProcessing = false;
let pendingOverlayCommand = null;
let selectedNativeAsrModel = 'parakeet-q4';
let refinementSettings = {
  provider: 'builtin',
  apiKey: '',
  refinementMode: 'clean',
  transformPreset: DEFAULT_TRANSFORM_PRESET,
  transformPrompt: defaultPromptForPreset(DEFAULT_TRANSFORM_PRESET),
};

let historyStore = null;
function dictationHistory() {
  historyStore ??= createHistoryStore(app.getPath('userData'));
  return historyStore;
}

function recordDictation(dictation) {
  const next = dictationHistory().add(dictation);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dictation-history-updated', next);
  }
  return next;
}

function shortcutConfigPath() {
  return path.join(app.getPath('userData'), 'shortcut-settings.json');
}

function normalizeHotkeyAccelerator(value) {
  return typeof value === 'string' && isValidHotkeyAccelerator(value) ? value : DEFAULT_HOTKEY_ACCELERATOR;
}

function isValidHotkeyAccelerator(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('+').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  if (isReservedAccelerator(parts.join('+'))) return false;

  const key = parts.at(-1);
  const modifiers = parts.slice(0, -1);
  // Accept macOS Command plus legacy Meta/Super accelerators.
  const validModifiers = new Set(['Control', 'Alt', 'Shift', 'Super', 'Meta', 'Command']);
  const primaryModifiers = new Set(['Control', 'Alt', 'Super', 'Meta', 'Command']);
  if (!modifiers.every(part => validModifiers.has(part))) return false;
  // Shift alone is not a valid global shortcut; require a primary modifier
  // (Control, Option, or Command).
  const hasPrimaryModifier = modifiers.some(part => primaryModifiers.has(part));
  if (!hasPrimaryModifier) return false;
  if (!key || validModifiers.has(key) || key === CANCEL_ACCELERATOR) return false;

  return true;
}

function readStoredHotkeyAccelerator() {
  try {
    const parsed = JSON.parse(fs.readFileSync(shortcutConfigPath(), 'utf8'));
    return normalizeHotkeyAccelerator(parsed?.recordingShortcut);
  } catch {
    return DEFAULT_HOTKEY_ACCELERATOR;
  }
}

function writeStoredHotkeyAccelerator(accelerator) {
  fs.writeFileSync(shortcutConfigPath(), JSON.stringify({ recordingShortcut: accelerator }, null, 2));
}

// Capture before showing any windows, and keep the target for this dictation.
let pasteTarget = null;

async function sendPasteShortcut(target, sessionId) {
  if (process.platform === 'win32') {
    const powershellPath = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    await execFileAsync(powershellPath, [
      '-NoProfile',
      '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")',
    ], { windowsHide: true });
    return;
  }

  if (process.platform === 'darwin') {
    if (!systemPreferences.isTrustedAccessibilityClient(true)) {
      throw new Error('Enable InkCling in System Settings > Privacy & Security > Accessibility. Your transcript is copied; paste it with Cmd+V.');
    }
    await pasteToMacTarget(target, { execFileAsync, isCancelled: () => sessionId !== overlaySession });
    console.log('[paste] Cmd+V sent', { target });
    return;
  }

  await execFileAsync('xdotool', ['key', 'ctrl+v']);
}

async function pasteTextIntoActiveApp(text) {
  const target = pasteTarget;
  const sessionId = overlaySession;
  const trimmedText = text?.trim();
  if (!trimmedText) return { inserted: false, reason: 'empty-text' };

  // Leave the transcript on the clipboard (no restore of the previous contents).
  // Paste success can't be reliably detected, if the auto-paste lands somewhere
  // you didn't want, or nowhere (e.g. you switched apps mid-transcription), the
  // last dictation stays on the clipboard so you can paste it yourself with Cmd+V.
  clipboard.writeText(trimmedText);
  const copied = clipboard.readText() === trimmedText;
  console.log('[paste] clipboard write verified', { copied, chars: trimmedText.length, target });
  if (!copied) throw new Error('Could not copy the transcript. It is saved in your dictation history.');

  try {
    await sendPasteShortcut(target, sessionId);
    // Sending the key is observable; insertion into another app is not.
    return { copied: true, pasteShortcutSent: true, chars: trimmedText.length };
  } catch (err) {
    clipboard.writeText(trimmedText);
    throw err;
  }
}

// SharedArrayBuffer (used by Transformers.js WASM threading) requires these
// headers even in Electron. The Vite dev server sets them itself; for
// production file:// loads we inject them here via the session API.
function addCrossOriginHeaders() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['credentialless'],
      },
    });
  });
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    // Only the journal sheet scrolls; this is the smallest size at which the
    // sidebar (with Smart Refine) and the main column still fit.
    minWidth: 960,
    minHeight: 760,
    show: false,
    backgroundColor: 'rgb(241, 227, 195)',
    // No separate title bar: the traffic lights sit in the app's own 44px
    // top strip (--ic-titlebar-h). y centres the ~14px button row in it.
    ...(process.platform === 'darwin' && {
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 16, y: 15 },
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  attachRendererLogging(mainWindow.webContents, 'renderer:main');

  mainWindow.once('ready-to-show', () => {
    console.log('[window] main renderer ready', { url: mainWindow?.webContents.getURL() });
    if (overlayStarting || overlayRecording || overlayProcessing) mainWindow?.showInactive();
    else mainWindow?.show();
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    console.error('[window] main renderer failed to load', {
      code,
      description,
      url: validatedURL,
      isMainFrame,
    });
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[window] main renderer process exited', details);
  });

  // Intercept the window's close (×): instead of closing, ask the renderer to
  // show the "Close window vs Quit" options. A real quit sets isQuitting first
  // (see before-quit / quit-app), so the close is allowed to proceed then.
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.webContents.send('show-close-options');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

function positionOverlayWindow() {
  if (!overlayWindow) return;

  const { workArea } = screen.getPrimaryDisplay();
  const bounds = overlayWindow.getBounds();
  const x = Math.round(workArea.x + (workArea.width - bounds.width) / 2);
  const y = Math.round(workArea.y + workArea.height - bounds.height - OVERLAY_BOTTOM_OFFSET);
  overlayWindow.setPosition(x, y, false);
}

function showOverlayWindow() {
  if (!overlayWindow) return;

  positionOverlayWindow();
  // Re-asserted on every show: another app going full screen, or macOS
  // reordering levels, otherwise leaves the bubble buried under other windows.
  // (moveTop() is deliberately not called here: it pulls focus to InkCling and
  // takes the text cursor out of the app you were typing in.)
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.showInactive();
  // Also claimed via the window's 'show' event; this covers showInactive in
  // case that event isn't emitted. claimCancelShortcut is idempotent.
  claimCancelShortcut();
}

const createOverlayWindow = () => {
  overlayReady = false;
  overlayWindow = new BrowserWindow({
    width: 400,
    height: 150,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    show: false,
    // Not a macOS 'panel': a panel sits at the floating window level, where
    // setAlwaysOnTop('screen-saver') cannot raise it, and other apps' windows
    // cover the bubble. focusable:false plus showInactive keeps the app you
    // were typing in active, and the paste re-activates that app anyway.
    focusable: false,
    hasShadow: false,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  attachRendererLogging(overlayWindow.webContents, 'renderer:overlay');
  overlayWindow.webContents.on('render-process-gone', () => {
    cancelOverlayRecording();
  });

  overlayWindow.webContents.on('did-finish-load', () => {
    console.log('[window] overlay renderer loaded', { url: overlayWindow?.webContents.getURL() });
  });
  overlayWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    console.error('[window] overlay renderer failed to load', {
      code,
      description,
      url: validatedURL,
      isMainFrame,
    });
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(true);
  // Esc cancels a dictation, but a global shortcut takes the key away from
  // every other app. So claim Esc only while the bubble is on screen; the
  // window's own show/hide events cover every path that hides it.
  overlayWindow.on('show', claimCancelShortcut);
  overlayWindow.on('hide', releaseCancelShortcut);
  overlayWindow.on('closed', () => {
    releaseRecordingAsrHold?.();
    releaseRecordingAsrHold = null;
    releaseCancelShortcut();
    overlayWindow = null;
  });

  if (OVERLAY_WINDOW_VITE_DEV_SERVER_URL) {
    overlayWindow.loadURL(`${OVERLAY_WINDOW_VITE_DEV_SERVER_URL}/overlay.html`);
  } else {
    overlayWindow.loadFile(path.join(__dirname, `../renderer/${OVERLAY_WINDOW_VITE_NAME}/overlay.html`));
  }

  positionOverlayWindow();
};

function claimCancelShortcut() {
  if (globalShortcut.isRegistered(CANCEL_ACCELERATOR)) return;
  const registered = globalShortcut.register(CANCEL_ACCELERATOR, () => {
    if (overlayWindow?.isVisible()) cancelOverlayRecording();
  });
  console.log('[hotkey] Esc cancel claimed', { registered });
}

function releaseCancelShortcut() {
  if (!globalShortcut.isRegistered(CANCEL_ACCELERATOR)) return;
  globalShortcut.unregister(CANCEL_ACCELERATOR);
  console.log('[hotkey] Esc cancel released');
}

function sendOverlayCommand(command) {
  if (!overlayWindow) createOverlayWindow();
  if (!overlayReady) {
    pendingOverlayCommand = command;
    return;
  }
  overlayWindow.webContents.send('overlay-command', command);
}

async function showOverlayAndStartRecording() {
  if (overlayProcessing || overlayStarting) {
    console.log('[overlay] ignoring start while processing');
    return;
  }

  overlayStarting = true;
  releaseRecordingAsrHold?.();
  releaseRecordingAsrHold = holdNativeAsrModels();
  // Do not delay microphone capture: reload overlaps with speaking. The ASR
  // queue makes even very short recordings wait safely for loading to finish.
  void preloadNativeAsrModel({ model: selectedNativeAsrModel }).catch(err => {
    console.warn('[asr-native] recording warmup failed; transcription will retry', err);
  });
  const sessionId = ++overlaySession;
  pasteTarget = null;
  if (process.platform === 'darwin') {
    try {
      const target = await readFrontmostMacApp(execFileAsync);
      if (sessionId !== overlaySession) return;
      pasteTarget = target.pid !== process.pid ? target : null;
      console.log('[paste] target captured before overlay', { sessionId, target: pasteTarget });
    } catch (err) {
      console.warn('[paste] could not capture typing app; clipboard fallback only', err?.message);
    }
  }
  if (sessionId !== overlaySession) return;
  if (!overlayWindow) createOverlayWindow();

  if (!overlayWindow.isVisible()) {
    showOverlayWindow();
    console.log('[overlay] shown');
  }

  sendOverlayCommand('start-recording');
}

function setOverlayRecording(recording) {
  if (overlayRecording === recording) return;
  overlayRecording = recording;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('overlay-recording-changed', recording);
  }
}

function stopOverlayRecording() {
  sendOverlayCommand('stop-recording');
}

function cancelOverlayRecording() {
  releaseRecordingAsrHold?.();
  releaseRecordingAsrHold = null;
  ++overlaySession;
  overlayStarting = false;
  pendingOverlayCommand = null;
  if (overlayWindow?.isVisible()) sendOverlayCommand('cancel-recording');
  overlayWindow?.hide();
  setOverlayRecording(false);
  overlayProcessing = false;
  console.log('[overlay] cancelled');
}

function toggleRecordingOverlay() {
  if (overlayStarting) {
    cancelOverlayRecording();
    return;
  }
  if (overlayRecording) {
    stopOverlayRecording();
    return;
  }

  showOverlayAndStartRecording();
}

async function showHotkeyFailureDialog(accelerator = hotkeyAccelerator) {
  const isMac = process.platform === 'darwin';
  const detail = isMac
    ? 'macOS may require Accessibility permission before InkCling can listen for global shortcuts. Open System Settings > Privacy & Security > Accessibility and allow InkCling.'
    : 'Another app may already be using this shortcut, or the operating system rejected the registration.';

  const result = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: 'warning',
    title: 'Global hotkey unavailable',
    message: `InkCling could not register ${accelerator}.`,
    detail,
    buttons: isMac ? ['Open Accessibility Settings', 'OK'] : ['OK'],
    defaultId: isMac ? 1 : 0,
    cancelId: isMac ? 1 : 0,
  });

  if (isMac && result.response === 0) {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  }
}

function registerRecordingHotkey(nextAccelerator, { showDialog = true } = {}) {
  const previousAccelerator = hotkeyAccelerator;
  const accelerator = normalizeHotkeyAccelerator(nextAccelerator);
  if (previousAccelerator && globalShortcut.isRegistered(previousAccelerator)) {
    globalShortcut.unregister(previousAccelerator);
  }

  hotkeyAccelerator = accelerator;
  console.log(`[hotkey] Registering ${hotkeyAccelerator} on ${process.platform}`);
  const registered = globalShortcut.register(hotkeyAccelerator, () => {
    console.log(`[hotkey] ${hotkeyAccelerator} pressed`);
    toggleRecordingOverlay();
    mainWindow?.webContents.send('voice-refine-hotkey-pressed');
  });

  const isRegistered = globalShortcut.isRegistered(hotkeyAccelerator);
  if (registered) {
    writeStoredHotkeyAccelerator(hotkeyAccelerator);
    // Both windows show the shortcut (overlay subtitle, main-window tip).
    overlayWindow?.webContents.send('recording-shortcut-changed', hotkeyAccelerator);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('recording-shortcut-changed', hotkeyAccelerator);
    }
    console.log(`[hotkey] Registered ${hotkeyAccelerator}`, { isRegistered });
    return { ok: true, accelerator: hotkeyAccelerator, isRegistered };
  }

  console.warn(`[hotkey] Failed to register ${hotkeyAccelerator}`, { isRegistered });
  const failedAccelerator = hotkeyAccelerator;
  if (previousAccelerator && previousAccelerator !== failedAccelerator) {
    hotkeyAccelerator = previousAccelerator;
    globalShortcut.register(previousAccelerator, () => {
      console.log(`[hotkey] ${previousAccelerator} pressed`);
      toggleRecordingOverlay();
      mainWindow?.webContents.send('voice-refine-hotkey-pressed');
    });
  }

  if (showDialog) void showHotkeyFailureDialog(failedAccelerator);
  return { ok: false, accelerator: hotkeyAccelerator, failedAccelerator, isRegistered: false };
}

function registerGlobalHotkeys() {
  registerRecordingHotkey(readStoredHotkeyAccelerator());
  // Esc is claimed only while the overlay is visible (see createOverlayWindow).
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  const verboseDiagnostics = !app.isPackaged || process.env.VOICEREFINE_VERBOSE_LOGS === '1';
  const logPath = initializeFileLogging(app.getPath('logs'), {
    includePrivateContent: verboseDiagnostics,
    captureRendererMessages: verboseDiagnostics,
  });
  console.log('[app] session started', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
    verboseDiagnostics,
    logPath,
  });
  installAppMenu();
  if (!await ensureTermsAccepted()) { app.quit(); return; }
  addCrossOriginHeaders();
  ipcMain.handle('request-microphone-access', async () => {
    if (process.platform !== 'darwin') return true;
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status === 'granted') return true;
    if (status === 'not-determined') return systemPreferences.askForMediaAccess('microphone');
    const options = {
      type: 'info', title: 'Microphone access needed',
      message: 'Enable InkCling in System Settings > Privacy & Security > Microphone, then restart InkCling.',
    };
    if (mainWindow && !mainWindow.isDestroyed()) {
      await dialog.showMessageBox(mainWindow, options);
    } else {
      await dialog.showMessageBox(options);
    }
    return false;
  });

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });

  // Renderer calls window.voicerefine.refineBuiltin(system, user)
  // which crosses the IPC bridge to here, runs Gemma inference, and returns the string.
  ipcMain.handle('refine-builtin', async (_event, system, user, options) => {
    return await refineBuiltin(system, user, options);
  });
  ipcMain.handle('warm-builtin', async () => {
    return await warmBuiltin();
  });
  ipcMain.handle('transcribe-native', async (_event, payload) => {
    return await transcribeNative({
      ...payload,
      model: payload?.model ?? selectedNativeAsrModel,
    });
  });
  ipcMain.handle('preload-native-asr-model', async (_event, payload) => {
    selectedNativeAsrModel = payload?.model ?? selectedNativeAsrModel;
    return await preloadNativeAsrModel({
      ...payload,
      model: selectedNativeAsrModel,
    });
  });
  ipcMain.handle('unload-native-asr-models', async (_event, payload) => {
    return await unloadNativeAsrModels(payload);
  });
  ipcMain.handle('get-selected-native-asr-model', async () => {
    return { model: selectedNativeAsrModel };
  });
  ipcMain.handle('set-selected-native-asr-model', async (_event, payload) => {
    selectedNativeAsrModel = payload?.model ?? selectedNativeAsrModel;
    return { model: selectedNativeAsrModel };
  });
  ipcMain.handle('paste-text-into-active-app', async (_event, text) => {
    return await pasteTextIntoActiveApp(text);
  });
  ipcMain.handle('get-recording-shortcut', async () => {
    return {
      accelerator: hotkeyAccelerator,
      defaultAccelerator: DEFAULT_HOTKEY_ACCELERATOR,
    };
  });
  ipcMain.handle('set-recording-shortcut', async (_event, accelerator) => {
    return registerRecordingHotkey(accelerator, { showDialog: false });
  });
  ipcMain.handle('get-overlay-recording-state', () => overlayRecording);
  ipcMain.handle('get-refinement-settings', async () => {
    return refinementSettings;
  });
  ipcMain.handle('set-refinement-settings', async (_event, settings) => {
    refinementSettings = {
      provider: settings?.provider ?? refinementSettings.provider,
      apiKey: settings?.apiKey ?? refinementSettings.apiKey,
      refinementMode: settings?.refinementMode === 'transform' ? 'transform'
        : settings?.refinementMode === 'clean' ? 'clean' : refinementSettings.refinementMode,
      transformPreset: DEFAULT_TRANSFORM_PRESET,
      transformPrompt: settings?.transformPrompt?.trim() || defaultPromptForPreset(DEFAULT_TRANSFORM_PRESET),
    };
    console.log('[settings] refinement updated', refinementSettings);
    return refinementSettings;
  });
  ipcMain.handle('get-dictation-history', () => dictationHistory().get());
  ipcMain.handle('record-dictation', (_event, dictation) => recordDictation({ ...dictation, source: 'app' }));
  ipcMain.handle('update-dictation', (_event, id, patch) => {
    const next = dictationHistory().update(id, patch);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dictation-history-updated', next);
    }
    return next;
  });
  ipcMain.handle('clear-dictation-history', () => {
    const next = dictationHistory().clear();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dictation-history-updated', next);
    }
    return next;
  });
  ipcMain.handle('quit-app', () => {
    app.quit();
  });
  ipcMain.handle('close-window', () => {
    mainWindow?.hide();
  });
  ipcMain.on('overlay-ready', () => {
    overlayReady = true;
    if (pendingOverlayCommand) {
      const command = pendingOverlayCommand;
      pendingOverlayCommand = null;
      sendOverlayCommand(command);
    }
  });
  ipcMain.on('overlay-recording-started', () => {
    overlayStarting = false;
    setOverlayRecording(true);
    overlayProcessing = false;
    console.log('[overlay] recording started');
  });
  ipcMain.on('overlay-recording-stopped', (_event, metadata) => {
    releaseRecordingAsrHold?.();
    releaseRecordingAsrHold = null;
    setOverlayRecording(false);
    overlayProcessing = true;
    console.log('[overlay] recording stopped', metadata);
  });
  ipcMain.on('overlay-transcription-complete', async (_event, payload) => {
    // If the session was cancelled (Esc) while transcription was still running,
    // overlayProcessing was already cleared, drop this stale result so we don't
    // paste unwanted text into whatever app now has focus.
    if (!overlayProcessing) {
      console.log('[overlay] dropping cancelled/stale transcription completion');
      return;
    }
    const completedSession = overlaySession;
    console.log('[overlay] transcription complete', payload);
    try {
      recordDictation({
        text: payload?.text,
        rawText: payload?.rawText,
        source: 'shortcut',
        refinementMode: payload?.refinementMode,
        transformPreset: payload?.transformPreset,
      });
      // Keep the review window in sync even when it is hidden.
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('overlay-transcription-result', payload);
      }
    } catch (err) {
      console.warn('[overlay] history update failed; continuing clipboard delivery', err);
    }
    if (!payload?.text?.trim()) {
      overlayProcessing = false;
      // Nothing was said. Leave "No speech detected" up briefly, paste nothing.
      console.log('[overlay] no speech detected; nothing to paste');
      setTimeout(() => {
        if (completedSession === overlaySession && !overlayStarting && !overlayRecording && !overlayProcessing) overlayWindow?.hide();
      }, OVERLAY_NOTICE_MS);
      return;
    }
    try {
      const result = await pasteTextIntoActiveApp(payload?.text);
      if (completedSession !== overlaySession) return;
      console.log('[overlay] transcript copied; paste shortcut sent', result);
      setTimeout(() => {
        if (completedSession === overlaySession && !overlayStarting && !overlayRecording && !overlayProcessing) overlayWindow?.hide();
      }, 350);
    } catch (err) {
      if (completedSession !== overlaySession) return;
      console.warn('[overlay] paste failed', err);
      overlayWindow?.webContents.send('overlay-command', 'paste-failed');
      setTimeout(() => {
        if (completedSession === overlaySession && !overlayStarting && !overlayRecording && !overlayProcessing) overlayWindow?.hide();
      }, OVERLAY_NOTICE_MS);
    } finally {
      if (completedSession === overlaySession) overlayProcessing = false;
    }
  });
  ipcMain.on('overlay-recording-failed', (_event, message) => {
    releaseRecordingAsrHold?.();
    releaseRecordingAsrHold = null;
    const failedSession = overlaySession;
    overlayStarting = false;
    setOverlayRecording(false);
    overlayProcessing = false;
    console.warn('[overlay] recording failed', message);
    setTimeout(() => {
      if (failedSession === overlaySession && !overlayStarting && !overlayRecording && !overlayProcessing) overlayWindow?.hide();
    }, OVERLAY_NOTICE_MS);
  });
  ipcMain.handle('check-cohere-model', () => {
    return { available: isCohereModelAvailable() };
  });
  ipcMain.handle('download-cohere-model', async (event) => {
    if (cohereDownloadActive) return { ok: false, reason: 'already-downloading' };
    cohereDownloadActive = true;

    const destDir = path.join(app.getPath('userData'), 'models', 'cohere-transcribe-03-2026-GGUF');
    const tempPath = path.join(destDir, 'cohere-transcribe-q4_k.gguf.part');
    const finalPath = path.join(destDir, 'cohere-transcribe-q4_k.gguf');

    let writeStream = null;
    try {
      await fs.promises.mkdir(destDir, { recursive: true });
      const response = await net.fetch(COHERE_DOWNLOAD.url);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      if (!response.body) throw new Error('Download returned no model data.');

      const total = parseInt(response.headers.get('content-length') || '0', 10);
      let downloaded = 0;
      const digest = createHash('sha256');
      writeStream = fs.createWriteStream(tempPath);
      const progress = new Transform({
        transform(chunk, _encoding, callback) {
          downloaded += chunk.length;
          digest.update(chunk);
          if (!event.sender.isDestroyed()) event.sender.send('cohere-download-progress', {
            percent: total > 0 ? Math.round((downloaded / total) * 100) : 0,
            downloaded, total,
          });
          callback(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(response.body), progress, writeStream);
      writeStream = null;
      verifyModelDownload(downloaded, digest.digest('hex'));
      await fs.promises.rename(tempPath, finalPath);
      console.log('[cohere-download] complete', { path: finalPath });
      return { ok: true };
    } catch (err) {
      console.warn('[cohere-download] failed', err);
      // Close the write handle and cancel the reader before deleting, on Windows
      // an open handle blocks unlink (EBUSY) and leaks the fd otherwise.
      if (writeStream && !writeStream.destroyed) {
        await new Promise(resolve => writeStream.end(() => resolve()));
      }
      await fs.promises.unlink(tempPath).catch(() => {});
      return { ok: false, reason: err.message };
    } finally {
      cohereDownloadActive = false;
    }
  });

  createWindow();
  createOverlayWindow();
  registerGlobalHotkeys();

  app.on('activate', () => {
    // Native activation during dictation must not focus the journal window.
    if (overlayStarting || overlayRecording || overlayProcessing) return;
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  clearUnloadTimer();
  void unloadBuiltinModel();
  void shutdownNativeAsrModels().catch(err => console.warn('[asr-native] shutdown failed', err));
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
