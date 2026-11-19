/**
 * ランドマーク模擬ジェネレータ (テスト専用)。
 *
 * 「打つキー + 実際に使う指 (正解)」の台本から、MediaPipe HandLandmarker が返すのと
 * 同じ形の手ランドマーク列 (21 点 / 手, 正規化カメラ座標) と、解析経路が要求する
 * 入力一式 (キャリブレーション行列・カメラサイズ・ミラー設定・打鍵ログ) を合成する。
 *
 * 生成モデル:
 *   1. 各手の指はホームキー (ASDF / JKL;) を基準に、手の大きさ handScale で手の重心から
 *      伸縮した位置に休む。親指はスペースバー上。
 *   2. 打鍵する指は狙ったキー中心 + N(0, pressSigmaU) へ移動する。同じ手の他の指は
 *      打鍵指の変位の follow 倍だけ追従し、N(0, restSigmaU) 揺らぐ。
 *      打鍵指先に minFingerSepU より近づいた他の指は押し退ける (指先は重ならない)。
 *   3. キーボード平面 (レイアウト座標 U) → カメラ画素 を、回転・拡大・オフセット・
 *      台形 (透視) 歪みを持つ射影で写し、画素ノイズ landmarkSigmaPx を加える。
 *   4. アプリ既定のミラー表示 (mirror=true) を前提に、生ランドマーク x を 1 - x で保存する。
 *   5. キャリブレーションはアプリと同じアンカー (HOME_ANCHORS + 四隅) に指先を置いた
 *      ときの画面座標 (+ calibrationSigmaPx) を集め、本番の computeHomographyLS で解く。
 *
 * 乱数は mulberry32 のシード固定で、同じ (台本, バリアント, シード) なら出力は完全に一致する。
 */
import type { KeyboardLayout } from '../../../types/kle';
import type { Point, HomographyMatrix } from '../../../types/geometry';
import type { HandData, HandSide, KeystrokeLog } from '../../../types/session';
import type { CalibrationCameraSize } from '../../../types/calibration';
import { findTargetKey } from '../../fingerAnalysis';
import { expectedFingerMap } from '../../../utils/keyMap';
import {
  resolveAnchors,
  HOME_ANCHORS,
  LEFT_CORNER_ANCHORS,
  RIGHT_CORNER_ANCHORS,
  FINGERTIP_LANDMARK,
  type FingerName,
} from '../../../utils/calibrationAnchors';
import { computeHomographyLS } from '../../../utils/homography';

// ---------------------------------------------------------------------------
// 乱数
// ---------------------------------------------------------------------------

export interface Rng {
  next(): number;
  gauss(sigma?: number): number;
  pick<T>(items: readonly T[]): T;
}

/** mulberry32 + Box-Muller。シード固定で決定的。 */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    gauss(sigma = 1) {
      const u = Math.max(next(), 1e-12);
      const v = next();
      return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
  };
}

// ---------------------------------------------------------------------------
// 台本
// ---------------------------------------------------------------------------

export type StrokeKind = 'correct' | 'indexOverreach' | 'pinkyAvoidance';

export interface ScriptStroke {
  /** KeyboardEvent.code */
  code: string;
  /** 実際に打鍵に使う指 (例: 'LeftIndex')。これが正解ラベル。 */
  finger: string;
  kind: StrokeKind;
}

/** 正しい指で打つ候補キー (英字 + 句読点、標準指割り当てを持つもの)。 */
export const CORRECT_KEYS = [
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
  'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash',
] as const;

/** 中指担当キー (Index Overreach の対象)。 */
export const MIDDLE_KEYS = ['KeyE', 'KeyD', 'KeyC', 'KeyI', 'KeyK', 'Comma'] as const;
/** 小指担当キー (Pinky Avoidance の対象)。 */
export const PINKY_KEYS = ['KeyQ', 'KeyA', 'KeyZ', 'KeyP', 'Semicolon', 'Slash'] as const;

function standardFinger(code: string): string {
  const f = expectedFingerMap[code];
  if (typeof f !== 'string') throw new Error(`no single expected finger for ${code}`);
  return f;
}

