# SpartanType Web リファクタリング計画書

作成日: 2026-07-02
対象: `src/` 全 35 ファイル(約 6,000 行)を全数読解し、import 文から依存関係を有向グラフとして再構成した結果に基づく分析と提案。
**本書は分析と提案のみであり、コード変更は含まない。**

---

## 1. 現状の依存関係と構造的ボトルネック

### 1.1 依存グラフ(現状)

```
main.tsx
 └─ App.tsx ──────────────┬─ components/camera/PhoneCameraPage ─── utils/webrtcSignaling ── utils/compactSignaling
                          │                                        └ components/camera/QRCodeView
                          ├─ hooks/useKeyboardLayout ── utils/kleParser ── types/kle
                          │                             └ assets/layoutTemplates
                          ├─ utils/calibrationStorage ⚠(型+永続化+幾何計算が同居)
                          │
                          ├─ components/calibration/CalibrationScreen (994行) ⚠God Component
                          │    ├─ hooks/useCameraSource ── hooks/useWebcam
                          │    │                           └ utils/webrtcSignaling
                          │    ├─ components/camera/CameraSourceSelector ── QRCodeView
                          │    ├─ utils/handTracker (メインスレッド MediaPipe シングルトン)
                          │    ├─ @mediapipe/tasks-vision (直接 import) ⚠レイヤー越え
                          │    ├─ utils/kleParser ⚠(useKeyboardLayout と同一ロジックを重複実装)
                          │    ├─ utils/homography (computeHomographyLS)
                          │    ├─ utils/calibrationStorage (applyCalibrationHomography) ⚠UIが幾何計算を直接実行
                          │    ├─ utils/calibrationAnchors / utils/mediapipeUtils
                          │    └─ components/common/{VirtualKeyboard, ToastContainer} + hooks/useToast
                          │
                          ├─ components/trainer/TrainerScreen (572行) ⚠God Component
                          │    ├─ hooks/useCameraSource ── (同上)
                          │    ├─ hooks/useWorker ── workers/handTracker.worker ── @mediapipe/tasks-vision
                          │    ├─ utils/TypingEngine ⚠God Object
                          │    ├─ utils/plantDictionary (597行: データ+ロジック混在)
                          │    ├─ utils/mediapipeUtils
                          │    └─ components/common/VirtualKeyboard
                          │
                          └─ components/dashboard/DashboardScreen
                               ├─ components/dashboard/{ScoreSummary, HabitAnalyzer, KeyboardHeatmap}
                               ├─ components/tree/PlantTreeCanvas
                               └─ components/dashboard/AnalysisPhase (250行)
                                    ├─ utils/TypingEngine を new して駆動 ⚠UIコンポーネントが解析パイプラインを所有
                                    ├─ hooks/useWorker (TrainerScreen とは別 Worker を生成) ⚠
                                    └─ utils/mediapipeUtils

utils/TypingEngine ── utils/homography (Point型)
                   ── utils/keyMap
                   ── utils/calibrationStorage (applyCalibrationHomography) ⚠ドメイン→インフラ依存
                   ── types/kle
utils/mediapipeUtils ── utils/TypingEngine (HandData 型) ⚠依存方向の逆転
```

### 1.2 循環依存

**真の import 循環(ビルドを壊すもの)は存在しない。** ただし「概念上の循環」が 1 箇所ある:

- `utils/mediapipeUtils` → `utils/TypingEngine`(`HandData` 型を import)
  一方で TypingEngine の利用者(TrainerScreen / AnalysisPhase)は必ず mediapipeUtils を併用する。
  共有ドメイン型 `HandData` がエンジン実装ファイル内に定義されているため、
  「MediaPipe 結果の変換ユーティリティ」が「タイピングエンジン」に依存するという逆向きの辺が生まれている。
  `HandData` を `types/` へ移すだけでこの辺は消える。

### 1.3 God Object / God Component

