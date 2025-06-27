import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.tflite'], // Include .tflite files as assets
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  },
  build: {
    target: 'esnext' //browsers can handle the latest ES features
  }
});