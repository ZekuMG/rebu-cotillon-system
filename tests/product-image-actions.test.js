import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  buildProductImageFileName,
  copyProductImage,
  downloadProductImage,
  getProductImageExtension,
} from '../src/utils/productImageClipboard.js';

const readSource = async (relativePath) =>
  readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');

// Sin DOM, la conversion a PNG falla sola y el flujo cae directo en el puente:
// es justo el camino que corre en las PCs del local.
const withElectronBridge = async (electronAPI, run) => {
  const previousWindow = globalThis.window;
  globalThis.window = { electronAPI };
  try {
    return await run();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
};

test('el nombre sugerido sale del titulo del producto, sin tildes ni simbolos raros', () => {
  assert.equal(
    buildProductImageFileName('Globos Metalizados Corazón 18"', 'https://x.supabase.co/products/1.jpg'),
    'rebu-globos-metalizados-corazon-18.jpg',
  );
  assert.equal(buildProductImageFileName('', 'https://x.supabase.co/products/1.png'), 'rebu-producto.png');
  assert.equal(buildProductImageFileName('   ', 'https://x.supabase.co/products/1.webp'), 'rebu-producto.webp');
});

test('la extension respeta el archivo real y cae en jpg cuando no se puede saber', () => {
  assert.equal(getProductImageExtension('https://x.supabase.co/products/thumbs/1.webp'), 'webp');
  assert.equal(getProductImageExtension('https://x.supabase.co/products/1.JPEG'), 'jpg');
  assert.equal(getProductImageExtension('https://x.supabase.co/products/1.png?width=600&t=2'), 'png');
  assert.equal(getProductImageExtension('data:image/png;base64,AA=='), 'png');
  assert.equal(getProductImageExtension('https://x.supabase.co/render/image/publico'), 'jpg');
  assert.equal(getProductImageExtension(''), 'jpg');
});

test('copiar y descargar pasan por el puente de Electron antes que por el navegador', async () => {
  // La app empaquetada carga el renderer desde file://, donde navigator.clipboard
  // no copia imagenes: si el orden se diera vuelta, andaria en desarrollo y fallaria
  // en las PCs del local.
  const source = await readSource('../src/utils/productImageClipboard.js');

  const copyStart = source.indexOf('export const copyProductImage');
  const copyBlock = source.slice(copyStart, source.indexOf('export const downloadProductImage'));
  assert.ok(copyStart > 0, 'tiene que existir copyProductImage');
  assert.ok(
    copyBlock.indexOf('bridge?.copyImageToClipboard') < copyBlock.indexOf('copyWithBrowserClipboard'),
    'el puente de Electron va primero y el navegador queda de reserva',
  );

  const downloadBlock = source.slice(source.indexOf('export const downloadProductImage'));
  assert.ok(
    downloadBlock.indexOf('bridge?.saveProductImage') < downloadBlock.indexOf('downloadWithBrowserAnchor'),
    'la descarga usa el dialogo del proceso principal antes que el <a download>',
  );
});

test('copiar le manda la URL al proceso principal y avisa cuando sale bien', async () => {
  let payload = null;
  const result = await withElectronBridge(
    { copyImageToClipboard: async (request) => { payload = request; return { success: true }; } },
    () => copyProductImage({ imageUrl: '  https://x.supabase.co/products/thumbs/1.webp  ' }),
  );

  assert.deepEqual(result, { success: true });
  assert.equal(payload.imageUrl, 'https://x.supabase.co/products/thumbs/1.webp');
  assert.equal(payload.dataUrl, '', 'sin canvas disponible igual se intenta por la URL');
});

test('descargar propone el nombre del producto en el dialogo de guardado', async () => {
  let payload = null;
  const result = await withElectronBridge(
    { saveProductImage: async (request) => { payload = request; return { success: true, filePath: 'C:/x.webp' }; } },
    () => downloadProductImage({ imageUrl: 'https://x.supabase.co/products/1.webp', productTitle: 'Globo Rojo' }),
  );

  assert.equal(result.success, true);
  assert.equal(payload.defaultName, 'rebu-globo-rojo.webp');
});

test('sin foto no se llama al proceso principal y se devuelve el motivo', async () => {
  let llamadas = 0;
  const bridge = {
    copyImageToClipboard: async () => { llamadas += 1; return { success: true }; },
    saveProductImage: async () => { llamadas += 1; return { success: true }; },
  };

  await withElectronBridge(bridge, async () => {
    assert.deepEqual(await copyProductImage({ imageUrl: '   ' }), { success: false, error: 'No hay foto para copiar.' });
    assert.deepEqual(await downloadProductImage({}), { success: false, error: 'No hay foto para descargar.' });
  });

  assert.equal(llamadas, 0);
});

test('la foto viaja convertida a PNG porque nativeImage no entiende WebP', async () => {
  // Las miniaturas del bucket product-images son WebP: sin esta conversion el
  // portapapeles queda vacio y el usuario pega la nada.
  const source = await readSource('../src/utils/productImageClipboard.js');
  assert.match(source, /canvas\.toDataURL\('image\/png'\)/);
  assert.match(source, /image\.crossOrigin = 'anonymous'/);

  const mainSource = await readSource('../electron-main.cjs');
  assert.match(mainSource, /const image = nativeImage\.createFromBuffer\(buffer\);/);
  assert.match(mainSource, /if \(!image\.isEmpty\(\)\) return image;/);
});

test('el puente expone guardar y copiar la foto, y el main los atiende con el chequeo de origen', async () => {
  const preloadSource = await readSource('../preload.cjs');
  assert.match(preloadSource, /saveProductImage: \(payload\) => ipcRenderer\.invoke\('save-product-image', payload\)/);
  assert.match(preloadSource, /copyImageToClipboard: \(payload\) => ipcRenderer\.invoke\('copy-image-to-clipboard', payload\)/);

  const mainSource = await readSource('../electron-main.cjs');
  assert.match(mainSource, /require\('electron'\)/);
  assert.match(mainSource, /clipboard, nativeImage/);

  for (const channel of ['save-product-image', 'copy-image-to-clipboard']) {
    const start = mainSource.indexOf(`ipcMain.handle('${channel}'`);
    assert.ok(start > 0, `falta el handler de ${channel}`);
    const block = mainSource.slice(start, start + 500);
    assert.match(block, /if \(!isTrustedIpcSender\(event\)\)/, `${channel} tiene que validar el origen`);
  }
});

test('sumar el portapapeles no aflojo la seguridad de Electron', async () => {
  const mainSource = await readSource('../electron-main.cjs');
  const start = mainSource.indexOf("preload: path.join(__dirname, 'preload.cjs')");
  assert.ok(start > 0, 'la ventana principal tiene que seguir usando el preload');
  const block = mainSource.slice(start, start + 300);
  assert.match(block, /nodeIntegration: false/);
  assert.match(block, /contextIsolation: true/);
  assert.match(block, /sandbox: true/);
  assert.match(block, /webSecurity: true/);
});

test('el visor ampliado del inventario ofrece descargar y copiar sin tapar la foto', async () => {
  const source = await readSource('../src/components/ProductImageViewer.jsx');
  assert.match(source, /import \{ copyProductImage, downloadProductImage \} from '\.\.\/utils\/productImageClipboard'/);

  // Los botones van en la barra de arriba, no encima de la imagen.
  const headerStart = source.indexOf('<header');
  const headerEnd = source.indexOf('</header>');
  const header = source.slice(headerStart, headerEnd);
  assert.match(header, /runImageAction\('download'\)/);
  assert.match(header, /runImageAction\('copy'\)/);

  // El overlay cierra al hacer clic: sin frenar la propagacion, tocar "Copiar"
  // cerraria el visor antes de que el usuario vea el aviso.
  const clicks = header.match(/event\.stopPropagation\(\); void runImageAction\(/g) || [];
  assert.equal(clicks.length, 2, 'los dos botones tienen que frenar el clic que cierra el visor');
});

test('los botones del visor son usables con el dedo y estan rotulados', async () => {
  const source = await readSource('../src/components/ProductImageViewer.jsx');
  const header = source.slice(source.indexOf('<header'), source.indexOf('</header>'));

  // Las PCs del local son tactiles: 44px de alto minimo en los tres botones.
  const touchTargets = header.match(/h-11/g) || [];
  assert.equal(touchTargets.length, 3, 'descargar, copiar y cerrar miden al menos 44px');
  assert.match(header, /title="Descargar la foto"/);
  assert.match(header, /aria-label="Descargar la foto"/);
  assert.match(header, /title="Copiar la foto para pegarla en WhatsApp o en un mail"/);
  assert.match(header, /aria-label="Copiar la foto al portapapeles"/);
});

test('el visor confirma la copia y no se queda mudo si algo falla', async () => {
  const source = await readSource('../src/components/ProductImageViewer.jsx');
  assert.match(source, /message: action === 'copy' \? 'Copiada' : 'Foto guardada'/);
  assert.match(source, /tone: 'error'/);
  assert.match(source, /aria-live="polite"/);

  // Cancelar el dialogo de guardado no es un error: no se le avisa nada.
  assert.match(source, /if \(result\?\.canceled\) return;/);
});
