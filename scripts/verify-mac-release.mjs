#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditMacRuntime } from './audit-macos-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const distribution = process.argv.includes('--distribution');
const releaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'release-config.json'), 'utf8'));
const appPath = path.join(root, 'out', `${packageJson.productName}-darwin-arm64`, `${packageJson.productName}.app`);
const makePath = path.join(root, 'out', 'make');

function fail(message) {
  throw new Error(`[verify-release] ${message}`);
}

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(entryPath) : [entryPath];
  });
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed:\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

if (!fs.existsSync(appPath)) fail(`Missing app bundle at ${appPath}`);
const plistPath = path.join(appPath, 'Contents', 'Info.plist');
const plistValue = key => run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plistPath]).trim();
if (plistValue('CFBundleIdentifier') !== releaseConfig.bundleId) fail('Bundle identifier does not match release-config.json.');
if (plistValue('CFBundleShortVersionString') !== packageJson.version) fail('Bundle version does not match package.json.');
if (plistValue('LSMinimumSystemVersion') !== releaseConfig.minimumMacOS) fail('Bundle minimum macOS version does not match release-config.json.');
if (plistValue('LSApplicationCategoryType') !== 'public.app-category.productivity') fail('Bundle category is not Productivity.');

const resources = path.join(appPath, 'Contents', 'Resources');
for (const relativePath of [
  'crispasr/crispasr',
  'notices/THIRD_PARTY_NOTICES.txt',
  'notices/GEMMA_NOTICE.txt',
  'notices/GEMMA_TERMS.txt',
  'notices/GEMMA_PROHIBITED_USE_POLICY.txt',
  'notices/INKCLING_TERMS.txt',
  'notices/PRIVACY.txt',
  'notices/NPM_LICENSES.txt',
]) {
  if (!fs.existsSync(path.join(resources, relativePath))) fail(`Packaged resource missing: ${relativePath}`);
}
if (filesUnder(resources).some(file => /\.(gguf|onnx)$/i.test(file))) {
  fail('Model weights were included in the app bundle.');
}

run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
const nativeAudit = auditMacRuntime([appPath]);
const artifacts = filesUnder(makePath).filter(file => {
  const basename = path.basename(file);
  return basename.startsWith(`${packageJson.productName}-`) && (file.endsWith('.zip') || file.endsWith('.dmg'));
});
const zipFiles = artifacts.filter(file => file.endsWith('.zip'));
const dmgFiles = artifacts.filter(file => file.endsWith('.dmg'));
if (zipFiles.length !== 1) fail(`Expected one ZIP artifact, found ${zipFiles.length}.`);
if (dmgFiles.length !== 1) fail(`Expected one DMG artifact, found ${dmgFiles.length}.`);
run('unzip', ['-t', zipFiles[0]]);
run('hdiutil', ['verify', dmgFiles[0]]);

if (distribution) {
  const signature = run('codesign', ['-dv', '--verbose=4', appPath]);
  if (!/Authority=Developer ID Application/.test(signature)) fail('App is not signed with Developer ID Application.');
  if (!/flags=.*runtime/.test(signature)) fail('Hardened runtime is not enabled.');
  run('spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath]);
  run('xcrun', ['stapler', 'validate', appPath]);
  run('xcrun', ['stapler', 'validate', dmgFiles[0]]);
}

const checksumLines = artifacts.sort().map(file => {
  const digest = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return `${digest}  ${path.relative(makePath, file)}`;
});
const checksumPath = path.join(makePath, 'SHA256SUMS.txt');
fs.writeFileSync(checksumPath, `${checksumLines.join('\n')}\n`);

console.log('[verify-release] verified', {
  appPath,
  artifacts: artifacts.map(file => path.relative(root, file)),
  checksums: path.relative(root, checksumPath),
  distribution,
  nativeBinariesAudited: nativeAudit.length,
});
