import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import path from 'path';

export default defineConfig({
  // CRÍTICO PARA ELECTRON: Rutas relativas
  base: './', 

  plugins: [
    react(),
    // Plugin Legacy para compatibilidad con Windows 7/8 y Tablets viejas
    legacy({
      targets: ['chrome >= 64', 'edge >= 79', 'safari >= 11', 'android >= 5'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      renderLegacyChunks: true,
      polyfills: true,
    }),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    target: 'es2015',
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 2000, 
    sourcemap: false
  }
});