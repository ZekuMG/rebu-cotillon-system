import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeInboxProgress,
  INBOX_BACKGROUND_MAX,
  INBOX_BACKGROUND_MAX_BATCHES,
  INBOX_BACKGROUND_PAGE_SIZE,
  INBOX_CONNECTING_CAP,
  INBOX_FETCHING_CAP,
  INBOX_PAGE_SIZE,
  CONVERSATION_PAGE_SIZE,
  INBOX_SLOW_MS,
  mergeConversationBatches,
  shouldPrefetchMore,
} from '../src/utils/inboxLoadProgress.js';

test('cada fase tiene su texto corto', () => {
  assert.match(describeInboxProgress({ phase: 'connecting' }).label, /Conectando/i);
  assert.match(describeInboxProgress({ phase: 'fetching' }).label, /Trayendo/i);
  assert.equal(describeInboxProgress({ phase: 'ready' }).label, 'Listo');
});

test('conectar avanza con el tiempo pero nunca pasa su techo', () => {
  const arranque = describeInboxProgress({ phase: 'connecting', elapsedMs: 0 });
  const medio = describeInboxProgress({ phase: 'connecting', elapsedMs: 4000 });
  const eterno = describeInboxProgress({ phase: 'connecting', elapsedMs: 600000 });

  assert.equal(arranque.percent, 0);
  assert.ok(medio.percent > arranque.percent);
  assert.ok(eterno.percent > medio.percent);
  assert.ok(eterno.percent < INBOX_CONNECTING_CAP);
});

test('traer conversaciones es proporcional cuando se conoce el total', () => {
  const vacio = describeInboxProgress({ phase: 'fetching', loaded: 0, total: 80 });
  const mitad = describeInboxProgress({ phase: 'fetching', loaded: 40, total: 80 });
  const lleno = describeInboxProgress({ phase: 'fetching', loaded: 80, total: 80 });

  assert.equal(vacio.percent, INBOX_CONNECTING_CAP);
  assert.equal(
    mitad.percent,
    Math.floor(INBOX_CONNECTING_CAP + ((INBOX_FETCHING_CAP - INBOX_CONNECTING_CAP) / 2)),
  );
  assert.equal(lleno.percent, INBOX_FETCHING_CAP);
});

test('sin total el avance se acerca al techo sin llegar', () => {
  const pocas = describeInboxProgress({ phase: 'fetching', loaded: 10, total: null });
  const muchas = describeInboxProgress({ phase: 'fetching', loaded: 400, total: null });

  assert.ok(pocas.percent > INBOX_CONNECTING_CAP);
  assert.ok(muchas.percent > pocas.percent);
  assert.ok(muchas.percent < INBOX_FETCHING_CAP);
});

test('la barra nunca llega a 100 antes de estar lista', () => {
  const casos = [
    { phase: 'connecting', elapsedMs: 9999999 },
    { phase: 'fetching', loaded: 999999, total: null, elapsedMs: 9999999 },
    { phase: 'fetching', loaded: 80, total: 80 },
    // Más cargadas que el total: sigue sin ser "listo".
    { phase: 'fetching', loaded: 500, total: 80 },
  ];
  casos.forEach((caso) => {
    assert.ok(describeInboxProgress(caso).percent < 100, JSON.stringify(caso));
  });
  assert.equal(describeInboxProgress({ phase: 'ready' }).percent, 100);
});

test('el detalle sólo aparece cuando hay números', () => {
  assert.equal(
    describeInboxProgress({ phase: 'fetching', loaded: 12, total: 80 }).detail,
    '12 de 80 conversaciones',
  );
  assert.equal(
    describeInboxProgress({ phase: 'fetching', loaded: 12, total: null }).detail,
    '12 conversaciones',
  );
  assert.equal(
    describeInboxProgress({ phase: 'fetching', loaded: 1, total: null }).detail,
    '1 conversación',
  );
  assert.equal(describeInboxProgress({ phase: 'connecting' }).detail, '');
  assert.equal(
    describeInboxProgress({ phase: 'fetching', loaded: 0, total: null }).detail,
    '',
  );
});

