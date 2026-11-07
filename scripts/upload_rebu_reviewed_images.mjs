import { createClient } from '@supabase/supabase-js';
import { parse } from 'dotenv';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const mode = process.argv[2] || 'preflight';
if (!['preflight', 'apply'].includes(mode)) throw new Error('Use preflight or apply.');
const root = process.cwd();
const planFile = path.resolve(process.argv[3]);
const plan = JSON.parse(await readFile(planFile, 'utf8'));
const allowed = new Set(process.argv.slice(4));
if (!allowed.size) throw new Error('Specify the visually reviewed product IDs.');
const targets = plan.products.filter((p) => allowed.has(String(p.id)));
if (targets.length !== allowed.size) throw new Error('IDs missing from reviewed upload plan.');
let env = {};
for (const name of ['.env', '.env.local']) {
  try { env = { ...env, ...parse(await readFile(path.join(root, name))) }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const url = String(env.VITE_SUPABASE_URL || '').trim();
const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !key) throw new Error('Falta la configuración autorizada de Supabase.');
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(60000) }) },
});
const backup = JSON.parse(await readFile(path.join(plan.backup_directory, 'backup-manifest.json'), 'utf8'));
const snapshot = JSON.parse(await readFile(path.join(plan.backup_directory, 'product-image-snapshot.json'), 'utf8'));
if (snapshot.project !== new URL(url).hostname) throw new Error('Supabase project mismatch.');
const backupByUrl = new Map(backup.assets.map((a) => [a.source, a]));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const { data: bucket, error: bucketError } = await supabase.storage.getBucket('product-images');
if (bucketError) throw new Error(`No se pudo consultar Storage: ${bucketError.message}`);
const ledgerDirectory = path.resolve(plan.ledger_directory || path.join(path.dirname(planFile), 'upload-ledger'));
await mkdir(ledgerDirectory, { recursive: true });
for (const target of targets) {
  const originalBytes = await readFile(target.file);
  const imageExtension = path.extname(target.file).slice(1).toLowerCase();
  const imageContentType = imageExtension === 'png' ? 'image/png' : imageExtension === 'webp' ? 'image/webp' : null;
  if (!imageContentType) throw new Error(`${target.id}: formato de carga no admitido.`);
  const thumbBytes = await readFile(target.thumb_file);
  if (digest(originalBytes) !== target.sha256 || digest(thumbBytes) !== target.thumb_sha256) {
    throw new Error(`${target.id}: los archivos cambiaron desde la revisión.`);
  }
  for (const oldUrl of new Set([target.before.image, target.before.image_thumb].filter(Boolean))) {
    const copy = backupByUrl.get(oldUrl);
    if (copy?.status !== 'saved') throw new Error(`${target.id}: falta respaldar una foto anterior.`);
    if (digest(await readFile(path.join(plan.backup_directory, copy.file))) !== copy.sha256) {
      throw new Error(`${target.id}: el respaldo no pasó la verificación.`);
    }
    const oldResponse = await fetch(oldUrl, { signal: AbortSignal.timeout(60000) });
    if (!oldResponse.ok || digest(Buffer.from(await oldResponse.arrayBuffer())) !== copy.sha256) {
      throw new Error(`${target.id}: la foto original actual no coincide por hash con el respaldo.`);
    }
  }
  const { data: current, error } = await supabase.from('products')
    .select('id,title,stock,is_active,image,image_thumb,updated_at').eq('id', target.id).single();
  if (error) throw new Error(`${target.id}: no se pudo releer el producto.`);
  if (current.is_active === false || Number(current.stock) <= 0) throw new Error(`${target.id}: fuera de stock o inactivo.`);
  if (current.title !== target.title || current.image !== target.before.image || current.image_thumb !== target.before.image_thumb) {
    throw new Error(`${target.id}: cambió el producto o su foto; requiere nueva revisión y respaldo.`);
  }
  if (bucket.allowed_mime_types && !(
    bucket.allowed_mime_types.includes(imageContentType) || bucket.allowed_mime_types.includes('image/*')
  ) || bucket.allowed_mime_types && !(
    bucket.allowed_mime_types.includes('image/webp') || bucket.allowed_mime_types.includes('image/*')
  )) {
    throw new Error(`El bucket no acepta ${imageContentType} y WebP.`);
  }
  if (bucket.file_size_limit && Math.max(originalBytes.length, thumbBytes.length) > bucket.file_size_limit) {
    throw new Error(`${target.id}: excede el límite del bucket.`);
  }
  if (mode === 'preflight') {
    console.log(JSON.stringify({ id: target.id, ready: true, stock: current.stock, original_backed_up: true }));
    continue;
  }
  const ledgerPath = path.join(ledgerDirectory, `${target.id}.json`);
  // Unique content-addressed paths; old files are never overwritten or removed.
  const base = `products/rebu-cleanup-2026-10-06/${target.id}-${target.sha256.slice(0,16)}`;
  const imagePath = `${base}.${imageExtension}`;
  const thumbPath = `${base}-thumb-${target.thumb_sha256.slice(0,8)}.webp`;
  const imageUrl = supabase.storage.from('product-images').getPublicUrl(imagePath).data.publicUrl;
  const thumbUrl = supabase.storage.from('product-images').getPublicUrl(thumbPath).data.publicUrl;
  const ledger = { id: target.id, title: target.title, started_at: new Date().toISOString(),
    status: 'prepared', backup_directory: plan.backup_directory, before: current,
    after: { image: imageUrl, image_thumb: thumbUrl },
    source_sha256: target.sha256, thumbnail_sha256: target.thumb_sha256,
    visual_approval: target.approval, old_storage_files_preserved: true };
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
  try {
    for (const [storagePath, bytes, contentType, publicUrl] of [
      [imagePath, originalBytes, imageContentType, imageUrl], [thumbPath, thumbBytes, 'image/webp', thumbUrl],
    ]) {
      const { error: uploadError } = await supabase.storage.from('product-images')
        .upload(storagePath, bytes, { contentType, upsert: false, cacheControl: '31536000' });
      if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
        throw new Error(`Falló la subida: ${uploadError.message}`);
      }
      const response = await fetch(publicUrl, { signal: AbortSignal.timeout(60000) });
      if (!response.ok || digest(Buffer.from(await response.arrayBuffer())) !== digest(bytes)) {
        throw new Error('La imagen subida no pasó la verificación.');
      }
    }
    ledger.status = 'storage_verified';
    await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
    let update = supabase.from('products').update({ image: imageUrl, image_thumb: thumbUrl })
      .eq('id', target.id).eq('title', current.title).gt('stock', 0)
      .or('is_active.eq.true,is_active.is.null');
    for (const field of ['image', 'image_thumb', 'updated_at']) {
      update = current[field] == null ? update.is(field, null) : update.eq(field, current[field]);
    }
    const { data: changed, error: updateError } = await update
      .select('id,title,stock,is_active,image,image_thumb,updated_at');
    if (updateError) throw new Error(`Falló la asociación al producto: ${updateError.message}`);
    if (changed.length !== 1) throw new Error('El producto cambió durante la carga; se dejó sin actualizar.');
    const { data: confirmed, error: confirmError } = await supabase.from('products')
      .select('id,title,stock,is_active,image,image_thumb,updated_at').eq('id', target.id).single();
    if (confirmError || confirmed.image !== imageUrl || confirmed.image_thumb !== thumbUrl) {
      throw new Error('La actualización requiere verificación posterior.');
    }
    ledger.status = 'applied_verified';
    ledger.verified_at = new Date().toISOString();
    ledger.after = confirmed;
    console.log(JSON.stringify({ id: target.id, status: ledger.status, previous_photos_preserved: true }));
  } catch (error) {
    ledger.error = String(error.message).replace(/https?:\/\/\S+/g, '[URL]');
    await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
    throw new Error(`${target.id}: ${ledger.error}`);
  }
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
}
