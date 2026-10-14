// "Lo importante" de cada pestaña de Métricas: una frase que se entiende sin saber de números
// y dos o tres datos que ayudan a decidir. Igual que el Resumen, no calcula nada nuevo: traduce
// lo que ya arma useMetricsData.
import { formatNumber } from './helpers.js';
import { describeChange, formatMoneyShort, getPreviousLabel } from './metricsStory.js';

const toNumber = (value) => Number(value) || 0;
const count = (n, singular, plural) => `${formatNumber(n)} ${n === 1 ? singular : plural}`;
const per100 = (part, total) => (total > 0 ? Math.round((toNumber(part) / total) * 100) : 0);
const LOW_MARGIN_RATE = 20;

const WEEKDAY_PLURAL = {
  lun: 'los lunes', mar: 'los martes', mie: 'los miércoles', jue: 'los jueves',
  vie: 'los viernes', sab: 'los sábados', dom: 'los domingos',
};

const pickMax = (rows, key) => rows.reduce((best, row) => (
  toNumber(row?.[key]) > toNumber(best?.[key]) ? row : best
), null);

const point = (tone, text) => ({ tone, text });

const buildSales = ({ metrics, isHourlyMode, weeklyRhythm = [] }) => {
  const { stats } = metrics.current;
  if (!stats.salesCount) return { headline: 'No hubo ventas en este período.', points: [] };
  const points = [];
  const best = pickMax(metrics.current.dailySeries || [], 'revenue');
  if (best && toNumber(best.revenue) > 0) {
    points.push(point('good', `${isHourlyMode ? 'El mejor horario fue' : 'El mejor día fue'} ${best.label}: ${formatMoneyShort(best.revenue)}.`));
  }
  const bestWeekday = !isHourlyMode && metrics.rangeDays >= 14 ? pickMax(weeklyRhythm, 'revenue') : null;
  if (bestWeekday && WEEKDAY_PLURAL[bestWeekday.key]) {
    points.push(point('info', `${WEEKDAY_PLURAL[bestWeekday.key][0].toUpperCase()}${WEEKDAY_PLURAL[bestWeekday.key].slice(1)} es cuando más se vende: conviene tener todo repuesto ese día.`));
  }
  const change = describeChange(metrics.changes?.revenue, getPreviousLabel(metrics.rangeDays));
  if (change) points.push(point(change.tone === 'down' ? 'warn' : change.tone === 'up' ? 'good' : 'info', `Vendiste ${change.text}.`));

  return {
    headline: `Vendiste ${formatMoneyShort(stats.revenue)} en ${count(stats.salesCount, 'venta', 'ventas')}: en promedio, ${formatMoneyShort(stats.averageTicket)} por venta.`,
    points,
  };
};

const buildProducts = ({ metrics, canViewProfit }) => {
  const products = metrics.current.allProductStats || metrics.current.productStats || [];
  const revenue = toNumber(metrics.current.stats.revenue);
  const top = products[0];
  if (!top || revenue <= 0) return { headline: 'No se vendieron productos en este período.', points: [] };

  const points = [];
  const top5 = products.slice(0, 5).reduce((sum, row) => sum + toNumber(row.revenue), 0);
  if (products.length > 5) {
    points.push(point('info', `Los 5 que más venden juntan $${per100(top5, revenue)} de cada $100. Que nunca falten.`));
  }
  points.push(point('info', `Se vendieron ${count(products.length, 'producto distinto', 'productos distintos')}.`));
  if (canViewProfit) {
    const lowMargin = products.filter((row) => row.costStatus !== 'missing' && toNumber(row.revenue) > 0 && toNumber(row.marginRate) < LOW_MARGIN_RATE);
    if (lowMargin.length) {
      points.push(point('warn', `${count(lowMargin.length, 'producto deja', 'productos dejan')} menos de $${LOW_MARGIN_RATE} de cada $100 vendidos. Revisá el precio o el costo cargado.`));
    }
  }

  return {
    headline: `${top.name} es lo que más plata trajo: ${formatMoneyShort(top.revenue)} ($${per100(top.revenue, revenue)} de cada $100 vendidos).`,
    points,
  };
};

