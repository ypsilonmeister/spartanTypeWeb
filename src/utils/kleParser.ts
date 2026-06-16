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
