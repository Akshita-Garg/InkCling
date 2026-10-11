# Full-screen recording bubble update — 12 October 2026

This update keeps version 1.0.0 and the existing download links. The recording bubble uses a non-activating panel and appears on the display nearest the pointer, including above full-screen apps.

Verified on the test Mac: full-screen bubble visibility and automatic paste; the downloaded build launches after macOS Open Anyway approval completes. Automated tests: 137 passing, plus a separate-process fullscreen focus and overlay IPC check. Other macOS versions remain unverified.

## Updating from an earlier beta
Quit InkCling before replacing the app in Applications. Your models and history are stored separately and are reused.

Because this beta uses ad hoc signing, an update can invalidate an earlier Accessibility grant even when the switch remains on. If transcription works but automatic paste does not:
1. Quit InkCling.
2. In System Settings > Privacy & Security > Accessibility, remove InkCling from the list, then add the updated app from Applications and enable it.
3. Reopen InkCling and test in a text field.

If macOS retains the stale entry, an optional targeted reset is `tccutil reset Accessibility com.inkcling.desktop`. This revokes only InkCling's Accessibility approval; then add and enable the updated app again. It does not grant access automatically.

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

**This free beta is not Developer ID signed or notarized by Apple.** If blocked, open System Settings > Privacy & Security > Open Anyway for InkCling and complete the confirmation and Mac password or Touch ID prompt. Keep the app in place while approval completes; if its first launch was interrupted, reopen it afterward. See [Apple’s instructions](https://support.apple.com/en-gb/102445).

## Included features and limits
- Clean: cleanup without a language model. Smart Refine: one local refinement pass.
- Three-minute recordings, local history, clipboard fallback, and model unloading after 30 minutes idle.
- Review important text: recognition and refinement can make mistakes or change meaning. Lists and formatting are not guaranteed. Use “Show what you said” to compare the original transcript.
- Updates are installed manually. No app analytics or account is required.
- Optional cloud refinement sends text to the provider you configure. Speech recognition remains local.
- Release diagnostics redact transcript fields and do not save raw recordings by default.

Read the [privacy notice](https://akshita-garg.github.io/InkCling/privacy.html) and [terms](https://akshita-garg.github.io/InkCling/terms.html). SHA256SUMS.txt lists installer and model checksums.

Report bugs in Issues with your macOS version, Mac chip, and reproduction steps. Do not post private dictations or API keys.

## Source for this build
The binary was built from [3d842e3](https://github.com/Akshita-Garg/InkCling/tree/3d842e34121369c6136c768f335731262bc6fe92). The verified bubble source is restored on main. The original release tag is unchanged; its automatically generated source archive represents the older build. Files named `ARCHIVE-original-20260925-*` preserve the previous installers; use the standard InkCling filenames for this update.