const buildCategories = ({ metrics, canViewProfit }) => {
  const categories = metrics.current.categoryStats || [];
  const revenue = categories.reduce((sum, row) => sum + toNumber(row.revenue), 0);
  const top = categories[0];
  if (!top || revenue <= 0) return { headline: 'No hubo ventas por categoría en este período.', points: [] };

  const points = [];
  if (categories[1]) {
    points.push(point('info', `Le siguen ${categories[1].name}${categories[2] ? ` y ${categories[2].name}` : ''}.`));
  }
  if (canViewProfit) {
    // Solo categorías con peso real (al menos $5 de cada $100) para no destacar una venta suelta.
    const relevant = categories.filter((row) => row.costStatus !== 'missing' && per100(row.revenue, revenue) >= 5);
    const bestMargin = pickMax(relevant, 'marginRate');
    const worstMargin = relevant.reduce((worst, row) => (
      !worst || toNumber(row.marginRate) < toNumber(worst.marginRate) ? row : worst
    ), null);
    if (bestMargin) {
      points.push(point('good', `${bestMargin.name} es la que más deja: de cada $100 vendidos quedan $${Math.round(toNumber(bestMargin.marginRate))} antes de gastos.`));
    }
    if (worstMargin && worstMargin !== bestMargin && toNumber(worstMargin.marginRate) < LOW_MARGIN_RATE * 1.5) {
      points.push(point('warn', `${worstMargin.name} deja poco: $${Math.round(toNumber(worstMargin.marginRate))} de cada $100.`));
    }
  }

  return {
    headline: `${top.name} es la categoría que más vende: $${per100(top.revenue, revenue)} de cada $100.`,
    points,
  };
};

const buildPayments = ({ metrics }) => {
  const payments = metrics.current.paymentStats || [];
  const total = payments.reduce((sum, row) => sum + toNumber(row.value), 0);
  const top = payments[0];
  if (!top || total <= 0) return { headline: 'No hubo cobros en este período.', points: [] };

  const points = payments.slice(1, 3).map((row) => point('info', `${row.name}: $${per100(row.value, total)} de cada $100 (${formatMoneyShort(row.value)}).`));
  points.push(point('info', 'Tocá un medio de pago para ver sus últimos cobros.'));

  return {
    headline: `La mayoría paga con ${top.name}: $${per100(top.value, total)} de cada $100 que entraron (${formatMoneyShort(top.value)}).`,
    points,
  };
};

const buildClients = ({ metrics }) => {
  const clients = metrics.current.clientStats || [];
  const finalConsumer = metrics.current.finalConsumerStats || {};
  const clientRevenue = clients.reduce((sum, row) => sum + toNumber(row.revenue), 0);
  const total = clientRevenue + toNumber(finalConsumer.revenue);
  if (total <= 0) return { headline: 'No hubo ventas en este período.', points: [] };

  const points = [];
  const recurring = clients.filter((row) => toNumber(row.salesCount) > 1).length;
  if (clients.length) {
    points.push(point(recurring ? 'good' : 'info', `${formatNumber(recurring)} de ${count(clients.length, 'socio', 'socios')} volvieron a comprar en el período.`));
  }
  const newCount = toNumber(metrics.current.memberStats?.newCount);
  if (newCount) points.push(point('good', `Se sumaron ${count(newCount, 'socio nuevo', 'socios nuevos')}.`));
  if (clients[0]) points.push(point('info', `El socio que más compró: ${clients[0].name} (${formatMoneyShort(clients[0].revenue)}).`));

  const share = per100(clientRevenue, total);
  return {
    headline: share >= 50
      ? `Los socios compraron $${share} de cada $100: la mayoría de la plata viene de clientes que conocés.`
      : `Los socios compraron $${share} de cada $100; el resto fue consumidor final (sin socio).`,
    points,
  };
};

