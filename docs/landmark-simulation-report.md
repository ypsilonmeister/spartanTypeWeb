# ランドマーク模擬テスト (試作) レポート

実物の手とカメラを使わずに、打鍵指判定の感度と誤検出を自動で測るための試作。

## 構成

| ファイル | 役割 |
|---|---|
| `src/domain/__tests__/simulation/landmarkSimulator.ts` | 台本 → 手ランドマーク列 + 解析入力一式のジェネレータ (シード固定) |
| `src/domain/__tests__/simulation/pipeline.ts` | 模擬セッションを本番の `TypingSession` に通す処理と、感度・誤検出率の集計 |
| `src/domain/__tests__/landmarkSimulation.test.tsx` | 模擬テストスイート (16 件) |

### ジェネレータが合成するもの

- 台本 `ScriptStroke { code, finger, kind }`: 正しい指 (`correct`)、中指担当キーを同じ手の人差し指で打つ (`indexOverreach`)、小指担当キーを同じ手の薬指で打つ (`pinkyAvoidance`)。正しい指は本番の `expectedFingerMap` から引く。
- 手ランドマーク `HandData[]`: 1 手 21 点、正規化カメラ座標。本番と同じミラー表示 (`mirror=true`) を前提にしている。MediaPipe の `handedness` は、わざと実際の左右と逆に入れてある。こうすると、左右の判定が本番の手首 x による割り当て (`assignHandSidesByCameraX`) で正しく決まることを毎回確かめられる。
- キャリブレーション行列: 本番のアンカー (`HOME_ANCHORS` と四隅) に指先を置いたときの画面座標にノイズを加え、本番の `computeHomographyLS` で解く。
- カメラサイズ、打鍵ログ (`key` / `code` / `timestamp`)、30fps のフレーム格子。打鍵に最も近いフレームが打鍵姿勢、それ以外は休止姿勢になる。

### 手の生成モデル

1. 指はホームキー (ASDF / JKL;) に休む。親指はスペースバー上。`handScale` で手の重心から指の位置を伸縮する。
2. 打鍵する指は、キー中心から N(0, `pressSigmaU`) ずれた位置に移動する。同じ手の他の指は、打鍵指の変位の `follow` 倍だけ一緒に動き、N(0, `restSigmaU`) 揺らぐ。
3. 他の指先が打鍵指先から `minFingerSepU` より近くなった場合は、その距離まで押し出す。
4. キーボード平面 (U) から画面画素へは、回転・拡大・オフセット・台形歪みを持つ射影で写し、N(0, `landmarkSigmaPx`) の画素ノイズを加える。`postCalibrationShiftPx` を指定すると、キャリブレーションの後にカメラがずれた状態を再現できる。

### 通している本番経路 (モック・再実装なし)

`TypingSession.processFrame` (`assignHandSidesByCameraX` → `landmarkToScreen` → `applyCalibrationHomography`) を通り、続いて `recordKeystroke` / `exportSession` (`findNearestFrame` → `analyzeKeystrokeAgainstTips`) を通る。
癖ラベリングは、`exportSession` が出した打鍵ログを本番の `HabitAnalyzer` コンポーネントに渡し、`react-dom/server` の `renderToStaticMarkup` で描画して、出たラベル名と回数を読み取る。

## 測定結果 (us-standard、seed=2026、1 バリアント 800 打鍵: 正 484 / 誤 316)

- 感度: 間違った指の打鍵のうち、`isCorrectFinger === false` と判定された割合。
- 誤検出率 (false reject): 正しい指の打鍵のうち、誤って `isCorrectFinger === false` と判定された割合。
- 帰属一致: 間違った指の打鍵で、`predictedFinger` が実際に使った指と一致した割合。

| バリアント | 感度 | Overreach 検出 | PinkyAvoid 検出 | 誤検出率 | 判定不能 | 帰属一致 |
|---|---|---|---|---|---|---|
| baseline (回転 0°、70px/U、手 1.0) | 99.7% | 100.0% | 99.4% | 0.4% | 0.0% | 99.7% |
| rotated-offset-keystone (12°、62px/U、+110px、台形) | 99.4% | 100.0% | 98.8% | 0.4% | 0.0% | 99.4% |
| small-hand (0.8) | 99.1% | 100.0% | 98.2% | 0.4% | 0.0% | 99.1% |
| large-hand (1.25) | 100.0% | 100.0% | 100.0% | 0.0% | 0.0% | 100.0% |
| noisy-combined (−8°、手 0.9、ノイズ全般増し) | 96.5% | 98.0% | 95.3% | 0.6% | 0.0% | 96.5% |
| camera-bumped (キャリブ後 +35px, +20px ≈ 0.5U) | 67.4% | 67.3% | 67.5% | **12.8%** | 0.0% | 67.4% |
| stress: finger crowding (minSep 0.35U) ※測定のみ | 96.8% | 95.9% | 97.6% | 0.4% | 0.0% | 96.8% |
| stress: sloppy strike (press σ 0.35U) ※測定のみ | 83.5% | 86.4% | 81.1% | 2.9% | 0.0% | 83.5% |
| stress: camera-bumped (+70px ≈ 1U) ※測定のみ | 67.7%* | 75.5% | 60.9% | **65.5%** | 0.0% | 38.3% |