/** 正しい指の打鍵。 */
export function correctStroke(code: string): ScriptStroke {
  return { code, finger: standardFinger(code), kind: 'correct' };
}

/** 中指担当キーを同じ手の人差し指で打つ。 */
export function indexOverreachStroke(code: string): ScriptStroke {
  const expected = standardFinger(code);
  if (!expected.endsWith('Middle')) throw new Error(`${code} is not a middle-finger key`);
  return { code, finger: expected.replace('Middle', 'Index'), kind: 'indexOverreach' };
}

/** 小指担当キーを同じ手の薬指で打つ。 */
export function pinkyAvoidanceStroke(code: string): ScriptStroke {
  const expected = standardFinger(code);
  if (!expected.endsWith('Pinky')) throw new Error(`${code} is not a pinky key`);
  return { code, finger: expected.replace('Pinky', 'Ring'), kind: 'pinkyAvoidance' };
}

export interface ScriptOptions {
  seed: number;
  length: number;
  /** 打鍵が Index Overreach になる確率。 */
  overreachRate: number;
  /** 打鍵が Pinky Avoidance になる確率。 */
  pinkyAvoidanceRate: number;
}

/** シード固定で正しい打鍵と意図的な誤り打鍵を混ぜた台本を作る。 */
export function buildScript(opts: ScriptOptions): ScriptStroke[] {
  const rng = createRng(opts.seed);
  const script: ScriptStroke[] = [];
  for (let i = 0; i < opts.length; i++) {
    const r = rng.next();
    if (r < opts.overreachRate) {
      script.push(indexOverreachStroke(rng.pick(MIDDLE_KEYS)));
    } else if (r < opts.overreachRate + opts.pinkyAvoidanceRate) {
      script.push(pinkyAvoidanceStroke(rng.pick(PINKY_KEYS)));
    } else {
      script.push(correctStroke(rng.pick(CORRECT_KEYS)));
    }
  }
  return script;
}

// ---------------------------------------------------------------------------
// バリアント (カメラ・手・ノイズ)
// ---------------------------------------------------------------------------

export interface CameraModel {
  width: number;
  height: number;
  /** レイアウト 1U あたりの画素数。 */
  pxPerU: number;
  /** キーボード平面の画面内回転 (度)。 */
  rotationDeg: number;
  /** レイアウト中心を画面中心からずらす量 (画素)。 */
  offsetPx: Point;
  /** 台形歪み (画面中心からの y 画素 1 あたりの射影 w 増分)。0 で正射影。 */
  keystone: number;
}

export interface SimVariant {
  name: string;
  camera: CameraModel;
  /** 手の大きさ (指間隔のキーピッチ比)。1 = ホームキーにぴったり。 */
  handScale: number;
  /** 打鍵指の変位に対する同じ手の他指の追従率。 */
  follow: number;
  /** 打鍵指先のキー中心からのばらつき (U)。 */
  pressSigmaU: number;
  /** 休んでいる指のばらつき (U)。 */
  restSigmaU: number;
  /** 打鍵指先から他の指先が保つ最小距離 (U)。 */
  minFingerSepU: number;
  /** ランドマーク検出の画素ノイズ。 */
  landmarkSigmaPx: number;
  /** キャリブレーション時の指先画素ノイズ。 */
  calibrationSigmaPx: number;
  /** キャリブレーション後にカメラ (またはキーボード) がずれた量 (画素)。省略時 0。 */
  postCalibrationShiftPx?: Point;
}

const BASE_CAMERA: CameraModel = {
  width: 1280,
  height: 720,
  pxPerU: 70,
  rotationDeg: 0,
  offsetPx: { x: 0, y: -60 },
  keystone: 0,
};

export const BASE_VARIANT: SimVariant = {
  name: 'baseline',
  camera: BASE_CAMERA,
  handScale: 1,
  follow: 0.35,
  pressSigmaU: 0.15,
  restSigmaU: 0.12,
  minFingerSepU: 0.7,
  landmarkSigmaPx: 2,
  calibrationSigmaPx: 3,
};

