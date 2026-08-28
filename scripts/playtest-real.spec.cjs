// Playtest contra la nube REAL (?demo=0), entrando como Sistema.
// Solo lectura y navegacion + busquedas acotadas a entidades "Test".
// NO abre la caja ni cobra: eso movería la contabilidad del dia.
const { test, expect } = require('playwright/test');
const path = require('path');

const URL_APP = 'http://127.0.0.1:5174/?demo=0';
const CARPETA = process.env.REBU_PLAYTEST_SHOTS
  || path.join(__dirname, '..', 'test-results', 'playtest-real');

const esRuidoDelBot = (url) => /\/api\/operator\//.test(url);

const nuevoEstado = () => ({ errores: [], respuestasMalas: [] });

const prepararPagina = async (page, estado) => {
  page.on('pageerror', (e) => estado.errores.push('pageerror: ' + e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && !esRuidoDelBot(r.url())) {
      estado.respuestasMalas.push(r.status() + ' ' + r.url().replace(/\?.*$/, ''));
    }
  });
};

const entrarComoSistema = async (page) => {
  await page.goto(URL_APP, { waitUntil: 'domcontentloaded' });
  const logo = page.getByRole('button', { name: /Logo de Rebu/i });
  await expect(logo).toBeVisible({ timeout: 30000 });
  for (let i = 0; i < 3; i += 1) {
    await logo.click();
    await page.waitForTimeout(150);
  }
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
};

const foto = (page, nombre) => page.screenshot({ path: path.join(CARPETA, nombre + '.png') });
const tituloDelApartado = (page) => page.locator('header h2').first();

test('nube real: entra como Sistema y carga datos de verdad', async ({ page }) => {
  test.setTimeout(120000);
  const estado = nuevoEstado();
  await prepararPagina(page, estado);
  await entrarComoSistema(page);

  // Si la sesion segura falla, el mensaje lo dice y hay que verlo, no ocultarlo.
  const errorSesion = page.getByText(/No se pudo abrir la sesion segura|Invalid login credentials/i);
  const entro = await Promise.race([
    tituloDelApartado(page).waitFor({ timeout: 45000 }).then(() => true).catch(() => false),
    errorSesion.waitFor({ timeout: 45000 }).then(() => false).catch(() => null),
  ]);
  await foto(page, 'real-01-despues-del-login');
  if (entro !== true) {
    const detalle = await errorSesion.textContent().catch(() => '(sin detalle)');
    console.log('LOGIN FALLO: ' + detalle);
  }
  expect(entro, 'tiene que entrar con Sistema / 1234').toBe(true);

  const modoDemo = await page.getByText('Modo demo local', { exact: true }).isVisible().catch(() => false);
  expect(modoDemo, 'NO puede estar en modo demo: esta prueba es contra la nube').toBe(false);
  console.log('titulo inicial: "' + (await tituloDelApartado(page).textContent()).trim() + '"');
});

test('nube real: los apartados abren con datos de produccion', async ({ page }) => {
  test.setTimeout(180000);
  const estado = nuevoEstado();
  await prepararPagina(page, estado);
  await entrarComoSistema(page);
  await expect(tituloDelApartado(page)).toBeVisible({ timeout: 45000 });

  const apartados = ['Control de Caja', 'Inventario', 'Socios', 'Agenda', 'Pedidos',
    'Métricas', 'Productos (Avanzado)', 'Reportes de Caja', 'Historial de Ventas'];
  const abiertos = [];
  const fallados = [];
  for (const nombre of apartados) {
    const boton = page.getByRole('button', { name: new RegExp(nombre.replace(/[()]/g, '\\$&'), 'i') }).first();
    if (!(await boton.isVisible().catch(() => false))) { fallados.push(nombre + ' (sin boton)'); continue; }
    await boton.click();
    await page.waitForTimeout(2000);
    const t = (await tituloDelApartado(page).textContent().catch(() => '') || '').trim();
    if (t) abiertos.push(nombre + ' ("' + t + '")'); else fallados.push(nombre + ' (sin titulo)');
    await foto(page, 'real-apartado-' + nombre.replace(/[^a-zA-Z]/g, '_'));
  }

  console.log('ABIERTOS  : ' + abiertos.join(' | '));
  console.log('FALLADOS  : ' + (fallados.length ? fallados.join(' ; ') : 'ninguno'));
  console.log('ERRORES JS: ' + (estado.errores.length ? estado.errores.join(' | ') : 'ninguno'));
  console.log('HTTP >=400: ' + (estado.respuestasMalas.length
    ? [...new Set(estado.respuestasMalas)].join(' | ') : 'ninguna'));
  expect(fallados).toEqual([]);
  expect(estado.errores).toEqual([]);
});

