export interface Key {
  /** X coordinate in key units (U) */
  x: number;
  /** Y coordinate in key units (U) */
  y: number;
  /** Width in key units (U) */
  w: number;
  /** Height in key units (U) */
  h: number;
  /** Label/Legend of the key */
  label: string;
  /** Background color (optional, for aesthetics) */
  c?: string;
  /** Text color (optional) */
  t?: string;
}

export interface KeyboardLayout {
  keys: Key[];
  /** Overall width of the keyboard layout in U */
  width: number;
  /** Overall height of the keyboard layout in U */
  height: number;
  /** Whether the layout is split */
  isSplit?: boolean;
}
