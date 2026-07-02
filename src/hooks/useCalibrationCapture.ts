import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { computeHomographyLS } from '../utils/homography';
import {
  applyCalibrationHomography,
  landmarkToScreen,
  pickOuterHands,
} from '../domain/handGeometry';
import {
  FINGERTIP_LANDMARK,
  HOME_ANCHORS,
  LEFT_CORNER_ANCHORS,
  RIGHT_CORNER_ANCHORS,
  findKeyCenter,
  resolveAnchors,
} from '../utils/calibrationAnchors';
import type { ResolvedAnchor } from '../utils/calibrationAnchors';
import type { CalibrationHomography } from '../types/calibration';
import type { CalibrationPhase, CapturedPoint } from '../types/calibrationFlow';
import type { Point } from '../types/geometry';
import type { KeyboardLayout } from '../types/kle';

type RawHand = { landmarks: { x: number; y: number }[] };

interface UseCalibrationCaptureOptions {
  activeLayout: KeyboardLayout;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  isMirrored: boolean;
  latestHandsRef: RefObject<RawHand[]>;
  showToast: (message: string, type?: 'success' | 'error' | 'warning') => void;
}

export function useCalibrationCapture({
  activeLayout,
  canvasRef,
  isMirrored,
  latestHandsRef,
  showToast,
}: UseCalibrationCaptureOptions) {
  const [phase, setPhase] = useState<CalibrationPhase>('select');
  const [cornerStep, setCornerStep] = useState(0);
  const [captured, setCaptured] = useState<CapturedPoint[]>([]);
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null);
  const draggedPointIndexRef = useRef<number | null>(null);

  useEffect(() => {
    draggedPointIndexRef.current = draggedPointIndex;
  }, [draggedPointIndex]);

  const homeAnchors = useMemo(() => resolveAnchors(activeLayout, HOME_ANCHORS), [activeLayout]);
  const cornerAnchors = useMemo(
    () => resolveAnchors(activeLayout, [...LEFT_CORNER_ANCHORS, ...RIGHT_CORNER_ANCHORS]),
    [activeLayout]
  );

  const computedHomography = useMemo<CalibrationHomography | null>(() => {
    if (phase !== 'complete') return null;
    const valid = captured.filter((c) => c.anchor.target !== null);

    try {
      if (!activeLayout.isSplit) {
        if (valid.length < 4) return null;
        return computeHomographyLS(
          valid.map((c) => c.camera),
          valid.map((c) => c.anchor.target as Point)
        );
      }

      const leftPts = valid.filter((c) => c.anchor.hand === 'Left');
      const rightPts = valid.filter((c) => c.anchor.hand === 'Right');
      if (leftPts.length < 4 || rightPts.length < 4) return null;

      const leftMatrix = computeHomographyLS(
        leftPts.map((c) => c.camera),
        leftPts.map((c) => c.anchor.target as Point)
      );
      const rightMatrix = computeHomographyLS(
        rightPts.map((c) => c.camera),
        rightPts.map((c) => c.anchor.target as Point)
      );
      return leftMatrix && rightMatrix
        ? { left: leftMatrix, right: rightMatrix, isSplit: true }
        : null;
    } catch (e) {
      console.error('Failed to compute homography', e);
      return null;
    }
  }, [captured, phase, activeLayout.isSplit]);

  const captureAnchors = useCallback(
    (anchors: ResolvedAnchor[]): CapturedPoint[] | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const hands = latestHandsRef.current;
      const sides = pickOuterHands(hands, canvas.width, isMirrored);

      const result: CapturedPoint[] = [];
      const missing: string[] = [];
      for (const anchor of anchors) {
        const hand = anchor.hand === 'Left' ? sides.Left : sides.Right;
        const tip = hand?.landmarks[FINGERTIP_LANDMARK[anchor.finger]];
        const pt = tip ? landmarkToScreen(tip, canvas.width, canvas.height, isMirrored) : null;
        if (!pt) {
          missing.push(anchor.display);
          continue;
        }
        result.push({ anchor, camera: pt });
      }

      if (missing.length > 0) {
        const hint =
          anchors.length > 2
            ? '両手をカメラに映してください。'
            : `${anchors[0]?.hand === 'Left' ? '左手' : '右手'}をカメラに映してください。`;
        showToast(`次の指が検知できませんでした: ${missing.join(' / ')}。${hint}`, 'warning');
        return null;
      }
      return result;
    },
    [canvasRef, isMirrored, latestHandsRef, showToast]
  );

  const handleCaptureHome = useCallback(() => {
    const pts = captureAnchors(homeAnchors);
    if (!pts) return;
    setCaptured(pts);
    setCornerStep(0);
    setPhase('corners');
  }, [captureAnchors, homeAnchors]);

  const handleCaptureCorner = useCallback(() => {
    const anchor = cornerAnchors[cornerStep];
    if (!anchor) return;
    const pts = captureAnchors([anchor]);
    if (!pts) return;
    setCaptured((prev) => [...prev, ...pts]);
    if (cornerStep + 1 >= cornerAnchors.length) {
      setPhase('complete');
    } else {
      setCornerStep((prev) => prev + 1);
    }
  }, [captureAnchors, cornerStep, cornerAnchors]);

  const handleReset = useCallback(() => {
    setPhase('select');
    setCornerStep(0);
    setCaptured([]);
    setDraggedPointIndex(null);
  }, []);

  const beginCalibration = useCallback(() => {
    setCaptured([]);
    setCornerStep(0);
    setPhase('home');
  }, []);

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (phase !== 'complete') return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const my = ((e.clientY - rect.top) / rect.height) * canvas.height;

      let closestIndex = -1;
      let minDistance = Infinity;
      captured.forEach((cap, i) => {
        const dist = Math.hypot(cap.camera.x - mx, cap.camera.y - my);
        if (dist < minDistance) {
          minDistance = dist;
          closestIndex = i;
        }
      });
      if (closestIndex !== -1 && minDistance < 20) {
        setDraggedPointIndex(closestIndex);
      }
    },
    [canvasRef, phase, captured]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (phase !== 'complete' || draggedPointIndexRef.current === null) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const my = ((e.clientY - rect.top) / rect.height) * canvas.height;
      const targetIdx = draggedPointIndexRef.current;
      setCaptured((prev) => {
        const updated = [...prev];
        if (updated[targetIdx]) {
          updated[targetIdx] = { ...updated[targetIdx], camera: { x: mx, y: my } };
        }
        return updated;
      });
    },
    [canvasRef, phase]
  );

  const highlightKeyIndices = useMemo<number[]>(() => {
    const anchors =
      phase === 'home'
        ? homeAnchors
        : phase === 'corners'
          ? cornerAnchors[cornerStep]
            ? [cornerAnchors[cornerStep]]
            : []
          : [];
    const indices: number[] = [];
    for (const anchor of anchors) {
      const center = findKeyCenter(activeLayout, anchor.searchLabel);
      if (!center) continue;
      const idx = activeLayout.keys.findIndex(
        (k) => Math.abs(k.x + k.w / 2 - center.x) < 1e-6 && Math.abs(k.y + k.h / 2 - center.y) < 1e-6
      );
      if (idx >= 0) indices.push(idx);
    }
    return indices;
  }, [phase, cornerStep, homeAnchors, cornerAnchors, activeLayout]);

  const homePointers = useMemo<Point[]>(() => {
    if (phase !== 'complete' || !computedHomography) return [];
    try {
      return captured.map((cap) =>
        applyCalibrationHomography(computedHomography, cap.camera, cap.anchor.hand)
      );
    } catch (e) {
      console.error('Failed to map home pointers', e);
      return [];
    }
  }, [phase, computedHomography, captured]);

  const currentCorner = cornerAnchors[cornerStep];
  const cornerInstruction = currentCorner
    ? `${currentCorner.hand === 'Left' ? '左手' : '右手'}の小指で「${currentCorner.display}」キーを押さえ、任意のキーまたは下のボタンで記録してください。`
    : '';

  return {
    phase,
    cornerStep,
    cornerAnchors,
    captured,
    draggedPointIndex,
    computedHomography,
    highlightKeyIndices,
    homePointers,
    currentCorner,
    cornerInstruction,
    beginCalibration,
    handleCaptureHome,
    handleCaptureCorner,
    handleReset,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp: () => setDraggedPointIndex(null),
    handleCanvasMouseLeave: () => setDraggedPointIndex(null),
  };
}
