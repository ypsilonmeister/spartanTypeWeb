/**
 * ランドマーク模擬テスト: 合成した手ランドマークを本番の解析経路に通し、
 * 「正しい指は正解、間違った指は検出」をバリアント別に測る。
 * 測定値は console に表として出力される (docs/landmark-simulation-report.md 参照)。
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseKLE } from '../../utils/kleParser';
import { LAYOUT_PRESETS } from '../../assets/layoutTemplates';
import { HabitAnalyzer } from '../../components/dashboard/HabitAnalyzer';
import { summarizeKeystrokes } from '../keystrokeStats';
import type { KeystrokeLog } from '../../types/session';
import {
  BASE_VARIANT,
  buildScript,
  correctStroke,
  indexOverreachStroke,
  pinkyAvoidanceStroke,
  simulateSession,
  CORRECT_KEYS,
  type SimVariant,
} from './simulation/landmarkSimulator';
import { runThroughPipeline, computeMetrics, pct, type DetectionMetrics } from './simulation/pipeline';

const layout = parseKLE(LAYOUT_PRESETS['us-standard'].data, LAYOUT_PRESETS['us-standard'].isSplit);

const VARIANTS: SimVariant[] = [
  BASE_VARIANT,
  {
    ...BASE_VARIANT,
    name: 'rotated-offset-keystone',
    camera: {
      ...BASE_VARIANT.camera,
      pxPerU: 62,
      rotationDeg: 12,
      offsetPx: { x: 110, y: -10 },
      keystone: 0.0005,
    },
  },
  { ...BASE_VARIANT, name: 'small-hand (0.8)', handScale: 0.8 },
  { ...BASE_VARIANT, name: 'large-hand (1.25)', handScale: 1.25 },
  {
    ...BASE_VARIANT,
    name: 'noisy-combined',
    camera: { ...BASE_VARIANT.camera, rotationDeg: -8, offsetPx: { x: -80, y: -40 }, keystone: -0.0003 },
    handScale: 0.9,
    pressSigmaU: 0.22,
    restSigmaU: 0.18,
    landmarkSigmaPx: 4,
    calibrationSigmaPx: 6,
  },
  { ...BASE_VARIANT, name: 'camera-bumped (+35px,+20px)', postCalibrationShiftPx: { x: 35, y: 20 } },
];

/**
 * 判定が崩れる境界を見るためのストレス条件 (合否ではなく測定用)。
 * 生成モデルの仮定 (打鍵指先が最も近い・指先が重ならない) をわざと弱める。
 */
const STRESS_VARIANTS: SimVariant[] = [
  { ...BASE_VARIANT, name: 'stress: finger crowding (minSep 0.35U)', minFingerSepU: 0.35 },
  { ...BASE_VARIANT, name: 'stress: sloppy strike (press σ 0.35U)', pressSigmaU: 0.35 },
  { ...BASE_VARIANT, name: 'stress: camera-bumped (+70px)', postCalibrationShiftPx: { x: 70, y: 0 } },
];

const SCRIPT_OPTS = { length: 800, overreachRate: 0.2, pinkyAvoidanceRate: 0.2 };

function runVariant(variant: SimVariant, seed: number) {
  const script = buildScript({ seed, ...SCRIPT_OPTS });
  const sim = simulateSession(layout, script, variant, { seed: seed + 1 });
  const analyzed = runThroughPipeline(sim);
  return { sim, analyzed, metrics: computeMetrics(analyzed) };
}

/** HabitAnalyzer を SSR で描画し、出たラベル名と回数を取り出す (本番コンポーネントそのもの)。 */
function habitLabels(keystrokes: KeystrokeLog[]): Record<string, number> {
  const html = renderToStaticMarkup(<HabitAnalyzer wrongKeystrokes={summarizeKeystrokes(keystrokes).wrongKeystrokes} />);
  const out: Record<string, number> = {};
  const re = /<span class="habit-badge">([^<]+)<\/span>.*?<span class="habit-count">\((\d+) times\)<\/span>/g;
  for (const m of html.matchAll(re)) out[m[1]] = Number(m[2]);
  return out;
}

