import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getTransactionSnapshotScope,
  saleRowsRequireHistoryLogs,
  shouldUseIncrementalMetricsSync,
  shouldUseIncrementalTransactionSync,
  TRANSACTION_SNAPSHOT_SCOPE_FULL,
  TRANSACTION_SNAPSHOT_SCOPE_PARTIAL,
} from '../src/utils/transactionSync.js';

test('un snapshot anterior sin alcance declarado se considera parcial', () => {
  assert.equal(
    getTransactionSnapshotScope({ transactions: [{ id: 1 }] }),
    TRANSACTION_SNAPSHOT_SCOPE_PARTIAL,
  );
});

test('un snapshot marcado como completo habilita sincronizacion incremental', () => {
  const snapshotScope = getTransactionSnapshotScope({
    transactions: [{ id: 1 }],
    transactionsScope: TRANSACTION_SNAPSHOT_SCOPE_FULL,
  });

  assert.equal(
    shouldUseIncrementalTransactionSync({
      hasExistingTransactions: true,
      snapshotScope,
    }),
    true,
  );
});

test('un marcador completo sin una lista valida no se considera confiable', () => {
  assert.equal(
    getTransactionSnapshotScope({
      transactions: null,
      transactionsScope: TRANSACTION_SNAPSHOT_SCOPE_FULL,
    }),
    TRANSACTION_SNAPSHOT_SCOPE_PARTIAL,
  );
});

test('tener ventas locales no evita la carga completa si el snapshot es parcial', () => {
  assert.equal(
    shouldUseIncrementalTransactionSync({
      hasExistingTransactions: true,
      snapshotScope: TRANSACTION_SNAPSHOT_SCOPE_PARTIAL,
    }),
    false,
  );
});

test('una recarga total nunca se reemplaza por una consulta incremental', () => {
  assert.equal(
    shouldUseIncrementalTransactionSync({
      fullRequested: true,
      hasExistingTransactions: true,
      snapshotScope: TRANSACTION_SNAPSHOT_SCOPE_FULL,
    }),
    false,
  );
});

test('metricas no sincroniza incrementalmente sobre ventas parciales', () => {
  assert.equal(
    shouldUseIncrementalMetricsSync({
      includeTransactions: true,
      hasExistingMetricsData: true,
      hasExistingTransactions: true,
      transactionSnapshotScope: TRANSACTION_SNAPSHOT_SCOPE_PARTIAL,
    }),
    false,
  );
});

test('metricas puede sincronizar incrementalmente cuando las ventas son completas', () => {
  assert.equal(
    shouldUseIncrementalMetricsSync({
      includeTransactions: true,
      hasExistingMetricsData: true,
      hasExistingTransactions: true,
      transactionSnapshotScope: TRANSACTION_SNAPSHOT_SCOPE_FULL,
    }),
    true,
  );
});

test('una venta autocontenida no depende de los logs historicos', () => {
  assert.equal(
    saleRowsRequireHistoryLogs([{
      total: 100,
      payment_breakdown: { cash: 100 },
      cash_received: 100,
      cash_change: 0,
      user_id: 'user-1',
      user_role: 'seller',
      status: 'completed',
      voided_at: null,
      sale_items: [{
        subtotal: 100,
        cost: 40,
        is_custom: false,
        is_discount: false,
        is_combo: false,
        product_type: 'unit',
      }],
    }]),
    false,
  );
});

test('una venta antigua sin columnas criticas exige los logs historicos', () => {
  assert.equal(
    saleRowsRequireHistoryLogs([{
      total: 100,
      sale_items: [{ subtotal: 100 }],
    }]),
    true,
  );
});

test('una venta con total pero sin items exige reconstruccion desde logs', () => {
  assert.equal(
    saleRowsRequireHistoryLogs([{
      total: 100,
      payment_breakdown: {},
      cash_received: null,
      cash_change: null,
      user_id: null,
      user_role: null,
      status: 'completed',
      voided_at: null,
      sale_items: [],
    }]),
    true,
  );
});
