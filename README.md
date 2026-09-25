# InkCling

**Your voice, in ink.** On-device dictation and refinement for Apple Silicon Macs.

This repository contains the Mac app source and public website. Download the [Mac public beta](https://github.com/Akshita-Garg/InkCling/releases/tag/inkcling-v1.0.0), or visit the [InkCling website](https://akshita-garg.github.io/InkCling/).

## Using the app

Press **Control + Option + Space**, speak, then press it again. InkCling transcribes locally and pastes into the field where you started, retaining a clipboard copy as a fallback.

- **Clean:** cleanup without a language model.
- **Smart Refine:** one Gemma pass to help remove fillers and repetition and improve grammar.
- Small installer: download Parakeet, Whisper Tiny, or Cohere during setup. Local Smart Refine also downloads Gemma.
- Pause/resume downloads, verify model checksums, and manage installed models in Settings. Models are reused across app updates.
- Three-minute recordings, local history, no account, and no app telemetry.

Requires Apple Silicon (M1 or later). Built for macOS 14 or later; independent macOS 14/15 testing is still pending. Intel Macs are not supported. The free beta is not Developer ID signed or notarized by Apple. See [release notes](RELEASE_NOTES.md) for installation instructions and limitations.

Initial setup needs internet to download your chosen models. The default pipeline then works offline. Optional cloud refinement sends text to the provider you configure. Review important text: models can make mistakes or change meaning.

## Development

Install Node.js 22 for Apple Silicon and Xcode Command Line Tools, then run:

```sh
npm ci
npm test
```

Tests use generic fixtures and do not require downloading model weights. Model files and the compiled speech runtime are not committed. Download models through onboarding, or keep development copies under `resources/models` using the paths and checksums in `src/shared/modelCatalog.json`.

To obtain the native speech runtime from an installed `/Applications/InkCling.app`:

```sh
mkdir -p resources/bin
cp -R /Applications/InkCling.app/Contents/Resources/crispasr resources/bin/
npm run dev
```

To rebuild CrispASR v0.8.23 from its pinned source, install CMake 3.31.6, create `resources/bin/crispasr`, and run:

```sh
INKCLING_CMAKE="$(command -v cmake)" sh scripts/build-crispasr-mac.sh
```

The `scripts/mac-npm` helper supports an optional project-local Node installation; use ordinary `npm` with your system Node.js installation.

## Build and verify

```sh
npm run release:check
npm run make:mac
npm run verify:mac
```

These commands produce and verify an ad-hoc-signed ARM64 DMG and ZIP. `release:mac` is the separate Developer ID signing/notarization route and requires your own Apple credentials and release review. Credentials must never be committed.

The app uses Electron, React, Vite, CrispASR, Sherpa ONNX, and node-llama-cpp. `src/main` contains local model, history, logging, and paste logic; `src/components` and `src/styles` contain the UI. Two generic cleanup helpers under `bench/` support unit tests; private benchmark datasets and results are excluded.

## Website

The public site lives in `docs/`. Generate its assets with `node scripts/prepare-launch-site.mjs --beta`. Add `--published` only after the release DMG is publicly accessible; the script verifies its URL before enabling download links. GitHub Pages uses the main branch's `/docs` folder.

## Privacy, licenses, and support

Development runs save detailed local text diagnostics and audio recordings. Packaged releases redact transcript fields and do not save raw audio by default. Neither uploads diagnostics automatically. Keep local logs and personal recordings out of commits and public bug reports.

Read the [privacy notice](docs/legal/PRIVACY.txt), [terms](docs/legal/INKCLING_TERMS.txt), and [third-party notices](docs/legal/THIRD_PARTY_NOTICES.txt). App code is MIT licensed; downloaded models retain their own terms.

Report bugs in [Issues](https://github.com/Akshita-Garg/InkCling/issues) with macOS version, Mac chip, and reproduction steps. Do not post private dictations or API keys.
