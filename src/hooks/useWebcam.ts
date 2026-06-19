import { useState, useEffect } from 'react';
import type { RefObject } from 'react';

export function useWebcam(
  videoRef: RefObject<HTMLVideoElement | null>,
  facingMode: 'user' | 'environment' = 'user',
  enabled: boolean = true
) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // enabled=false のときはカメラを取得しない (リモートソース選択時に
    // PC のローカルカメラを無駄に起動・権限要求しないため)。
    if (!enabled) return;

    let activeStream: MediaStream | null = null;
    let isMounted = true;

    async function startWebcam() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          // Prefer higher resolution but let the browser decide what's available.
          // facingMode: 'user' は内向き(PC内蔵), 'environment' はスマホ背面カメラ向け。
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        });

        if (!isMounted) {
          mediaStream.getTracks().forEach(track => track.stop());
          return;
        }

        activeStream = mediaStream;
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(e => {
            console.error('Failed to play video automatically:', e);
          });
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to access webcam.');
      }
    }

    startWebcam();

    return () => {
      isMounted = false;
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
      // 無効化/アンマウント時は stream をクリア (cleanup 内の setState は許容される)。
      setStream(null);
    };
  }, [videoRef, facingMode, enabled]);

  return { stream, error };
}
