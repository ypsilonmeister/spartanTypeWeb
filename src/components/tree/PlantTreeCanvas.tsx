import React, { useEffect, useRef, useState } from 'react';

interface PlantTreeCanvasProps {
  correctCount: number;
  incorrectCount: number;
  lastPressedKey?: string | null;
  width?: number;
  height?: number;
}

interface Branch {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  angle: number;
  length: number;
  thickness: number;
  depth: number;
  currentLength: number; // For growth animation
  children: Branch[];
  leafColor?: string;
  leafChar?: string;
}

export const PlantTreeCanvas: React.FC<PlantTreeCanvasProps> = ({
  correctCount,
  incorrectCount,
  lastPressedKey = null,
  width = 320,
  height = 360
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [combos, setCombos] = useState(0);
  const prevCorrectCount = useRef(correctCount);

  // Keep track of characters typed correctly to grow as "fruits"
  const typedCharsRef = useRef<string[]>([]);

  useEffect(() => {
    if (correctCount > prevCorrectCount.current) {
      // Correct type registered
      const diff = correctCount - prevCorrectCount.current;
      setCombos(prev => prev + diff);
      if (lastPressedKey && lastPressedKey.length === 1) {
        typedCharsRef.current.push(lastPressedKey);
        if (typedCharsRef.current.length > 30) {
          typedCharsRef.current.shift(); // Limit stored characters
        }
      }
    } else if (incorrectCount > 0) {
      // Reset combo on error
      setCombos(0);
    }
    prevCorrectCount.current = correctCount;
  }, [correctCount, incorrectCount, lastPressedKey]);

  // Determine tree stats based on typing progress
  const treeGrowth = Math.min(1, correctCount / 100); // Reaches max size at 100 correct strokes
  const errorFactor = Math.min(1, incorrectCount / 30); // Higher values make the leaves brown/withered
  const maxDepth = Math.min(6, 3 + Math.floor(correctCount / 15)); // Deeper tree as user types more

  // Main Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    // Helper to generate tree recursively
    const generateTree = (
      startX: number,
      startY: number,
      angle: number,
      length: number,
      thickness: number,
      depth: number,
      growth: number
    ): Branch => {
      // Dynamic scaling of branch lengths and angles
      // Wind sway effect using sine wave
      const sway = Math.sin(time * 0.002 + depth) * 0.05 * (depth / maxDepth);
      const currentAngle = angle + sway;

      // Actual drawing length scales with current growth factor
      const branchGrowth = Math.min(1, Math.max(0, growth * maxDepth - depth + 1));
      const currentLength = length * branchGrowth;

      const endX = startX + Math.cos(currentAngle) * currentLength;
      const endY = startY + Math.sin(currentAngle) * currentLength;

      const branch: Branch = {
        startX,
        startY,
        endX,
        endY,
        angle: currentAngle,
        length,
        thickness,
        depth,
        currentLength,
        children: []
      };

      if (depth < maxDepth && branchGrowth > 0.5) {
        // Left branch
        const leftAngle = currentAngle - 0.35 - (Math.sin(time * 0.001) * 0.02);
        const leftLength = length * 0.78;
        branch.children.push(
          generateTree(endX, endY, leftAngle, leftLength, thickness * 0.7, depth + 1, growth)
        );

        // Right branch
        const rightAngle = currentAngle + 0.35 + (Math.cos(time * 0.0011) * 0.02);
        const rightLength = length * 0.78;
        branch.children.push(
          generateTree(endX, endY, rightAngle, rightLength, thickness * 0.7, depth + 1, growth)
        );

        // Occasional third branch for organic look
        if (depth === 2 || (depth === 3 && correctCount > 50)) {
          const midAngle = currentAngle + (Math.sin(time * 0.0015) * 0.05);
          branch.children.push(
            generateTree(endX, endY, midAngle, length * 0.65, thickness * 0.6, depth + 1, growth)
          );
        }
      }

      return branch;
    };

    // Helper to draw the tree recursively
    const drawBranch = (branch: Branch) => {
      if (branch.currentLength <= 0) return;

      // Branch color: transitions from thick brown trunk to green/blue neon twigs
      ctx.beginPath();
      ctx.moveTo(branch.startX, branch.startY);
      ctx.lineTo(branch.endX, branch.endY);
      
      const ratio = branch.depth / maxDepth;
      ctx.lineWidth = Math.max(1, branch.thickness);
      
      // Cybernetic bioluminescent tree colors
      const r = Math.round(20 + ratio * 30);
      const g = Math.round(100 + ratio * 155);
      const b = Math.round(120 + ratio * 135);
      ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.stroke();

      // Draw children
      branch.children.forEach(drawBranch);

      // Draw leaves/fruits on terminal twigs (depth >= maxDepth - 1 or no children)
      if (branch.children.length === 0 || branch.depth >= maxDepth - 1) {
        const leafRadius = Math.max(2, 6 * (1 - ratio) * (1 - errorFactor * 0.5));
        
        // Bioluminescent pulsing leaf glow
        const pulse = 1 + Math.sin(time * 0.01 + branch.startX) * 0.15;
        
        ctx.beginPath();
        ctx.arc(branch.endX, branch.endY, leafRadius * pulse, 0, 2 * Math.PI);
        
        // Leaf color changes with errors (Green -> Orange -> Brown)
        const leafColor = errorFactor < 0.2
          ? `rgba(0, 255, 204, ${0.6 + ratio * 0.4})`
          : errorFactor < 0.6
            ? `rgba(235, 175, 40, ${0.6 + ratio * 0.4})`
            : `rgba(180, 70, 40, ${0.5 + ratio * 0.3})`;
        
        ctx.fillStyle = leafColor;
        ctx.shadowColor = leafColor;
        ctx.shadowBlur = combos > 5 ? 15 : 5; // Glows brighter on combos!
        ctx.fill();
        ctx.shadowBlur = 0; // reset shadow

        // Add typed character "fruit" overlay on leaf
        if (branch.depth === maxDepth && correctCount > 0) {
          const charIndex = Math.floor(Math.abs(Math.sin(branch.startX + branch.startY) * typedCharsRef.current.length)) % Math.max(1, typedCharsRef.current.length);
          const char = typedCharsRef.current[charIndex];
          if (char) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(char, branch.endX, branch.endY);
          }
        }
      }
    };

    const render = () => {
      time = performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);

      const trunkLength = Math.max(20, 80 * Math.min(1, treeGrowth + 0.2));
      const trunkThickness = Math.max(2, 8 * Math.min(1, treeGrowth + 0.3));
      
      const treeRoot = generateTree(
        canvas.width / 2,
        canvas.height - 20,
        -Math.PI / 2,
        trunkLength,
        trunkThickness,
        1,
        treeGrowth
      );

      ctx.save();
      drawBranch(treeRoot);
      ctx.restore();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Growth: ${Math.round(treeGrowth * 100)}%`, 15, 25);
      if (combos > 0) {
        ctx.fillStyle = `rgba(0, 255, 204, ${Math.min(1, combos / 10)})`;
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`Combo x${combos}`, 15, 42);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [correctCount, incorrectCount, treeGrowth, maxDepth, combos, errorFactor]);

  return (
    <div style={{
      background: 'rgba(20, 20, 30, 0.4)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '16px',
      padding: '12px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px'
    }}>
      <canvas 
        ref={canvasRef} 
        width={width} 
        height={height}
        style={{
          borderRadius: '8px',
          background: 'radial-gradient(circle, rgba(20,20,30,0.8) 0%, rgba(10,10,15,0.9) 100%)'
        }}
      />
      <div style={{ fontSize: '12px', color: '#888', fontWeight: 400, letterSpacing: '0.5px' }}>
        Plant Classification Tree
      </div>
    </div>
  );
};