// ---------------------------------------------------------------------------
// 幾何
// ---------------------------------------------------------------------------

type Mat3 = number[];

function mul3(A: Mat3, B: Mat3): Mat3 {
  const C = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
  return C;
}

function project(M: Mat3, p: Point): Point {
  const w = M[6] * p.x + M[7] * p.y + M[8];
  return {
    x: (M[0] * p.x + M[1] * p.y + M[2]) / w,
    y: (M[3] * p.x + M[4] * p.y + M[5]) / w,
  };
}

/** レイアウト座標 (U) → 画面画素 (ミラー補正後の表示座標) の真の射影。 */
export function layoutToScreenMatrix(layout: KeyboardLayout, cam: CameraModel): Mat3 {
  const cx = layout.width / 2;
  const cy = layout.height / 2;
  const th = (cam.rotationDeg * Math.PI) / 180;
  const c = Math.cos(th) * cam.pxPerU;
  const s = Math.sin(th) * cam.pxPerU;
  const center = [1, 0, -cx, 0, 1, -cy, 0, 0, 1];
  const rotScale = [c, -s, 0, s, c, 0, 0, 0, 1];
  const keystone = [1, 0, 0, 0, 1, 0, 0, cam.keystone, 1];
  const toScreen = [
    1, 0, cam.width / 2 + cam.offsetPx.x,
    0, 1, cam.height / 2 + cam.offsetPx.y,
    0, 0, 1,
  ];
  return mul3(toScreen, mul3(keystone, mul3(rotScale, center)));
}

function keyCenter(layout: KeyboardLayout, code: string): Point {
  const k = findTargetKey(layout, code);
  if (!k) throw new Error(`key ${code} not in layout`);
  return { x: k.x + k.w / 2, y: k.y + k.h / 2 };
}

const FINGER_NAMES: FingerName[] = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
const HOME_CODES: Record<HandSide, Record<Exclude<FingerName, 'Thumb'>, string>> = {
  Left: { Index: 'KeyF', Middle: 'KeyD', Ring: 'KeyS', Pinky: 'KeyA' },
  Right: { Index: 'KeyJ', Middle: 'KeyK', Ring: 'KeyL', Pinky: 'Semicolon' },
};

type HandPose = Record<FingerName, Point>;

/** 各手の休止姿勢 (レイアウト座標)。handScale で手の重心から伸縮する。 */
function restPoses(layout: KeyboardLayout, handScale: number): Record<HandSide, HandPose> {
  const space = keyCenter(layout, 'Space');
  const out = {} as Record<HandSide, HandPose>;
  for (const side of ['Left', 'Right'] as HandSide[]) {
    const home = HOME_CODES[side];
    const pose = {
      Index: keyCenter(layout, home.Index),
      Middle: keyCenter(layout, home.Middle),
      Ring: keyCenter(layout, home.Ring),
      Pinky: keyCenter(layout, home.Pinky),
      Thumb: { x: space.x + (side === 'Left' ? -1.25 : 1.25), y: space.y },
    } as HandPose;
    const fingers = ['Index', 'Middle', 'Ring', 'Pinky'] as const;
    const c = {
      x: fingers.reduce((a, f) => a + pose[f].x, 0) / 4,
      y: fingers.reduce((a, f) => a + pose[f].y, 0) / 4,
    };
    for (const f of FINGER_NAMES) {
      pose[f] = { x: c.x + handScale * (pose[f].x - c.x), y: c.y + handScale * (pose[f].y - c.y) };
    }
    out[side] = pose;
  }
  return out;
}

function splitFinger(finger: string): { side: HandSide; name: FingerName } {
  const side: HandSide = finger.startsWith('Left') ? 'Left' : 'Right';
  return { side, name: finger.slice(side.length) as FingerName };
}

