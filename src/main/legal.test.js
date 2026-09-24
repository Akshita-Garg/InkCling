import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  app: { isPackaged: true, getPath: () => '/profile', getAppPath: () => '/project' },
  readFileSync: vi.fn(), writeFileSync: vi.fn(), mkdirSync: vi.fn(),
  showMessageBox: vi.fn(), openPath: vi.fn().mockResolvedValue(''),
}));
vi.mock('electron', () => ({ app: mocks.app, dialog: {showMessageBox:mocks.showMessageBox}, shell:{openPath:mocks.openPath}, Menu:{} }));
vi.mock('node:fs', () => ({ default: { readFileSync:mocks.readFileSync, writeFileSync:mocks.writeFileSync, mkdirSync:mocks.mkdirSync } }));
import { ensureTermsAccepted, TERMS_VERSION } from './legal.js';

describe('release first-launch terms', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.app.isPackaged = true;
    process.resourcesPath = '/resources';
    mocks.readFileSync.mockImplementation(file => {
      if (file.endsWith('terms-acceptance.json')) throw new Error('not found');
      return 'Terms of use';
    });
  });
  it('does not record acceptance when the user quits', async () => {
    mocks.showMessageBox.mockResolvedValue({response:3});
    expect(await ensureTermsAccepted()).toBe(false);
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });
  it('records versioned acceptance only after explicit agreement', async () => {
    mocks.showMessageBox.mockResolvedValue({response:0});
    expect(await ensureTermsAccepted()).toBe(true);
    expect(JSON.parse(mocks.writeFileSync.mock.calls[0][1]).version).toBe(TERMS_VERSION);
    expect(mocks.showMessageBox.mock.calls[0][0].defaultId).toBe(3);
  });
  it('opening privacy does not accept the terms', async () => {
    mocks.showMessageBox.mockResolvedValueOnce({response:2}).mockResolvedValueOnce({response:3});
    expect(await ensureTermsAccepted()).toBe(false);
    expect(mocks.openPath).toHaveBeenCalledWith('/resources/notices/PRIVACY.txt');
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });
  it('does not ask again for the accepted version', async () => {
    mocks.readFileSync.mockReturnValue(JSON.stringify({version:TERMS_VERSION}));
    expect(await ensureTermsAccepted()).toBe(true);
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
  });
  it('leaves development launches alone', async () => {
    mocks.app.isPackaged = false;
    expect(await ensureTermsAccepted()).toBe(true);
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
  });
});
