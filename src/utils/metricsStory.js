// Arma la lectura del Resumen de Métricas en palabras simples: la frase del período, de
// cada $100 a dónde fue la plata y las tareas concretas para hacer. Todo sale de lo que ya
// calcula useMetricsData; acá solo se traduce a algo que se entienda de un vistazo.
import { formatNumber, isTestRecord } from './helpers.js';

const toNumber = (value) => Number(value) || 0;
const count = (n, singular, plural) => `${formatNumber(n)} ${n === 1 ? singular : plural}`;

// "$8,05 M" o "$527.240": sin centavos, para leer rápido.
export const formatMoneyShort = (value) => {
  const amount = toNumber(value);
  const sign = amount < 0 ? '−' : '';
  const abs = Math.abs(amount);
  if (abs >= 1000000) return `${sign}$${formatNumber(abs / 1000000, 2)} M`;
  return `${sign}$${formatNumber(Math.round(abs))}`;
};

export const getPreviousLabel = (rangeDays) => {
  if (rangeDays <= 1) return 'el día anterior';
  if (rangeDays === 7) return 'la semana anterior';
  return `los ${formatNumber(rangeDays)} días anteriores`;
};

// La variación en palabras ("23 % más que los 30 días anteriores"), o null si no hay base.
export const describeChange = (change, previousLabel) => {
  if (!Number.isFinite(change)) return null;
  if (Math.abs(change) < 1) return { tone: 'neutral', text: `igual que ${previousLabel}` };
  return {
    tone: change > 0 ? 'up' : 'down',
    text: `${formatNumber(Math.round(Math.abs(change)))} % ${change > 0 ? 'más' : 'menos'} que ${previousLabel}`,
  };
};

// Con la ganancia, un porcentaje engaña cuando cambia de signo (−462 %): se compara en plata.
export const describeProfitChange = (current, previous, previousLabel, canCompare) => {
  if (!canCompare) return null;
  const now = toNumber(current);
  const before = toNumber(previous);
  if (before > 0 && now > 0) {
    const change = ((now - before) / before) * 100;
    return describeChange(change, previousLabel);
  }
  return {
    tone: now >= before ? 'up' : 'down',
    text: `en ${previousLabel}: ${formatMoneyShort(before)}`,
  };
};

// De cada $100 cobrados: cuánto fue mercadería, sueldos, gastos y cuánto quedó.
export const buildMoneySplit = (business) => {
  const collected = toNumber(business?.collected);
  if (collected <= 0) return null;
  const soldCost = collected - toNumber(business.grossMargin);
  const fixedAndOther = toNumber(business.byType?.fixed) + toNumber(business.byType?.other);
  const profit = toNumber(business.businessProfit);
  const parts = [
    { key: 'cost', short: 'Mercadería', label: 'Mercadería que se vendió', value: soldCost, color: '#0ea5e9' },
    { key: 'salaries', short: 'Sueldos', label: 'Sueldos', value: toNumber(business.byType?.salaries), color: '#8b5cf6' },
    { key: 'fixed', short: 'Gastos', label: 'Alquiler, servicios y otros gastos', value: fixedAndOther, color: '#f59e0b' },
    { key: 'profit', short: 'Ganancia', label: 'Ganancia', value: Math.max(0, profit), color: '#10b981' },
  ].map((part) => ({ ...part, per100: (part.value / collected) * 100 }));

  return {
    parts: parts.filter((part) => part.value > 0),
    profitPer100: (profit / collected) * 100,
    // Si hubo pérdida, los gastos se comieron más que lo cobrado: falta esto por cada $100.
    shortfallPer100: profit < 0 ? (Math.abs(profit) / collected) * 100 : 0,
  };
};

const isActive = (product) =>
  product && product.is_active !== false && !product.isTest && !isTestRecord(product);

const listNames = (rows, getName, limit = 3) => {
  const names = rows.slice(0, limit).map(getName).filter(Boolean);
  const rest = rows.length - names.length;
  return rest > 0 ? `${names.join(', ')} y ${formatNumber(rest)} más` : names.join(', ');
};

