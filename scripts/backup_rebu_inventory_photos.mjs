import { createClient } from '@supabase/supabase-js';
import { parse } from 'dotenv';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// This helper only reads Supabase. It never uploads, updates, or deletes.
const root = process.cwd();
let env = {};
for (const name of ['.env', '.env.local']) {
  try { env = { ...env, ...parse(await readFile(path.join(root, name))) }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const url = String(env.VITE_SUPABASE_URL || '').trim();
const key = String(env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
if (!url || !key) throw new Error('Falta la configuración local de Supabase.');
const production = path.join(root, 'output/rebu-image-production-2026-09-28');
const selection = JSON.parse(await readFile(path.join(production, 'stock-filtered-selection.json'), 'utf8'));
const reference = [...selection.pending_targets, ...selection.completed_targets]
  .find((item) => item.current_image?.includes('.supabase.co/'));
if (!reference || new URL(reference.current_image).hostname !== new URL(url).hostname) {
  throw new Error('El proyecto Supabase no coincide con la selección de Rebu.');
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(60000) }) },
});
const products = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('products')
    .select('id,title,stock,is_active,image,image_thumb,updated_at')
    .order('id').range(from, from + 999);
  if (error) throw new Error(`No se pudo leer products: ${error.code || ''} ${error.message}`);
  products.push(...data);
  if (data.length < 1000) break;
}
const summary = {
  product_count: products.length,
  in_stock_active: products.filter((p) => p.is_active !== false && Number(p.stock) > 0).length,
  originals: products.filter((p) => p.image).length,
  thumbnails: products.filter((p) => p.image_thumb && p.image_thumb !== p.image).length,
  distinct_image_urls: new Set(products.flatMap((p) => [p.image, p.image_thumb]).filter(Boolean)).size,
};
console.log(JSON.stringify({ direct_supabase_access: 'verified', ...summary }));
if ((process.argv[2] || 'probe') !== 'backup') process.exit(0);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.resolve(process.argv[3] || path.join(production, `inventory-photo-backup-${stamp}`));
const imageRoot = path.join(backupRoot, 'images');
await mkdir(imageRoot, { recursive: true });
await writeFile(path.join(backupRoot, 'product-image-snapshot.json'), JSON.stringify({
  captured_at: new Date().toISOString(), project: new URL(url).hostname,
  summary, products,
}, null, 2));
console.log(`BACKUP_DIRECTORY ${backupRoot}`);

const assets = [...new Set(products.flatMap((p) => [p.image, p.image_thumb]).filter(Boolean))]
  .map((source) => ({ source, status: 'pending' }));
let cursor = 0;
let finished = 0;
const safeError = (error) => String(error?.message || error).replace(/https?:\/\/\S+/g, '[URL]');
const saveManifest = () => writeFile(path.join(backupRoot, 'backup-manifest.json'), JSON.stringify({
  captured_at: new Date().toISOString(), scope: 'all current inventory image and thumbnail references',
  summary: { ...summary, saved: assets.filter((a) => a.status === 'saved').length,
    errors: assets.filter((a) => a.status === 'error').length,
    pending: assets.filter((a) => a.status === 'pending').length },
  assets,
}, null, 2));
await saveManifest();
const worker = async () => {
  while (cursor < assets.length) {
    const asset = assets[cursor++];
    try {
      const response = await fetch(asset.source, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = (response.headers.get('content-type') || '').split(';')[0];
      if (!type.startsWith('image/')) throw new Error(`Contenido no visual: ${type}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error('Archivo vacío.');
      const digest = createHash('sha256').update(bytes).digest('hex');
      const ext = ({ 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg',
        'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg' })[type] || 'image';
      asset.file = `images/${createHash('sha256').update(asset.source).digest('hex')}.${ext}`;
      await writeFile(path.join(backupRoot, asset.file), bytes);
      Object.assign(asset, { status: 'saved', bytes: bytes.length, sha256: digest, content_type: type });
    } catch (error) { Object.assign(asset, { status: 'error', error: safeError(error) }); }
    finished += 1;
    if (finished % 200 === 0 || finished === assets.length) {
      console.log(`BACKUP_PROGRESS ${finished}/${assets.length}`);
    }
  }
};
await Promise.all(Array.from({ length: 12 }, worker));
await saveManifest();
// Re-read saved bytes and verify every checksum before calling this a backup.
let verified = 0;
for (const asset of assets.filter((a) => a.status === 'saved')) {
  const bytes = await readFile(path.join(backupRoot, asset.file));
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
    throw new Error(`Fallo al verificar copia: ${asset.file}`);
  }
  verified += 1;
}
console.log(JSON.stringify({ backup_directory: backupRoot, verified,
  errors: assets.filter((a) => a.status === 'error').length,
  total_bytes: assets.reduce((n, a) => n + (a.bytes || 0), 0) }));
