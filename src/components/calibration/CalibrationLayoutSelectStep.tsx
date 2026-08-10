import { LAYOUT_PRESETS } from '../../assets/layoutTemplates';
import type { LayoutPresetId } from '../../assets/layoutTemplates';
import { useLanguage } from '../../hooks/useLanguage';

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
}: CalibrationLayoutSelectStepProps) => {
  const { t } = useLanguage();

  return (
  <div>
    <div className="calibration-step-label is-cyan">
      {t('calibration.step1Label')}
    </div>
    <h2 className="calibration-step-title">
      {t('calibration.step1Title')}
    </h2>
    <p className="calibration-copy is-muted">
      {t('calibration.step1Copy')}
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
        {t('calibration.customPreset')}
      </button>
    </div>

    {presetId === 'custom' && (
      <div className="calibration-upload-box">
        <div className="calibration-upload-label">{t('calibration.uploadLabel')}</div>
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
            {t('calibration.splitCheckbox')}
          </label>
        )}
      </div>
    )}

    <button
      onClick={onStartCalibration}
      className="calibration-btn is-cyan"
    >
      {t('calibration.startBtn')}
    </button>
  </div>
  );
};
