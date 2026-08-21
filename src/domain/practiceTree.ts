import type { PracticeEntry } from '../types/practice';

/** Separator for building a stable id out of a node's segment chain. */
const KEY_SEPARATOR = '\u241F';

/** Mistypes charged to one leaf before it counts as fully withered. */
const DEFAULT_ERROR_TOLERANCE = 4;

/** Stable id for a node addressed by its root-first segment chain. */
export function segmentKey(segments: readonly string[]): string {
  return segments.join(KEY_SEPARATOR);
}

/**
 * Static shape of a dictionary: labels, nesting and subtree mass. Depends only
 * on the word list, so it can be built once per practice category.
 */
export interface TreeNodeSpec {
  key: string;
  label: string;
  /** Root is 0. */
  depth: number;
  /** Total mass of the leaves below (leaf count for dictionaries). */
  weight: number;
  children: TreeNodeSpec[];
}

export interface LeafProgress {
  /** Times this word was typed to completion. */
  reps: number;
  /** Mistyped keystrokes charged to this word. */
  errors: number;
}

export type TreeProgress = ReadonlyMap<string, LeafProgress>;

/** A spec with the session's progress folded in — what the canvas draws. */
export interface TreeNodeView {
  key: string;
  label: string;
  depth: number;
  weight: number;
  /** 0..1 share of the mass below this node that has grown. */
  progress: number;
  /** 0..1 how badly the subtree below was mistyped. */
  damage: number;
  /** Completions below this node. */
  reps: number;
  /** True when the word being typed right now lives below this node. */
  active: boolean;
  children: TreeNodeView[];
}

export interface TreeViewOptions {
  /** Leaf key of the word being typed right now. */
  activeKey?: string | null;
  /** 0..1 through that word, so its twig creeps out mid-word. */
  activeRatio?: number;
  /** Mistypes needed to fully wither a leaf. */
  errorTolerance?: number;
}

/**
 * Folds a practice list into its classification tree. Entries that share a
 * segment chain (the plant list drills species, genus+species and
 * family+genus+species separately) collapse onto the same leaf.
 */
export function buildTreeSpec(
  entries: readonly PracticeEntry[],
  rootLabel: string
): TreeNodeSpec {
  const root: TreeNodeSpec = { key: '', label: rootLabel, depth: 0, weight: 0, children: [] };
  const index = new Map<string, TreeNodeSpec>();
  const trail: string[] = [];

  entries.forEach(entry => {
    let node = root;
    trail.length = 0;

    entry.segments.forEach(segment => {
      trail.push(segment);
      const key = segmentKey(trail);
      let child = index.get(key);
      if (!child) {
        child = { key, label: segment, depth: trail.length, weight: 0, children: [] };
        index.set(key, child);
        node.children.push(child);
      }
      node = child;
    });
  });

  accumulateWeight(root);
  return root;
}

function accumulateWeight(node: TreeNodeSpec): number {
  if (node.children.length === 0) {
    node.weight = 1;
    return 1;
  }
  node.weight = node.children.reduce((sum, child) => sum + accumulateWeight(child), 0);
  return node.weight;
}

/** Applies a session's progress to a spec, producing the drawable tree. */
export function buildTreeView(
  spec: TreeNodeSpec,
  progress: TreeProgress,
  options: TreeViewOptions = {}
): TreeNodeView {
  const {
    activeKey = null,
    activeRatio = 0,
    errorTolerance = DEFAULT_ERROR_TOLERANCE,
  } = options;

  const visit = (node: TreeNodeSpec): TreeNodeView => {
    if (node.children.length === 0) {
      const leaf = progress.get(node.key);
      const reps = leaf?.reps ?? 0;
      const errors = leaf?.errors ?? 0;
      const active = activeKey !== null && activeKey === node.key;

      return {
        key: node.key,
        label: node.label,
        depth: node.depth,
        weight: node.weight,
        // An unfinished active word still pushes its twig out, so the branch
        // being worked on is visible before the word is cleared.
        progress: reps > 0 ? 1 : active ? clamp01(activeRatio) : 0,
        damage: errorTolerance > 0 ? clamp01(errors / errorTolerance) : 0,
        reps,
        active,
        children: [],
      };
    }

    const children = node.children.map(visit);
    const mass = children.reduce((sum, child) => sum + child.weight, 0) || 1;

    return {
      key: node.key,
      label: node.label,
      depth: node.depth,
      weight: node.weight,
      progress: children.reduce((sum, c) => sum + c.progress * c.weight, 0) / mass,
      damage: children.reduce((sum, c) => sum + c.damage * c.weight, 0) / mass,
      reps: children.reduce((sum, c) => sum + c.reps, 0),
      active: children.some(c => c.active),
      children,
    };
  };

  return visit(spec);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
