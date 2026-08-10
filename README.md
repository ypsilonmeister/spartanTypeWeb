# SpartanType Web

*[日本語版はこちら / Japanese version here → README.ja.md](README.ja.md)*

**SpartanType Web** is a browser-only, install-free, Spartan-style typing form trainer.

It doesn't just check whether you pressed the *right key* — using webcam-based hand tracking (MediaPipe), it strictly evaluates and corrects whether you pressed it **with the right finger**.

Everything runs client-side. There is no backend server: calibration, hand tracking, video analysis, and even the optional phone-as-overhead-camera pairing are all done directly in the browser.

---

## 🚀 Key Features

### 1. Spartan finger-accuracy grading
Tracks the 21 3D hand/finger landmarks from your webcam and cross-references the finger that actually pressed a key against the finger *assigned* to that key by the active keyboard layout. Pressing a key with the wrong finger (e.g. reaching with your index finger for a key that belongs to your middle finger) is detected and penalized as an error.

### 2. Zero-latency design via asynchronous post-session analysis
No frame-by-frame hand-tracking inference runs while you're actually typing — that would introduce jitter into your typing rhythm. Instead, a session only records the video feed and keystroke timestamps in real time. Once the session ends, video decoding and finger-form analysis run asynchronously in the background (Web Workers + WebCodecs API).

### 3. Homography-based keyboard calibration
A projective transformation (DLT / homography matrix) mathematically corrects for your camera's angle and the keyboard's physical placement. Calibration only requires pressing a handful of designated corner keys in sequence — camera-space coordinates are then automatically mapped onto keyboard-layout coordinates.

### 4. Review dashboard with automatic habit labeling
* **Error heatmap** — visualizes which keys most often get hit with the wrong finger.
* **Taxonomy-style habit labeling** — objectively identifies and labels recurring bad habits, such as "Index Overreach" or "Pinky Avoidance."

### 5. A typing drill disguised as a plant taxonomy tree
Drill down through a botanical taxonomy (family ➔ genus ➔ species) by typing romanized Japanese names. Every correctly-fingered keystroke grows a bioluminescent Canvas tree on screen — it branches, blooms, and glows brighter the longer your correct-answer streak runs.

### 6. Use your phone as an overhead camera — no app, no server
Pair a phone as a second (overhead) camera feed via WebRTC, using a QR code to exchange connection info directly between the two browsers. There's no signaling server: the SDP offer/answer is compressed and exchanged by hand (QR scan or copy-paste), assuming both devices share the same Wi-Fi network.

### 7. English / Japanese UI, auto-detected
The UI language is detected from your browser's language settings on first load (with a manual EN/JA toggle in the navbar for testing or personal preference, persisted in `localStorage`). Practice content adapts too: the beginner and programmer drills have English-equivalent word sets, while the plant-taxonomy drill stays Japanese since it's inherently kana vocabulary.

---

## 🛠️ Tech Stack

* **Build tool**: Vite
* **Language**: TypeScript (strict mode)
* **UI framework**: React (state/UI only — no per-frame render loops)
* **Styling**: Vanilla CSS with custom properties (glassmorphism + cyber-dark theme)
* **Hand tracking**: MediaPipe Tasks Vision (Web)
* **Rendering**: HTML5 Canvas via raw `requestAnimationFrame` loops (kept fully separate from React's render cycle for 60fps performance)
* **PWA**: installable, offline-capable (vite-plugin-pwa)
* **Tests**: Vitest

---

## 📦 Getting Started

### Requirements
* Node.js v18+
* A Chromium-based browser (Chrome/Edge) is recommended — MediaPipe Tasks Vision and the WebCodecs API used for offline analysis have the most complete support there.
* A webcam, and (for calibration/typing sessions) HTTPS or `localhost` — browsers only grant camera access in secure contexts.

### Setup

```bash
npm install
```

### Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local Vite dev server |
| `npm run build` | Type-check (`tsc -b`) and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Lint with ESLint |
| `npm test` | Run the Vitest test suite |

Then open the URL Vite prints (typically `http://localhost:5173`).

---

## 🗂️ Project Structure

```
src/
├── components/     # UI views, split by screen
│   ├── trainer/       # Active typing sessions & webcam monitor
│   ├── dashboard/     # Session metrics, heatmaps, diagnostics
│   ├── calibration/   # Four-point homography calibration flow
│   └── tree/          # Canvas-based plant-taxonomy visualizer
├── hooks/          # React orchestration: session state, calibration
│                   # capture, practice drills, recording, i18n
├── domain/         # Pure TypeScript logic: hand geometry, finger
│                   # analysis, practice-list selection, session
│                   # serialization — no React or DOM access
├── infra/          # Browser/MediaPipe integration: keyboard capture,
│                   # worker protocol, offline video analysis
├── i18n/           # Language context + translation dictionary
├── types/          # Shared geometry, calibration, session, KLE,
│                   # practice, and i18n interfaces
└── utils/          # homography.ts (DLT projection math),
                    # kleParser.ts, calibrationStorage.ts,
                    # mediapipeUtils.ts, keyMap.ts, webrtcSignaling.ts
```

---

## 🤖 AI Agent Developer Guides

This repo ships reference files so AI coding assistants can pick up project conventions, commands, and architecture immediately:

* **[CLAUDE.md](CLAUDE.md)** — for Claude Code.
* **[AGENTS.md](AGENTS.md)** — for Codex-style agents.
* **[gemini.md](gemini.md)** — for Gemini.
* **[ANTIGRAVITY.md](ANTIGRAVITY.md)** — agent instructions & planning conventions for Antigravity.

### Custom automation skills (`.claude/`)
Defined in [plugin.json](.claude/plugin.json):

* `/spartan-custom:e2e-verify` — end-to-end browser verification via a browser subagent.
* `/spartan-custom:verify-homography` — runs `scripts/verify_homography.cjs` to check the DLT projection math.
* `/spartan-custom:generate-dictionary` — generates `plantDictionary.ts` practice-word data from a list.
