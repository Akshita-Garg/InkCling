import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASR_IDLE_TIMEOUT_MS, createAsrLifecycle } from './asrLifecycle.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('ASR model lifetime', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('unloads 30 minutes after startup preload and resets after transcription', async () => {
    const unload = vi.fn();
    const runtime = createAsrLifecycle({ unload });
    await runtime.run(async () => 'loaded');
    await vi.advanceTimersByTimeAsync(ASR_IDLE_TIMEOUT_MS - 1);
    expect(unload).not.toHaveBeenCalled();
    await runtime.run(async () => 'transcribed');
    await vi.advanceTimersByTimeAsync(ASR_IDLE_TIMEOUT_MS - 1);
    expect(unload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(unload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(ASR_IDLE_TIMEOUT_MS);
    expect(unload).toHaveBeenCalledTimes(1);
  });

  it('keeps the model throughout a long recording and releases after cancellation', async () => {
    const unload = vi.fn();
    const runtime = createAsrLifecycle({ unload });
    await runtime.run(async () => {});
    const release = runtime.hold();
    await vi.advanceTimersByTimeAsync(2 * ASR_IDLE_TIMEOUT_MS);
    expect(unload).not.toHaveBeenCalled();
    release();
    release(); // Duplicate cancellation must not corrupt the hold count.
    await vi.advanceTimersByTimeAsync(ASR_IDLE_TIMEOUT_MS);
    expect(unload).toHaveBeenCalledTimes(1);
  });

  it.each(['loading', 'transcription'])('never unloads during %s', async () => {
    const unload = vi.fn();
    const runtime = createAsrLifecycle({ unload });
    const work = deferred();
    const result = runtime.run(() => work.promise);
    await vi.advanceTimersByTimeAsync(2 * ASR_IDLE_TIMEOUT_MS);
    expect(unload).not.toHaveBeenCalled();
    work.resolve();
    await result;
    await vi.advanceTimersByTimeAsync(ASR_IDLE_TIMEOUT_MS);
    expect(unload).toHaveBeenCalledTimes(1);
  });

  it('waits for a cold preload before transcribing a very short recording', async () => {
    const runtime = createAsrLifecycle({ unload: vi.fn() });
    const loading = deferred();
    const events = [];
    const warm = runtime.run(async () => { await loading.promise; events.push('loaded'); });
    const transcribe = runtime.run(() => events.push('transcribed'));
    await Promise.resolve();
    expect(events).toEqual([]);
    loading.resolve();
    await Promise.all([warm, transcribe]);
    expect(events).toEqual(['loaded', 'transcribed']);
  });

  it('finishes disposing the old model before reloading after expiry', async () => {
    const disposing = deferred();
    const unload = vi.fn(() => disposing.promise);
    const runtime = createAsrLifecycle({ unload });
    await runtime.run(async () => {});
    await vi.advanceTimersByTimeAsync(ASR_IDLE_TIMEOUT_MS);
    expect(unload).toHaveBeenCalledTimes(1);
    const release = runtime.hold();
    const load = vi.fn();
    const warm = runtime.run(load);
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    disposing.resolve();
    await warm;
    expect(load).toHaveBeenCalledTimes(1);
    release();
  });

  it('cancels an expiry that has fired but has not yet begun disposal', async () => {
    const unload = vi.fn();
    const runtime = createAsrLifecycle({ unload });
    await runtime.run(async () => {});
    vi.advanceTimersByTime(ASR_IDLE_TIMEOUT_MS);
    const release = runtime.hold();
    await Promise.resolve();
    expect(unload).not.toHaveBeenCalled();
    release();
    await vi.advanceTimersByTimeAsync(ASR_IDLE_TIMEOUT_MS);
    expect(unload).toHaveBeenCalledTimes(1);
  });

  it('serializes model switches behind active transcription and recovers from load errors', async () => {
    const runtime = createAsrLifecycle({ unload: vi.fn() });
    const active = deferred();
    const transcribe = runtime.run(() => active.promise);
    const switchModel = vi.fn();
    const switching = runtime.run(switchModel);
    await Promise.resolve();
    expect(switchModel).not.toHaveBeenCalled();
    active.resolve();
    await Promise.all([transcribe, switching]);
    await expect(runtime.run(async () => { throw new Error('load failed'); })).rejects.toThrow('load failed');
    await expect(runtime.run(async () => 'retry succeeded')).resolves.toBe('retry succeeded');
  });

  it('clears idle timers on shutdown and rejects new model work', async () => {
    const unload = vi.fn();
    const runtime = createAsrLifecycle({ unload });
    await runtime.run(async () => {});
    await runtime.shutdown();
    await vi.advanceTimersByTimeAsync(2 * ASR_IDLE_TIMEOUT_MS);
    expect(unload).toHaveBeenCalledTimes(1);
    await expect(runtime.run(async () => {})).rejects.toThrow('shutting down');
  });
});
