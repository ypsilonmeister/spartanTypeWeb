import type { KeystrokeVerdict } from '../../domain/keystrokeStats';
import { useLanguage } from '../../hooks/useLanguage';

export type RealtimeFeedbackData = { key: string } & (
  | { verdict: 'unknown' }
  | { verdict: Exclude<KeystrokeVerdict, 'unknown'>; expected: string; got: string }
);

interface RealtimeFeedbackProps {
  feedback: RealtimeFeedbackData;
}

export const RealtimeFeedback = ({ feedback }: RealtimeFeedbackProps) => {
  const { t } = useLanguage();

  if (feedback.verdict === 'unknown') {
    return <div className="trainer-realtime-feedback is-unknown">{t('analysis.unknown')}</div>;
  }

  return (
    <div className={`trainer-realtime-feedback${feedback.verdict === 'correct' ? ' is-correct' : ' is-incorrect'}`}>
      {feedback.verdict === 'correct' ? (
        <span>✓ 正しい指使いです！ ({feedback.got})</span>
      ) : (
        <span>
          ✗ 違います！ (想定: {feedback.expected} → 検出: {feedback.got})
        </span>
      )}
    </div>
  );
};