const buildProfit = ({ metrics }) => {
  const business = metrics.current.stats.business || {};
  const profit = toNumber(business.businessProfit);
  const collected = toNumber(business.collected);
  if (collected <= 0) return { headline: 'No hubo ventas en este período.', points: [] };

  const points = [];
  const byType = business.byType || {};
  const expenseTypes = [
    { key: 'salaries', label: 'Sueldos' },
    { key: 'fixed', label: 'Gastos fijos' },
    { key: 'other', label: 'Otros gastos' },
  ].map((type) => ({ ...type, value: toNumber(byType[type.key]) })).filter((type) => type.value > 0);
  const biggest = pickMax(expenseTypes, 'value');
  if (biggest) points.push(point('info', `El gasto más grande fue ${biggest.label.toLowerCase()}: ${formatMoneyShort(biggest.value)}.`));
  const opex = expenseTypes.reduce((sum, type) => sum + type.value, 0);
  if (opex > 0 && toNumber(byType.other) / opex > 0.2) {
    points.push(point('warn', `${formatMoneyShort(byType.other)} están cargados como "Otros". Si alguno es mercadería o un retiro, la ganancia real es distinta.`));
  }
  if (toNumber(business.withdrawals) > 0) {
    points.push(point('info', `Además salieron ${formatMoneyShort(business.withdrawals)} en retiros y préstamos (no cuentan como gasto del negocio).`));
  }

  return {
    headline: profit >= 0
      ? `Después de pagar la mercadería, los sueldos y los gastos, quedaron ${formatMoneyShort(profit)} de ganancia.`
      : `Los gastos superaron a lo que dejaron las ventas: faltaron ${formatMoneyShort(Math.abs(profit))}.`,
    tone: profit >= 0 ? 'good' : 'bad',
    points,
  };
};

const buildStock = ({ metrics, canViewProfit }) => {
  const { stockStats, stockInsights = {} } = metrics;
  const points = [];
  const soldOut = (stockInsights.restock || []).filter((row) => toNumber(row.stock) <= 0).length;
  const runningLow = (stockInsights.restock || []).length - soldOut;
  if (soldOut) points.push(point('bad', `${count(soldOut, 'producto que se vende está agotado', 'productos que se venden están agotados')}: la lista "Qué reponer primero" dice por cuál empezar.`));
  if (runningLow > 0) points.push(point('warn', `${count(runningLow, 'producto se agota', 'productos se agotan')} en menos de ${formatNumber(stockInsights.restockDays || 7)} días al ritmo actual.`));
  if (toNumber(stockInsights.unsoldCapital) > 0 && canViewProfit) {
    points.push(point('info', `${formatMoneyShort(stockInsights.unsoldCapital)} están en productos que no se vendieron en el período.`));
  }
  if (stockStats.expiring?.length) points.push(point('warn', `${count(stockStats.expiring.length, 'producto vence', 'productos vencen')} en los próximos 14 días.`));

  return {
    headline: canViewProfit
      ? `Tenés ${formatMoneyShort(stockStats.totalCost)} invertidos en mercadería; vendida a precio de lista serían ${formatMoneyShort(stockStats.totalRetail)}.`
      : `Hay ${count(toNumber(stockStats.activeProducts), 'producto', 'productos')} en el catálogo; vendido todo a precio de lista serían ${formatMoneyShort(stockStats.totalRetail)}.`,
    points: points.slice(0, 3),
  };
};

