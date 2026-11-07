import { createClient } from '@supabase/supabase-js';
import { parse } from 'dotenv';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';

const mode = process.argv[2];
const requested = process.argv.slice(3).map(Number);
if (!['preflight', 'apply'].includes(mode) || !requested.length) {
  throw new Error('Use preflight|apply <source IDs>.');
}
const root = 'output/rebu-image-production-2026-09-28';
const approved = new Map([
  [1748, { file: `${root}/generated-normalized/1748.png`, alt: 'Abrillantador Globby Shine en aerosol de 125 ml para globos' }],
  [2197, { file: `${root}/generated-normalized/2197.png`, alt: 'Abanico blanco de tela desplegado, 41 cm' }],
  [1218, { file: `${root}/generated-normalized/1218.png`, alt: 'Set de tres adornos Feliz Cumple con temática de fútbol' }],
  [1814, { file: `${root}/approved/1814.png`, alt: 'Set de tres adornos Feliz Cumple con temática Plim Plim' }],
]);
if (requested.some((id) => !approved.has(id)) || new Set(requested).size !== requested.length) {
  throw new Error('Only individually reviewed, unique IDs may be processed.');
}
let env = {};
for (const name of ['.env', '.env.local']) {
  try { env = { ...env, ...parse(await readFile(name)) }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase configuration.');
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(60000) }) },
});
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ledgerDir = `${root}/web-catalog-staging-2026-10-17/replaced-covers`;
const { data: bucket, error: bucketError } = await supabase.storage.getBucket('catalog-images');
if (bucketError || !bucket?.public || !bucket.allowed_mime_types?.includes('image/png')) {
  throw new Error('Catalog image bucket cannot accept public PNG assets.');
}
const one = async (table, select, column, value) => {
  const { data, error } = await supabase.from(table).select(select).eq(column, value).single();
  if (error || !data) throw error || new Error(`${table}: row unavailable`);
  return data;
};
const freshState = async (id) => {
  const source = await one('products', 'id,title,stock,is_active,image,image_thumb,updated_at', 'id', id);
  const catalog = await one('web_catalog_products', 'id,source_product_id,title,status,updated_at,source_state,requires_review', 'source_product_id', id);
  const { data: images, error } = await supabase.from('web_catalog_images')
    .select('id,storage_path,public_url,alt_text,is_cover,sort_order,updated_at')
    .eq('product_id', catalog.id);
  if (error || !images) throw error || new Error('Gallery unavailable');
  return { source, catalog, images: images.sort((a, b) => a.id.localeCompare(b.id)) };
};

