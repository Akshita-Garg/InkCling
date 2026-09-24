import { app } from 'electron';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createAsrLifecycle } from './asrLifecycle.js';

const require = createRequire(import.meta.url);

const NATIVE_MODEL_FAST = 'fast';
const NATIVE_MODEL_PARAKEET_Q4 = 'parakeet-q4';
const NATIVE_MODEL_COHERE_Q4 = 'cohere-q4';
const PARAKEET_Q4_RUNTIME_SERVER = 'server';
const recognizers = new Map();
const recognizerPromises = new Map();
let crispServer = null;
let crispServerPromise = null;
const lifecycle = createAsrLifecycle({
  unload: async reason => {
    console.log('[asr-native] unloading runtime', { reason });
    await disposeNativeAsrModels();
    console.log('[asr-native] runtime unloaded');
  },
  onError: err => console.warn('[asr-native] idle unload failed', err),
});

export const holdNativeAsrModels = () => lifecycle.hold();
export const shutdownNativeAsrModels = () => lifecycle.shutdown();

function now() {
  return performance.now();
}

async function captureDevelopmentRecording(samples, sampleRate, nativeModel) {
  if (app.isPackaged && process.env.VOICEREFINE_CAPTURE_AUDIO !== '1') return null;
  const captureDirectory = path.join(app.getPath('logs'), 'recordings');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const capturePath = path.join(captureDirectory, `${timestamp}-${nativeModel}.wav`);
  await fs.promises.mkdir(captureDirectory, { recursive: true });
  await fs.promises.writeFile(capturePath, createWavBuffer(samples, sampleRate));
  console.log('[asr] development recording saved', {
    path: capturePath,
    nativeModel,
    sampleRate,
    samples: samples.length,
    audioSeconds: Number((samples.length / sampleRate).toFixed(2)),
  });
  return capturePath;
}

function getModelRoot() {
  if (app.isPackaged) return process.resourcesPath;
  return path.join(app.getAppPath(), 'resources', 'models');
}

function getBinRoot() {
  if (app.isPackaged) return process.resourcesPath;
  return path.join(app.getAppPath(), 'resources', 'bin');
}

function getWhisperModelDir() {
  if (process.env.VOICEREFINE_SHERPA_MODEL_DIR) {
    return process.env.VOICEREFINE_SHERPA_MODEL_DIR;
  }

  return path.join(getModelRoot(), 'sherpa-onnx-whisper-tiny.en');
}

function getCohereQ4ModelPath() {
  if (process.env.VOICEREFINE_CRISPASR_COHERE_MODEL) {
    return process.env.VOICEREFINE_CRISPASR_COHERE_MODEL;
  }

  const userDataPath = path.join(app.getPath('userData'), 'models', 'cohere-transcribe-03-2026-GGUF', 'cohere-transcribe-q4_k.gguf');
  if (fs.existsSync(userDataPath)) return userDataPath;
  return path.join(getModelRoot(), 'cohere-transcribe-03-2026-GGUF', 'cohere-transcribe-q4_k.gguf');
}

export function isCohereModelAvailable() {
  return fs.existsSync(getCohereQ4ModelPath());
}

function getParakeetQ4ModelPath() {
  if (process.env.VOICEREFINE_CRISPASR_PARAKEET_MODEL) {
    return process.env.VOICEREFINE_CRISPASR_PARAKEET_MODEL;
  }

  return path.join(getModelRoot(), 'parakeet-tdt-0.6b-v3-GGUF', 'parakeet-tdt-0.6b-v3-q4_k.gguf');
}

function getCrispAsrServerPort() {
  return Math.max(1, Number(process.env.VOICEREFINE_CRISPASR_PORT || 51234));
}

function getCrispAsrPath() {
  if (process.env.VOICEREFINE_CRISPASR_BIN) {
    return process.env.VOICEREFINE_CRISPASR_BIN;
  }

  const exeName = process.platform === 'win32' ? 'crispasr.exe' : 'crispasr';
  if (process.platform === 'win32') {
    return path.join(
      getBinRoot(),
      'crispasr-windows-x86_64-cpu',
      'crispasr-windows-x86_64-cpu',
      exeName,
    );
  }

  return path.join(getBinRoot(), 'crispasr', exeName);
}

function requireModelFile(modelDir, filenameOrFilenames) {
  const filenames = Array.isArray(filenameOrFilenames) ? filenameOrFilenames : [filenameOrFilenames];
  for (const filename of filenames) {
    const filePath = path.join(modelDir, filename);
    if (fs.existsSync(filePath)) return filePath;
  }

  const filename = filenames.join(' or ');
  const filePath = path.join(modelDir, filename);
  throw new Error(`Sherpa ASR model file missing: ${filePath}`);
}

