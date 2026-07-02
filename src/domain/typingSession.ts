import type { Point } from '../types/geometry';
import type { KeyboardLayout } from '../types/kle';
import {
  landmarkToScreen,
  assignHandSidesByCameraX,
  applyCalibrationHomography,
} from './handGeometry';
import { analyzeKeystrokeAgainstTips } from './fingerAnalysis';
import type { CalibrationCameraSize, CalibrationHomography } from '../types/calibration';
import type {
  HandData,
  FrameLog,
  KeystrokeLog,
  SessionData,
} from '../types/session';

const FINGERS = [
  { index: 4, name: 'Thumb' },
  { index: 8, name: 'Index' },
  { index: 12, name: 'Middle' },
  { index: 16, name: 'Ring' },
  { index: 20, name: 'Pinky' }
];

export class TypingSession {
  private frames: FrameLog[] = [];
  private keystrokes: KeystrokeLog[] = [];
  private isRecording = false;
  private sortedFramesCache: FrameLog[] | null = null;
  private layout: KeyboardLayout;
  private homography: CalibrationHomography;
  private calibrationCameraSize?: CalibrationCameraSize;

  constructor(
    layout: KeyboardLayout,
    homography: CalibrationHomography,
    calibrationCameraSize?: CalibrationCameraSize
  ) {
    this.layout = layout;
    this.homography = homography;
    this.calibrationCameraSize = calibrationCameraSize;
  }

  public get isSessionActive() {
    return this.isRecording;
  }

  public startSession() {
    this.frames = [];
    this.keystrokes = [];
    this.sortedFramesCache = null;
    this.isRecording = true;
  }

  public stopSession() {
    this.isRecording = false;
  }

  public recordKeystroke(key: string, code: string, timestamp: number): number {
    if (!this.isRecording) return -1;

    const keystrokeIndex = this.keystrokes.length;
    this.keystrokes.push({ timestamp, key, code });
    return keystrokeIndex;
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

  public exportSession(): string {
    const enrichedKeystrokes = this.keystrokes.map(ks => {
      const nearestFrame = this.findNearestFrame(ks.timestamp);

      if (!nearestFrame) {
        return { ...ks, isCorrectFinger: undefined };
      }

      const analysis = analyzeKeystrokeAgainstTips(this.layout, ks.code, nearestFrame.mappedTips);
      if (!analysis) {
        return { ...ks, isCorrectFinger: undefined };
      }

      return { ...ks, ...analysis };
    });

    const data: SessionData = {
      homography: this.homography,
      calibrationCameraSize: this.calibrationCameraSize,
      frames: this.frames,
      keystrokes: enrichedKeystrokes,
    };
    return JSON.stringify(data, null, 2);
  }

  public analyzeKeystrokeRealtime(
    keystroke: KeystrokeLog,
    frame: FrameLog
  ) {
    return analyzeKeystrokeAgainstTips(this.layout, keystroke.code, frame.mappedTips);
  }

  public processFrame(
    hands: HandData[],
    timestamp: number,
    canvasWidth: number,
    canvasHeight: number,
    mirror = true
  ): Point[] {
    const mappedTips: Record<string, Point> = {};
    const uiPointers: Point[] = [];
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
      this.frames.push({ timestamp, mappedTips });
      this.sortedFramesCache = null;
    }

    return uiPointers;
  }

  private getSortedFrames(): FrameLog[] {
    if (!this.sortedFramesCache) {
      this.sortedFramesCache = [...this.frames].sort((a, b) => a.timestamp - b.timestamp);
    }
    return this.sortedFramesCache;
  }

  private findNearestFrame(timestamp: number, maxDiffMs = 500): FrameLog | null {
    const frames = this.getSortedFrames();
    if (frames.length === 0) return null;

    let lo = 0;
    let hi = frames.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].timestamp < timestamp) lo = mid + 1;
      else hi = mid;
    }

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
}
