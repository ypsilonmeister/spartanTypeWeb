/**
 * Issue #21 の回帰テスト: 「期待する手だけを切り出して推論する」経路で、
 * 逆の手による打鍵が「正解」に化けないこと。
 *
 * 左手がホーム (A/S/D/F) に定位置で休み、右手の人差し指で G / T / V を打つ。
 * 期待する手 (左手) だけを推論すると、休んでいる左人差し指が 1.0〜1.25U 以内にいるので、
 * 「最近傍指先が 1.5U 以内なら逆の手を推論しない」規則では左人差し指 = 正解に化けていた。
 * 模擬ランドマークは本番の座標変換 (TypingSession) と判定 (fingerAnalysis) をそのまま通す。
 */
import { describe, it, expect } from 'vitest';
import { parseKLE } from '../../utils/kleParser';
import { LAYOUT_PRESETS } from '../../assets/layoutTemplates';
import { getKeystrokeVerdict } from '../keystrokeStats';
import {
  BASE_VARIANT,
  buildScript,
  correctStroke,
  crossHandStroke,
  simulateSession,
  type ScriptStroke,
  type SimVariant,
} from './simulation/landmarkSimulator';
import { runThroughCropPipeline, runThroughPipeline, pct } from './simulation/pipeline';

const layout = parseKLE(LAYOUT_PRESETS['us-standard'].data, LAYOUT_PRESETS['us-standard'].isSplit);

const NOISY_VARIANT: SimVariant = {
  ...BASE_VARIANT,
  name: 'noisy-combined',
  camera: { ...BASE_VARIANT.camera, rotationDeg: -8, offsetPx: { x: -80, y: -40 }, keystone: -0.0003 },
  handScale: 0.9,
  pressSigmaU: 0.22,
  restSigmaU: 0.18,
  landmarkSigmaPx: 4,
  calibrationSigmaPx: 6,
};

function repeat(stroke: ScriptStroke, n: number): ScriptStroke[] {
  return Array.from({ length: n }, () => stroke);
}

function cropVerdicts(script: ScriptStroke[], variant: SimVariant, seed: number) {
  const sim = simulateSession(layout, script, variant, { seed });
  return runThroughCropPipeline(sim).strokes.map((s) => getKeystrokeVerdict(s.result.isCorrectFinger));
}

describe('expected-hand crop: strokes typed with the other hand (Issue #21)', () => {
  // 左手はホームの定位置、右手人差し指で左手担当の中央寄りキーを打つ (Issue の probe と同じ状況)。
  for (const code of ['KeyG', 'KeyT', 'KeyV']) {
    it(`flags ${code} typed with the right index while the left hand rests on the home row`, () => {
      const verdicts = cropVerdicts(repeat(crossHandStroke(code), 40), BASE_VARIANT, 2101);
      expect(verdicts.filter((v) => v === 'correct')).toEqual([]);
      expect(verdicts.every((v) => v === 'wrong')).toBe(true);
    });
  }

  // 逆向き: 右手がホーム、左手人差し指で右手担当の中央寄りキーを打つ。
  for (const code of ['KeyY', 'KeyH', 'KeyN', 'KeyB']) {
    it(`flags ${code} typed with the opposite index finger`, () => {
      const verdicts = cropVerdicts(repeat(crossHandStroke(code), 40), BASE_VARIANT, 2102);
      expect(verdicts.every((v) => v === 'wrong')).toBe(true);
    });
  }

  it('still flags cross-hand strokes under camera / hand / landmark noise', () => {
    const codes = ['KeyT', 'KeyG', 'KeyB', 'KeyY', 'KeyH', 'KeyN', 'KeyR', 'KeyV'];
    const script = codes.flatMap((code) => repeat(crossHandStroke(code), 15));
    const verdicts = cropVerdicts(script, NOISY_VARIANT, 2103);
    expect(verdicts.filter((v) => v === 'correct')).toEqual([]);
  });

  it('agrees with full-frame (numHands: 2) analysis on cross-hand strokes', () => {
    const script = ['KeyG', 'KeyT', 'KeyV', 'KeyH'].flatMap((code) => repeat(crossHandStroke(code), 20));
    const sim = simulateSession(layout, script, BASE_VARIANT, { seed: 2104 });
    const full = runThroughPipeline(sim).map((s) => s.result.isCorrectFinger);
    const crop = runThroughCropPipeline(sim).strokes.map((s) => s.result.isCorrectFinger);
    expect(full.every((v) => v === false)).toBe(true);
    expect(crop).toEqual(full);
  });
});

