#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args) {
  console.log('[release]', command, ...args);
  const result = spawnSync(command, args, { cwd: root, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ['scripts/release-preflight.mjs', '--distribution']);
run(path.join(root, 'node_modules', '.bin', 'vitest'), ['run']);
run(path.join(root, 'node_modules', '.bin', 'electron-forge'), ['make', '--platform=darwin', '--arch=arm64']);
run(process.execPath, ['scripts/notarize-mac-dmg.mjs']);
run(process.execPath, ['scripts/verify-mac-release.mjs', '--distribution']);
