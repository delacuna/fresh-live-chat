/**
 * コンテンツスクリプト エントリポイント
 *
 * all_frames: true のため、YouTube の全フレーム（トップページ + iframe）で実行される。
 * detectMode() で現在のフレームの役割を判定し、適切なモードを起動する。
 */

import { detectMode } from './mode-detector.js';
import { startArchiveMode } from './archive.js';
import { loadSettings, saveSettings, STORAGE_KEY, type Settings } from '../shared/settings.js';

const mode = detectMode();

switch (mode) {
  case 'archive':
    startArchiveMode();
    registerShortcut();
    break;
  case 'live':
    // Phase 3 で実装予定
    registerShortcut();
    break;
  case 'none':
    // /watch 等のトップページでは何もしない
    break;
}

/**
 * Alt+S でフィルタの ON/OFF を切り替えるキーボードショートカット。
 * ポップアップの Toggle と同一の chrome.storage.local を更新するため、
 * 変更は Content Script とポップアップ双方にリアルタイム反映される。
 */
function registerShortcut(): void {
  document.addEventListener('keydown', async (e: KeyboardEvent) => {
    if (!e.altKey || e.key !== 's') return;
    e.preventDefault();

    const settings = await loadSettings();
    const next: Settings = { ...settings, enabled: !settings.enabled };
    await saveSettings(next);
  });
}
