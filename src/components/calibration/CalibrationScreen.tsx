import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useWebcam } from '../../hooks/useWebcam';
import { HandTracker } from '../../utils/handTracker';
import { DrawingUtils, HandLandmarker } from '@mediapipe/tasks-vision';
import { parseKLE, parseLayoutJSON } from '../../utils/kleParser';
import type { KeyboardLayout, Key } from '../../types/kle';
import { VirtualKeyboard } from '../common/VirtualKeyboard';
import { ToastContainer } from '../common/ToastContainer';
import { computeHomography, applyHomography } from '../../utils/homography';
import type { Point, HomographyMatrix } from '../../utils/homography';
import { LAYOUT_PRESETS } from '../../assets/layoutTemplates';
import type { LayoutPresetId } from '../../assets/layoutTemplates';
import { isSplitHomography, applyCalibrationHomography } from '../../utils/calibrationStorage';
import type { CalibrationHomography } from '../../utils/calibrationStorage';
import { mapMediaPipeResults } from '../../utils/mediapipeUtils';
import { useToast } from '../../hooks/useToast';
import '../../styles/cameraPreview.css';

interface CalibrationScreenProps {
  onComplete: (
    presetId: string, 
    homography: CalibrationHomography,
    customLayoutData?: unknown,
    customLayoutIsSplit?: boolean
  ) => void;
  initialCustomLayoutData?: unknown | null;
  initialCustomLayoutIsSplit?: boolean;
}

type CalibrationPhase = 'detection' | 'detectionConfirm' | 'align' | 'complete';

function getLayoutCorners(layout: KeyboardLayout) {
  if (!layout.isSplit) {
    return {
      left: [
        { x: 0, y: 0 }, // Top-Left
        { x: layout.width, y: 0 }, // Top-Right
        { x: layout.width, y: layout.height }, // Bottom-Right
        { x: 0, y: layout.height } // Bottom-Left
      ]
    };
  }

  const midX = layout.width / 2;
  const leftKeys = layout.keys.filter(k => k.x + k.w / 2 < midX);
  const rightKeys = layout.keys.filter(k => k.x + k.w / 2 >= midX);

  const leftMaxX = Math.max(...leftKeys.map(k => k.x + k.w), midX);
  const rightMinX = Math.min(...rightKeys.map(k => k.x), midX);

  return {
    left: [
      { x: 0, y: 0 },
      { x: leftMaxX, y: 0 },
      { x: leftMaxX, y: layout.height },
      { x: 0, y: layout.height }
    ],
    right: [
      { x: rightMinX, y: 0 },
      { x: layout.width, y: 0 },
      { x: layout.width, y: layout.height },
      { x: rightMinX, y: layout.height }
    ]
  };
}

export interface CalibrationTarget {
  label: string;
  desc: string;
  target: Point;
}

