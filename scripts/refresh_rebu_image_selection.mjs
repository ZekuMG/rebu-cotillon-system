import { createClient } from '@supabase/supabase-js';
import { parse } from 'dotenv';
import { readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const directory = path.join(root, 'output/rebu-image-production-2026-09-28');
const filename = path.join(directory, 'stock-filtered-selection.json');
const selection = JSON.parse(await readFile(filename, 'utf8'));
let env = {};
for (const name of ['.env', '.env.local']) {
  try { env = { ...env, ...parse(await readFile(path.join(root, name))) }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const url = String(env.VITE_SUPABASE_URL || '').trim();
const key = String(env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(60000) }) },
});
const products = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase.from('products')
    .select('id,title,stock,is_active,image,image_thumb,updated_at').order('id').range(from, from + 999);
  if (error) throw new Error(`No se pudo actualizar stock: ${error.message}`);
  products.push(...data);
  if (data.length < 1000) break;
}
const liveById = new Map(products.map((p) => [String(p.id), p]));
const deferredReview = JSON.parse(await readFile(path.join(directory, 'upload-review-deferred-2026-10-06.json'), 'utf8'));
const deferredById = new Map(deferredReview.deferred.map((r) => [String(r.id), r]));
const ledgerDirectory = path.join(directory, 'supabase-upload-pilot-2026-10-06/upload-ledger');
const appliedById = new Map();
for (const entry of await readdir(ledgerDirectory)) {
  if (!entry.endsWith('.json')) continue;
  const ledger = JSON.parse(await readFile(path.join(ledgerDirectory, entry), 'utf8'));
  if (ledger.status === 'applied_verified') appliedById.set(String(ledger.id), ledger);
}
const targets = [...selection.completed_targets, ...selection.pending_targets, ...selection.excluded_targets]
  .map((target) => {
    const current = liveById.get(String(target.id));
    const deferred = deferredById.get(String(target.id));
    const applied = appliedById.get(String(target.id));
    const result = { ...target, stock: Number(current?.stock || 0),
      is_active: current?.is_active !== false,
      in_stock: Boolean(current) && current.is_active !== false && Number(current.stock) > 0,
      live_title: current?.title || '', live_image: current?.image || '',
      live_image_thumb: current?.image_thumb || '', live_updated_at: current?.updated_at || null,
    };
    if (deferred && !applied) {
      result.previous_completion_status ??= result.completion_status || null;
      result.production_status = 'deferred';
      result.completion_status = null;
      result.upload_status = 'deferred_qa';
      result.qa_deferred_reason = deferred.reason;
    }
    if (applied) {
      if (current?.image !== applied.after.image || current?.image_thumb !== applied.after.image_thumb) {
        throw new Error(`${target.id}: la asociación subida cambió después de su verificación.`);
      }
      result.upload_status = 'applied_verified';
      result.uploaded_at = applied.verified_at;
      result.upload_ledger = `supabase-upload-pilot-2026-10-06/upload-ledger/${target.id}.json`;
    }
    result.requires_source_recheck = !applied && Boolean(current) &&
      (current.title !== target.title || current.image !== target.current_image);
    return result;
  });
if (new Set(targets.map((t) => String(t.id))).size !== targets.length) throw new Error('IDs duplicados en la selección.');
const eligible = targets.filter((t) => t.in_stock);
selection.generated_at = new Date().toISOString();
selection.summary = {
  original_targets: targets.length,
  eligible_in_stock: eligible.length,
  completed_in_stock: eligible.filter((t) => t.production_status === 'completed').length,
  pending_in_stock: eligible.filter((t) => t.production_status !== 'completed').length,
  excluded_out_of_stock_or_inactive: targets.filter((t) => !t.in_stock).length,
  deferred_for_later_in_stock: eligible.filter((t) => t.production_status === 'deferred').length,
  uploaded_verified_in_stock: eligible.filter((t) => t.upload_status === 'applied_verified').length,
};
selection.completed_targets = eligible.filter((t) => t.production_status === 'completed');
selection.pending_targets = eligible.filter((t) => t.production_status !== 'completed');
selection.excluded_targets = targets.filter((t) => !t.in_stock);
const previous = path.join(directory, `stock-selection-before-live-refresh-${Date.now()}.json`);
await copyFile(filename, previous);
await writeFile(filename, JSON.stringify(selection, null, 2));
console.log(JSON.stringify(selection.summary));