test('el detalle no muestra más cargadas que el total', () => {
  assert.equal(
    describeInboxProgress({ phase: 'fetching', loaded: 500, total: 80 }).detail,
    '80 de 80 conversaciones',
  );
});

test('se avisa recién pasado el umbral de lento', () => {
  assert.equal(describeInboxProgress({ phase: 'connecting', elapsedMs: 0 }).isSlow, false);
  assert.equal(
    describeInboxProgress({ phase: 'connecting', elapsedMs: INBOX_SLOW_MS }).isSlow,
    false,
  );
  assert.equal(
    describeInboxProgress({ phase: 'connecting', elapsedMs: INBOX_SLOW_MS + 1 }).isSlow,
    true,
  );
});

test('los valores rotos no rompen la barra', () => {
  const casos = [
    undefined,
    {},
    { phase: null, loaded: null, total: null, elapsedMs: null },
    { phase: 'ni_idea', loaded: -5, total: -80, elapsedMs: -1000 },
    { phase: 'fetching', loaded: NaN, total: NaN, elapsedMs: NaN },
    { phase: 'fetching', loaded: 'doce', total: 'ochenta', elapsedMs: 'un rato' },
    { phase: 'fetching', loaded: 5, total: 0 },
  ];
  casos.forEach((caso) => {
    const progreso = describeInboxProgress(caso);
    assert.ok(Number.isFinite(progreso.percent), JSON.stringify(caso));
    assert.ok(progreso.percent >= 0 && progreso.percent <= 100, JSON.stringify(caso));
    assert.equal(typeof progreso.label, 'string');
    assert.ok(progreso.label.length > 0);
    assert.equal(typeof progreso.detail, 'string');
    assert.equal(typeof progreso.isSlow, 'boolean');
  });
});

test('una fase desconocida se trata como conectando', () => {
  assert.equal(describeInboxProgress({ phase: 'ni_idea' }).phase, 'connecting');
  assert.equal(describeInboxProgress().phase, 'connecting');
});

test('total en 0 se toma como total desconocido', () => {
  const progreso = describeInboxProgress({ phase: 'fetching', loaded: 5, total: 0 });
  assert.equal(progreso.detail, '5 conversaciones');
  assert.ok(progreso.percent > INBOX_CONNECTING_CAP);
  assert.ok(progreso.percent < INBOX_FETCHING_CAP);
});

test('los lotes son chicos para que se vea llegar la bandeja', () => {
  assert.equal(INBOX_PAGE_SIZE, 10);
  assert.equal(CONVERSATION_PAGE_SIZE, 10);
  assert.ok(INBOX_BACKGROUND_MAX > INBOX_PAGE_SIZE);
});

test('despues del primer lote se pide de a muchas', () => {
  // El primero es chico para pintar rapido; el resto no tiene a nadie mirando
  // una pantalla vacia, y el bot recorta cualquier limite mayor a 80.
  assert.ok(INBOX_BACKGROUND_PAGE_SIZE > INBOX_PAGE_SIZE);
  assert.ok(INBOX_BACKGROUND_PAGE_SIZE <= 80);
});

test('la carga automatica alcanza para una bandeja entera', () => {
  // Con el tope viejo (50) una bandeja de cientos de chats quedaba a medias y
  // habia que apretar el boton decenas de veces.
  assert.ok(INBOX_BACKGROUND_MAX >= 500);
  // Y los pedidos permitidos tienen que alcanzar para llegar a ese tope: si el
  // freno por cantidad de pedidos corta antes, el tope no se cumple nunca.
  const alcanzables = INBOX_PAGE_SIZE
    + (INBOX_BACKGROUND_MAX_BATCHES - 1) * INBOX_BACKGROUND_PAGE_SIZE;
  assert.ok(alcanzables >= INBOX_BACKGROUND_MAX);
});

