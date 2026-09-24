export const NATIVE_ASR_ENGINE = 'sherpa-onnx-node';
export const NATIVE_ASR_MODEL_FAST = 'fast';
export const NATIVE_ASR_MODEL_PARAKEET_Q4 = 'parakeet-q4';
export const NATIVE_ASR_MODEL_COHERE_Q4 = 'cohere-q4';
export const PARAKEET_Q4_RUNTIME_SERVER = 'server';
const DEFAULT_NATIVE_ASR_MODEL = NATIVE_ASR_MODEL_PARAKEET_Q4;

function normalizeNativeAsrModel(model) {
  if (model === NATIVE_ASR_MODEL_FAST) return NATIVE_ASR_MODEL_FAST;
  if (model === NATIVE_ASR_MODEL_PARAKEET_Q4) return NATIVE_ASR_MODEL_PARAKEET_Q4;
  if (model === NATIVE_ASR_MODEL_COHERE_Q4) return NATIVE_ASR_MODEL_COHERE_Q4;
  return DEFAULT_NATIVE_ASR_MODEL;
}

export function currentNativeAsrModel() {
  const stored = globalThis.localStorage?.getItem('vr_native_asr_model');
  return normalizeNativeAsrModel(stored);
}

export async function selectedNativeAsrModel() {
  const result = await window.voicerefine?.getSelectedNativeAsrModel?.();
  return normalizeNativeAsrModel(result?.model ?? currentNativeAsrModel());
}

export async function syncSelectedNativeAsrModel(model = currentNativeAsrModel()) {
  const normalized = normalizeNativeAsrModel(model);
  await window.voicerefine?.setSelectedNativeAsrModel?.({ model: normalized });
  return normalized;
}

export async function preloadNativeAsrModel(model = currentNativeAsrModel()) {
  if (!window.voicerefine?.preloadNativeAsrModel) {
    throw new Error('Native ASR preload bridge is unavailable.');
  }

  const normalizedModel = normalizeNativeAsrModel(model);
  const startedAt = performance.now();
  const result = await window.voicerefine.preloadNativeAsrModel({
    model: normalizedModel,
    parakeetQ4Runtime: PARAKEET_Q4_RUNTIME_SERVER,
  });
  console.log('[asr] native model preload complete', {
    model: result.model,
    parakeetQ4Runtime: PARAKEET_Q4_RUNTIME_SERVER,
    totalMs: Math.round(performance.now() - startedAt),
  });
  return result;
}

export async function unloadNativeAsrModels(except = null) {
  if (!window.voicerefine?.unloadNativeAsrModels) {
    throw new Error('Native ASR unload bridge is unavailable.');
  }

  return await window.voicerefine.unloadNativeAsrModels({ except });
}

function now() {
  return globalThis.performance?.now ? globalThis.performance.now() : Date.now();
}

async function decodeAudioBlob(blob) {
  const startedAt = now();
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();

  console.log('[asr] audio decoded', {
    engine: NATIVE_ASR_ENGINE,
    bytes: blob.size,
    mimeType: blob.type,
    durationMs: Math.round(now() - startedAt),
    audioSeconds: Number(audioBuffer.duration.toFixed(2)),
    sampleRate: audioBuffer.sampleRate,
  });

  return {
    samples: audioBuffer.getChannelData(0),
    sampleRate: audioBuffer.sampleRate,
  };
}

export async function transcribe(blob) {
  if (!window.voicerefine?.transcribeNative) {
    throw new Error('Native ASR bridge is unavailable.');
  }

  const startedAt = performance.now();
  const audio = await decodeAudioBlob(blob);
  const model = await selectedNativeAsrModel();
  const result = await window.voicerefine.transcribeNative({
    samples: audio.samples,
    sampleRate: audio.sampleRate,
    model,
    parakeetQ4Runtime: PARAKEET_Q4_RUNTIME_SERVER,
  });

  console.log('[asr] native transcription complete', {
    engine: NATIVE_ASR_ENGINE,
    model: result.model,
    parakeetQ4Runtime: PARAKEET_Q4_RUNTIME_SERVER,
    totalMs: Math.round(performance.now() - startedAt),
    chars: result.text.length,
  });

  return result.text;
}
