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

## #003 Chrome拡張のビルド: content.jsが読み込めない（ES モジュール形式の誤用）

**日付:** 2026-04-08

### 起きたこと

- `pnpm build` 後に `dist/` を Chrome に読み込もうとすると以下のエラーが出た
  ```
  スクリプトの JavaScript「content.js」を読み込むことができませんでした。
  マニフェストを読み込めませんでした。
  ```

### 原因（2点）

**原因1: Content Script を ES モジュール形式でビルドしていた**

Vite の `format: 'es'` でビルドすると、Rollup は共通モジュールをチャンクファイルに分割し、`content.js` の先頭に以下のような文を出力する:

```js
import { buildKeywordSet } from './chunk-abc123.js';
```

**Chrome の `content_scripts` は ES モジュールの `import` 文を解釈できない**（Service Worker は可能だが Content Script は不可）。これが直接のエラー原因。

**原因2: ポップアップビルドがスクリプトの成果物を上書き・削除していた**

ビルドスクリプトが `build:scripts → build:popup` の順で実行されており、`build:popup` 側の Vite config に `emptyOutDir: true` が設定されていた。そのため `build:popup` が `dist/` を空にしてから実行され、直前の `content.js` と `background.js` が消えていた。

### 解決策

**原因1への対応: `format: 'iife'` に変更**

IIFE（即時実行関数）形式でビルドすると、全ての依存が1つのファイルにインライン化され、`import` 文が出力されない。`vite.content.config.ts` と `vite.background.config.ts` を分離し、それぞれ `lib.formats: ['iife']` を指定。

```ts
// vite.content.config.ts
build: {
  lib: {
    entry: resolve(__dirname, 'src/content/index.ts'),
    formats: ['iife'],
    name: 'SpoilerShieldContent',
    fileName: () => 'content.js',
  },
}
```

**原因2への対応: ビルド順を逆に変更**

`build` スクリプトを `build:popup → build:content → build:background` の順に変更。`emptyOutDir: true` は popup ビルド（先頭）のみに適用され、以降のスクリプトビルドは `emptyOutDir: false` のまま実行される。

### 教訓

- **Chrome Extension の Content Script は `format: 'iife'` でビルドする**。`format: 'es'` は Service Worker のみで使用可
- 複数の Vite config を組み合わせる場合は `emptyOutDir` の適用タイミングに注意する
- 1つの config で複数エントリを `iife` ビルドすることは Rollup の制約上できないため、Content Script と Service Worker は config ファイルを分けて管理する

---

## #004 LLMが固有名詞（キャラクター名）を創作する

**日付:** 2026-04-08

### 起きたこと

知識ベースJSON（`ace-attorney-1.json`）の初期生成時に、LLM（Claude）が実在しないキャラクター名を複数作り出した。

| 場所 | LLMが生成した誤った名前 | 正しい名前 |
|------|------------------------|-----------|
| 第1話 被告人 | 大江戸幸助 | 矢張政志（Larry Butz） |
| 第1話 被害者 | 大場兎奈 | 高日美佳（Cindy Stone） |
| 第1話 犯人 | 北野大 | 山野星雄（Frank Sahwit） |
| 第2話 犯人 | 宇奈月辛夷 | 小中大（Redd White） |
| 第3話 被告人 | 白川大吾 | 荷星三郎（Will Powers） |
| 第3話 犯人 | 上月満子 | 姫神サクラ（Dee Vasquez） |
| 第5話 犯人 | キャス・ロルドイニ | 巌徒海慈（Damon Gant） |

これらはすべてゲームに存在しない完全な造語であり、**キーワードフィルタに組み込まれると誤動作の原因**となる。

### 原因

LLMは学習データからゲーム知識を「想起」するが、以下の条件が重なると創作が発生しやすい：

