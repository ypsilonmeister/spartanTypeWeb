import type { LayoutPresetId } from '../../assets/layoutTemplates';
import type { CalibrationPhase } from '../../types/calibrationFlow';
import type { ResolvedAnchor } from '../../utils/calibrationAnchors';
import { CalibrationLayoutSelectStep } from './CalibrationLayoutSelectStep';

interface CalibrationInteractionPanelProps {
  phase: CalibrationPhase;
  presetId: LayoutPresetId | 'custom';
  uploadedData: unknown;
  uploadedIsSplit: boolean;
  cornerStep: number;
  cornerAnchorsLength: number;
  currentCorner: ResolvedAnchor | undefined;
  cornerInstruction: string;
  onPresetChange: (presetId: LayoutPresetId | 'custom') => void;
  onUploadedIsSplitChange: (isSplit: boolean) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onStartCalibration: () => void;
  onCaptureHome: () => void;
  onCaptureCorner: () => void;
  onComplete: () => void;
  onReset: () => void;
}

export const CalibrationInteractionPanel = ({
  phase,
  presetId,
  uploadedData,
  uploadedIsSplit,
  cornerStep,
  cornerAnchorsLength,
  currentCorner,
  cornerInstruction,
  onPresetChange,
  onUploadedIsSplitChange,
  onFileUpload,
  onStartCalibration,
  onCaptureHome,
  onCaptureCorner,
  onComplete,
  onReset,
}: CalibrationInteractionPanelProps) => (
  <div className="calibration-card">
    {phase === 'select' && (
      <CalibrationLayoutSelectStep
        presetId={presetId}
        uploadedData={uploadedData}
        uploadedIsSplit={uploadedIsSplit}
        onPresetChange={onPresetChange}
        onUploadedIsSplitChange={onUploadedIsSplitChange}
        onFileUpload={onFileUpload}
        onStartCalibration={onStartCalibration}
      />
    )}

    {phase === 'home' && (
      <div>
        <div className="calibration-step-label is-magenta">
          Step 2: ホームポジション
        </div>
        <h2 className="calibration-step-title">
          両手をホームに置く
        </h2>
        <p className="calibration-copy">
          左手を <b>F D S A</b>、右手を <b>J K L ;</b> に正しい指で同時に置き、
          任意のキーまたは下のボタンで記録してください。
        </p>
        <button
          onClick={onCaptureHome}
          className="calibration-btn is-magenta"
        >
          8本指を記録する
        </button>
        <p className="calibration-helper">
          ※ 両手の8指すべてがカメラに映っている必要があります。
        </p>
      </div>
    )}

    {phase === 'corners' && (
      <div>
        <div className="calibration-step-label is-magenta">
          Step 3: 縦アンカー ({cornerStep + 1} / {cornerAnchorsLength})
        </div>
        <h2 className="calibration-step-title">
          {currentCorner
            ? `${currentCorner.hand === 'Left' ? '左手' : '右手'}: ${currentCorner.display}`
            : ''}
        </h2>
        <p className="calibration-copy">
          {cornerInstruction}
        </p>
        <button
          onClick={onCaptureCorner}
          className="calibration-btn is-magenta"
        >
          {currentCorner ? `${currentCorner.display} を記録する` : '記録する'}
        </button>
      </div>
    )}

    {phase === 'complete' && (
      <div>
        <div className="calibration-step-label is-success">
          キャリブレーション完了
        </div>
        <h2 className="calibration-step-title is-success">
          調整完了！
        </h2>
        <p className="calibration-copy is-muted">
          キーを押したとき、下の仮想キーボードにポインター（円）が正しく追従するかテストしてください。
          ずれている点はカメラ映像上でドラッグして微調整できます。
        </p>

        <div className="calibration-action-stack">
          <button
            onClick={onComplete}
            className="calibration-btn is-success"
          >
            この設定で練習を開始する
          </button>
          <button
            onClick={onReset}
            className="calibration-btn is-secondary"
          >
            やり直す (Reset)
          </button>
        </div>
      </div>
    )}
  </div>
);
