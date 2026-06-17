import type { Key, KeyboardLayout } from '../types/kle';

/**
 * Parses Keyboard Layout Editor (KLE) / Vial JSON format into an array of keys.
 * Handles x, y offsets, widths (w), and heights (h).
 *
 * @param jsonData Parsed JSON array of arrays from KLE
 * @returns KeyboardLayout object containing keys and total dimensions
 */
export function parseKLE(jsonData: unknown[], isSplit?: boolean): KeyboardLayout {
  const keys: Key[] = [];
  let currentY = 0;

  for (const row of jsonData) {
    // Top-level object in KLE specifies keyboard metadata (not a row of keys).
    if (!Array.isArray(row)) {
      continue;
    }

    let currentX = 0;
    let nextW = 1;
    let nextH = 1;
    let nextColor = '#333333';
    let nextTextColor = '#ffffff';

    for (const item of row) {
      if (typeof item === 'string') {
        // Key definition
        keys.push({
          x: currentX,
          y: currentY,
          w: nextW,
          h: nextH,
          label: item,
          c: nextColor,
          t: nextTextColor,
        });

        // Advance cursor
        currentX += nextW;

        // Reset single-key modifiers
        nextW = 1;
        nextH = 1;
      } else if (typeof item === 'object' && item !== null) {
        // Modifiers for the next key
        const mod = item as Record<string, unknown>;
        if (typeof mod.w === 'number') nextW = mod.w;
        if (typeof mod.h === 'number') nextH = mod.h;
        if (typeof mod.x === 'number') currentX += mod.x; // Horizontal gap
        if (typeof mod.y === 'number') currentY += mod.y; // Vertical gap
        if (typeof mod.c === 'string') nextColor = mod.c; // Background color
        if (typeof mod.t === 'string') nextTextColor = mod.t; // Text color
      }
    }
    // Next row
    currentY += 1;
  }

  // Calculate overall bounding box
  let maxWidth = 0;
  let maxHeight = 0;
  for (const k of keys) {
    if (k.x + k.w > maxWidth) maxWidth = k.x + k.w;
    if (k.y + k.h > maxHeight) maxHeight = k.y + k.h;
  }

  return {
    keys,
    width: maxWidth,
    height: maxHeight,
    isSplit,
  };
}

/**
 * Parses QMK/Vial keymap backup JSON into a standard split 3x5+3 layout.
 * Maps active keys from the matrix array layout[0] to visual positions.
 *
 * @param data Parsed JSON object of Vial backup
 * @returns KeyboardLayout
 */
