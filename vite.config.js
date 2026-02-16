import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// import vue from '@vitejs/plugin-vue' // Esto no lo usas si usas React, mejor dejarlo comentado o borrarlo
import path from 'path';
import legacy from '@vitejs/plugin-legacy'; // Necesitas importar esto si vas a usar legacy, aunque ahora lo desactivaremos

export default defineConfig({
  // CRÍTICO PARA ELECTRON: Rutas relativas
  base: './', 

  plugins: [
    react(),
    
    // --- SECCIÓN COMENTADA PARA ARREGLAR EL ERROR ---
    // El plugin legacy causa que la app se abra 2 veces en Electron
    // y bloquee la base de datos con errores 500.
    // Al comentarlo, la app solo se abre una vez y funciona bien.
    /*
    legacy({
      targets: ['chrome >= 64', 'edge >= 79', 'safari >= 11', 'android >= 5'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      renderLegacyChunks: true,
      polyfills: true,
    }),
    */
    // -----------------------------------------------
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    target: 'esnext', // Recomiendo 'esnext' para Electron, pero 'es2015' funcionará si prefieres no tocarlo.
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 2000, 
    sourcemap: false
  }
});