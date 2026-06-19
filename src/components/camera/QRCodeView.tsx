import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeViewProps {
  /** QR にエンコードする文字列。 */
  value: string;
  size?: number;
}

/**
 * 文字列を QR コードとして <canvas> に描画する。
 * SDP は長くなり 1 つの QR に収まらないことがあるため、収まらない場合は
 * エラーを表示して呼び出し側のコピペ用テキスト欄にフォールバックさせる。
 */
export const QRCodeView: React.FC<QRCodeViewProps> = ({ value, size = 240 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooLong, setTooLong] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setTooLong(false);
    QRCode.toCanvas(
      canvas,
      value,
      { width: size, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0a0a0e', light: '#ffffff' } },
      (err) => {
        if (err) {
          // データが大きすぎて QR にできない場合 (典型的に長い SDP)
          console.warn('QR generation failed (data likely too large):', err);
          setTooLong(true);
        }
      }
    );
  }, [value, size]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      <canvas ref={canvasRef} style={{ borderRadius: '8px', display: tooLong ? 'none' : 'block' }} />
      {tooLong && (
        <div style={{ color: '#ffcc00', fontSize: '0.8rem', textAlign: 'center', maxWidth: size }}>
          ⚠️ コードが長すぎて QR にできません。下のテキストをコピーして渡してください。
        </div>
      )}
    </div>
  );
};