describe('landmark simulator: determinism and ground truth', () => {
  it('produces identical sessions for the same seed and different ones for another seed', () => {
    const script = buildScript({ seed: 7, ...SCRIPT_OPTS, length: 50 });
    const a = simulateSession(layout, script, BASE_VARIANT, { seed: 11 });
    const b = simulateSession(layout, buildScript({ seed: 7, ...SCRIPT_OPTS, length: 50 }), BASE_VARIANT, { seed: 11 });
    const c = simulateSession(layout, script, BASE_VARIANT, { seed: 12 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.frames)).not.toBe(JSON.stringify(c.frames));
  });

  it('builds scripts that mix correct, Index Overreach and Pinky Avoidance strokes', () => {
    const script = buildScript({ seed: 3, ...SCRIPT_OPTS });
    const kinds = new Set(script.map((s) => s.kind));
    expect(kinds).toEqual(new Set(['correct', 'indexOverreach', 'pinkyAvoidance']));
    for (const s of script) {
      if (s.kind === 'indexOverreach') expect(s.finger).toMatch(/Index$/);
      if (s.kind === 'pinkyAvoidance') expect(s.finger).toMatch(/Ring$/);
    }
    expect(() => indexOverreachStroke('KeyA')).toThrow();
    expect(() => pinkyAvoidanceStroke('KeyD')).toThrow();
  });

  it('noise-free strike tips land on the key centre after the real calibration + mapping path', () => {
    const exact: SimVariant = {
      ...BASE_VARIANT,
      name: 'noise-free',
      camera: { ...BASE_VARIANT.camera, rotationDeg: 12, keystone: 0.0005 },
      pressSigmaU: 0,
      restSigmaU: 0,
      landmarkSigmaPx: 0,
      calibrationSigmaPx: 0,
    };
    const script = CORRECT_KEYS.map(correctStroke);
    const analyzed = runThroughPipeline(simulateSession(layout, script, exact, { seed: 1 }));
    for (const { truth, result } of analyzed) {
      expect(result.predictedFinger, truth.code).toBe(truth.finger);
      expect(result.isCorrectFinger, truth.code).toBe(true);
      expect(result.distanceU ?? Infinity, truth.code).toBeLessThan(1e-6);
    }
  });
});

describe('landmark simulation through fingerAnalysis: sensitivity / false rejects', () => {
  const rows: { name: string; m: DetectionMetrics }[] = [];

  for (const variant of VARIANTS) {
    it(`variant ${variant.name}`, () => {
      const { metrics } = runVariant(variant, 2026);
      rows.push({ name: variant.name, m: metrics });

      // 最低限の合否ライン。実測値はレポートに記録 (緩めの回帰ガード)。
      expect(metrics.wrongStrokes).toBeGreaterThan(200);
      expect(metrics.correctStrokes).toBeGreaterThan(400);
      expect(metrics.sensitivity).toBeGreaterThanOrEqual(LIMITS[variant.name].minSensitivity);
      expect(metrics.falseRejectRate).toBeLessThanOrEqual(LIMITS[variant.name].maxFalseReject);
    });
  }

  for (const variant of STRESS_VARIANTS) {
    it(`stress ${variant.name} (measured, not gated)`, () => {
      const { metrics } = runVariant(variant, 2026);
      rows.push({ name: variant.name, m: metrics });
      // 回帰ガードではなく測定のみ。NaN でないこと (= 実際に集計できたこと) だけ確かめる。
      expect(Number.isNaN(metrics.sensitivity)).toBe(false);
      expect(Number.isNaN(metrics.falseRejectRate)).toBe(false);
    });
  }

  it('prints the measurement table', () => {
    const table = rows.map(({ name, m }) => ({
      variant: name,
      correct: m.correctStrokes,
      wrong: m.wrongStrokes,
      sensitivity: pct(m.sensitivity),
      'overreach det.': pct(m.byKind.indexOverreach?.rate ?? NaN),
      'pinkyAvoid det.': pct(m.byKind.pinkyAvoidance?.rate ?? NaN),
      'false reject': pct(m.falseRejectRate),
      undetermined: pct(m.undeterminedRate),
      'wrong-finger attribution': pct(m.wrongFingerAttribution),
    }));
    console.log('\n[landmark-simulation] seed=2026, us-standard, 800 strokes/variant');
    console.table(table);
    expect(rows).toHaveLength(VARIANTS.length + STRESS_VARIANTS.length);
  });
});

