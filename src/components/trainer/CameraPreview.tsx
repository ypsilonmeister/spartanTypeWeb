import React, { useEffect, useRef, useState } from 'react';
import { useWebcam } from '../../hooks/useWebcam';
import { HandTracker } from '../../utils/handTracker';
import { DrawingUtils, HandLandmarker } from '@mediapipe/tasks-vision';
import '../../styles/cameraPreview.css';

interface CameraPreviewProps {
  onPointerUpdate?: (pt: { x: number, y: number } | null) => void;
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({ onPointerUpdate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { error } = useWebcam(videoRef);
  const [isReady, setIsReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const onPointerUpdateRef = useRef(onPointerUpdate);
  useEffect(() => {
    onPointerUpdateRef.current = onPointerUpdate;
  }, [onPointerUpdate]);

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
        console.error("CameraPreview: HandTracker failed to initialize", err);
        setModelError(err instanceof Error ? err.message : "HandTracker failed to load.");
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
          // Resize canvas to match video intrinsic size
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          ctx.save();
          // Draw video (mirrored for user-facing camera)
          ctx.scale(-1, 1);
          ctx.translate(-canvas.width, 0);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Detect hands using video.currentTime to prevent duplicate processing warnings
          if (video.currentTime !== lastVideoTime) {
            const startTimeMs = performance.now();
            const results = HandTracker.getInstance().detectForVideo(video, startTimeMs);
            lastVideoTime = video.currentTime;

            if (results && results.landmarks) {
              for (const landmarks of results.landmarks) {
                // The drawing utils don't automatically mirror, but since the context is 
                // already scaled(-1, 1) and translated, drawing at the normalized 
                // coordinates mapped to canvas width/height will be mirrored perfectly.
                drawingUtils?.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
                  color: '#00FF00',
                  lineWidth: 3,
                });
                drawingUtils?.drawLandmarks(landmarks, {
                  color: '#FF0000',
                  lineWidth: 2,
                  radius: 3,
                });
                const indexTip = landmarks[8];

                // Notify parent of index finger coordinate
                if (onPointerUpdateRef.current) {
                  onPointerUpdateRef.current({
                    x: (1 - indexTip.x) * canvas.width,
                    y: indexTip.y * canvas.height
                  });
                }
              }
            } else {
              // No hand detected
              if (onPointerUpdateRef.current) {
                onPointerUpdateRef.current(null);
              }
            }
          }
          ctx.restore();
        }
        animationFrameId = requestAnimationFrame(renderLoop);
      };

      renderLoop();
    };

    initializeAndRender();

    return () => {
      isMounted = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return (
    <div className="camera-preview-container">
      {(error || modelError) && <div className="error-message">{error || modelError}</div>}
      {!isReady && !error && !modelError && <div className="loading-message">Initializing AI Models...</div>}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />
      <canvas ref={canvasRef} className="camera-canvas" />
    </div>
  );
};
