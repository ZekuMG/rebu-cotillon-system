import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStockInsights, getRangeDays } from '../src/utils/stockInsights.js';

const inventory = [
  // se vende 3 u. por día y quedan 6: dura 2 días
  { id: 1, title: 'Globo rojo', stock: 6, purchasePrice: 100, price: 200, product_type: 'quantity' },
  // por peso: 300 g por día, quedan 3 kg: dura 10 días
  { id: 2, title: 'Confites', stock: 3000, purchasePrice: 5, price: 10, product_type: 'weight' },
  // no se vendió nada en el período y tiene stock: plata parada
  { id: 3, title: 'Vela dorada', stock: 40, purchasePrice: 500, price: 900, product_type: 'quantity' },
  // sin stock pero se vende: reponer ya
  { id: 4, title: 'Bengala', stock: 0, purchasePrice: 50, price: 120, product_type: 'quantity' },
  // sin stock y sin ventas: no aparece en ninguna lista
  { id: 5, title: 'Piñata vieja', stock: 0, purchasePrice: 900, price: 2000, product_type: 'quantity' },
  // inactivo: se ignora
  { id: 6, title: 'Discontinuado', stock: 10, purchasePrice: 10, price: 20, is_active: false },
];

const productStats = [
  { key: '1', name: 'Globo rojo', qty: 30, revenue: 6000, type: 'quantity' },
  { key: '2', name: 'Confites', qty: 3000, revenue: 30000, type: 'weight' },
  { key: '4', name: 'Bengala', qty: 5, revenue: 600, type: 'quantity' },
  { key: '7', name: '*Item suelto', qty: 2, revenue: 100, type: 'quantity' },
];

test('días del rango', () => {
  const start = new Date(2026, 8, 14, 0, 0, 0);
  const end = new Date(2026, 9, 13, 23, 59, 59, 999);
  assert.equal(getRangeDays({ start, end }), 30);
  // "Todo el historial": cuenta desde la primera venta
  assert.equal(getRangeDays({ start: null, end }, new Date(2026, 9, 4)), 10);
  assert.equal(getRangeDays({ start: null, end }, null), 0);
});

test('días de stock al ritmo del período', () => {
  const { coverage } = buildStockInsights({ inventory, productStats, rangeDays: 10 });
  const byId = Object.fromEntries(coverage.map((row) => [row.id, row]));
  assert.equal(byId[1].daysOfStock, 2);
  assert.equal(byId[2].daysOfStock, 10);
  assert.equal(byId[4].daysOfStock, 0);
  assert.equal(byId[3], undefined, 'sin ventas no tiene ritmo');
});

test('qué reponer primero: lo que se vende y se agota antes', () => {
  const { restock } = buildStockInsights({ inventory, productStats, rangeDays: 10, restockDays: 14 });
  assert.deepEqual(restock.map((row) => row.title), ['Bengala', 'Globo rojo', 'Confites']);
});

test('productos sin ventas: con stock, ordenados por plata parada', () => {
  const { unsold, unsoldCapital } = buildStockInsights({ inventory, productStats, rangeDays: 10 });
  assert.deepEqual(unsold.map((row) => row.title), ['Vela dorada']);
  assert.equal(unsold[0].capital, 40 * 500);
  assert.equal(unsoldCapital, 20000);
});

test('ranking en kg: solo productos por peso, en kilos', () => {
  const { weightRanking } = buildStockInsights({ inventory, productStats, rangeDays: 10 });
  assert.equal(weightRanking.length, 1);
  assert.equal(weightRanking[0].name, 'Confites');
  assert.equal(weightRanking[0].kilos, 3);
});

test('sin días en el rango no inventa ritmos', () => {
  const { coverage, restock } = buildStockInsights({ inventory, productStats, rangeDays: 0 });
  assert.equal(coverage.length, 0);
  assert.equal(restock.length, 0);
});
