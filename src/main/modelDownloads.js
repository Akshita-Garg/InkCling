export const COHERE_DOWNLOAD = Object.freeze({
  url: 'https://github.com/Akshita-Garg/InkCling/releases/download/inkcling-v1.0.0/cohere-transcribe-q4_k.gguf',
  bytes: 1510362752,
  sha256: '2931fc0ac6d6708eef5389aadf1ebd5eec7b8e764bac385be585e910c0e7b410',
});

export function verifyModelDownload(bytes, sha256, expected = COHERE_DOWNLOAD) {
  if (bytes !== expected.bytes || sha256 !== expected.sha256) {
    throw new Error('Model download was incomplete or corrupted. Please retry.');
  }
}
