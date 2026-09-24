const fs = require('node:fs');
const path = require('node:path');

// Resolve from each package's location so nested versions stay nested. This
// replaces a manually maintained list that can silently omit new dependencies.
function copyNativeDependencies(sourceModules, destinationModules) {
  const visited = new Set();
  function locate(name, from) {
    for (let dir = from; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, 'node_modules', name);
      if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
      if (dir === path.dirname(dir)) return null;
    }
  }
  function copy(name, from, optional = false) {
    // ipull catches a missing optional reflink helper and uses normal copying.
    // InkCling loads bundled models and uses its own HTTP download path. Avoid
    // shipping this unused native helper with an incomplete upstream notice.
    if (optional && name === '@reflink/reflink') return;
    const source = locate(name, from);
    if (!source) {
      if (optional) return;
      throw new Error(`Missing runtime dependency ${name} (required by ${from})`);
    }
    if (visited.has(source)) return;
    const metadata = JSON.parse(fs.readFileSync(path.join(source, 'package.json')));
    const supports = (list, value) => !list || (!list.includes(`!${value}`) && (list.includes(value) || list.every(item => item.startsWith('!'))));
    if (!supports(metadata.os, 'darwin') || !supports(metadata.cpu, 'arm64')) return;
    const relative = path.relative(sourceModules, source);
    if (relative.startsWith('..')) throw new Error(`Dependency outside project node_modules: ${source}`);
    visited.add(source);
    const destination = path.join(destinationModules, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true });
    for (const dependency of Object.keys(metadata.dependencies || {})) {
      copy(dependency, source, Boolean(metadata.optionalDependencies?.[dependency]));
    }
    for (const dependency of Object.keys(metadata.optionalDependencies || {})) copy(dependency, source, true);
  }
  const root = path.dirname(sourceModules);
  for (const name of ['node-llama-cpp', '@node-llama-cpp/mac-arm64-metal', 'sherpa-onnx-node', 'sherpa-onnx-darwin-arm64']) copy(name, root);
  return visited.size;
}
module.exports = { copyNativeDependencies };
