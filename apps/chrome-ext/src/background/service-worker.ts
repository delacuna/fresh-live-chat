/**
 * バックグラウンド Service Worker（Manifest V3）
 *
 * MVP ではコンテンツスクリプトが全てブラウザ内で完結するため、
 * Service Worker の役割は最小限。
 * Phase 3 以降で proxy への通信・キャッシュ管理等に活用する。
 */

chrome.runtime.onInstalled.addListener((_details) => {
  // Phase 3 で初期化処理を追加予定
});
