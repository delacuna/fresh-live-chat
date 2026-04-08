# SpoilerShield トラブルシューティングログ

---

## #001 チャット監視が開始されない（タイムアウト）

**日付:** 2026-04-07

### 起きたこと

- 拡張機能を読み込み、アーカイブ動画のチャットリプレイを開いた
- `[SpoilerShield] チャット監視を開始しました` のログが出ない
- `[SpoilerShield] チャット要素が見つかりませんでした（タイムアウト）` も出ない
- `[SpoilerShield] ページ遷移を検知しました` は `top` コンテキストで出ていた

### 原因

`waitForItems()` が `setTimeout` による20回 × 500ms = 最大10秒のポーリングで `#items` 要素を探していたが、YouTubeのチャットリプレイはユーザー操作後に遅延初期化されるため、10秒以内に `#items` が DOM に現れなかった。

- Content Script 自体は正しく iframe に注入されていた（`location.href` で `live_chat_replay` URLを確認）
- `#items` セレクタも正しかった（手動クエリで要素取得を確認）
- 問題は純粋にタイミング：スクリプトが走る時点で要素がまだ存在しないだけだった

### 解決策

`setTimeout` ポーリングを廃止し、`MutationObserver` で `document.body` を監視して `#items` が DOM に追加された瞬間を検知する方式に変更。

- 時間制限がなくなり、YouTube の初期化がどれだけ遅くても対応できる
- ムダなポーリングが発生しない

### 教訓

- YouTubeのチャット要素はページ読み込みと同時には存在しない。遅延初期化を前提に設計する
- 「要素が見つからない」場合は、セレクタの誤りとタイミングの問題を切り分けること（手動クエリで確認するのが有効）
- ポーリングに上限を設けると、初期化が遅いだけのケースでも「見つからない」と誤判定される

---

## #002 Content Script が iframe に注入されない

**日付:** 2026-04-07

### 起きたこと

- `manifest.json` の `matches` に `*://www.youtube.com/live_chat*` を指定していた
- `chatframe(live_chat_replay)` コンテキストに切り替えてもログが一切出ない
- `performance.getEntriesByType('resource').filter(r => r.name.includes('content.js'))` が空配列を返した
- `document.querySelector('#items')` では要素が存在することを確認できた

### 原因

`manifest.json` の `content_scripts` に `"all_frames": true` が指定されていなかった。

デフォルト値は `false` で、URLパターンが一致していてもトップレベルのページ（`/watch`）にしかContent Scriptが注入されない。チャットリプレイは iframe として埋め込まれているため、スクリプト自体が動いていなかった。

### 解決策

`manifest.json` の `content_scripts` に `"all_frames": true` を追加。

```json
"all_frames": true
```

### 教訓

- Chrome拡張でiframe内でも動作させる必要がある場合は `"all_frames": true` が必須
- Content Scriptが動いていないかどうかは `performance.getEntriesByType('resource')` で確認できる
- URLパターンのマッチだけでは不十分。`all_frames` のデフォルト動作を把握しておくこと

---
