import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ mode }) => ({
  root,
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react(), {
    name: 'rebu-stock-offline-shell',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https: wss:; img-src 'self' https: data:; media-src 'self' blob:; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
      }, injectTo: 'head-prepend' }];
    },
    writeBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter((name) => name.startsWith('assets/'));
      const hash = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 12);
      const source = readFileSync(`${root}/public/sw.js`, 'utf8')
        .replace("'rebu-stock-shell-v1'", JSON.stringify(`rebu-stock-shell-${hash}`))
        .replace("['./', './manifest.webmanifest', './icon-192.png', './icon-512.png']", JSON.stringify(['./', './manifest.webmanifest', './icon-192.png', './icon-512.png', ...assets.map((name) => `./${name}`)]));
      writeFileSync(`${root}/dist/sw.js`, source);
    },
  }],
  base: './',
  css: { postcss: { plugins: [] } },
  server: { host: '127.0.0.1', port: 5176, strictPort: true },
  preview: { host: '127.0.0.1', port: 4176, strictPort: true },
  build: { outDir: 'dist', target: 'es2020' },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(loadEnv(mode, process.cwd()).VITE_SUPABASE_URL || ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(loadEnv(mode, process.cwd()).VITE_SUPABASE_ANON_KEY || ''),
  },
}));
