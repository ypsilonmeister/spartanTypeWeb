import type { KeystrokeLog } from '../types/session';

export type KeystrokeVerdict = 'correct' | 'wrong' | 'unknown';

export function getKeystrokeVerdict(isCorrectFinger: boolean | undefined): KeystrokeVerdict {
  if (isCorrectFinger === true) return 'correct';
  if (isCorrectFinger === false) return 'wrong';
  return 'unknown';
}

type KeyVerdictCounts = Record<KeystrokeVerdict, number>;

export interface KeystrokeStats {
  total: number;
  judged: number;
  accuracy: number | null;
  avgDistance: number | null;
  byCode: ReadonlyMap<string, KeyVerdictCounts>;
  wrongKeystrokes: readonly KeystrokeLog[];
}

export function summarizeKeystrokes(keystrokes: readonly KeystrokeLog[]): KeystrokeStats {
  const byCode = new Map<string, KeyVerdictCounts>();
  const wrongKeystrokes: KeystrokeLog[] = [];
  let correct = 0;
  let judged = 0;
  let totalDistance = 0;
  let distanceCount = 0;

  for (const keystroke of keystrokes) {
    const verdict = getKeystrokeVerdict(keystroke.isCorrectFinger);
    const keyCounts = byCode.get(keystroke.code) ?? { correct: 0, wrong: 0, unknown: 0 };
    keyCounts[verdict]++;
    byCode.set(keystroke.code, keyCounts);

    if (verdict === 'unknown') continue;

    judged++;
    if (verdict === 'correct') correct++;
    else wrongKeystrokes.push(keystroke);

    const { distanceU } = keystroke;
    if (typeof distanceU === 'number' && Number.isFinite(distanceU)) {
      totalDistance += distanceU;
      distanceCount++;
    }
  }

  return {
    total: keystrokes.length,
    judged,
    accuracy: judged > 0 ? 100 * correct / judged : null,
    avgDistance: distanceCount > 0 ? totalDistance / distanceCount : null,
    byCode,
    wrongKeystrokes,
  };
}
