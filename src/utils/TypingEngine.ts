import type { Point } from './homography';
import type { KeyboardLayout, Key } from '../types/kle';
import { matchKLEKey, expectedFingerMap } from './keyMap';
import { applyCalibrationHomography } from './calibrationStorage';
import type { CalibrationCameraSize, CalibrationHomography } from './calibrationStorage';

export interface HandData {
  landmarks: { x: number, y: number, z: number, visibility?: number }[];
  handedness: 'Left' | 'Right';
}

export interface FrameLog {
  timestamp: number;
  mappedTips: Record<string, Point>; // e.g. { 'LeftThumb': {x,y}, 'RightIndex': {x,y} }
}

export interface KeystrokeLog {
  timestamp: number;
  key: string; 
  code: string; 
  predictedFinger?: string; 
  expectedFinger?: string | string[]; 
  isCorrectFinger?: boolean; 
  distanceU?: number; 
}

export interface SessionData {
  homography: CalibrationHomography;
  calibrationCameraSize?: CalibrationCameraSize;
  frames: FrameLog[];
  keystrokes: KeystrokeLog[];
}

export interface UnanalyzedSessionData {
  blob: Blob | null;
  keystrokes: KeystrokeLog[];
  homography: CalibrationHomography;
  calibrationCameraSize?: CalibrationCameraSize;
  isMirrored?: boolean;
}

const FINGERS = [
  { index: 4, name: 'Thumb' },
  { index: 8, name: 'Index' },
  { index: 12, name: 'Middle' },
  { index: 16, name: 'Ring' },
  { index: 20, name: 'Pinky' }
];

function landmarkToScreen(
  landmark: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number,
  mirror: boolean
): Point {
  return {
    x: (mirror ? 1 - landmark.x : landmark.x) * canvasWidth,
    y: landmark.y * canvasHeight
  };
}

/**
 * Use the same left/right rule as calibration: after mirror correction, the hand
 * on the left side of the camera frame maps to the left half of the keyboard.
 * MediaPipe handedness is often unreliable for top-down keyboard cameras.
 */
function assignHandSidesByCameraX(
  hands: HandData[],
  canvasWidth: number,
  mirror: boolean
): Map<HandData, 'Left' | 'Right'> {
  const withX = hands
    .map((hand) => {
      const wrist = hand.landmarks[0];
      const screenX = wrist ? (mirror ? 1 - wrist.x : wrist.x) * canvasWidth : 0;
      return { hand, screenX };
    })
    .sort((a, b) => a.screenX - b.screenX);

  const sides = new Map<HandData, 'Left' | 'Right'>();
  if (withX.length === 0) return sides;

  if (withX.length === 1) {
    const single = withX[0];
    sides.set(single.hand, single.screenX < canvasWidth / 2 ? 'Left' : 'Right');
    return sides;
  }

  sides.set(withX[0].hand, 'Left');
  sides.set(withX[withX.length - 1].hand, 'Right');
  for (let i = 1; i < withX.length - 1; i++) {
    sides.set(withX[i].hand, withX[i].screenX < canvasWidth / 2 ? 'Left' : 'Right');
  }
  return sides;
}

export class TypingEngine {
  private layout: KeyboardLayout;
  private homography: CalibrationHomography;
  private calibrationCameraSize?: CalibrationCameraSize;
  private onKeyPressCallback?: (code: string, keystrokeIndex: number) => void;
  
  private frames: FrameLog[] = [];
  private keystrokes: KeystrokeLog[] = [];
  private isRecording = false;
  private sessionStart = 0;

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return; // Prevent continuous logging on long press

    // 記録中はキーストロークを先に push し、その index をコールバックへ渡す。
    // リアルタイム解析がフレームとキーストロークを timestamp 近似ではなく
    // index で確実に対応付けられるようにするため。
    let keystrokeIndex = -1;
    if (this.isRecording) {
      keystrokeIndex = this.keystrokes.length;
      this.keystrokes.push({
        timestamp: performance.now() - this.sessionStart,
        key: e.key,
        code: e.code,
      });
    }