\* +70px のずれでは誤検出率が 65.5% まで上がるため、ここでの感度は「何でも不正解と判定している」ことの裏返しにすぎない。帰属一致 38.3% のほうが実態に近い。

シードを変えたときの振れ幅 (感度 / 誤検出率。seed 1, 2026, 4242, 9000, 31337):

- baseline: 97.5–99.7% / 0.0–0.6%
- rotated: 97.5–99.4% / 0.0–0.6%
- small-hand: 96.6–99.1% / 0.2–0.4%
- large-hand: 98.0–100% / 0.0–0.4%
- noisy-combined: 92.8–96.5% / 0.6–1.0%
- camera-bumped: 67.4–74.7% / 10.2–12.8%

テストの合否ラインは、この振れ幅に余裕を持たせた値にしてある (`LIMITS`)。camera-bumped の合否ラインは、既知の弱点の現状値を固定するためのもの。

## 読み取れること

- キャリブレーションさえ正しければ、回転・オフセット・台形歪みや手の大きさの違いでは、判定はほとんど崩れない。射影は `computeHomographyLS` でほぼ完全に戻る。ノイズなしの往復誤差は 1e-6U 未満で、これはテストで確認している。
- いちばん効く誤差要因は、キャリブレーションの後にカメラやキーボードが動くこと。約 0.5U のずれで、正しい指の打鍵の約 13% を誤って落とす。約 1U のずれでは、判定がほぼ使い物にならない。ずれを検知する仕組みや、再キャリブレーションを促す仕組みを検討する価値がある。
- 打鍵位置のばらつきが大きい場合 (σ 0.35U) も、感度が 83% まで下がる。
- 癖ラベリング: すべて正しい指で打ったセッションではラベルが 0 件、Overreach を混ぜたセッションでは `Index Overreach` だけ、小指回避を混ぜたセッションでは `Left/Right Pinky Avoidance` の両方が付く。

## 注意 (生成モデルの限界)

- baseline の高い数値は、生成モデルの仮定にかなり支えられている。特に「打鍵指先はキー中心付近に来る」「他の指先は打鍵指から `minFingerSepU` 以上離れる」の 2 つ。判定ロジックは最近傍の指先を採るので、この仮定が成り立てばほぼ正解になる。ストレス条件の行は、この仮定を弱めたときの値。
- z 座標 (指の上下) は扱っていない (常に 0)。実際のカメラ映像で起きる、浮いている指が投影上でキーに重なる誤りは再現していない。
- MediaPipe の検出失敗、手の取り違え、フレーム欠落、打鍵とフレームの時刻ずれ (遅延) は再現していない。フレームは打鍵時刻に最も近い格子点にあり、時刻差は 17ms 以内。
- 生成モデルのパラメータは実測値に合わせていない。実データ (録画済みセッション) と比べて合わせ込むのが次の一手。

## 届かなかった範囲 (継ぎ目の制約)

- **`offlineAnalyzer.ts` (infra)**: 動画デコード、ワーカー、`frameTargetSelector` とフレームの切り抜き (`cropRectForHand`)、期待した手が写っているかによるフレーム選択は、Blob / Canvas / Worker に依存していて、純粋関数の継ぎ目がない。このため模擬経路には入っていない。模擬経路は、その下にある `TypingSession` から先だけ。
- **スプリット配列 / 36 キー配列**: 試作は `us-standard` だけ。ジェネレータは `findTargetKey` で座標を引くので、配列を差し替えることはできる。ただし、スプリット配列のキャリブレーション (左右別の行列) とコンパクト配列の列による指推定は未検証。
- **リアルタイム経路** (`useRealtimeFeedback`): React フックなので対象外。判定関数 (`analyzeKeystrokeRealtime` → `analyzeKeystrokeAgainstTips`) は同じもの。

## 本番コードの変更

なし。癖ラベリングは `HabitAnalyzer.tsx` の中の `useMemo` に閉じていて、純粋関数としては取り出せない。そこで、本番コンポーネントをそのまま `react-dom/server` で描画して結果を読む方法を取った。依存は既存の `react-dom` だけで、追加パッケージもない。
