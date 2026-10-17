import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

// Corre el script real que la app inyecta en Casa Alberto contra un sitio falso.
const source = readFileSync('electron-main.cjs', 'utf8');
const start = source.indexOf('const getSupplierLinkedDetailPath = ');
const end = source.indexOf('\n`;', source.indexOf('const buildSupplierExtractScript = ')) + 3;
const { getSupplierLinkedDetailPath, buildSupplierExtractScript } = new Function(
  'SUPPLIER_DEFAULT_ORIGIN',
  `${source.slice(start, end)}\nreturn { getSupplierLinkedDetailPath, buildSupplierExtractScript };`,
)('https://cotilloncasaalberto.com.ar');

const ORIGIN = 'https://cotilloncasaalberto.com.ar';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PAGES = {
  '/pedido/index_restringido.php': '<h1>Buscador</h1>',
  '/pedido/resultados.php': '<div class="caja_productos"><img class="producto_imagen" src="/imagen/producto/chica/a451.jpg" width="120" height="120"><div class="producto_txt"><a href="/pedido/detalle.php?idp=451">Antifaz veneciano dorado</a></div><span>Cod: 7790001</span></div>',
  '/pedido/detalle.php?idp=451': '<h1>Antifaz veneciano dorado x12</h1><img src="/imagen/producto/grande/a451.jpg"><img src="/imagen/producto/grande/b451.jpg"><img src="/img/logo.png">',
  '/pedido/detalle.php?idp=999': '<h1>Producto sin fotos</h1>',
};

const withSupplierPage = async (pathname, run) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route(`${ORIGIN}/**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/imagen/producto/')) return route.fulfill({ contentType: 'image/png', body: PNG });
      const body = PAGES[`${url.pathname}${url.search}`];
      return body
        ? route.fulfill({ contentType: 'text/html', body: `<html><body>${body}</body></html>` })
        : route.fulfill({ status: 404, body: '' });
    });
    await page.goto(`${ORIGIN}${pathname}`);
    return await run(page);
  } finally {
    await browser.close();
  }
};

test('arma la ruta de la ficha guardada solo para enlaces de Casa Alberto', () => {
  assert.equal(getSupplierLinkedDetailPath({ casaAlbertoId: '0451' }), '/pedido/detalle.php?idp=451');
  assert.equal(getSupplierLinkedDetailPath({ productUrl: 'http://www.cotilloncasaalberto.com.ar/pedido/detalle.php?idp=77' }), '/pedido/detalle.php?idp=77');
  assert.equal(getSupplierLinkedDetailPath({ productUrl: 'https://otro.com/pedido/detalle.php?idp=77' }), '');
});

test('el script reconoce fichas: la regex no puede quedar convertida en comentario', () => {
  const script = buildSupplierExtractScript('1', 'x');
  assert.match(script, /return \/\\\/pedido\\\/detalle/);
});

test('la búsqueda por código trae las fotos grandes de la ficha', async () => {
  const result = await withSupplierPage('/pedido/resultados.php', (page) => (
    page.evaluate(buildSupplierExtractScript('7790001', 'Antifaz Veneciano Dorado', ''))
  ));
  assert.equal(result.status, 'found');
  assert.equal(result.matchQuality, 'barcode_exact');
  assert.deepEqual(result.candidates.map((candidate) => new URL(candidate.imageUrl).pathname), [
    '/imagen/producto/grande/a451.jpg',
    '/imagen/producto/grande/b451.jpg',
  ]);
});

test('un producto enlazado lee directo su ficha y una ficha sin fotos no devuelve foto', async () => {
  const [linked, empty] = await withSupplierPage('/pedido/index_restringido.php', async (page) => [
    await page.evaluate(buildSupplierExtractScript('7790001', 'Antifaz Veneciano Dorado', 'casa_alberto_link', '/pedido/detalle.php?idp=451')),
    await page.evaluate(buildSupplierExtractScript('7790001', 'Antifaz', 'casa_alberto_link', '/pedido/detalle.php?idp=999')),
  ]);
  assert.equal(linked.status, 'found');
  assert.equal(linked.matchQuality, 'casa_alberto_link');
  assert.equal(linked.casaAlbertoId, '451');
  assert.equal(linked.candidates.length, 2);
  assert.equal(linked.titleSimilarity, 100);
  assert.notEqual(empty.status, 'found');
});
