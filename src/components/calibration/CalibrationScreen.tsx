import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useCameraSource } from '../../hooks/useCameraSource';
import type { CameraSource } from '../../hooks/useCameraSource';
import { CameraSourceSelector } from '../camera/CameraSourceSelector';
import { HandTracker } from '../../utils/handTracker';
import { DrawingUtils, HandLandmarker } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { parseKLE, parseLayoutJSON } from '../../utils/kleParser';
import type { KeyboardLayout } from '../../types/kle';
import { VirtualKeyboard } from '../common/VirtualKeyboard';
import { ToastContainer } from '../common/ToastContainer';
import { computeHomographyLS } from '../../utils/homography';
import type { Point } from '../../utils/homography';
import { LAYOUT_PRESETS } from '../../assets/layoutTemplates';
import type { LayoutPresetId } from '../../assets/layoutTemplates';
import { applyCalibrationHomography } from '../../utils/calibrationStorage';
import type { CalibrationHomography } from '../../utils/calibrationStorage';
import { mapMediaPipeResults } from '../../utils/mediapipeUtils';
import {
  HOME_ANCHORS,
  LEFT_CORNER_ANCHORS,
  RIGHT_CORNER_ANCHORS,
  FINGERTIP_LANDMARK,
  resolveAnchors,
  findKeyCenter,
} from '../../utils/calibrationAnchors';
import type { ResolvedAnchor, HandSide } from '../../utils/calibrationAnchors';
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

/**
 * 新キャリブレーションフロー:
 *  - select : 配列を選ぶだけ (自動判定の打鍵ステップは廃止)
 *  - home   : 両手8指を FDSA / JKL; に同時に置き、1回で8点キャプチャ
 *  - corners: 左手小指で Q,Z を、右手小指で P,/ を縦アンカーとしてキャプチャ
 *  - complete: 全対応点を最小二乗でホモグラフィ化し、ライブプレビューと微調整
 */
type CalibrationPhase = 'select' | 'home' | 'corners' | 'complete';

/** キャプチャした1点 (カメラ画素座標 + 解決済みアンカー)。 */
interface CapturedPoint {
  anchor: ResolvedAnchor;
  /** カメラ画素座標 (ミラー補正済み)。 */
  camera: Point;
}

type RawHand = { landmarks: { x: number; y: number }[] };

/** 指先ランドマークをカメラ画素座標へ (ミラー補正込み)。 */
function tipToScreen(
  hand: RawHand,
  fingerLandmark: number,
  canvasW: number,
  canvasH: number,
  mirror: boolean
): Point | null {
  const tip = hand.landmarks[fingerLandmark];
  if (!tip) return null;
  return {
    x: (mirror ? 1 - tip.x : tip.x) * canvasW,
    y: tip.y * canvasH,
  };
}

/**
 * 検出された手をカメラ画面上のX位置で左右に割り当てる。
 *
 * 俯瞰カメラでは MediaPipe の handedness が不安定なため信頼しない。
 * 代わりに手の代表点 (手首 landmark 0) の画面X座標でソートし、
 * 左側の手 = ユーザーの左半分、右側の手 = 右半分として扱う。
 * (ホーム配置・コーナーとも両手を画面の左右に置く前提なので頑健。)
 *
 * @returns { Left, Right } いずれも検出されなければ null
 */
function assignHandsByCameraX(
  hands: RawHand[],
  canvasW: number,
  mirror: boolean
): { Left: RawHand | null; Right: RawHand | null } {
  const withX = hands
    .map((h) => {
      const wrist = h.landmarks[0];
      const screenX = wrist ? (mirror ? 1 - wrist.x : wrist.x) * canvasW : 0;
      return { hand: h, screenX };
    })
    .sort((a, b) => a.screenX - b.screenX);

  if (withX.length === 0) return { Left: null, Right: null };
  if (withX.length === 1) {
    // 1手のみ: 画面中央より左なら左手とみなす
    const single = withX[0];
    return single.screenX < canvasW / 2
      ? { Left: single.hand, Right: null }
      : { Left: null, Right: single.hand };
  }
  return { Left: withX[0].hand, Right: withX[withX.length - 1].hand };
}