for (const id of requested) {
  const target = approved.get(id);
  const ledgerPath = path.join(ledgerDir, `${id}.json`);
  try { await access(ledgerPath); throw new Error(`${id}: replacement ledger already exists; inspect before retry.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const bytes = await readFile(target.file);
  const imageHash = sha(bytes);
  if (bucket.file_size_limit && bytes.length > bucket.file_size_limit) throw new Error(`${id}: image exceeds bucket limit.`);
  const upload = JSON.parse(await readFile(`${root}/supabase-upload-pilot-2026-10-06/upload-ledger/${id}.json`));
  if (upload.status !== 'applied_verified' || upload.source_sha256 !== imageHash) {
    throw new Error(`${id}: local PNG is not the previously applied and verified inventory asset.`);
  }
  const before = await freshState(id);
  const { source, catalog, images } = before;
  if (!source.is_active || Number(source.stock) <= 0 || source.image !== upload.after.image ||
      source.image_thumb !== upload.after.image_thumb || catalog.status !== 'draft' ||
      catalog.source_product_id !== id || images.length !== 1 || !images[0].is_cover) {
    throw new Error(`${id}: source, draft, or single-cover gallery is no longer eligible.`);
  }
  const oldCover = images[0];
  const oldResponse = await fetch(oldCover.public_url, { signal: AbortSignal.timeout(60000) });
  if (!oldResponse.ok) throw new Error(`${id}: existing cover is not retrievable for backup.`);
  const oldBytes = Buffer.from(await oldResponse.arrayBuffer());
  const oldHash = sha(oldBytes);
  const newPath = `products/${catalog.id}/rebu-reviewed-${id}-${imageHash.slice(0,20)}.png`;
  const newUrl = supabase.storage.from('catalog-images').getPublicUrl(newPath).data.publicUrl;
  if (mode === 'preflight') {
    console.log(JSON.stringify({ id, catalog_id: catalog.id, stock: source.stock, old_cover_sha256: oldHash,
      approved_sha256: imageHash, ready: true }));
    continue;
  }
  await mkdir(ledgerDir, { recursive: true });
  const oldBackup = path.join(ledgerDir, `${id}-previous-cover${path.extname(oldCover.storage_path) || '.bin'}`);
  await writeFile(oldBackup, oldBytes, { flag: 'wx' });
  const record = {
    source_id: id, status: 'prepared', prepared_at: new Date().toISOString(),
    before, old_cover_backup: oldBackup, old_cover_sha256: oldHash,
    approved_file: target.file, approved_sha256: imageHash,
    proposed: { storage_path: newPath, public_url: newUrl, alt_text: target.alt },
  };
  const save = () => writeFile(ledgerPath, JSON.stringify(record, null, 2));
  await save();
  try {
    const again = await freshState(id);
    if (JSON.stringify(again) !== JSON.stringify(before)) throw new Error('Rows changed after backup; no update applied.');
    const { error: uploadError } = await supabase.storage.from('catalog-images')
      .upload(newPath, bytes, { contentType: 'image/png', upsert: false, cacheControl: '31536000' });
    if (uploadError) throw uploadError;
    const response = await fetch(newUrl, { signal: AbortSignal.timeout(60000) });
    if (!response.ok || sha(Buffer.from(await response.arrayBuffer())) !== imageHash) {
      throw new Error('New catalog asset failed public hash verification.');
    }
    record.status = 'storage_verified'; await save();
    const { data: inserted, error: insertError } = await supabase.from('web_catalog_images')
      .insert({ product_id: catalog.id, storage_path: newPath, public_url: newUrl,
        alt_text: target.alt, sort_order: 0, is_cover: false })
      .select('id,storage_path,public_url,is_cover,updated_at').single();
    if (insertError || !inserted) throw insertError || new Error('New gallery row was not returned.');
    record.new_image = inserted; record.status = 'image_inserted'; await save();
    const beforeSwap = await freshState(id);
    if (beforeSwap.source.updated_at !== source.updated_at || beforeSwap.catalog.updated_at !== catalog.updated_at ||
        beforeSwap.images.length !== 2 || !beforeSwap.images.some((image) => image.id === oldCover.id && image.is_cover) ||
        !beforeSwap.images.some((image) => image.id === inserted.id && !image.is_cover)) {
      throw new Error('Gallery or source changed before cover swap.');
    }
    const { data: demoted, error: demoteError } = await supabase.from('web_catalog_images')
      .update({ is_cover: false }).eq('id', oldCover.id).eq('product_id', catalog.id)
      .eq('updated_at', oldCover.updated_at).eq('is_cover', true).select('id,is_cover').single();
    if (demoteError || !demoted || demoted.is_cover) throw demoteError || new Error('Could not demote previous cover.');
    record.status = 'old_cover_demoted'; await save();
    const { data: promoted, error: promoteError } = await supabase.from('web_catalog_images')
      .update({ is_cover: true }).eq('id', inserted.id).eq('product_id', catalog.id)
      .eq('updated_at', inserted.updated_at).eq('is_cover', false).select('id,is_cover').single();
    if (promoteError || !promoted?.is_cover) throw promoteError || new Error('Could not promote new cover.');
    record.status = 'new_cover_promoted'; await save();
    const after = await freshState(id);
    if (after.catalog.status !== 'draft' || after.images.length !== 2 ||
        after.images.filter((image) => image.is_cover).length !== 1 ||
        !after.images.some((image) => image.id === inserted.id && image.is_cover && image.public_url === newUrl) ||
        !after.images.some((image) => image.id === oldCover.id && !image.is_cover && image.public_url === oldCover.public_url)) {
      throw new Error('Post-swap gallery verification failed.');
    }
    const oldAgain = await fetch(oldCover.public_url, { signal: AbortSignal.timeout(60000) });
    if (!oldAgain.ok || sha(Buffer.from(await oldAgain.arrayBuffer())) !== oldHash) {
      throw new Error('Previous cover is not intact after swap.');
    }
    record.after = after; record.status = 'replaced_verified'; record.verified_at = new Date().toISOString();
    await save();
    console.log(JSON.stringify({ id, catalog_id: catalog.id, status: record.status, published: false }));
  } catch (error) {
    record.error = String(error.message).replace(/https?:\/\/\S+/g, '[URL]');
    if (record.status === 'old_cover_demoted') {
      const current = await freshState(id);
      if (current.catalog.status === 'draft' && current.images.length === 2 &&
          current.images.every((image) => !image.is_cover) &&
          current.images.some((image) => image.id === oldCover.id && image.public_url === oldCover.public_url) &&
          current.images.some((image) => image.id === record.new_image?.id && image.public_url === newUrl)) {
        const { data: restored, error: restoreError } = await supabase.from('web_catalog_images')
          .update({ is_cover: true }).eq('id', oldCover.id).eq('product_id', catalog.id)
          .eq('is_cover', false).select('id,is_cover').single();
        record.rollback = !restoreError && restored?.is_cover ? 'old_cover_restored' : 'manual_review_required';
      } else {
        record.rollback = 'manual_review_required';
      }
    }
    await save();
    throw new Error(`${id}: ${record.error}`);
  }
}
