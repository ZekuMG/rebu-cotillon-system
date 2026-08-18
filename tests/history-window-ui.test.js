import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLEAN_START_CONFIRM,
  MOSTRAR_TODO_CONFIRM,
  avisoDeBandeja,
  describeHistoryWindow,
  describeImportResult,
  explicacionDelTelefono,
  fechaLarga,
  importButtonLabel,
  olderButtonLabel,
} from '../src/utils/historyWindow.js';

const RECORTADO = {
  muestra_todo: false,
  history_from: '2026-07-27T17:08:55.835Z',
  ocultas: 14,
  importables: 22,
  total_chats: 463,
};

// --- Regla de oro: esto lo lee quien atiende el negocio -------------------
//
// Los textos de esta pantalla los lee alguien que vende cotillon, no un
// programador. Cualquier palabra de la maquinaria que se filtre convierte una
// pantalla util en una pantalla que da miedo tocar.

const PALABRAS_PROHIBIDAS = [
  'ventana de historial', 'cache', 'caché', 'corte', 'endpoint', 'API',
  'account_id', 'history_from', 'batch', 'lote', 'query', 'null', 'timestamp',
  'importables', 'webhook', 'JID', 'lid',
];

const todosLosTextos = () => [
  describeHistoryWindow(RECORTADO).title,
  describeHistoryWindow(RECORTADO).detail,
  describeHistoryWindow({ muestra_todo: true }).title,
  describeHistoryWindow({ muestra_todo: true }).detail,
  avisoDeBandeja(RECORTADO).texto,
  avisoDeBandeja(RECORTADO).accion,
  explicacionDelTelefono(RECORTADO),
  explicacionDelTelefono({ ...RECORTADO, importables: 0 }),
  explicacionDelTelefono({ ...RECORTADO, importables: null, total_chats: null }),
  importButtonLabel(RECORTADO),
  importButtonLabel({ ...RECORTADO, importables: null }),
  olderButtonLabel(RECORTADO, 10),
  olderButtonLabel({ ...RECORTADO, agotado: true }),
  describeImportResult({ importadas: 22, mensajes: 593, ocultas: 14 }).titulo,
  describeImportResult({ importadas: 22, mensajes: 593, ocultas: 14 }).detalle,
  describeImportResult({ importadas: 0, mensajes: 0, ocultas: 0 }).titulo,
  CLEAN_START_CONFIRM.title, CLEAN_START_CONFIRM.detail,
  CLEAN_START_CONFIRM.confirmar, CLEAN_START_CONFIRM.cancelar,
  MOSTRAR_TODO_CONFIRM.title, MOSTRAR_TODO_CONFIRM.detail,
].filter(Boolean);

test('ningun texto de la pantalla usa jerga tecnica', () => {
  for (const texto of todosLosTextos()) {
    for (const prohibida of PALABRAS_PROHIBIDAS) {
      assert.ok(
        !new RegExp(`\\b${prohibida}\\b`, 'i').test(texto),
        `"${prohibida}" no puede aparecer en un texto de usuario: "${texto}"`,
      );
    }
  }
});

test('ningun texto queda con un numero sin reemplazar', () => {
  for (const texto of todosLosTextos()) {
    assert.ok(!/\{\w+\}|undefined|NaN/.test(texto), `texto a medio armar: "${texto}"`);
  }
});

// --- Estado -------------------------------------------------------------

test('sin recorte no se muestra ningun aviso en la bandeja', () => {
  assert.equal(describeHistoryWindow(null).recortado, false);
  assert.equal(describeHistoryWindow({ muestra_todo: true }).recortado, false);
  assert.equal(describeHistoryWindow({ history_from: null }).recortado, false);
  assert.equal(avisoDeBandeja({ muestra_todo: true }), null);
});

test('con recorte el encabezado dice desde cuando se ve, en castellano', () => {
  const estado = describeHistoryWindow(RECORTADO);
  assert.equal(estado.recortado, true);
  assert.match(estado.detail, /27 de julio/);
  assert.match(estado.detail, /sigue guardado/i, 'tiene que decir que no se perdio nada');
});

test('mostrando todo, el encabezado lo dice sin alarmar', () => {
  const estado = describeHistoryWindow({ muestra_todo: true });
  assert.equal(estado.recortado, false);
  assert.match(estado.detail, /todas/i);
});

