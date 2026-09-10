import type { KeystrokeLog } from '../types/session';
import type { TreeNodeView } from './practiceTree';

/**
 * Recorded sessions carry no dictionary, so the dashboard grows its tree from
 * the only structure the log has: hand ➔ finger ➔ key. Branch thickness is how
 * often you used that finger, growth is how often you used the right one.
 */
const HANDS = ['Left', 'Right'] as const;
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const;

interface Tally {
  presses: number;
  /** Keystrokes the offline analyzer actually scored. */
  judged: number;
  correct: number;
}

export function buildKeystrokeTreeView(
  keystrokes: readonly KeystrokeLog[],
  rootLabel = 'Session'
): TreeNodeView | null {
  // hand -> finger -> key label
  const byHand = new Map<string, Map<string, Map<string, Tally>>>();

  keystrokes.forEach(ks => {
    const finger = resolveFinger(ks);
    const { hand, digit } = splitFinger(finger);
    const keyLabel = ks.key || ks.code || '?';

    const fingers = getOrCreate(byHand, hand, () => new Map());
    const keys = getOrCreate(fingers, digit, () => new Map());
    const tally = getOrCreate(keys, keyLabel, () => ({ presses: 0, judged: 0, correct: 0 }));

    tally.presses += 1;
    if (ks.isCorrectFinger !== undefined) {
      tally.judged += 1;
      if (ks.isCorrectFinger) tally.correct += 1;
    }
  });

  if (byHand.size === 0) return null;

  const handNodes = sortKeys(byHand.keys(), HANDS).map(hand => {
    const fingers = byHand.get(hand)!;
    const fingerNodes = sortKeys(fingers.keys(), FINGERS).map(digit => {
      const keys = fingers.get(digit)!;
      const keyNodes = [...keys.entries()]
        .sort((a, b) => b[1].presses - a[1].presses)
        .map(([label, tally]) => leafNode(label, tally, 3));

      return branchNode(digit, 2, keyNodes);
    });

    return branchNode(hand, 1, fingerNodes);
  });

  return branchNode(rootLabel, 0, handNodes);
}

function leafNode(label: string, tally: Tally, depth: number): TreeNodeView {
  const accuracy = tally.judged > 0 ? tally.correct / tally.judged : 1;

  return {
    key: `${depth}:${label}`,
    label,
    depth,
    // Weighting by press count makes heavily used keys the thick branches.
    weight: Math.max(1, tally.presses),
    progress: accuracy,
    damage: 1 - accuracy,
    reps: tally.presses,
    active: false,
    children: [],
  };
}

function branchNode(label: string, depth: number, children: TreeNodeView[]): TreeNodeView {
  const weight = children.reduce((sum, c) => sum + c.weight, 0);
  const mass = weight || 1;

  return {
    key: `${depth}:${label}`,
    label,
    depth,
    weight: Math.max(1, weight),
    progress: children.reduce((sum, c) => sum + c.progress * c.weight, 0) / mass,
    damage: children.reduce((sum, c) => sum + c.damage * c.weight, 0) / mass,
    reps: children.reduce((sum, c) => sum + c.reps, 0),
    active: false,
    children,
  };
}

function resolveFinger(ks: KeystrokeLog): string {
  const expected = Array.isArray(ks.expectedFinger) ? ks.expectedFinger[0] : ks.expectedFinger;
  return expected || ks.predictedFinger || 'Unknown';
}

function splitFinger(finger: string): { hand: string; digit: string } {
  const hand = HANDS.find(h => finger.startsWith(h));
  if (!hand) return { hand: 'Unknown', digit: finger };

  const digit = FINGERS.find(f => finger.endsWith(f));
  return { hand, digit: digit ?? 'Other' };
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing !== undefined) return existing;

  const created = create();
  map.set(key, created);
  return created;
}

/** Keeps anatomical order (thumb ➔ pinky) and parks unknowns at the end. */
function sortKeys(keys: Iterable<string>, order: readonly string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  });
}
