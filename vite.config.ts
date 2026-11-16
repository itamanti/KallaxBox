import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    build: {
      target: ['es2020', 'chrome90', 'safari14'],
      cssTarget: ['chrome90', 'safari14'],
      assetsDir: '',
      rolldownOptions: {
        output: {
          codeSplitting: false,
          entryFileNames: 'kallaxbox-app.js',
          chunkFileNames: 'kallaxbox-chunk-[name].js',
          assetFileNames: (assetInfo: any) => {
            if (assetInfo?.name && assetInfo.name.endsWith('.css')) {
              return 'kallaxbox-app.css';
            }
            return '[name][extname]';
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
