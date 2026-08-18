import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APROBAR,
  CONSULTAR,
  NADA,
  REGISTRAR,
  estaAprobado,
  primerPaso,
  puedeAprobar,
  resultadoDeAcceso,
  siguientePaso,
} from '../src/utils/whatsappDeviceAccessPlan.js';

const central = {
  supported: true,
  deviceId: '11111111-1111-4111-8111-111111111111',
  tokenHash: 'abc',
  centralMachineActive: true,
};
const remota = { ...central, centralMachineActive: false };

test('la PC central pregunta a la base en vez de darse por aprobada sola', () => {
  // El bug del 17-ago: la app devolvia "aprobado" sin consultar nada, el bot
  // contestaba 403 y no quedaba forma de aprobar la PC desde ningun lado.
  assert.equal(primerPaso(central), CONSULTAR);
});

test('una PC sin identidad no molesta a la base', () => {
  assert.equal(primerPaso({ supported: false }), NADA);
  assert.equal(primerPaso({ supported: true, deviceId: '', tokenHash: '' }), NADA);
});

test('la central con usuario Sistema se aprueba sola', () => {
  assert.equal(siguientePaso({ device: central, rol: 'sistema', estado: null }), APROBAR);
  assert.equal(siguientePaso({ device: central, rol: 'system', estado: null }), APROBAR);
});

test('la central con otro usuario deja el pedido anotado, no se aprueba', () => {
  // Ramiro es owner: manda para responder y conectar, pero no para habilitar PCs.
  assert.equal(siguientePaso({ device: central, rol: 'owner', estado: null }), REGISTRAR);
});

test('una PC remota queda pendiente hasta que alguien la apruebe', () => {
  assert.equal(siguientePaso({ device: remota, rol: 'seller', estado: null }), REGISTRAR);
  assert.equal(
    siguientePaso({ device: remota, rol: 'seller', estado: { status: 'pending', id: 7 } }),
    NADA,
  );
});

test('un usuario Sistema aprueba un pedido que ya estaba esperando', () => {
  assert.equal(
    siguientePaso({ device: remota, rol: 'sistema', estado: { status: 'pending', id: 7 } }),
    APROBAR,
  );
});

test('lo ya aprobado no se vuelve a pedir ni a aprobar', () => {
  assert.equal(siguientePaso({ device: central, rol: 'sistema', estado: { approved: true } }), NADA);
  assert.equal(siguientePaso({ device: remota, rol: 'seller', estado: { status: 'approved' } }), NADA);
});

test('una falla NUNCA se muestra como aprobada', () => {
  // Antes el catch devolvia approved:true si la PC decia ser la central, y asi
  // se tapaba un 403 real detras de una pantalla que decia estar habilitada.
  const salida = resultadoDeAcceso({ device: central, estado: null, error: new Error('sin red') });
  assert.equal(salida.approved, false);
  assert.equal(salida.status, 'error');
});

test('el estado que se muestra sale de la base, no de la PC', () => {
  assert.equal(resultadoDeAcceso({ device: central, estado: { status: 'pending' } }).approved, false);
  assert.equal(resultadoDeAcceso({ device: central, estado: { approved: true } }).approved, true);
  assert.equal(resultadoDeAcceso({ device: { supported: false } }).status, 'unsupported');
});

test('el rol se lee con o sin tilde y sin importar mayusculas', () => {
  assert.equal(puedeAprobar('Sistema'), true);
  assert.equal(puedeAprobar('SYSTEM'), true);
  assert.equal(puedeAprobar('owner'), false);
  assert.equal(estaAprobado({ status: 'approved' }), true);
  assert.equal(estaAprobado({ status: 'pending' }), false);
});
