# Changelog

All notable changes to Fresh Chat Keeper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-04-29

### Changed (Internal Refactoring)

- **判定エンジンの分離**: Stage 1 / Stage 2 のフィルタロジックを `@fresh-chat-keeper/judgment-engine` パッケージに分離。DOM / `chrome.*` 非依存の純粋ロジックとして再構築し、Chrome 拡張・Cloudflare Workers の両方で再利用可能に
- **proxy のバッチ判定 + プロンプトキャッシング対応**: 1 リクエストで全メッセージを Anthropic API に送る形に変更（旧: 5 並列の単一メッセージ送信）。システムプロンプトに `cache_control: ephemeral` を付与し、API コストを大幅削減
- **proxy の新形式リクエスト対応**: `context` オブジェクト + `tier` フィールドの新形式を受け付け。**v0.2.0 拡張からの旧形式リクエストは引き続きサポート**（後方互換）
- **設定スキーマ v2 マイグレーション**: 既存設定に `version: 2` を付与、旧データを `fck_settings_v1_backup` キーにバックアップ。`progressByGame` / `customNgWords` 等のユーザーデータは完全保持
- **旧 `flc_*` プレフィックスキーの自動クリーンアップ**: 拡張機能名リネーム（"Fresh Live Chat" → "Fresh Chat Keeper"）以前のキーが残っているユーザーで、起動時に自動削除

### Fixed

- 進行状況・フィルタ強度を変更したとき、ユーザーがクリックして展開済みのコメントが新基準で再フィルタされない bug を修正
- 設定保存時に `version: 2` フィールドが剥がれてマイグレーションが繰り返し実行される bug を修正
- 複数ジャンルテンプレートを選択した状態で、新エンジン経由では最初の 1 つしか proxy に送られない bug を修正
- proxy のリクエストサイズを 20 メッセージで上限化し、トークン予算超過 / DOS を防止
- chrome-ext 起動時の Promise 連鎖に `.catch()` ハンドラを追加（`chrome.storage` 失敗時のサイレント停止を防止）

### Internal

- `filter-orchestrator.ts` から dead な `verdictFromCache` import を削除

### Behavior Changes for Users

- **なし**（内部リファクタリング。フィルタの精度・UI・操作はすべて v0.2.0 と同等）

## [0.2.0] - 2026-04 (rename release)

- 拡張機能名を "Fresh Live Chat" から "Fresh Chat Keeper" に変更
- ストレージキー / DOM 属性のプレフィックスを `flc_` / `data-flc-` から `fck_` / `data-fck-` に統一
- proxy URL を `fresh-live-chat-proxy.playnicelab.workers.dev` から `fresh-chat-keeper-proxy.playnicelab.workers.dev` に変更
- Chrome Web Store 公開（再審査）

## [0.1.0] - 2026-04 (initial release)

- 初回リリース（旧名 "Fresh Live Chat"）
- 2 段階フィルタ（Stage 1 キーワードマッチ + Stage 2 Claude AI 判定）
- アーカイブモード + ライブモード対応
- カスタム NG ワード / ジャンルテンプレート / 進行状況連動フィルタ
- 動画タイトルからのゲーム自動推測
- 表示方式選択（プレースホルダー / 完全非表示）
- 3 段階フィルタ強度（厳格 / 標準 / 緩め）