/** 指先 5 点 (レイアウト座標) から 21 点の手ランドマーク (正規化・ミラー保存) を作る。 */
function buildHand(
  tips: HandPose,
  handScale: number,
  M: Mat3,
  cam: CameraModel,
  rng: Rng,
  sigmaPx: number,
  side: HandSide
): HandData {
  const fingers = ['Index', 'Middle', 'Ring', 'Pinky'] as const;
  const cx = fingers.reduce((a, f) => a + tips[f].x, 0) / 4;
  const cy = fingers.reduce((a, f) => a + tips[f].y, 0) / 4;
  const wrist = { x: cx + (side === 'Left' ? 0.6 : -0.6) * handScale, y: cy + 3 * handScale };

  const toLandmark = (p: Point) => {
    const px = project(M, p);
    const sx = px.x + rng.gauss(sigmaPx);
    const sy = px.y + rng.gauss(sigmaPx);
    // アプリ既定は mirror=true: 画面 x = (1 - lx) * W なので lx = 1 - sx / W。
    return { x: 1 - sx / cam.width, y: sy / cam.height, z: 0 };
  };

  const landmarks = new Array<{ x: number; y: number; z: number }>(21);
  landmarks[0] = toLandmark(wrist);
  const fracs = [0.45, 0.65, 0.82];
  for (const f of FINGER_NAMES) {
    const tipIdx = FINGERTIP_LANDMARK[f];
    const tip = tips[f];
    fracs.forEach((fr, j) => {
      landmarks[tipIdx - 3 + j] = toLandmark({
        x: wrist.x + (tip.x - wrist.x) * fr,
        y: wrist.y + (tip.y - wrist.y) * fr,
      });
    });
    landmarks[tipIdx] = toLandmark(tip);
  }
  // MediaPipe の handedness は俯瞰カメラで信頼できない (アプリも使わない) ので
  // わざと逆を入れておき、assignHandSidesByCameraX 経由の左右判定を通す。
  return { landmarks, handedness: side === 'Left' ? 'Right' : 'Left' };
}

// ---------------------------------------------------------------------------
// セッション合成
// ---------------------------------------------------------------------------

export interface SimFrame {
  timestamp: number;
  hands: HandData[];
}

export interface StrokeTruth extends ScriptStroke {
  timestamp: number;
  /** 打鍵指先の真のレイアウト座標 (ノイズ込み・画素ノイズ前)。 */
  pressPoint: Point;
}

export interface SimulatedSession {
  layout: KeyboardLayout;
  variant: SimVariant;
  /** 本番 computeHomographyLS で解いたキャリブレーション行列 (画面画素 → レイアウト U)。 */
  homography: HomographyMatrix;
  cameraSize: CalibrationCameraSize;
  mirror: true;
  frames: SimFrame[];
  keystrokes: KeystrokeLog[];
  truth: StrokeTruth[];
}

const CODE_TO_KEY: Record<string, string> = {
  Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Space: ' ',
};

function eventKey(code: string): string {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  return CODE_TO_KEY[code] ?? code;
}

/** アプリのキャリブレーション手順 (ホーム 8 指 + 四隅) を模擬して行列を解く。 */
export function simulateCalibration(
  layout: KeyboardLayout,
  M: Mat3,
  rng: Rng,
  sigmaPx: number
): HomographyMatrix {
  const anchors = resolveAnchors(layout, [
    ...HOME_ANCHORS,
    ...LEFT_CORNER_ANCHORS,
    ...RIGHT_CORNER_ANCHORS,
  ]).filter((a) => a.target !== null);
  const camera = anchors.map((a) => {
    const p = project(M, a.target as Point);
    return { x: p.x + rng.gauss(sigmaPx), y: p.y + rng.gauss(sigmaPx) };
  });
  const H = computeHomographyLS(camera, anchors.map((a) => a.target as Point));
  if (!H) throw new Error('calibration failed');
  return H;
}

export interface SessionOptions {
  seed: number;
  /** 打鍵間隔 (ms)。 */
  intervalMs?: number;
  /** カメラのフレーム間隔 (ms)。 */
  frameMs?: number;
}

/**
 * 台本とバリアントから模擬セッションを合成する。
 * フレームはカメラのフレーム格子上に置かれ、各打鍵に最も近いフレームが打鍵姿勢、
 * それ以外のフレームは休止姿勢になる。
 */
