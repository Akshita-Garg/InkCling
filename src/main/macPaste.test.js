import { describe, expect, it, vi } from 'vitest';
import { pasteToMacTarget, readFrontmostMacApp } from './macPaste.js';

describe('macOS dictation paste focus', () => {
  const target = { pid: 123, bundleId: 'com.example.editor' };

  it('does not reactivate the app that already owns the text cursor', async () => {
    const exec = vi.fn().mockResolvedValue({});
    const wait = vi.fn();
    await pasteToMacTarget(target, { execFileAsync: exec, readFrontmost: async () => target, wait });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls[0][1].join(' ')).toContain('keystroke "v"');
    expect(exec.mock.calls[0][1].join(' ')).toContain('unix id of first application process whose frontmost is true');
    expect(wait).not.toHaveBeenCalled();
  });

  it('restores the captured process before pasting, even with a shared bundle id', async () => {
    const exec = vi.fn().mockResolvedValue({});
    const front = vi.fn().mockResolvedValueOnce({ ...target, pid: 456 }).mockResolvedValueOnce(target);
    await pasteToMacTarget(target, { execFileAsync: exec, readFrontmost: front, wait: async () => {} });
    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec.mock.calls[0][1].join(' ')).toContain('unix id is 123');
    expect(exec.mock.calls[0][1].join(' ')).not.toContain('keystroke');
    expect(exec.mock.calls[1][1].join(' ')).toContain('keystroke');
  });

  it('never sends paste if the target cannot regain focus', async () => {
    const exec = vi.fn().mockResolvedValue({});
    await expect(pasteToMacTarget(target, {
      execFileAsync: exec, readFrontmost: async () => ({ pid: 456 }), wait: async () => {},
    })).rejects.toThrow('Could not return');
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls[0][1].join(' ')).not.toContain('keystroke');
  });

  it('uses clipboard fallback when no target was captured', async () => {
    const exec = vi.fn();
    await expect(pasteToMacTarget(null, { execFileAsync: exec })).rejects.toThrow('identify');
    expect(exec).not.toHaveBeenCalled();
  });

  it('does not paste a dictation cancelled during focus lookup', async () => {
    let cancelled = false;
    const exec = vi.fn();
    await expect(pasteToMacTarget(target, {
      execFileAsync: exec,
      readFrontmost: async () => { cancelled = true; return target; },
      isCancelled: () => cancelled,
    })).rejects.toThrow('cancelled');
    expect(exec).not.toHaveBeenCalled();
  });

  it('propagates a last-moment foreground change instead of claiming paste success', async () => {
    await expect(pasteToMacTarget(target, {
      execFileAsync: vi.fn().mockRejectedValue(new Error('Typing app lost focus before paste')),
      readFrontmost: async () => target,
    })).rejects.toThrow('lost focus');
  });

  it('captures process identity without relying on the bundle id alone', async () => {
    await expect(readFrontmostMacApp(async () => ({ stdout: JSON.stringify(target) }))).resolves.toEqual(target);
    await expect(readFrontmostMacApp(async () => ({ stdout: '{"pid":null}' }))).rejects.toThrow('No active');
  });
});