function createWhisperTinyEnglishConfig(modelDir) {
  const precision = process.env.VOICEREFINE_SHERPA_PRECISION === 'fp32' ? 'fp32' : 'int8';
  const modelSuffix = precision === 'int8' ? '.int8' : '';

  return {
    featConfig: {
      sampleRate: 16000,
      featureDim: 80,
    },
    modelConfig: {
      whisper: {
        encoder: requireModelFile(modelDir, `tiny.en-encoder${modelSuffix}.onnx`),
        decoder: requireModelFile(modelDir, `tiny.en-decoder${modelSuffix}.onnx`),
        language: 'en',
        task: 'transcribe',
        tailPaddings: -1,
      },
      tokens: requireModelFile(modelDir, 'tiny.en-tokens.txt'),
      numThreads: Math.max(1, Number(process.env.VOICEREFINE_SHERPA_THREADS || 4)),
      debug: false,
      provider: 'cpu',
    },
  };
}

function normalizeNativeModel(model) {
  if (model === NATIVE_MODEL_PARAKEET_Q4) return NATIVE_MODEL_PARAKEET_Q4;
  if (model === NATIVE_MODEL_COHERE_Q4) return NATIVE_MODEL_COHERE_Q4;
  return NATIVE_MODEL_FAST;
}

function getModelConfig(model) {
  return {
    label: 'whisper-tiny-en-int8',
    modelDir: getWhisperModelDir(),
    config: createWhisperTinyEnglishConfig,
  };
}

function createWavBuffer(samples, sampleRate) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(8 * bytesPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    buffer.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7fff, 44 + index * bytesPerSample);
  }

  return buffer;
}

function cleanCrispAsrOutput(stdout) {
  return stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function waitForPort(port, child, timeoutMs = 15000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child?.removeListener('exit', handleExit);
      callback(value);
    };

    const handleExit = (code, signal) => {
      finish(reject, new Error(`CrispASR server exited before becoming ready: code=${code} signal=${signal}`));
    };

    child?.once('exit', handleExit);

    const attempt = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        finish(resolve);
      });
      socket.once('error', () => {
        socket.destroy();
        if (settled) return;
        if (Date.now() - startedAt > timeoutMs) {
          finish(reject, new Error(`CrispASR server did not become ready on port ${port}`));
          return;
        }
        timer = setTimeout(attempt, 250);
      });
    };

    attempt();
  });
}

function getCrispServerConfig(model) {
  if (model === NATIVE_MODEL_PARAKEET_Q4) {
    return {
      nativeModel: NATIVE_MODEL_PARAKEET_Q4,
      backend: 'parakeet',
      modelPath: getParakeetQ4ModelPath(),
    };
  }

  return {
    nativeModel: NATIVE_MODEL_COHERE_Q4,
    backend: 'cohere',
    modelPath: getCohereQ4ModelPath(),
  };
}

async function startCrispAsrServer(model) {
  const config = getCrispServerConfig(model);
  // A spawned process is not ready until its startup promise has resolved.
  if (crispServerPromise) await crispServerPromise;
  if (crispServer?.process && !crispServer.process.killed && crispServer.nativeModel === config.nativeModel) {
    return crispServer;
  }
  if (crispServer?.process && crispServer.nativeModel !== config.nativeModel) {
    await stopCrispAsrServer();
  }
  if (crispServer?.process && !crispServer.process.killed) return crispServer;
  if (crispServerPromise) return await crispServerPromise;

  crispServerPromise = (async () => {
    const startedAt = now();
    const binPath = getCrispAsrPath();
    const port = getCrispAsrServerPort();

    if (!fs.existsSync(binPath)) throw new Error(`CrispASR binary missing: ${binPath}`);
    if (!fs.existsSync(config.modelPath)) throw new Error(`CrispASR model missing: ${config.modelPath}`);

    const child = spawn(binPath, [
      '--server',
      '--backend', config.backend,
      '--model', config.modelPath,
      '--language', 'en',
      '--threads', String(Math.max(1, Number(process.env.VOICEREFINE_CRISPASR_THREADS || 8))),
      '--host', '127.0.0.1',
      '--port', String(port),
      '--no-prints',
      '--no-timestamps',
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', chunk => {
      const message = chunk.toString().trim();
      if (message) console.log('[asr-crisp-server]', message);
    });
    child.stderr?.on('data', chunk => {
      const message = chunk.toString().trim();
      if (message) console.warn('[asr-crisp-server]', message);
    });
    child.once('exit', (code, signal) => {
      console.log('[asr-crisp-server] exited', { code, signal });
      if (crispServer?.process === child) crispServer = null;
    });

    crispServer = { process: child, port, nativeModel: config.nativeModel };
    await waitForPort(port, child, Number(process.env.VOICEREFINE_CRISPASR_START_TIMEOUT_MS || 15000));

    console.log('[asr-crisp-server] ready', {
      nativeModel: config.nativeModel,
      backend: config.backend,
      port,
      durationMs: Math.round(now() - startedAt),
    });

    return crispServer;
  })();

  try {
    return await crispServerPromise;
  } catch (err) {
    await stopCrispAsrServer();
    throw err;
  } finally {
    crispServerPromise = null;
  }
}

