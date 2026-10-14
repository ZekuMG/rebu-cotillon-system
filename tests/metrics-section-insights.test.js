import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSectionInsight } from '../src/utils/metricsSectionInsights.js';

const baseMetrics = (overrides = {}) => ({
  rangeDays: 30,
  changes: { revenue: 23 },
  current: {
    stats: {
      revenue: 1000000,
      salesCount: 200,
      averageTicket: 5000,
      business: { collected: 1000000, businessProfit: 150000, withdrawals: 0, byType: { salaries: 200000, fixed: 100000, other: 0 } },
    },
    dailySeries: [{ label: '03/10', revenue: 80000 }, { label: '04/10', revenue: 120000 }],
    allProductStats: [],
    categoryStats: [],
    paymentStats: [],
    clientStats: [],
    userStats: [],
    finalConsumerStats: { revenue: 0, salesCount: 0 },
    memberStats: { newCount: 0 },
  },
  stockStats: { totalCost: 0, totalRetail: 0, activeProducts: 0, expiring: [] },
  stockInsights: { restock: [], unsold: [], unsoldCapital: 0, restockDays: 7 },
  orderStats: { ordersCount: 0, budgetsCount: 0, byStatus: [] },
  closureStats: { count: 0, manual: 0, automatic: 0 },
  ...overrides,
});

test('Ventas: frase con total, promedio, mejor día, día de la semana y comparación', () => {
  const insight = buildSectionInsight('sales', {
    metrics: baseMetrics(),
    weeklyRhythm: [{ key: 'vie', revenue: 10 }, { key: 'sab', revenue: 90 }],
  });
  assert.equal(insight.headline, 'Vendiste $1,00 M en 200 ventas: en promedio, $5.000 por venta.');
  assert.match(insight.points[0].text, /El mejor día fue 04\/10: \$120\.000/);
  assert.match(insight.points[1].text, /^Los sábados es cuando más se vende/);
  assert.equal(insight.points[2].text, 'Vendiste 23 % más que los 30 días anteriores.');
  assert.equal(insight.points[2].tone, 'good');
});

test('Ventas: sin ventas lo dice en vez de mostrar ceros', () => {
  const metrics = baseMetrics();
  metrics.current.stats.salesCount = 0;
  assert.equal(buildSectionInsight('sales', { metrics }).headline, 'No hubo ventas en este período.');
});

test('Productos: el que más trajo, cuánto juntan los 5 primeros y los de margen bajo solo con permiso', () => {
  const metrics = baseMetrics();
  metrics.current.allProductStats = [
    { name: 'Globos', revenue: 400000, marginRate: 50 },
    { name: 'Velas', revenue: 200000, marginRate: 10 },
    { name: 'Platos', revenue: 100000, marginRate: 40 },
    { name: 'Vasos', revenue: 100000, marginRate: 40 },
    { name: 'Gorros', revenue: 100000, marginRate: 40 },
    { name: 'Confeti', revenue: 100000, marginRate: 5, costStatus: 'missing' },
  ];
  const withProfit = buildSectionInsight('products', { metrics, canViewProfit: true });
  assert.equal(withProfit.headline, 'Globos es lo que más plata trajo: $400.000 ($40 de cada $100 vendidos).');
  assert.match(withProfit.points[0].text, /Los 5 que más venden juntan \$90 de cada \$100/);
  assert.match(withProfit.points[2].text, /^1 producto deja menos de \$20/);

  const withoutProfit = buildSectionInsight('products', { metrics, canViewProfit: false });
  assert.ok(withoutProfit.points.every((item) => !/menos de \$20/.test(item.text)));
});

test('Categorías: la que más vende y la que más deja, ignorando las que casi no venden', () => {
  const metrics = baseMetrics();
  metrics.current.categoryStats = [
    { name: 'Cotillón', revenue: 600000, marginRate: 55 },
    { name: 'Golosinas', revenue: 380000, marginRate: 18 },
    { name: 'Disfraces', revenue: 20000, marginRate: 90 },
  ];
  const insight = buildSectionInsight('categories', { metrics, canViewProfit: true });
  assert.equal(insight.headline, 'Cotillón es la categoría que más vende: $60 de cada $100.');
  assert.ok(insight.points.some((item) => item.text.startsWith('Cotillón es la que más deja')));
  assert.ok(insight.points.some((item) => item.text === 'Golosinas deja poco: $18 de cada $100.'));
  assert.ok(insight.points.every((item) => !item.text.startsWith('Disfraces es la que más deja')));
});

