import fs from 'node:fs';
import path from 'node:path';
import { app, dialog, Menu, shell } from 'electron';

export const TERMS_VERSION = '2026-09-18';
export function noticesDirectory() {
  return app.isPackaged ? path.join(process.resourcesPath, 'notices') : path.join(app.getAppPath(), 'resources/notices');
}
async function openNotice(filename) {
  const error = await shell.openPath(path.join(noticesDirectory(), filename));
  if (error) await dialog.showMessageBox({ type: 'error', message: 'Could not open the document.', detail: error });
}
export function installAppMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.getName(), submenu: [
      { role: 'about' }, { type: 'separator' },
      { label: 'Terms of Use', click: () => openNotice('INKCLING_TERMS.txt') },
      { label: 'Privacy Notice', click: () => openNotice('PRIVACY.txt') },
      { label: 'Third-party Licenses', click: () => shell.openPath(noticesDirectory()) },
      { type: 'separator' }, { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { role: 'quit' },
    ] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]));
}
export async function ensureTermsAccepted() {
  if (!app.isPackaged) return true;
  const acceptancePath = path.join(app.getPath('userData'), 'terms-acceptance.json');
  try {
    if (JSON.parse(fs.readFileSync(acceptancePath, 'utf8')).version === TERMS_VERSION) return true;
  } catch { /* first launch or outdated/corrupt receipt */ }
  while (true) {
    const { response } = await dialog.showMessageBox({
      type: 'info', title: 'Welcome to InkCling',
      message: 'Please review the terms before using InkCling.',
      detail: fs.readFileSync(path.join(noticesDirectory(), 'INKCLING_TERMS.txt'), 'utf8'),
      buttons: ['Agree and continue', 'Read all licenses', 'Privacy notice', 'Quit'],
      defaultId: 3, cancelId: 3, noLink: true,
    });
    if (response === 3) return false;
    if (response === 1) { await shell.openPath(noticesDirectory()); continue; }
    if (response === 2) { await openNotice('PRIVACY.txt'); continue; }
    fs.mkdirSync(path.dirname(acceptancePath), { recursive: true });
    fs.writeFileSync(acceptancePath, JSON.stringify({ version: TERMS_VERSION, acceptedAt: new Date().toISOString() }));
    return true;
  }
}
