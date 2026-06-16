import React, { useMemo } from 'react';
import type { KeystrokeLog } from '../../utils/TypingEngine';

interface ScoreSummaryProps {
  keystrokes: KeystrokeLog[];
}

export const ScoreSummary: React.FC<ScoreSummaryProps> = ({ keystrokes }) => {
  const stats = useMemo(() => {
    if (keystrokes.length === 0) return { accuracy: 0, total: 0, avgDistance: 0 };

    let correctCount = 0;
    let analyzedCount = 0;
    let totalDist = 0;
    let distCount = 0;

    keystrokes.forEach(ks => {
      if (ks.isCorrectFinger !== undefined) {
        analyzedCount++;
        if (ks.isCorrectFinger) correctCount++;
      }
      if (ks.distanceU !== undefined && isFinite(ks.distanceU)) {
        totalDist += ks.distanceU;
        distCount++;
      }
    });

    return {
      accuracy: analyzedCount > 0 ? (correctCount / analyzedCount) * 100 : 0,
      total: keystrokes.length,
      avgDistance: distCount > 0 ? (totalDist / distCount) : 0
    };
  }, [keystrokes]);

  return (
    <div className="dashboard-card score-summary">
      <h3>Basic Scores</h3>
      <div className="score-grid">
        <div className="score-item">
          <div className="score-value">{stats.accuracy.toFixed(1)}%</div>
          <div className="score-label">Touch Typing Accuracy</div>
        </div>
        <div className="score-item">
          <div className="score-value">{stats.total}</div>
          <div className="score-label">Total Keystrokes</div>
        </div>
        <div className="score-item">
          <div className="score-value">{stats.avgDistance.toFixed(2)} U</div>
          <div className="score-label">Avg Finger Offset</div>
        </div>
      </div>
    </div>
  );
};