test('nube real: el inventario encuentra los productos Test', async ({ page }) => {
  test.setTimeout(120000);
  const estado = nuevoEstado();
  await prepararPagina(page, estado);
  await entrarComoSistema(page);
  await expect(tituloDelApartado(page)).toBeVisible({ timeout: 45000 });

  await page.getByRole('button', { name: /Inventario/i }).first().click();
  await expect(tituloDelApartado(page)).toHaveText(/Inventario/i);
  await page.waitForTimeout(2500);

  await page.getByPlaceholder(/Buscar/i).first().fill('test');
  await page.waitForTimeout(2000);
  await foto(page, 'real-inventario-test');

  const sinResultados = await page.getByText(/No se encontraron productos/i).isVisible().catch(() => false);
  expect(sinResultados, 'buscando "test" tiene que traer los productos de prueba').toBe(false);

  // Los 3 activos de la base: "test por pesoo", "test por nidad", "chocolate test".
  const chocolate = await page.getByText(/chocolate test/i).first().isVisible().catch(() => false);
  console.log('aparece "chocolate test": ' + chocolate);
  expect(chocolate, 'tiene que aparecer el producto Test conocido').toBe(true);
  expect(estado.errores).toEqual([]);
});

test('nube real: Socios encuentra los socios Test', async ({ page }) => {
  test.setTimeout(120000);
  const estado = nuevoEstado();
  await prepararPagina(page, estado);
  await entrarComoSistema(page);
  await expect(tituloDelApartado(page)).toBeVisible({ timeout: 45000 });

  await page.getByRole('button', { name: /Socios/i }).first().click();
  await expect(tituloDelApartado(page)).toHaveText(/Socios/i);
  await page.waitForTimeout(2500);

  await page.getByPlaceholder(/Buscar/i).first().fill('test');
  await page.waitForTimeout(2000);
  await foto(page, 'real-socios-test');

  const test1 = await page.getByText(/test1/i).first().isVisible().catch(() => false);
  console.log('aparece el socio "test1": ' + test1);
  expect(test1, 'tiene que aparecer el socio Test conocido').toBe(true);
  expect(estado.errores).toEqual([]);
});

test('nube real: Casa Alberto carga con datos de produccion', async ({ page }) => {
  test.setTimeout(120000);
  const estado = nuevoEstado();
  await prepararPagina(page, estado);
  await entrarComoSistema(page);
  await expect(tituloDelApartado(page)).toBeVisible({ timeout: 45000 });

  await page.getByRole('button', { name: /Productos \(Avanzado\)/i }).first().click();
  await page.waitForTimeout(2500);
  const entrada = page.getByRole('button', { name: /Casa Alberto/i }).first();
  await expect(entrada).toBeVisible();
  await entrada.click();
  await page.waitForTimeout(3000);
  await foto(page, 'real-casaalberto');

  const resumen = await page.getByText(/ENLACES|Seguimiento de precios/i).first().isVisible().catch(() => false);
  console.log('panel de Casa Alberto con resumen: ' + resumen);
  console.log('ERRORES JS: ' + (estado.errores.length ? estado.errores.join(' | ') : 'ninguno'));
  console.log('HTTP >=400: ' + (estado.respuestasMalas.length
    ? [...new Set(estado.respuestasMalas)].join(' | ') : 'ninguna'));
  expect(resumen, 'tiene que verse el panel de Casa Alberto').toBe(true);
  expect(estado.errores).toEqual([]);
});