| 対象 | 規模 | 抱えている責務 |
|---|---|---|
| `CalibrationScreen.tsx` | 994 行 | ①カメラソース管理 ②MediaPipe 推論+rAF 描画ループ ③Canvas 手描画 ④select→home→corners→complete の状態機械 ⑤ホモグラフィ最小二乗計算の起動 ⑥キャプチャ点のマウスドラッグ微調整 ⑦KLE/Vial ファイルアップロード+パース ⑧全 UI(ほぼ全てインラインスタイル) |
| `TrainerScreen.tsx` | 572 行 | ①MediaRecorder 録画パイプライン(縮小 Canvas→captureStream) ②練習ドリル進行(単語/文字インデックス) ③Worker へのフレーム送信と応答処理 ④リアルタイム指判定フィードバック(指名の日本語訳まで内包) ⑤localStorage 設定永続化 ⑥レスポンシブなキーサイズ計算 ⑦セッション確定と親への受け渡し |
| `TypingEngine.ts` | 454 行 | ①`window.addEventListener('keydown')` によるグローバルキー捕捉(コンストラクタ副作用)②フレーム記録 ③座標変換(homography 適用)④キー→物理キーの解決 ⑤期待指の判定(コンパクトスプリット判定ヒューリスティクス込み)⑥最近傍フレーム二分探索 ⑦キーストローク enrich + JSON エクスポート ⑧リアルタイム単発解析 |

`TypingEngine` は特に「ドメインロジック(指判定・座標変換)」と「ブラウザ I/O(グローバルイベントリスナー)」が
同一クラスに同居しており、AnalysisPhase では「キー入力を拾わせないために `dummyEngine` を作って
使わないリスナーを登録する」という歪んだ使い方を強いられている。

### 1.4 レイヤー越え(依存方向の違反)

1. **UI → 推論基盤の直接依存**: `CalibrationScreen` が `@mediapipe/tasks-vision`(DrawingUtils, HandLandmarker)を直接 import し、rAF ループ内で推論と描画を実行。トレーナー系は Worker 経由なのに、キャリブレーションだけメインスレッド推論という二重アーキテクチャになっている。
2. **ドメイン型がインフラモジュールに定義されている**: `CalibrationHomography` / `CalibrationCameraSize` は座標変換のドメイン型だが、localStorage 永続化モジュール `calibrationStorage.ts` に定義されている。結果、App / TrainerScreen / CalibrationScreen / TypingEngine の全てが「ストレージ」を import して「幾何」を使うという逆転が起きている。
3. **UI コンポーネントがバッチ解析パイプラインを所有**: `AnalysisPhase.tsx` の 190 行 useEffect が「動画デコード → フレーム送出 → Worker 応答集約 → finalize リトライ制御 → エクスポート」を丸ごと実装。テスト不能で、React ライフサイクルと解析ライフサイクルが絡み合っている。
4. **Worker プロトコルが暗黙**: `{type: 'DETECT', ...}` / `DETECT_RESULT` のメッセージ形が `handTracker.worker.ts` / `TrainerScreen` / `AnalysisPhase` の 3 箇所で untyped(`e.data`)に扱われ、変更時にコンパイラの保護がない。

### 1.5 重複実装(密結合の温床)

| 重複 | 箇所 A | 箇所 B |
|---|---|---|
| 手の左右をカメラX座標で判定 | `CalibrationScreen.assignHandsByCameraX` | `TypingEngine.assignHandSidesByCameraX`(ほぼ同一アルゴリズム) |
| ランドマーク→画面座標(ミラー補正) | `CalibrationScreen.tipToScreen` | `TypingEngine.landmarkToScreen` |
| MediaPipe HandLandmarker 初期化設定(CDN URL・モデル URL・信頼度) | `utils/handTracker.ts` | `workers/handTracker.worker.ts` |
| レイアウトパース+フォールバック | `hooks/useKeyboardLayout`(重複解消用に作られた) | `CalibrationScreen` の `activeLayout` useMemo(未移行の残存) |
| 最近傍指探索+期待指照合(~60 行) | `TypingEngine.exportSession` 内 | `TypingEngine.analyzeKeystrokeRealtime`(同一ロジックのコピー) |
| KLE/Vial アップロード判別 | `CalibrationScreen.handleFileUpload` | `kleParser.parseLayoutJSON`(検証のためだけに二度パース) |

### 1.6 その他の構造的問題