1. **サブキャラクター・マイナーキャラ**: 主要キャラ（成歩堂、御剣等）は学習データが豊富で正確だが、サブキャラは記憶が曖昧
2. **日本語固有名詞**: 英語名（Frank Sahwit等）は比較的正確でも、対応する日本語名が不確かなまま「それらしい名前」を生成する
3. **確認手段がない状態での生成**: 外部ソースを検索せずに一気に生成すると誤りが混入しやすい
4. **ハルシネーションの無自覚性**: 誤りを含む出力が自信を持って提示されるため、レビューなしでは発見できない

### 解決策と対策

#### 対策1: 外部ソースによる検証（Claude自身）

知識ベースJSON生成時は、必ず以下のソースで固有名詞を検索・照合してから記述する：

- `en.wikipedia.org/wiki/List_of_Ace_Attorney_characters` — 日英名対照（aceattorney.fandom.com は HTTP 403 のため代替）
- `strategywiki.org` の各エピソードページ — キャラ情報と役割の確認
- `court-records.net` — 詳細なゲームデータ

#### 対策2: ユーザーが正確な情報を提供する（人力検証）

LLMの生成結果を鵜呑みにせず、**ゲームを実際にプレイした・攻略情報を確認したユーザーが正確なキャラクター名リストを提供する**。
本プロジェクトでは以下のワークフローを採用する：

```
1. LLMが知識ベースの初稿を生成（構造・カテゴリに集中）
2. ユーザーが各話の登場人物名リスト（日本語）を提供
3. LLMが外部ソースで英語名を検索・照合し、エンティティを修正
4. ユーザーが最終確認してマージ
```

#### 対策3: 知識ベースJSON生成時のルール

- **固有名詞は提供された情報のみ使用する**: ユーザーから名前を受け取っていないキャラクターのエンティティは生成しない
- **不確かな場合は空欄**: `"description": "（要確認）"` として残し、後でユーザーが補完できるようにする
- **英語名のみ不確かな場合はaliasesを空配列に**: `"aliases": []` とし、後で検索・補完する

### 教訓

- **LLMが「知っている」ゲームのキャラクター名でも、サブキャラ・日本語名は創作が混入する可能性がある**
- 知識ベースはフィルタの根幹となるデータであり、誤ったキーワードは誤検知・見逃しに直結する
- 「それらしい名前」が生成されると人間も気づきにくいため、**ユーザー側の一次情報提供が最も確実な防衛策**

---

## #005 クリックして表示したコメントがすぐ再フィルタされる

**日付:** 2026-04-10

### 起きたこと

- フィルタされたコメント（プレースホルダー表示）をクリックすると元のテキストが一瞬だけ見えるが、すぐにプレースホルダーに戻る
- クリックによる展開が実質的に機能しない状態

### 原因（2点）

**原因1: YouTubeがテキスト変更を検知して要素を差し替える**

`restoreMessageElement()` が `el.textContent = original` でテキストを書き戻した際、YouTubeの内部処理がこの変更を検知し、親要素（`yt-live-chat-text-message-renderer`）を新しいDOMノードで差し替える。新しいノードには `data-spoilershield-filtered` 属性がないため、MutationObserver が `processMessage()` を呼んで再フィルタしてしまう。

**原因2: revealedTexts が巻き戻し後もクリアされない**

`revealedTexts`（ユーザーが展開したテキストを記録するSet）はセッション中に蓄積されるが、再生位置を巻き戻してチャットが再レンダリングされると、同じテキストのコメントが新しいDOM要素として追加される。`revealedTexts` が残っているため、巻き戻し後も同じテキストがフィルタされなくなる。

### 解決策

**原因1への対応:**

- クリック時に `ATTR_FILTERED` を `'true'` から `'revealed'` に変更する（`restoreMessageElement` は呼ばない）
- `processMessage()` で `el.hasAttribute(ATTR_FILTERED)` を先頭でチェックし、値が何であれ属性が付いている要素はスキップする
- YouTubeがDOMを差し替えて新しいノードが追加された場合に備え、`revealedTexts` にオリジナルテキストを記録。`processMessage()` でこのSetを参照してスキップする

