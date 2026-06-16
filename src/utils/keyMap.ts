/**
 * Maps physical keyboard Event.code to standard QWERTY KLE labels.
 * This ensures symbols and modifiers match the virtual keyboard layout exactly.
 */
export const codeToKLELabelMap: Record<string, string> = {
  // Alphabet
  KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R', KeyT: 'T', KeyY: 'Y', KeyU: 'U', KeyI: 'I', KeyO: 'O', KeyP: 'P',
  KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyJ: 'J', KeyK: 'K', KeyL: 'L',
  KeyZ: 'Z', KeyX: 'X', KeyC: 'C', KeyV: 'V', KeyB: 'B', KeyN: 'N', KeyM: 'M',
  
  // Digits (Often mapped to symbols in KLE with \n)
  Digit1: '!\n1', Digit2: '@\n2', Digit3: '#\n3', Digit4: '$\n4', Digit5: '%\n5',
  Digit6: '^\n6', Digit7: '&\n7', Digit8: '*\n8', Digit9: '(\n9', Digit0: ')\n0',
  
  // Punctuation
  Minus: '_\n-', Equal: '+\n=',
  BracketLeft: '{\n[', BracketRight: '}\n]', Backslash: '|\n\\',
  Semicolon: ':\n;', Quote: '"\n\'',
  Comma: '<\n,', Period: '>\n.', Slash: '?\n/',
  Backquote: '~\n`',
  
  // Modifiers and special keys
  Space: '', // KLE often leaves spacebar empty or named ''
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  ShiftLeft: 'Shift', ShiftRight: 'Shift',
  ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
  AltLeft: 'Alt', AltRight: 'Alt',
  MetaLeft: 'Win', MetaRight: 'Win',
  Escape: 'Esc',
  CapsLock: 'Caps Lock'
};

/**
 * Normalizes a key label from KLE for exact matching against physical code.
 */
export function matchKLEKey(kleLabel: string, physicalCode: string): boolean {
  const expectedLabel = codeToKLELabelMap[physicalCode];
  if (expectedLabel === undefined) return false;
  
  // Space is a special case: often empty label in KLE
  if (physicalCode === 'Space') {
    return kleLabel === '' || kleLabel.toLowerCase() === 'space';
  }

  // Exact match handles line breaks in KLE correctly
  return kleLabel === expectedLabel;
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