test('la linea de la bandeja es corta y manda a la seccion', () => {
  const aviso = avisoDeBandeja(RECORTADO);
  assert.match(aviso.texto, /27 de julio/);
  assert.ok(aviso.texto.length <= 70, `demasiado larga para una linea: "${aviso.texto}"`);
  assert.ok(aviso.accion, 'tiene que ofrecer como llegar a la seccion');
});

// --- Traer del telefono --------------------------------------------------

test('el boton del telefono dice cuantas va a traer', () => {
  assert.match(importButtonLabel(RECORTADO), /22/);
  assert.match(importButtonLabel(RECORTADO), /tel[eé]fono/i);
});

test('sin saber cuantas son, el boton no inventa un numero', () => {
  const label = importButtonLabel({ ...RECORTADO, importables: null });
  assert.ok(!/\d/.test(label), `no puede prometer un numero que no sabe: "${label}"`);
});

test('la explicacion avisa que el telefono no entrega todo, sin hablar de @lid', () => {
  const texto = explicacionDelTelefono(RECORTADO);
  assert.match(texto, /22/);
  assert.match(texto, /463/);
  assert.match(texto, /te escriba|escriban|escriba/i, 'tiene que decir como llegan las demas');
});

test('si no hay nada para traer, lo dice en vez de ofrecer un boton inutil', () => {
  const vacio = { ...RECORTADO, importables: 0 };
  assert.equal(describeHistoryWindow(vacio).puedeTraerDelTelefono, false);
  assert.match(explicacionDelTelefono(vacio), /no hay/i);
});

// --- Resultado del import ------------------------------------------------

test('despues de importar dice que trajo y que quedo tapado', () => {
  const r = describeImportResult({ importadas: 22, mensajes: 593, ocultas: 14 });
  assert.match(r.titulo, /22/);
  assert.match(r.detalle, /14/);
  assert.equal(r.ofrecerMostrarTodo, true, 'tiene que ofrecer la salida en el momento');
});

test('si nada queda tapado no ofrece el boton de mas', () => {
  const r = describeImportResult({ importadas: 5, mensajes: 40, ocultas: 0 });
  assert.equal(r.ofrecerMostrarTodo, false);
  assert.ok(!r.detalle || !/todav[ií]a/i.test(r.detalle));
});

test('si no trajo nada lo dice sin sonar a error', () => {
  const r = describeImportResult({ importadas: 0, mensajes: 0, ocultas: 0 });
  assert.match(r.titulo, /no hab[ií]a|ya (?:las )?ten[ií]a|nada nuevo/i);
  assert.equal(r.ofrecerMostrarTodo, false);
});

// --- Lo ya guardado ------------------------------------------------------

test('el boton de lo guardado deja claro que NO es el telefono', () => {
  const label = olderButtonLabel(RECORTADO, 10);
  assert.match(label, /10/);
  assert.ok(!/tel[eé]fono/i.test(label), `no puede confundirse con el del telefono: "${label}"`);
});

test('cuando ya no queda nada atras cambia el boton', () => {
  const agotado = { ...RECORTADO, agotado: true };
  assert.equal(describeHistoryWindow(agotado).puedeTraerMas, false);
  assert.match(olderButtonLabel(agotado), /todas/i);
});

test('sin recorte el boton de lo guardado no tiene texto', () => {
  assert.equal(olderButtonLabel(null), '');
  assert.equal(olderButtonLabel({ muestra_todo: true }), '');
});

// --- Confirmaciones ------------------------------------------------------

test('empezar de cero aclara que no se pierde nada', () => {
  assert.match(CLEAN_START_CONFIRM.detail, /no se borra/i);
  assert.match(CLEAN_START_CONFIRM.detail, /cuando quieras/i);
  assert.ok(CLEAN_START_CONFIRM.confirmar && CLEAN_START_CONFIRM.cancelar);
});

test('mostrar todo avisa que lo ve todo el equipo', () => {
  assert.match(MOSTRAR_TODO_CONFIRM.detail, /todos|equipo/i);
});

// --- Fechas --------------------------------------------------------------

test('las fechas se escriben como las diria una persona', () => {
  assert.equal(fechaLarga('2026-07-27T17:08:55.835Z'), '27 de julio');
  assert.equal(fechaLarga(null), '');
  assert.equal(fechaLarga('no es una fecha'), '');
});

test('una fecha de otro año lleva el año', () => {
  assert.match(fechaLarga('2025-12-03T10:00:00.000Z', new Date('2026-08-18T12:00:00Z')), /2025/);
});
