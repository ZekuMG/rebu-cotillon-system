// vite.config.js
import { defineConfig } from "file:///H:/PERSONAL/Programaci%C3%B3n/Ramiro%20Proyecto/Punto%20de%20Venta%20Rebu%20-%20Release/node_modules/vite/dist/node/index.js";
import react from "file:///H:/PERSONAL/Programaci%C3%B3n/Ramiro%20Proyecto/Punto%20de%20Venta%20Rebu%20-%20Release/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
import legacy from "file:///H:/PERSONAL/Programaci%C3%B3n/Ramiro%20Proyecto/Punto%20de%20Venta%20Rebu%20-%20Release/node_modules/@vitejs/plugin-legacy/dist/index.mjs";
var __vite_injected_original_dirname = "H:\\PERSONAL\\Programaci\xF3n\\Ramiro Proyecto\\Punto de Venta Rebu - Release";
var vite_config_default = defineConfig({
  // CRÍTICO PARA ELECTRON: Rutas relativas
  base: "./",
  plugins: [
    react()
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
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  build: {
    target: "esnext",
    // Recomiendo 'esnext' para Electron, pero 'es2015' funcionará si prefieres no tocarlo.
    outDir: "dist",
    assetsDir: "assets",
    chunkSizeWarningLimit: 2e3,
    sourcemap: false
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJIOlxcXFxQRVJTT05BTFxcXFxQcm9ncmFtYWNpXHUwMEYzblxcXFxSYW1pcm8gUHJveWVjdG9cXFxcUHVudG8gZGUgVmVudGEgUmVidSAtIFJlbGVhc2VcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkg6XFxcXFBFUlNPTkFMXFxcXFByb2dyYW1hY2lcdTAwRjNuXFxcXFJhbWlybyBQcm95ZWN0b1xcXFxQdW50byBkZSBWZW50YSBSZWJ1IC0gUmVsZWFzZVxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vSDovUEVSU09OQUwvUHJvZ3JhbWFjaSVDMyVCM24vUmFtaXJvJTIwUHJveWVjdG8vUHVudG8lMjBkZSUyMFZlbnRhJTIwUmVidSUyMC0lMjBSZWxlYXNlL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuLy8gaW1wb3J0IHZ1ZSBmcm9tICdAdml0ZWpzL3BsdWdpbi12dWUnIC8vIEVzdG8gbm8gbG8gdXNhcyBzaSB1c2FzIFJlYWN0LCBtZWpvciBkZWphcmxvIGNvbWVudGFkbyBvIGJvcnJhcmxvXG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCBsZWdhY3kgZnJvbSAnQHZpdGVqcy9wbHVnaW4tbGVnYWN5JzsgLy8gTmVjZXNpdGFzIGltcG9ydGFyIGVzdG8gc2kgdmFzIGEgdXNhciBsZWdhY3ksIGF1bnF1ZSBhaG9yYSBsbyBkZXNhY3RpdmFyZW1vc1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICAvLyBDUlx1MDBDRFRJQ08gUEFSQSBFTEVDVFJPTjogUnV0YXMgcmVsYXRpdmFzXG4gIGJhc2U6ICcuLycsIFxuXG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIFxuICAgIC8vIC0tLSBTRUNDSVx1MDBEM04gQ09NRU5UQURBIFBBUkEgQVJSRUdMQVIgRUwgRVJST1IgLS0tXG4gICAgLy8gRWwgcGx1Z2luIGxlZ2FjeSBjYXVzYSBxdWUgbGEgYXBwIHNlIGFicmEgMiB2ZWNlcyBlbiBFbGVjdHJvblxuICAgIC8vIHkgYmxvcXVlZSBsYSBiYXNlIGRlIGRhdG9zIGNvbiBlcnJvcmVzIDUwMC5cbiAgICAvLyBBbCBjb21lbnRhcmxvLCBsYSBhcHAgc29sbyBzZSBhYnJlIHVuYSB2ZXogeSBmdW5jaW9uYSBiaWVuLlxuICAgIC8qXG4gICAgbGVnYWN5KHtcbiAgICAgIHRhcmdldHM6IFsnY2hyb21lID49IDY0JywgJ2VkZ2UgPj0gNzknLCAnc2FmYXJpID49IDExJywgJ2FuZHJvaWQgPj0gNSddLFxuICAgICAgYWRkaXRpb25hbExlZ2FjeVBvbHlmaWxsczogWydyZWdlbmVyYXRvci1ydW50aW1lL3J1bnRpbWUnXSxcbiAgICAgIHJlbmRlckxlZ2FjeUNodW5rczogdHJ1ZSxcbiAgICAgIHBvbHlmaWxsczogdHJ1ZSxcbiAgICB9KSxcbiAgICAqL1xuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIF0sXG5cbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICAnQCc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3NyYycpLFxuICAgIH0sXG4gIH0sXG5cbiAgYnVpbGQ6IHtcbiAgICB0YXJnZXQ6ICdlc25leHQnLCAvLyBSZWNvbWllbmRvICdlc25leHQnIHBhcmEgRWxlY3Ryb24sIHBlcm8gJ2VzMjAxNScgZnVuY2lvbmFyXHUwMEUxIHNpIHByZWZpZXJlcyBubyB0b2NhcmxvLlxuICAgIG91dERpcjogJ2Rpc3QnLFxuICAgIGFzc2V0c0RpcjogJ2Fzc2V0cycsXG4gICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiAyMDAwLCBcbiAgICBzb3VyY2VtYXA6IGZhbHNlXG4gIH1cbn0pOyJdLAogICJtYXBwaW5ncyI6ICI7QUFBK1osU0FBUyxvQkFBb0I7QUFDNWIsT0FBTyxXQUFXO0FBRWxCLE9BQU8sVUFBVTtBQUNqQixPQUFPLFlBQVk7QUFKbkIsSUFBTSxtQ0FBbUM7QUFNekMsSUFBTyxzQkFBUSxhQUFhO0FBQUE7QUFBQSxFQUUxQixNQUFNO0FBQUEsRUFFTixTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWVSO0FBQUEsRUFFQSxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsSUFDdEM7QUFBQSxFQUNGO0FBQUEsRUFFQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUE7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLFdBQVc7QUFBQSxJQUNYLHVCQUF1QjtBQUFBLElBQ3ZCLFdBQVc7QUFBQSxFQUNiO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