function getCalibrationKeys(layout: KeyboardLayout): CalibrationTarget[] {
  const findCornerKeys = (keysList: Key[], offsetMinX: number) => {
    if (keysList.length === 0) {
      return {
        tl: { x: offsetMinX + 0.5, y: 0.5 },
        tr: { x: offsetMinX + 4.5, y: 0.5 },
        br: { x: offsetMinX + 4.5, y: 2.5 },
        bl: { x: offsetMinX + 0.5, y: 2.5 },
        tlLabel: 'TL',
        trLabel: 'TR',
        brLabel: 'BR',
        blLabel: 'BL'
      };
    }

    const minX = Math.min(...keysList.map(k => k.x));
    const maxX = Math.max(...keysList.map(k => k.x + k.w));
    const minY = Math.min(...keysList.map(k => k.y));
    const maxY = Math.max(...keysList.map(k => k.y + k.h));

    let tlKey = keysList[0];
    let trKey = keysList[0];
    let blKey = keysList[0];
    let brKey = keysList[0];

    let tlMin = Infinity;
    let trMin = Infinity;
    let blMin = Infinity;
    let brMin = Infinity;

    for (const k of keysList) {
      const tlScore = (k.x - minX) + (k.y - minY) * 2;
      if (tlScore < tlMin) {
        tlMin = tlScore;
        tlKey = k;
      }

      const trScore = (maxX - (k.x + k.w)) + (k.y - minY) * 2;
      if (trScore < trMin) {
        trMin = trScore;
        trKey = k;
      }

      const blScore = (k.x - minX) + (maxY - (k.y + k.h)) * 2;
      if (blScore < blMin) {
        blMin = blScore;
        blKey = k;
      }

      const brScore = (maxX - (k.x + k.w)) + (maxY - (k.y + k.h)) * 2;
      if (brScore < brMin) {
        brMin = brScore;
        brKey = k;
      }
    }

    const keyCenter = (k: Key) => ({
      x: k.x + k.w / 2,
      y: k.y + k.h / 2
    });

    return {
      tl: keyCenter(tlKey),
      tr: keyCenter(trKey),
      br: keyCenter(brKey),
      bl: keyCenter(blKey),
      tlLabel: tlKey.label.replace(/\n/g, ' '),
      trLabel: trKey.label.replace(/\n/g, ' '),
      brLabel: brKey.label.replace(/\n/g, ' '),
      blLabel: blKey.label.replace(/\n/g, ' ')
    };
  };

  const findHomeKey = (keysList: Key[], searchChar: string, defaultPt: Point): { target: Point, label: string } => {
    const found = keysList.find(k => k.label.toLowerCase().split('\n').includes(searchChar));
    if (found) {
      return {
        target: { x: found.x + found.w / 2, y: found.y + found.h / 2 },
        label: found.label.replace(/\n/g, ' ')
      };
    }
    return { target: defaultPt, label: searchChar.toUpperCase() };
  };

  if (!layout.isSplit) {
    const corners = findCornerKeys(layout.keys, 0);
    const fHome = findHomeKey(layout.keys, 'f', { x: 4.5, y: 2.5 });
    const jHome = findHomeKey(layout.keys, 'j', { x: 7.5, y: 2.5 });

    return [
      { label: `左上・${corners.tlLabel}`, desc: `物理キーボードの左上端にある「${corners.tlLabel}」キーを人差し指で押してください。`, target: corners.tl },
      { label: `右上・${corners.trLabel}`, desc: `物理キーボードの右上端にある「${corners.trLabel}」キーを人差し指で押してください。`, target: corners.tr },
      { label: `右下・${corners.brLabel}`, desc: `物理キーボードの右下端にある「${corners.brLabel}」キーを人差し指で押してください。`, target: corners.br },
      { label: `左下・${corners.blLabel}`, desc: `物理キーボードの左下端にある「${corners.blLabel}」キーを人差し指で押してください。`, target: corners.bl },
      { label: `ホーム ${fHome.label}`, desc: `左手ホームポジションの「${fHome.label}」キーを左手人差し指で押してください。`, target: fHome.target },
      { label: `ホーム ${jHome.label}`, desc: `右手ホームポジションの「${jHome.label}」キーを右手人差し指で押してください。`, target: jHome.target }
    ];
  } else {
    const midX = layout.width / 2;
    const leftKeys = layout.keys.filter(k => k.x + k.w / 2 < midX);
    const rightKeys = layout.keys.filter(k => k.x + k.w / 2 >= midX);

    const leftCorners = findCornerKeys(leftKeys, 0);
    const rightCorners = findCornerKeys(rightKeys, midX);

    const fHome = findHomeKey(leftKeys, 'f', { x: 4.5, y: 2.5 });
    const jHome = findHomeKey(rightKeys, 'j', { x: 7.5, y: 2.5 });

    return [
      // Left half
      { label: `左・上左 (${leftCorners.tlLabel})`, desc: `【左半分】の左上端にある「${leftCorners.tlLabel}」キーを左手人差し指で押してください。`, target: leftCorners.tl },
      { label: `左・上右 (${leftCorners.trLabel})`, desc: `【左半分】の右上端にある「${leftCorners.trLabel}」キーを左手人差し指で押してください。`, target: leftCorners.tr },
      { label: `左・下右 (${leftCorners.brLabel})`, desc: `【左半分】の右下端にある「${leftCorners.brLabel}」キーを左手人差し指で押してください。`, target: leftCorners.br },
      { label: `左・下左 (${leftCorners.blLabel})`, desc: `【左半分】の左下端にある「${leftCorners.blLabel}」キーを左手人差し指で押してください。`, target: leftCorners.bl },
      { label: `左ホーム ${fHome.label}`, desc: `【左半分】のホームポジション「${fHome.label}」キーを左手人差し指で押してください。`, target: fHome.target },
      // Right half
      { label: `右・上左 (${rightCorners.tlLabel})`, desc: `【右半分】の左上端にある「${rightCorners.tlLabel}」キーを右手人差し指で押してください。`, target: rightCorners.tl },
      { label: `右・上右 (${rightCorners.trLabel})`, desc: `【右半分】の右上端にある「${rightCorners.trLabel}」キーを右手人差し指で押してください。`, target: rightCorners.tr },
      { label: `右・下右 (${rightCorners.brLabel})`, desc: `【右半分】の右下端にある「${rightCorners.brLabel}」キーを右手人差し指で押してください。`, target: rightCorners.br },
      { label: `右・下左 (${rightCorners.blLabel})`, desc: `【右半分】の左下端にある「${rightCorners.blLabel}」キーを右手人差し指で押してください。`, target: rightCorners.bl },
      { label: `右ホーム ${jHome.label}`, desc: `【右半分】のホームポジション「${jHome.label}」キーを右手人差し指で押してください。`, target: jHome.target }
    ];
  }
}

