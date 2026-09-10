# 解析パイプラインの計測 (Analysis Profiling)

セッション終了後のオフライン解析 (デコード → MediaPipe 推論 → 座標変換 → 集計) が
どこで時間を使っているかを段階ごとに計測するための仕組み。

## 有効化

**計測は常時有効。** 通常の `npm run build` でも公開サイトでも、解析のたびに
コンソールへ `[AnalysisProfile]` が出て、結果が localStorage に残る
(probe.html の 7 番で読める)。コストは 1 フレームあたり Map の更新数回。

`npm run build:profile` (= `vite build --mode profile`) は計測用の便宜ビルドで、
違いは Service Worker を自己破壊型にすることだけ (下記)。

> **重要: `npm run dev` では計測できない。**
> 現在の Vite では dev サーバがクラシックワーカーをバンドルせず ESM のまま配信するため、
> `handTracker.worker.ts` が `Cannot use import statement outside a module` で落ちる。
> ワーカーが INIT_SUCCESS を返さないので `AnalysisPhase` は
> "Preparing video for analysis..." のまま進まない。これは計測用コードとは無関係の
> 既存の問題で、ビルド時は正しくバンドルされるため本番/preview では再現しない。
> **オフライン解析まわりを触るときは必ずビルドして preview を使うこと。**

```bash
npm run build:profile
```

```bash
npm run preview -- --host
```

どのシェル (PowerShell / bash / cmd) でも同じコマンドで動く。
タブレットのコンソールは PC の Chrome から `chrome://inspect` でリモートデバッグして読む。

### PWA キャッシュについて

通常ビルドは Service Worker で precache するため、以前は再ビルド後も端末が古い版を
表示し続けることがあった。**profile ビルドでは SW を自己破壊型にしてある**
(`vite.config.ts` の `selfDestroying`) ので、新しい profile ビルドを一度読み込めば
古い SW と precache は自動で消える (読み込み直後に 1 回自動リロードが入る)。

それでも古い版が出る場合は、DevTools の Application → Service Workers で
Unregister するか、DevTools の Console で次を実行する:

```js
(await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister());
(await caches.keys()).forEach(k => caches.delete(k));
location.reload();
```

## 出力

トレーナーで **offline モード** のセッションを 1 本録って停止すると、解析完了時に
コンソールへ `[AnalysisProfile] offline analysis — wall NNNNms` というグループが出る。
中身は 3 つのテーブル + コピー用の 1 行 JSON (`[AnalysisProfile] JSON {...}`)。
まず JSON 行をコピーして持ち帰るのが確実。

`wall` は解析開始から `onComplete` までの実時間 (ms)。以下はすべてその内訳。

### notes (前提条件)

| キー | 意味 |
| --- | --- |
| `session.durationSec` | セッション長 (録画長) 秒 |
| `session.keystrokes` | 総打鍵数 |
| `video.resolution` | 実際に録画された解像度 (`useSessionRecorder` の 960px 上限適用後) |
| `video.durationSec` | video 要素が報告した尺 |
| `video.frameCallback` | `requestVideoFrameCallback` か `requestAnimationFrame` フォールバックか |
| `analysis.playbackRate` | 解析時の再生倍率 (現在 3) |
| `analysis.maxPendingFrames` | 推論キューの上限 (現在 2) |
| `mediapipe.delegate` | **実際に初期化できたデリゲート (`GPU` / `CPU`)** |

`mediapipe.delegate` が `CPU` なら GPU 初期化に失敗してフォールバックしている。
Worker 側にも `[AnalysisProfile] HandLandmarker delegate: ...` が単独で出る。

### counters (フレーム収支)

