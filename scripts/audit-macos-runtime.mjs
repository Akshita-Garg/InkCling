import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'release-config.json')));
const magic = new Set(['cffaedfe', 'cefaedfe', 'cafebabe', 'bebafeca', 'cafebabf']);
function files(location) {
  if (!fs.existsSync(location)) throw new Error(`Missing native runtime: ${location}`);
  if (!fs.statSync(location).isDirectory()) return [location];
  return fs.readdirSync(location, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) return [];
    return files(path.join(location, entry.name));
  });
}
function newer(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  }
  return false;
}
export function auditMacRuntime(locations) {
  const report = [];
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'inkcling-native-audit-'));
  const alias = path.join(temporary, 'binary');
  try {
  for (const file of locations.flatMap(files)) {
    const fd = fs.openSync(file, 'r');
    const header = Buffer.alloc(4);
    try { fs.readSync(fd, header, 0, 4, 0); } finally { fs.closeSync(fd); }
    if (!magic.has(header.toString('hex'))) continue;
    const architectures = execFileSync('lipo', ['-archs', file], { encoding: 'utf8' }).trim();
    if (!architectures.split(/\s+/).includes('arm64')) throw new Error(`No arm64 slice: ${file}`);
    // otool treats trailing parentheses in Electron Helper names as archive
    // member syntax, even with execFile. A plain symlink avoids that parser.
    fs.rmSync(alias, { force: true });
    fs.symlinkSync(path.resolve(file), alias);
    const commands = execFileSync('otool', ['-arch', 'arm64', '-l', alias], { encoding: 'utf8' });
    const minimum = commands.match(/LC_BUILD_VERSION[\s\S]*?minos\s+([\d.]+)/)?.[1]
      || commands.match(/LC_VERSION_MIN_MACOSX[\s\S]*?version\s+([\d.]+)/)?.[1];
    if (!minimum || newer(minimum, config.minimumMacOS)) {
      throw new Error(`${file} requires macOS ${minimum || 'unknown'}; release target is ${config.minimumMacOS}`);
    }
    const dependencies = execFileSync('otool', ['-arch', 'arm64', '-L', alias], { encoding: 'utf8' });
    for (const line of dependencies.split('\n').slice(1)) {
      const dependency = line.trim().split(' (')[0];
      if (dependency.startsWith('/') && !dependency.startsWith('/System/Library/') && !dependency.startsWith('/usr/lib/')) {
        throw new Error(`Non-portable dependency in ${file}: ${dependency}`);
      }
    }
    report.push({ file: path.relative(root, file), minimumMacOS: minimum, architectures });
  }
  if (!report.length) throw new Error('No Mach-O runtimes audited');
  return report;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const locations = process.argv.slice(2);
  const report = auditMacRuntime(locations.length ? locations : [
    path.join(root, 'resources/bin/crispasr'),
    path.join(root, 'node_modules/@node-llama-cpp/mac-arm64-metal'),
    path.join(root, 'node_modules/sherpa-onnx-darwin-arm64'),
    path.join(root, 'node_modules/electron/dist/Electron.app'),
  ]);
  console.log(JSON.stringify({ minimumMacOS: config.minimumMacOS, binaries: report }, null, 2));
}
