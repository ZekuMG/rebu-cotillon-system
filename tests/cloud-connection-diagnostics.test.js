import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeCloudSourceFailures,
  formatCloudConnectionReport,
} from '../src/utils/cloudConnectionDiagnostics.js';

test('identifica la consulta critica que fallo y conserva su codigo', () => {
  const failures = describeCloudSourceFailures([
    ['productos', { status: 'fulfilled', value: { data: [] } }],
    ['clientes', { status: 'fulfilled', value: { error: { code: '42501', status: 403, message: 'permission denied' } } }],
    ['agenda', { status: 'rejected', reason: new Error('Failed to fetch') }],
  ], ['agenda']);

  assert.deepEqual(failures, [
    { source: 'clientes', critical: true, code: '42501', status: 403, message: 'permission denied' },
    { source: 'agenda', critical: false, code: null, status: null, message: 'Failed to fetch' },
  ]);
});

test('el reporte comparte solo incidentes de nube y datos de diagnostico', () => {
  const report = JSON.parse(formatCloudConnectionReport({
    appVersion: '1.2.52',
    online: true,
    now: new Date('2026-10-19T12:00:00.000Z'),
    entries: [
      { scope: 'checkout', message: 'Datos de una venta' },
      { scope: 'cloud:core', at: '2026-10-19T11:00:00.000Z', code: 'REBU_TIMEOUT', message: 'Carga inicial excedio el tiempo de espera.', elapsedMs: 10000 },
    ],
  }));

  assert.equal(report.appVersion, '1.2.52');
  assert.equal(report.incidents.length, 1);
  assert.equal(report.incidents[0].code, 'REBU_TIMEOUT');
  assert.equal(JSON.stringify(report).includes('Datos de una venta'), false);
});