| キー | 意味 |
| --- | --- |
| `frames.callbackTicks` | フレームコールバックが呼ばれた総回数 |
| `frames.presented` | **総フレーム数** (再生中に新しく提示された distinct なフレーム) |
| `frames.captured` | そのうち実際にキャプチャして Worker へ送ったフレーム数 |
| `frames.skipped` | 打鍵の目標フレームではないので推論しなかったフレーム数 |
| `frames.waitedForSlot` | 目標フレームなのに推論キューが埋まっていて、video を止めて待った回数 |
| `frames.inferred` | **実際に MediaPipe 推論が完了したフレーム数** |
| `frames.workerErrors` | 推論が失敗したフレーム数 |
| `session.loggedFrames` | 最終的に `TypingSession` に積まれたフレームログ数 |
| `targets.total` | 打鍵から作った目標フレーム数 (= 打鍵数 × F) |
| `targets.captured` | フレームを割り当てて推論した目標数。**total と一致していれば全打鍵に自分のフレームが付いている** |
| `targets.late` | 割り当てたフレームが打鍵から 150ms より遅れていた目標数 |
| `targets.abandoned` | 500ms 以上過ぎてしまい諦めた目標数 (seek 等の異常時) |
| `targets.unreached` | 動画が終わるまで到達しなかった目標数 (動画より後の打鍵) |

解析は「打鍵ごとに keydown 以降の最初のフレーム」だけを推論する
(`domain/frameTargetSelector.ts`、F は `offlineAnalyzer.ts` の `FRAME_TARGET_OPTIONS`)。
目標フレームが来たのにキューが埋まっていればフレームを捨てず video を止めて待つので、
`frames.waitedForSlot` と `wait.pausedMs` が「推論が再生に追いつかなかった量」を表す。

### timings (時間の内訳)

`totalMs` は合計、`calls` は呼び出し回数、`avgMs` は 1 回あたり、
`pctOfWall` は `wall` に対する割合。

| バケット | 何を測っているか | 走る場所 |
| --- | --- | --- |
| `decode.drawImage` | video → canvas の同期描画 (デコード済みフレームの取り出し) | メイン |
| `decode.createImageBitmap` | canvas → ImageBitmap の生成 (呼び出しから resolve まで) | メイン (非同期) |
| `transfer.postMessage` | Worker への転送呼び出し自体 | メイン |
| `transfer.roundTrip` | postMessage から DETECT_RESULT 受信までの往復 | またぎ |
| `transfer.queueAndCopy` | `roundTrip - detectMs` = 転送 + Worker のキュー待ち | またぎ |
| `wait.pausedMs` | 目標フレーム待ちで video を止めていた合計時間 | メイン |
| `inference.detectForVideo` | **MediaPipe 推論そのもの** | Worker |
| `postprocess.mapResults` | MediaPipe 結果 → `HandData` 変換 | メイン |
| `postprocess.processFrame` | **座標変換** (landmark → 画面 → ホモグラフィ) とフレームログ追加 | メイン |
| `finalize.exportSession` | **集計** (打鍵 ↔ フレーム対応付け + 指判定 + JSON 化) | メイン |
| `finalize.parseJson` | エクスポート JSON の再パース | メイン |

### 読み方の注意

- `inference.detectForVideo` は Worker スレッドで、メインスレッドのデコードと
  **並行して**走る。したがって各バケットの合計は `wall` を超えうるし、
  逆に足しても `wall` に届かないこともある (待ち時間が入るため)。
- `wall` の下限は理屈上 `video.durationSec / analysis.playbackRate`。
  それを超えた分はおおむね `wait.pausedMs` (推論待ちで止めた時間) で説明できるはず。
  推論が 150ms/frame の端末では `wall ≈ max(duration / 3, 打鍵数 × F × 0.15s)`。
- `decode.createImageBitmap` は非同期区間なので、他の処理と重なった時間も含む。
  排他的なメインスレッド占有時間は `decode.drawImage` +
  `postprocess.*` + `finalize.*` + `transfer.postMessage` で見る。
- `frames.presented` が `session.durationSec × 15`(録画 fps) を大きく下回るなら、
  デコード側が再生倍率に追いついていない。
