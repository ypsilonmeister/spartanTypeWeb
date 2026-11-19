/**
 * 模擬セッションを本番の解析経路に通し、感度・誤検出率を集計するテスト用ヘルパー。
 *
 * 通す経路 (すべて本番コードそのもの、モック・再実装なし):
 *   TypingSession.processFrame
 *     → assignHandSidesByCameraX (手首 x による左右判定)
 *     → landmarkToScreen (ミラー補正)
 *     → applyCalibrationHomography (画面画素 → レイアウト U)
 *   TypingSession.recordKeystroke / exportSession
 *     → findNearestFrame (打鍵 ↔ フレーム対応付け)
 *     → analyzeKeystrokeAgainstTips (最近傍指 + 期待指照合)
 */
import { TypingSession } from '../../typingSession';
import {
  DEFAULT_OTHER_HAND_FALLBACK,
  expectedHandForKeystroke,
  needsOtherHandInference,
  type OtherHandFallbackOptions,
} from '../../frameCrop';
import type { HandData, HandSide, KeystrokeLog, SessionData } from '../../../types/session';
import type { SimulatedSession, StrokeKind, StrokeTruth } from './landmarkSimulator';

export interface AnalyzedStroke {
  truth: StrokeTruth;
  result: KeystrokeLog;
}

export function runThroughPipeline(sim: SimulatedSession): AnalyzedStroke[] {
  const session = new TypingSession(sim.layout, sim.homography, sim.cameraSize);
  session.startSession();
  for (const frame of sim.frames) {
    session.processFrame(frame.hands, frame.timestamp, sim.cameraSize.width, sim.cameraSize.height, sim.mirror);
  }
  for (const ks of sim.keystrokes) {
    session.recordKeystroke(ks.key, ks.code, ks.timestamp);
  }
  session.stopSession();
  const exported = JSON.parse(session.exportSession()) as SessionData;
  return exported.keystrokes.map((result, i) => ({ truth: sim.truth[i], result }));
}

export interface CropPipelineResult {
  strokes: AnalyzedStroke[];
  /** 期待する手だけを推論した打鍵フレーム数。 */
  croppedFrames: number;
  /** そのうち、もう片方の手も推論した (= 推論 2 回) フレーム数。 */
  otherHandInferences: number;
}

function nearestFrame(sim: SimulatedSession, timestamp: number) {
  let best = sim.frames[0];
  for (const f of sim.frames) {
    if (Math.abs(f.timestamp - timestamp) < Math.abs(best.timestamp - timestamp)) best = f;
  }
  return best;
}

/**
 * offlineAnalyzer の「期待する手だけを切り出して numHands: 1 で推論する」経路の模擬。
 *
 * 打鍵ごとに最も近いフレームだけを推論対象にし (offlineAnalyzer も打鍵フレーム以外は
 * 推論しない)、期待する側の切り出しでは期待する手が検出されたとみなす。その結果で
 * 本番の needsOtherHandInference が true を返したときだけ、もう片方の手を合成する。
 * 切り出し → 元フレーム座標への復元 (uncropHands) は恒等なので省略している
 * (frameCrop.test.ts で別途検証済み)。
 */
export function runThroughCropPipeline(
  sim: SimulatedSession,
  fallback: OtherHandFallbackOptions = DEFAULT_OTHER_HAND_FALLBACK
): CropPipelineResult {
  const { width, height } = sim.cameraSize;
  const session = new TypingSession(sim.layout, sim.homography, sim.cameraSize);
  session.startSession();
  const handOf = (hands: HandData[], side: HandSide) => hands[side === 'Left' ? 0 : 1];

  let croppedFrames = 0;
  let otherHandInferences = 0;
  for (const ks of sim.keystrokes) {
    const frame = nearestFrame(sim, ks.timestamp);
    const side = expectedHandForKeystroke(sim.layout, ks.code);
    if (side === null) {
      session.processFrame(frame.hands, frame.timestamp, width, height, sim.mirror);
      continue;
    }
    croppedFrames++;
    const expected = handOf(frame.hands, side);
    const other = handOf(frame.hands, side === 'Left' ? 'Right' : 'Left');
    const { mappedTips } = session.mapHandsToTips([expected], width, height, sim.mirror);
    let hands = [expected];
    if (needsOtherHandInference(sim.layout, ks.code, mappedTips, fallback)) {
      otherHandInferences++;
      hands = [expected, other];
    }
    session.processFrame(hands, frame.timestamp, width, height, sim.mirror);
  }
  for (const ks of sim.keystrokes) {
    session.recordKeystroke(ks.key, ks.code, ks.timestamp);
  }
  session.stopSession();
  const exported = JSON.parse(session.exportSession()) as SessionData;
  return {
    strokes: exported.keystrokes.map((result, i) => ({ truth: sim.truth[i], result })),
    croppedFrames,
    otherHandInferences,
  };
}

export interface DetectionMetrics {
  correctStrokes: number;
  wrongStrokes: number;
  /** 間違った指の打鍵のうち isCorrectFinger === false と判定された割合。 */
  sensitivity: number;
  /** 正しい指の打鍵のうち isCorrectFinger === false と誤って落とされた割合。 */
  falseRejectRate: number;
  /** isCorrectFinger が付かなかった (最近傍指 > 1.5U 等) 打鍵の割合 (全打鍵比)。 */
  undeterminedRate: number;
  /** 間違った指の打鍵で predictedFinger が実際に使った指と一致した割合。 */
  wrongFingerAttribution: number;
  /** 種類別の検出率。 */
  byKind: Partial<Record<StrokeKind, { n: number; detected: number; rate: number }>>;
}

export function computeMetrics(strokes: AnalyzedStroke[]): DetectionMetrics {
  const correct = strokes.filter((s) => s.truth.kind === 'correct');
  const wrong = strokes.filter((s) => s.truth.kind !== 'correct');
  const rate = (n: number, d: number) => (d === 0 ? NaN : n / d);

  const byKind: DetectionMetrics['byKind'] = {};
  for (const s of strokes) {
    const entry = (byKind[s.truth.kind] ??= { n: 0, detected: 0, rate: 0 });
    entry.n++;
    if (s.result.isCorrectFinger === false) entry.detected++;
  }
  for (const e of Object.values(byKind)) e.rate = rate(e.detected, e.n);

  return {
    correctStrokes: correct.length,
    wrongStrokes: wrong.length,
    sensitivity: rate(wrong.filter((s) => s.result.isCorrectFinger === false).length, wrong.length),
    falseRejectRate: rate(correct.filter((s) => s.result.isCorrectFinger === false).length, correct.length),
    undeterminedRate: rate(strokes.filter((s) => s.result.isCorrectFinger === undefined).length, strokes.length),
    wrongFingerAttribution: rate(
      wrong.filter((s) => s.result.predictedFinger === s.truth.finger).length,
      wrong.length
    ),
    byKind,
  };
}

export function pct(x: number): string {
  return Number.isNaN(x) ? 'n/a' : `${(x * 100).toFixed(1)}%`;
}
