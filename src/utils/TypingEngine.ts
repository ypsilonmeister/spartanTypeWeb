import { applyHomography } from './homography';
import type { HomographyMatrix, Point } from './homography';
import type { KeyboardLayout, Key } from '../types/kle';
import { matchKLEKey, expectedFingerMap } from './keyMap';
import type { CalibrationHomography } from './calibrationStorage';

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
  frames: FrameLog[];
  keystrokes: KeystrokeLog[];
}

export interface UnanalyzedSessionData {
  blob: Blob | null;
  keystrokes: KeystrokeLog[];
  homography: CalibrationHomography;
}

const FINGERS = [
  { index: 4, name: 'Thumb' },
  { index: 8, name: 'Index' },
  { index: 12, name: 'Middle' },
  { index: 16, name: 'Ring' },
  { index: 20, name: 'Pinky' }
];

export class TypingEngine {
  private layout: KeyboardLayout;
  private homography: CalibrationHomography;
  private onKeyPressCallback?: (code: string) => void;
  
  private frames: FrameLog[] = [];
  private keystrokes: KeystrokeLog[] = [];
  private isRecording = false;
  private sessionStart = 0;

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return; // Prevent continuous logging on long press

    if (this.onKeyPressCallback) {
      this.onKeyPressCallback(e.code);
    }
    
    if (!this.isRecording) return;
    this.keystrokes.push({
      timestamp: performance.now() - this.sessionStart,
      key: e.key,
      code: e.code,
    });
  };

  constructor(layout: KeyboardLayout, homography: CalibrationHomography, onKeyPressCallback?: (code: string) => void) {
    this.layout = layout;
    this.homography = homography;
    this.onKeyPressCallback = onKeyPressCallback;
    
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
    this.isRecording = true;
    this.sessionStart = startTime;
  }

  public stopSession() {
    this.isRecording = false;
  }

  /**
   * タイムスタンプに最も近いフレームを検索する。
   * @param timestamp - 比較対象のタイムスタンプ (ms)
   * @param maxDiffMs - この値より差が大きければ null を返す (デフォルト 500ms)
   */
  private findNearestFrame(timestamp: number, maxDiffMs = 500): FrameLog | null {
    let nearestFrame: FrameLog | null = null;
    let minTimeDiff = Infinity;
    for (const frame of this.frames) {
      const diff = Math.abs(frame.timestamp - timestamp);
      if (diff < minTimeDiff) {
        minTimeDiff = diff;
        nearestFrame = frame;
      }
    }
    return nearestFrame !== null && minTimeDiff <= maxDiffMs ? nearestFrame : null;
  }

  public getRawKeystrokes(): KeystrokeLog[] {
    return this.keystrokes;
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

      const expectedFinger = expectedFingerMap[ks.code] || 'Unknown';
      
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

    const expectedFinger = expectedFingerMap[keystroke.code] || 'Unknown';

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
    canvasHeight: number
  ): Point[] {
    const mappedTips: Record<string, Point> = {};
    const uiPointers: Point[] = []; // Usually Index fingers

    if (hands && hands.length > 0) {
      for (const hand of hands) {
        let activeHomography: HomographyMatrix;
        if (this.homography && typeof this.homography === 'object' && 'isSplit' in this.homography) {
          activeHomography = hand.handedness === 'Left' ? this.homography.left : this.homography.right;
        } else {
          activeHomography = this.homography as HomographyMatrix;
        }

        const indexTip = hand.landmarks[8];
        if (indexTip) {
          const screenPt = { x: (1 - indexTip.x) * canvasWidth, y: indexTip.y * canvasHeight };
          uiPointers.push(applyHomography(activeHomography, screenPt));
        }

        for (const finger of FINGERS) {
          const tip = hand.landmarks[finger.index];
          if (tip) {
            const pt = { x: (1 - tip.x) * canvasWidth, y: tip.y * canvasHeight };
            mappedTips[`${hand.handedness}${finger.name}`] = applyHomography(activeHomography, pt);
          }
        }
      }
    }

    if (this.isRecording) {
      this.frames.push({
        timestamp,
        mappedTips: mappedTips
      });
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
