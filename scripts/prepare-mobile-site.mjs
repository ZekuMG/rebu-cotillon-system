// Creates a dedicated source checkout containing only the mobile application.
// Database credentials, desktop source and local .env files are never copied.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';

const root = resolve('.');
const staging = resolve('output/rebu-stock-site');
const destination = existsSync(resolve(staging, '.sites-checkout/.git')) ? resolve(staging, '.sites-checkout') : staging;
mkdirSync(destination, { recursive: true });
// Avoid fs.cpSync's native fast-copy crash on Windows network/mapped drives.
function copy(source, target) {
  if (statSync(source).isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source)) copy(resolve(source, entry), resolve(target, entry));
  } else writeFileSync(target, readFileSync(source));
}
for (const name of ['src', 'public', '.openai', 'index.html', 'vite.config.js']) {
  copy(resolve('mobile', name), resolve(destination, name));
}
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const version = (name) => lock.packages[`node_modules/${name}`].version;
const dependencies = Object.fromEntries(['@supabase/supabase-js', '@zxing/browser', 'lucide-react', 'react', 'react-dom'].map((name) => [name, version(name)]));
const devDependencies = Object.fromEntries(['vite', '@vitejs/plugin-react'].map((name) => [name, version(name)]));
writeFileSync(resolve(destination, 'package.json'), JSON.stringify({ name: 'rebu-stock-mobile', private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' }, dependencies, devDependencies }, null, 2));
writeFileSync(resolve(destination, '.gitignore'), 'node_modules/\ndist/\n.env\n.env.*\n');
writeFileSync(resolve(destination, 'README.md'), '# Rebu Stock móvil\n\nMobile application source, maintained in the Rebu POS repository under mobile/.\n\nBuild with npm install and npm run build. Supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY through the build environment. Requires the Rebu mobile database migration. No privileged credentials belong in this project.\n');
const env = parse(readFileSync('.env'));
const key = env.VITE_SUPABASE_ANON_KEY;
const role = key?.startsWith('sb_publishable_') ? 'publishable' : JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role;
if (!['anon', 'publishable'].includes(role)) throw new Error('Refusing to bundle a privileged Supabase key.');
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', resolve(destination, 'vite.config.js')], {
  cwd: destination,
  env: { ...process.env, VITE_SUPABASE_URL: env.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: key },
  encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) { console.error(`Mobile publication build exited with status ${result.status}, signal ${result.signal}.`); process.exit(result.status || 1); }
console.log(JSON.stringify({ source_directory: destination, output_directory: resolve(destination, 'dist') }));
