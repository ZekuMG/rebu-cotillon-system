import { useMemo } from 'react';
import { formatCurrency, formatNumber, isTestRecord, isVentaLog, normalizeDate } from '../utils/helpers';
import { getPaymentMethodLabel, getPaymentMethodTotals, normalizePaymentBreakdown } from '../utils/paymentBreakdown';
import { buildSalesDataset, getExplicitItemUnitCost } from '../utils/salesMetricsCore';

const DAY_MS = 24 * 60 * 60 * 1000;

const toNumber = (value) => Number(value) || 0;

const startOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const parseAnyDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(raw) || raw.includes('T')) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const normalized = normalizeDate(raw);
  return normalized && !Number.isNaN(normalized.getTime()) ? normalized : null;
};

const formatDateKey = (date) => {
  if (!date) return 'sin-fecha';
  const d = startOfDay(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatShortDate = (date) =>
  date ? date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '--/--';

const getHourKey = (date) => String(date ? date.getHours() : 0).padStart(2, '0');

const getHourLabel = (dateOrHour) => {
  const hour = typeof dateOrHour === 'number'
    ? dateOrHour
    : dateOrHour
      ? dateOrHour.getHours()
      : 0;
  return `${String(hour).padStart(2, '0')}:00`;
};

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const makeRange = (filters = {}) => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  if (filters.preset === 'all') return { start: null, end: null, label: 'Todo el historial' };

  if (filters.preset === 'custom') {
    const start = filters.startDate ? startOfDay(new Date(`${filters.startDate}T00:00:00`)) : null;
    const end = filters.endDate ? endOfDay(new Date(`${filters.endDate}T00:00:00`)) : todayEnd;
    return {
      start: start && !Number.isNaN(start.getTime()) ? start : null,
      end: end && !Number.isNaN(end.getTime()) ? end : todayEnd,
      label: 'Rango personalizado',
    };
  }

  if (filters.preset === 'today') return { start: todayStart, end: todayEnd, label: 'Hoy' };
  if (filters.preset === '7d') return { start: startOfDay(new Date(todayStart.getTime() - 6 * DAY_MS)), end: todayEnd, label: 'Últimos 7 días' };
  if (filters.preset === '90d') return { start: startOfDay(new Date(todayStart.getTime() - 89 * DAY_MS)), end: todayEnd, label: 'Últimos 90 días' };
  if (filters.preset === 'year') return { start: new Date(now.getFullYear(), 0, 1), end: todayEnd, label: 'Año actual' };

  return { start: startOfDay(new Date(todayStart.getTime() - 29 * DAY_MS)), end: todayEnd, label: 'Últimos 30 días' };
};

const makePreviousRange = (range) => {
  if (!range.start || !range.end) return { start: null, end: null, label: 'Sin comparación' };
  const duration = Math.max(DAY_MS, range.end.getTime() - range.start.getTime() + 1);
  return {
    start: new Date(range.start.getTime() - duration),
    end: new Date(range.start.getTime() - 1),
    label: 'Período anterior',
  };
};

const isInRange = (date, range) => {
  if (!date) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
};

const getTransactionDate = (tx) =>
  parseAnyDate(tx?.createdAt || tx?.created_at || tx?.sortDate || `${tx?.date || ''} ${tx?.time || tx?.timestamp || ''}`) ||
  parseAnyDate(tx?.date);

const getRecordDate = (record) =>
  parseAnyDate(record?.createdAt || record?.created_at || record?.date || record?.pickupDate || record?.pickup_date);

const getClientName = (tx) => {
  if (!tx?.client) return 'Consumidor Final';
  if (typeof tx.client === 'object') return tx.client.name || 'Consumidor Final';
  return tx.client || 'Consumidor Final';
};

const isFinalConsumerName = (value = '') => {
  const normalized = normalizeText(value);
  return !normalized || ['consumidor final', 'no asociado', 'cliente sin nombre'].includes(normalized);
};

const getClientKey = (tx) => {
  const name = getClientName(tx);
  const memberNumber = tx?.client?.memberNumber || tx?.memberNumber || '';
  return `${normalizeText(name)}|${memberNumber}`;
};

const getUserKey = (record = {}) => record.userId || record.user_id || normalizeText(record.user || record.user_name || 'Sistema') || 'sistema';

const getUserLabel = (record = {}) => record.user || record.user_name || record.userId || record.user_id || 'Sistema';

const isTemporaryCustomItem = (item = {}) => {
  const rawId = String(item.id ?? item.productId ?? item.product_id ?? '');
  const rawTitle = String(item.title ?? item.product_title ?? item.name ?? '').trim();
  const hasProductIdentity = Boolean(item.id ?? item.productId ?? item.product_id);
  const isKnownNonInventoryItem = Boolean(
    item.isCombo ||
    item.is_combo ||
    item.isDiscount ||
    item.is_discount ||
    item.isReward ||
    item.is_reward
  );

  return Boolean(
    item.isCustom ||
    item.is_custom ||
    item.isTemporary ||
    item.isTemporaryCustom ||
    item.type === 'custom' ||
    item.itemType === 'custom' ||
    rawTitle.startsWith('*') ||
    ['custom_', 'temp-'].some((prefix) => rawId.startsWith(prefix)) ||
    (!hasProductIdentity && !isKnownNonInventoryItem)
  );
};

const shouldSkipCostItem = (item = {}) =>
  item.isReward || item.is_reward || item.isDiscount || item.is_discount || item.type === 'discount';

const getProductId = (item = {}) => item.productId || item.product_id || item.id || null;

const getItemQty = (item = {}) => toNumber(item.qty ?? item.quantity ?? 0);

const buildInventoryLookups = (inventory = []) => {
  const byId = new Map();
  const byTitle = new Map();
  inventory.forEach((product) => {
    if (product?.id !== undefined && product?.id !== null) byId.set(String(product.id), product);
    const title = normalizeText(product?.title);
    if (title) byTitle.set(title, product);
  });
  return { byId, byTitle };
};

const getLiveProduct = (item, lookups) => {
  if (isTemporaryCustomItem(item)) return null;

  const productId = getProductId(item);
  if (productId !== null && productId !== undefined) {
    const byId = lookups.byId.get(String(productId));
    if (byId) return byId;
  }
  return lookups.byTitle.get(normalizeText(item?.title || item?.product_title)) || null;
};

const getItemRevenue = (item = {}) => {
  const subtotal = toNumber(item.subtotal ?? item.lineSubtotal ?? item.line_total ?? item.lineTotal ?? item.total);
  if (subtotal) return subtotal;
  return toNumber(item.price ?? item.unit_price ?? item.newPrice) * getItemQty(item);
};

const getItemCost = (item = {}, lookups) => {
  if (shouldSkipCostItem(item)) return 0;

  if (isTemporaryCustomItem(item)) {
    return getExplicitItemUnitCost(item) * getItemQty(item);
  }

  if (item?.isCombo && Array.isArray(item.productsIncluded) && item.productsIncluded.length > 0) {
    const comboQty = toNumber(item.qty ?? item.quantity ?? 1) || 1;
    return item.productsIncluded.reduce((sum, included) => {
      const product = getLiveProduct(included, lookups);
      const qty = toNumber(included.quantity ?? included.qty ?? 1);
      return sum + toNumber(product?.purchasePrice ?? included.purchasePrice ?? included.cost) * qty * comboQty;
    }, 0);
  }

  const product = getLiveProduct(item, lookups);
  return toNumber(product?.purchasePrice ?? item.purchasePrice ?? item.cost) * getItemQty(item);
};

const getTransactionCost = (tx = {}, lookups) => {
  const stockChanges = Array.isArray(tx.stockChanges) ? tx.stockChanges : [];
  const customItemsCost = (tx.items || []).reduce((sum, item) => {
    if (!isTemporaryCustomItem(item) || shouldSkipCostItem(item)) return sum;
    return sum + getItemCost(item, lookups);
  }, 0);

  if (stockChanges.length > 0) {
    return stockChanges.reduce((sum, change) => {
      const productId = change.productId || change.product_id || change.id;
      const product = productId ? lookups.byId.get(String(productId)) : null;
      const qty = Math.abs(toNumber(change.quantitySold ?? change.quantityReserved ?? change.quantityChanged ?? change.quantity ?? change.qty));
      return sum + toNumber(product?.purchasePrice ?? change.purchasePrice ?? change.cost) * qty;
    }, customItemsCost);
  }
  return (tx.items || []).reduce((sum, item) => sum + getItemCost(item, lookups), 0);
};

const getItemCategories = (item = {}, product = null) => {
  const raw = Array.isArray(product?.categories) && product.categories.length
    ? product.categories
    : Array.isArray(item.categories) && item.categories.length
      ? item.categories
      : String(product?.category || item.category || 'Sin categoría').split(',');

  return raw.map((category) => String(category || '').trim()).filter(Boolean).length
    ? raw.map((category) => String(category || '').trim()).filter(Boolean)
    : ['Sin categoría'];
};

const getItemProductType = (item = {}, product = null) =>
  product?.product_type || item.product_type || (item.isWeight ? 'weight' : 'quantity');

const addToMap = (map, key, seed, patch) => {
  const current = map.get(key) || { key, ...seed };
  map.set(key, { ...current, ...patch(current) });
};

const calculateChange = (current, previous) => {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
};

const sortBy = (items, key, limit = 12) =>
  [...items].sort((a, b) => toNumber(b[key]) - toNumber(a[key])).slice(0, limit);

const getSaleStatus = (tx = {}) => String(tx.status || 'completed').toLowerCase();

const mergeTransactionsWithLogSales = (transactions = [], dailyLogs = []) => {
  const merged = Array.isArray(transactions) ? [...transactions] : [];
  const knownTransactionIds = new Set(
    merged
      .map((tx) => tx?.id)
      .filter((id) => id !== undefined && id !== null)
      .map((id) => String(id)),
  );

  (Array.isArray(dailyLogs) ? dailyLogs : []).forEach((log) => {
    if (!isVentaLog(log) || !log?.details || typeof log.details !== 'object') return;

    const details = log.details;
    const transactionId = details.transactionId ?? details.transaction_id ?? details.id ?? null;
    if (transactionId !== null && transactionId !== undefined && knownTransactionIds.has(String(transactionId))) return;

    const id = transactionId ?? `log_${log.id}`;
    if (id !== undefined && id !== null) knownTransactionIds.add(String(id));

    merged.push({
      id,
      source: 'log',
      date: log.date || log.createdAt || log.created_at,
      time: log.timestamp || log.time || '00:00',
      createdAt: log.createdAt || log.created_at || null,
      total: toNumber(details.total),
      payment: details.payment || details.paymentMethod || 'Efectivo',
      paymentBreakdown: details.paymentBreakdown || null,
      installments: details.installments || 0,
      cashReceived: details.cashReceived || 0,
      cashChange: details.cashChange || 0,
      client: details.client,
      items: Array.isArray(details.items) ? details.items : [],
      stockChanges: Array.isArray(details.stockChanges) ? details.stockChanges : [],
      user: details.user || log.user,
      userId: details.userId || details.user_id || log.userId || log.user_id,
      status: details.status || 'completed',
      isTest: Boolean(log.isTest || details.isTest || isTestRecord(log)),
    });
  });

  return merged;
};

const makeFilterOptions = ({ transactions, inventory, members, orders, budgets }) => {
  const users = new Map();
  const payments = new Map();
  const clients = new Map();
  const products = new Map();
  const categories = new Map();

  transactions.forEach((tx) => {
    users.set(getUserKey(tx), getUserLabel(tx));
    normalizePaymentBreakdown(tx.paymentBreakdown, tx.payment, tx.installments, tx.cashReceived, tx.cashChange, tx.total)
      .forEach((line) => payments.set(line.method, getPaymentMethodLabel(line.method)));
    clients.set(getClientKey(tx), getClientName(tx));
    (tx.items || []).forEach((item) => {
      if (item?.isDiscount) return;
      const productId = getProductId(item);
      const productKey = productId ? String(productId) : normalizeText(item.title || item.product_title);
      products.set(productKey, item.title || item.product_title || 'Producto');
      getItemCategories(item).forEach((category) => categories.set(category, category));
    });
  });

  inventory.forEach((product) => {
    const productKey = product.id !== undefined && product.id !== null ? String(product.id) : normalizeText(product.title);
    products.set(productKey, product.title || 'Producto');
    getItemCategories({}, product).forEach((category) => categories.set(category, category));
  });

  [...orders, ...budgets].forEach((record) => {
    if (record.user || record.userId) users.set(getUserKey(record), getUserLabel(record));
  });

  members.forEach((member) => {
    const key = `${normalizeText(member.name)}|${member.memberNumber || ''}`;
    clients.set(key, member.name || 'Socio');
  });

  return {
    users: [...users.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    payments: [...payments.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    clients: [...clients.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    products: [...products.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    categories: [...categories.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
  };
};

const filterTransactions = ({ transactions, range, filters, lookups }) =>
  transactions
    .map((tx) => ({ ...tx, metricDate: getTransactionDate(tx) }))
    .filter((tx) => {
      if (!isInRange(tx.metricDate, range)) return false;
      if (!filters.includeTest && (tx.isTest || isTestRecord(tx))) return false;
      const status = getSaleStatus(tx);
      if (!filters.includeVoided && ['voided', 'deleted'].includes(status)) return false;
      if (filters.status !== 'all') {
        if (filters.status === 'restored' && !tx.isRestored) return false;
        if (filters.status !== 'restored' && status !== filters.status) return false;
      }
      if (filters.user && getUserKey(tx) !== filters.user) return false;
      if (filters.payment) {
        const hasPayment = normalizePaymentBreakdown(tx.paymentBreakdown, tx.payment, tx.installments, tx.cashReceived, tx.cashChange, tx.total)
          .some((line) => line.method === filters.payment);
        if (!hasPayment) return false;
      }
      if (filters.client && getClientKey(tx) !== filters.client) return false;
      if (filters.product || filters.category || filters.productType !== 'all') {
        const hasItem = (tx.items || []).some((item) => {
          const product = getLiveProduct(item, lookups);
          const productKey = getProductId(item) ? String(getProductId(item)) : normalizeText(item.title || item.product_title);
          const matchesProduct = !filters.product || productKey === filters.product;
          const matchesCategory = !filters.category || getItemCategories(item, product).includes(filters.category);
          const matchesType = filters.productType === 'all' || getItemProductType(item, product) === filters.productType;
          return matchesProduct && matchesCategory && matchesType;
        });
        if (!hasItem) return false;
      }
      return true;
    });

const filterExpenses = ({ expenses, range, filters }) =>
  expenses
    .map((expense) => ({ ...expense, metricDate: getRecordDate(expense) }))
    .filter((expense) => {
      if (!isInRange(expense.metricDate, range)) return false;
      if (!filters.includeTest && (expense.isTest || isTestRecord(expense))) return false;
      if (filters.user && getUserKey(expense) !== filters.user) return false;
      if (filters.payment && expense.paymentMethod !== filters.payment) return false;
      return true;
    });

const filterRecordsByDate = (records, range, filters) =>
  (records || [])
    .map((record) => ({ ...record, metricDate: getRecordDate(record) }))
    .filter((record) => {
      if (!isInRange(record.metricDate, range)) return false;
      if (!filters.includeTest && (record.isTest || isTestRecord(record))) return false;
      return true;
    });

const analyzePeriod = ({ transactions, expenses, budgets, orders, closures, range, filters, lookups }) => {
  const isTodayRange = filters.preset === 'today';
  const salesDataset = buildSalesDataset({ transactions, expenses, range, filters, lookups });
  const filteredTransactions = salesDataset.filteredTransactions;
  const filteredExpenses = salesDataset.filteredExpenses;
  const filteredBudgets = filterRecordsByDate(budgets, range, filters);
  const filteredOrders = filterRecordsByDate(orders, range, filters);
  const filteredClosures = filterRecordsByDate(closures, range, filters);

  const periodMap = new Map();
  const productMap = new Map();
  const categoryMap = new Map();
  const paymentMap = new Map();
  const userMap = new Map();
  const clientMap = new Map();
  const hourMap = new Map();
  const weekdayMap = new Map();
  const typeMap = new Map();

  let revenue = 0;
  let cost = 0;
  let itemsSold = 0;

  filteredTransactions.forEach((tx) => {
    const txRevenue = toNumber(tx.total);
    const txCost = toNumber(tx.cost);
    const txProfit = toNumber(tx.profit);
    revenue += txRevenue;
    cost += txCost;

    const periodKey = isTodayRange ? getHourKey(tx.metricDate) : formatDateKey(tx.metricDate);
    const periodLabel = isTodayRange ? getHourLabel(tx.metricDate) : formatShortDate(tx.metricDate);
    addToMap(periodMap, periodKey, { label: periodLabel, revenue: 0, profit: 0, expenses: 0, salesCount: 0 }, (current) => ({
      revenue: current.revenue + txRevenue,
      profit: current.profit + txProfit,
      salesCount: current.salesCount + 1,
    }));

    const hour = tx.metricDate ? tx.metricDate.getHours() : 0;
    addToMap(hourMap, getHourKey(tx.metricDate), { label: getHourLabel(hour), revenue: 0, salesCount: 0 }, (current) => ({
      revenue: current.revenue + txRevenue,
      salesCount: current.salesCount + 1,
    }));

    const weekday = tx.metricDate ? tx.metricDate.toLocaleDateString('es-AR', { weekday: 'short' }) : 's/d';
    addToMap(weekdayMap, weekday, { label: weekday, revenue: 0, salesCount: 0 }, (current) => ({
      revenue: current.revenue + txRevenue,
      salesCount: current.salesCount + 1,
    }));

    const totalsByPayment = getPaymentMethodTotals(tx.paymentBreakdown, tx.payment, tx.installments, tx.cashReceived, tx.cashChange, tx.total);
    Object.entries(totalsByPayment).forEach(([method, amount]) => {
      addToMap(paymentMap, method, { name: method, value: 0, salesCount: 0 }, (current) => ({
        value: current.value + toNumber(amount),
        salesCount: current.salesCount + 1,
      }));
    });

    addToMap(userMap, getUserKey(tx), { name: getUserLabel(tx), revenue: 0, profit: 0, salesCount: 0 }, (current) => ({
      revenue: current.revenue + txRevenue,
      profit: current.profit + txProfit,
      salesCount: current.salesCount + 1,
    }));

    const clientName = getClientName(tx);
    if (!isFinalConsumerName(clientName)) {
      addToMap(clientMap, getClientKey(tx), { name: clientName, revenue: 0, salesCount: 0, lastDate: tx.metricDate }, (current) => ({
        revenue: current.revenue + txRevenue,
        salesCount: current.salesCount + 1,
        lastDate: !current.lastDate || tx.metricDate > current.lastDate ? tx.metricDate : current.lastDate,
      }));
    }

    (tx.items || []).forEach((item) => {
      if (item?.isDiscount) return;
      const product = getLiveProduct(item, lookups);
      const title = item.title || item.product_title || product?.title || 'Producto';
      const qty = getItemQty(item);
      const itemRevenue = getItemRevenue(item);
      const itemCost = getItemCost(item, lookups);
      const productKey = getProductId(item) ? String(getProductId(item)) : normalizeText(title);
      const productType = getItemProductType(item, product);
      const categories = getItemCategories(item, product);
      itemsSold += qty;

      addToMap(productMap, productKey, { name: title, qty: 0, revenue: 0, cost: 0, profit: 0, type: productType }, (current) => ({
        qty: current.qty + qty,
        revenue: current.revenue + itemRevenue,
        cost: current.cost + itemCost,
        profit: current.profit + itemRevenue - itemCost,
      }));

      addToMap(typeMap, productType, { name: productType === 'weight' ? 'Por peso' : 'Por unidad', qty: 0, revenue: 0 }, (current) => ({
        qty: current.qty + qty,
        revenue: current.revenue + itemRevenue,
      }));

      categories.forEach((category) => {
        addToMap(categoryMap, category, { name: category, qty: 0, revenue: 0, cost: 0, profit: 0, products: new Map() }, (current) => {
          const products = new Map(current.products || []);
          const productEntry = products.get(productKey) || { key: productKey, name: title, qty: 0, revenue: 0, cost: 0, profit: 0 };
          products.set(productKey, {
            ...productEntry,
            qty: productEntry.qty + qty,
            revenue: productEntry.revenue + itemRevenue,
            cost: productEntry.cost + itemCost,
            profit: productEntry.profit + itemRevenue - itemCost,
          });

          return {
            qty: current.qty + qty,
            revenue: current.revenue + itemRevenue,
            cost: current.cost + itemCost,
            profit: current.profit + itemRevenue - itemCost,
            products,
          };
        });
      });
    });
  });

  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
  filteredExpenses.forEach((expense) => {
    const periodKey = isTodayRange ? getHourKey(expense.metricDate) : formatDateKey(expense.metricDate);
    const periodLabel = isTodayRange ? getHourLabel(expense.metricDate) : formatShortDate(expense.metricDate);
    addToMap(periodMap, periodKey, { label: periodLabel, revenue: 0, profit: 0, expenses: 0, salesCount: 0 }, (current) => ({
      expenses: current.expenses + toNumber(expense.amount),
      profit: current.profit - toNumber(expense.amount),
    }));
  });

  const stats = {
    revenue,
    cost,
    expenses: totalExpenses,
    profit: revenue - cost - totalExpenses,
    salesCount: filteredTransactions.length,
    averageTicket: filteredTransactions.length ? revenue / filteredTransactions.length : 0,
    itemsSold,
  };

  const periodSeries = [...periodMap.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((day) => ({ ...day }));

  return {
    stats,
    filteredTransactions,
    filteredExpenses,
    filteredBudgets,
    filteredOrders,
    filteredClosures,
    dailySeries: periodSeries,
    periodSeries,
    periodMode: isTodayRange ? 'hour' : 'day',
    periodLabel: isTodayRange ? 'horario' : 'día',
    periodLabelPlural: isTodayRange ? 'horarios' : 'días',
    productStats: sortBy([...productMap.values()].map((item) => ({
      ...item,
      total: item.revenue + item.profit,
      marginRate: item.revenue ? (item.profit / item.revenue) * 100 : 0,
    })), 'revenue', 20),
    categoryStats: sortBy([...categoryMap.values()].map((item) => {
      const products = [...(item.products || new Map()).values()]
        .map((product) => ({
          ...product,
          total: product.revenue + product.profit,
          marginRate: product.revenue ? (product.profit / product.revenue) * 100 : 0,
        }))
        .sort((a, b) => toNumber(b.revenue) - toNumber(a.revenue))
        .slice(0, 12);

      return {
        ...item,
        products: undefined,
        productBreakdown: products,
        total: item.revenue + item.profit,
        marginRate: item.revenue ? (item.profit / item.revenue) * 100 : 0,
      };
    }), 'revenue', 16),
    paymentStats: sortBy([...paymentMap.values()], 'value', 10),
    userStats: sortBy([...userMap.values()].map((item) => ({
      ...item,
      total: item.revenue + item.profit,
      averageTicket: item.salesCount ? item.revenue / item.salesCount : 0,
    })), 'revenue', 12),
    clientStats: sortBy([...clientMap.values()].map((item) => ({
      ...item,
      averageTicket: item.salesCount ? item.revenue / item.salesCount : 0,
      lastDateLabel: item.lastDate ? item.lastDate.toLocaleDateString('es-AR') : '-',
    })), 'revenue', 12),
    hourStats: [...hourMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
    weekdayStats: [...weekdayMap.values()],
    typeStats: sortBy([...typeMap.values()], 'revenue', 4),
  };
};

const buildStockStats = (inventory = []) => {
  const activeProducts = inventory.filter((product) => product.is_active !== false && !product.isTest && !isTestRecord(product));
  const totalCost = activeProducts.reduce((sum, product) => sum + toNumber(product.purchasePrice) * toNumber(product.stock), 0);
  const totalRetail = activeProducts.reduce((sum, product) => sum + toNumber(product.price) * toNumber(product.stock), 0);
  const lowStock = activeProducts.filter((product) => toNumber(product.stock) > 0 && toNumber(product.stock) < 10).sort((a, b) => toNumber(a.stock) - toNumber(b.stock));
  const outOfStock = activeProducts.filter((product) => toNumber(product.stock) <= 0);
  const today = startOfDay(new Date());
  const expiring = activeProducts
    .filter((product) => product.expiration_date)
    .map((product) => {
      const expirationDate = parseAnyDate(product.expiration_date);
      return {
        ...product,
        daysUntil: expirationDate ? Math.ceil((startOfDay(expirationDate).getTime() - today.getTime()) / DAY_MS) : null,
      };
    })
    .filter((product) => product.daysUntil !== null && product.daysUntil <= 14)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  return {
    activeProducts: activeProducts.length,
    totalCost,
    totalRetail,
    projectedMargin: totalRetail - totalCost,
    lowStock,
    outOfStock,
    expiring,
  };
};

const buildOrderStats = (orders = [], budgets = [], range, filters) => {
  const filteredOrders = filterRecordsByDate(orders, range, filters);
  const filteredBudgets = filterRecordsByDate(budgets, range, filters);
  const byStatus = new Map();

  filteredOrders.forEach((order) => {
    const status = order.status || 'Pendiente';
    addToMap(byStatus, status, { name: status, count: 0, total: 0, pending: 0 }, (current) => ({
      count: current.count + 1,
      total: current.total + toNumber(order.totalAmount),
      pending: current.pending + toNumber(order.remainingAmount),
    }));
  });

  const totalOrders = filteredOrders.reduce((sum, order) => sum + toNumber(order.totalAmount), 0);
  const totalBudgets = filteredBudgets.reduce((sum, budget) => sum + toNumber(budget.totalAmount), 0);
  const pendingAmount = filteredOrders.reduce((sum, order) => sum + toNumber(order.remainingAmount), 0);

  return {
    ordersCount: filteredOrders.length,
    budgetsCount: filteredBudgets.length,
    totalOrders,
    totalBudgets,
    pendingAmount,
    conversionRate: filteredBudgets.length ? (filteredOrders.filter((order) => order.budgetId).length / filteredBudgets.length) * 100 : 0,
    byStatus: sortBy([...byStatus.values()], 'total', 10),
  };
};

const buildClosureStats = (closures = [], range, filters) => {
  const filteredClosures = filterRecordsByDate(closures, range, filters);
  const manual = filteredClosures.filter((closure) => !String(closure.type || '').toLowerCase().includes('autom')).length;
  const automatic = filteredClosures.length - manual;
  return {
    count: filteredClosures.length,
    manual,
    automatic,
    totalSales: filteredClosures.reduce((sum, closure) => sum + toNumber(closure.totalSales), 0),
    netProfit: filteredClosures.reduce((sum, closure) => sum + toNumber(closure.netProfit), 0),
    averageTicket: filteredClosures.length
      ? filteredClosures.reduce((sum, closure) => sum + toNumber(closure.averageTicket), 0) / filteredClosures.length
      : 0,
  };
};

const buildRecommendations = ({ current, previous, stockStats, orderStats, members }) => {
  const recommendations = [];
  const revenueChange = calculateChange(current.stats.revenue, previous.stats.revenue);
  const profitChange = calculateChange(current.stats.profit, previous.stats.profit);
  const peakHour = sortBy(current.hourStats, 'salesCount', 1)[0];
  const lowMarginProduct = current.productStats.find((product) => product.revenue > 0 && product.marginRate < 20);

  if (stockStats.outOfStock.length || stockStats.lowStock.length) {
    recommendations.push({
      tone: 'danger',
      title: 'Reponer stock crítico',
      detail: `${stockStats.outOfStock.length} sin stock y ${stockStats.lowStock.length} con menos de 10 unidades.`,
    });
  }

  if (stockStats.expiring.length) {
    recommendations.push({
      tone: 'warning',
      title: 'Productos por vencer',
      detail: `${stockStats.expiring.length} productos vencen o vencieron dentro de la ventana de 14 días.`,
    });
  }

  if (revenueChange < -15) {
    recommendations.push({
      tone: 'warning',
      title: 'Caída de ventas',
      detail: `El ingreso bajó ${formatNumber(Math.abs(revenueChange), 1)}% contra el período anterior.`,
    });
  } else if (revenueChange > 15) {
    recommendations.push({
      tone: 'success',
      title: 'Ventas en crecimiento',
      detail: `El ingreso subió ${formatNumber(revenueChange, 1)}% contra el período anterior.`,
    });
  }

  if (profitChange < -15) {
    recommendations.push({
      tone: 'danger',
      title: 'Revisar rentabilidad',
      detail: `La ganancia neta bajó ${formatNumber(Math.abs(profitChange), 1)}%. Mirá gastos, costos y descuentos.`,
    });
  }

  if (lowMarginProduct) {
    recommendations.push({
      tone: 'warning',
      title: 'Margen bajo',
      detail: `${lowMarginProduct.name} tiene margen estimado de ${formatNumber(lowMarginProduct.marginRate, 1)}%.`,
    });
  }

  if (peakHour) {
    recommendations.push({
      tone: 'info',
      title: 'Horario fuerte',
      detail: `${peakHour.label} concentra ${peakHour.salesCount} ventas por ${formatCurrency(peakHour.revenue)}.`,
    });
  }

  if (orderStats.pendingAmount > 0) {
    recommendations.push({
      tone: 'info',
      title: 'Pedidos con saldo',
      detail: `Hay ${formatCurrency(orderStats.pendingAmount)} pendientes de cobrar en pedidos filtrados.`,
    });
  }

  if ((members || []).length > 0 && current.clientStats.length === 0) {
    recommendations.push({
      tone: 'info',
      title: 'Activar socios',
      detail: 'No hay ventas asociadas a socios en este rango. Puede servir una acción de fidelización.',
    });
  }

  return recommendations.slice(0, 8);
};

export default function useMetricsData({
  transactions = [],
  dailyLogs = [],
  expenses = [],
  pastClosures = [],
  inventory = [],
  members = [],
  budgets = [],
  orders = [],
  filters = {},
}) {
  return useMemo(() => {
    const metricTransactions = mergeTransactionsWithLogSales(transactions, dailyLogs);
    const lookups = buildInventoryLookups(inventory);
    const range = makeRange(filters);
    const previousRange = makePreviousRange(range);
    const filterOptions = makeFilterOptions({ transactions: metricTransactions, inventory, members, orders, budgets });
    const current = analyzePeriod({
      transactions: metricTransactions,
      expenses,
      budgets,
      orders,
      closures: pastClosures,
      range,
      filters,
      lookups,
    });
    const previous = analyzePeriod({
      transactions: metricTransactions,
      expenses,
      budgets,
      orders,
      closures: pastClosures,
      range: previousRange,
      filters,
      lookups,
    });
    const stockStats = buildStockStats(inventory);
    const orderStats = buildOrderStats(orders, budgets, range, filters);
    const closureStats = buildClosureStats(pastClosures, range, filters);
    const recommendations = buildRecommendations({ current, previous, stockStats, orderStats, members });

    return {
      range,
      previousRange,
      filterOptions,
      current,
      previous,
      stockStats,
      orderStats,
      closureStats,
      recommendations,
      changes: {
        revenue: calculateChange(current.stats.revenue, previous.stats.revenue),
        profit: calculateChange(current.stats.profit, previous.stats.profit),
        salesCount: calculateChange(current.stats.salesCount, previous.stats.salesCount),
        averageTicket: calculateChange(current.stats.averageTicket, previous.stats.averageTicket),
      },
    };
  }, [transactions, dailyLogs, expenses, pastClosures, inventory, members, budgets, orders, filters]);
}
