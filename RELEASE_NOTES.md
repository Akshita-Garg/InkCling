# InkCling 1.0.0 public beta — Dock fix, 13 October 2026

Your voice, in ink. Local dictation and refinement for Apple Silicon Macs.

## Dock and full-screen bubble fixes — 13 October 2026
The updated 1.0.0 installer keeps InkCling’s app icon in the Dock while retaining the recording bubble above full-screen apps, on the display nearest the pointer. It replaces the earlier bubble-only installers. The version and download links are unchanged.

The local Dock-fix build passed 137 automated tests, package/signature verification covering 28 native binaries, and a separate-process regression confirming the Dock stays visible and the full-screen destination keeps focus during recording, transcription, and cancellation. Local dictation and automatic paste were retested after refreshing its Accessibility grant. A fresh GitHub-download reinstall check is in progress; other macOS versions remain unverified.

## Install or update
1. Quit InkCling. Download **InkCling-1.0.0-arm64.dmg**, open it, and move InkCling to Applications. The app ZIP is an alternative.
2. This free beta is ad hoc signed, not Developer ID signed or notarized. If macOS blocks it, use System Settings > Privacy & Security > Open Anyway and complete the confirmation and password/Touch ID prompt. Keep the app in place while approval completes; reopen it if the first launch was interrupted. [Apple’s instructions](https://support.apple.com/en-gb/102445).
3. Allow Microphone and Accessibility access, and Automation if requested for pasting. Review the app terms/privacy notice.
4. Focus a text field, press **Control + Option + Space**, speak, then press again.

## If an update records but does not paste
An earlier Accessibility grant can remain tied to the old build even when its switch is on. Quit InkCling, remove its entry in System Settings > Privacy & Security > Accessibility, then add the updated app from Applications and enable it. Reopen and test. If macOS retains the stale entry, an optional targeted reset is `tccutil reset Accessibility com.inkcling.desktop`; then add and enable InkCling again. This resets only InkCling’s Accessibility approval and does not grant access automatically. Your transcript remains available with Cmd+V.

## Models and compatibility
Apple Silicon, macOS 14 or later; independent macOS 14/15 testing remains pending. Intel Macs are unsupported. Choose Parakeet (489 MB), Whisper Tiny (104 MB, English only), or Cohere (1.51 GB) during setup. Smart Refine also downloads Gemma (807 MB); Clean needs only the speech model. Model files are unchanged, downloaded automatically, checked before use, and reused across app updates. Models and history are stored outside the app.

Local transcription and refinement work offline after model downloads. Optional cloud refinement sends text to the configured provider. Three-minute recordings, local history, clipboard fallback, manual updates, and model unloading after idle are included. Review important text for recognition/refinement errors. No account or app analytics; release diagnostics redact transcript fields and do not save raw recordings by default.

[Privacy notice](https://akshita-garg.github.io/InkCling/privacy.html) · [Terms](https://akshita-garg.github.io/InkCling/terms.html). SHA256SUMS.txt lists installer and model checksums. Report bugs with macOS version, Mac chip, and reproduction steps; do not post private dictations or keys.

## Source and archived installers
The tested Dock-fix application source is published at [b14e1a2](https://github.com/Akshita-Garg/InkCling/tree/b14e1a29bff9212faed871f7f4c2e9d2afbe3ff8). The original tag is unchanged, so GitHub’s automatic tag source archives represent the older build. Files beginning `ARCHIVE-original-20260925-` and `ARCHIVE-bubble-20261012-` preserve previous installers and counts. Use the standard InkCling filenames for this update. All six model assets are preserved.
