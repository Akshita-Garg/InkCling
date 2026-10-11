# InkCling 1.0.0 public beta — refreshed 12 October 2026

The installers on the original release now include the full-screen bubble fix. Download the standard filenames below. Files named `before-bubble-fix` are archived original installers, retained with their historical download counts. New installers have separate download counters. Model files are unchanged.

## Full-screen recording bubble fix
- The recording/transcribing bubble can now appear over full-screen apps using a nonactivating macOS panel.
- The bubble sits above competing floating windows and follows the display containing the pointer.
- The fix retains the existing nonfocusable behavior so the bubble does not deliberately take the text cursor.

The full-screen visibility fix was confirmed by the app's user on their Mac. This release does not claim to resolve all automatic-paste issues.

## Refresh an existing installation
1. Quit InkCling completely with Command + Q.
2. Download **InkCling-1.0.0-arm64.dmg**, open it, and drag InkCling into Applications, choosing Replace. The app ZIP is an alternative; you do not need both.
3. Launch InkCling from Applications. Existing models, settings, and dictation history remain outside the app bundle; do not delete its Application Support data to update.
4. Check your recording shortcut in a text field, including with the destination app in full screen.

Updates are manual; existing installations do not automatically download this release.

## Accessibility and automatic paste
This beta is ad-hoc signed, not Developer ID signed or notarized. macOS may require Accessibility permission again after replacing the app. If it is enabled but automatic paste still fails, quit InkCling, remove its old entry from System Settings > Privacy & Security > Accessibility, add `/Applications/InkCling.app` again, enable it, and relaunch. Allow Automation if macOS requests it for pasting. This is a troubleshooting step, not a guaranteed fix; Command + V remains available because the transcript is copied to the clipboard.

## First installation
1. Download the DMG and move InkCling to Applications.
2. Review the terms and privacy notice, choose Clean or Smart Refine, a shortcut, and a speech model.
3. Models download during setup and are verified before use. Local Smart Refine additionally downloads Gemma. The app continues to fetch unchanged model assets from the 1.0.0 release.
4. Allow Microphone and Accessibility access, then focus a text field and press **Control + Option + Space** to start and stop dictation.

Requires Apple Silicon (M1 or later). Built for macOS 14 or later; independent macOS 14/15 testing remains pending. Intel Macs are not supported. See [Apple’s first-launch instructions](https://support.apple.com/en-gb/102445) if macOS blocks the app.

Transcription and local refinement work offline after model setup. Optional cloud refinement sends text to the provider you configure. Review important text: models can make mistakes or change meaning. No app analytics or account is required. Packaged releases redact transcript fields and do not save raw recordings by default.

Read the [privacy notice](https://akshita-garg.github.io/InkCling/privacy.html) and [terms](https://akshita-garg.github.io/InkCling/terms.html). SHA256SUMS.txt lists the installer checksums. The original release tag is retained for historical reference; refreshed installer source is on the main branch. The release page links the exact refresh source commit.