- 録画は 15fps (`useSessionRecorder.ts` の `RECORDING_FPS`)。wall の床は
  `duration × 録画fps ÷ 端末のデコード上限 (~85fps)` なので、30fps → 15fps で床は半分になる。


---

# デバイスプローブ (probe.html)

セッションを録らずに、端末の能力だけを 30 秒で確定させる dev 専用ページ。
「スペック表を調べる」より速くて確実。

## 開き方

```bash
npm run build:profile
```

```bash
npm run preview -- --host
```

して `http://<PC の IP>:4173/probe.html` を端末で開く。
`npm run dev` でも `/probe.html` は開けるが、**上記のワーカー問題で 1. と 6. は動かない**
ので、実機計測は必ず preview で行うこと。

probe.html は通常の `npm run build` にも常に含まれる (公開サイトでもそのまま開ける)。
独立したエントリなので開かない限り読み込まれず、PWA の precache からも除外している
(`vite.config.ts` の `globIgnores` / `navigateFallbackDenylist`)。
7. の解析計測も常時有効なので、公開サイトで解析したあとにそのまま読める。

## 各セクション

| # | 内容 | 何が分かるか |
| --- | --- | --- |
| 1 | 決定的な項目 | Worker 内 WebGL2 / GPU 名 / WASM SIMD / 選択コーデックの 4 点だけ抜粋 |
| 2 | 端末情報 | UA、コア数、deviceMemory、secure context 等 |
| 3 | コーデック対応 | MediaRecorder と WebCodecs の対応表 |
| 4 | CPU ベンチ | 開発機と比を取って PC 側スロットリング倍率の目安にする |
| 5 | **デコード実測** | 録画 → 3x 再生で**デコードが追いつくか**。カメラ不要 |
| 6 | **MediaPipe 実測** | GPU/CPU デリゲートの初期化可否と解像度別 ms/frame |
| 7 | 持ち帰り | 全結果の JSON (コピーボタン + テキストエリア) |

## 読み方

**1. Worker 内 WebGL2**
`利用不可` なら GPU デリゲートは必ず失敗し、本番コードは CPU にフォールバックしている。
低スペック Android で最も疑わしい項目。

**5. デコード実測 — `realtimeFactor`**
最重要。`playedSec / wallSec` が解析の再生倍率 (3x) に届いていなければ、
デコードが解析時間を律速している。この場合 MediaPipe を速くしても解析は縮まない。

カメラが無くても合成映像で計測できる (コーデック・解像度・ビットレートは同一)。
LAN の `http://` は secure context ではなく `getUserMedia` が失敗するため、
実機ではこの合成モードが既定になることが多い。

なお 30fps の録画を 3x 再生すると毎秒 90 フレームの提示が必要になるが、
ディスプレイのリフレッシュレート (60Hz) が上限になるため、
どれだけ速い端末でも `requestVideoFrameCallback` に届くのは約 2/3 が上限になる。

**6. MediaPipe 実測 — `検出手数`**
0 のときは手が写っておらず landmark モデルが走っていない = **推論時間の過小評価**。
実機ではカメラを有効にし、キーボードの上に手を置いて実行するのが望ましい。

**6. MediaPipe 実測 — 解像度**
MediaPipe は入力を内部で固定サイズ (palm detector 約 192px、landmark 約 224px) に
リサイズするため、**入力解像度を下げても推論はほとんど速くならない**。
開発機 (Intel HD 630) の実測でも 960px と 320px で GPU 58ms → 33ms 程度、CPU はほぼ横ばいだった。
録画解像度の削減は最適化の当たりくじではない、という判断材料になる。

**6. MediaPipe 実測 — 初回**
GPU デリゲートの 1 回目はシェーダコンパイルを含むため極端に遅くなることがある
(開発機で 6.7 秒)。定常平均と分けて表示しているのはこのため。
