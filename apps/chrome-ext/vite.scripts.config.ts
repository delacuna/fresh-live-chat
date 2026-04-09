import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * コンテンツスクリプト + バックグラウンド Service Worker のビルド設定
 *
 * format: 'es' を使用するが、各エントリポイントはトップレベル export を持たないため
 * Rollup は export 文を出力しない → Chrome の content_scripts として正常にロードできる。
 * すべての import は Rollup によってインライン化される（外部 import 文は残らない）。
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.ts'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        // 共有チャンクを作らず、各エントリに全てインライン化する
        inlineDynamicImports: false,
      },
    },
  },
  resolve: {
    alias: [
      {
        find: '@spoilershield/shared',
        replacement: resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
      {
        find: '@spoilershield/knowledge-base',
        replacement: resolve(__dirname, '../../packages/knowledge-base/src/index.ts'),
      },
      {
        find: '@kb-data',
        replacement: resolve(__dirname, '../../packages/knowledge-base/data'),
      },
    ],
  },
});