test('pegar lotes no duplica conversaciones', () => {
  const lote1 = [
    { phone: '5491111', unread_count: 1 },
    { phone: '5492222', unread_count: 0 },
  ];
  const lote2 = [
    // Vuelve el mismo teléfono con datos más nuevos.
    { phone: '5491111', unread_count: 4 },
    { phone: '5493333', unread_count: 0 },
  ];
  const unidos = mergeConversationBatches(lote1, lote2);

  assert.equal(unidos.length, 3);
  assert.deepEqual(unidos.map((row) => row.phone), ['5491111', '5492222', '5493333']);
  // Gana la versión nueva, pero sin moverse de lugar.
  assert.equal(unidos[0].unread_count, 4);
});

test('pegar lotes aguanta datos rotos y descarta filas sin teléfono', () => {
  assert.deepEqual(mergeConversationBatches(null, undefined), []);
  assert.deepEqual(mergeConversationBatches('no es una lista', 42), []);
  assert.deepEqual(
    mergeConversationBatches([{ phone: '' }, { phone: null }, null], [{ phone: '  ' }]),
    [],
  );
  assert.deepEqual(
    mergeConversationBatches([], [{ phone: '5491111' }]).map((row) => row.phone),
    ['5491111'],
  );
});

test('el mismo lote pegado dos veces no crece', () => {
  const lote = [{ phone: '5491111' }, { phone: '5492222' }];
  const unaVez = mergeConversationBatches([], lote);
  const dosVeces = mergeConversationBatches(unaVez, lote);
  assert.equal(dosVeces.length, 2);
});

test('la carga en segundo plano se corta en el tope', () => {
  assert.equal(shouldPrefetchMore({ loaded: 10, cursor: 'abc' }), true);
  assert.equal(
    shouldPrefetchMore({ loaded: INBOX_BACKGROUND_MAX - 10, cursor: 'abc' }),
    true,
  );
  assert.equal(shouldPrefetchMore({ loaded: INBOX_BACKGROUND_MAX, cursor: 'abc' }), false);
  assert.equal(shouldPrefetchMore({ loaded: INBOX_BACKGROUND_MAX + 40, cursor: 'abc' }), false);
});

test('sin cursor no se sigue pidiendo nada', () => {
  assert.equal(shouldPrefetchMore({ loaded: 0, cursor: '' }), false);
  assert.equal(shouldPrefetchMore({ loaded: 0, cursor: null }), false);
  assert.equal(shouldPrefetchMore({ loaded: 0, cursor: '   ' }), false);
  assert.equal(shouldPrefetchMore(), false);
});

test('la carga en segundo plano también se corta por cantidad de pedidos', () => {
  // Aunque el contador de conversaciones no crezca (lotes repetidos), la
  // cadena se corta igual al llegar al tope de pedidos.
  assert.equal(
    shouldPrefetchMore({
      loaded: 10,
      cursor: 'abc',
      batches: INBOX_BACKGROUND_MAX_BATCHES - 1,
    }),
    true,
  );
  assert.equal(
    shouldPrefetchMore({ loaded: 10, cursor: 'abc', batches: INBOX_BACKGROUND_MAX_BATCHES }),
    false,
  );
  assert.equal(
    shouldPrefetchMore({ loaded: 10, cursor: 'abc', batches: 9999 }),
    false,
  );
  // Un contador roto no frena la carga.
  assert.equal(shouldPrefetchMore({ loaded: 10, cursor: 'abc', batches: 'muchos' }), true);
});

test('el tope de segundo plano se puede bajar a mano', () => {
  assert.equal(shouldPrefetchMore({ loaded: 20, cursor: 'abc', max: 30 }), true);
  assert.equal(shouldPrefetchMore({ loaded: 30, cursor: 'abc', max: 30 }), false);
  // Un tope roto no desarma la carga: se usa el de siempre.
  assert.equal(shouldPrefetchMore({ loaded: 20, cursor: 'abc', max: 'mucho' }), true);
  assert.equal(
    shouldPrefetchMore({ loaded: INBOX_BACKGROUND_MAX, cursor: 'abc', max: -5 }),
    false,
  );
});
