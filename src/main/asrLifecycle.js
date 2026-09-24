export const ASR_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// Serialize loading, switching, transcription and disposal. Recording itself
// holds a lease, so even a long recording cannot lose its warmed model.
export function createAsrLifecycle({ unload, idleMs = ASR_IDLE_TIMEOUT_MS, onError = console.warn }) {
  let queue = Promise.resolve();
  let pending = 0;
  let holds = 0;
  let timer = null;
  let generation = 0;
  let closed = false;

  function clearTimer() {
    generation += 1;
    clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    clearTimer();
    if (closed || pending || holds) return;
    const scheduledGeneration = generation;
    timer = setTimeout(() => {
      timer = null;
      // Join the same queue as model operations. A new recording can invalidate
      // this expiry before it starts; if disposal already started, loading waits.
      const result = queue.then(async () => {
        if (closed || pending || holds || scheduledGeneration !== generation) return;
        await unload('idle');
      });
      queue = result.catch(onError);
    }, idleMs);
    timer.unref?.();
  }

  function run(operation) {
    if (closed) return Promise.reject(new Error('ASR runtime is shutting down'));
    clearTimer();
    pending += 1;
    const result = queue.then(operation).finally(() => {
      pending -= 1;
      schedule();
    });
    queue = result.catch(() => {});
    return result;
  }

  function hold() {
    if (closed) return () => {};
    clearTimer();
    holds += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holds -= 1;
      schedule();
    };
  }

  function shutdown() {
    if (closed) return queue;
    closed = true;
    clearTimer();
    queue = queue.then(() => unload('shutdown'));
    return queue;
  }

  return { run, hold, shutdown };
}
