// Playtest general en MODO DEMO. No toca la nube: todo pedido externo se corta.
//
// El unico usuario que ofrece la pantalla de acceso en demo es "Caja". El
// acceso completo (usuario Sistema) se destraba con tres clics en el logo,
// igual que en los smoke tests que ya existian.
const { test, expect } = require('playwright/test');
const path = require('path');

const URL_APP = 'http://127.0.0.1:5174/?demo=1';
const CARPETA = process.env.REBU_PLAYTEST_SHOTS
  || path.join(__dirname, '..', 'test-results', 'playtest');

// El proxy de Vite manda /api/operator/* al bot de WhatsApp (127.0.0.1:3000).
// Si el bot no esta levantado contesta 500. Es ruido del entorno, no de la app.
const esRuidoDelBot = (url) => /\/api\/operator\//.test(url);

const prepararPagina = async (page, estado) => {
  page.on('pageerror', (e) => estado.errores.push('pageerror: ' + e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && !esRuidoDelBot(r.url())) {
      estado.respuestasMalas.push(r.status() + ' ' + r.url());
    }
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (url.protocol.startsWith('http') && !local) {
      estado.externos.push(url.href);
      await route.abort('internetdisconnected');
      return;
    }
    await route.continue();
  });
};

const nuevoEstado = () => ({ externos: [], errores: [], respuestasMalas: [] });

const entrarComoSistema = async (page) => {
  await page.goto(URL_APP, { waitUntil: 'networkidle' });
  const logo = page.getByRole('button', { name: /Logo de Rebu/i });
  for (let i = 0; i < 3; i += 1) {
    await logo.click();
    await page.waitForTimeout(120);
  }
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: /^Ingresar$/i }).click();
  await expect(page.getByText('Modo demo local', { exact: true })).toBeVisible({ timeout: 20000 });
};

const foto = (page, nombre) => page.screenshot({ path: path.join(CARPETA, nombre + '.png') });

const tituloDelApartado = (page) => page.locator('header h2').first();

const APARTADOS = [
  'Control de Caja',
  'Inventario',
  'Punto de Venta',
  'Socios',
  'Agenda',
  'Pedidos',
  'Métricas',
  'Productos (Avanzado)',
  'Reportes de Caja',
  'Historial de Ventas',
];

test('recorrido: cada apartado abre y muestra su titulo', async ({ page }) => {
  const estado = nuevoEstado();
  await prepararPagina(page, estado);
  await entrarComoSistema(page);

  const abiertos = [];
  const fallados = [];
  for (const nombre of APARTADOS) {
    const boton = page.getByRole('button', { name: new RegExp(nombre.replace(/[()]/g, '\\$&'), 'i') }).first();
    if (!(await boton.isVisible().catch(() => false))) {
      fallados.push(nombre + ' -> el boton del menu no aparece');
      continue;
    }
    await boton.click();
    await page.waitForTimeout(900);
    const titulo = (await tituloDelApartado(page).textContent().catch(() => '') || '').trim();
    const contenido = await page.locator('main').first().isVisible().catch(() => false);
    if (titulo && contenido) abiertos.push(nombre + ' ("' + titulo + '")');
    else fallados.push(nombre + ' -> titulo="' + titulo + '" contenido=' + contenido);
    await foto(page, 'apartado-' + nombre.replace(/[^a-zA-Z]/g, '_'));
  }

  console.log('ABIERTOS OK    : ' + abiertos.join(' | '));
  console.log('CON PROBLEMA   : ' + (fallados.length ? fallados.join(' ; ') : 'ninguno'));
  console.log('ERRORES JS     : ' + (estado.errores.length ? estado.errores.join(' | ') : 'ninguno'));
  console.log('RESPUESTAS >=400: ' + (estado.respuestasMalas.length ? estado.respuestasMalas.join(' | ') : 'ninguna'));

  expect(estado.externos, 'en modo demo no puede salir a internet').toEqual([]);
  expect(fallados, 'apartados con problema').toEqual([]);
  expect(estado.errores, 'errores de javascript').toEqual([]);
});

