/**
 * コンテンツスクリプト エントリポイント
 *
 * all_frames: true のため、YouTube の全フレーム（トップページ + iframe）で実行される。
 * detectMode() で現在のフレームの役割を判定し、適切なモードを起動する。
 */

import { detectMode } from './mode-detector.js';
import { startArchiveMode } from './archive.js';

const mode = detectMode();

switch (mode) {
  case 'archive':
    startArchiveMode();
    break;
  case 'live':
    // Phase 3 で実装予定
    console.log('[SpoilerShield] ライブモード（未実装）');
    break;
  case 'none':
    // /watch 等のトップページでは何もしない
    break;
}
