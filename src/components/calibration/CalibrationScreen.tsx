import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useWebcam } from '../../hooks/useWebcam';
import { HandTracker } from '../../utils/handTracker';
import { DrawingUtils, HandLandmarker } from '@mediapipe/tasks-vision';
import { useCalibration } from '../../hooks/useCalibration';
import type { KeyboardLayout } from '../../types/kle';
import { VirtualKeyboard } from '../common/VirtualKeyboard';
import { computeHomography, applyHomography } from '../../utils/homography';
import type { Point, HomographyMatrix } from '../../utils/homography';
import '../../styles/cameraPreview.css';

interface CalibrationScreenProps {
  layout: KeyboardLayout;
  onComplete: (homography: number[]) => void;
  targetCorners: Point[]; // The 4 logical coordinates of the keyboard layout corners
}

export const CalibrationScreen: React.FC<CalibrationScreenProps> = ({ layout, onComplete, targetCorners }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { error } = useWebcam(videoRef);
  const [isReady, setIsReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [previewPointer, setPreviewPointer] = useState<Point | null>(null);
  
  const latestFingerPosRef = useRef<Point | null>(null);
  const { step, recordPoint, homography, srcPoints, resetCalibration } = useCalibration(targetCorners);

  // Keep track of the inverse homography matrix to draw outline on camera preview
  const invHomographyRef = useRef<HomographyMatrix | null>(null);

  // Compute inverse homography when calibration is complete
  useEffect(() => {
    if (step === 4 && homography && srcPoints.length === 4) {
      invHomographyRef.current = computeHomography(targetCorners, srcPoints);
    } else {
      invHomographyRef.current = null;
    }
  }, [step, homography, srcPoints, targetCorners]);

  useEffect(() => {
    let animationFrameId: number;
    let drawingUtils: DrawingUtils | null = null;
    let lastVideoTime = -1;
    let isMounted = true;

    const initializeAndRender = async () => {
      try {
        const tracker = HandTracker.getInstance();
        await tracker.initialize();
        if (!isMounted) return;
        setIsReady(true);
      } catch (err) {
        if (!isMounted) return;
        console.error("Failed to init HandTracker in Calibration", err);
        setModelError(err instanceof Error ? err.message : "Failed to load AI model.");
        return;
      }

      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawingUtils = new DrawingUtils(ctx);

      const renderLoop = () => {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          // Fix MediaPipe IMAGE_DIMENSIONS warning by explicitly setting attributes
          if (video.width !== video.videoWidth) video.width = video.videoWidth;
          if (video.height !== video.videoHeight) video.height = video.videoHeight;

          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          ctx.save();
          // Mirror image for user facing camera
          ctx.scale(-1, 1);
          ctx.translate(-canvas.width, 0);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          if (video.currentTime !== lastVideoTime) {
            const results = HandTracker.getInstance().detectForVideo(video, performance.now());
            lastVideoTime = video.currentTime;

            latestFingerPosRef.current = null; // Reset if no hand is found

            if (results && results.landmarks && results.landmarks.length > 0) {
              const landmarks = results.landmarks[0];
              
              drawingUtils?.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
                color: '#00FF00',
                lineWidth: 2,
              });
              drawingUtils?.drawLandmarks(landmarks, {
                color: '#FF0000',
                lineWidth: 1,
                radius: 2,
              });

              const indexTip = landmarks[8];
              if (indexTip) {
                const screenPt = {
                  x: (1 - indexTip.x) * canvas.width,
                  y: indexTip.y * canvas.height
                };
                latestFingerPosRef.current = screenPt;

                // Draw a strong highlight on the index finger tip in the mirrored context
                ctx.beginPath();
                ctx.arc(indexTip.x * canvas.width, indexTip.y * canvas.height, 10, 0, 2 * Math.PI);
                ctx.fillStyle = '#00FFFF';
                ctx.fill();
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 2;
                ctx.stroke();

                // If calibration is complete, map pointer for live preview
                if (homography) {
                  const mapped = applyHomography(homography, screenPt);
                  setPreviewPointer(mapped);
                }
              }
            } else {
              setPreviewPointer(null);
            }
          }
          ctx.restore();

          // Draw the physical keyboard overlay if we have inverse homography
          if (invHomographyRef.current) {
            const tl = applyHomography(invHomographyRef.current, { x: 0, y: 0 });
            const tr = applyHomography(invHomographyRef.current, { x: targetCorners[1].x, y: targetCorners[1].y });
            const br = applyHomography(invHomographyRef.current, { x: targetCorners[2].x, y: targetCorners[2].y });
            const bl = applyHomography(invHomographyRef.current, { x: targetCorners[3].x, y: targetCorners[3].y });

            ctx.beginPath();
            ctx.moveTo(tl.x, tl.y);
            ctx.lineTo(tr.x, tr.y);
            ctx.lineTo(br.x, br.y);
            ctx.lineTo(bl.x, bl.y);
            ctx.closePath();

            ctx.strokeStyle = '#00ffcc';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00ffcc';
            ctx.stroke();
            ctx.shadowBlur = 0; // reset
            
            // Draw translucent overlay
            ctx.fillStyle = 'rgba(0, 255, 204, 0.15)';
            ctx.fill();
          }
        }
        animationFrameId = requestAnimationFrame(renderLoop);
      };

      renderLoop();
    };

    initializeAndRender();
    return () => {
      isMounted = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [homography, step, targetCorners]);

  const handleConfirm = useCallback(() => {
    if (latestFingerPosRef.current) {
      const { x, y } = latestFingerPosRef.current;
      
      // Prevent registering duplicate/extremely close points (e.g. background noise or accidental double click)
      if (srcPoints.length > 0) {
        const lastPt = srcPoints[srcPoints.length - 1];
        const dist = Math.hypot(x - lastPt.x, y - lastPt.y);
        if (dist < 30) {
          alert("前回記録した位置と近すぎます。正しい角に指を動かし、カメラプレビューの「青い円」が指先に追従していることを確認してください。");
          return;
        }
      }

      recordPoint(x, y);
    } else {
      alert("指先が検出されていません。カメラに手をかざしてください。");
    }
  }, [recordPoint, srcPoints]);

  // Allow pressing Space to confirm
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && step < 4 && isReady) {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleConfirm, step, isReady]);

  const corners = ['左上 (Top-Left)', '右上 (Top-Right)', '右下 (Bottom-Right)', '左下 (Bottom-Left)'];
  const currentInstruction = step < 4 
    ? `キーボードの「${corners[step]}」の角を人差し指で指し、固定した状態でボタン（またはSpaceキー）を押してください。`
    : 'キャリブレーション完了！';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '100%', maxWidth: '800px', margin: '0 auto' }}>
      <div className="camera-preview-container">
        {(error || modelError) && <div className="error-message">{error || modelError}</div>}
        {!isReady && !error && !modelError && <div className="loading-message">Initializing AI Models...</div>}
        <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />
        <canvas ref={canvasRef} className="camera-canvas" />
      </div>
      
      <div style={{ 
        background: 'rgba(255,255,255,0.05)', 
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(10px)',
        padding: '1.5rem', 
        borderRadius: '16px', 
        width: '100%', 
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
      }}>
        {step < 4 ? (
          <>
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.4rem', fontWeight: 500, letterSpacing: '1px' }}>
              キャリブレーション (Step {step + 1}/4)
            </h2>
            <p style={{ margin: '0 0 1.5rem 0', color: '#aaa', fontSize: '1.1rem', lineHeight: 1.5 }}>
              {currentInstruction}
            </p>
            
            {/* Debug srcPoints */}
            {srcPoints.length > 0 && (
              <div style={{ marginBottom: '1.5rem', fontSize: '0.9rem', color: '#00adb5', display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                {srcPoints.map((pt, i) => (
                  <span key={i} style={{ background: 'rgba(0,173,181,0.1)', padding: '0.25rem 0.6rem', borderRadius: '4px', border: '1px solid rgba(0,173,181,0.2)' }}>
                    角 {i + 1}: ({Math.round(pt.x)}, {Math.round(pt.y)})
                  </span>
                ))}
              </div>
            )}

            <button 
              onClick={handleConfirm}
              disabled={!isReady}
              style={{
                background: 'linear-gradient(135deg, #00adb5, #007a82)',
                color: '#fff',
                border: 'none',
                padding: '1rem 3rem',
                fontSize: '1.2rem',
                borderRadius: '50px',
                cursor: !isReady ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(0, 173, 181, 0.4)',
                transition: 'transform 0.1s, box-shadow 0.1s'
              }}
            >
              ここを記録 (Space)
            </button>
          </>
        ) : (
          <>
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.4rem', fontWeight: 500, letterSpacing: '1px', color: '#00ffcc' }}>
              ✓ キャリブレーションが完了しました
            </h2>
            <p style={{ margin: '0 0 1.5rem 0', color: '#ccc', fontSize: '1.0rem', lineHeight: 1.5 }}>
              カメラ映像の上に水色のキーボード枠線が表示されています。カメラの前で指を動かしたとき、<br />
              下の仮想キーボード上の正しいキー位置に<b>水色のポインター</b>が追従することを確認してください。
            </p>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <button 
                onClick={() => {
                  if (homography) {
                    onComplete(homography);
                  }
                }}
                style={{
                  background: 'linear-gradient(135deg, #00ffcc, #00b38f)',
                  color: '#111',
                  border: 'none',
                  padding: '1rem 2.5rem',
                  fontSize: '1.1rem',
                  borderRadius: '50px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 12px rgba(0, 255, 204, 0.4)',
                }}
              >
                この設定で決定して練習へ進む
              </button>
              <button 
                onClick={resetCalibration}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  padding: '1rem 2.5rem',
                  fontSize: '1.1rem',
                  borderRadius: '50px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'background 0.2s'
                }}
              >
                やり直す (Reset)
              </button>
            </div>
            
            <div style={{ position: 'relative', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '12px', display: 'inline-block' }}>
              <VirtualKeyboard 
                layout={layout}
                unitSize={40}
                gap={5}
                pointers={previewPointer ? [previewPointer] : []}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