export function parseVial(data: unknown): KeyboardLayout {
  const dataObj = data as { layout?: string[][][] };
  const matrix = dataObj.layout?.[0];
  if (!Array.isArray(matrix)) {
    throw new Error("Invalid Vial keymap layout matrix. Under 'layout', expected a 3D matrix.");
  }

  const keys: Key[] = [];

  const cleanKeycode = (code: string): string => {
    if (typeof code !== 'string') return '';
    if (code === '-1' || code === 'KC_NO') return '';

    // Match code like KC_A, or LSFT_T(KC_Z) / LCTL_T(KC_SCOLON)
    const match = code.match(/KC_([A-Z0-9_]+)/);
    if (match) {
      const core = match[1];
      const map: Record<string, string> = {
        SCOLON: ";",
        COMMA: ",",
        DOT: ".",
        SLASH: "/",
        BSPACE: "Backspace",
        ENTER: "Enter",
        SPACE: "Space",
        LCTRL: "Ctrl",
        LALT: "Alt",
        LSHIFT: "Shift",
        LGUI: "Win",
        MPLY: "Play",
        ESC: "Esc",
        TAB: "Tab",
        MINUS: "-",
        EQUAL: "=",
        LBRACKET: "[",
        RBRACKET: "]",
        BSLASH: "\\",
        QUOTE: "'",
        GRAVE: "`",
        CAPS: "Caps"
      };
      return map[core] || core;
    }

    if (code.startsWith("MO(")) {
      return code; // Keep layer toggles like MO(1), MO(2)
    }

    return code;
  };

  // Map mapped matrix cells
  const mappedCells = new Set<string>();

  // Left hand main grid: matrix row 4, 5, 6; col indices 10, 9, 8, 7, 6
  // Layout target positions: row = matrixRow - 4, col = 10 - matrixCol
  for (let r = 0; r < 3; r++) {
    const matrixRow = r + 4;
    if (!matrix[matrixRow]) continue;
    for (let c = 0; c < 5; c++) {
      const matrixCol = 10 - c;
      mappedCells.add(`${matrixRow},${matrixCol}`);
      const code = matrix[matrixRow][matrixCol];
      if (code && code !== '-1' && code !== 'KC_NO') {
        keys.push({
          x: c,
          y: r,
          w: 1,
          h: 1,
          label: cleanKeycode(code),
          c: '#333333',
          t: '#ffffff',
        });
      }
    }
  }

  // Left hand thumbs: matrix row 6 (col 11) -> visual x=2, y=3
  //                    matrix row 5 (col 11) -> visual x=3, y=3
  //                    matrix row 4 (col 11) -> visual x=4, y=3
  const leftThumbRows = [6, 5, 4];
  for (let i = 0; i < 3; i++) {
    const r = leftThumbRows[i];
    if (matrix[r]) {
      mappedCells.add(`${r},11`);
      const code = matrix[r][11];
      if (code && code !== '-1' && code !== 'KC_NO') {
        keys.push({
          x: 2 + i,
          y: 3,
          w: 1,
          h: 1,
          label: cleanKeycode(code),
          c: '#333333',
          t: '#ffffff',
        });
      }
    }
  }

  // Right hand main grid: matrix row 0, 1, 2; col indices 0, 1, 2, 3, 4
  // Layout target positions: row = matrixRow, col = 7 + matrixCol
  for (let r = 0; r < 3; r++) {
    if (!matrix[r]) continue;
    for (let c = 0; c < 5; c++) {
      mappedCells.add(`${r},${c}`);
      const code = matrix[r][c];
      if (code && code !== '-1' && code !== 'KC_NO') {
        keys.push({
          x: 7 + c,
          y: r,
          w: 1,
          h: 1,
          label: cleanKeycode(code),
          c: '#333333',
          t: '#ffffff',
        });
      }
    }
  }

  // Right hand thumbs: matrix row 0 (col 5) -> visual x=7, y=3
  //                     matrix row 1 (col 5) -> visual x=8, y=3
  //                     matrix row 2 (col 5) -> visual x=9, y=3
  for (let i = 0; i < 3; i++) {
    if (matrix[i]) {
      mappedCells.add(`${i},5`);
      const code = matrix[i][5];
      if (code && code !== '-1' && code !== 'KC_NO') {
        keys.push({
          x: 7 + i,
          y: 3,
          w: 1,
          h: 1,
          label: cleanKeycode(code),
          c: '#333333',
          t: '#ffffff',
        });
      }
    }
  }

  // Check for unmapped keys in the matrix
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      if (mappedCells.has(`${r},${c}`)) continue;
      const code = row[c];
      if (code && code !== '-1' && code !== 'KC_NO') {
        throw new Error(`Vialレイアウトに未対応のキーが含まれています (Row ${r}, Col ${c}: ${code})。\n完全なカスタム配列を使用する場合は、KLE形式のJSONを利用してください。`);
      }
    }
  }

  return {
    keys,
    width: 12,
    height: 4,
    isSplit: true
  };
}

/**
 * Parses uploaded JSON contents, identifying whether it is a KLE or Vial keymap format.
 */
export function parseLayoutJSON(jsonContent: string, isSplit: boolean): KeyboardLayout {
  const data = JSON.parse(jsonContent);
  if (Array.isArray(data)) {
    return parseKLE(data, isSplit);
  } else if (data && typeof data === 'object' && 'layout' in data && Array.isArray(data.layout)) {
    return parseVial(data);
  }
  throw new Error("Unsupported layout JSON format. Must be a KLE array or a Vial backup object.");
}

