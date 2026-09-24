// Shared helpers for capturing and formatting the global recording shortcut.
// Used by both the Settings panel and Onboarding so the rules stay in one place.
// Shortcut capture and labels for the macOS app.
// Option+Space can also activate another app (including Codex) even when
// Electron reports successful registration. Avoid that collision by default.
export const DEFAULT_RECORDING_SHORTCUT = 'Control+Alt+Space'

// Keys that are modifiers on their own. A keydown for one of these means the
// user is mid-combo (e.g. holding Alt before pressing Space), capture should
// keep waiting rather than treat it as an invalid shortcut.
const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta', 'Super']

// Modifiers that count as a "primary" modifier. A valid global shortcut needs
// at least one of these (Control, Option, or Command); Shift alone is not
// enough (the OS rejects it).
const PRIMARY_MODIFIERS = ['Control', 'Alt', 'Command']

// Maps DOM KeyboardEvent.key values to Electron accelerator key names.
const KEY_MAP = {
  ' ': 'Space',
  Spacebar: 'Space',
  Escape: 'Esc',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Delete: 'Delete',
  Backspace: 'Backspace',
  Enter: 'Enter',
  Tab: 'Tab',
}

// True when this keydown is a bare modifier press (no real key yet).
export function isModifierOnlyEvent(event) {
  return MODIFIER_KEYS.includes(event.key)
}

// Resolve the non-modifier key from a keydown event, or null if there isn't one.
export function shortcutKeyFromEvent(event) {
  if (isModifierOnlyEvent(event)) return null
  if (KEY_MAP[event.key]) return KEY_MAP[event.key]
  if (/^F\d{1,2}$/.test(event.key)) return event.key
  if (event.key.length === 1) return event.key.toUpperCase()
  return event.key
}

// Build an Electron accelerator string (e.g. "Alt+Space") from a keydown event.
// Returns null if there is no real key yet or no primary modifier is held.
export function shortcutFromEvent(event) {
  const key = shortcutKeyFromEvent(event)
  if (!key || key === 'Esc') return null

  const modifiers = []
  if (event.ctrlKey) modifiers.push('Control')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.metaKey) modifiers.push('Command') // macOS Command key

  const hasPrimaryModifier = modifiers.some(modifier => PRIMARY_MODIFIERS.includes(modifier))
  if (!hasPrimaryModifier) return null

  return [...modifiers, key].join('+')
}

// Combinations macOS reserves at the OS level. globalShortcut.register() may
// report these as registered, but the OS consumes the keypress first so the
// shortcut never actually fires, so we reject them up front instead of saving
// a shortcut that silently does nothing.
//   Control+Space: switches input method / IME (active with 2+ input methods)
//   Command+Space / Option+Command+Space: Spotlight / Finder search
const RESERVED_ACCELERATORS = new Set(['Control+Space', 'Command+Space', 'Alt+Command+Space'])

export function isReservedAccelerator(accelerator) {
  const parts = accelerator.replace(/Super|Meta/g, 'Command').split('+')
  const key = parts.pop()
  return RESERVED_ACCELERATORS.has([...parts.sort(), key].join('+'))
}

// Turn an accelerator string into a human-friendly label (e.g. "Ctrl + Space").
export function formatShortcutLabel(accelerator) {
  return accelerator
    .replace(/Control/g, 'Ctrl')
    .replace(/Command|Super|Meta/g, 'Cmd')
    .replace(/Alt/g, 'Option')
    .replace(/\+/g, ' + ')
}
