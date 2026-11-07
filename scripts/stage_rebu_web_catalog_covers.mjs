import { createClient } from '@supabase/supabase-js';
import { parse } from 'dotenv';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';

const mode = process.argv[2];
const planPath = path.resolve(process.argv[3] || '');
const allowed = new Set(process.argv.slice(4).map(String));
if (!['preflight', 'apply'].includes(mode) || !allowed.size) {
  throw new Error('Use preflight|apply plan.json <source IDs>.');
}
const plan = JSON.parse(await readFile(planPath, 'utf8'));
const targets = plan.products.filter((row) => allowed.has(String(row.source_id)));
if (targets.length !== allowed.size) throw new Error('Missing source ID in plan.');

let env = {};
for (const filename of ['.env', '.env.local']) {
  try { env = { ...env, ...parse(await readFile(filename)) }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing authorized Supabase configuration.');
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(60000) }) },
});
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ledgerDirectory = path.join(path.dirname(planPath), 'ledger');
const { data: bucket, error: bucketError } = await supabase.storage.getBucket('catalog-images');
if (bucketError || !bucket?.public || !bucket.allowed_mime_types?.includes('image/png')) {
  throw new Error('The public catalog-images bucket is unavailable or does not accept PNG.');
}

for (const target of targets) {
  const id = String(target.source_id);
  const ledgerPath = path.join(ledgerDirectory, `${id}.json`);
  try { await access(ledgerPath); throw new Error(`${id}: staging ledger already exists; inspect before retrying.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const bytes = await readFile(path.resolve(target.file));
  if (digest(bytes) !== target.sha256 || (bucket.file_size_limit && bytes.length > bucket.file_size_limit)) {
    throw new Error(`${id}: approved image changed or exceeds bucket limit.`);
  }
  const uploadLedger = JSON.parse(await readFile(path.join(
    'output/rebu-image-production-2026-09-28/supabase-upload-pilot-2026-10-06/upload-ledger',
    `${id}.json`,
  ), 'utf8'));
  if (uploadLedger.status !== 'applied_verified' || uploadLedger.source_sha256 !== target.sha256) {
    throw new Error(`${id}: image is not the applied and verified inventory asset.`);
  }
  const { data: source, error: sourceError } = await supabase.from('products')
    .select('id,title,stock,is_active,image,image_thumb,updated_at')
    .eq('id', target.source_id).single();
  if (sourceError || !source || source.is_active !== true || Number(source.stock) <= 0 ||
      source.image !== uploadLedger.after.image || source.image_thumb !== uploadLedger.after.image_thumb) {
    throw new Error(`${id}: source product is unavailable, changed, or out of stock.`);
  }
  const { data: catalog, error: catalogError } = await supabase.from('web_catalog_products')
    .select('id,source_product_id,title,status,updated_at,source_state,requires_review')
    .eq('id', target.catalog_id).single();
  if (catalogError || !catalog || catalog.source_product_id !== target.source_id ||
      catalog.title !== target.catalog_title || catalog.status !== 'draft' ||
      catalog.updated_at !== target.catalog_updated_at) {
    throw new Error(`${id}: existing catalog draft changed; review again.`);
  }
  const { data: beforeImages, error: imagesError } = await supabase.from('web_catalog_images')
    .select('id,storage_path,public_url,is_cover').eq('product_id', catalog.id);
  if (imagesError || beforeImages.length !== 0) {
    throw new Error(`${id}: catalog gallery is no longer empty; review existing images.`);
  }
  const storagePath = `products/${catalog.id}/rebu-temporary-${id}-${target.sha256.slice(0,20)}.png`;
  const publicUrl = supabase.storage.from('catalog-images').getPublicUrl(storagePath).data.publicUrl;
  if (mode === 'preflight') {
    console.log(JSON.stringify({ source_id: target.source_id, catalog_id: catalog.id,
      ready_to_stage: true, stock: source.stock, status: catalog.status }));
    continue;
  }

  await mkdir(ledgerDirectory, { recursive: true });
  const record = { source_id: target.source_id, catalog_id: catalog.id,
    status: 'prepared', prepared_at: new Date().toISOString(),
    before: { source, catalog, images: beforeImages },
    approved_sha256: target.sha256, visual_approval: target.approval,
    proposed: { storage_path: storagePath, public_url: publicUrl, alt_text: target.alt_text },
  };
  await writeFile(ledgerPath, JSON.stringify(record, null, 2));
  try {
    const { error: uploadError } = await supabase.storage.from('catalog-images')
      .upload(storagePath, bytes, { contentType: 'image/png', upsert: false, cacheControl: '31536000' });
    if (uploadError) throw uploadError;
    const response = await fetch(publicUrl, { signal: AbortSignal.timeout(60000) });
    if (!response.ok || digest(Buffer.from(await response.arrayBuffer())) !== target.sha256) {
      throw new Error('Uploaded catalog image failed public hash verification.');
    }
    record.status = 'storage_verified';
    await writeFile(ledgerPath, JSON.stringify(record, null, 2));
    const { data: inserted, error: insertError } = await supabase.from('web_catalog_images')
      .insert({ product_id: catalog.id, storage_path: storagePath,
        public_url: publicUrl, alt_text: target.alt_text, sort_order: 0, is_cover: true })
      .select('id,product_id,storage_path,public_url,alt_text,is_cover').single();
    if (insertError || !inserted) throw insertError || new Error('Catalog image insert returned no row.');
    const { data: confirmed, error: confirmError } = await supabase.from('web_catalog_images')
      .select('id,product_id,storage_path,public_url,alt_text,is_cover')
      .eq('id', inserted.id).single();
    const { data: stillDraft, error: draftError } = await supabase.from('web_catalog_products')
      .select('id,status,title').eq('id', catalog.id).single();
    if (confirmError || draftError || confirmed?.public_url !== publicUrl || !confirmed?.is_cover ||
        stillDraft?.status !== 'draft' || stillDraft?.title !== target.catalog_title) {
      throw new Error('Catalog gallery or draft state failed post-update verification.');
    }
    record.status = 'staged_verified';
    record.verified_at = new Date().toISOString();
    record.after = { image: confirmed, catalog: stillDraft };
    await writeFile(ledgerPath, JSON.stringify(record, null, 2));
    console.log(JSON.stringify({ source_id: target.source_id, catalog_id: catalog.id,
      status: record.status, published: false }));
  } catch (error) {
    record.error = String(error.message).replace(/https?:\/\/\S+/g, '[URL]');
    await writeFile(ledgerPath, JSON.stringify(record, null, 2));
    throw new Error(`${id}: ${record.error}`);
  }
}
