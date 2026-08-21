import { describe, expect, it } from 'vitest';
import { buildTreeSpec, buildTreeView, segmentKey } from '../practiceTree';
import { getPracticeList } from '../practiceList';
import type { LeafProgress } from '../practiceTree';
import type { PracticeEntry } from '../../types/practice';

function entry(segments: string[], romaji = 'ABC'): PracticeEntry {
  return {
    node: { level: 'species', japanese: segments[segments.length - 1], romaji },
    path: segments.join(' ➔ '),
    segments,
  };
}

describe('buildTreeSpec', () => {
  it('nests entries by their segment chain', () => {
    const spec = buildTreeSpec(
      [entry(['バラ科', 'サクラ属', 'ソメイヨシノ']), entry(['バラ科', 'バラ属', 'ノイバラ'])],
      'plants'
    );

    expect(spec.children).toHaveLength(1);
    expect(spec.children[0].label).toBe('バラ科');
    expect(spec.children[0].children.map(c => c.label)).toEqual(['サクラ属', 'バラ属']);
  });

  it('collapses entries that drill the same word at different depths', () => {
    const segments = ['バラ科', 'サクラ属', 'ソメイヨシノ'];
    const spec = buildTreeSpec(
      [entry(segments, 'SOMEIYOSINO'), entry(segments, 'SAKURAZOKUSOMEIYOSINO')],
      'plants'
    );

    expect(spec.weight).toBe(1);
    expect(spec.children[0].children[0].children).toHaveLength(1);
  });

  it('weighs a node by the leaves below it', () => {
    const spec = buildTreeSpec(
      [
        entry(['制御', 'IF']),
        entry(['制御', 'FOR']),
        entry(['値', 'TRUE']),
      ],
      'programmer'
    );

    expect(spec.weight).toBe(3);
    expect(spec.children.map(c => c.weight)).toEqual([2, 1]);
  });
});

describe('buildTreeView', () => {
  const spec = buildTreeSpec(
    [entry(['制御', 'IF']), entry(['制御', 'FOR']), entry(['値', 'TRUE'])],
    'programmer'
  );

  const progress = (pairs: [string[], LeafProgress][]) =>
    new Map(pairs.map(([segments, leaf]) => [segmentKey(segments), leaf]));

  it('grows a branch by the share of leaves cleared below it', () => {
    const view = buildTreeView(spec, progress([[['制御', 'IF'], { reps: 1, errors: 0 }]]));

    const control = view.children.find(c => c.label === '制御')!;
    expect(control.progress).toBeCloseTo(0.5);
    // One of three leaves overall, so the trunk only creeps up a third.
    expect(view.progress).toBeCloseTo(1 / 3);
  });

  it('creeps the active twig out mid-word without clearing it', () => {
    const view = buildTreeView(spec, new Map(), {
      activeKey: segmentKey(['値', 'TRUE']),
      activeRatio: 0.5,
    });

    const values = view.children.find(c => c.label === '値')!;
    expect(values.children[0].progress).toBeCloseTo(0.5);
    expect(values.children[0].reps).toBe(0);
    expect(values.active).toBe(true);
    expect(view.children.find(c => c.label === '制御')!.active).toBe(false);
  });

  it('withers a leaf in proportion to the mistypes charged to it', () => {
    const view = buildTreeView(
      spec,
      progress([[['値', 'TRUE'], { reps: 1, errors: 2 }]]),
      { errorTolerance: 4 }
    );

    expect(view.children.find(c => c.label === '値')!.damage).toBeCloseTo(0.5);
    expect(view.children.find(c => c.label === '制御')!.damage).toBe(0);
  });

  it('reports a fully cleared dictionary as complete', () => {
    const view = buildTreeView(
      spec,
      progress([
        [['制御', 'IF'], { reps: 1, errors: 0 }],
        [['制御', 'FOR'], { reps: 2, errors: 0 }],
        [['値', 'TRUE'], { reps: 1, errors: 0 }],
      ])
    );

    expect(view.progress).toBe(1);
    expect(view.reps).toBe(4);
  });
});

describe('real dictionaries', () => {
  it.each([
    ['plant', 'ja'],
    ['programmer', 'ja'],
    ['beginner', 'ja'],
    ['programmer', 'en'],
    ['beginner', 'en'],
  ] as const)('gives %s/%s a branching tree, not a flat list', (category, lang) => {
    const spec = buildTreeSpec(getPracticeList(category, lang), category);

    expect(spec.children.length).toBeGreaterThan(1);
    expect(spec.weight).toBeGreaterThan(spec.children.length);
    expect(spec.children.every(c => c.children.length > 0)).toBe(true);
  });

  it('gives the plant dictionary a family ➔ genus ➔ species tree', () => {
    const spec = buildTreeSpec(getPracticeList('plant', 'ja'), 'plants');
    const family = spec.children[0];

    expect(family.label).toBe('キク科');
    expect(family.children[0].label).toBe('タンポポ属');
    expect(family.children[0].children[0].label).toBe('セイヨウタンポポ');
    expect(family.children[0].children[0].children).toHaveLength(0);
  });
});
