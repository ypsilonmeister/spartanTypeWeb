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
  /** Currently pressed physical key code to highlight */
  activeKeyCode?: string | null;
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  layout,
  unitSize = 48, // Default 48px per 1U
  gap = 4,
  pointers = [],
  activeKeyCode = null,
}) => {
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

        return (
          <div
            key={`${key.x}-${key.y}-${index}`}
            className="vk-key"
            style={{
              left: `${left + gap / 2}px`,
              top: `${top + gap / 2}px`,
              width: `${width}px`,
              height: `${height}px`,
              backgroundColor: isActive ? '#00adb5' : (key.c || '#333333'),
              color: isActive ? '#ffffff' : (key.t || '#ffffff'),
              boxShadow: isActive ? '0 0 15px rgba(0, 173, 181, 0.8)' : 'none',
              transform: isActive ? 'translateY(2px)' : 'none',
              transition: 'background-color 0.1s, transform 0.1s',
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
          style={{
            position: 'absolute',
            left: p.x * unitSize,
            top: p.y * unitSize,
            width: '12px',
            height: '12px',
            backgroundColor: '#00ffff',
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 10px #00ffff',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>
  );
};
