import React, { useMemo } from 'react';
import { matchKLEKey } from '../../utils/keyMap';
import type { KeyboardLayout } from '../../types/kle';
import '../../styles/keyboard.css';

interface VirtualKeyboardProps {
  layout: KeyboardLayout;
  /** The size of 1U in pixels */
  unitSize?: number;
  /** Gap between keys in pixels */
  gap?: number;
  /** Points to overlay on the keyboard (in layout coordinate space U) */
  pointers?: { x: number, y: number }[];
  /** Calibrated home position anchors to show on screen */
  homePointers?: { x: number, y: number }[];
  /** Currently pressed physical key code to highlight */
  activeKeyCode?: string | null;
  /** Expected key index in the layout to highlight for calibration guidance */
  targetKeyIndex?: number | null;
  /** Multiple key indices to highlight simultaneously (e.g. home-row capture) */
  highlightKeyIndices?: number[];
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  layout,
  unitSize = 48, // Default 48px per 1U
  gap = 4,
  pointers = [],
  homePointers = [],
  activeKeyCode = null,
  targetKeyIndex = null,
  highlightKeyIndices = [],
}) => {
  const highlightSet = useMemo(() => new Set(highlightKeyIndices), [highlightKeyIndices]);
  const containerStyle: React.CSSProperties = useMemo(() => ({
    width: layout.width * unitSize,
    height: layout.height * unitSize,
  }), [layout.width, layout.height, unitSize]);

  return (
    <div className="virtual-keyboard" style={containerStyle}>
      {layout.keys.map((key, index) => {
        const left = key.x * unitSize;
        const top = key.y * unitSize;
        // Subtract gap to leave visual space between keys
        const width = key.w * unitSize - gap;
        const height = key.h * unitSize - gap;
        const isActive = activeKeyCode ? matchKLEKey(key.label, activeKeyCode) : false;
        
        const isTarget =
          (targetKeyIndex !== null && targetKeyIndex !== undefined && index === targetKeyIndex) ||
          highlightSet.has(index);

        let bg = key.c || '#333333';
        let tc = key.t || '#ffffff';
        let glow = 'none';
        let trans = 'none';

        if (isActive) {
          bg = '#00adb5';
          tc = '#ffffff';
          glow = '0 0 15px rgba(0, 173, 181, 0.8)';
          trans = 'translateY(2px)';
        } else if (isTarget) {
          bg = '#ff007f'; // Bioluminescent pink for targets!
          tc = '#ffffff';
          glow = '0 0 20px rgba(255, 0, 127, 0.8)';
        }

        return (
          <div
            key={`${key.x}-${key.y}-${index}`}
            className="vk-key"
            style={{
              left: `${left + gap / 2}px`,
              top: `${top + gap / 2}px`,
              width: `${width}px`,
              height: `${height}px`,
              backgroundColor: bg,
              color: tc,
              boxShadow: glow,
              transform: trans,
            }}
          >
            {key.label}
          </div>
        );
      })}
      
      {/* Draw pointers (e.g., mapped finger coordinates) */}
      {pointers.map((p, i) => (
        <div
          key={`pointer-${i}`}
          className="vk-pointer"
          style={{
            left: p.x * unitSize,
            top: p.y * unitSize,
          }}
        />
      ))}

      {/* Draw home pointers (neon targeting rings) */}
      {homePointers.map((p, i) => (
        <div
          key={`home-pointer-${i}`}
          className="vk-home-pointer"
          style={{
            left: p.x * unitSize,
            top: p.y * unitSize,
          }}
        />
      ))}
    </div>
  );
};