- **デッドコード**: `components/trainer/CameraPreview.tsx`(どこからも import されない)、`homography.computeHomography`(4点版・未参照)、`TypingEngine.getTargetChar`(未呼び出し)。
- **Worker の二重起動**: `useWorker` は呼び出しコンポーネントごとに `new Worker` する。TrainerScreen と AnalysisPhase で MediaPipe WASM+モデル(数 MB)が 2 回ロードされる。加えてリアルタイムモードでは `handTracker.ts`(メインスレッド)も初期化され得るため、最悪 3 系統のモデルが常駐する。
- **スタイル規約違反**: CLAUDE.md は「`src/styles/` の Vanilla CSS + カスタムプロパティ」を規定するが、CalibrationScreen / DashboardScreen / AnalysisPhase / PlantTreeCanvas / QRCodeView は大量のインラインスタイルで構築されている。
- **セッション状態の受け渡しが脆い**: App が `key={`dashboard-${...keystrokes.length}`}` という再マウントハックで Dashboard をリセットしている。セッションのライフサイクルを表すモデルが存在しない兆候。
- **ローマ字入力判定の制約**: TrainerScreen の `code.startsWith('Key')` 判定は英字キーのみ対応で、ドリル進行ロジックが UI にハードコードされている。

---

## 2. アーキテクチャ方針

### 2.1 目標レイヤー構造

依存は必ず「下向き」のみ。上位層は下位層を知るが、逆は禁止。

```
┌─ UI 層          components/**  (React: 表示とユーザー操作のみ)
├─ アプリ層        hooks/**       (React とドメインの接着: useCalibrationSession, useTrainingSession, useOfflineAnalysis ...)
├─ ドメイン層      domain/**      (純粋 TS: 幾何・指判定・セッションモデル・アンカー解決。DOM/React 禁止)
├─ インフラ層      infra/**       (MediaPipe, Worker, MediaRecorder, WebRTC, localStorage)
└─ 共有型         types/**       (Point, HandData, KeyboardLayout, SessionData, CalibrationHomography ...)
```

### 2.2 分離の原則

1. **型の住所を正す**: `HandData` / `CalibrationHomography` / `SessionData` 系の共有型を `types/` へ集約する。これだけで「mediapipeUtils → TypingEngine」「App → calibrationStorage」等の不自然な辺の大半が消える。
2. **TypingEngine の解体**: 「キーボードイベント捕捉(インフラ)」「フレーム記録(セッションモデル)」「指判定(純関数)」「エクスポート(シリアライズ)」に分割する。指判定と座標変換は引数→戻り値のみの純関数にし、単体テスト可能にする(既存の `/spartan-custom:verify-homography` スキルの検証対象を広げられる)。
3. **推論経路の一本化**: HandLandmarker へのアクセスを「Worker 経由のクライアント」1 つに統一し、初期化設定を単一モジュールに置く。メインスレッド推論(`handTracker.ts`)はキャリブレーションのプレビュー用に残すとしても、設定は共有し、可能なら Worker に寄せて廃止する。Worker インスタンスはアプリで 1 つを共有(Context またはモジュールシングルトン)。
4. **解析パイプラインの分離**: 「録画 Blob → SessionData」の変換を、進捗コールバックを持つ純粋なオーケストレータ(`domain/offlineAnalyzer.ts` + `infra/videoFrameSource.ts`)として切り出す。AnalysisPhase は進捗バーを描くだけの薄い UI になる。
5. **状態機械の明示化**: キャリブレーションの select→home→corners→complete と、セッションの idle→recording→unanalyzed→analyzed を reducer / 判別共用体で表現し、App の再マウントハックを廃止する。
6. **スタイルの規約回帰**: 新設・分割するコンポーネントから順に `src/styles/` の Vanilla CSS へ移す(全面書き換えは行わない)。

### 2.3 やらないこと(過剰設計の回避)

- DI コンテナや抽象インターフェースの乱造はしない。モジュール境界と型の住所を正すことが主眼。
- 「録画→事後解析」というオフライン設計自体は要件(ゼロ遅延)であり変更しない。リアルタイムモードも意図された機能として維持する。
- 状態管理ライブラリ(Redux 等)の導入は現規模では不要。

---

## 3. 段階的リファクタリング・ロードマップ

各フェーズは独立してマージ可能な粒度とし、**フェーズごとに `npm run build` / `npm run lint` が通り、
キャリブレーション→練習→解析→ダッシュボードの E2E フロー(`/spartan-custom:e2e-verify`)が動作すること**を共通の完了条件とする。

