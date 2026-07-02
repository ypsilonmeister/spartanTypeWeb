import type { PracticeEntry } from '../../types/practice';
import { RealtimeFeedback, type RealtimeFeedbackData } from './RealtimeFeedback';

interface PracticeWordDisplayProps {
  entry: PracticeEntry | undefined;
  currentCharIndex: number;
  flashError: boolean;
  realtimeFeedback: RealtimeFeedbackData | null;
}

export const PracticeWordDisplay = ({
  entry,
  currentCharIndex,
  flashError,
  realtimeFeedback,
}: PracticeWordDisplayProps) => (
  <div className={`trainer-word-display${flashError ? ' is-error' : ''}`}>
    <div className="trainer-word-path">
      {entry?.path}
    </div>

    <div className="trainer-word-japanese">
      {entry?.node.japanese}
    </div>

    <div className="trainer-word-romaji">
      <span className="trainer-romaji-typed">
        {entry?.node.romaji.slice(0, currentCharIndex)}
      </span>
      <span className="trainer-romaji-current">
        {entry?.node.romaji[currentCharIndex]}
      </span>
      <span className="trainer-romaji-remaining">
        {entry?.node.romaji.slice(currentCharIndex + 1)}
      </span>
    </div>

    {realtimeFeedback && (
      <RealtimeFeedback feedback={realtimeFeedback} />
    )}
  </div>
);
