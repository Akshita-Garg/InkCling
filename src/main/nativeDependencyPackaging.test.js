import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
const { copyNativeDependencies } = createRequire(import.meta.url)('../../scripts/copy-native-dependencies.cjs');
const folders = [];
afterEach(() => folders.splice(0).forEach(folder => fs.rmSync(folder,{recursive:true,force:true})));
function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'inkcling-deps-'));folders.push(root);
  const source=path.join(root,'node_modules'),destination=path.join(root,'staging/node_modules');
  const add=(name,metadata={},parent=root)=>{
    const dir=path.join(parent,'node_modules',name);fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name,version:'1.0.0',...metadata}));return dir;
  };
  ['node-llama-cpp','@node-llama-cpp/mac-arm64-metal','sherpa-onnx-node','sherpa-onnx-darwin-arm64'].forEach(name=>add(name));
  return {root,source,destination,add};
}
describe('native runtime dependency closure',()=>{
  it('includes hoisted and nested dependencies at their original locations',()=>{
    const f=fixture();const parent=f.add('node-llama-cpp',{dependencies:{a:'1',b:'1'}});
    f.add('a');f.add('b',{dependencies:{a:'2'}},parent);
    f.add('a',{version:'2.0.0'},path.join(parent,'node_modules/b'));
    copyNativeDependencies(f.source,f.destination);
    const nested=JSON.parse(fs.readFileSync(path.join(f.destination,'node-llama-cpp/node_modules/b/node_modules/a/package.json')));
    expect(nested.version).toBe('2.0.0');
    expect(fs.existsSync(path.join(f.destination,'a/package.json'))).toBe(true);
  });
  it('fails packaging when a required dependency is missing',()=>{
    const f=fixture();f.add('node-llama-cpp',{dependencies:{missing:'1'}});
    expect(()=>copyNativeDependencies(f.source,f.destination)).toThrow('Missing runtime dependency missing');
  });
  it('allows absent optional dependencies and excludes other architectures',()=>{
    const f=fixture();f.add('node-llama-cpp',{optionalDependencies:{missing:'1',windows:'1'}});
    f.add('windows',{os:['win32'],cpu:['x64']});copyNativeDependencies(f.source,f.destination);
    expect(fs.existsSync(path.join(f.destination,'windows'))).toBe(false);
  });
  it('omits the unused optional reflink helper',()=>{
    const f=fixture();f.add('node-llama-cpp',{optionalDependencies:{'@reflink/reflink':'1'}});
    f.add('@reflink/reflink');copyNativeDependencies(f.source,f.destination);
    expect(fs.existsSync(path.join(f.destination,'@reflink/reflink'))).toBe(false);
  });
});
