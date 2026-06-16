# SpartanType Web - AI Developer Reference (claude.md)

This file contains quick reference commands, coding standards, and architectural blueprints to assist Anthropic's Claude Code agents in developing, building, and maintaining SpartanType Web.

## 1. Quick Reference Commands

### Dev & Server Control
* **Start Dev Server**: `npm run dev` (Launches local Vite server)
* **Build Project**: `npm run build` (Performs TypeScript compilation and Vite build)
* **Preview Production**: `npm run preview` (Previews the local build output)
* **Code Linting**: `npm run lint` (Checks rules using ESLint)

### Dependency Operations
* **Install Dependencies**: `npm install`
* **Raw Execution (RTK Bypass)**: `rtk proxy <command>` (For commands that need to bypass RTK optimizations)

---

## 2. Core Architectural Blueprints

### Strict Render Separation
To achieve sub-millisecond typing latencies and a butter-smooth 60fps webcam frame rate, this project separates React from HTML5 Canvas rendering:
* **React**: Manages logical state, UI screens (Trainer/Calibration/Dashboard), and configuration settings. React must never be triggered for per-frame render loops.
* **HTML5 Canvas**: Handles high-frequency graphics (MediaPipe hand overlays, neon classification trees) using raw Canvas 2D contexts inside `requestAnimationFrame` loops, accessed via React `useRef`.

### Calibration & Math (`src/utils/homography.ts`)
* Uses Direct Linear Transformation (DLT) to calculate a $3 \times 3$ Homography matrix from 4 projection coordinate pairs.
* `cameraToLayout(px, py)` transforms MediaPipe finger pixels back into Virtual Keyboard units $(x, y)$ for finger-proximity matching.

### Offline Tracking Engine (`src/utils/TypingEngine.ts`)
* To avoid UI thread blocking during typing, no MediaPipe HandLandmarker inference runs in real-time.
* The system records keystroke timestamps and camera feeds, then aligns and decodes finger landmarks asynchronously in a post-session analysis phase.

---

## 3. Technology Stack & Coding Standards

### Styling & Aesthetics
* **Theme**: Cybernetic, bioluminescent dark theme with neon colors (cyan `#00adb5`, green, purple) and glassmorphism.
* **CSS**: Use **Vanilla CSS** located in `src/styles/` referencing custom properties defined in `src/styles/index.css`.
* **Tailwind**: **DO NOT** use TailwindCSS unless explicitly requested by the user.

### TypeScript Rules
* Strict mode enabled.
* All data logs, coordinates, and KLE structures must follow interfaces defined in `src/types/`.
* Export interfaces clearly. Use type-only imports (`import type { ... }`) for references.

### Project Directory Structure
* `src/components/`: Modular UI views.
  * `trainer/`: Active typing sessions and webcam monitors.
  * `dashboard/`: Session metrics, heatmaps, and diagnostic labels.
  * `calibration/`: Four-point homography projection setups.
  * `tree/`: Canvas-based neon plant classification visualizer.
* `src/utils/`: Logic engines.
  * `homography.ts`: Projective projection geometry calculations.
  * `kleParser.ts`: KLE layout configuration loader.
  * `TypingEngine.ts`: Recording, timestamp syncing, and parsing.
  * `keyMap.ts`: Key-to-finger mapping table.
