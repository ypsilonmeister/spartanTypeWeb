# SpartanType Web - AI Developer Reference (antigravity.md)

This file contains quick reference commands, coding standards, and architectural blueprints specifically designed for **Antigravity** (Google DeepMind's agentic AI coding assistant) to develop, build, and maintain SpartanType Web.

## 1. Antigravity Agentic Workflow

When working on this repository, strictly adhere to the Antigravity agentic loop:

### Planning Mode Boundaries
* **Major Changes**: Creating a new feature, modifying core physics/math (`homography.ts`), or modifying database schemas requires creating/updating `implementation_plan.md` in your artifact directory.
* **Minor/Fix Changes**: Directly modify code and skip planning if fixing typescript compilation errors, formatting styles, or implementing localized helper logic.
* **Tasks tracking**: Maintain progress updates in `task.md` during execution.
* **Walkthroughs**: Provide a clear diff summary, test results, and screenshots in `walkthrough.md` after completion.

### 1.2. Native Agent Capabilities (Plugins, Subagents, Skills)
As a Google DeepMind agentic framework, Antigravity has native integrations for extending its actions:
* **Plugins**: Custom bundles (loaded from directories containing `plugin.json`) that expand agent capabilities by grouping custom rules, configurations, specialized subagents, and reusable skills. For example, `modern-web-guidance-plugin` is loaded for styling and web architecture guidance.
* **Subagents**: Specialized autonomous agents spawned for specific multi-step tasks. In particular, the **Browser Subagent** (`browser_subagent`) is used for end-to-end browser interactions, visual assertions, and flow automation (recorded to WebP).
* **Skills**: Predefined execution procedures and instructions (flagged via `IsSkillFile: true` when reading) designed to guide the agent through specific task implementations.

### 1.3. Custom Project Skills (Located in `.claude/`)
We have defined custom developer skills specifically for this repository inside the `.claude/` directory:
* **E2E Verification Skill** (`/spartan-custom:e2e-verify` in [SKILL.md](file:///e:/Projects/Git/github/spartanTypeWeb/.claude/skills/e2e-verify/SKILL.md)): Automates starting the Vite server, launching the Browser Subagent, navigating, uploading session JSON logs, and checking for visual dashboard errors.
* **Verify Homography Math Skill** (`/spartan-custom:verify-homography` in [SKILL.md](file:///e:/Projects/Git/github/spartanTypeWeb/.claude/skills/verify-homography/SKILL.md)): Runs [verify_homography.cjs](file:///e:/Projects/Git/github/spartanTypeWeb/scripts/verify_homography.cjs) to mathematically validate linear algebra transformations and reprojection calculations.
* **Generate Dictionary Skill** (`/spartan-custom:generate-dictionary` in [SKILL.md](file:///e:/Projects/Git/github/spartanTypeWeb/.claude/skills/generate-dictionary/SKILL.md)): Runs [generate_dictionary.cjs](file:///e:/Projects/Git/github/spartanTypeWeb/scripts/generate_dictionary.cjs) to compile indented Japanese lists into nested arrays of Hepburn Romaji plant vocabulary objects.

---

## 2. Quick Reference Commands

### Dev & Server Control
* **Start Dev Server**: `npm run dev` (Launches local Vite server)
* **Build Project**: `npm run build` (Performs TypeScript compilation and Vite build)
* **Preview Production**: `npm run preview` (Previews the local build output)
* **Code Linting**: `npm run lint` (Checks rules using ESLint)

### Dependency Operations
* **Install Dependencies**: `npm install`
* **Raw Execution (RTK Bypass)**: `rtk proxy <command>` (Bypasses the Claude Code hook/RTK token saver rules for raw commands)

---

## 3. Core Architectural Blueprints

### Strict Render Separation (React vs. Canvas)
* **React**: Manages logical state, UI screen toggles (Trainer, Calibration, Dashboard), and configuration states. Do not trigger React state changes within 60fps render frames.
* **HTML5 Canvas**: Handles high-frequency graphics (webcam overlays, neon classification trees) using raw Canvas 2D contexts inside `requestAnimationFrame` loops, accessed via React `useRef`.

### Calibration & Math (`src/utils/homography.ts`)
* Uses Direct Linear Transformation (DLT) to calculate a $3 \times 3$ Homography matrix from 4 projection coordinate pairs.
* `cameraToLayout(px, py)` transforms MediaPipe finger pixels back into Virtual Keyboard units $(x, y)$ for finger-proximity matching.

### Offline Tracking Engine (`src/utils/TypingEngine.ts`)
* The system records keystroke timestamps and camera feeds, then aligns and decodes finger landmarks asynchronously in a post-session analysis phase (`AnalysisPhase.tsx`) to guarantee zero-latency typing.

---

## 4. Technology Stack & Coding Standards

### Styling & Aesthetics
* **Theme**: Cybernetic, bioluminescent dark theme with neon colors (cyan `#00adb5`, green, purple) and glassmorphism.
* **CSS**: Use **Vanilla CSS** located in `src/styles/` referencing custom properties defined in `src/styles/index.css`.
* **Tailwind**: **DO NOT** use TailwindCSS unless explicitly requested by the user.

### TypeScript Rules
* Strict mode enabled.
* All data logs, coordinates, and KLE structures must follow interfaces defined in `src/types/`.
* Export interfaces clearly. Use type-only imports (`import type { ... }`) for references.

### Project Directory Structure
* `src/components/`: Modular React components.
  * `trainer/`: Active typing sessions and webcam monitors.
  * `dashboard/`: Session metrics, heatmaps, and diagnostic labels.
  * `calibration/`: Four-point homography projection setups.
  * `tree/`: Canvas-based neon plant classification visualizer.
* `src/utils/`: Logic engines.
  * `homography.ts`: Projective projection geometry calculations.
  * `kleParser.ts`: KLE layout configuration loader.
  * `TypingEngine.ts`: Recording, timestamp syncing, and parsing.
  * `keyMap.ts`: Key-to-finger mapping table.
