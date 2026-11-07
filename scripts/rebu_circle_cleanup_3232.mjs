import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('C:/Users/mikke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = process.cwd();
const input = path.join(root, 'output/rebu-image-production-2026-09-28/approved/3232.png');
const output = path.join(root, 'output/rebu-image-production-2026-09-28/qa-continue-2026-10-12-b216/3232-localized.png');
const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
if (info.width !== 3000 || info.height !== 2400 || info.channels !== 3) throw new Error('Unexpected source format');

// The only remaining defect is the green quantity badge. Chroma-key its green
// antialiasing in the measured badge bounds; retain every other source pixel.
let changed = 0;
for (let y = 966; y <= 1128; y++) {
  for (let x = 951; x <= 1113; x++) {
    const i = (y * info.width + x) * 3;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (g > r + 2 && g > b + 2 && g > 45) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      changed++;
    }
  }
}
if (changed < 8000 || changed > 10000) throw new Error(`Unexpected badge pixel count: ${changed}`);
await fs.mkdir(path.dirname(output), { recursive: true });
await sharp(data, { raw: info }).png({ compressionLevel: 9 }).withMetadata({ density: 300 }).toFile(output);
console.log(JSON.stringify({ output, changed_pixels: changed, canvas: '3000x2400', dpi: 300 }));