const buildOrders = ({ metrics }) => {
  const orders = metrics.orderStats || {};
  if (!toNumber(orders.ordersCount) && !toNumber(orders.budgetsCount)) {
    return { headline: 'No hubo pedidos ni presupuestos en este período.', points: [] };
  }
  const points = [];
  if (toNumber(orders.budgetsCount)) {
    const ofTen = Math.round(toNumber(orders.conversionRate) / 10);
    points.push(point(ofTen >= 5 ? 'good' : 'info', `De cada 10 presupuestos, ${formatNumber(ofTen)} terminaron en pedido.`));
  }
  const mostPending = pickMax(orders.byStatus || [], 'pending');
  if (mostPending && toNumber(mostPending.pending) > 0) {
    points.push(point('warn', `La mayor parte de lo que falta cobrar está en pedidos "${mostPending.name}".`));
  }

  return {
    headline: toNumber(orders.pendingAmount) > 0
      ? `Hay ${count(toNumber(orders.ordersCount), 'pedido', 'pedidos')} por ${formatMoneyShort(orders.totalOrders)} y falta cobrar ${formatMoneyShort(orders.pendingAmount)}.`
      : `Hay ${count(toNumber(orders.ordersCount), 'pedido', 'pedidos')} por ${formatMoneyShort(orders.totalOrders)} y están todos cobrados.`,
    tone: toNumber(orders.pendingAmount) > 0 ? 'warn' : 'good',
    points,
  };
};

const buildCash = ({ metrics }) => {
  const closures = metrics.closureStats || {};
  if (!toNumber(closures.count)) return { headline: 'No se cerró la caja en este período.', points: [] };
  const points = [point('info', `Según los cierres, se vendieron ${formatMoneyShort(closures.totalSales)}.`)];
  if (toNumber(closures.automatic)) {
    points.push(point('info', `${count(toNumber(closures.automatic), 'cierre lo hizo', 'cierres los hizo')} el sistema al llegar el horario de cierre, porque nadie la cerró antes a mano.`));
  }
  return {
    headline: `Se cerró la caja ${count(toNumber(closures.count), 'vez', 'veces')}: ${formatNumber(toNumber(closures.manual))} a mano y ${formatNumber(toNumber(closures.automatic))} automáticamente.`,
    points,
  };
};

const buildUsers = ({ metrics }) => {
  const users = metrics.current.userStats || [];
  const revenue = users.reduce((sum, row) => sum + toNumber(row.revenue), 0);
  const top = users[0];
  if (!top || revenue <= 0) return { headline: 'No hubo ventas en este período.', points: [] };
  const share = per100(top.revenue, revenue);
  const points = users.slice(1, 3).map((row) => point('info', `${row.name}: $${per100(row.revenue, revenue)} de cada $100 (${count(toNumber(row.salesCount), 'venta', 'ventas')}).`));
  if (share >= 90) {
    points.push(point('info', 'Si cada persona entra con su propio usuario al vender, acá se ve quién vende qué.'));
  }
  return {
    headline: share >= 90
      ? `Casi todas las ventas se hicieron con el usuario de ${top.name} ($${share} de cada $100).`
      : `${top.name} hizo la mayor parte de las ventas: $${share} de cada $100.`,
    points,
  };
};

const BUILDERS = {
  sales: buildSales,
  products: buildProducts,
  categories: buildCategories,
  payments: buildPayments,
  clients: buildClients,
  profit: buildProfit,
  stock: buildStock,
  orders: buildOrders,
  cash: buildCash,
  users: buildUsers,
};

// Devuelve { headline, tone?, points: [{ tone, text }] } o null si la pestaña no tiene lectura.
// Con un filtro de ventas (categoría, producto, pago…), Ganancias no puede restar los gastos.
export const buildSectionInsight = (sectionId, context = {}) => {
  const builder = BUILDERS[sectionId];
  if (!builder || !context.metrics) return null;
  if (sectionId === 'profit' && context.isSalesSubset) {
    return {
      headline: 'Con un filtro de ventas activo no se puede calcular la ganancia: los gastos son de todo el negocio.',
      tone: 'warn',
      points: [point('info', 'Quitá el filtro para ver la ganancia real.')],
    };
  }
  const insight = builder(context);
  return { tone: 'info', ...insight, points: (insight.points || []).slice(0, 3) };
};