### フェーズ 1: 足場固め — 型の集約とデッドコード除去(リスク: 低)

- **目的**: 依存グラフの不自然な辺を、挙動変更ゼロで取り除く。
- **対象ファイル**:
  - 新規 `src/types/session.ts`(`SessionData` / `UnanalyzedSessionData` / `KeystrokeLog` / `FrameLog` / `HandData` を移設)
  - 新規 `src/types/calibration.ts`(`CalibrationHomography` / `CalibrationCameraSize` / `CalibrationConfig` を移設)
  - 修正: `TypingEngine.ts` / `mediapipeUtils.ts` / `calibrationStorage.ts` / `App.tsx` / `TrainerScreen.tsx` / `CalibrationScreen.tsx` / `AnalysisPhase.tsx` / `DashboardScreen.tsx` / `ScoreSummary.tsx` / `HabitAnalyzer.tsx` / `KeyboardHeatmap.tsx` の import を張り替え
  - 削除: `components/trainer/CameraPreview.tsx`、`homography.computeHomography`、`TypingEngine.getTargetChar`
  - `CalibrationScreen` の `activeLayout` useMemo を `useKeyboardLayout` 呼び出しに置換(重複解消の完遂)
- **完了条件**: `utils/mediapipeUtils` が `TypingEngine` を import しない。UI 層が `calibrationStorage` を「型のためだけに」import する箇所がゼロ。ビルド成果物の挙動が変わらない(型移動と削除のみ)。

### フェーズ 2: ドメイン層の抽出 — 幾何と指判定の純関数化(リスク: 中)

- **目的**: 重複した座標変換・手割り当て・指判定ロジックを単一の純粋モジュールに統合し、テストを付ける。
- **対象ファイル**:
  - 新規 `src/domain/handGeometry.ts`: `landmarkToScreen`(旧 tipToScreen 含む)、`assignHandSidesByCameraX`(2 実装を統合)、`applyCalibrationHomography` / `isSplitHomography`(calibrationStorage から移設)
  - 新規 `src/domain/fingerAnalysis.ts`: 最近傍指探索+期待指照合(`exportSession` と `analyzeKeystrokeRealtime` の重複 60 行を 1 関数に)、`getExpectedFinger`(コンパクトスプリット判定含む)、`findTargetKey`
  - 修正: `TypingEngine.ts`(上記を委譲呼び出しに変更)、`CalibrationScreen.tsx`(ローカル実装を削除して domain を import)、`calibrationStorage.ts`(純粋な localStorage 永続化のみに縮小)
  - 新規 `src/domain/__tests__/`(homography 適用・手割り当て・指判定のユニットテスト。テストランナー導入が必要なら vitest を追加)
- **完了条件**: 同一アルゴリズムの二重実装がゼロ。`calibrationStorage.ts` が localStorage 以外の責務を持たない。domain 層のファイルが `react` / `window` / `document` を一切参照しない。

### フェーズ 3: 推論基盤の一本化 — Worker クライアントと共有初期化(リスク: 中)

- **目的**: MediaPipe の三重初期化を解消し、Worker プロトコルを型安全にする。
- **対象ファイル**:
  - 新規 `src/infra/handLandmarkerConfig.ts`(CDN URL / モデル URL / 信頼度パラメータの単一定義)
  - 新規 `src/infra/workerProtocol.ts`(`DetectRequest` / `DetectResult` / `DetectError` の判別共用体型)
  - 新規 `src/infra/handTrackerClient.ts`(Worker のライフサイクルと postMessage/onmessage を包む Promise ベースのクライアント。アプリで 1 インスタンス共有)
  - 修正: `workers/handTracker.worker.ts`(config/protocol を import)、`hooks/useWorker.ts`(クライアント共有化。画面遷移で terminate しない)、`TrainerScreen.tsx` / `AnalysisPhase.tsx`(生 `e.data` 処理をクライアント API 呼び出しに置換)、`utils/handTracker.ts`(config を共有。可能なら Worker クライアントに置換して削除)
- **完了条件**: HandLandmarker の初期化設定がコード上 1 箇所。Trainer→Dashboard 遷移でモデルの再ロードが発生しない。Worker メッセージに untyped アクセスがない。

