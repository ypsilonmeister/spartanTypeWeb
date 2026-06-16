import { useState, useCallback } from 'react';
import type { Point, HomographyMatrix } from '../utils/homography';
import { computeHomography } from '../utils/homography';

export type CalibrationStep = 0 | 1 | 2 | 3 | 4; 
// Steps mapping to keyboard corners: 
// 0: Top-Left
// 1: Top-Right
// 2: Bottom-Right
// 3: Bottom-Left
// 4: Completed

export interface CalibrationData {
  step: CalibrationStep;
  srcPoints: Point[]; // Points from camera
  dstPoints: Point[]; // Points from logical keyboard layout
  homography: HomographyMatrix | null;
}

export function useCalibration(targetCorners: Point[]) {
  const [data, setData] = useState<CalibrationData>({
    step: 0,
    srcPoints: [],
    dstPoints: targetCorners,
    homography: null,
  });

  const recordPoint = useCallback((x: number, y: number) => {
    setData((prev) => {
      if (prev.step >= 4) return prev; // Already completed

      const newSrcPoints = [...prev.srcPoints, { x, y }];
      const nextStep = (prev.step + 1) as CalibrationStep;

      let newHomography = prev.homography;
      if (nextStep === 4) {
        newHomography = computeHomography(newSrcPoints, prev.dstPoints);
        if (!newHomography) {
          console.error("Homography calculation failed. Points might be collinear or invalid.");
          alert("キャリブレーションに失敗しました。座標が正しく読み取れませんでした。最初からやり直してください。");
          return {
            step: 0,
            srcPoints: [],
            dstPoints: prev.dstPoints,
            homography: null,
          };
        }
      }

      return {
        ...prev,
        step: nextStep,
        srcPoints: newSrcPoints,
        homography: newHomography,
      };
    });
  }, []);

  const resetCalibration = useCallback(() => {
    setData({
      step: 0,
      srcPoints: [],
      dstPoints: targetCorners,
      homography: null,
    });
  }, [targetCorners]);

  return {
    ...data,
    recordPoint,
    resetCalibration,
  };
}
