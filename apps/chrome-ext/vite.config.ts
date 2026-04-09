import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';
import type { Plugin } from 'vite';

/**
 * manifest.json をルートから dist/ にコピーするプラグイン
 */
function copyManifest(): Plugin {
  return {
    name: 'copy-manifest',
    closeBundle() {
      mkdirSync(resolve(__dirname, 'dist'), { recursive: true });
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(__dirname, 'dist/manifest.json'),
      );
    },
  };
}

// ポップアップ用ビルド設定
export default defineConfig({
  plugins: [react(), copyManifest()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
      },
      output: {
        entryFileNames: 'popup/[name].js',
        chunkFileNames: 'popup/[name]-[hash].js',
        assetFileNames: 'popup/[name].[ext]',
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
