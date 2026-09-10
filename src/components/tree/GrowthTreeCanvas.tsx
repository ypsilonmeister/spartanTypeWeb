import React, { useEffect, useMemo, useRef } from 'react';
import type { TreeNodeView } from '../../domain/practiceTree';

interface GrowthTreeCanvasProps {
  /** The classification being grown. Null renders an empty plot. */
  tree: TreeNodeView | null;
  /** Consecutive correct keystrokes; brightens the leaves. */
  combo?: number;
  width?: number;
  height?: number;
  caption?: string;
}

interface Point {
  x: number;
  y: number;
}

interface LaidOutBranch {
  view: TreeNodeView;
  /** Shared with the parent's end point, so the fit pass dedupes by identity. */
  start: Point;
  end: Point;
  /** Deterministic offset so branches don't sway in lockstep. */
  phase: number;
  children: LaidOutBranch[];
}

interface TreeLayout {
  root: LaidOutBranch;
  maxDepth: number;
  /** Deepest level that always gets a label; below it, only the active chain. */
  labelDepth: number;
}

/** Half-angle of the fan the trunk hands to its children. */
const ROOT_SPREAD = 1.12;
const LENGTH_DECAY = 0.66;
const MIN_SPREAD = 0.34;
const SPREAD_DECAY = 0.78;
const PADDING = { top: 34, right: 14, bottom: 12, left: 14 };