// Lo que conviene hacer, de lo más urgente a lo menos. Cada tarea trae su lista completa
// para desplegarla en el Resumen sin tener que ir a otra pestaña.
export const buildActionTasks = ({
  stockInsights,
  inventory = [],
  business,
  canViewProfit = false,
  expiring = [],
} = {}) => {
  const tasks = [];
  const restock = stockInsights?.restock || [];
  const soldOut = restock.filter((row) => row.stock <= 0);
  const runningLow = restock.filter((row) => row.stock > 0);

  if (soldOut.length) {
    tasks.push({
      key: 'soldOut',
      tone: 'danger',
      title: soldOut.length === 1 ? 'Reponer un agotado que se vende' : 'Reponer los agotados que más se venden',
      detail: `${count(soldOut.length, 'sin stock', 'sin stock')}. Empezá por: ${listNames(soldOut, (row) => row.title, 3).replace(/ y \d+ más$/, '')}`,
      why: 'Se vendieron en el período y hoy no hay stock: cada día sin reponer son ventas que se pierden.',
      section: 'stock',
      rows: soldOut.map((row) => ({ name: row.title, raw: row })),
    });
  }

  if (runningLow.length) {
    tasks.push({
      key: 'runningLow',
      tone: 'warning',
      title: 'Pedir lo que se está por agotar',
      detail: `${count(runningLow.length, 'producto se agota', 'productos se agotan')} en menos de ${stockInsights.restockDays} días: ${listNames(runningLow, (row) => row.title)}`,
      why: 'Al ritmo de venta del período, el stock que queda no llega a dos semanas.',
      section: 'stock',
      rows: runningLow.map((row) => ({ name: row.title, raw: row })),
    });
  }

  if (canViewProfit) {
    const belowCost = inventory
      .filter(isActive)
      .filter((product) => toNumber(product.price) > 0 && toNumber(product.purchasePrice) > toNumber(product.price))
      .sort((a, b) => (toNumber(b.purchasePrice) - toNumber(b.price)) - (toNumber(a.purchasePrice) - toNumber(a.price)));
    if (belowCost.length) {
      tasks.push({
        key: 'belowCost',
        tone: 'danger',
        title: `Revisar ${count(belowCost.length, 'precio más bajo', 'precios más bajos')} que el costo`,
        detail: listNames(belowCost, (product) => product.title),
        why: 'Se venden por menos de lo que costaron: cada venta pierde plata. Puede ser un precio viejo o un costo mal cargado.',
        section: 'products',
        rows: belowCost.map((product) => ({ name: product.title, raw: product })),
      });
    }

    const opex = toNumber(business?.operatingExpenses);
    const other = toNumber(business?.byType?.other);
    if (opex > 0 && other / opex > 0.2) {
      tasks.push({
        key: 'untypedExpenses',
        tone: 'warning',
        title: `Clasificar ${count(business.countByType?.other || 0, 'gasto cargado', 'gastos cargados')} como "Otros"`,
        detail: `${formatMoneyShort(other)} sin tipo: si son mercadería o retiros, la ganancia real es otra.`,
        why: 'La ganancia se calcula según el tipo de gasto. La mercadería va al stock y los retiros van aparte; si quedan en "Otros", se restan como gasto y la ganancia parece más chica.',
        section: 'profit',
        rows: [],
      });
    }
  }

  const unsold = stockInsights?.unsold || [];
  if (unsold.length) {
    tasks.push({
      key: 'unsold',
      tone: 'info',
      title: canViewProfit
        ? `Mover ${formatMoneyShort(stockInsights.unsoldCapital)} en productos que no se vendieron`
        : `Mover ${count(unsold.length, 'producto que no se vendió', 'productos que no se vendieron')}`,
      detail: listNames(unsold, (row) => row.title),
      why: 'Tienen stock pero ninguna venta en el período: es plata parada. Sirven para una oferta, un combo o ponerlos más a la vista.',
      section: 'stock',
      rows: unsold.map((row) => ({ name: row.title, raw: row })),
    });
  }

  // Lo vencido sin stock ya no se puede vender: solo cuenta lo que todavía está en el local.
  const toSellFirst = expiring.filter((product) => toNumber(product.stock) > 0);
  if (toSellFirst.length) {
    tasks.push({
      key: 'expiring',
      tone: 'warning',
      title: `Vender primero ${count(toSellFirst.length, 'producto por vencer', 'productos por vencer')}`,
      detail: listNames(toSellFirst, (product) => product.title || product.name),
      why: 'Vencen o vencieron en las próximas dos semanas.',
      section: 'stock',
      rows: toSellFirst.map((product) => ({ name: product.title || product.name, raw: product })),
    });
  }

  return tasks;
};

// Datos curiosos del período que se pueden tocar para ir al detalle.
export const buildHighlights = ({ dailySeries = [], productStats = [], paymentStats = [], hourlyPeak = null, revenue = 0 } = {}) => {
  const highlights = [];
  const bestDay = dailySeries.reduce((best, row) => (toNumber(row.revenue) > toNumber(best?.revenue) ? row : best), null);
  if (bestDay && toNumber(bestDay.revenue) > 0) {
    highlights.push({ key: 'bestDay', label: 'Mejor día', value: bestDay.label, detail: `se vendieron ${formatMoneyShort(bestDay.revenue)}`, section: 'sales' });
  }
  const star = productStats[0];
  if (star && toNumber(star.revenue) > 0) {
    const share = revenue > 0 ? (toNumber(star.revenue) / revenue) * 100 : 0;
    highlights.push({ key: 'star', label: 'Producto estrella', value: star.name, detail: `${formatMoneyShort(star.revenue)} · ${formatNumber(share, 1)} % de lo vendido`, section: 'products' });
  }
  if (hourlyPeak && toNumber(hourlyPeak.salesCount) > 0) {
    highlights.push({ key: 'peak', label: 'Hora con más gente', value: hourlyPeak.label, detail: `${formatNumber(hourlyPeak.salesCount)} ventas en esa hora`, section: 'sales' });
  }
  const totalPaid = paymentStats.reduce((sum, row) => sum + toNumber(row.value), 0);
  const topPayment = paymentStats[0];
  if (topPayment && totalPaid > 0) {
    highlights.push({ key: 'payment', label: 'Cómo pagan más', value: topPayment.name, detail: `${formatNumber((toNumber(topPayment.value) / totalPaid) * 100)} de cada 100 pesos`, section: 'payments' });
  }
  return highlights;
};
