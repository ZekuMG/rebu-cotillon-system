import { createClient } from '@supabase/supabase-js';
import { parse } from 'dotenv';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Read-only, per-product backup for an inventory row that changed after the
// original all-inventory snapshot. Never reuses a prior row snapshot.
const id = Number(process.argv[2]);
const destination = process.argv[3] && path.resolve(process.argv[3]);
if (!Number.isSafeInteger(id) || id <= 0 || !destination) {
  throw new Error('Use: node scripts/backup_rebu_product_photos.mjs ID NEW_BACKUP_DIRECTORY');
}
const root = process.cwd();
let env = {};
for (const name of ['.env', '.env.local']) {
  try { env = { ...env, ...parse(await readFile(path.join(root, name))) }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const url = String(env.VITE_SUPABASE_URL || '').trim();
const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !key) throw new Error('Falta configuración de Supabase.');
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const readRow = async () => {
  const { data, error } = await client.from('products')
    .select('id,title,stock,is_active,image,image_thumb,updated_at').eq('id', id).single();
  if (error) throw new Error(`No se pudo leer ${id}: ${error.message}`);
  return data;
};
const row = await readRow();
if (row.is_active === false || Number(row.stock) <= 0) throw new Error(`${id}: sin stock o inactivo.`);
const project = new URL(url).hostname;
const sources = [...new Set([row.image, row.image_thumb].filter(Boolean))];
if (!sources.length || sources.some((source) => new URL(source).hostname !== project)) {
  throw new Error(`${id}: fotos ausentes o de otro proyecto.`);
}
const assets = [];
const saved = [];
for (const [index, source] of sources.entries()) {
  const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${id}: descarga falló con HTTP ${response.status}.`);
  const type = (response.headers.get('content-type') || '').split(';')[0];
  if (!type.startsWith('image/')) throw new Error(`${id}: respuesta no visual.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error(`${id}: imagen vacía.`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const ext = ({ 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/avif': 'avif' })[type] || 'image';
  const file = `images/${id}-${index}-${sha256.slice(0, 16)}.${ext}`;
  saved.push({ file, bytes, sha256 });
  assets.push({ source, status: 'saved', file, sha256, bytes: bytes.length, content_type: type });
}
const rechecked = await readRow();
if (JSON.stringify(rechecked) !== JSON.stringify(row)) throw new Error(`${id}: la fila cambió durante el respaldo.`);
await mkdir(destination, { recursive: false });
await mkdir(path.join(destination, 'images'));
for (const asset of saved) {
  const file = path.join(destination, asset.file);
  await writeFile(file, asset.bytes, { flag: 'wx' });
  if (createHash('sha256').update(await readFile(file)).digest('hex') !== asset.sha256) {
    throw new Error(`${id}: el respaldo no pasó verificación de lectura.`);
  }
}
const summary = { product_count: 1, in_stock_active: 1, originals: row.image ? 1 : 0,
  thumbnails: row.image_thumb && row.image_thumb !== row.image ? 1 : 0,
  distinct_image_urls: sources.length, saved: assets.length, errors: 0, pending: 0 };
await writeFile(path.join(destination, 'product-image-snapshot.json'), JSON.stringify({
  captured_at: new Date().toISOString(), project, summary, products: [row],
}, null, 2), { flag: 'wx' });
await writeFile(path.join(destination, 'backup-manifest.json'), JSON.stringify({
  captured_at: new Date().toISOString(), scope: `current image and thumbnail for product ${id}`,
  summary, assets,
}, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ id, backup_directory: destination, updated_at: row.updated_at,
  originals_and_thumbnails_backed_up: assets.length }));
