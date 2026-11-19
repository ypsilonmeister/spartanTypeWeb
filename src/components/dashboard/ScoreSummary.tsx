import type { KeystrokeStats } from '../../domain/keystrokeStats';
import { useLanguage } from '../../hooks/useLanguage';

interface ScoreSummaryProps {
  stats: KeystrokeStats;
}

export const ScoreSummary = ({ stats }: ScoreSummaryProps) => {
  const { t } = useLanguage();

  return (
    <div className="dashboard-card score-summary">
      <h3>Basic Scores</h3>
      <div className="score-grid">
        <div className="score-item">
          <div className="score-value">{stats.accuracy === null ? t('analysis.unknown') : `${stats.accuracy.toFixed(1)}%`}</div>
          <div className="score-label">Touch Typing Accuracy</div>
        </div>
        <div className="score-item">
          <div className="score-value">{stats.judged}/{stats.total}</div>
          <div className="score-label">{t('dashboard.judgedKeystrokes')}</div>
        </div>
        <div className="score-item">
          <div className="score-value">{stats.avgDistance === null ? '—' : `${stats.avgDistance.toFixed(2)} U`}</div>
          <div className="score-label">Avg Finger Offset</div>
        </div>
      </div>
    </div>
  );
};
