import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync('src/App.jsx', 'utf8');

test('la reconciliacion puntual de ventas evita descargar logs cuando la fila ya es completa', () => {
  const start = appSource.indexOf('const fetchTransactionsCloudPayloadByIds');
  const end = appSource.indexOf('const getTransactionCostSignal', start);
  const functionSource = appSource.slice(start, end);

  assert.match(functionSource, /saleRowsRequireHistoryLogs\(salesData\)/);
  assert.doesNotMatch(functionSource, /Promise\.all/);
});

test('Realtime actualiza colecciones chicas sin recargar todo el nucleo', () => {
  assert.match(appSource, /table: 'categories'/);
  assert.match(appSource, /table: 'offers' \}, handleRealtimeOffer/);
  assert.match(appSource, /table: 'rewards' \}, handleRealtimeReward/);
  assert.match(appSource, /table: 'agenda_contacts' \}, handleRealtimeAgendaContact/);
});
