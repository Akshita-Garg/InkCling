# InkCling 1.0.0 public beta

Your voice, in ink. Local dictation and refinement for Apple Silicon Macs.

## Updated 1.0.0 installer: 25 September 2026
The installer is now approximately 181 MB. Models are downloaded during onboarding instead of being bundled in the app. If you downloaded the earlier 1.0.0 installer, download this replacement and move it to Applications. The version number remains 1.0.0.

## Set up
1. Download **InkCling-1.0.0-arm64.dmg**, open it, and drag InkCling to Applications. The app ZIP is an alternative; you do not need both. The model files in Assets are downloaded automatically by the app.
2. Open InkCling and review the terms and privacy notice.
3. Choose Clean or Smart Refine, your shortcut, and one speech model: Parakeet (recommended, 489 MB), Whisper Tiny (104 MB, English only), or Cohere (1.51 GB).
4. Local Smart Refine also downloads Gemma (807 MB). Clean needs only your speech model. Setup shows the combined download size. Downloads can be paused and resumed, and are checked before use.
5. Allow Microphone and Accessibility access; allow Automation if macOS requests it for pasting.
6. Focus a text field, press **Control + Option + Space**, speak, then press it again. Use Command + V if an app blocks pasting.

Internet is needed for initial model downloads; transcription and local refinement then work offline. No npm, Node.js, Homebrew, or account is required. Settings lets you switch models and remove inactive downloads. Models stay outside the app and are reused across updates.

## Compatibility and first launch
Requires Apple Silicon (M1 or later). Built for macOS 14 or later; independent macOS 14/15 testing remains pending. Intel Macs are not supported.

**This free beta is not Developer ID signed or notarized by Apple.** If blocked, open System Settings > Privacy & Security > Open Anyway for InkCling and authenticate with your Mac login password or Touch ID. See [Apple’s instructions](https://support.apple.com/en-gb/102445). A Mac account without a login password can fail to complete this approval.

## Included features and limits
- Clean: cleanup without a language model. Smart Refine: one local refinement pass.
- Three-minute recordings, local history, clipboard fallback, and model unloading after 30 minutes idle.
- Review important text: recognition and refinement can make mistakes or change meaning. Lists and formatting are not guaranteed. Use “Show what you said” to compare the original transcript.
- Updates are installed manually. No app analytics or account is required.
- Optional cloud refinement sends text to the provider you configure. Speech recognition remains local.
- Release diagnostics redact transcript fields and do not save raw recordings by default.

Read the [privacy notice](https://akshita-garg.github.io/InkCling/privacy.html) and [terms](https://akshita-garg.github.io/InkCling/terms.html). SHA256SUMS.txt lists installer and model checksums.

Report bugs in Issues with your macOS version, Mac chip, and reproduction steps. Do not post private dictations or API keys.

## Source for this refreshed build
Use [source commit d9b5dbf](https://github.com/Akshita-Garg/InkCling/tree/d9b5dbf9879b6e495d55862b16fdb48fab1d00ae) or its [source ZIP](https://github.com/Akshita-Garg/InkCling/archive/d9b5dbf9879b6e495d55862b16fdb48fab1d00ae.zip). The original release tag is unchanged, so GitHub’s automatically generated tag-based source archives contain the earlier bundled-model build. The DMG and app ZIP above are the refreshed installers.
