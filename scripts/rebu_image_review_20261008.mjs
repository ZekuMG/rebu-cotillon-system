import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('C:/Users/mikke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = process.cwd();
const base = path.join(root, 'output/rebu-image-production-2026-09-28');
const batchName = process.argv[3] || 'qa-continue-2026-10-08';
if (!/^qa-continue-2026-10-(?:08(?:-b\d+)?|11-b\d+|12-b\d+|13-b\d+|14-b\d+|15-b\d+|16-b\d+|17-b\d+)$/.test(batchName)) throw new Error('Invalid batch name');
const batch = path.join(base, batchName);
const selectionPath = path.join(base, 'stock-filtered-selection.json');
const selection = JSON.parse(await fs.readFile(selectionPath, 'utf8'));
const mode = process.argv[2];
const defaultInputs = {
  '1675': 'C:/Users/mikke/.codex/generated_images/01a0d692-ff95-7e20-8964-a0882735158e/exec-fb8fe3b2-c186-4888-8822-1abf1b4840d6.png',
  '1645': 'C:/Users/mikke/.codex/generated_images/01a0d692-ff95-7e20-8964-a0882735158e/exec-a806352b-dd63-4b27-ada1-556ca121cfb5.png',
};
let inputRows;
try { inputRows = process.env.REBU_IMAGE_INPUTS_JSON ? JSON.parse(process.env.REBU_IMAGE_INPUTS_JSON).rows : JSON.parse(await fs.readFile(path.join(batch, 'input-files.json'), 'utf8')).rows; }
catch (e) { if (e.code !== 'ENOENT') throw e; inputRows = Object.entries(defaultInputs).map(([id, generated]) => ({ id, generated })); }
const inputs = Object.fromEntries(inputRows.map(r => [String(r.id), r.generated]));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const all = [...selection.pending_targets, ...selection.completed_targets, ...selection.excluded_targets];
const targetFor = id => {
  const target = all.find(t => String(t.id) === id);
  if (!target || !target.in_stock || target.production_status === 'deferred' || target.upload_status === 'applied_verified' || target.requires_source_recheck) {
    throw new Error(`${id}: not an eligible unprocessed candidate`);
  }
  return target;
};
const requeueLegacyCompletion = id => {
  const target = all.find(t => String(t.id) === String(id));
  if (target && target.in_stock && target.production_status === 'completed' &&
      target.upload_status !== 'applied_verified' && !target.output &&
      !target.visual_review && !target.completion_status) {
    selection.completed_targets = selection.completed_targets.filter(t => String(t.id) !== String(id));
    target.production_status = 'pending';
    selection.pending_targets.push(target);
  }
};
const updateSummary = () => {
  const eligible = [...selection.completed_targets, ...selection.pending_targets];
  selection.summary = {
    ...selection.summary,
    eligible_in_stock: eligible.length,
    completed_in_stock: selection.completed_targets.length,
    pending_in_stock: selection.pending_targets.length,
    deferred_for_later_in_stock: eligible.filter(t => t.production_status === 'deferred').length,
    uploaded_verified_in_stock: eligible.filter(t => t.upload_status === 'applied_verified').length,
  };
};
await fs.mkdir(path.join(batch, 'images'), { recursive: true });
if (mode === 'resolve') {
  const filename = path.join(base, 'upload-review-deferred-2026-10-06.json');
  const deferred = JSON.parse(await fs.readFile(filename, 'utf8'));
  const resolved = [];
  for (const inputRow of inputRows.filter(r => r.resolve_deferred === true)) {
    const id = String(inputRow.id);
    const target = selection.pending_targets.find(t => String(t.id) === id);
    const record = deferred.deferred.find(t => String(t.id) === id);
    if (!target?.in_stock || target.production_status !== 'deferred' || !record ||
        target.upload_status !== 'deferred_qa' || target.qa_deferred_reason !== record.reason ||
        target.requires_source_recheck || !inputRow.generated || !inputRow.qa) {
      throw new Error(`${id}: deferred correction cannot be safely resolved`);
    }
    await fs.access(inputRow.generated);
    target.production_status = 'pending';
    target.upload_status = null;
    delete target.qa_deferred_reason;
    deferred.deferred = deferred.deferred.filter(t => String(t.id) !== id);
    deferred.resolved ||= [];
    deferred.resolved.push({ id, prior_reason: record.reason, corrected_in_batch: batchName,
      resolved_at: new Date().toISOString(), qa: inputRow.qa });
    resolved.push(id);
  }
  if (!resolved.length) throw new Error('No explicitly corrected deferred images');
  updateSummary();
  await fs.copyFile(filename, path.join(base, `upload-review-deferred-before-resolution-${Date.now()}.json`));
  await fs.copyFile(selectionPath, path.join(base, `stock-selection-before-resolution-${Date.now()}.json`));
  await fs.writeFile(filename, JSON.stringify(deferred, null, 2));
  await fs.writeFile(selectionPath, JSON.stringify(selection, null, 2));
  console.log(JSON.stringify({ resolved, summary: selection.summary }));
} else if (mode === 'normalize') {
  const rows = [];
  for (const [id, generated] of Object.entries(inputs)) {
    requeueLegacyCompletion(id);
    const target = targetFor(id);
    const file = path.join(batch, 'images', `${id}.png`);
    try { await fs.access(file); throw new Error(`${id}: output already exists`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    const { data, info } = await sharp(generated).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const inputRow = inputRows.find(r => String(r.id) === id);
    let left = info.width, top = info.height, right = -1, bottom = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (Math.max(255 - data[i], 255 - data[i + 1], 255 - data[i + 2]) <= 18) continue;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < 0) throw new Error(`${id}: empty image`);
    if (Array.isArray(inputRow?.crop_bbox) && inputRow.crop_bbox.length === 4) {
      const [l, t, r, b] = inputRow.crop_bbox.map(Number);
      if (![l, t, r, b].every(Number.isFinite) || l < 0 || t < 0 || r > info.width || b > info.height || r <= l || b <= t) {
        throw new Error(`${id}: invalid manual crop_bbox`);
      }
      left = l; top = t; right = r - 1; bottom = b - 1;
    } else {
      const pad = Math.max(8, Math.round(Math.min(info.width, info.height) * .012));
      left = Math.max(0, left - pad); top = Math.max(0, top - pad);
      right = Math.min(info.width - 1, right + pad); bottom = Math.min(info.height - 1, bottom + pad);
    }
    const crop = await sharp(generated).extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
      .flatten({ background: '#ffffff' }).resize(1410, 1128, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
    const size = await sharp(crop).metadata();
    await sharp({ create: { width: 3000, height: 2400, channels: 3, background: '#ffffff' } })
      .composite([{ input: crop, left: Math.floor((3000 - size.width) / 2), top: Math.floor((2400 - size.height) / 2) }])
      .withMetadata({ density: 300 }).png().toFile(file);
    const thumb = path.join(batch, `${id}-thumb.webp`);
    await sharp(file).resize(320, 320, { fit: 'cover' }).webp({ quality: 82 }).toFile(thumb);
    rows.push({ id, title: target.title, generated, source: target.source_file, file, thumb,
      sha256: sha(await fs.readFile(file)), thumb_sha256: sha(await fs.readFile(thumb)),
      crop_bbox: [left, top, right + 1, bottom + 1], placed_size: [size.width, size.height],
      format: 'PNG 3000x2400 at 300 DPI, white canvas, <=47% safe width/height' });
  }
  await fs.writeFile(path.join(batch, 'export-review.json'), JSON.stringify({ created_at: new Date().toISOString(), rows }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ normalized: rows.length, files: rows.map(r => r.file) }));
} else if (mode === 'approve') {
  const exports = JSON.parse(await fs.readFile(path.join(batch, 'export-review.json'), 'utf8'));
  const plan = [];
  for (const row of exports.rows) {
    requeueLegacyCompletion(row.id);
    const target = targetFor(row.id);
    const bytes = await fs.readFile(row.file);
    const thumbBytes = await fs.readFile(row.thumb);
    const meta = await sharp(bytes).metadata();
    if (meta.width !== 3000 || meta.height !== 2400 || meta.density !== 300 || sha(bytes) !== row.sha256 || sha(thumbBytes) !== row.thumb_sha256) throw new Error(`${row.id}: export changed`);
    const inputRow = inputRows.find(r => String(r.id) === row.id);
    const qa = inputRow?.qa || (row.id === '1675' ? 'Three open plastic dentures retained with four fangs each and the same layout; only watermark, badge and black background removed.'
      : 'Assembled kraft tray, handle, white scalloped window lid and open-box inset retained; 30 cm, 30 cm and 12 cm annotations preserved and made legible.');
    Object.assign(target, { production_status: 'completed', completion_status: 'approved_visual_qa',
      output: `${batchName}/images/${row.id}.png`, upload_status: 'ready_for_preflight',
      visual_review: { reviewed_at: new Date().toISOString(), qa, reviewed_against_source_and_title: true,
        edited_with: inputRow?.method === 'geometric-format-only'
          ? 'original source unchanged; geometric export only using sharp'
          : inputRow?.method === 'exact-reference-geometric-only'
            ? 'exact replacement reference unchanged; geometric export only using sharp'
          : inputRow?.method === 'literal-localized-chroma-cleanup'
            ? 'localized chroma cleanup of promotional circle only; other source pixels unchanged, followed by geometric export'
          : inputRow?.method === 'reuse-identical-source-approved-edit'
            ? 'reused approved built-in imagegen edit from identical-source product; geometric export only using sharp'
            : inputRow?.method === 'reuse-prior-corrected-asset-geometric-crop'
              ? 'reused prior corrected asset; geometric crop removes isolated promotional callout, then sharp export'
            : inputRow?.method === 'reuse-prior-u2net-cutout-geometric-only'
              ? 'reused previously prepared U2Net cutout of the original photo; geometric export only in this batch'
            : 'built-in imagegen; geometric export only using sharp', export_sha256: row.sha256 },
    });
    selection.pending_targets = selection.pending_targets.filter(t => String(t.id) !== row.id);
    selection.completed_targets.push(target);
    plan.push({ id: row.id, title: target.title, file: row.file, thumb_file: row.thumb,
      sha256: row.sha256, thumb_sha256: row.thumb_sha256, approval: target.completion_status,
      before: { id: Number(row.id), title: target.live_title, stock: target.stock, is_active: target.is_active,
        image: target.live_image, image_thumb: target.live_image_thumb, updated_at: target.live_updated_at }, qa });
  }
  updateSummary();
  await fs.copyFile(selectionPath, path.join(base, `stock-selection-before-20261008-approval-${Date.now()}.json`));
  await fs.writeFile(selectionPath, JSON.stringify(selection, null, 2));
  await fs.writeFile(path.join(batch, 'upload-plan.json'), JSON.stringify({
    backup_directory: path.join(base, 'inventory-photo-backup-2026-10-06T15-42-41-525Z'),
    ledger_directory: path.join(base, 'supabase-upload-pilot-2026-10-06/upload-ledger'), products: plan }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ approved: plan.map(x => x.id), summary: selection.summary }));
} else if (mode === 'defer') {
  const filename = path.join(base, 'upload-review-deferred-2026-10-06.json');
  const deferred = JSON.parse(await fs.readFile(filename, 'utf8'));
  const defaultReasons = {
    '1304': 'La fuente muestra una gorra celeste y blanca; el producto es una pulsera argentina. Requiere foto o referencia exacta del accesorio real.',
    '1376': 'El globo corresponde a 46 cm pero el envase auténtico visible dice x10; el producto está titulado x1. Se requiere una referencia de la unidad sin alterar ni ocultar textos del envase.',
    '1559': 'El título indica torre portacupcake dorada; la fuente es una torre amarilla ilustrada con capibaras, idéntica a la fuente de 1286. Requiere reemplazo exacto dorado.',
  };
  let reasons;
  try { reasons = JSON.parse(await fs.readFile(path.join(batch, 'defer.json'), 'utf8')).reasons; }
  catch (e) { if (e.code !== 'ENOENT') throw e; reasons = defaultReasons; }
  for (const [id, reason] of Object.entries(reasons)) {
    if (deferred.deferred.some(x => String(x.id) === id)) continue;
    let target = all.find(t => String(t.id) === id);
    // Older selection snapshots can leave rows in completed_targets without
    // any output, QA approval, or verified upload. Requeue only those stale
    // placeholders before deferring them; never touch a genuinely completed
    // or uploaded item.
    if (target && target.in_stock && target.production_status === 'completed' &&
        target.upload_status !== 'applied_verified' && !target.output &&
        !target.visual_review && !target.completion_status) {
      selection.completed_targets = selection.completed_targets.filter(t => String(t.id) !== id);
      target.production_status = 'pending';
      selection.pending_targets.push(target);
      target = selection.pending_targets.find(t => String(t.id) === id);
    }
    if (!target || target.production_status !== 'pending' || target.upload_status === 'applied_verified' || target.requires_source_recheck) {
      throw new Error(`${id}: not an eligible unprocessed candidate`);
    }
    Object.assign(target, { production_status: 'deferred', completion_status: null, upload_status: 'deferred_qa', qa_deferred_reason: reason });
    deferred.deferred.push({ id, reason, reviewed_on: '2026-10-08' });
  }
  await fs.copyFile(filename, path.join(base, `upload-review-deferred-before-20261008-${Date.now()}.json`));
  await fs.copyFile(selectionPath, path.join(base, `stock-selection-before-20261008-deferral-${Date.now()}.json`));
  updateSummary();
  await fs.writeFile(filename, JSON.stringify(deferred, null, 2));
  await fs.writeFile(selectionPath, JSON.stringify(selection, null, 2));
  console.log(JSON.stringify({ deferred: Object.keys(reasons), summary: selection.summary }));
} else throw new Error('Use resolve, normalize, approve or defer.');
