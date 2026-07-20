import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getTransactionSnapshotScope,
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
