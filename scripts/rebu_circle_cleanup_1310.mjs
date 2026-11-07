import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('C:/Users/mikke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = process.cwd();
const input = path.join(root, 'output/rebu-inventory-image-audit-2026-09-28/images/1310.webp');
const output = path.join(root, 'output/rebu-image-production-2026-09-28/qa-continue-2026-10-12-b217/1310-localized-v3.png');
const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
if (info.width !== 1200 || info.height !== 1200 || info.channels !== 3) throw new Error('Unexpected source format');

// These two bounded discs are the green x40 callouts. The separate circles
// carrying the authentic 38 g measure are deliberately outside the edit area.
const boxes = [
  { bounds: [193, 59, 342, 200], center: [267.5, 129.5], radii: [75, 71] },
  { bounds: [220, 625, 360, 756], center: [290, 690.5], radii: [71, 67] },
];
const changed = [];
for (const { bounds: [left, top, right, bottom], center: [cx, cy], radii: [rx, ry] } of boxes) {
  let count = 0;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const i = (y * info.width + x) * 3;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const withinBadge = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
      const green = g > r + 2 && g > b + 2 && g > 45;
      const pale = r > 230 && g > 230 && b > 230;
      if (green || (withinBadge && pale)) {
        if (r !== 254 || g !== 254 || b !== 254) count++;
        data[i] = 254;
        data[i + 1] = 254;
        data[i + 2] = 254;
      }
    }
  }
  changed.push(count);
}
if (changed.some(n => n < 11000 || n > 18000)) throw new Error(`Unexpected badge pixel counts: ${changed}`);
await fs.mkdir(path.dirname(output), { recursive: true });
await sharp(data, { raw: info }).png({ compressionLevel: 9 }).withMetadata({ density: 300 }).toFile(output);
console.log(JSON.stringify({ output, changed_pixels_by_badge: changed }));