test('Ganancias: ganancia o faltante en palabras, y aviso de gastos "Otros"', () => {
  const metrics = baseMetrics();
  assert.match(buildSectionInsight('profit', { metrics }).headline, /quedaron \$150\.000 de ganancia/);

  metrics.current.stats.business = {
    collected: 1000000, businessProfit: -50000, withdrawals: 30000,
    byType: { salaries: 100000, fixed: 100000, other: 300000 },
  };
  const loss = buildSectionInsight('profit', { metrics });
  assert.equal(loss.tone, 'bad');
  assert.match(loss.headline, /faltaron \$50\.000/);
  assert.match(loss.points[0].text, /otros gastos: \$300\.000/);
  assert.match(loss.points[1].text, /"Otros"/);
  assert.match(loss.points[2].text, /retiros y préstamos/);
});

test('Ganancias con filtro de ventas: no inventa una ganancia', () => {
  const insight = buildSectionInsight('profit', { metrics: baseMetrics(), isSalesSubset: true });
  assert.equal(insight.tone, 'warn');
  assert.match(insight.headline, /no se puede calcular la ganancia/);
});

test('Stock: plata invertida solo con permiso de ganancias; agotados y por agotarse', () => {
  const metrics = baseMetrics({
    stockStats: { totalCost: 5000000, totalRetail: 9000000, activeProducts: 800, expiring: [{}, {}] },
    stockInsights: { restock: [{ stock: 0 }, { stock: 0 }, { stock: 3 }], unsold: [], unsoldCapital: 100000, restockDays: 7 },
  });
  const withProfit = buildSectionInsight('stock', { metrics, canViewProfit: true });
  assert.match(withProfit.headline, /Tenés \$5,00 M invertidos/);
  assert.match(withProfit.points[0].text, /^2 productos que se venden están agotados/);
  assert.match(withProfit.points[1].text, /^1 producto se agota/);

  const withoutProfit = buildSectionInsight('stock', { metrics, canViewProfit: false });
  assert.doesNotMatch(withoutProfit.headline, /invertidos/);
  assert.ok(withoutProfit.points.every((item) => !/no se vendieron/.test(item.text)));
});

test('Pedidos, Caja y Usuarios: frases simples y casos vacíos', () => {
  assert.equal(buildSectionInsight('orders', { metrics: baseMetrics() }).headline, 'No hubo pedidos ni presupuestos en este período.');
  assert.equal(buildSectionInsight('cash', { metrics: baseMetrics() }).headline, 'No se cerró la caja en este período.');

  const metrics = baseMetrics({
    orderStats: { ordersCount: 4, budgetsCount: 10, totalOrders: 200000, pendingAmount: 50000, conversionRate: 40, byStatus: [{ name: 'Pendiente', pending: 50000 }] },
    closureStats: { count: 3, manual: 2, automatic: 1, totalSales: 300000 },
  });
  metrics.current.userStats = [{ name: 'Sol', revenue: 950000, salesCount: 190 }, { name: 'Ramiro', revenue: 50000, salesCount: 10 }];

  const orders = buildSectionInsight('orders', { metrics });
  assert.equal(orders.headline, 'Hay 4 pedidos por $200.000 y falta cobrar $50.000.');
  assert.equal(orders.points[0].text, 'De cada 10 presupuestos, 4 terminaron en pedido.');

  const cash = buildSectionInsight('cash', { metrics });
  assert.equal(cash.headline, 'Se cerró la caja 3 veces: 2 a mano y 1 automáticamente.');
  assert.match(cash.points[1].text, /^1 cierre lo hizo el sistema/);

  const users = buildSectionInsight('users', { metrics });
  assert.equal(users.headline, 'Casi todas las ventas se hicieron con el usuario de Sol ($95 de cada $100).');
});

test('Pestaña desconocida o sin datos: no hay lectura', () => {
  assert.equal(buildSectionInsight('summary', { metrics: baseMetrics() }), null);
  assert.equal(buildSectionInsight('sales', {}), null);
});