export function simulateSession(
  layout: KeyboardLayout,
  script: ScriptStroke[],
  variant: SimVariant,
  opts: SessionOptions
): SimulatedSession {
  const rng = createRng(opts.seed);
  const intervalMs = opts.intervalMs ?? 220;
  const frameMs = opts.frameMs ?? 1000 / 30;
  const cam = variant.camera;
  const M = layoutToScreenMatrix(layout, cam);
  const homography = simulateCalibration(layout, M, rng, variant.calibrationSigmaPx);
  const shift = variant.postCalibrationShiftPx;
  const Mframes = shift ? mul3([1, 0, shift.x, 0, 1, shift.y, 0, 0, 1], M) : M;
  const rest = restPoses(layout, variant.handScale);

  const jitterPose = (pose: HandPose): HandPose => {
    const out = {} as HandPose;
    for (const f of FINGER_NAMES) {
      out[f] = { x: pose[f].x + rng.gauss(variant.restSigmaU), y: pose[f].y + rng.gauss(variant.restSigmaU) };
    }
    return out;
  };

  const handsFor = (poses: Record<HandSide, HandPose>): HandData[] =>
    (['Left', 'Right'] as HandSide[]).map((side) =>
      buildHand(poses[side], variant.handScale, Mframes, cam, rng, variant.landmarkSigmaPx, side)
    );

  const keystrokes: KeystrokeLog[] = [];
  const truth: StrokeTruth[] = [];
  const strikeFrames = new Map<number, Record<HandSide, HandPose>>();

  let t = 500;
  for (const stroke of script) {
    t += intervalMs + Math.round(rng.gauss(25));
    const target = keyCenter(layout, stroke.code);
    const { side, name } = splitFinger(stroke.finger);

    const press = {
      x: target.x + rng.gauss(variant.pressSigmaU),
      y: target.y + rng.gauss(variant.pressSigmaU),
    };
    const restPose = rest[side];
    const handShift = {
      x: variant.follow * (press.x - restPose[name].x),
      y: variant.follow * (press.y - restPose[name].y),
    };
    const pose = jitterPose(restPose);
    for (const f of FINGER_NAMES) {
      if (f === name) continue;
      const p = { x: pose[f].x + handShift.x, y: pose[f].y + handShift.y };
      // 他の指先は打鍵指先に重ならない: minFingerSepU まで押し退ける。
      const dx = p.x - press.x;
      const dy = p.y - press.y;
      const d = Math.hypot(dx, dy);
      if (d < variant.minFingerSepU) {
        const ux = d > 1e-9 ? dx / d : Math.sign(restPose[f].x - restPose[name].x) || 1;
        const uy = d > 1e-9 ? dy / d : 0;
        p.x = press.x + ux * variant.minFingerSepU;
        p.y = press.y + uy * variant.minFingerSepU;
      }
      pose[f] = p;
    }
    pose[name] = press;

    const otherSide: HandSide = side === 'Left' ? 'Right' : 'Left';
    const frameIdx = Math.round(t / frameMs);
    strikeFrames.set(frameIdx, { [side]: pose, [otherSide]: jitterPose(rest[otherSide]) } as Record<
      HandSide,
      HandPose
    >);

    keystrokes.push({ timestamp: t, key: eventKey(stroke.code), code: stroke.code });
    truth.push({ ...stroke, timestamp: t, pressPoint: press });
  }

  const frames: SimFrame[] = [];
  const lastFrame = Math.round((t + 500) / frameMs);
  for (let i = 0; i <= lastFrame; i++) {
    const strike = strikeFrames.get(i);
    const poses = strike ?? { Left: jitterPose(rest.Left), Right: jitterPose(rest.Right) };
    frames.push({ timestamp: i * frameMs, hands: handsFor(poses) });
  }

  return {
    layout,
    variant,
    homography,
    cameraSize: { width: cam.width, height: cam.height },
    mirror: true,
    frames,
    keystrokes,
    truth,
  };
}