describe('landmark simulation through HabitAnalyzer (habit labelling)', () => {
  it('labels nothing for an all-correct session', () => {
    const script = buildScript({ seed: 5, length: 300, overreachRate: 0, pinkyAvoidanceRate: 0 });
    const analyzed = runThroughPipeline(simulateSession(layout, script, BASE_VARIANT, { seed: 6 }));
    expect(habitLabels(analyzed.map((a) => a.result))).toEqual({});
  });

  it('labels Index Overreach when the middle-finger keys are hit with the index finger', () => {
    const script = [
      ...Array.from({ length: 12 }, (_, i) => indexOverreachStroke(['KeyE', 'KeyD', 'KeyK', 'KeyI'][i % 4])),
      ...['KeyF', 'KeyJ', 'KeyA', 'KeyL', 'KeyS'].map(correctStroke),
    ];
    const analyzed = runThroughPipeline(simulateSession(layout, script, BASE_VARIANT, { seed: 21 }));
    const labels = habitLabels(analyzed.map((a) => a.result));
    expect(Object.keys(labels)).toEqual(['Index Overreach']);
    expect(labels['Index Overreach']).toBeGreaterThanOrEqual(10);
  });

  it('labels Left/Right Pinky Avoidance when pinky keys are hit with the ring finger', () => {
    const script = [
      ...Array.from({ length: 8 }, (_, i) => pinkyAvoidanceStroke(['KeyA', 'KeyQ', 'KeyZ'][i % 3])),
      ...Array.from({ length: 8 }, (_, i) => pinkyAvoidanceStroke(['Semicolon', 'KeyP', 'Slash'][i % 3])),
      ...['KeyF', 'KeyJ', 'KeyD', 'KeyK'].map(correctStroke),
    ];
    const analyzed = runThroughPipeline(simulateSession(layout, script, BASE_VARIANT, { seed: 31 }));
    const labels = habitLabels(analyzed.map((a) => a.result));
    expect(new Set(Object.keys(labels))).toEqual(new Set(['Left Pinky Avoidance', 'Right Pinky Avoidance']));
  });
});

/**
 * バリアント別の合否ライン。シード 1/2026/4242/9000/31337 の実測幅から余裕を取った回帰ガード。
 * camera-bumped は既知の弱点 (キャリブレーション後のずれを補正する仕組みがない) の現状値を固定するもの。
 */
const LIMITS: Record<string, { minSensitivity: number; maxFalseReject: number }> = {
  baseline: { minSensitivity: 0.95, maxFalseReject: 0.02 },
  'rotated-offset-keystone': { minSensitivity: 0.95, maxFalseReject: 0.02 },
  'small-hand (0.8)': { minSensitivity: 0.94, maxFalseReject: 0.02 },
  'large-hand (1.25)': { minSensitivity: 0.95, maxFalseReject: 0.02 },
  'noisy-combined': { minSensitivity: 0.88, maxFalseReject: 0.03 },
  'camera-bumped (+35px,+20px)': { minSensitivity: 0.55, maxFalseReject: 0.2 },
};