async function stopCrispAsrServer() {
  const server = crispServer;
  crispServer = null;

  if (!server?.process || server.process.killed) return;

  console.log('[asr-crisp-server] stopping');
  // Await the child's exit (escalating to SIGKILL) before returning so a
  // subsequent startCrispAsrServer doesn't race the dying process for the port.
  const child = server.process;
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      finish();
    }, 3000);
    child.once('exit', finish);
    try { child.kill(); } catch { finish(); }
  });
}

function parseCrispServerResponse(body, contentType) {
  const text = body.trim();
  if (!text) return '';

  if (contentType.includes('application/json') || text.startsWith('{')) {
    try {
      const json = JSON.parse(text);
      const parsed = json.text ?? json.transcription ?? json.result;
      // Don't fall back to the raw JSON body, an unexpected shape (e.g. an
      // error object) would otherwise get pasted as if it were the transcript.
      return typeof parsed === 'string' ? parsed.trim() : '';
    } catch {
      return text;
    }
  }

  return cleanCrispAsrOutput(text);
}

async function postToCrispServer(server, wavBuffer) {
  const endpoints = ['/v1/audio/transcriptions', '/inference'];
  // Without a timeout, a server that accepts the connection but stalls mid-
  // inference would leave transcribe() pending forever (UI stuck on "Transcribing").
  const timeoutMs = Number(process.env.VOICEREFINE_CRISPASR_TIMEOUT_MS || 180000);
  let lastError = null;

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const form = new FormData();
      form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'recording.wav');
      form.append('language', 'en');

      const response = await fetch(`http://127.0.0.1:${server.port}${endpoint}`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      const body = await response.text();

      if (!response.ok) {
        lastError = new Error(`CrispASR server ${endpoint} failed: ${response.status} ${body}`);
        continue;
      }

      return parseCrispServerResponse(body, response.headers.get('content-type') ?? '');
    } catch (err) {
      lastError = err.name === 'AbortError'
        ? new Error(`CrispASR server ${endpoint} timed out after ${timeoutMs}ms`)
        : err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error('CrispASR server transcription failed.');
}

async function transcribeWithCrispAsrServer(samples, sampleRate, nativeModel, startedAt = now()) {
  const wavBuffer = createWavBuffer(samples, sampleRate);

  try {
    const server = await startCrispAsrServer(nativeModel);
    const inferenceStartedAt = now();
    const text = await postToCrispServer(server, wavBuffer);

    console.log('[asr-crisp] transcription complete', {
      engine: 'crispasr-server',
      nativeModel,
      runtime: PARAKEET_Q4_RUNTIME_SERVER,
      audioSeconds: Number((samples.length / sampleRate).toFixed(2)),
      inferenceMs: Math.round(now() - inferenceStartedAt),
      totalMs: Math.round(now() - startedAt),
      chars: text.length,
    });

    return {
      text,
      engine: 'crispasr-server',
      model: nativeModel,
      runtime: PARAKEET_Q4_RUNTIME_SERVER,
    };
  } catch (err) {
    console.warn('[asr-crisp] server transcription failed', err);
    throw err;
  }
}

async function unloadSherpaRecognizer(model) {
  const nativeModel = normalizeNativeModel(model);
  recognizerPromises.delete(nativeModel);
  const recognizer = recognizers.get(nativeModel);
  recognizers.delete(nativeModel);

  if (!recognizer) return false;

  recognizer.dispose?.();
  recognizer.free?.();
  recognizer.close?.();
  if (global.gc) global.gc();

  console.log('[asr-native] recognizer unloaded', { nativeModel });
  return true;
}

