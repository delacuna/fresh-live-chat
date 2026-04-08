# CLAUDE.md — SpoilerShield Project Context

## プロジェクト概要

SpoilerShieldは、ゲーム配信の視聴者・配信者向けのネタバレフィルタリングサービスです。
ゲームの進行状況に連動し、チャット欄のネタバレメッセージを検出・非表示にします。

**2つのモード:**
- **アーカイブモード（MVP）**: YouTubeアーカイブ配信のチャットリプレイからネタバレコメントをフィルタ
- **ライブモード（Phase 3）**: ライブ配信中のチャットからネタバレをリアルタイムでフィルタ

## 重要な設計原則

1. **アーカイブモード優先**: リアルタイム制約がなく実装・テストしやすいアーカイブモードから開発
2. **2段階フィルタ**: Stage 1（キーワード/ベクトル類似度、<10ms）→ Stage 2（LLM判定、<200ms）
3. **2つの進行管理モデル**: チャプターベース（長編RPG等）とイベントベース（短編・インディーズ等）の両対応
4. **安全側に倒す**: 判定が曖昧な場合はブロック側に倒す（見逃しより誤検出の方がまし）
5. **シャドウミュート**: フィルタされたことを投稿者に通知しない
6. **ローカルキャッシュ活用**: 同じ動画の再視聴時はAPI呼び出しなしで即座にフィルタ
7. **テキスト書き換え方式**: コメントの非表示は display:none ではなくテキスト内容を書き換える（Flow Chat等の他拡張との互換性のため）

## Phase -1 で得られた知見（実装時の必須知識）

- チャットリプレイはiframe内にある → manifest.jsonに `"all_frames": true` が必須
- `#items` 要素は遅延初期化される → MutationObserverで出現を検知する（setTimeoutポーリングはNG）
- display:none だけではFlow Chat for YouTube Live（約10万ユーザー）等の弾幕拡張に効かない → テキスト書き換え方式を採用
- 元テキストは data-spoilershield-original 属性に退避し、復元可能にする
- 詳細は TROUBLESHOOTING.md を参照

## 技術スタック

- **言語**: TypeScript（全レイヤー共通）
- **バックエンド**: Node.js + Hono or Fastify
- **データベース**: PostgreSQL（知識ベース・設定）+ Redis（キャッシュ）
- **フロントエンド**: React + TypeScript
- **配信プラットフォーム**: Chrome Extension for YouTube（MVP）、Twitch Extension（将来）
- **LLM**: Anthropic Claude Haiku（Stage 2 判定）
- **ビルド**: Turborepo monorepo

## モノレポ構成

```
apps/proxy/        — 軽量APIプロキシ（MVP — Cloudflare Workers、APIキー管理・レート制限）
apps/api/          — 本格バックエンドAPI（Phase 3以降）
apps/chrome-ext/   — Chrome Extension（アーカイブ + ライブ チャットフィルタ）
  src/content/archive.ts  — アーカイブモード（MutationObserverでチャットリプレイ監視）
  src/content/live.ts     — ライブモード（将来）
  src/content/chat-dom.ts — YouTube チャットDOM操作の共通ロジック
  src/content/mode-detector.ts — URL判定でアーカイブ/ライブ自動切替
  src/popup/              — ポップアップUI
packages/shared/   — 共有型定義・ユーティリティ
packages/knowledge-base/ — ゲームごとのネタバレデータ（JSON）
tools/kb-generator/ — 知識ベース半自動生成ツール（将来）
```

## セキュリティ方針

- ユーザーアカウント登録は不要（インストールするだけで使える）
- Anthropic APIキーはChrome拡張に含めず、軽量プロキシで安全に管理
- 匿名トークン（UUID）+ レート制限 + 月間利用上限の3層で保護
- チャットメッセージはサーバーにログ保存しない（プライバシー重視）

## 既知の制約

- OBSのチャットドックはChrome拡張の影響を受けない（OBS内蔵ブラウザは別プロセス）
- アーカイブモードでの進行状況はMVPでは視聴者が手動設定（将来的にタイムスタンプ連動を検討）
- 配信者と視聴者はそれぞれ個別にインストールが必要（ブラウザローカル動作のため）

## UX設計方針

- **シャドウミュート**: フィルタされたことを投稿者に通知しない
- **3段階モード**: 厳格（ヒント+ネタバレ遮断）/ 標準（ネタバレのみ遮断）/ オフ
- **即座切替**: ポップアップUIのトグル + キーボードショートカット（Alt+S）
- **低負荷**: 全処理で~10MB以下、CPU影響は無視できるレベル

## 知識ベースのストレージ戦略

- MVP（~5本）: JSONファイルをAPIサーバーがメモリにロード（DB不要）
- 中期（~30本）: PostgreSQLに移行、JSONはシードデータに
- 長期（100本超）: DB唯一のマスター、管理UIから直接投入
- `apps/api/src/services/knowledge/base.ts` に抽象化層を設け、ストレージ切替を容易にする

## コーディング規約

- Strict TypeScript（noImplicitAny, strictNullChecks）
- ESM（import/export）
- エラーハンドリングは Result型 パターンを推奨
- テストは vitest を使用
- 日本語コメント可、変数名・関数名は英語

## 開発の優先順位

Phase -1（最初にやること — 1-2日）:
1. Chrome拡張の最小構成（manifest.json + content.js の2ファイルのみ）
2. YouTubeアーカイブのチャットリプレイDOM構造を調査
3. MutationObserverでコメントをコンソール出力
4. ハードコードしたキーワードで特定コメントを非表示にする

Phase 0（Phase -1 成功後）:
1. モノレポ構成に移行、TypeScript化
2. packages/shared — 型定義（Game, Chapter, Event, SpoilerEntity, ChatMessage, FilterResult）
3. packages/knowledge-base — チャプター型1本 + イベント型1本のゲームデータ
4. Stage 1 フィルタ（キーワードマッチ、ブラウザ内で完結）
5. apps/proxy — 軽量APIプロキシ（Cloudflare Workers、Anthropic APIキー管理）

**重要: 本格バックエンドは立てないが、APIキー保護のための軽量プロキシは必要。**

## 将来構想

- カスタムフィルタ: ネタバレ以外（暴言、誹謗中傷、無関係な配信者言及等）もフィルタ可能に
- LLMのマルチラベル分類で一回のAPI呼び出しで複数カテゴリを同時判定
- ゲーム知識ベース不要なカテゴリは単独で機能 → ユーザーベース拡大の可能性

## 参照ドキュメント

- PROJECT_PLAN.md — 詳細な設計とロードマップ
- docs/ — 追加ドキュメント（随時作成）
