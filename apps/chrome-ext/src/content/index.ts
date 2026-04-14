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
    startArchiveMode('archive');
    break;
  case 'live':
    startArchiveMode('live');
    break;
  case 'none':
    // /watch 等のトップページでは何もしない
    break;
}
