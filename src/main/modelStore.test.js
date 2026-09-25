import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createModelStore } from './modelStore.js';
const data = Buffer.from('a small but complete model fixture');
const file = { path: 'speech/model.gguf', bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), url: 'https://example.test/model' };
async function fixture(run, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkcling-model-'));
  const store = createModelStore({ directory, catalog: [{ id: 'speech', label: 'Speech', bytes: data.length, files: [file] }], ...options });
  try { await run(store, directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
describe('on-demand model storage', () => {
  it('verifies and installs once; installed models work without network', async () => {
    let calls = 0;
    await fixture(async (s,d) => {
      expect(s.list()[0].available).toBe(false);
      expect((await s.download('speech')).ok).toBe(true);
      expect(fs.readFileSync(s.requireFile('speech'))).toEqual(data);
      expect((await s.download('speech')).ok).toBe(true);
      expect(calls).toBe(1);
      await s.remove('speech'); expect(s.list()[0].available).toBe(false);
    }, { fetcher: async () => { calls++; return new Response(data); } });
  });
  it('resumes partial bytes and validates the complete hash', async () => {
    await fixture(async (s,d) => {
      fs.mkdirSync(path.join(d,'speech'));fs.writeFileSync(path.join(d,file.path)+'.part',data.subarray(0,7));
      expect((await s.download('speech')).ok).toBe(true);
      expect(fs.readFileSync(s.requireFile('speech'))).toEqual(data);
    }, { fetcher: async (_url, options) => {
      expect(options.headers.Range).toBe('bytes=7-');
      return new Response(data.subarray(7), { status:206, headers:{'content-range':`bytes 7-${data.length-1}/${data.length}`} });
    } });
  });
  it('restarts safely when the server ignores Range', async () => {
    await fixture(async (s,d) => {
      fs.mkdirSync(path.join(d,'speech'));fs.writeFileSync(path.join(d,file.path)+'.part',data.subarray(0,7));
      expect((await s.download('speech')).ok).toBe(true);
      expect(fs.readFileSync(s.requireFile('speech'))).toEqual(data);
    }, { fetcher: async () => new Response(data) });
  });
  it('rejects corrupt complete downloads without exposing them as installed', async () => {
    await fixture(async (s,d) => {
      expect((await s.download('speech')).ok).toBe(false);
      expect(s.list()[0].available).toBe(false);
      expect(fs.existsSync(path.join(d,file.path)+'.part')).toBe(false);
    }, { fetcher:async () => new Response(Buffer.alloc(data.length)) });
  });
  it('retains partial downloads on network failure and prevents concurrent deletion', async () => {
    await fixture(async s => {
      let finish;
      const pending = s.download('speech');
      expect((await s.download('speech')).ok).toBe(false);
      await expect(s.remove('speech')).rejects.toThrow('Pause');
      s.cancel('speech');
      expect((await pending).ok).toBe(false);
      expect(s.list()[0].downloading).toBe(false);
    }, { fetcher: async (_url,{signal}) => { if (signal.aborted) throw new Error('aborted'); return new Promise((_,reject) => signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})); } });
  });
  it('rejects unknown identifiers and mismatched resume responses', async () => {
    await fixture(async (s,d) => {
      expect(() => s.requireFile('../escape')).toThrow('Unknown');
      fs.mkdirSync(path.join(d,'speech'));fs.writeFileSync(path.join(d,file.path)+'.part',data.subarray(0,7));
      expect((await s.download('speech')).reason).toContain('Invalid resume');
      expect(s.list()[0].available).toBe(false);
    }, { fetcher:async () => new Response(data,{status:206,headers:{'content-range':`bytes 0-${data.length-1}/${data.length}`}}) });
  });
  it('requires all files in a multi-file model before reporting ready', async () => {
    await fixture(async(s,d)=>{
      fs.mkdirSync(path.join(d,'speech')); fs.writeFileSync(path.join(d,file.path),data);
      expect(s.list()[0].available).toBe(false);
    }, {catalog:[{id:'speech',files:[file,{...file,path:'speech/tokens.txt'}]}]});
  });
});
