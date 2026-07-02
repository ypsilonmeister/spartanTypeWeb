import { LAYOUT_PRESETS } from '../../assets/layoutTemplates';
import type { LayoutPresetId } from '../../assets/layoutTemplates';

interface CalibrationLayoutSelectStepProps {
  presetId: LayoutPresetId | 'custom';
  uploadedData: unknown;
  uploadedIsSplit: boolean;
  onPresetChange: (presetId: LayoutPresetId | 'custom') => void;
  onUploadedIsSplitChange: (isSplit: boolean) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onStartCalibration: () => void;
}

export const CalibrationLayoutSelectStep = ({
  presetId,
  uploadedData,
  uploadedIsSplit,
  onPresetChange,
  onUploadedIsSplitChange,
  onFileUpload,
  onStartCalibration,
}: CalibrationLayoutSelectStepProps) => (
  <div>
    <div className="calibration-step-label is-cyan">
      Step 1: 配列の選択
    </div>
    <h2 className="calibration-step-title">
      キーボードの種類
    </h2>
    <p className="calibration-copy is-muted">
      お使いのキーボード配列を選択してください。カスタムJSON（KLE / Vial）も読み込めます。
    </p>

    <div className="calibration-layout-grid">
      {(Object.keys(LAYOUT_PRESETS) as LayoutPresetId[]).map((presetKey) => (
        <button
          key={presetKey}
          onClick={() => onPresetChange(presetKey)}
          className={`calibration-preset-btn${presetId === presetKey ? ' is-active' : ''}`}
        >
          {LAYOUT_PRESETS[presetKey].name}
        </button>
      ))}
      <button
        onClick={() => onPresetChange('custom')}
        className={`calibration-preset-btn is-wide${presetId === 'custom' ? ' is-active' : ''}`}
      >
        カスタム配列 (JSONファイル読込)
      </button>
    </div>

    {presetId === 'custom' && (
      <div className="calibration-upload-box">
        <div className="calibration-upload-label">KLE / Vial のJSONファイルを選択:</div>
        <input
          type="file"
          accept=".json"
          onChange={onFileUpload}
          className="calibration-file-input"
        />
        {(!uploadedData || Array.isArray(uploadedData)) && (
          <label
            className="calibration-checkbox-label"
          >
            <input
              type="checkbox"
              checked={uploadedIsSplit}
              onChange={(event) => onUploadedIsSplitChange(event.target.checked)}
              className="calibration-checkbox"
            />
            スプリット配列 (左右分割キーボード)
          </label>
        )}
      </div>
    )}

    <button
      onClick={onStartCalibration}
      className="calibration-btn is-cyan"
    >
      決定してキャリブレーションへ
    </button>
  </div>
);
