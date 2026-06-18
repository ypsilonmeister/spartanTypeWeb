import type { HandData } from './TypingEngine';

/**
 * MediaPipe HandLandmarker の検出結果の最低限の型定義。
 * @mediapipe/tasks-vision から HandLandmarkerResult をインポートすることも可能だが、
 * Worker と Main Thread 両方で使うため最小限の構造として定義する。
 */
export interface MediaPipeHandResult {
  landmarks?: { x: number; y: number; z: number; visibility?: number }[][];
  handednesses?: { categoryName: string }[][];
}

/**
 * MediaPipe の生の検出結果を、アプリ内の HandData 配列に変換する共通ユーティリティ。
 *
 * MediaPipe は左右を「カメラから見た視点」で返す。
 * ユーザーが自撮りカメラを使っている場合、映像は左右反転されており
 * categoryName が 'Left' のとき実際にはユーザーの右手を指す。
 * ここでは映像の左右反転を考慮し、landmark[0].x < 0.5 を fallback として使用する。
 *
 * @param results - MediaPipe HandLandmarker の検出結果
 * @returns HandData 配列
 */
export function mapMediaPipeResults(results: MediaPipeHandResult | null | undefined): HandData[] {
  if (!results?.landmarks || results.landmarks.length === 0) {
    return [];
  }
  return results.landmarks.map((landmarks, index) => {
    const catName = results.handednesses?.[index]?.[0]?.categoryName;
    const handedness: 'Left' | 'Right' =
      catName === 'Left' || catName === 'Right'
        ? catName
        : landmarks[0].x < 0.5
          ? 'Right'
          : 'Left';
    return { landmarks, handedness };
  });
}