### フェーズ 4: God Object/Component の解体(リスク: 高)

- **目的**: TypingEngine・CalibrationScreen・TrainerScreen を責務単位に分割し、UI を薄くする。
- **対象ファイル**:
  - `TypingEngine.ts` → 分割:
    - `src/infra/keyboardCapture.ts`(window keydown の購読/解除のみ)
    - `src/domain/typingSession.ts`(frames/keystrokes の記録と二分探索、enrich、シリアライズ。イベントリスナーを持たない)
    - `AnalysisPhase` の「dummyEngine」利用を `typingSession` 直接利用に置換
  - `CalibrationScreen.tsx`(994 行) → 分割:
    - `src/hooks/useCalibrationCapture.ts`(状態機械: phase / captured / cornerStep / ドラッグ微調整)
    - `src/components/calibration/CalibrationCanvas.tsx`(rAF 描画ループと手オーバーレイ)
    - `src/components/calibration/LayoutSelectPanel.tsx` / `CapturePanel.tsx` / `CompletePanel.tsx`(フェーズ別 UI、スタイルは `src/styles/calibration.css` へ)
  - `TrainerScreen.tsx`(572 行) → 分割:
    - `src/hooks/useSessionRecorder.ts`(MediaRecorder+縮小 Canvas パイプライン)
    - `src/hooks/usePracticeDrill.ts`(単語/文字進行、カテゴリ永続化)
    - `src/components/trainer/RealtimeFeedback.tsx`(指名翻訳テーブル込み)
  - 新規 `src/domain/offlineAnalyzer.ts` + `src/infra/videoFrameSource.ts`(AnalysisPhase の解析ループを移設。AnalysisPhase は進捗表示のみに)
- **完了条件**: 1 ファイル 300 行以下(データ定義ファイルを除く)。UI コンポーネントが `new TypingEngine` / `MediaRecorder` / `worker.postMessage` を直接触らない。E2E フロー(オフライン解析・リアルタイム両モード、スプリット配列含む)が回帰しない。

### フェーズ 5: 状態機械の明示化と仕上げ(リスク: 中)

- **目的**: アプリ全体のセッションライフサイクルを型で表現し、残存ハックを除去する。
- **対象ファイル**:
  - 新規 `src/hooks/useAppSession.ts`(`idle | calibrating | training | analyzing | reviewing` の判別共用体 reducer。App の `key` 再マウントハックを廃止)
  - 修正: `App.tsx`(ルーティング的分岐のみに縮小。`?camera=phone` 分岐の整理)
  - `utils/plantDictionary.ts` → `src/assets/dictionaries/`(データ)と `src/domain/practiceList.ts`(shuffle/整形ロジック)に分離
  - インラインスタイルの CSS 移行(`dashboard.css` / `calibration.css` の拡充。DashboardScreen / AnalysisPhase / QRCodeView が対象)
  - CLAUDE.md のディレクトリ構造記述を新構成(`domain/` / `infra/`)に更新
- **完了条件**: Dashboard リセットが状態遷移で表現され `key` ハックが存在しない。styles/ 外のインラインスタイルが装飾目的で新規追加されない状態(動的値のみ許容)。ドキュメントが実構成と一致。

### フェーズ順序の根拠

1→2→3 は「型 → 純関数 → インフラ」の順に依存の土台を下から固める(各フェーズが次の前提)。
4 は土台がないと分割先が存在しないため中盤に置き、最もリスクが高いので専用フェーズとする。
5 は全体が分割済みであることが前提の統合作業。緊急でバグ修正が必要になった場合も、
フェーズ 1〜3 まで完了していれば十分に保守性が改善しているため、4〜5 は延期可能。

---

## 付録: 定量サマリ

| 指標 | 現状 |
|---|---|
| 最大ファイル | CalibrationScreen.tsx 994 行 |
| import 循環 | 0(ただし型の逆向き依存 1: mediapipeUtils→TypingEngine) |
| 同一アルゴリズムの重複実装 | 6 組(§1.5) |
| MediaPipe 初期化定義 | 3 箇所(handTracker / worker / ※設定重複) |
| デッドコード | CameraPreview.tsx、computeHomography、getTargetChar |
| ドメインロジックのユニットテスト | 0 件 |
