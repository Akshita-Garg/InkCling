"""Fetch and preserve upstream license texts; run from the Mac project root."""
from pathlib import Path
import hashlib, json, re, shutil, ssl, urllib.request
from html.parser import HTMLParser

root = Path(__file__).resolve().parent.parent
out = root / 'resources/notices'
out.mkdir(exist_ok=True)
manifest = []

class ArticleText(HTMLParser):
    def __init__(self):
        super().__init__(); self.depth = 0; self.parts = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'div' and 'devsite-article-body' in attrs.get('class', ''):
            self.depth = 1
        elif self.depth and tag == 'div': self.depth += 1
        if self.depth and tag in ('p','h1','h2','h3','li','br'): self.parts.append('\n')
        if self.depth and tag == 'li': self.parts.append('- ')
    def handle_endtag(self, tag):
        if self.depth and tag == 'div': self.depth -= 1
        if self.depth and tag in ('p','h1','h2','h3','li'): self.parts.append('\n')
    def handle_data(self, data):
        if self.depth: self.parts.append(data)

def save(name, data, source):
    if isinstance(data, str): data = data.encode()
    (out / name).write_bytes(data)
    manifest.append({'file':name, 'source':source, 'sha256':hashlib.sha256(data).hexdigest()})

def fetch(name, url, article=False):
    req = urllib.request.Request(url, headers={'User-Agent':'InkCling-release-notice-collector/1.0'})
    data = urllib.request.urlopen(req, timeout=60).read()
    if article:
        parser = ArticleText(); parser.feed(data.decode())
        body = re.sub(r'\n[ \t]*\n(?:[ \t]*\n)+', '\n\n', ''.join(parser.parts)).strip()
        if len(body) < 1000: raise RuntimeError('Article extraction failed: '+url)
        data = f'Source: {url}\nRetrieved: 2026-09-18\nGoogle LLC. Page text licensed under CC BY 4.0 as indicated by its source.\n\n{body}\n'.encode()
    save(name,data,url)

fetch('GEMMA_TERMS.txt','https://ai.google.dev/gemma/terms',True)
fetch('GEMMA_PROHIBITED_USE_POLICY.txt','https://ai.google.dev/gemma/prohibited_use_policy',True)
fetch('CC_BY_4.0.txt','https://creativecommons.org/licenses/by/4.0/legalcode.txt')
fetch('WHISPER_LICENSE.txt','https://raw.githubusercontent.com/openai/whisper/v20250625/LICENSE')
fetch('SHERPA_ONNX_LICENSE.txt','https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v1.13.2/LICENSE')
fetch('APACHE_2.0.txt','https://www.apache.org/licenses/LICENSE-2.0.txt')
source = root / '.tools/crispasr-macos14/upstream'
for name,relative in [('CRISPASR_LICENSE.txt','LICENSE'),('CRISPASR_THIRD_PARTY_NOTICES.txt','THIRD_PARTY_NOTICES.txt'),('GGML_LICENSE.txt','ggml/LICENSE'),('C2PA_AUDIO_LICENSE.txt','third_party/c2pa-audio/LICENSE')]:
    save(name,(source / relative).read_bytes(),'CrispASR v0.8.23 / 7d22deeca045f9c80020bf59e6a24564b1d66e5b / '+relative)
(out/'SOURCES.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Collected',len(manifest),'license files')
