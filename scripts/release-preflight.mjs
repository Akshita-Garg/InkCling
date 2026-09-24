#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { auditMacRuntime } from './audit-macos-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const forgeConfig = require(path.join(root, 'forge.config.js'));
const distribution = process.argv.includes('--distribution');

function fail(message) {
  throw new Error(`[release-preflight] ${message}`);
}

function requiredFile(relativePath, minimumBytes = 1) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) fail(`Missing ${relativePath}`);
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile() || stat.size < minimumBytes) {
    fail(`${relativePath} is unexpectedly small (${stat.size} bytes)`);
  }
  return absolutePath;
}

function hasNotaryCredentials() {
  return Boolean(
    process.env.VOICEREFINE_NOTARY_KEYCHAIN_PROFILE
    || (process.env.VOICEREFINE_APPLE_API_KEY
      && process.env.VOICEREFINE_APPLE_API_KEY_ID
      && process.env.VOICEREFINE_APPLE_API_ISSUER)
    || (process.env.VOICEREFINE_APPLE_ID
      && process.env.VOICEREFINE_APPLE_ID_PASSWORD
      && process.env.VOICEREFINE_APPLE_TEAM_ID),
  );
}

if (process.platform !== 'darwin') fail('macOS releases must be built on macOS.');
if (process.arch !== 'arm64') fail('This release targets Apple Silicon arm64.');
if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(packageJson.version)) {
  fail(`Invalid release version: ${packageJson.version}`);
}

const crispPath = requiredFile('resources/bin/crispasr/crispasr', 1_000_000);
requiredFile('resources/models/gemma-3-1b-it-Q4_K_M.gguf', 700_000_000);
requiredFile('resources/models/parakeet-tdt-0.6b-v3-GGUF/parakeet-tdt-0.6b-v3-q4_k.gguf', 300_000_000);
requiredFile('resources/models/sherpa-onnx-whisper-tiny.en/tiny.en-encoder.int8.onnx', 1_000_000);
requiredFile('resources/icons/icon.icns', 4_000);
requiredFile('resources/entitlements.mac.release.plist', 100);
requiredFile('resources/notices/THIRD_PARTY_NOTICES.txt', 500);
requiredFile('resources/notices/GEMMA_NOTICE.txt', 50);
for (const name of ['GEMMA_TERMS.txt', 'GEMMA_PROHIBITED_USE_POLICY.txt', 'INKCLING_TERMS.txt', 'PRIVACY.txt', 'CC_BY_4.0.txt', 'CRISPASR_THIRD_PARTY_NOTICES.txt', 'NPM_LICENSES.txt']) {
  requiredFile(`resources/notices/${name}`, 500);
}

fs.accessSync(crispPath, fs.constants.X_OK);
const crispBuild = execFileSync('otool', ['-l', crispPath], { encoding: 'utf8' });
const crispMinimum = crispBuild.match(/LC_BUILD_VERSION[\s\S]*?minos\s+([0-9.]+)/)?.[1];
if (!crispMinimum) fail('Could not determine the CrispASR deployment target.');
const bundleMinimum = forgeConfig.packagerConfig.extendInfo?.LSMinimumSystemVersion;
if (bundleMinimum !== crispMinimum) {
  fail(`Bundle minimum ${bundleMinimum} does not match CrispASR minimum ${crispMinimum}.`);
}
const nativeAudit = auditMacRuntime([
  path.join(root, 'resources/bin/crispasr'),
  path.join(root, 'node_modules/@node-llama-cpp/mac-arm64-metal'),
  path.join(root, 'node_modules/sherpa-onnx-darwin-arm64'),
  path.join(root, 'node_modules/electron/dist/Electron.app'),
]);

const packagedResources = JSON.stringify(forgeConfig.packagerConfig.extraResource);
if (/candidates/i.test(packagedResources)) fail('Candidate models must not be packaged.');

if (distribution) {
  if (!process.env.VOICEREFINE_MAC_SIGN_IDENTITY) {
    fail('VOICEREFINE_MAC_SIGN_IDENTITY is required for a distribution build.');
  }
  if (process.env.VOICEREFINE_MAC_NOTARIZE !== '1') {
    fail('VOICEREFINE_MAC_NOTARIZE=1 is required for a distribution build.');
  }
  if (!hasNotaryCredentials()) fail('Notarization credentials are missing.');
  if (process.env.INKCLING_RELEASE_REVIEWED !== '1') {
    fail('Review the release terms, privacy notice, licenses, and installation behavior, then set INKCLING_RELEASE_REVIEWED=1.');
  }
}

console.log('[release-preflight] ready', {
  productName: packageJson.productName,
  version: packageJson.version,
  arch: process.arch,
  minimumMacOS: crispMinimum,
  distribution,
  nativeBinariesAudited: nativeAudit.length,
});
