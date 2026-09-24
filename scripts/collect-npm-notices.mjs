import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const paths = execFileSync(path.join(root, 'scripts/mac-npm'), ['ls', '--omit=dev', '--all', '--parseable'], {encoding:'utf8'}).trim().split('\n').slice(1);
const records = [], texts = [];
for (const packagePath of paths) {
  const metadata = JSON.parse(fs.readFileSync(path.join(packagePath, 'package.json')));
  if (metadata.name.startsWith('@reflink/')) continue; // deliberately excluded from packaging
  const licenses = fs.readdirSync(packagePath).filter(name => /^(licen[sc]e|copying|notice)([.\-_]|$)/i.test(name) && fs.statSync(path.join(packagePath,name)).isFile());
  records.push({name:metadata.name,version:metadata.version,license:metadata.license,files:licenses});
  for (const license of licenses) texts.push(`\n${'='.repeat(72)}\n${metadata.name} ${metadata.version} — ${license}\n${'='.repeat(72)}\n${fs.readFileSync(path.join(packagePath,license),'utf8')}`);
}
fs.writeFileSync(path.join(root,'resources/notices/NPM_COMPONENTS.json'), JSON.stringify(records,null,2)+'\n');
fs.writeFileSync(path.join(root,'resources/notices/NPM_LICENSES.txt'), texts.join('\n'));
console.log('[notices] collected installed production packages:',records.length);
console.log('[notices] packages with upstream license supplements:',records.filter(r=>!r.files.length).map(r=>r.name));