function findClosestKeyIndex(layout: KeyboardLayout, target: Point): number {
  let minDistance = Infinity;
  let closestIndex = -1;
  for (let i = 0; i < layout.keys.length; i++) {
    const key = layout.keys[i];
    const keyCenter = {
      x: key.x + key.w / 2,
      y: key.y + key.h / 2
    };
    const dist = Math.hypot(keyCenter.x - target.x, keyCenter.y - target.y);
    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = i;
    }
  }
  return closestIndex;
}

export const CalibrationScreen: React.FC<CalibrationScreenProps> = ({ 
  onComplete,
  initialCustomLayoutData = null,
  initialCustomLayoutIsSplit = false
}) => {
  const { toasts, showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { error } = useWebcam(videoRef);
  const [isReady, setIsReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // Calibration phases
  const [phase, setPhase] = useState<CalibrationPhase>('detection');
  
  // Layout presets selection
  const [presetId, setPresetId] = useState<LayoutPresetId | 'custom'>('us-standard');

  const [uploadedData, setUploadedData] = useState<unknown>(initialCustomLayoutData);
  const [uploadedIsSplit, setUploadedIsSplit] = useState<boolean>(initialCustomLayoutIsSplit);

  // Active layouts
  const detectionLayout = useMemo(() => parseKLE(LAYOUT_PRESETS['us-standard'].data, false), []);

  const activeLayout = useMemo(() => {
    if (presetId === 'custom' && uploadedData) {
      try {
        return parseLayoutJSON(JSON.stringify(uploadedData), uploadedIsSplit);
      } catch (e) {
        console.error("Failed to parse custom layout", e);
      }
    }
    const preset = LAYOUT_PRESETS[presetId as keyof typeof LAYOUT_PRESETS] || LAYOUT_PRESETS['us-standard'];
    return parseKLE(preset.data, preset.isSplit);
  }, [presetId, uploadedData, uploadedIsSplit]);

  const activeCorners = useMemo(() => getLayoutCorners(activeLayout), [activeLayout]);

  // Expected calibration steps based on active layout
  const alignSteps = useMemo(() => {
    return getCalibrationKeys(activeLayout);
  }, [activeLayout]);

  // Calibration tracking points
  const [alignPoints, setAlignPoints] = useState<Point[]>([]);
  const [alignStepIndex, setAlignStepIndex] = useState(0);

  // Real-time tracking references
  const latestLeftFingerRef = useRef<Point | null>(null);
  const latestRightFingerRef = useRef<Point | null>(null);

  // Mapped live pointers for complete preview
  const [previewPointers, setPreviewPointers] = useState<Point[]>([]);

  // Homography calculations (derived from alignPoints during 'complete' phase)
  const computedHomography = useMemo<CalibrationHomography | null>(() => {
    if (phase !== 'complete' || alignPoints.length < (activeLayout.isSplit ? 10 : 6)) {
      return null;
    }

    try {
      const targets = alignSteps.map(s => s.target);
      if (!activeLayout.isSplit) {
        const matrix = computeHomography(alignPoints.slice(0, 4), targets.slice(0, 4));
        return matrix;
      } else {
        const leftPoints = alignPoints.slice(0, 4);
        const rightPoints = alignPoints.slice(5, 9);
        
        const leftMatrix = computeHomography(leftPoints, targets.slice(0, 4));
        const rightMatrix = computeHomography(rightPoints, targets.slice(5, 9));
        
        if (leftMatrix && rightMatrix) {
          return {
            left: leftMatrix,
            right: rightMatrix,
            isSplit: true
          };
        }
        return null;
      }
    } catch (e) {
      console.error("Failed to compute homography in memo", e);
      return null;
    }
  }, [alignPoints, phase, activeLayout.isSplit, alignSteps]);

  // Mouse drag-and-drop state for point fine-tuning
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null);
  const draggedPointIndexRef = useRef<number | null>(null);
  useEffect(() => {
    draggedPointIndexRef.current = draggedPointIndex;
  }, [draggedPointIndex]);

  // Calibrated home position pointers
  const homePointers = useMemo<Point[]>(() => {
    if (!computedHomography || alignPoints.length < (activeLayout.isSplit ? 10 : 6)) return [];
    try {
      if ('isSplit' in computedHomography && computedHomography.isSplit) {
        const leftMatrix = computedHomography.left;
        const rightMatrix = computedHomography.right;
        const leftF = alignPoints[4];
        const rightJ = alignPoints[9];
        return [
          applyHomography(leftMatrix, leftF),
          applyHomography(rightMatrix, rightJ)
        ];
      } else {
        const matrix = computedHomography as HomographyMatrix;
        const f = alignPoints[4];
        const j = alignPoints[5];
        return [
          applyHomography(matrix, f),
          applyHomography(matrix, j)
        ];
      }
    } catch (e) {
      console.error("Failed to map home pointers", e);
      return [];
    }
  }, [computedHomography, alignPoints, activeLayout.isSplit]);

  // Step 1: Layout Auto-Detection config
  const [detectionStep, setDetectionStep] = useState(0);
  const DETECTION_KEYS = useMemo(() => [
    { label: 'A', code: 'KeyA', key: 'a', desc: '物理キーボードの「A」キーを左手人差し指で1度叩いてください。' },
    { label: 'L', code: 'KeyL', key: 'l', desc: '物理キーボードの「L」キーを右手人差し指で1度叩いてください。' },
    { label: 'Space', code: 'Space', key: ' ', desc: '物理キーボードの「Space（スペース）」キーを1度叩いてください。' },
    { 
      label: '変換 or [', 
      desc: '日本語配列の場合は「変換」キー（または無変換/かな）、英語配列の場合は「 [ 」キーを1度叩いてください。',
      validate: (code: string, key: string) => 
        ['Convert', 'NonConvert', 'HiraganaKatakana', 'BracketLeft'].includes(code) || 
        ['変換', '無変換', 'かな', '['].includes(key)
    },
    { label: 'Enter', code: 'Enter', key: 'Enter', desc: '物理キーボードの「Enter」キーを右手で1度叩いてください。' }
  ], []);
  const alignPointsRef = useRef(alignPoints);
  useEffect(() => {
    alignPointsRef.current = alignPoints;
  }, [alignPoints]);
  // MediaPipe Hand Landmark Render Loop
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

            latestLeftFingerRef.current = null;
            latestRightFingerRef.current = null;
            const mappedPointersList: Point[] = [];

            if (results && results.landmarks && results.landmarks.length > 0) {
              const handsData = mapMediaPipeResults(results);
              for (const hand of handsData) {
                // Draw hand skeleton with cyber glow styles
                drawingUtils?.drawConnectors(hand.landmarks as any, HandLandmarker.HAND_CONNECTIONS, {
                  color: hand.handedness === 'Left' ? '#00adb5' : '#ff007f',
                  lineWidth: 2,
                });
                drawingUtils?.drawLandmarks(hand.landmarks as any, {
                  color: '#ffffff',
                  lineWidth: 1,
                  radius: 2,
                });

                const indexTip = hand.landmarks[8];
                if (indexTip) {
                  const screenPt = {
                    x: (1 - indexTip.x) * canvas.width,
                    y: indexTip.y * canvas.height
                  };

                  if (hand.handedness === 'Left') {
                    latestLeftFingerRef.current = screenPt;
                  } else {
                    latestRightFingerRef.current = screenPt;
                  }

                  // Glow highlight on index finger tip
                  ctx.beginPath();
                  ctx.arc(indexTip.x * canvas.width, indexTip.y * canvas.height, 10, 0, 2 * Math.PI);
                  ctx.fillStyle = hand.handedness === 'Left' ? '#00adb5' : '#ff007f';
                  ctx.fill();
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = 2;
                  ctx.stroke();

                  // Live pointer preview mapping
                  if (phase === 'complete' && computedHomography) {
                    const mapped = applyCalibrationHomography(computedHomography, screenPt, hand.handedness);
                    mappedPointersList.push(mapped);
                  }
                }
              }
            }
            
            setPreviewPointers(mappedPointersList);
          }
          ctx.restore();

          // Draw neon overlays in 'complete' phase
          if (phase === 'complete' && computedHomography) {
            ctx.save();
            const drawQuad = (physicalPoints: Point[], color: string, keyCenters: Point[], outlineCorners: Point[]) => {
              try {
                const invMatrix = computeHomography(keyCenters, physicalPoints);
                if (invMatrix) {
                  const tl = applyHomography(invMatrix, outlineCorners[0]);
                  const tr = applyHomography(invMatrix, outlineCorners[1]);
                  const br = applyHomography(invMatrix, outlineCorners[2]);
                  const bl = applyHomography(invMatrix, outlineCorners[3]);

                  ctx.beginPath();
                  ctx.moveTo(tl.x, tl.y);
                  ctx.lineTo(tr.x, tr.y);
                  ctx.lineTo(br.x, br.y);
                  ctx.lineTo(bl.x, bl.y);
                  ctx.closePath();

                  ctx.strokeStyle = color;
                  ctx.lineWidth = 3;
                  ctx.shadowBlur = 15;
                  ctx.shadowColor = color;
                  ctx.stroke();
                  ctx.shadowBlur = 0;

                  ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba');
                  ctx.fill();
                }
              } catch (e) {
                console.error("Failed to project debug overlay", e);
              }
            };

            const targets = alignSteps.map(s => s.target);
            if (isSplitHomography(computedHomography)) {
              drawQuad(alignPointsRef.current.slice(0, 4), 'rgba(0, 173, 181, 1)', targets.slice(0, 4), activeCorners.left);
              drawQuad(alignPointsRef.current.slice(5, 9), 'rgba(255, 0, 127, 1)', targets.slice(5, 9), activeCorners.right!);
            } else {
              drawQuad(alignPointsRef.current, 'rgba(0, 255, 204, 1)', targets.slice(0, 4), activeCorners.left);
            }

            // Draw interactive point handles
            alignPointsRef.current.forEach((pt, idx) => {
              const isHome = activeLayout.isSplit ? (idx === 4 || idx === 9) : (idx === 4 || idx === 5);
              let color = '#00adb5'; // Cyan default
              if (activeLayout.isSplit) {
                if (idx >= 5) color = '#ff007f'; // Magenta for right half
              } else {
                if (idx === 5) color = '#ff007f';
              }
              if (isHome) color = '#00ff88'; // Neon green for home anchors!

              const isDragging = idx === draggedPointIndexRef.current;

              ctx.save();
              ctx.shadowBlur = isDragging ? 20 : 10;
              ctx.shadowColor = color;
              
              // Outer circle
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, isDragging ? 10 : 7, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.5;
              ctx.stroke();

              // Inner dot
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 2.5, 0, 2 * Math.PI);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
              
              ctx.shadowBlur = 0;

              // Text label
              const label = alignSteps[idx]?.label || '';

              ctx.font = 'bold 11px Inter, sans-serif';
              const textWidth = ctx.measureText(label).width;
              const textX = pt.x + 12;
              const textY = pt.y + 4;

              // Background card for text label
              ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
              ctx.fillRect(textX - 4, textY - 12, textWidth + 8, 16);
              ctx.strokeStyle = color;
              ctx.lineWidth = 1;
              ctx.strokeRect(textX - 4, textY - 12, textWidth + 8, 16);

              // Text
              ctx.fillStyle = '#ffffff';
              ctx.fillText(label, textX, textY - 1);
              ctx.restore();
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
  }, [phase, computedHomography, activeCorners, activeLayout.isSplit, alignSteps]);

  // Record the point for the current step in the align phase
  const recordCurrentAlignPoint = useCallback(() => {
    const targetStep = alignSteps[alignStepIndex];
    if (!targetStep) return;

    // Determine appropriate hand finger tip
    let pt: Point | null;
    if (activeLayout.isSplit) {
      if (alignStepIndex < 4) {
        // Left half: Left hand preferred
        pt = latestLeftFingerRef.current || latestRightFingerRef.current;
      } else {
        // Right half: Right hand preferred
        pt = latestRightFingerRef.current || latestLeftFingerRef.current;
      }
    } else {
      pt = latestLeftFingerRef.current || latestRightFingerRef.current;
    }

    if (!pt) {
      showToast('指先が検知されていません。キーの上に指を置いて押すか、指先がカメラに見える状態で画面のボタンをクリックしてください。', 'warning');
      return;
    }

    const newPoints = [...alignPoints, pt];
    setAlignPoints(newPoints);

    if (alignStepIndex + 1 >= alignSteps.length) {
      setPhase('complete');
    } else {
      setAlignStepIndex(prev => prev + 1);
    }
  }, [alignStepIndex, alignPoints, alignSteps, activeLayout.isSplit, showToast]);

  // Key event listeners for calibrating & detecting
  const handlePhysicalKeyPress = useCallback((e: KeyboardEvent) => {
    if (!isReady) return;

    if (phase === 'detection') {
      const stepConfig = DETECTION_KEYS[detectionStep];
      if (!stepConfig) return;

      const isValid = stepConfig.validate 
        ? stepConfig.validate(e.code, e.key)
        : (e.code === stepConfig.code || e.key.toLowerCase() === stepConfig.key);

      if (isValid) {
        // Capture active finger coord
        // For Key A (left hand expected), check Left first.
        // For Key L (right hand expected), check Right first.
        let pt: Point | null;
        if (stepConfig.code === 'KeyA') {
          pt = latestLeftFingerRef.current || latestRightFingerRef.current;
        } else if (stepConfig.code === 'KeyL' || stepConfig.code === 'Enter') {
          pt = latestRightFingerRef.current || latestLeftFingerRef.current;
        } else {
          pt = latestLeftFingerRef.current || latestRightFingerRef.current;
        }

        if (!pt) {
          showToast('指先（ランドマーク）がカメラで検知されていません。手をカメラに映してください。', 'warning');
          return;
        }

        e.preventDefault();
        
        // Save JIS vs US heuristics on step 3
        if (detectionStep === 3) {
          const isJisKey = ['Convert', 'NonConvert', 'HiraganaKatakana'].includes(e.code) || 
                            ['変換', '無変換', 'かな'].includes(e.key);
          setPresetId(isJisKey ? 'jis-standard' : 'us-standard');
        }

        if (detectionStep + 1 >= DETECTION_KEYS.length) {
          setPhase('detectionConfirm');
        } else {
          setDetectionStep(prev => prev + 1);
        }
      }
    } else if (phase === 'align') {
      e.preventDefault();
      recordCurrentAlignPoint();
    } else if (phase === 'detectionConfirm') {
      if (e.key === 'Enter') {
        e.preventDefault();
        setPhase('align');
        setAlignStepIndex(0);
        setAlignPoints([]);
      }
    }
  }, [phase, isReady, detectionStep, DETECTION_KEYS, recordCurrentAlignPoint, showToast]);

  useEffect(() => {
    window.addEventListener('keydown', handlePhysicalKeyPress);
    return () => window.removeEventListener('keydown', handlePhysicalKeyPress);
  }, [handlePhysicalKeyPress]);

  const handleReset = useCallback(() => {
    setPhase('detection');
    setDetectionStep(0);
    setAlignPoints([]);
    setAlignStepIndex(0);
    setDraggedPointIndex(null);
  }, []);

  // Mouse drag fine-tuning logic on the camera canvas
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase !== 'complete') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const my = ((e.clientY - rect.top) / rect.height) * canvas.height;
    
    // Find closest point in alignPoints
    let closestIndex = -1;
    let minDistance = Infinity;
    
    for (let i = 0; i < alignPoints.length; i++) {
      const pt = alignPoints[i];
      const dist = Math.hypot(pt.x - mx, pt.y - my);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }
    
    // Lock drag if close enough (within 20 pixels)
    if (closestIndex !== -1 && minDistance < 20) {
      setDraggedPointIndex(closestIndex);
    }
  }, [phase, alignPoints]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase !== 'complete' || draggedPointIndexRef.current === null) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const my = ((e.clientY - rect.top) / rect.height) * canvas.height;
    
    const targetIdx = draggedPointIndexRef.current;
    setAlignPoints(prev => {
      const updated = [...prev];
      if (updated[targetIdx]) {
        updated[targetIdx] = { x: mx, y: my };
      }
      return updated;
    });
  }, [phase]);

  const handleCanvasMouseUp = useCallback(() => {
    setDraggedPointIndex(null);
  }, []);

  const handleCanvasMouseLeave = useCallback(() => {
    setDraggedPointIndex(null);
  }, []);

  const handleLayoutPresetToggle = (preset: LayoutPresetId | 'custom') => {
    setPresetId(preset);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          // Validate before setting state
          parseKLE(parsed, false);
          setUploadedData(parsed);
          setUploadedIsSplit(false);
          showToast('KLEレイアウト配列を読み込みました！', 'success');
        } else if (parsed && typeof parsed === 'object' && 'layout' in parsed && Array.isArray(parsed.layout)) {
          // Validate before setting state
          parseLayoutJSON(text, true); // parseLayoutJSON calls parseVial under the hood
          setUploadedData(parsed);
          setUploadedIsSplit(true);
          showToast('Vialキーマップを読み込みました！ (スプリット配列自動設定)', 'success');
        } else {
          showToast('不明なレイアウト形式です。KLE配列またはVialのバックアップJSONを選択してください。', 'error');
        }
      } catch (err) {
        showToast('JSONファイルの読み込みに失敗しました。\n' + (err instanceof Error ? err.message : String(err)), 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '100%', maxWidth: '900px', margin: '0 auto', flex: 1, overflow: 'hidden', minHeight: 0 }}>
      
      {/* Visual Feedback Columns */}
      <div style={{ display: 'flex', gap: '1.5rem', width: '100%', flexWrap: 'wrap', justifyContent: 'center' }}>
        
        {/* Left: Camera stream */}
        <div style={{ flex: '1 1 480px', maxWidth: '640px' }}>
          <div className="camera-preview-container" style={{ border: '2px solid rgba(255, 255, 255, 0.1)' }}>
            {(error || modelError) && <div className="error-message">{error || modelError}</div>}
            {!isReady && !error && !modelError && <div className="loading-message">Initializing Hand Tracker AI...</div>}
            <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />
            <canvas 
              ref={canvasRef} 
              className="camera-canvas"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              style={{ cursor: phase === 'complete' ? (draggedPointIndex !== null ? 'grabbing' : 'grab') : 'default' }}
            />
          </div>
        </div>

        {/* Right: Interaction Card */}
        <div style={{
          flex: '1 1 320px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(16px)',
          borderRadius: '16px',
          padding: '1.5rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '270px',
          boxSizing: 'border-box'
        }}>
          {phase === 'detection' && (
            <div>
              <div style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: '#00adb5', fontWeight: 600, letterSpacing: '1px', marginBottom: '0.5rem' }}>
                Step 1: 配列の自動判定 ({detectionStep + 1} / 5)
              </div>
              <h2 style={{ fontSize: '1.4rem', margin: '0 0 1rem 0', fontWeight: 400 }}>キーボードの認識</h2>
              <p style={{ color: '#ccc', lineHeight: '1.6', fontSize: '1.05rem', margin: 0 }}>
                {DETECTION_KEYS[detectionStep]?.desc}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                {DETECTION_KEYS.map((key, i) => (
                  <span 
                    key={i} 
                    style={{ 
                      padding: '0.4rem 0.8rem', 
                      borderRadius: '8px', 
                      background: i === detectionStep ? '#00adb5' : (i < detectionStep ? 'rgba(0, 173, 181, 0.2)' : 'rgba(255,255,255,0.05)'),
                      border: '1px solid',
                      borderColor: i === detectionStep ? '#00adb5' : 'rgba(255, 255, 255, 0.1)',
                      fontSize: '0.9rem',
                      color: i <= detectionStep ? '#fff' : '#666',
                      fontWeight: i === detectionStep ? 'bold' : 'normal'
                    }}
                  >
                    {key.label}
                  </span>
                ))}
              </div>
              <button 
                onClick={() => setPhase('detectionConfirm')}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#ccc',
                  padding: '0.7rem',
                  borderRadius: '50px',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  marginTop: '2rem',
                  transition: 'background 0.2s'
                }}
              >
                判定をスキップして配列手動選択へ
              </button>
            </div>
          )}

          {phase === 'detectionConfirm' && (
            <div>
              <div style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: '#00adb5', fontWeight: 600, letterSpacing: '1px', marginBottom: '0.5rem' }}>
                Step 1: 配列の確認・選択
              </div>
              <h2 style={{ fontSize: '1.4rem', margin: '0 0 1rem 0', fontWeight: 400 }}>配列の確認・選択</h2>
              <p style={{ color: '#aaa', fontSize: '0.95rem', margin: '0 0 1.5rem 0' }}>
                配列を選択してください。カスタムJSONファイルを読み込んで使用することも可能です。
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1.5rem' }}>
                {(Object.keys(LAYOUT_PRESETS) as LayoutPresetId[]).map((presetKey) => (
                  <button
                    key={presetKey}
                    onClick={() => handleLayoutPresetToggle(presetKey)}
                    style={{
                      padding: '0.8rem 0.5rem',
                      background: presetId === presetKey ? 'rgba(0, 173, 181, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid',
                      borderColor: presetId === presetKey ? '#00adb5' : 'rgba(255, 255, 255, 0.1)',
                      color: presetId === presetKey ? '#00adb5' : '#aaa',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: presetId === presetKey ? 'bold' : 'normal',
                      transition: 'all 0.2s'
                    }}
                  >
                    {LAYOUT_PRESETS[presetKey as keyof typeof LAYOUT_PRESETS].name}
                  </button>
                ))}
                <button
                  onClick={() => handleLayoutPresetToggle('custom')}
                  style={{
                    padding: '0.8rem 0.5rem',
                    background: presetId === 'custom' ? 'rgba(0, 173, 181, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid',
                    borderColor: presetId === 'custom' ? '#00adb5' : 'rgba(255, 255, 255, 0.1)',
                    color: presetId === 'custom' ? '#00adb5' : '#aaa',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: presetId === 'custom' ? 'bold' : 'normal',
                    transition: 'all 0.2s',
                    gridColumn: '1 / -1'
                  }}
                >
                  カスタム配列 (JSONファイル読込)
                </button>
              </div>

              {presetId === 'custom' && (
                <div style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px dashed rgba(255, 255, 255, 0.15)',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.8rem'
                }}>
                  <div style={{ fontSize: '0.85rem', color: '#ccc' }}>KLE / Vial のJSONファイルを選択:</div>
                  <input 
                    type="file" 
                    accept=".json" 
                    onChange={handleFileUpload}
                    style={{ fontSize: '0.85rem', color: '#aaa', width: '100%' }}
                  />
                  {(!uploadedData || Array.isArray(uploadedData)) && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#aaa', cursor: 'pointer', userSelect: 'none' }}>
                      <input 
                        type="checkbox" 
                        checked={uploadedIsSplit} 
                        onChange={(e) => setUploadedIsSplit(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      スプリット配列 (左右分割キーボード)
                    </label>
                  )}
                </div>
              )}

              <button 
                onClick={() => {
                  if (presetId === 'custom' && !uploadedData) {
                    showToast('先にJSONファイルを読み込んでください。', 'warning');
                    return;
                  }
                  setPhase('align');
                  setAlignStepIndex(0);
                  setAlignPoints([]);
                }}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #00adb5, #007a82)',
                  border: 'none',
                  color: '#fff',
                  padding: '1rem',
                  borderRadius: '50px',
                  fontWeight: 'bold',
                  fontSize: '1.05rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(0, 173, 181, 0.4)'
                }}
              >
                決定してキー位置調整へ
              </button>
            </div>
          )}

          {phase === 'align' && (
            <div>
              <div style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: '#ff007f', fontWeight: 600, letterSpacing: '1px', marginBottom: '0.5rem' }}>
                Step 2: キー位置の調整 ({alignStepIndex + 1} / {alignSteps.length})
              </div>
              <h2 style={{ fontSize: '1.4rem', margin: '0 0 1rem 0', fontWeight: 400 }}>キーのタップ</h2>
              <p style={{ color: '#ccc', lineHeight: '1.6', fontSize: '1.05rem', margin: '0 0 1rem 0' }}>
                {alignSteps[alignStepIndex]?.desc}
              </p>

              <button 
                onClick={recordCurrentAlignPoint}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #ff007f, #b30059)',
                  border: 'none',
                  color: '#fff',
                  padding: '0.8rem',
                  borderRadius: '50px',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(255, 0, 127, 0.4)',
                  marginBottom: '1rem'
                }}
              >
                ここを記録 (または任意のキー)
              </button>

              <p style={{ color: '#888', fontSize: '0.8rem', lineHeight: '1.4', margin: '0 0 1rem 0' }}>
                ※ Fnキーなど一部のキーは押してもWeb上で反応しません。その場合は指をキーの上に置いたまま、<b>上のボタンをクリック</b>するか、<b>別のキー（Space等）</b>を押してください。
              </p>

              <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#ff007f', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {alignSteps.map((step, i) => (
                  <span 
                    key={i} 
                    style={{ 
                      padding: '0.3rem 0.6rem', 
                      borderRadius: '4px',
                      background: i === alignStepIndex ? 'rgba(255, 0, 127, 0.15)' : (i < alignStepIndex ? 'rgba(255, 0, 127, 0.05)' : 'transparent'),
                      border: '1px solid',
                      borderColor: i === alignStepIndex ? '#ff007f' : 'rgba(255, 255, 255, 0.05)',
                      color: i <= alignStepIndex ? '#fff' : '#444'
                    }}
                  >
                    {step.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {phase === 'complete' && (
            <div>
              <div style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: '#00ffcc', fontWeight: 600, letterSpacing: '1px', marginBottom: '0.5rem' }}>
                キャリブレーション完了
              </div>
              <h2 style={{ fontSize: '1.4rem', margin: '0 0 1rem 0', fontWeight: 400, color: '#00ffcc' }}>調整完了！</h2>
              <p style={{ color: '#aaa', fontSize: '0.95rem', lineHeight: '1.5', margin: '0 0 1.5rem 0' }}>
                ガイド枠が物理キーの位置に重なりました。
                キーを押したとき、下の仮想キーボードにポインター（水色の円）が正しく追従するかテストしてください。
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <button 
                  onClick={() => {
                    if (computedHomography) {
                      onComplete(
                        presetId, 
                        computedHomography,
                        presetId === 'custom' && uploadedData ? uploadedData : undefined,
                        presetId === 'custom' ? uploadedIsSplit : undefined
                      );
                    }
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #00ffcc, #00b38f)',
                    color: '#111',
                    border: 'none',
                    padding: '1rem',
                    fontSize: '1.05rem',
                    borderRadius: '50px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    boxShadow: '0 4px 15px rgba(0, 255, 204, 0.4)',
                  }}
                >
                  この設定で練習を開始する
                </button>
                <button 
                  onClick={handleReset}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.15)',
                    padding: '1rem',
                    fontSize: '1.05rem',
                    borderRadius: '50px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'background 0.2s'
                  }}
                >
                  やり直す (Reset)
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Bottom: Virtual Keyboard for Visual Guidance */}
      <div style={{
        position: 'relative',
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        padding: '1.5rem',
        borderRadius: '16px',
        display: 'inline-block',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        marginTop: '0.5rem'
      }}>
        <VirtualKeyboard 
          layout={phase === 'detection' ? detectionLayout : activeLayout}
          unitSize={38}
          gap={5}
          targetKeyIndex={
            phase === 'detection' 
              ? (
                  detectionStep === 0 ? detectionLayout.keys.findIndex(k => k.label.toLowerCase() === 'a') :
                  detectionStep === 1 ? detectionLayout.keys.findIndex(k => k.label.toLowerCase() === 'l') :
                  detectionStep === 2 ? detectionLayout.keys.findIndex(k => k.label === '') :
                  detectionStep === 3 ? detectionLayout.keys.findIndex(k => k.label === '[') :
                  detectionStep === 4 ? detectionLayout.keys.findIndex(k => k.label.toLowerCase() === 'enter') :
                  null
                )
              : (
                  phase === 'align' 
                    ? findClosestKeyIndex(activeLayout, alignSteps[alignStepIndex]?.target)
                    : null
                )
          }
          pointers={previewPointers}
          homePointers={homePointers}
        />
      </div>
      <ToastContainer toasts={toasts} />
    </div>
  );
};
