import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(process.argv[2]);
const manifestPath = path.join(root, 'backup-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
let cursor = 0;
const pending = manifest.assets.filter((asset) => asset.status === 'error');
await Promise.all(Array.from({ length: 8 }, async () => {
  while (cursor < pending.length) {
    const asset = pending[cursor++];
    try {
      const response = await fetch(asset.source, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(`HTTP ${response.status}${body?.message === 'Object not found' ? ': Object not found' : ''}`);
      }
      const type = (response.headers.get('content-type') || '').split(';')[0];
      if (!type.startsWith('image/')) throw new Error('Contenido no visual');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error('Archivo vacío');
      const ext = ({ 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg',
        'image/gif': 'gif', 'image/avif': 'avif' })[type] || 'image';
      asset.file = `images/${createHash('sha256').update(asset.source).digest('hex')}.${ext}`;
      await writeFile(path.join(root, asset.file), bytes);
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (createHash('sha256').update(await readFile(path.join(root, asset.file))).digest('hex') !== digest) {
        throw new Error('Falló la verificación');
      }
      Object.assign(asset, { status: 'saved', bytes: bytes.length, sha256: digest, content_type: type });
      delete asset.error;
    } catch (error) { asset.error = String(error.message).replace(/https?:\/\/\S+/g, '[URL]'); }
  }
}));
manifest.summary.saved = manifest.assets.filter((asset) => asset.status === 'saved').length;
manifest.summary.errors = manifest.assets.filter((asset) => asset.status === 'error').length;
manifest.last_retry_at = new Date().toISOString();
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
const errorCounts = {};
for (const asset of manifest.assets.filter((a) => a.status === 'error')) {
  errorCounts[asset.error] = (errorCounts[asset.error] || 0) + 1;
}
console.log(JSON.stringify({ verified: manifest.summary.saved, unresolved: manifest.summary.errors, errors: errorCounts }));
