/**
 * バックグラウンド Service Worker（Manifest V3）
 *
 * MVP ではコンテンツスクリプトが全てブラウザ内で完結するため、
 * Service Worker の役割は最小限。
 * Phase 3 以降で proxy への通信・キャッシュ管理等に活用する。
 */

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[SpoilerShield] インストール完了:', details.reason);
});
