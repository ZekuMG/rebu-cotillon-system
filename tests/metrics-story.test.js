import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildActionTasks,
  buildHighlights,
  buildMoneySplit,
  describeChange,
  describeProfitChange,
  formatMoneyShort,
  getPreviousLabel,
} from '../src/utils/metricsStory.js';

test('plata corta: millones con 2 decimales y pesos sin centavos', () => {
  assert.equal(formatMoneyShort(8052597.4), '$8,05 M');
  assert.equal(formatMoneyShort(527240.55), '$527.241');
  assert.equal(formatMoneyShort(-2194288.58), '−$2,19 M');
  assert.equal(formatMoneyShort(0), '$0');
});

test('variación en palabras', () => {
  const label = getPreviousLabel(30);
  assert.equal(label, 'los 30 días anteriores');
  assert.deepEqual(describeChange(23.1, label), { tone: 'up', text: '23 % más que los 30 días anteriores' });
  assert.deepEqual(describeChange(-7.6, label), { tone: 'down', text: '8 % menos que los 30 días anteriores' });
  assert.equal(describeChange(0.4, label).tone, 'neutral');
  assert.equal(describeChange(null, label), null);
  assert.equal(getPreviousLabel(1), 'el día anterior');
});

test('ganancia que cambia de signo se compara en plata, no en porcentaje', () => {
  const label = 'los 30 días anteriores';
  assert.deepEqual(describeProfitChange(-2194288, 600000, label, true), { tone: 'down', text: 'en los 30 días anteriores: $600.000' });
  assert.equal(describeProfitChange(1500000, 1000000, label, true).text, '50 % más que los 30 días anteriores');
  assert.equal(describeProfitChange(1, 1, label, false), null);
});

const business = {
  collected: 8000000,
  grossMargin: 4000000,
  businessProfit: 1600000,
  operatingExpenses: 2400000,
  byType: { merchandise: 3000000, salaries: 1600000, fixed: 600000, other: 200000, withdrawals: 500000 },
  countByType: { merchandise: 5, salaries: 4, fixed: 3, other: 2, withdrawals: 1 },
};

test('de cada $100: mercadería, sueldos, gastos y ganancia suman 100', () => {
  const split = buildMoneySplit(business);
  const byKey = Object.fromEntries(split.parts.map((part) => [part.key, part.per100]));
  assert.equal(byKey.cost, 50);
  assert.equal(byKey.salaries, 20);
  assert.equal(byKey.fixed, 10);
  assert.equal(byKey.profit, 20);
  assert.equal(split.parts.reduce((sum, part) => sum + part.per100, 0), 100);
  assert.equal(split.shortfallPer100, 0);
});

test('con pérdida no hay porción de ganancia y se informa cuánto faltó', () => {
  const split = buildMoneySplit({ ...business, businessProfit: -800000 });
  assert.equal(split.parts.some((part) => part.key === 'profit'), false);
  assert.equal(split.shortfallPer100, 10);
  assert.equal(buildMoneySplit({ collected: 0 }), null);
});

test('con filtro de categoría: solo costo y margen, sin gastos del negocio', () => {
  const split = buildMoneySplit({ ...business, businessProfit: -5800000 }, { marginOnly: true });
  assert.deepEqual(split.parts.map((part) => [part.key, part.per100]), [['cost', 50], ['profit', 50]]);
  assert.equal(split.parts[1].label, 'Margen (antes de gastos)');
  assert.equal(split.shortfallPer100, 0);
});

const stockInsights = {
  restockDays: 14,
  restock: [
    { id: 1, title: 'Crema chantilly', stock: 0, daysOfStock: 0, revenue: 90000 },
    { id: 2, title: 'Vincha flores', stock: 0, daysOfStock: 0, revenue: 40000 },
    { id: 3, title: 'Globo rojo', stock: 4, daysOfStock: 3, revenue: 20000 },
  ],
  unsold: [{ id: 9, title: 'Vela dorada', stock: 40, capital: 20000 }],
  unsoldCapital: 20000,
};
const inventory = [
  { id: 5, title: 'Gomitas', price: 1.3, purchasePrice: 7.6 },
  { id: 6, title: 'Bien', price: 200, purchasePrice: 100 },
  { id: 7, title: 'Inactivo', price: 1, purchasePrice: 5, is_active: false },
];

test('tareas: agotados primero, después lo que se agota, precios bajo costo y plata parada', () => {
  const tasks = buildActionTasks({ stockInsights, inventory, business, canViewProfit: true });
  assert.deepEqual(tasks.map((task) => task.key), ['soldOut', 'runningLow', 'belowCost', 'unsold']);
  assert.equal(tasks[0].title, 'Reponer los agotados que más se venden');
  assert.equal(tasks[0].detail, '2 sin stock. Empezá por: Crema chantilly, Vincha flores');
  assert.equal(tasks[1].detail, '1 producto se agota en menos de 14 días: Globo rojo');
  assert.deepEqual(tasks[2].rows.map((row) => row.name), ['Gomitas']);
  assert.equal(tasks[3].title, 'Mover $20.000 en productos que no se vendieron');
});

test('sin permiso de ganancias no muestra costos ni plata parada', () => {
  const tasks = buildActionTasks({ stockInsights, inventory, business, canViewProfit: false });
  assert.equal(tasks.some((task) => task.key === 'belowCost'), false);
  assert.equal(tasks.find((task) => task.key === 'unsold').title, 'Mover 1 producto que no se vendió');
});

test('avisa si muchos gastos quedaron como "Otros"', () => {
  const messy = { ...business, operatingExpenses: 6000000, byType: { ...business.byType, other: 5800000 }, countByType: { ...business.countByType, other: 38 } };
  const tasks = buildActionTasks({ stockInsights: { restock: [], unsold: [] }, inventory: [], business: messy, canViewProfit: true });
  assert.equal(tasks[0].key, 'untypedExpenses');
  assert.match(tasks[0].title, /38 gastos/);
});

test('por vencer: solo lo que todavía tiene stock', () => {
  const expiring = [{ title: 'Yogur', stock: 3 }, { title: 'Vencido sin stock', stock: 0 }];
  const tasks = buildActionTasks({ stockInsights: { restock: [], unsold: [] }, expiring });
  assert.equal(tasks[0].title, 'Vender primero 1 producto por vencer');
});

test('datos del período', () => {
  const highlights = buildHighlights({
    dailySeries: [{ label: '25/9', revenue: 100 }, { label: '26/9', revenue: 527240 }],
    productStats: [{ name: 'Crema chantilly', revenue: 185000 }],
    paymentStats: [{ name: 'Mercado Pago', value: 53 }, { name: 'Efectivo', value: 47 }],
    hourlyPeak: { label: '11:00', salesCount: 152 },
    revenue: 8000000,
  });
  assert.deepEqual(highlights.map((item) => item.value), ['26/9', 'Crema chantilly', '11:00', 'Mercado Pago']);
  assert.equal(highlights[3].detail, '53 de cada 100 pesos');
});
