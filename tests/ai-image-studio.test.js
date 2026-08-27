import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AI_IMAGE_REFERENCE_LIMIT,
  buildAiImageRequest,
} from '../src/utils/aiImageStudio.js';
import {
  APP_PERMISSION_GROUPS,
  canAccessTab,
  getEffectivePermissions,
} from '../src/utils/userPermissions.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('el estudio IA tiene permisos independientes para generar y editar', () => {
  const group = APP_PERMISSION_GROUPS.find((entry) => entry.id === 'ai-images');
  assert.equal(group?.viewKey, 'aiImages.view');
  assert.deepEqual(group?.actions.map((entry) => entry.key), ['aiImages.generate', 'aiImages.edit']);

  const owner = getEffectivePermissions('owner');
  const seller = getEffectivePermissions('seller');
  assert.equal(canAccessTab({ role: 'owner' }, 'ai-images'), true);
  assert.equal(owner['aiImages.generate'], true);
  assert.equal(owner['aiImages.edit'], true);
  assert.equal(seller['aiImages.view'], false);
});

test('la solicitud normaliza generación y dimensiones permitidas', () => {
  assert.deepEqual(buildAiImageRequest({ mode: 'unknown', prompt: '  Producto sobre fondo blanco  ', sizeId: 'landscape' }), {
    mode: 'generate',
    prompt: 'Producto sobre fondo blanco',
    width: 1024,
    height: 768,
    images: [],
  });
});

test('una edición exige referencias y respeta el máximo', () => {
  assert.throws(() => buildAiImageRequest({ mode: 'edit', prompt: 'Cambiar fondo' }), /al menos una imagen/);
  const references = Array.from({ length: AI_IMAGE_REFERENCE_LIMIT + 1 }, (_, index) => ({ name: `${index}.png`, dataUrl: 'data:image/png;base64,AA==' }));
  assert.throws(() => buildAiImageRequest({ mode: 'edit', prompt: 'Cambiar fondo', references }), /hasta 4/);
});

test('la Edge Function exige sesión y mantiene el token fuera del cliente', () => {
  const functionSource = fs.readFileSync(path.join(projectRoot, 'supabase', 'functions', 'ai-image-studio', 'index.ts'), 'utf8');
  const viewSource = fs.readFileSync(path.join(projectRoot, 'src', 'views', 'AiImageStudioView.jsx'), 'utf8');
  assert.match(functionSource, /withSupabase\(\{ auth: \['user', 'secret'\] \}/);
  assert.match(functionSource, /Deno\.env\.get\('CLOUDFLARE_WORKERS_AI_TOKEN'\)/);
  assert.doesNotMatch(viewSource, /CLOUDFLARE_WORKERS_AI_TOKEN|api\.cloudflare\.com/);
});
