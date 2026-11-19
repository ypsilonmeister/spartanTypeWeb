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
import type { KeystrokeLog, SessionData } from '../../../types/session';
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
