import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.');
}

const outputDirectory = path.resolve(process.argv[2] || 'output/rebu-inventory-image-audit-2026-09-28');
const imageDirectory = path.join(outputDirectory, 'images');
await mkdir(imageDirectory, { recursive: true });

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const pageSize = 1000;
const rows = [];
for (let from = 0; ; from += pageSize) {
  const { data, error } = await supabase
    .from('products')
    .select('id,title,brand,barcode,image,image_thumb,supplier_links,is_active,updated_at')
    .order('id', { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  rows.push(...(data || []));
  console.log(`PRODUCTOS ${rows.length}`);
  if (!data || data.length < pageSize) break;
}

const safeExtension = (contentType, url) => {
  if (/png/i.test(contentType)) return 'png';
  if (/webp/i.test(contentType)) return 'webp';
  if (/gif/i.test(contentType)) return 'gif';
  if (/avif/i.test(contentType)) return 'avif';
  try {
    const extension = path.extname(new URL(url).pathname).slice(1).toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(extension)) return extension;
  } catch {
    // Fall through to jpg.
  }
  return 'jpg';
};

let previousManifest = null;
try {
  previousManifest = JSON.parse(await readFile(path.join(outputDirectory, 'manifest.json'), 'utf8'));
} catch {
  previousManifest = null;
}
const cachedById = new Map((previousManifest?.products || []).map((item) => [String(item.id), item]));

const products = rows.map((row) => {
  const casaAlberto = row.supplier_links?.casa_alberto || null;
  const currentImage = row.image || row.image_thumb || '';
  return {
    id: String(row.id),
    title: row.title || '',
    brand: row.brand || '',
    barcode: row.barcode || '',
    current_image: currentImage,
    image: row.image || '',
    image_thumb: row.image_thumb || '',
    is_active: row.is_active !== false,
    updated_at: row.updated_at || null,
    linked_to_casa_alberto: Boolean(casaAlberto),
    casa_alberto_source_image: casaAlberto?.imageUrl || casaAlberto?.price_tracking?.imageUrl || '',
    local_file: '',
    download_status: currentImage ? 'pending' : 'missing_image',
  };
});

let cursor = 0;
let completed = 0;
const downloadNext = async () => {
  while (cursor < products.length) {
    const index = cursor++;
    const product = products[index];
    if (!product.current_image) {
      completed += 1;
      continue;
    }

    const cached = cachedById.get(product.id);
    if (cached?.current_image === product.current_image && cached?.local_file) {
      try {
        await readFile(path.join(outputDirectory, cached.local_file));
        product.local_file = cached.local_file;
        product.download_status = 'cached';
        completed += 1;
        continue;
      } catch {
        // Cache entry is stale; download again.
      }
    }

    try {
      const response = await fetch(product.current_image, {
        headers: { 'user-agent': 'Rebu-Inventory-Image-Audit/1.0' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) throw new Error(`Tipo inesperado: ${contentType}`);
      const extension = safeExtension(contentType, product.current_image);
      const filename = `${product.id}.${extension}`;
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(path.join(imageDirectory, filename), bytes);
      product.local_file = `images/${filename}`;
      product.download_status = 'downloaded';
      product.bytes = bytes.length;
      product.content_type = contentType;
    } catch (error) {
      product.download_status = 'error';
      product.download_error = error?.message || String(error);
    }
    completed += 1;
    if (completed % 250 === 0 || completed === products.length) {
      console.log(`IMAGENES ${completed}/${products.length}`);
    }
  }
};

await Promise.all(Array.from({ length: 16 }, downloadNext));

const summary = {
  product_count: products.length,
  active_product_count: products.filter((item) => item.is_active).length,
  inactive_product_count: products.filter((item) => !item.is_active).length,
  with_current_image: products.filter((item) => item.current_image).length,
  without_current_image: products.filter((item) => !item.current_image).length,
  downloaded_or_cached: products.filter((item) => ['downloaded', 'cached'].includes(item.download_status)).length,
  download_errors: products.filter((item) => item.download_status === 'error').length,
  linked_to_casa_alberto: products.filter((item) => item.linked_to_casa_alberto).length,
};

await writeFile(
  path.join(outputDirectory, 'manifest.json'),
  JSON.stringify({ generated_at: new Date().toISOString(), summary, products }, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