**原因2への対応:**

- `itemsObserver` のコールバックで `removedNodes.length > 0` を検知したら「シーク発生」と判定し、`revealedTexts.clear()` を呼ぶ
- 巻き戻し後は `revealedTexts` が空になるため、同じテキストのコメントが再びフィルタ対象になる

### 教訓

- YouTubeはextensionによるテキスト変更を検知して要素を再生成することがある。DOM操作の結果が「元に戻る」場合はこの挙動を疑う
- 展開済みテキストを記録するSetは、シーク（DOMの大規模再構築）のタイミングでリセットする必要がある

---

## #006 表示方式（プレースホルダー/完全非表示）の切り替えが不安定・フラッシュが発生する

**日付:** 2026-04-10

### 起きたこと

- ポップアップUIで表示方式を切り替えると、フィルタ済みコメントが一瞬だけ元のテキストで表示されてからプレースホルダー/非表示に切り替わる（フラッシュ）
- ポップアップを再度開くと設定が元に戻っている（切り替えが保存されない）
- 上記2つが同時に起きるパターンもある

### 原因

**原因1: 全復元→全再フィルタの2パスによるフラッシュ**

設定変更時に `reprocessAll()` を呼んでいた。この処理は「全フィルタ済み要素を `restoreMessageElement()` で復元 → 全メッセージを `processMessage()` で再フィルタ」の2パス構造になっており、復元と再フィルタの間の一瞬、元テキストがユーザーに見えてしまう。

**原因2: Content Script と ポップアップの storage.set 競合**

フィルタカウント（`filterCount`）のインクリメントは、Content Script が設定オブジェクト全体をストレージに書き戻す形で実装されていた（`{ ...currentSettings, filterCount: N }`）。ポップアップが `displayMode` を変更して書き込んだ直後に、Content Script の書き込みが後から到着すると、古い `displayMode` で上書きされる。

この競合はさらに `chrome.storage.onChanged` を通じて Content Script 自身にも伝わり、「`displayMode` が変わった」という誤検知で `switchDisplayMode()` が逆方向に呼ばれるという二重の問題を引き起こしていた。

### 解決策

**原因1への対応: `switchDisplayMode()` 関数の追加**

`displayMode` のみの変更時は `reprocessAll()` を使わず、フィルタ済み要素の表示方式を直接書き換える専用関数 `switchDisplayMode()` を実装。

- `placeholder → hidden`: テキストを元に戻してから行コンテナを `display:none` にする（元テキストが見える瞬間はない）
- `hidden → placeholder`: プレースホルダーテキストを書き込んでから行コンテナの `display:none` を解除する（元テキストが見える瞬間はない）

`chrome.storage.onChanged` で変更内容を比較し、`displayMode` のみが変わった場合は `switchDisplayMode()` を、それ以外（`filterMode`・`progress`・`enabled`・`gameId` の変更）は `reprocessAll()` を使うよう分岐した。

**原因2への対応: `filterCount` を独立したストレージキーに分離**

`filterCount` 専用のキー `spoilershield_filter_count` を新設し、書き込み主体をキーごとに完全分離した。

| キー | 書き込み主体 | 内容 |
|---|---|---|
| `spoilershield_settings` | ポップアップのみ | displayMode, filterMode, gameId, enabled, progress |
| `spoilershield_filter_count` | Content Script のみ | フィルタカウント |

これにより2つの書き込みが同じオブジェクトを奪い合う状況がなくなり、競合が根本から解消された。

### 教訓

- 複数の書き込み主体が同じストレージキーを更新する設計は、非同期タイミングによって互いの変更を上書きするリスクがある。書き込み主体をキーごとに1つに限定する
- `reprocessAll()` のような「全復元→全再フィルタ」パターンは視覚的なフラッシュを生む。表示属性だけ変えるケースには差分更新の専用関数を用意する

---
