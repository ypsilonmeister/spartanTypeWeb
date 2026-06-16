// Layout templates in KLE format.
// Simple, flat, single-level structures that parseKLE can understand.

export const US_60_STANDARD_DATA: unknown[] = [
  [{ a: 4 }, "`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", { w: 2 }, "Backspace"],
  [{ w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", { w: 1.5 }, "\\"],
  [{ w: 1.75 }, "Caps Lock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", { w: 2.25 }, "Enter"],
  [{ w: 2.25 }, "Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", { w: 2.75 }, "Shift"],
  [{ w: 1.25 }, "Ctrl", { w: 1.25 }, "Win", { w: 1.25 }, "Alt", { w: 6.25 }, "", { w: 1.25 }, "Alt", { w: 1.25 }, "Win", { w: 1.25 }, "Menu", { w: 1.25 }, "Ctrl"]
];

export const JIS_60_STANDARD_DATA: unknown[] = [
  [{ a: 4 }, "半角", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "^", "¥", "BS"],
  [{ w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "@", "[", { w: 1.5 }, "Enter"],
  [{ w: 1.75 }, "Caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", ":", "]"],
  [{ w: 2.25 }, "Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "_", { w: 1.75 }, "Shift"],
  [{ w: 1.25 }, "Ctrl", { w: 1 }, "Win", { w: 1.25 }, "Alt", { w: 1 }, "無変換", { w: 3.5 }, "Space", { w: 1 }, "変換", { w: 1 }, "かな", { w: 1.25 }, "Alt", { w: 1.25 }, "Ctrl"]
];

export const US_60_SPLIT_DATA: unknown[] = [
  [{ a: 4 }, "`", "1", "2", "3", "4", "5", "6", { x: 2 }, "7", "8", "9", "0", "-", "=", "Backspace"],
  [{ w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", { x: 2 }, "Y", "U", "I", "O", "P", "[", "]", { w: 1.5 }, "\\"],
  [{ w: 1.75 }, "Caps", "A", "S", "D", "F", "G", { x: 2 }, "H", "J", "K", "L", ";", "'", { w: 2.25 }, "Enter"],
  [{ w: 2.25 }, "Shift", "Z", "X", "C", "V", "B", { x: 2 }, "N", "M", ",", ".", "/", { w: 2.75 }, "Shift"],
  [{ w: 1.25 }, "Ctrl", { w: 1.25 }, "Win", { w: 1.25 }, "Alt", { w: 3 }, "Space", { x: 2, w: 3 }, "Space", { w: 1.25 }, "Alt", { w: 1.25 }, "Win", { w: 1.25 }, "Ctrl"]
];

export const JIS_60_SPLIT_DATA: unknown[] = [
  [{ a: 4 }, "半角", "1", "2", "3", "4", "5", "6", { x: 2 }, "7", "8", "9", "0", "-", "^", "¥", "BS"],
  [{ w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", { x: 2 }, "Y", "U", "I", "O", "P", "@", "[", { w: 1.5 }, "Enter"],
  [{ w: 1.75 }, "Caps", "A", "S", "D", "F", "G", { x: 2 }, "H", "J", "K", "L", ";", ":", "]"],
  [{ w: 2.25 }, "Shift", "Z", "X", "C", "V", "B", { x: 2 }, "N", "M", ",", ".", "/", "_", { w: 1.75 }, "Shift"],
  [{ w: 1.25 }, "Ctrl", { w: 1 }, "Win", { w: 1.25 }, "Alt", "無変換", { w: 2.25 }, "Space", { x: 2, w: 2.25 }, "Space", "変換", "かな", { w: 1.25 }, "Alt", { w: 1.25 }, "Ctrl"]
];

export type LayoutPresetId = 'us-standard' | 'jis-standard' | 'us-split' | 'jis-split';

export const LAYOUT_PRESETS: Record<LayoutPresetId, { name: string, data: unknown[], isSplit: boolean }> = {
  'us-standard': {
    name: 'US Standard 60%',
    data: US_60_STANDARD_DATA,
    isSplit: false
  },
  'jis-standard': {
    name: 'JIS Standard 60%',
    data: JIS_60_STANDARD_DATA,
    isSplit: false
  },
  'us-split': {
    name: 'US Split 60%',
    data: US_60_SPLIT_DATA,
    isSplit: true
  },
  'jis-split': {
    name: 'JIS Split 60%',
    data: JIS_60_SPLIT_DATA,
    isSplit: true
  }
};
