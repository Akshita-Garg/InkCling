#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { notarize } from '@electron/notarize';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(entryPath) : [entryPath];
  });
}

function credentials() {
  if (process.env.VOICEREFINE_NOTARY_KEYCHAIN_PROFILE) {
    return {
      keychainProfile: process.env.VOICEREFINE_NOTARY_KEYCHAIN_PROFILE,
      ...(process.env.VOICEREFINE_NOTARY_KEYCHAIN
        ? { keychain: process.env.VOICEREFINE_NOTARY_KEYCHAIN }
        : {}),
    };
  }
  if (process.env.VOICEREFINE_APPLE_API_KEY
      && process.env.VOICEREFINE_APPLE_API_KEY_ID
      && process.env.VOICEREFINE_APPLE_API_ISSUER) {
    return {
      appleApiKey: process.env.VOICEREFINE_APPLE_API_KEY,
      appleApiKeyId: process.env.VOICEREFINE_APPLE_API_KEY_ID,
      appleApiIssuer: process.env.VOICEREFINE_APPLE_API_ISSUER,
    };
  }
  if (process.env.VOICEREFINE_APPLE_ID
      && process.env.VOICEREFINE_APPLE_ID_PASSWORD
      && process.env.VOICEREFINE_APPLE_TEAM_ID) {
    return {
      appleId: process.env.VOICEREFINE_APPLE_ID,
      appleIdPassword: process.env.VOICEREFINE_APPLE_ID_PASSWORD,
      teamId: process.env.VOICEREFINE_APPLE_TEAM_ID,
    };
  }
  throw new Error('[notarize-dmg] Notarization credentials are missing.');
}

const dmgs = filesUnder(path.join(root, 'out', 'make')).filter(file => (
  file.endsWith('.dmg') && path.basename(file).startsWith(`${packageJson.productName}-`)
));
if (dmgs.length !== 1) {
  throw new Error(`[notarize-dmg] Expected exactly one DMG, found ${dmgs.length}.`);
}

console.log('[notarize-dmg] submitting', dmgs[0]);
await notarize({ appPath: dmgs[0], ...credentials() });
console.log('[notarize-dmg] notarized and stapled', dmgs[0]);
