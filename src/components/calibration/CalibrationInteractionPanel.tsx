import type { LayoutPresetId } from '../../assets/layoutTemplates';
import type { CalibrationPhase } from '../../types/calibrationFlow';
import type { ResolvedAnchor } from '../../utils/calibrationAnchors';
import { useLanguage } from '../../hooks/useLanguage';
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
}: CalibrationInteractionPanelProps) => {
  const { t } = useLanguage();

  return (
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
          {t('calibration.step2Label')}
        </div>
        <h2 className="calibration-step-title">
          {t('calibration.step2Title')}
        </h2>
        <p className="calibration-copy">
          {t('calibration.step2CopyPre')}<b>F D S A</b>{t('calibration.step2CopyMid')}<b>J K L ;</b>{t('calibration.step2CopySuf')}
        </p>
        <button
          onClick={onCaptureHome}
          className="calibration-btn is-magenta"
        >
          {t('calibration.captureHomeBtn')}
        </button>
        <p className="calibration-helper">
          {t('calibration.homeHelper')}
        </p>
      </div>
    )}

    {phase === 'corners' && (
      <div>
        <div className="calibration-step-label is-magenta">
          {t('calibration.step3LabelCounted', { step: cornerStep + 1, total: cornerAnchorsLength })}
        </div>
        <h2 className="calibration-step-title">
          {currentCorner
            ? t('calibration.cornerTitle', {
                hand: currentCorner.hand === 'Left' ? t('calibration.handLeft') : t('calibration.handRight'),
                display: currentCorner.display,
              })
            : ''}
        </h2>
        <p className="calibration-copy">
          {cornerInstruction}
        </p>
        <button
          onClick={onCaptureCorner}
          className="calibration-btn is-magenta"
        >
          {currentCorner
            ? t('calibration.captureCornerBtnFor', { display: currentCorner.display })
            : t('calibration.captureCornerBtnGeneric')}
        </button>
      </div>
    )}

    {phase === 'complete' && (
      <div>
        <div className="calibration-step-label is-success">
          {t('calibration.completeLabel')}
        </div>
        <h2 className="calibration-step-title is-success">
          {t('calibration.completeTitle')}
        </h2>
        <p className="calibration-copy is-muted">
          {t('calibration.completeCopy')}
        </p>

        <div className="calibration-action-stack">
          <button
            onClick={onComplete}
            className="calibration-btn is-success"
          >
            {t('calibration.completeStartBtn')}
          </button>
          <button
            onClick={onReset}
            className="calibration-btn is-secondary"
          >
            {t('calibration.resetBtn')}
          </button>
        </div>
      </div>
    )}
  </div>
  );
};