test('productos: el inventario lista y el buscador filtra', async ({ page }) => {
  const estado = nuevoEstado();
  await prepararPagina(page, estado);
  await entrarComoSistema(page);

  await page.getByRole('button', { name: /Inventario/i }).first().click();
  await expect(tituloDelApartado(page)).toHaveText(/Inventario/i);
  await page.waitForTimeout(900);

  await expect(
    page.getByText(/No se encontraron productos/i),
    'el inventario demo tiene que arrancar con productos',
  ).toHaveCount(0);
  await foto(page, 'productos-lista');

  const buscador = page.getByPlaceholder(/Buscar/i).first();
  await buscador.fill('zzzzzz');
  await page.waitForTimeout(800);
  await foto(page, 'productos-busqueda-vacia');
  await expect(
    page.getByText(/No se encontraron productos/i),
    'un filtro imposible tiene que decir que no hay resultados',
  ).toBeVisible();

  await buscador.fill('');
  await page.waitForTimeout(800);
  await expect(
    page.getByText(/No se encontraron productos/i),
    'al limpiar el filtro tienen que volver los productos',
  ).toHaveCount(0);
  await foto(page, 'productos-lista-restaurada');

  expect(estado.errores).toEqual([]);
});

test('ventas: abrir caja, cargar el carrito y ver el total', async ({ page }) => {
  const estado = nuevoEstado();
  await prepararPagina(page, estado);
  await entrarComoSistema(page);

  await page.getByRole('button', { name: /Punto de Venta/i }).first().click();
  await expect(tituloDelApartado(page)).toHaveText(/Punto de Venta/i);
  await page.waitForTimeout(700);
  await foto(page, 'ventas-01-caja-cerrada');

  const abrirCaja = page.getByRole('button', { name: /^Abrir Caja$/i }).first();
  if (await abrirCaja.isVisible().catch(() => false)) {
    await abrirCaja.click();
    await page.waitForTimeout(800);
    const monto = page.locator('input[type="number"], input[inputmode="numeric"]').first();
    if (await monto.isVisible().catch(() => false)) await monto.fill('1000');
    const confirmar = page.getByRole('button', { name: /Abrir|Confirmar|Aceptar|Guardar/i }).last();
    if (await confirmar.isVisible().catch(() => false)) await confirmar.click();
    await page.waitForTimeout(1200);
  }
  await foto(page, 'ventas-02-caja-abierta');

  const sigueCerrada = await page.getByText(/Caja Cerrada/i).first().isVisible().catch(() => false);
  console.log('la caja sigue cerrada despues de intentar abrirla: ' + sigueCerrada);
  expect(sigueCerrada, 'la caja tendria que quedar abierta').toBeFalsy();

  const agregar = page.getByRole('button', { name: /^AGREGAR$/i }).first();
  if (await agregar.isVisible().catch(() => false)) {
    await agregar.click();
    await page.waitForTimeout(800);
  }
  await foto(page, 'ventas-03-con-carrito');
  expect(estado.errores).toEqual([]);
});

test('presupuestos: crear uno con item manual', async ({ page }) => {
  const estado = nuevoEstado();
  await prepararPagina(page, estado);
  await entrarComoSistema(page);

  await page.getByRole('button', { name: /Pedidos/i }).first().click();
  await page.getByRole('button', { name: /Nuevo presupuesto/i }).click();
  const modal = page.locator('.budget-builder-modal');
  await expect(modal).toBeVisible();

  await modal.getByLabel('Nombre').fill('Playtest 28-ago');
  await modal.getByLabel('Telefono').fill('1155667788');
  // Para no socios la app exige nombre, telefono Y nota: sin la nota avisa
  // "Datos incompletos" y no guarda.
  await modal.getByLabel('Nota').fill('Playtest automatico');
  await modal.getByRole('button', { name: /Item manual/i }).click();
  const fila = modal.locator('.budget-builder-item-row').last();
  await fila.getByLabel('Articulo').fill('Globos playtest');
  await fila.getByLabel('Precio/u').fill('2500');
  await expect(modal.getByText('$2.500', { exact: false }).first()).toBeVisible();
  await foto(page, 'presupuesto-01-cargado');

  await modal.getByRole('button', { name: /Guardar presupuesto/i }).click();
  await page.waitForTimeout(1500);
  await foto(page, 'presupuesto-02-despues-de-guardar');

  const quedoElNombre = await page.getByText(/Playtest 28-ago/i).first().isVisible().catch(() => false);
  console.log('despues de guardar se ve el presupuesto: ' + quedoElNombre);
  expect(quedoElNombre, 'el presupuesto guardado tiene que aparecer').toBeTruthy();
  expect(estado.errores).toEqual([]);
});

