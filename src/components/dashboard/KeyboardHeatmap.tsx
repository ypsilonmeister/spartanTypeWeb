import React, { useMemo } from 'react';
import type { KeyboardLayout } from '../../types/kle';
import type { KeystrokeLog } from '../../utils/TypingEngine';
import { matchKLEKey } from '../../utils/keyMap';
import '../../styles/keyboard.css';

interface KeyboardHeatmapProps {
  layout: KeyboardLayout;
  keystrokes: KeystrokeLog[];
  unitSize?: number;
  gap?: number;
}

export const KeyboardHeatmap: React.FC<KeyboardHeatmapProps> = ({
  layout,
  keystrokes,
  unitSize = 44,
  gap = 6
}) => {
  const heatmapData = useMemo(() => {
    // code -> { total, errors }
    const map = new Map<string, { total: number, errors: number }>();
    
    keystrokes.forEach(ks => {
      const current = map.get(ks.code) || { total: 0, errors: 0 };
      current.total++;
      if (!ks.isCorrectFinger) {
        current.errors++;
      }
      map.set(ks.code, current);
    });

    return map;
  }, [keystrokes]);

  const containerStyle: React.CSSProperties = {
    width: layout.width * unitSize,
    height: layout.height * unitSize,
    position: 'relative',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '12px',
    padding: `${gap / 2}px`,
    boxSizing: 'content-box'
  };

  const getHeatColor = (errorRate: number) => {
    if (errorRate === 0) return 'rgba(40, 40, 45, 0.8)'; // Default dark
    // Gradient from dark to red based on error rate
    // errorRate is 0 to 1
    const r = Math.min(255, 40 + errorRate * 215);
    const g = Math.max(40, 40 - errorRate * 40);
    const b = Math.max(45, 45 - errorRate * 45);
    return `rgba(${r}, ${g}, ${b}, 0.9)`;
  };

  return (
    <div className="virtual-keyboard heatmap" style={containerStyle}>
      {layout.keys.map((key, index) => {
        const left = key.x * unitSize;
        const top = key.y * unitSize;
        const width = key.w * unitSize - gap;
        const height = key.h * unitSize - gap;
        
        // Find if this key has data. 
        let errorRate = 0;
        let total = 0;
        
        for (const [code, data] of heatmapData.entries()) {
          if (matchKLEKey(key.label, code)) {
            total += data.total;
            errorRate += data.errors;
          }
        }
        
        if (total > 0) {
          errorRate = errorRate / total;
        }

        const bg = total > 0 ? getHeatColor(errorRate) : 'rgba(40, 40, 45, 0.4)';

        return (
          <div
            key={index}
            className="vk-key"
            style={{
              position: 'absolute',
              left: `${left + gap / 2}px`,
              top: `${top + gap / 2}px`,
              width: `${width}px`,
              height: `${height}px`,
              backgroundColor: bg,
              border: total > 0 && errorRate === 0 ? '1px solid #00ff00' : (errorRate > 0 ? '1px solid #ff4444' : '1px solid rgba(255,255,255,0.1)'),
              color: '#ffffff',
              fontSize: '11px',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '2px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontWeight: '500', lineHeight: '1.2' }}>{key.label}</div>
            {total > 0 && (
              <div style={{ fontSize: '9px', opacity: 0.9, marginTop: '2px', fontWeight: 'bold', color: errorRate > 0 ? '#ff4444' : '#00ff00' }}>
                {Math.round(errorRate * 100)}%
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
