import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sherpa = require('sherpa-onnx-node')
const modelDir = path.resolve('resources/models/sherpa-onnx-whisper-tiny.en')
const wavPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(modelDir, 'test_wavs', '0.wav')

function readPcm16Wav(filePath) {
  const wav = fs.readFileSync(filePath)
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Not a RIFF/WAVE file: ${filePath}`)
  }

  let offset = 12
  let sampleRate = 0
  let channels = 0
  let bitsPerSample = 0
  let data = null

  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    const start = offset + 8
    if (id === 'fmt ') {
      if (wav.readUInt16LE(start) !== 1) throw new Error('Only PCM WAV input is supported')
      channels = wav.readUInt16LE(start + 2)
      sampleRate = wav.readUInt32LE(start + 4)
      bitsPerSample = wav.readUInt16LE(start + 14)
    } else if (id === 'data') {
      data = wav.subarray(start, start + size)
    }
    offset = start + size + (size % 2)
  }

  if (!data || !sampleRate || channels !== 1 || bitsPerSample !== 16) {
    throw new Error('Expected a mono 16-bit PCM WAV file')
  }

  const samples = new Float32Array(data.length / 2)
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = data.readInt16LE(index * 2) / 32768
  }
  return { samples, sampleRate }
}

const recognizer = await sherpa.OfflineRecognizer.createAsync({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: {
    whisper: {
      encoder: path.join(modelDir, 'tiny.en-encoder.int8.onnx'),
      decoder: path.join(modelDir, 'tiny.en-decoder.int8.onnx'),
      language: 'en',
      task: 'transcribe',
      tailPaddings: -1,
    },
    tokens: path.join(modelDir, 'tiny.en-tokens.txt'),
    numThreads: 4,
    debug: false,
    provider: 'cpu',
  },
})

const stream = recognizer.createStream()
stream.acceptWaveform(readPcm16Wav(wavPath))
const result = await recognizer.decodeAsync(stream)

if (!result.text?.trim()) throw new Error('Quick ASR returned an empty transcript')
console.log(result.text.trim())
