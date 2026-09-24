// Query NSWorkspace without activating an app or requesting System Events access.
// Use the process id: several Electron apps can share a development bundle id.
export async function readFrontmostMacApp(execFileAsync) {
  const { stdout } = await execFileAsync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
    ObjC.import('AppKit');
    const application = $.NSWorkspace.sharedWorkspace.frontmostApplication;
    JSON.stringify({ pid: Number(application.processIdentifier), bundleId: ObjC.unwrap(application.bundleIdentifier) });
  `], { timeout: 2000 });
  const target = JSON.parse(stdout.trim());
  if (!Number.isSafeInteger(target.pid) || target.pid <= 0) throw new Error('No active typing application.');
  return target;
}

export async function pasteToMacTarget(target, {
  execFileAsync,
  readFrontmost = () => readFrontmostMacApp(execFileAsync),
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  isCancelled = () => false,
}) {
  const checkSession = () => {
    if (isCancelled()) throw new Error('Dictation was cancelled. The transcript is on the clipboard.');
  };
  checkSession();
  if (!Number.isSafeInteger(target?.pid) || target.pid <= 0) {
    throw new Error('Could not identify the typing app. Your transcript is copied; paste it with Cmd+V.');
  }
  const current = await readFrontmost();
  checkSession();
  // Activating an already active application can disturb its focused field.
  // Leave its window and insertion point alone in the normal shortcut flow.
  if (current.pid !== target.pid) {
    await execFileAsync('/usr/bin/osascript', ['-e', `tell application "System Events" to set frontmost of first application process whose unix id is ${target.pid} to true`], { timeout: 2000 });
    let restored = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      checkSession();
      if ((await readFrontmost()).pid === target.pid) { restored = true; break; }
      await wait(50);
    }
    if (!restored) throw new Error('Could not return to the typing app. Your transcript is copied; paste it with Cmd+V.');
    await wait(150);
  }
  checkSession();
  // Recheck in the same script as the keystroke. A failed restore must never
  // turn into Cmd+V in an unrelated foreground application.
  // Compare the foreground pid directly: saving an application-process object
  // in AppleScript can resolve it by name, confusing two apps called Electron.
  await execFileAsync('/usr/bin/osascript', ['-e', `
    tell application "System Events"
      if (unix id of first application process whose frontmost is true) is not ${target.pid} then error "Typing app lost focus before paste. Transcript is on the clipboard."
      keystroke "v" using command down
    end tell
  `], { timeout: 2000 });
}