describe('expected-hand crop: correct strokes and inference cost', () => {
  it('keeps correct-finger strokes correct without inferring the other hand', () => {
    const script = ['KeyG', 'KeyT', 'KeyV', 'KeyB', 'KeyY', 'KeyH', 'KeyN', 'KeyF', 'KeyJ', 'KeyA', 'Semicolon']
      .flatMap((code) => repeat(correctStroke(code), 10));
    const sim = simulateSession(layout, script, BASE_VARIANT, { seed: 2105 });
    const run = runThroughCropPipeline(sim);
    expect(run.strokes.every((s) => s.result.isCorrectFinger === true)).toBe(true);
    // 正しい指で打った打鍵はほぼ全部、期待する手の推論 1 回で確定する。
    expect(run.otherHandInferences / run.croppedFrames).toBeLessThan(0.05);
  });

  it('matches full-frame verdicts on a mixed session and reports the other-hand inference rate', () => {
    const rows: Record<string, string | number>[] = [];
    for (const variant of [BASE_VARIANT, NOISY_VARIANT]) {
      const script = buildScript({ seed: 2106, length: 600, overreachRate: 0.1, pinkyAvoidanceRate: 0.1 });
      // 1 割を逆の手で打つ打鍵に差し替える (中央寄りのキー)。
      const central = ['KeyT', 'KeyG', 'KeyB', 'KeyY', 'KeyH', 'KeyN'];
      const mixed = script.map((s, i) => (i % 10 === 5 ? crossHandStroke(central[i % central.length]) : s));
      const sim = simulateSession(layout, mixed, variant, { seed: 2107 });
      const full = runThroughPipeline(sim);
      const crop = runThroughCropPipeline(sim);
      const agree = crop.strokes.filter((s, i) => s.result.isCorrectFinger === full[i].result.isCorrectFinger).length;
      const crossHand = crop.strokes.filter((s) => s.truth.kind === 'crossHand');
      rows.push({
        variant: variant.name,
        strokes: crop.strokes.length,
        'crop/full agreement': pct(agree / crop.strokes.length),
        'cross-hand flagged (full)': pct(
          full.filter((s) => s.truth.kind === 'crossHand' && s.result.isCorrectFinger === false).length / crossHand.length
        ),
        'cross-hand flagged (crop)': pct(crossHand.filter((s) => s.result.isCorrectFinger === false).length / crossHand.length),
        'other-hand inference rate': pct(crop.otherHandInferences / crop.croppedFrames),
        'inferences / keystroke frame': (1 + crop.otherHandInferences / crop.croppedFrames).toFixed(3),
      });
      // 切り出しのせいで逆手打ちを見逃さない: 全体推論が検出した逆手打ちは切り出しでも検出する。
      // (ノイズの大きい条件では全体推論でも休んでいる指のほうが近くなり正解になる打鍵が
      //  わずかに残るが、それは最近傍判定そのものの限界で、切り出しとは無関係。)
      const missedByCrop = crop.strokes.filter(
        (s, i) => s.truth.kind === 'crossHand' && full[i].result.isCorrectFinger === false && s.result.isCorrectFinger !== false
      );
      expect(missedByCrop).toEqual([]);
      expect(agree / crop.strokes.length).toBeGreaterThan(0.99);
    }
    console.table(rows);
  });
});