// La app es de escritorio a proposito: index.css fija --app-min-width: 1024px en
// body, #root y .app-shell. En pantalla chica NO se reacomoda, se desplaza. Lo
// que se verifica aca es que respete ese minimo y siga navegable, no que sea
// responsive: si algun dia se rompe el ancho minimo, esta prueba lo canta.
const ANCHO_MINIMO_ESPERADO = 1024;

test('pantalla chica: respeta el ancho minimo de escritorio y sigue navegable', async ({ page }) => {
  const estado = nuevoEstado();
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 12/13/14
  await prepararPagina(page, estado);
  await entrarComoSistema(page);

  const anchos = [];
  const problemas = [];
  for (const nombre of ['Control de Caja', 'Inventario', 'Punto de Venta', 'Pedidos']) {
    const boton = page.getByRole('button', { name: new RegExp(nombre, 'i') }).first();
    if (!(await boton.isVisible().catch(() => false))) {
      problemas.push(nombre + ' -> el menu no es alcanzable en pantalla chica');
      continue;
    }
    await boton.click();
    await page.waitForTimeout(900);
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    anchos.push(nombre + '=' + ancho + 'px');
    if (ancho !== ANCHO_MINIMO_ESPERADO) {
      problemas.push(nombre + ' -> ancho ' + ancho + 'px, se esperaba ' + ANCHO_MINIMO_ESPERADO);
    }
    const titulo = (await tituloDelApartado(page).textContent().catch(() => '') || '').trim();
    if (!titulo) problemas.push(nombre + ' -> no muestra titulo en pantalla chica');
    await foto(page, 'movil-' + nombre.replace(/[^a-zA-Z]/g, '_'));
  }

  console.log('ANCHOS EN PANTALLA CHICA: ' + anchos.join(' | '));
  console.log('PROBLEMAS: ' + (problemas.length ? problemas.join(' ; ') : 'ninguno'));
  console.log('ERRORES JS: ' + (estado.errores.length ? estado.errores.join(' | ') : 'ninguno'));
  expect(problemas, 'la app tiene que mantener su ancho minimo y seguir navegable').toEqual([]);
  expect(estado.errores).toEqual([]);
});

test('Casa Alberto: el control de costos abre', async ({ page }) => {
  const estado = nuevoEstado();
  await prepararPagina(page, estado);
  await entrarComoSistema(page);

  await page.getByRole('button', { name: /Productos \(Avanzado\)/i }).first().click();
  await page.waitForTimeout(1200);
  await foto(page, 'casaalberto-01-editor');

  const entrada = page.getByRole('button', { name: /Casa Alberto/i }).first();
  await expect(entrada, 'tiene que existir la entrada a Casa Alberto').toBeVisible();
  await entrada.click();
  await page.waitForTimeout(1500);
  await foto(page, 'casaalberto-02-panel');

  const titulo = (await tituloDelApartado(page).textContent().catch(() => '') || '').trim();
  console.log('titulo del apartado avanzado: "' + titulo + '"');
  expect(estado.errores, 'errores de javascript').toEqual([]);
  expect(estado.respuestasMalas, 'respuestas >=400 que no sean del bot').toEqual([]);
});
