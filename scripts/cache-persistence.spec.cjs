const { test, expect } = require('playwright/test');

const appUrl = process.env.REBU_SMOKE_URL || 'http://127.0.0.1:5174/?demo=1';

test('el historial completo persiste en IndexedDB y sobrevive una recarga', async ({ page }) => {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

  const snapshot = {
    savedAt: new Date().toISOString(),
    transactionsScope: 'full',
    transactions: [{
      id: 'cache-sale-1',
      total: 700,
      items: [{
        productId: 12287,
        title: 'Producto por peso',
        qty: 100,
        price: 7000,
        subtotal: 700,
        product_type: 'weight',
      }],
    }],
  };

  const saved = await page.evaluate(async (value) => {
    const cache = await import('/src/utils/transactionHistoryCache.js');
    return cache.saveTransactionHistorySnapshot(value);
  }, snapshot);
  expect(saved).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const loaded = await page.evaluate(async () => {
    const cache = await import('/src/utils/transactionHistoryCache.js');
    return cache.loadTransactionHistorySnapshot();
  });

  expect(loaded).toEqual(snapshot);
  expect(loaded.transactions[0].items[0].product_type).toBe('weight');
});

test('una version vieja de IndexedDB se invalida de forma segura', async ({ page }) => {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

  await page.evaluate(async () => {
    const request = indexedDB.open('rebu-offline-history', 1);
    const database = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('snapshots')) {
          request.result.createObjectStore('snapshots', { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('snapshots', 'readwrite');
      transaction.objectStore('snapshots').put({
        key: 'transactions-full',
        cacheVersion: 0,
        savedAt: new Date().toISOString(),
        transactionsScope: 'full',
        transactions: [{ id: 'stale-sale' }],
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  const loaded = await page.evaluate(async () => {
    const cache = await import('/src/utils/transactionHistoryCache.js');
    return cache.loadTransactionHistorySnapshot();
  });
  expect(loaded).toBeNull();
});

test('el mapper recupera items historicos y conserva peso, costo y pago', async ({ page }) => {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  const mapped = await page.evaluate(async () => {
    const { mapSaleRecords } = await import('/src/utils/cloudMappers.js');
    return mapSaleRecords([{
      id: 1035,
      created_at: '2026-04-24T18:50:00.000Z',
      total: 700,
      payment_method: 'Efectivo',
      payment_breakdown: null,
      installments: 0,
      cash_received: 700,
      cash_change: 0,
      points_earned: 0,
      points_spent: 0,
      status: 'completed',
      sale_items: [],
    }], [{
      action: 'Venta Realizada',
      details: {
        transactionId: 1035,
        itemsSnapshot: [{
          productId: 50,
          title: 'Grageas por peso',
          qty: 100,
          price: 7000,
          subtotal: 700,
          product_type: 'weight',
          costAtSale: 350,
        }],
      },
    }]);
  });

  expect(mapped).toHaveLength(1);
  expect(mapped[0].payment).toBe('Efectivo');
  expect(mapped[0].items).toEqual(expect.arrayContaining([
    expect.objectContaining({
      productId: 50,
      product_type: 'weight',
      subtotal: 700,
      costAtSale: 350,
    }),
  ]));
});
