# InkCling 1.0.0 — Mac public beta

Your voice, in ink. Local dictation and refinement for Apple Silicon Macs.

## What is included

- Parakeet speech recognition and Gemma 3 1B refinement, bundled for offline use.
- **Clean:** quick cleanup without a language model.
- **Smart Refine:** one local model pass to help remove fillers and repetition and improve grammar.
- Control + Option + Space to start and stop recording from another app, with automatic pasting and a clipboard fallback.
- Up to three minutes per recording, local transcript history, and a configurable shortcut.
- Models preload at startup and unload after 30 minutes idle.
- Optional Cohere speech recognition: downloaded separately, verified, then run on your Mac.

## Requirements and installation

Apple Silicon (M1 or later). Built for macOS 14 Sonoma or later. Intel Macs are not supported. Native binaries have been audited for macOS 14 compatibility; installation and recording on macOS 14/15 still need independent testing.

This free beta is **not Developer ID signed or notarized by Apple**. macOS may block its first launch. Download only from this repository. See [Apple’s instructions for opening an app you trust](https://support.apple.com/en-gb/102445).

1. Download `InkCling-1.0.0-arm64.dmg`, open it, and drag InkCling to Applications.
2. Open InkCling, review the terms and privacy notice, and finish onboarding.
3. Allow Microphone and Accessibility access when requested. Allow Automation if macOS requests it for pasting.
4. Focus a text field, press Control + Option + Space, speak, then press it again. Use Command + V if an app blocks automatic pasting.

No npm, Node.js, or Homebrew is required. The ZIP is an alternative to the DMG; you do not need both. `SHA256SUMS.txt` lists release-file checksums.

## Known limits and privacy

Recognition and refinement can make mistakes or change meaning. Review important text and use “Show what you said” to compare it with the original transcript. Formatting and lists are not guaranteed.

The default pipeline works offline. No account or app analytics is required. Local history contains your transcripts. Release diagnostic logs redact transcript fields by default and do not save raw recordings by default. Optional cloud refinement sends text to the provider you explicitly configure. See the bundled privacy notice and model licenses.

Updates are installed manually. Please report bugs through this repository’s Issues tab; do not post private recordings, transcripts, or API keys.