    if (this.onKeyPressCallback) {
      this.onKeyPressCallback(e.code, keystrokeIndex);
    }
  };

  constructor(
    layout: KeyboardLayout,
    homography: CalibrationHomography,
    onKeyPressCallback?: (code: string, keystrokeIndex: number) => void,
    calibrationCameraSize?: CalibrationCameraSize
  ) {
    this.layout = layout;
    this.homography = homography;
    this.onKeyPressCallback = onKeyPressCallback;
    this.calibrationCameraSize = calibrationCameraSize;
    
    window.addEventListener('keydown', this.handleKeyDown);
  }

  public destroy() {
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  public get isSessionActive() {
    return this.isRecording;
  }

  public startSession(startTime: number = performance.now()) {
    this.frames = [];
    this.keystrokes = [];
    this.sortedFramesCache = null;
    this.isRecording = true;
    this.sessionStart = startTime;
  }

  public stopSession() {
    this.isRecording = false;
  }

  // exportSession() が複数キーストロークを処理する際に再利用する、
  // timestamp 昇順ソート済みフレーム配列のキャッシュ。
  private sortedFramesCache: FrameLog[] | null = null;

  private getSortedFrames(): FrameLog[] {
    if (!this.sortedFramesCache) {
      // Worker 応答が非順序で届く可能性があるため明示的にソートする。
      this.sortedFramesCache = [...this.frames].sort((a, b) => a.timestamp - b.timestamp);
    }
    return this.sortedFramesCache;
  }

  /**
   * タイムスタンプに最も近いフレームを二分探索で検索する。
   * フレームは時系列順にソート済みのため O(log n) で求まる。
   * @param timestamp - 比較対象のタイムスタンプ (ms)
   * @param maxDiffMs - この値より差が大きければ null を返す (デフォルト 500ms)
   */
  private findNearestFrame(timestamp: number, maxDiffMs = 500): FrameLog | null {
    const frames = this.getSortedFrames();
    if (frames.length === 0) return null;

    // timestamp 以上となる最初の要素を二分探索 (lower bound)
    let lo = 0;
    let hi = frames.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].timestamp < timestamp) lo = mid + 1;
      else hi = mid;
    }

    // 候補は lo (>= timestamp 側) と lo-1 (< timestamp 側) の2つ
    let nearestFrame: FrameLog | null = null;
    let minTimeDiff = Infinity;
    for (const idx of [lo - 1, lo]) {
      if (idx < 0 || idx >= frames.length) continue;
      const diff = Math.abs(frames[idx].timestamp - timestamp);
      if (diff < minTimeDiff) {
        minTimeDiff = diff;
        nearestFrame = frames[idx];
      }
    }
    return nearestFrame !== null && minTimeDiff <= maxDiffMs ? nearestFrame : null;
  }

  public getRawKeystrokes(): KeystrokeLog[] {
    return this.keystrokes;
  }

  public getKeystrokeByIndex(index: number): KeystrokeLog | null {
    return this.keystrokes[index] ?? null;
  }

  public getFrames(): FrameLog[] {
    return this.frames;
  }

  public loadKeystrokes(keystrokes: KeystrokeLog[]) {
    this.keystrokes = keystrokes;
  }

  private findTargetKey(code: string): Key | null {
    const candidates = this.layout.keys.filter(k => matchKLEKey(k.label, code));
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // Resolve identical labels (like ShiftLeft vs ShiftRight) by X coordinate
    // Layout U coordinate: 0 is left, max is right.
    candidates.sort((a, b) => a.x - b.x);
    if (code.includes('Right')) {
      return candidates[candidates.length - 1]; // Rightmost key
    } else {
      return candidates[0]; // Leftmost key
    }
  }

  private isCompactSplitLayout(): boolean {
    return !!this.layout.isSplit && this.layout.keys.length <= 36 && this.layout.width <= 13;
  }

  private getExpectedFinger(code: string, targetKey: Key): string | string[] {
    if (!this.isCompactSplitLayout()) {
      return expectedFingerMap[code] || 'Unknown';
    }

    const centerX = targetKey.x + targetKey.w / 2;
    const centerY = targetKey.y + targetKey.h / 2;

    // 3x5+3 layouts place thumb keys below the three alpha rows.
    if (centerY >= 3) {
      return centerX < this.layout.width / 2 ? 'LeftThumb' : 'RightThumb';
    }

    if (centerX < this.layout.width / 2) {
      const col = Math.round(centerX - 0.5);
      return ['LeftPinky', 'LeftRing', 'LeftMiddle', 'LeftIndex', 'LeftIndex'][col] || 'LeftIndex';
    }

    const col = Math.round(centerX - 7.5);
    return ['RightIndex', 'RightIndex', 'RightMiddle', 'RightRing', 'RightPinky'][col] || 'RightIndex';
  }

  public exportSession(): string {
    const enrichedKeystrokes = this.keystrokes.map(ks => {
      const nearestFrame = this.findNearestFrame(ks.timestamp);

      if (!nearestFrame) {
        return { ...ks, isCorrectFinger: undefined };
      }

      const targetKey = this.findTargetKey(ks.code);
      if (!targetKey) {
        return { ...ks, isCorrectFinger: undefined }; 
      }

      const keyCenter = {
        x: targetKey.x + targetKey.w / 2,
        y: targetKey.y + targetKey.h / 2
      };

      let bestFinger = '';
      let minDistance = Infinity;

      // Find the closest mapped finger tip across all 10 fingers
      for (const [fingerName, mappedTip] of Object.entries(nearestFrame.mappedTips)) {
        const dist = Math.hypot(mappedTip.x - keyCenter.x, mappedTip.y - keyCenter.y);
        if (dist < minDistance) {
          minDistance = dist;
          bestFinger = fingerName;
        }
      }

      const expectedFinger = this.getExpectedFinger(ks.code, targetKey);
      
      // If no fingers mapped or distance is way too far (e.g. hands out of keyboard area)
      if (minDistance > 1.5) {
        return {
          ...ks,
          predictedFinger: bestFinger || 'Unknown',
          expectedFinger,
          isCorrectFinger: undefined,
          distanceU: minDistance
        };
      }

      let isCorrect: boolean;
      if (Array.isArray(expectedFinger)) {
        isCorrect = expectedFinger.includes(bestFinger);
      } else {
        isCorrect = expectedFinger === bestFinger;
      }

      return {
        ...ks,
        predictedFinger: bestFinger,
        expectedFinger,
        isCorrectFinger: isCorrect,
        distanceU: minDistance
      };
    });

    const data: SessionData = {
      homography: this.homography,
      calibrationCameraSize: this.calibrationCameraSize,
      frames: this.frames,
      keystrokes: enrichedKeystrokes,
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Performs real-time proximity calculation for a single keystroke and hand landmarks frame.
   */
  public analyzeKeystrokeRealtime(
    keystroke: KeystrokeLog,
    frame: FrameLog
  ): {
    predictedFinger: string;
    expectedFinger: string | string[];
    isCorrectFinger?: boolean;
    distanceU: number;
  } {
    const targetKey = this.findTargetKey(keystroke.code);
    if (!targetKey) {
      return {
        predictedFinger: 'Unknown',
        expectedFinger: expectedFingerMap[keystroke.code] || 'Unknown',
        distanceU: Infinity
      };
    }

    const keyCenter = {
      x: targetKey.x + targetKey.w / 2,
      y: targetKey.y + targetKey.h / 2
    };

    let bestFinger = '';
    let minDistance = Infinity;

    // Find the closest mapped finger tip across all 10 fingers
    for (const [fingerName, mappedTip] of Object.entries(frame.mappedTips)) {
      const dist = Math.hypot(mappedTip.x - keyCenter.x, mappedTip.y - keyCenter.y);
      if (dist < minDistance) {
        minDistance = dist;
        bestFinger = fingerName;
      }
    }

    const expectedFinger = this.getExpectedFinger(keystroke.code, targetKey);

    // If no fingers mapped or distance is way too far (e.g. hands out of keyboard area)
    if (minDistance > 1.5) {
      return {
        predictedFinger: bestFinger || 'Unknown',
        expectedFinger,
        distanceU: minDistance
      };
    }

    let isCorrect: boolean;
    if (Array.isArray(expectedFinger)) {
      isCorrect = expectedFinger.includes(bestFinger);
    } else {
      isCorrect = expectedFinger === bestFinger;
    }

    return {
      predictedFinger: bestFinger,
      expectedFinger,
      isCorrectFinger: isCorrect,
      distanceU: minDistance
    };
  }

  /**
   * Process a new frame of multiple hands. Used primarily during offline post-session analysis.
   */
  public processFrame(
    hands: HandData[], 
    timestamp: number, 
    canvasWidth: number, 
    canvasHeight: number,
    mirror = true
  ): Point[] {
    const mappedTips: Record<string, Point> = {};
    const uiPointers: Point[] = []; // Usually Index fingers
    const transformWidth = this.calibrationCameraSize?.width || canvasWidth;
    const transformHeight = this.calibrationCameraSize?.height || canvasHeight;

    if (hands && hands.length > 0) {
      const assignedSides = assignHandSidesByCameraX(hands, canvasWidth, mirror);

      for (const hand of hands) {
        const side = assignedSides.get(hand) ?? hand.handedness;

        const indexTip = hand.landmarks[8];
        if (indexTip) {
          const screenPt = landmarkToScreen(indexTip, transformWidth, transformHeight, mirror);
          uiPointers.push(applyCalibrationHomography(this.homography, screenPt, side));
        }

        for (const finger of FINGERS) {
          const tip = hand.landmarks[finger.index];
          if (tip) {
            const pt = landmarkToScreen(tip, transformWidth, transformHeight, mirror);
            mappedTips[`${side}${finger.name}`] = applyCalibrationHomography(this.homography, pt, side);
          }
        }
      }
    }

    if (this.isRecording) {
      this.frames.push({
        timestamp,
        mappedTips: mappedTips
      });
      this.sortedFramesCache = null; // フレーム追加でソート済みキャッシュを無効化
    }

    return uiPointers;
  }

  /**
   * Extracts the character label for real-time visual feedback.
   * Real-time finger correctness is disabled; all validation happens in offline analysis.
   */
  public getTargetChar(code: string): string {
    const targetKey = this.findTargetKey(code);
    const label = targetKey?.label || '';
    return label.replace(/\n/g, '').slice(-1) || '';
  }
}
