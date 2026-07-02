import { useEffect, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { DrawingUtils, HandLandmarker } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { HandTracker } from '../utils/handTracker';
import { mapMediaPipeResults } from '../utils/mediapipeUtils';
import {
  applyCalibrationHomography,
  pickOuterHands,
} from '../domain/handGeometry';
import type { Point } from '../types/geometry';
import type { CalibrationHomography } from '../types/calibration';
import type { CalibrationPhase, CapturedPoint } from '../types/calibrationFlow';
import type { HandSide } from '../utils/calibrationAnchors';
import { FINGERTIP_LANDMARK } from '../utils/calibrationAnchors';

export type CalibrationRawHand = { landmarks: { x: number; y: number }[] };

interface UseCalibrationHandRendererOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  isMirrored: boolean;
  phase: CalibrationPhase;
  computedHomography: CalibrationHomography | null;
  captured: CapturedPoint[];
  draggedPointIndex: number | null;
  latestHandsRef: RefObject<CalibrationRawHand[]>;
  setPreviewPointers: Dispatch<SetStateAction<Point[]>>;
  setIsReady: Dispatch<SetStateAction<boolean>>;
  setModelError: Dispatch<SetStateAction<string | null>>;
}

export function useCalibrationHandRenderer({
  videoRef,
  canvasRef,
  isMirrored,
  phase,
  computedHomography,
  captured,
  draggedPointIndex,
  latestHandsRef,
  setPreviewPointers,
  setIsReady,
  setModelError,
}: UseCalibrationHandRendererOptions) {
  const isMirroredRef = useRef(isMirrored);
  const capturedRef = useRef(captured);
  const draggedPointIndexRef = useRef<number | null>(draggedPointIndex);
  const computedHomographyRef = useRef(computedHomography);
  const phaseRef = useRef(phase);

  useEffect(() => {
    isMirroredRef.current = isMirrored;
  }, [isMirrored]);

  useEffect(() => {
    capturedRef.current = captured;
  }, [captured]);

  useEffect(() => {
    draggedPointIndexRef.current = draggedPointIndex;
  }, [draggedPointIndex]);

  useEffect(() => {
    computedHomographyRef.current = computedHomography;
  }, [computedHomography]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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
        console.error('Failed to init HandTracker in Calibration', err);
        setModelError(err instanceof Error ? err.message : 'Failed to load AI model.');
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
          if (video.width !== video.videoWidth) video.width = video.videoWidth;
          if (video.height !== video.videoHeight) video.height = video.videoHeight;
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          ctx.save();
          const mirror = isMirroredRef.current;
          if (mirror) {
            ctx.scale(-1, 1);
            ctx.translate(-canvas.width, 0);
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          if (video.currentTime !== lastVideoTime) {
            const results = HandTracker.getInstance().detectForVideo(video, performance.now());
            lastVideoTime = video.currentTime;

            const hands: CalibrationRawHand[] = [];
            const mappedPointersList: Point[] = [];

            if (results && results.landmarks && results.landmarks.length > 0) {
              const handsData = mapMediaPipeResults(results);
              for (const hand of handsData) {
                hands.push({ landmarks: hand.landmarks });
              }

              const sides = pickOuterHands(hands, canvas.width, mirror);
              const sideOf = (h: CalibrationRawHand): HandSide =>
                h === sides.Left ? 'Left' : h === sides.Right ? 'Right' : 'Left';

              for (const hand of hands) {
                const side = sideOf(hand);
                const color = side === 'Left' ? '#00adb5' : '#ff007f';

                drawingUtils?.drawConnectors(
                  hand.landmarks as NormalizedLandmark[],
                  HandLandmarker.HAND_CONNECTIONS,
                  { color, lineWidth: 2 }
                );
                drawingUtils?.drawLandmarks(hand.landmarks as NormalizedLandmark[], {
                  color: '#ffffff',
                  lineWidth: 1,
                  radius: 2,
                });

                for (const lm of Object.values(FINGERTIP_LANDMARK)) {
                  const tip = hand.landmarks[lm];
                  if (!tip) continue;
                  ctx.beginPath();
                  ctx.arc(tip.x * canvas.width, tip.y * canvas.height, 6, 0, 2 * Math.PI);
                  ctx.fillStyle = color;
                  ctx.fill();
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = 1.5;
                  ctx.stroke();
                }

                if (phaseRef.current === 'complete' && computedHomographyRef.current) {
                  const indexTip = hand.landmarks[8];
                  if (indexTip) {
                    const screenPt = {
                      x: (mirror ? 1 - indexTip.x : indexTip.x) * canvas.width,
                      y: indexTip.y * canvas.height,
                    };
                    mappedPointersList.push(
                      applyCalibrationHomography(computedHomographyRef.current, screenPt, side)
                    );
                  }
                }
              }
            }

            latestHandsRef.current = hands;
            setPreviewPointers(mappedPointersList);
          }
          ctx.restore();

          if (phaseRef.current === 'complete') {
            ctx.save();
            capturedRef.current.forEach((cap, idx) => {
              const color = cap.anchor.hand === 'Left' ? '#00adb5' : '#ff007f';
              const isDragging = idx === draggedPointIndexRef.current;
              const pt = cap.camera;

              ctx.shadowBlur = isDragging ? 20 : 10;
              ctx.shadowColor = color;
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, isDragging ? 10 : 7, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.5;
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 2.5, 0, 2 * Math.PI);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
              ctx.shadowBlur = 0;

              const label = cap.anchor.display;
              ctx.font = 'bold 11px Inter, sans-serif';
              const textWidth = ctx.measureText(label).width;
              const textX = pt.x + 12;
              const textY = pt.y + 4;
              ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
              ctx.fillRect(textX - 4, textY - 12, textWidth + 8, 16);
              ctx.strokeStyle = color;
              ctx.lineWidth = 1;
              ctx.strokeRect(textX - 4, textY - 12, textWidth + 8, 16);
              ctx.fillStyle = '#ffffff';
              ctx.fillText(label, textX, textY - 1);
            });
            ctx.restore();
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
  }, [canvasRef, latestHandsRef, setIsReady, setModelError, setPreviewPointers, videoRef]);

  return null;
}
