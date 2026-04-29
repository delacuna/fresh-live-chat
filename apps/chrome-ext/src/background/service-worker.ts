/**
 * バックグラウンド Service Worker（Manifest V3）
 *
 * 役割:
 * - 拡張インストール / 起動時のワンショット処理（旧名時代の orphan キー削除等）
 * - Phase 3 以降で proxy への通信中継・キャッシュ管理等に活用予定
 *
 * 注: content script や popup から呼ぶと多重実行になるため、起動系の処理は
 * すべて service worker 側で完結させる。
 */

import { cleanupLegacyPrefixKeys } from '../shared/settings-loader.js';

chrome.runtime.onInstalled.addListener(() => {
  // 旧名拡張時代の `flc_*` プレフィックスキーを削除（存在しなければ no-op）
  void cleanupLegacyPrefixKeys();
});

chrome.runtime.onStartup.addListener(() => {
  // ブラウザ再起動時にも実行（onInstalled は更新時のみ）
  void cleanupLegacyPrefixKeys();
});
