import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useWebcam } from '../../hooks/useWebcam';
import { HandTracker } from '../../utils/handTracker';
import { DrawingUtils, HandLandmarker } from '@mediapipe/tasks-vision';
import { parseKLE } from '../../utils/kleParser';
import type { KeyboardLayout } from '../../types/kle';
import { VirtualKeyboard } from '../common/VirtualKeyboard';
import { computeHomography, applyHomography } from '../../utils/homography';
import type { Point, HomographyMatrix } from '../../utils/homography';
import { LAYOUT_PRESETS } from '../../assets/layoutTemplates';
import type { LayoutPresetId } from '../../assets/layoutTemplates';
import type { CalibrationHomography } from '../../utils/calibrationStorage';
import '../../styles/cameraPreview.css';

interface CalibrationScreenProps {
  onComplete: (presetId: string, homography: CalibrationHomography) => void;
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

  const leftMaxX = Math.max(...leftKeys.map(k => k.x + k.w));
  const rightMinX = Math.min(...rightKeys.map(k => k.x));

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

export const CalibrationScreen: React.FC<CalibrationScreenProps> = ({ onComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { error } = useWebcam(videoRef);
  const [isReady, setIsReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // Calibration phases
  const [phase, setPhase] = useState<CalibrationPhase>('detection');
  
  // Layout presets selection
  const [presetId, setPresetId] = useState<LayoutPresetId>('us-standard');

  // Active layouts
  const detectionLayout = useMemo(() => parseKLE(LAYOUT_PRESETS['us-standard'].data, false), []);
  const activePreset = useMemo(() => LAYOUT_PRESETS[presetId as keyof typeof LAYOUT_PRESETS], [presetId]);
  const activeLayout = useMemo(() => parseKLE(activePreset.data, activePreset.isSplit), [activePreset]);
  const activeCorners = useMemo(() => getLayoutCorners(activeLayout), [activeLayout]);

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
      if (!activeLayout.isSplit) {
        const matrix = computeHomography(alignPoints.slice(0, 4), activeCorners.left);
        return matrix;
      } else {
        const leftPoints = alignPoints.slice(0, 4);
        const rightPoints = alignPoints.slice(5, 9);
        
        const leftMatrix = computeHomography(leftPoints, activeCorners.left);
        const rightMatrix = computeHomography(rightPoints, activeCorners.right!);

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
  }, [alignPoints, phase, activeLayout.isSplit, activeCorners]);

  // Mouse drag-and-drop state for point fine-tuning
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null);
  const draggedPointIndexRef = useRef<number | null>(null);
  useEffect(() => {
    draggedPointIndexRef.current = draggedPointIndex;
  }, [draggedPointIndex]);

  // Calibrated home position pointers
  const homePointers = useMemo<Point[]>(() => {
    if (!computedHomography || alignPoints.length < 6) return [];
    try {
      if ('isSplit' in computedHomography && computedHomography.isSplit) {
        if (alignPoints.length < 10) return [];
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
  }, [computedHomography, alignPoints]);

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



  // Expected calibration steps based on selected layout
  const alignSteps = useMemo(() => {
    const fKey = activeLayout.keys.find(k => k.label.toLowerCase().split('\n').includes('f'));
    const jKey = activeLayout.keys.find(k => k.label.toLowerCase().split('\n').includes('j'));
    const fTarget = fKey ? { x: fKey.x + fKey.w / 2, y: fKey.y + fKey.h / 2 } : { x: 4.5, y: 2.5 };
    const jTarget = jKey ? { x: jKey.x + jKey.w / 2, y: jKey.y + jKey.h / 2 } : { x: 7.5, y: 2.5 };

    if (!activeLayout.isSplit) {
      return [
        { label: '左上端 (Top-Left)', desc: '物理キーボードの「左上端」の角にあるキー（例: Esc や 1）を人差し指で押してください。', target: activeCorners.left[0] },
        { label: '右上端 (Top-Right)', desc: '物理キーボードの「右上端」の角にあるキー（例: Backspace や ￥）を人差し指で押してください。', target: activeCorners.left[1] },
        { label: '右下端 (Bottom-Right)', desc: '物理キーボードの「右下端」の角にあるキー（例: Ctrl や 矢印キー）を人差し指で押してください。', target: activeCorners.left[2] },
        { label: '左下端 (Bottom-Left)', desc: '物理キーボードの「左下端」の角にあるキー（例: Ctrl や Shift）を人差し指で押してください。', target: activeCorners.left[3] },
        { label: 'ホーム F (Home F)', desc: '左手ホームポジションの「F」キーを左手人差し指で押してください。', target: fTarget },
        { label: 'ホーム J (Home J)', desc: '右手ホームポジションの「J」キーを右手人差し指で押してください。', target: jTarget }
      ];
    } else {
      return [
        // Left Half
        { label: '左半分・左上 (Left-Top-Left)', desc: '【左半分】の左上端にあるキー（例: Esc や 1）を左手人差し指で押してください。', target: activeCorners.left[0] },
        { label: '左半分・右上 (Left-Top-Right)', desc: '【左半分】の右上端にあるキー（例: 5 や T）を左手人差し指で押してください。', target: activeCorners.left[1] },
        { label: '左半分・右下 (Left-Bottom-Right)', desc: '【左半分】の右下端にあるキー（例: 左側Space や B）を左手人差し指で押してください。', target: activeCorners.left[2] },
        { label: '左半分・左下 (Left-Bottom-Left)', desc: '【左半分】の左下端にあるキー（例: 左下Ctrl や Shift）を左手人差し指で押してください。', target: activeCorners.left[3] },
        { label: '左半分・ホーム F (Left-Home F)', desc: '【左半分】のホームポジション「F」キーを左手人差し指で押してください。', target: fTarget },
        // Right Half
        { label: '右半分・左上 (Right-Top-Left)', desc: '【右半分】の左上端にあるキー（例: 6 や Y）を右手人差し指で押してください。', target: activeCorners.right![0] },
        { label: '右半分・右上 (Right-Top-Right)', desc: '【右半分】の右上端にあるキー（例: Backspace や =）を右手人差し指で押してください。', target: activeCorners.right![1] },
        { label: '右半分・右下 (Right-Bottom-Right)', desc: '【右半分】の右下端にあるキー（例: 右下Ctrl や 矢印）を右手人差し指で押してください。', target: activeCorners.right![2] },
        { label: '右半分・左下 (Right-Bottom-Left)', desc: '【右半分】の左下端にあるキー（例: 右側Space や N）を右手人差し指で押してください。', target: activeCorners.right![3] },
        { label: '右半分・ホーム J (Right-Home J)', desc: '【右半分】のホームポジション「J」キーを右手人差し指で押してください。', target: jTarget }
      ];
    }
  }, [activeLayout, activeCorners]);

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
              for (let i = 0; i < results.landmarks.length; i++) {
                const landmarks = results.landmarks[i];
                const catName = results.handednesses?.[i]?.[0]?.categoryName;
                const handedness: 'Left' | 'Right' = (catName === 'Left' || catName === 'Right')
                  ? catName
                  : (landmarks[0].x < 0.5 ? 'Right' : 'Left');
                
                // Draw hand skeleton with cyber glow styles
                drawingUtils?.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
                  color: handedness === 'Left' ? '#00adb5' : '#ff007f',
                  lineWidth: 2,
                });
                drawingUtils?.drawLandmarks(landmarks, {
                  color: '#ffffff',
                  lineWidth: 1,
                  radius: 2,
                });

                const indexTip = landmarks[8];
                if (indexTip) {
                  const screenPt = {
                    x: (1 - indexTip.x) * canvas.width,
                    y: indexTip.y * canvas.height
                  };

                  if (handedness === 'Left') {
                    latestLeftFingerRef.current = screenPt;
                  } else {
                    latestRightFingerRef.current = screenPt;
                  }

                  // Glow highlight on index finger tip
                  ctx.beginPath();
                  ctx.arc(indexTip.x * canvas.width, indexTip.y * canvas.height, 10, 0, 2 * Math.PI);
                  ctx.fillStyle = handedness === 'Left' ? '#00adb5' : '#ff007f';
                  ctx.fill();
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = 2;
                  ctx.stroke();

                  // Live pointer preview mapping
                  if (phase === 'complete' && computedHomography) {
                    let mapped: Point;
                    if (computedHomography && typeof computedHomography === 'object' && 'isSplit' in computedHomography) {
                      const matrix = handedness === 'Left' ? computedHomography.left : computedHomography.right;
                      mapped = applyHomography(matrix, screenPt);
                    } else {
                      mapped = applyHomography(computedHomography as HomographyMatrix, screenPt);
                    }
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
            const drawQuad = (physicalPoints: Point[], color: string, cornersList: Point[]) => {
              try {
                const invMatrix = computeHomography(cornersList, physicalPoints);
                if (invMatrix) {
                  const tl = applyHomography(invMatrix, { x: 0, y: 0 });
                  const tr = applyHomography(invMatrix, { x: cornersList[1].x, y: cornersList[1].y });
                  const br = applyHomography(invMatrix, { x: cornersList[2].x, y: cornersList[2].y });
                  const bl = applyHomography(invMatrix, { x: cornersList[3].x, y: cornersList[3].y });

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

            if (computedHomography && typeof computedHomography === 'object' && 'isSplit' in computedHomography) {
              drawQuad(alignPointsRef.current.slice(0, 4), 'rgba(0, 173, 181, 1)', activeCorners.left);
              drawQuad(alignPointsRef.current.slice(5, 9), 'rgba(255, 0, 127, 1)', activeCorners.right!);
            } else {
              drawQuad(alignPointsRef.current, 'rgba(0, 255, 204, 1)', activeCorners.left);
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
              let label = '';
              if (!activeLayout.isSplit) {
                if (idx === 0) label = '左上';
                else if (idx === 1) label = '右上';
                else if (idx === 2) label = '右下';
                else if (idx === 3) label = '左下';
                else if (idx === 4) label = 'F';
                else if (idx === 5) label = 'J';
              } else {
                if (idx === 0) label = '左・上左';
                else if (idx === 1) label = '左・上右';
                else if (idx === 2) label = '左・下右';
                else if (idx === 3) label = '左・下左';
                else if (idx === 4) label = '左F';
                else if (idx === 5) label = '右・上左';
                else if (idx === 6) label = '右・上右';
                else if (idx === 7) label = '右・下右';
                else if (idx === 8) label = '右・下左';
                else if (idx === 9) label = '右J';
              }

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
  }, [phase, computedHomography, activeCorners, activeLayout.isSplit]);

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
      alert("指先が検知されていません。キーの上に指を置いて押すか、指先がカメラに見える状態で画面のボタンをクリックしてください。");
      return;
    }

    const newPoints = [...alignPoints, pt];
    setAlignPoints(newPoints);

    if (alignStepIndex + 1 >= alignSteps.length) {
      setPhase('complete');
    } else {
      setAlignStepIndex(prev => prev + 1);
    }
  }, [alignStepIndex, alignPoints, alignSteps, activeLayout.isSplit]);

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
          alert("指先（ランドマーク）がカメラで検知されていません。手をカメラに映してください。");
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
  }, [phase, isReady, detectionStep, DETECTION_KEYS, recordCurrentAlignPoint]);

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

  const handleLayoutPresetToggle = (preset: LayoutPresetId) => {
    setPresetId(preset);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', width: '100%', maxWidth: '900px', margin: '0 auto' }}>
      
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
            </div>
          )}

