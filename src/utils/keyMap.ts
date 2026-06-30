/**
 * Maps physical keyboard Event.code to acceptable KLE labels.
 * Layouts in this app may use either KLE-style shifted legends ("?\n/") or
 * compact labels ("/"), especially on 36-key column-staggered keyboards.
 */
export const codeToKLELabelMap: Record<string, string | string[]> = {
  // Alphabet
  KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R', KeyT: 'T', KeyY: 'Y', KeyU: 'U', KeyI: 'I', KeyO: 'O', KeyP: 'P',
  KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyJ: 'J', KeyK: 'K', KeyL: 'L',
  KeyZ: 'Z', KeyX: 'X', KeyC: 'C', KeyV: 'V', KeyB: 'B', KeyN: 'N', KeyM: 'M',
  
  // Digits
  Digit1: ['!\n1', '1'], Digit2: ['@\n2', '2'], Digit3: ['#\n3', '3'], Digit4: ['$\n4', '4'], Digit5: ['%\n5', '5'],
  Digit6: ['^\n6', '6'], Digit7: ['&\n7', '7'], Digit8: ['*\n8', '8'], Digit9: ['(\n9', '9'], Digit0: [')\n0', '0'],
  
  // Punctuation
  Minus: ['_\n-', '-'], Equal: ['+\n=', '='],
  BracketLeft: ['{\n[', '['], BracketRight: ['}\n]', ']'], Backslash: ['|\n\\', '\\'],
  Semicolon: [':\n;', ';'], Quote: ['"\n\'', "'"],
  Comma: ['<\n,', ','], Period: ['>\n.', '.'], Slash: ['?\n/', '/'],
  Backquote: ['~\n`', '`'],
  
  // Modifiers and special keys
  Space: ['', 'Space'], // KLE often leaves spacebar empty or names it.
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: ['Backspace', 'BS'],
  ShiftLeft: 'Shift', ShiftRight: 'Shift',
  ControlLeft: ['Ctrl', 'Control'], ControlRight: ['Ctrl', 'Control'],
  AltLeft: 'Alt', AltRight: 'Alt',
  MetaLeft: 'Win', MetaRight: 'Win',
  Escape: 'Esc',
  CapsLock: ['Caps Lock', 'Caps'],
  Delete: ['Del', 'Delete']
};

/**
 * Normalizes a key label from KLE for exact matching against physical code.
 */
export function matchKLEKey(kleLabel: string, physicalCode: string): boolean {
  const expectedLabel = codeToKLELabelMap[physicalCode];
  if (expectedLabel === undefined) return false;

  const expected = (Array.isArray(expectedLabel) ? expectedLabel : [expectedLabel])
    .map((label) => label.trim().toLowerCase());
  const normalizedLabel = kleLabel.trim().toLowerCase();
  if (expected.includes(normalizedLabel)) return true;

  // Multi-legend KLE labels may be represented as "shifted\nbase". A compact
  // keyboard layout may only care about matching the unshifted base legend.
  const legends = normalizedLabel
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean);
  return legends.some((legend) => expected.includes(legend));
}

/**
 * Maps physical keyboard Event.code to standard touch typing expected fingers.
 * Space can be pressed by either thumb.
 */
export const expectedFingerMap: Record<string, string | string[]> = {
  // Left Pinky
  Backquote: 'LeftPinky', Digit1: 'LeftPinky', KeyQ: 'LeftPinky', KeyA: 'LeftPinky', KeyZ: 'LeftPinky',
  Escape: 'LeftPinky', Tab: 'LeftPinky', CapsLock: 'LeftPinky', ShiftLeft: 'LeftPinky', ControlLeft: 'LeftPinky',
  
  // Left Ring
  Digit2: 'LeftRing', KeyW: 'LeftRing', KeyS: 'LeftRing', KeyX: 'LeftRing',
  
  // Left Middle
  Digit3: 'LeftMiddle', KeyE: 'LeftMiddle', KeyD: 'LeftMiddle', KeyC: 'LeftMiddle',
  
  // Left Index
  Digit4: 'LeftIndex', Digit5: 'LeftIndex', KeyR: 'LeftIndex', KeyT: 'LeftIndex', 
  KeyF: 'LeftIndex', KeyG: 'LeftIndex', KeyV: 'LeftIndex', KeyB: 'LeftIndex',
  
  // Thumbs
  Space: ['LeftThumb', 'RightThumb'],
  AltLeft: 'LeftThumb', MetaLeft: 'LeftThumb',
  AltRight: 'RightThumb', MetaRight: 'RightThumb',

  // Right Index
  Digit6: 'RightIndex', Digit7: 'RightIndex', KeyY: 'RightIndex', KeyU: 'RightIndex',
  KeyH: 'RightIndex', KeyJ: 'RightIndex', KeyN: 'RightIndex', KeyM: 'RightIndex',
  
  // Right Middle
  Digit8: 'RightMiddle', KeyI: 'RightMiddle', KeyK: 'RightMiddle', Comma: 'RightMiddle',
  
  // Right Ring
  Digit9: 'RightRing', KeyO: 'RightRing', KeyL: 'RightRing', Period: 'RightRing',
  
  // Right Pinky
  Digit0: 'RightPinky', Minus: 'RightPinky', Equal: 'RightPinky', Backspace: 'RightPinky',
  KeyP: 'RightPinky', BracketLeft: 'RightPinky', BracketRight: 'RightPinky', Backslash: 'RightPinky',
  Semicolon: 'RightPinky', Quote: 'RightPinky', Enter: 'RightPinky', Slash: 'RightPinky',
  ShiftRight: 'RightPinky', ControlRight: 'RightPinky'
};
