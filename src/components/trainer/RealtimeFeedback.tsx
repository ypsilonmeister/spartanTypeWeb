interface RealtimeFeedbackData {
  key: string;
  isCorrect: boolean;
  expected: string;
  got: string;
}

interface RealtimeFeedbackProps {
  feedback: RealtimeFeedbackData;
}

export type { RealtimeFeedbackData };

export const RealtimeFeedback = ({ feedback }: RealtimeFeedbackProps) => (
  <div className={`trainer-realtime-feedback${feedback.isCorrect ? ' is-correct' : ' is-incorrect'}`}>
    {feedback.isCorrect ? (
      <span>✓ 正しい指使いです！ ({feedback.got})</span>
    ) : (
      <span>
        ✗ 違います！ (想定: {feedback.expected} → 検出: {feedback.got})
      </span>
    )}
  </div>
);