export const CalibrationScreen: React.FC<CalibrationScreenProps> = ({
  onComplete,
  initialCustomLayoutData = null,
  initialCustomLayoutIsSplit = false,
}) => {
  const { toasts, showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraSource, setCameraSource] = useState<CameraSource>('local');
  const { error, isMirrored, remoteStatus, offer, submitAnswer, restartRemote } =
    useCameraSource(videoRef, cameraSource);
  const isMirroredRef = useRef(isMirrored);
  useEffect(() => {
    isMirroredRef.current = isMirrored;
  }, [isMirrored]);
  const [isReady, setIsReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const [phase, setPhase] = useState<CalibrationPhase>('select');
  // corners フェーズで今どのコーナーを記録中か (Q→Z→P→/ の index)。
  const [cornerStep, setCornerStep] = useState(0);

  // Layout selection
  const [presetId, setPresetId] = useState<LayoutPresetId | 'custom'>('us-standard');
  const [uploadedData, setUploadedData] = useState<unknown>(initialCustomLayoutData);
  const [uploadedIsSplit, setUploadedIsSplit] = useState<boolean>(initialCustomLayoutIsSplit);

  const activeLayout = useMemo<KeyboardLayout>(() => {
    if (presetId === 'custom' && uploadedData) {
      try {
        return parseLayoutJSON(JSON.stringify(uploadedData), uploadedIsSplit);
      } catch (e) {
        console.error('Failed to parse custom layout', e);
      }
    }
    const preset =
      LAYOUT_PRESETS[presetId as keyof typeof LAYOUT_PRESETS] || LAYOUT_PRESETS['us-standard'];
    return parseKLE(preset.data, preset.isSplit);
  }, [presetId, uploadedData, uploadedIsSplit]);

  // 解決済みアンカー (KLE 座標つき)。レイアウト変更で再計算。
  const homeAnchors = useMemo(() => resolveAnchors(activeLayout, HOME_ANCHORS), [activeLayout]);
  // コーナーは小指で1キーずつ順に記録 (2キー同時押しは無理なため): Q→Z→P→/
  const cornerAnchors = useMemo(
    () => resolveAnchors(activeLayout, [...LEFT_CORNER_ANCHORS, ...RIGHT_CORNER_ANCHORS]),
    [activeLayout]
  );

  // キャプチャ済み対応点
  const [captured, setCaptured] = useState<CapturedPoint[]>([]);
  const capturedRef = useRef(captured);
  useEffect(() => {
    capturedRef.current = captured;
  }, [captured]);

  // ライブの手データ (描画ループから更新)。左右は handedness に頼らず
  // captureAnchors 内でカメラX位置から判定するため、生の landmarks のみ保持。
  const latestHandsRef = useRef<RawHand[]>([]);

  // プレビュー用の追従ポインタ
  const [previewPointers, setPreviewPointers] = useState<Point[]>([]);

  // ホモグラフィ計算: complete フェーズで全対応点を最小二乗で解く。
  const computedHomography = useMemo<CalibrationHomography | null>(() => {
    if (phase !== 'complete') return null;
    const valid = captured.filter((c) => c.anchor.target !== null);

    try {
      if (!activeLayout.isSplit) {
        if (valid.length < 4) return null;
        const src = valid.map((c) => c.camera);
        const dst = valid.map((c) => c.anchor.target as Point);
        return computeHomographyLS(src, dst);
      }

      // スプリット: 手の左右で分けて、それぞれ最小二乗。
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
      if (leftMatrix && rightMatrix) {
        return { left: leftMatrix, right: rightMatrix, isSplit: true };
      }
      return null;
    } catch (e) {
      console.error('Failed to compute homography', e);
      return null;
    }
  }, [captured, phase, activeLayout.isSplit]);

  // ドラッグ微調整
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null);
  const draggedPointIndexRef = useRef<number | null>(null);
  useEffect(() => {
    draggedPointIndexRef.current = draggedPointIndex;
  }, [draggedPointIndex]);

  const computedHomographyRef = useRef(computedHomography);
  useEffect(() => {
    computedHomographyRef.current = computedHomography;
  }, [computedHomography]);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // MediaPipe 描画ループ
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

            const hands: RawHand[] = [];
            const mappedPointersList: Point[] = [];

            if (results && results.landmarks && results.landmarks.length > 0) {
              const handsData = mapMediaPipeResults(results);
              for (const hand of handsData) {
                hands.push({ landmarks: hand.landmarks });
              }

              // 左右は handedness ではなくカメラX位置で判定し、色・プレビューを統一。
              const sides = assignHandsByCameraX(hands, canvas.width, mirror);
              const sideOf = (h: RawHand): HandSide =>
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

                // 全指先をハイライト (ホーム配置を視覚的に確認しやすく)
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

                // complete フェーズはライブプレビュー
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

          // complete フェーズ: 確定した対応点ハンドルを描画
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
  }, []);

  /** 指定アンカー群について、現在の手データから指先をキャプチャする。 */
  const captureAnchors = useCallback(
    (anchors: ResolvedAnchor[]): CapturedPoint[] | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const mirror = isMirroredRef.current;
      const hands = latestHandsRef.current;

      // 左右は handedness ではなくカメラX位置で割り当てる (俯瞰カメラ対応)。
      const sides = assignHandsByCameraX(hands, canvas.width, mirror);

      const result: CapturedPoint[] = [];
      const missing: string[] = [];
      for (const anchor of anchors) {
        const hand = anchor.hand === 'Left' ? sides.Left : sides.Right;
        const pt = hand
          ? tipToScreen(hand, FINGERTIP_LANDMARK[anchor.finger], canvas.width, canvas.height, mirror)
          : null;
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
    [showToast]
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

  // キー押下でキャプチャ (任意キーで現フェーズのキャプチャを実行)
  const handlePhysicalKeyPress = useCallback(
    (e: KeyboardEvent) => {
      if (!isReady) return;
      if (phase === 'home') {
        e.preventDefault();
        handleCaptureHome();
      } else if (phase === 'corners') {
        e.preventDefault();
        handleCaptureCorner();
      }
    },
    [isReady, phase, handleCaptureHome, handleCaptureCorner]
  );

  useEffect(() => {
    window.addEventListener('keydown', handlePhysicalKeyPress);
    return () => window.removeEventListener('keydown', handlePhysicalKeyPress);
  }, [handlePhysicalKeyPress]);

  const handleReset = useCallback(() => {
    setPhase('select');
    setCornerStep(0);
    setCaptured([]);
    setDraggedPointIndex(null);
  }, []);

  const handleStartCalibration = useCallback(() => {
    if (presetId === 'custom' && !uploadedData) {
      showToast('先にJSONファイルを読み込んでください。', 'warning');
      return;
    }
    setCaptured([]);
    setCornerStep(0);
    setPhase('home');
  }, [presetId, uploadedData, showToast]);

  // マウスドラッグ微調整
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
    [phase, captured]
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
    [phase]
  );

  const handleCanvasMouseUp = useCallback(() => setDraggedPointIndex(null), []);
  const handleCanvasMouseLeave = useCallback(() => setDraggedPointIndex(null), []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          parseKLE(parsed, false);
          setUploadedData(parsed);
          setUploadedIsSplit(false);
          showToast('KLEレイアウト配列を読み込みました！', 'success');
        } else if (
          parsed &&
          typeof parsed === 'object' &&
          'layout' in parsed &&
          Array.isArray(parsed.layout)
        ) {
          parseLayoutJSON(text, true);
          setUploadedData(parsed);
          setUploadedIsSplit(true);
          showToast('Vialキーマップを読み込みました！ (スプリット配列自動設定)', 'success');
        } else {
          showToast(
            '不明なレイアウト形式です。KLE配列またはVialのバックアップJSONを選択してください。',
            'error'
          );
        }
      } catch (err) {
        showToast(
          'JSONファイルの読み込みに失敗しました。\n' +
            (err instanceof Error ? err.message : String(err)),
          'error'
        );
      }
    };
    reader.readAsText(file);
  };

  // 仮想キーボード上でハイライトすべきキー (home: 8指 / corners: 現在の1キー)
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
    for (const a of anchors) {
      const center = findKeyCenter(activeLayout, a.searchLabel);
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        width: '100%',
        maxWidth: '900px',
        margin: '0 auto',
        flex: 1,
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', gap: '1.5rem', width: '100%', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Camera */}
        <div style={{ flex: '1 1 480px', maxWidth: '640px' }}>
          <div className="camera-preview-container" style={{ border: '2px solid rgba(255, 255, 255, 0.1)' }}>
            {(error || modelError) && <div className="error-message">{error || modelError}</div>}
            {!isReady && !error && !modelError && (
              <div className="loading-message">Initializing Hand Tracker AI...</div>
            )}
            <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />
            <canvas
              ref={canvasRef}
              className="camera-canvas"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              style={{
                cursor:
                  phase === 'complete' ? (draggedPointIndex !== null ? 'grabbing' : 'grab') : 'default',
              }}
            />
          </div>

          {phase === 'select' && (
            <div style={{ marginTop: '1rem' }}>
              <CameraSourceSelector
                source={cameraSource}
                onSourceChange={setCameraSource}
                remoteStatus={remoteStatus}
                offer={offer}
                onSubmitAnswer={submitAnswer}
                onRestart={restartRemote}
              />
            </div>
          )}
        </div>

        {/* Interaction Card */}
        <div
          style={{
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
            boxSizing: 'border-box',
          }}
        >
          {phase === 'select' && (
            <div>
              <div
                style={{
                  textTransform: 'uppercase',
                  fontSize: '0.8rem',
                  color: '#00adb5',
                  fontWeight: 600,
                  letterSpacing: '1px',
                  marginBottom: '0.5rem',
                }}
              >
                Step 1: 配列の選択
              </div>
              <h2 style={{ fontSize: '1.4rem', margin: '0 0 1rem 0', fontWeight: 400 }}>
                キーボードの種類
              </h2>
              <p style={{ color: '#aaa', fontSize: '0.95rem', margin: '0 0 1.5rem 0' }}>
                お使いのキーボード配列を選択してください。カスタムJSON（KLE / Vial）も読み込めます。
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1.5rem' }}>
                {(Object.keys(LAYOUT_PRESETS) as LayoutPresetId[]).map((presetKey) => (
                  <button
                    key={presetKey}
                    onClick={() => setPresetId(presetKey)}
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
                      transition: 'all 0.2s',
                    }}
                  >
                    {LAYOUT_PRESETS[presetKey as keyof typeof LAYOUT_PRESETS].name}
                  </button>
                ))}
                <button
                  onClick={() => setPresetId('custom')}
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
                    gridColumn: '1 / -1',
                  }}
                >
                  カスタム配列 (JSONファイル読込)
                </button>
              </div>

              {presetId === 'custom' && (
                <div
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px dashed rgba(255, 255, 255, 0.15)',
                    borderRadius: '12px',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.8rem',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', color: '#ccc' }}>KLE / Vial のJSONファイルを選択:</div>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    style={{ fontSize: '0.85rem', color: '#aaa', width: '100%' }}
                  />
                  {(!uploadedData || Array.isArray(uploadedData)) && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.85rem',
                        color: '#aaa',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
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
                onClick={handleStartCalibration}
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
                  boxShadow: '0 4px 15px rgba(0, 173, 181, 0.4)',
                }}
              >
                決定してキャリブレーションへ
              </button>
            </div>
          )}

          {phase === 'home' && (
            <div>
              <div
                style={{
                  textTransform: 'uppercase',
                  fontSize: '0.8rem',
                  color: '#ff007f',
                  fontWeight: 600,
                  letterSpacing: '1px',
                  marginBottom: '0.5rem',
                }}
              >
                Step 2: ホームポジション
              </div>
              <h2 style={{ fontSize: '1.4rem', margin: '0 0 1rem 0', fontWeight: 400 }}>
                両手をホームに置く
              </h2>
              <p style={{ color: '#ccc', lineHeight: '1.6', fontSize: '1.05rem', margin: '0 0 1rem 0' }}>
                左手を <b>F D S A</b>、右手を <b>J K L ;</b> に正しい指で同時に置き、任意のキーまたは下のボタンで記録してください。
              </p>
              <button
                onClick={handleCaptureHome}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #ff007f, #b30059)',
                  border: 'none',
                  color: '#fff',
                  padding: '0.9rem',
                  borderRadius: '50px',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(255, 0, 127, 0.4)',
                }}
              >
                8本指を記録する
              </button>
              <p style={{ color: '#888', fontSize: '0.8rem', lineHeight: '1.4', margin: '1rem 0 0 0' }}>
                ※ 両手の8指すべてがカメラに映っている必要があります。
              </p>
            </div>
          )}

          {phase === 'corners' && (
            <div>
              <div
                style={{
                  textTransform: 'uppercase',
                  fontSize: '0.8rem',
                  color: '#ff007f',
                  fontWeight: 600,
                  letterSpacing: '1px',
                  marginBottom: '0.5rem',
                }}
              >
                Step 3: 縦アンカー ({cornerStep + 1} / {cornerAnchors.length})
              </div>
              <h2 style={{ fontSize: '1.4rem', margin: '0 0 1rem 0', fontWeight: 400 }}>
                {currentCorner
                  ? `${currentCorner.hand === 'Left' ? '左手' : '右手'}: ${currentCorner.display}`
                  : ''}
              </h2>
              <p style={{ color: '#ccc', lineHeight: '1.6', fontSize: '1.05rem', margin: '0 0 1rem 0' }}>
                {cornerInstruction}
              </p>
              <button
                onClick={handleCaptureCorner}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #ff007f, #b30059)',
                  border: 'none',
                  color: '#fff',
                  padding: '0.9rem',
                  borderRadius: '50px',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(255, 0, 127, 0.4)',
                }}
              >
                {currentCorner ? `${currentCorner.display} を記録する` : '記録する'}
              </button>
            </div>
          )}

          {phase === 'complete' && (
            <div>
              <div
                style={{
                  textTransform: 'uppercase',
                  fontSize: '0.8rem',
                  color: '#00ffcc',
                  fontWeight: 600,
                  letterSpacing: '1px',
                  marginBottom: '0.5rem',
                }}
              >
                キャリブレーション完了
              </div>
              <h2 style={{ fontSize: '1.4rem', margin: '0 0 1rem 0', fontWeight: 400, color: '#00ffcc' }}>
                調整完了！
              </h2>
              <p style={{ color: '#aaa', fontSize: '0.95rem', lineHeight: '1.5', margin: '0 0 1.5rem 0' }}>
                キーを押したとき、下の仮想キーボードにポインター（円）が正しく追従するかテストしてください。
                ずれている点はカメラ映像上でドラッグして微調整できます。
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
                    transition: 'background 0.2s',
                  }}
                >
                  やり直す (Reset)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Virtual keyboard guide */}
      <div
        style={{
          position: 'relative',
          background: 'rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          padding: '1.5rem',
          borderRadius: '16px',
          display: 'inline-block',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          marginTop: '0.5rem',
        }}
      >
        <VirtualKeyboard
          layout={activeLayout}
          unitSize={38}
          gap={5}
          targetKeyIndex={highlightKeyIndices.length > 0 ? highlightKeyIndices[0] : null}
          highlightKeyIndices={highlightKeyIndices}
          pointers={previewPointers}
          homePointers={homePointers}
        />
      </div>
      <ToastContainer toasts={toasts} />
    </div>
  );
};
