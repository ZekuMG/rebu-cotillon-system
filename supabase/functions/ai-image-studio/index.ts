// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from 'jsr:@supabase/server@^1';

const CLOUDFLARE_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const MAX_PROMPT_LENGTH = 2000;
const MAX_REFERENCES = 4;
const ALLOWED_DIMENSIONS = new Set(['1024x1024', '1024x768', '768x1024', '1280x720']);

const jsonResponse = (payload: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(payload),
  { status, headers: { 'Content-Type': 'application/json' } },
);

const decodeImageDataUrl = (value: unknown) => {
  const match = String(value || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error('Una referencia no tiene un formato de imagen válido.');

  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, mimeType: match[1] };
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

export default {
  fetch: withSupabase({ auth: ['user', 'secret'] }, async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405);

  try {
    const body = await request.json();
    const mode = body?.mode === 'edit' ? 'edit' : 'generate';
    const prompt = String(body?.prompt || '').trim();
    const width = Number(body?.width);
    const height = Number(body?.height);
    const images = Array.isArray(body?.images) ? body.images : [];

    if (prompt.length < 3 || prompt.length > MAX_PROMPT_LENGTH) {
      return jsonResponse({ error: 'La indicación debe tener entre 3 y 2000 caracteres.' }, 400);
    }
    if (!ALLOWED_DIMENSIONS.has(`${width}x${height}`)) {
      return jsonResponse({ error: 'El formato de salida no está permitido.' }, 400);
    }
    if (images.length > MAX_REFERENCES || (mode === 'edit' && images.length === 0)) {
      return jsonResponse({ error: 'La edición requiere entre 1 y 4 referencias.' }, 400);
    }

    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const apiToken = Deno.env.get('CLOUDFLARE_WORKERS_AI_TOKEN');
    if (!accountId || !apiToken) {
      return jsonResponse({ error: 'Workers AI todavía no está conectado.' }, 503);
    }

    const form = new FormData();
    form.append('prompt', prompt);
    form.append('width', String(width));
    form.append('height', String(height));

    if (mode === 'edit') {
      images.forEach((image: { dataUrl?: unknown; name?: unknown }, index: number) => {
        const decoded = decodeImageDataUrl(image?.dataUrl);
        const extension = decoded.mimeType === 'image/png' ? 'png' : decoded.mimeType === 'image/webp' ? 'webp' : 'jpg';
        const safeName = String(image?.name || `referencia-${index + 1}.${extension}`).replace(/[^a-zA-Z0-9._-]/g, '-');
        form.append(`input_image_${index}`, new Blob([decoded.bytes], { type: decoded.mimeType }), safeName);
      });
    }

    const cloudflareResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_MODEL}`,
      { method: 'POST', headers: { Authorization: `Bearer ${apiToken}` }, body: form },
    );

    if (!cloudflareResponse.ok) {
      let detail = '';
      try {
        const failure = await cloudflareResponse.json();
        detail = String(failure?.errors?.[0]?.message || failure?.messages?.[0]?.message || '');
      } catch {
        detail = '';
      }
      if (cloudflareResponse.status === 429) {
        return jsonResponse({ error: 'Se alcanzó temporalmente el límite de Workers AI. Probá de nuevo más tarde.' }, 429);
      }
      console.error('Workers AI error', cloudflareResponse.status, detail);
      return jsonResponse({ error: detail || 'Cloudflare no pudo producir la imagen.' }, 502);
    }

    const responseType = cloudflareResponse.headers.get('content-type') || '';
    let base64Image = '';
    let mimeType = 'image/png';
    if (responseType.startsWith('image/')) {
      mimeType = responseType.split(';')[0];
      base64Image = arrayBufferToBase64(await cloudflareResponse.arrayBuffer());
    } else {
      const payload = await cloudflareResponse.json();
      base64Image = String(payload?.result?.image || payload?.image || '');
      if (base64Image.startsWith('data:image/')) {
        const [header, encoded] = base64Image.split(',', 2);
        mimeType = header.match(/^data:(image\/[^;]+)/)?.[1] || mimeType;
        base64Image = encoded || '';
      }
    }

    if (!base64Image) {
      console.error('Workers AI returned no image');
      return jsonResponse({ error: 'Cloudflare respondió sin una imagen utilizable.' }, 502);
    }

    return jsonResponse({
      imageDataUrl: `data:${mimeType};base64,${base64Image}`,
      model: CLOUDFLARE_MODEL,
      width,
      height,
    });
  } catch (error) {
    console.error('ai-image-studio failed', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'No se pudo procesar la solicitud.' }, 500);
  }
  }),
};
