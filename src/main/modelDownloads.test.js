import { describe, it, expect } from 'vitest';
import { COHERE_DOWNLOAD, verifyModelDownload } from './modelDownloads.js';

describe('downloaded model integrity', () => {
  it('accepts the pinned release payload', () => {
    expect(() => verifyModelDownload(COHERE_DOWNLOAD.bytes, COHERE_DOWNLOAD.sha256)).not.toThrow();
  });
  it('rejects a truncated download even with a supplied correct digest', () => {
    expect(() => verifyModelDownload(COHERE_DOWNLOAD.bytes - 1, COHERE_DOWNLOAD.sha256)).toThrow('corrupted');
  });
  it('rejects a same-size wrong model before it replaces the installed model', () => {
    expect(() => verifyModelDownload(COHERE_DOWNLOAD.bytes, '0'.repeat(64))).toThrow('corrupted');
  });
});
