import React from 'react';
import type { KeyboardLayout } from '../../types/kle';
import type { KeystrokeStats } from '../../domain/keystrokeStats';
import { useLanguage } from '../../hooks/useLanguage';
import { matchKLEKey } from '../../utils/keyMap';
import '../../styles/keyboard.css';

interface KeyboardHeatmapProps {
  layout: KeyboardLayout;
  byCode: KeystrokeStats['byCode'];
  unitSize?: number;
  gap?: number;
}

export const KeyboardHeatmap: React.FC<KeyboardHeatmapProps> = ({
  layout,
  byCode,
  unitSize = 44,
  gap = 6
}) => {
  const { t } = useLanguage();

  const containerStyle: React.CSSProperties = {
    width: layout.width * unitSize,
    height: layout.height * unitSize,
    padding: `${gap / 2}px`,
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
        
        let judged = 0;
        let errors = 0;
        let unknown = 0;

        for (const [code, counts] of byCode) {
          if (matchKLEKey(key.label, code)) {
            judged += counts.correct + counts.wrong;
            errors += counts.wrong;
            unknown += counts.unknown;
          }
        }

        const errorRate = judged > 0 ? errors / judged : 0;
        const bg = judged > 0
          ? getHeatColor(errorRate)
          : unknown > 0 ? '#55555f' : 'rgba(40, 40, 45, 0.4)';

        return (
          <div
            key={index}
            className="vk-key heatmap-key"
            style={{
              position: 'absolute',
              left: `${left + gap / 2}px`,
              top: `${top + gap / 2}px`,
              width: `${width}px`,
              height: `${height}px`,
              backgroundColor: bg,
              border: judged > 0 && errorRate === 0 ? '1px solid #00ff00' : (errorRate > 0 ? '1px solid #ff4444' : '1px solid rgba(255,255,255,0.1)'),
            }}
          >
            <div className="heatmap-key-label">{key.label}</div>
            {judged > 0 && (
              <div className={`heatmap-key-stat${errorRate > 0 ? ' is-error' : ' is-clean'}`}>
                {Math.round(errorRate * 100)}%
              </div>
            )}
            {unknown > 0 && (
              <div className="heatmap-key-stat is-unknown" title={t('analysis.unknown')}>
                ?{unknown}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