async function disposeNativeAsrModels({ except, keepCrispServer = false } = {}) {
  const keepModel = except ? normalizeNativeModel(except) : null;
  const unloaded = [];

  for (const model of Array.from(recognizers.keys())) {
    if (model === keepModel) continue;
    if (await unloadSherpaRecognizer(model)) unloaded.push(model);
  }

  if (!keepCrispServer) {
    await stopCrispAsrServer();
  }

  return { unloaded, kept: keepModel, crispServerKept: keepCrispServer && !!crispServer };
}

export function unloadNativeAsrModels(options) {
  return lifecycle.run(() => disposeNativeAsrModels(options));
}

export function preloadNativeAsrModel(options) {
  return lifecycle.run(() => prepareNativeAsrModel(options));
}

async function prepareNativeAsrModel({ model, parakeetQ4Runtime } = {}) {
  const nativeModel = normalizeNativeModel(model);
  const usesCrispServer = nativeModel === NATIVE_MODEL_PARAKEET_Q4
    || nativeModel === NATIVE_MODEL_COHERE_Q4;
  const parakeetRuntime = nativeModel === NATIVE_MODEL_PARAKEET_Q4
    ? PARAKEET_Q4_RUNTIME_SERVER
    : null;
  const startedAt = now();

  await disposeNativeAsrModels({
    except: nativeModel,
    keepCrispServer: usesCrispServer,
  });

  if (usesCrispServer) {
    await startCrispAsrServer(nativeModel);
  } else {
    await getRecognizer(nativeModel);
  }

  return {
    model: nativeModel,
    parakeetQ4Runtime: parakeetRuntime,
    durationMs: Math.round(now() - startedAt),
    loaded: Array.from(recognizers.keys()),
    crispServerReady: !!crispServer,
  };
}

async function getRecognizer(model) {
  const nativeModel = normalizeNativeModel(model);
  if (recognizers.has(nativeModel)) return recognizers.get(nativeModel);
  if (recognizerPromises.has(nativeModel)) return await recognizerPromises.get(nativeModel);

  const promise = (async () => {
    const startedAt = now();
    const modelConfig = getModelConfig(nativeModel);
    const sherpa = require('sherpa-onnx-node');
    const nextRecognizer = await sherpa.OfflineRecognizer.createAsync(
      modelConfig.config(modelConfig.modelDir),
    );

    console.log('[asr-native] recognizer ready', {
      engine: 'sherpa-onnx-node',
      nativeModel,
      model: modelConfig.label,
      modelDir: modelConfig.modelDir,
      precision: process.env.VOICEREFINE_SHERPA_PRECISION === 'fp32' ? 'fp32' : 'int8',
      durationMs: Math.round(now() - startedAt),
    });

    recognizers.set(nativeModel, nextRecognizer);
    return nextRecognizer;
  })();

  recognizerPromises.set(nativeModel, promise);

  try {
    return await promise;
  } finally {
    recognizerPromises.delete(nativeModel);
  }
}

export function transcribeNative(payload) {
  return lifecycle.run(async () => {
    const startedAt = now();
    await prepareNativeAsrModel(payload);
    return await transcribeWithLoadedModel(payload, startedAt);
  });
}

async function transcribeWithLoadedModel({ samples, sampleRate, model, parakeetQ4Runtime }, startedAt) {
  const nativeModel = normalizeNativeModel(model);
  const typedSamples = samples instanceof Float32Array ? samples : new Float32Array(samples);
  await captureDevelopmentRecording(typedSamples, sampleRate, nativeModel);

  if (nativeModel === NATIVE_MODEL_PARAKEET_Q4 || nativeModel === NATIVE_MODEL_COHERE_Q4) {
    return await transcribeWithCrispAsrServer(typedSamples, sampleRate, nativeModel, startedAt);
  }

  const currentRecognizer = await getRecognizer(nativeModel);
  const stream = currentRecognizer.createStream();

  stream.acceptWaveform({
    samples: typedSamples,
    sampleRate,
  });

  const inferenceStartedAt = now();
  const result = await currentRecognizer.decodeAsync(stream);
  const text = (result?.text ?? '').trim();

  console.log('[asr-native] transcription complete', {
    engine: 'sherpa-onnx-node',
    nativeModel,
    audioSeconds: Number((typedSamples.length / sampleRate).toFixed(2)),
    modelWaitMs: Math.round(inferenceStartedAt - startedAt),
    inferenceMs: Math.round(now() - inferenceStartedAt),
    totalMs: Math.round(now() - startedAt),
    chars: text.length,
  });

  return {
    text,
    engine: 'sherpa-onnx-node',
    model: nativeModel,
  };
}