          {phase === 'detectionConfirm' && (
            <div>
              <div style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: '#00adb5', fontWeight: 600, letterSpacing: '1px', marginBottom: '0.5rem' }}>
                Step 1: 自動判定完了
              </div>
              <h2 style={{ fontSize: '1.4rem', margin: '0 0 1rem 0', fontWeight: 400 }}>配列の確認・選択</h2>
              <p style={{ color: '#aaa', fontSize: '0.95rem', margin: '0 0 1.5rem 0' }}>
                検出された配列を基に設定しました。お使いのキーボードに合わせて変更も可能です。
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
              </div>

              <button 
                onClick={() => handlePhysicalKeyPress({ key: 'Enter', preventDefault: () => {} } as KeyboardEvent)}
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
                この配列で決定して四隅調整へ (Enter)
              </button>
            </div>
          )}

          {phase === 'align' && (
            <div>
              <div style={{ textTransform: 'uppercase', fontSize: '0.8rem', color: '#ff007f', fontWeight: 600, letterSpacing: '1px', marginBottom: '0.5rem' }}>
                Step 2: 四隅の調整 ({alignStepIndex + 1} / {alignSteps.length})
              </div>
              <h2 style={{ fontSize: '1.4rem', margin: '0 0 1rem 0', fontWeight: 400 }}>キーボードの角をタップ</h2>
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
                カメラに緑・ピンクのガイド枠が表示されました。
                キーを押したとき、下の仮想キーボードにポインター（水色の円）が正しく追従するかテストしてください。
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <button 
                  onClick={() => {
                    if (computedHomography) {
                      onComplete(presetId, computedHomography);
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
      
    </div>
  );
};