export const GrowthTreeCanvas: React.FC<GrowthTreeCanvasProps> = ({
  tree,
  combo = 0,
  width = 320,
  height = 360,
  caption = 'Growth Tree'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The layout only depends on the tree's shape, but rebuilding it per
  // keystroke is cheap and keeps the freshest progress attached to each node.
  const layout = useMemo(
    () => (tree ? buildLayout(tree, width, height) : null),
    [tree, width, height]
  );

  // Handed to the animation loop through refs: React state must never drive a
  // per-frame redraw.
  const layoutRef = useRef<TreeLayout | null>(layout);
  const comboRef = useRef(combo);

  useEffect(() => {
    layoutRef.current = layout;
    comboRef.current = combo;
  }, [layout, combo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const time = performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);

      const current = layoutRef.current;
      if (current) {
        drawTree(ctx, current, time, comboRef.current, canvas.width, canvas.height);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [width, height]);

  return (
    <div className="growth-tree-panel">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="growth-tree-canvas"
      />
      <div className="growth-tree-caption">
        {caption}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function buildLayout(tree: TreeNodeView, width: number, height: number): TreeLayout {
  const root = layoutBranch(tree, { x: 0, y: 0 }, -Math.PI / 2, ROOT_SPREAD, 1, 0);
  fitToCanvas(root, width, height);

  const topLevel = tree.children.length;
  return {
    root,
    maxDepth: measureDepth(root),
    labelDepth: topLevel <= 3 ? 2 : topLevel <= 12 ? 1 : 0,
  };
}

function layoutBranch(
  view: TreeNodeView,
  start: Point,
  angle: number,
  half: number,
  length: number,
  phase: number
): LaidOutBranch {
  const end = {
    x: start.x + Math.cos(angle) * length,
    y: start.y + Math.sin(angle) * length,
  };
  const branch: LaidOutBranch = { view, start, end, phase, children: [] };

  const mass = view.children.reduce((sum, child) => sum + child.weight, 0) || 1;
  // Wide fans at the trunk, tighter ones out in the twigs.
  const childSpreadFloor = MIN_SPREAD * Math.pow(SPREAD_DECAY, view.depth);
  let cursor = angle - half;

  view.children.forEach((child, index) => {
    // Each child owns a slice of the fan proportional to its subtree mass, so
    // a family with many species claims a wider wedge than a lone one.
    const slice = half * 2 * (child.weight / mass);
    const childAngle = cursor + slice / 2;
    cursor += slice;

    branch.children.push(
      layoutBranch(
        child,
        end,
        childAngle,
        Math.max(slice * 0.45, childSpreadFloor),
        length * LENGTH_DECAY,
        (phase * 1.7 + index + 1) % (Math.PI * 2)
      )
    );
  });

  return branch;
}

/** Scales the unit-space layout so any dictionary fills the canvas exactly once. */
function fitToCanvas(root: LaidOutBranch, width: number, height: number): void {
  const points = new Set<Point>();
  collectPoints(root, points);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  points.forEach(p => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });

  const boxWidth = Math.max(width - PADDING.left - PADDING.right, 1);
  const boxHeight = Math.max(height - PADDING.top - PADDING.bottom, 1);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min(boxWidth / spanX, boxHeight / spanY);

  const offsetX = PADDING.left + (boxWidth - spanX * scale) / 2 - minX * scale;
  const offsetY = PADDING.top + (boxHeight - spanY * scale) / 2 - minY * scale;

  points.forEach(p => {
    p.x = p.x * scale + offsetX;
    p.y = p.y * scale + offsetY;
  });
}

function collectPoints(branch: LaidOutBranch, out: Set<Point>): void {
  out.add(branch.start);
  out.add(branch.end);
  branch.children.forEach(child => collectPoints(child, out));
}

function measureDepth(branch: LaidOutBranch): number {
  return branch.children.reduce(
    (deepest, child) => Math.max(deepest, measureDepth(child)),
    branch.view.depth
  );
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

interface LeafDraw {
  x: number;
  y: number;
  view: TreeNodeView;
}

interface LabelDraw {
  x: number;
  y: number;
  dx: number;
  dy: number;
  text: string;
  active: boolean;
  progress: number;
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  layout: TreeLayout,
  time: number,
  combo: number,
  width: number,
  height: number
): void {
  const { root, maxDepth, labelDepth } = layout;
  const sizeScale = Math.min(width, height) / 320;
  const rootWeight = Math.max(1, root.view.weight);
  const maxThickness = 7 * sizeScale;
  const swayAmplitude = 3.5 * sizeScale;

  const leaves: LeafDraw[] = [];
  const labels: LabelDraw[] = [];

  const drawBranch = (branch: LaidOutBranch, parentSway: number): void => {
    const { view } = branch;
    const depthRatio = maxDepth > 0 ? view.depth / maxDepth : 0;
    // Twigs sway more than the trunk; squaring the ratio keeps the base still.
    const sway =
      Math.sin(time * 0.0015 + branch.phase) * swayAmplitude * depthRatio * depthRatio;

    const startX = branch.start.x + parentSway;
    const startY = branch.start.y;
    const endX = branch.end.x + sway;
    const endY = branch.end.y;

    const thickness = Math.max(0.8, maxThickness * Math.sqrt(view.weight / rootWeight));

    // The whole dictionary stays visible as a ghost, so you can see what is
    // left to grow instead of guessing.
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.lineWidth = thickness;
    ctx.strokeStyle = 'rgba(130, 170, 190, 0.09)';
    ctx.stroke();

    const grown = easeGrowth(view.progress);
    if (grown > 0.02) {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX + (endX - startX) * grown, startY + (endY - startY) * grown);
      ctx.lineWidth = thickness;
      ctx.strokeStyle = branchColor(depthRatio, view.damage, view.active);
      ctx.stroke();
    }

    branch.children.forEach(child => drawBranch(child, sway));

    // Untouched leaves mark where the twig will reach; growing ones ride the tip.
    const reach = view.progress <= 0 ? 1 : grown;
    const tipX = startX + (endX - startX) * reach;
    const tipY = startY + (endY - startY) * reach;

    if (view.children.length === 0) {
      leaves.push({ x: tipX, y: tipY, view });
    }

    if (shouldLabel(view, labelDepth)) {
      const length = Math.hypot(endX - startX, endY - startY) || 1;
      labels.push({
        x: tipX,
        y: tipY,
        dx: (endX - startX) / length,
        dy: (endY - startY) / length,
        text: view.label,
        active: view.active,
        progress: view.progress,
      });
    }
  };

  drawBranch(root, 0);
  drawLeaves(ctx, leaves, time, combo, sizeScale);
  drawLabels(ctx, labels, sizeScale);
  drawHud(ctx, root.view, combo);
}

function shouldLabel(view: TreeNodeView, labelDepth: number): boolean {
  if (view.depth === 0) return false;
  if (view.depth <= labelDepth) return true;
  if (!view.active) return false;

  // The chain being typed right now always names itself.
  return view.children.length === 0 || view.depth <= 2;
}

function drawLeaves(
  ctx: CanvasRenderingContext2D,
  leaves: LeafDraw[],
  time: number,
  combo: number,
  sizeScale: number
): void {
  leaves.forEach(({ x, y, view }) => {
    if (view.progress <= 0) {
      ctx.beginPath();
      ctx.arc(x, y, 1.4 * sizeScale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(140, 175, 195, 0.18)';
      ctx.fill();
      return;
    }

    const pulse = 1 + Math.sin(time * 0.004 + x) * 0.12;
    const vigor = Math.min(3, view.reps);
    const radius = (2.2 + vigor * 0.8) * sizeScale * pulse * view.progress;
    const color = leafColor(view.damage, 0.55 + view.progress * 0.4);

    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, radius), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = combo > 5 ? 15 : 5;
    ctx.fill();
    ctx.shadowBlur = 0;

    if (view.active) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(3, radius + 3 * sizeScale), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(210, 255, 250, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  });
}

function drawLabels(
  ctx: CanvasRenderingContext2D,
  labels: LabelDraw[],
  sizeScale: number
): void {
  const fontSize = Math.max(8, Math.round(9.5 * sizeScale));

  labels.forEach(label => {
    const alpha = label.active ? 0.95 : 0.3 + label.progress * 0.45;
    const gap = 6 * sizeScale;

    ctx.font = `${label.active ? 'bold ' : ''}${fontSize}px sans-serif`;
    ctx.fillStyle = label.active
      ? `rgba(140, 255, 235, ${alpha})`
      : `rgba(200, 215, 225, ${alpha})`;
    ctx.textAlign = label.dx >= 0 ? 'left' : 'right';
    ctx.textBaseline = label.dy >= 0 ? 'top' : 'bottom';
    ctx.fillText(label.text, label.x + label.dx * gap, label.y + label.dy * gap);
  });
}

function drawHud(ctx: CanvasRenderingContext2D, root: TreeNodeView, combo: number): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // The dictionary already names itself in the controls and the caption, so
  // the overlay stays short enough not to run off a narrow canvas.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '10px sans-serif';
  ctx.fillText(`Growth: ${Math.round(root.progress * 100)}%`, 15, 25);

  if (combo > 0) {
    ctx.fillStyle = `rgba(0, 255, 204, ${Math.min(1, combo / 10)})`;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`Combo x${combo}`, 15, 42);
  }
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

const HURT: Rgb = [150, 85, 45];
const HEALTHY_LEAF: Rgb = [0, 255, 204];
const WILTED_LEAF: Rgb = [235, 150, 45];
const DEAD_LEAF: Rgb = [170, 75, 40];
const HIGHLIGHT: Rgb = [190, 255, 245];

/**
 * A single cleared word is a tiny fraction of a big dictionary, so raw
 * progress would leave the trunk looking dead. The square root makes the
 * first successes visible while keeping the ordering intact.
 */
function easeGrowth(progress: number): number {
  return Math.sqrt(Math.max(0, Math.min(1, progress)));
}

function branchColor(depthRatio: number, damage: number, active: boolean): string {
  const base: Rgb = [
    20 + depthRatio * 30,
    100 + depthRatio * 155,
    120 + depthRatio * 135,
  ];

  let color = mix(base, HURT, damage * 0.85);
  if (active) color = mix(color, HIGHLIGHT, 0.55);

  return `rgb(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])})`;
}

function leafColor(damage: number, alpha: number): string {
  const color =
    damage < 0.5
      ? mix(HEALTHY_LEAF, WILTED_LEAF, damage * 2)
      : mix(WILTED_LEAF, DEAD_LEAF, (damage - 0.5) * 2);

  return `rgba(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])}, ${alpha})`;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const ratio = Math.max(0, Math.min(1, t));
  return [
    a[0] + (b[0] - a[0]) * ratio,
    a[1] + (b[1] - a[1]) * ratio,
    a[2] + (b[2] - a[2]) * ratio,
  ];
}
