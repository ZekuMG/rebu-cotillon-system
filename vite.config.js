import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import path from 'path';

export default defineConfig({
  base: './', // Tu configuración para rutas relativas (Electron/Hostings simples)
  
  plugins: [
    react(),
    // Plugin Legacy: Esto traduce el código moderno para que Android viejo lo entienda
    legacy({
      targets: ['defaults', 'not IE 11', 'Android >= 5'],
      polyfills: true,
      modernPolyfills: true,
    }),
  ],
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // Permite importar usando @/components
    },
  },
  
  build: {
    // Define objetivos específicos para asegurar compatibilidad
    target: ['es2015', 'chrome64', 'safari11'],
    chunkSizeWarningLimit: 2000, // Evita alertas de tamaño en consola
    sourcemap: false
  }
});