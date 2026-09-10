import { describe, expect, it } from 'vitest';
import {
  buildFrameTargets,
  createFrameTargetSelector,
  DEFAULT_FRAME_TARGET_OPTIONS,
} from '../frameTargetSelector';

/** frameIntervalMs 刻みで動画を「提示」し、selector が欲しがるフレームだけ捕まえる。 */
function simulate(
  keystrokes: number[],
  frameIntervalMs: number,
  durationMs: number,
  options = DEFAULT_FRAME_TARGET_OPTIONS
) {
  const selector = createFrameTargetSelector(keystrokes, options);
  const captured: number[] = [];
  for (let t = 0; t <= durationMs; t += frameIntervalMs) {
    if (selector.wants(t)) {
      selector.markCaptured(t);
      captured.push(t);
    }
  }
  return { captured, stats: selector.finish() };
}

describe('buildFrameTargets', () => {
  it('expands every keystroke by every offset and sorts the result', () => {
    expect(buildFrameTargets([500, 100], [0])).toEqual([
      { timeMs: 100, keystrokeIndex: 1 },
      { timeMs: 500, keystrokeIndex: 0 },
    ]);
    expect(buildFrameTargets([500, 100], [-100, 0]).map((t) => t.timeMs)).toEqual([0, 100, 400, 500]);
  });

  it('drops non-finite timestamps but keeps the original keystroke indices', () => {
    expect(buildFrameTargets([Number.NaN, 100, Infinity], [0])).toEqual([{ timeMs: 100, keystrokeIndex: 1 }]);
  });
});

describe('createFrameTargetSelector', () => {
  it('never wants a frame when there are no keystrokes', () => {
    const { captured, stats } = simulate([], 33, 1000);
    expect(captured).toEqual([]);
    expect(stats).toEqual({ total: 0, captured: 0, late: 0, abandoned: 0, unreached: 0 });
  });

  it('captures the first frame at or after each keystroke and nothing else', () => {
    // 30fps 提示、打鍵 200ms と 700ms
    const { captured, stats } = simulate([200, 700], 33, 1000);
    // 33 刻みで 200 以上の最初は 231、700 以上の最初は 726
    expect(captured).toEqual([231, 726]);
    expect(stats.captured).toBe(2);
    expect(stats.late).toBe(0);
    expect(stats.abandoned).toBe(0);
    expect(stats.unreached).toBe(0);
  });

  it('is idempotent when the same frame is queried again before it is captured (pause / resume)', () => {
    const selector = createFrameTargetSelector([200]);
    expect(selector.wants(190)).toBe(false);
    expect(selector.wants(210)).toBe(true);
    expect(selector.wants(210)).toBe(true);
    selector.markCaptured(210);
    expect(selector.wants(210)).toBe(false);
    expect(selector.wants(300)).toBe(false);
  });

  it('lets one frame serve several keystrokes that all fall before it', () => {
    // 提示間隔 200ms、打鍵 300 / 340 / 380 はすべて次の提示 (400) より前 → 1 フレームで 3 目標
    const { captured, stats } = simulate([300, 340, 380], 200, 1000);
    expect(captured).toEqual([400]);
    expect(stats.captured).toBe(3);
    expect(stats.late).toBe(0);
  });

  it('gives a later keystroke its own frame instead of reusing the one before it', () => {
    // 300 と 376 は 400 で消費されるが、452 は 400 より後なので 600 を待つ
    const { captured, stats } = simulate([300, 376, 452], 200, 1000);
    expect(captured).toEqual([400, 600]);
    expect(stats.captured).toBe(3);
  });

  it('flags a capture as late when the first available frame is more than lateThresholdMs after the keystroke', () => {
    // 打鍵 210、提示は 200 刻み → 400 で取る (190ms 遅れ > 150)
    const { captured, stats } = simulate([210], 200, 1000);
    expect(captured).toEqual([400]);
    expect(stats.late).toBe(1);
  });

  it('gives each keystroke its own frame when the frame rate is fine enough', () => {
    // タブレットの 3x 再生での提示間隔 ~62ms に対して打鍵 76ms 間隔
    const { captured, stats } = simulate([300, 376, 452], 62, 1000);
    expect(captured).toHaveLength(3);
    expect(stats.captured).toBe(3);
    expect(stats.late).toBe(0);
  });

  it('abandons a target the video has already passed by more than maxLagMs instead of inferring a useless frame', () => {
    // フレームが 0 から一気に 900 へ飛ぶ (seek 等)。目標 200 は 700ms 遅れ → 諦める
    const selector = createFrameTargetSelector([200, 950]);
    expect(selector.wants(0)).toBe(false);
    expect(selector.wants(900)).toBe(false);
    const stats = selector.finish();
    expect(stats.abandoned).toBe(1);
    expect(stats.unreached).toBe(1);
  });

  it('counts targets the video never reached', () => {
    const { captured, stats } = simulate([200, 5000], 33, 1000);
    expect(captured).toHaveLength(1);
    expect(stats.unreached).toBe(1);
  });

  it('supports multiple offsets per keystroke (F > 1)', () => {
    const options = { ...DEFAULT_FRAME_TARGET_OPTIONS, offsetsMs: [-120, -40, 0] };
    const { captured, stats } = simulate([500], 33, 1000, options);
    expect(stats.total).toBe(3);
    expect(stats.captured).toBe(3);
    // 380 以上の最初 = 396、460 以上 = 462、500 以上 = 528
    expect(captured).toEqual([396, 462, 528]);
  });

  it('tells which keystrokes a captured frame served', () => {
    const selector = createFrameTargetSelector([300, 340, 380, 900]);
    expect(selector.wants(400)).toBe(true);
    expect(selector.markCaptured(400)).toEqual([0, 1, 2]);
    expect(selector.wants(950)).toBe(true);
    expect(selector.markCaptured(950)).toEqual([3]);
  });

  it('reports a keystroke once per frame even when several of its offsets are satisfied', () => {
    const selector = createFrameTargetSelector([500], {
      ...DEFAULT_FRAME_TARGET_OPTIONS,
      offsetsMs: [-100, -50, 0],
    });
    expect(selector.markCaptured(520)).toEqual([0]);
    expect(selector.stats().captured).toBe(3);
  });

  it('reports the number of targets it was built with', () => {
    const selector = createFrameTargetSelector([1, 2, 3], {
      ...DEFAULT_FRAME_TARGET_OPTIONS,
      offsetsMs: [-50, 0],
    });
    expect(selector.targetCount()).toBe(6);
  });
});
