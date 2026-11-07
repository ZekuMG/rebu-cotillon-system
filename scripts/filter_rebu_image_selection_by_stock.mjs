import { createClient } from '@supabase/supabase-js';
import { parse } from 'dotenv';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const productionDirectory = path.resolve(
  process.argv[2] || 'output/rebu-image-production-2026-09-28',
);
const selectionPath = path.join(productionDirectory, 'selection.json');
const normalizedDirectory = path.join(productionDirectory, 'generated-normalized');
const outputPath = path.join(productionDirectory, 'stock-filtered-selection.json');

const env = parse(await readFile(path.join(root, '.env')));
const supabaseUrl = String(env.VITE_SUPABASE_URL || '').trim();
const supabaseKey = String(env.VITE_SUPABASE_ANON_KEY || '').trim();
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const rows = [];
const pageSize = 1000;
for (let from = 0; ; from += pageSize) {
  const { data, error } = await supabase
    .from('products')
    .select('id,title,stock,is_active')
    .order('id', { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  rows.push(...(data || []));
  if (!data || data.length < pageSize) break;
}

const selection = JSON.parse(await readFile(selectionPath, 'utf8'));
const productsById = new Map(rows.map((row) => [String(row.id), row]));
const normalizedIds = new Set(
  (await readdir(normalizedDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
    .map((entry) => path.parse(entry.name).name),
);

const targets = (selection.targets || []).map((target) => {
  const product = productsById.get(String(target.id));
  const stock = Number(product?.stock || 0);
  const inStock = Boolean(product) && product.is_active !== false && stock > 0;
  return {
    ...target,
    stock,
    is_active: product?.is_active !== false,
    in_stock: inStock,
    production_status: normalizedIds.has(String(target.id)) ? 'completed' : 'pending',
  };
});

const eligibleTargets = targets.filter((target) => target.in_stock);
const completedEligible = eligibleTargets.filter((target) => target.production_status === 'completed');
const pendingEligible = eligibleTargets.filter((target) => target.production_status === 'pending');
const excludedOutOfStock = targets.filter((target) => !target.in_stock);

const result = {
  generated_at: new Date().toISOString(),
  stock_rule: 'is_active != false AND stock > 0',
  source_selection: selectionPath,
  summary: {
    original_targets: targets.length,
    eligible_in_stock: eligibleTargets.length,
    completed_in_stock: completedEligible.length,
    pending_in_stock: pendingEligible.length,
    excluded_out_of_stock_or_inactive: excludedOutOfStock.length,
  },
  pending_targets: pendingEligible,
  completed_targets: completedEligible,
  excluded_targets: excludedOutOfStock,
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.summary, null, 2));
console.log(`SELECCION ${outputPath}`);
