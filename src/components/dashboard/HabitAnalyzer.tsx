import React, { useMemo } from 'react';
import type { KeystrokeLog } from '../../utils/TypingEngine';

interface HabitAnalyzerProps {
  keystrokes: KeystrokeLog[];
}

export const HabitAnalyzer: React.FC<HabitAnalyzerProps> = ({ keystrokes }) => {
  const habits = useMemo(() => {
    const labels: { name: string, description: string, count: number }[] = [];

    // Analyze specific bad habits
    let leftPinkyAvoidance = 0;
    let rightPinkyAvoidance = 0;
    let indexOverreach = 0;
    let thumbErrors = 0;

    keystrokes.forEach(ks => {
      if (ks.isCorrectFinger) return;

      const expected = Array.isArray(ks.expectedFinger) ? ks.expectedFinger[0] : ks.expectedFinger;
      const predicted = ks.predictedFinger;

      if (!expected || !predicted) return;

      // 1. Pinky Avoidance
      if (expected === 'LeftPinky' && predicted !== 'LeftPinky') {
        leftPinkyAvoidance++;
      }
      if (expected === 'RightPinky' && predicted !== 'RightPinky') {
        rightPinkyAvoidance++;
      }

      // 2. Index Overreach (Index finger pressing keys meant for middle/ring)
      if (predicted.includes('Index') && !expected.includes('Index')) {
        indexOverreach++;
      }

      // 3. Thumb misuse
      if (expected.includes('Thumb') && !predicted.includes('Thumb')) {
        thumbErrors++;
      }
    });

    if (leftPinkyAvoidance > 3) labels.push({ name: 'Left Pinky Avoidance', description: 'Often using ring/middle instead of left pinky.', count: leftPinkyAvoidance });
    if (rightPinkyAvoidance > 3) labels.push({ name: 'Right Pinky Avoidance', description: 'Often using ring/middle instead of right pinky.', count: rightPinkyAvoidance });
    if (indexOverreach > 5) labels.push({ name: 'Index Overreach', description: 'Relying too much on index fingers for other keys.', count: indexOverreach });
    if (thumbErrors > 2) labels.push({ name: 'Thumb Misuse', description: 'Pressing Space or Alt/Cmd with fingers other than thumb.', count: thumbErrors });

    return labels.sort((a, b) => b.count - a.count);
  }, [keystrokes]);

  return (
    <div className="dashboard-card habit-analyzer">
      <h3>Identified Habits (癖のラベリング)</h3>
      {habits.length === 0 ? (
        <p className="no-habits">Excellent! No specific bad habits detected.</p>
      ) : (
        <ul className="habit-list">
          {habits.map((h, i) => (
            <li key={i} className="habit-item">
              <span className="habit-badge">{h.name}</span>
              <span className="habit-desc">{h.description}</span>
              <span className="habit-count">({h.count} times)</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
