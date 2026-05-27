import { isTestRecord, isVentaLog, normalizeDate } from './helpers';
import { normalizePaymentBreakdown } from './paymentBreakdown';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const toNumber = (value) => Number(value) || 0;

export const startOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

export const endOfDay = (date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

export const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const parseMetricDate = (value) => {
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

export const formatDateKey = (date) => {
  if (!date) return 'sin-fecha';
  const d = startOfDay(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const formatShortDate = (date) =>
  date ? date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '--/--';

export const getHourKey = (date) => String(date ? date.getHours() : 0).padStart(2, '0');

export const getHourLabel = (dateOrHour) => {
  const hour = typeof dateOrHour === 'number'
    ? dateOrHour
    : dateOrHour
      ? dateOrHour.getHours()
      : 0;
  return `${String(hour).padStart(2, '0')}:00`;
};

export const makeMetricsRange = (filters = {}) => {
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
  if (filters.preset === '7d') return { start: startOfDay(new Date(todayStart.getTime() - 6 * DAY_MS)), end: todayEnd, label: 'Ultimos 7 dias' };
  if (filters.preset === '90d') return { start: startOfDay(new Date(todayStart.getTime() - 89 * DAY_MS)), end: todayEnd, label: 'Ultimos 90 dias' };
  if (filters.preset === 'year') return { start: new Date(now.getFullYear(), 0, 1), end: todayEnd, label: 'Anio actual' };

  return { start: startOfDay(new Date(todayStart.getTime() - 29 * DAY_MS)), end: todayEnd, label: 'Ultimos 30 dias' };
};

export const makeDashboardRange = (globalFilter = 'day') => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  if (globalFilter === 'day') return { start: todayStart, end: todayEnd, label: 'Hoy' };
  if (globalFilter === 'week') return { start: startOfDay(new Date(todayStart.getTime() - 6 * DAY_MS)), end: todayEnd, label: 'Ultimos 7 dias' };
  if (globalFilter === 'month') return { start: startOfDay(new Date(todayStart.getTime() - 29 * DAY_MS)), end: todayEnd, label: 'Ultimos 30 dias' };

  const annualStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  annualStart.setHours(0, 0, 0, 0);
  return { start: annualStart, end: todayEnd, label: 'Ultimos 12 meses' };
};

export const makePreviousRange = (range) => {
  if (!range.start || !range.end) return { start: null, end: null, label: 'Sin comparacion', isComparable: false };
  const duration = Math.max(DAY_MS, range.end.getTime() - range.start.getTime() + 1);
  return {
    start: new Date(range.start.getTime() - duration),
    end: new Date(range.start.getTime() - 1),
    label: 'Periodo anterior',
    isComparable: true,
  };
};

export const isDateInRange = (date, range) => {
  if (!date) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
};

export const getTransactionDate = (tx) =>
  parseMetricDate(tx?.createdAt || tx?.created_at || tx?.sortDate || `${tx?.date || ''} ${tx?.time || tx?.timestamp || ''}`) ||
  parseMetricDate(tx?.date);

export const getRecordDate = (record) =>
  parseMetricDate(record?.createdAt || record?.created_at || record?.date || record?.pickupDate || record?.pickup_date);

export const getClientName = (tx) => {
  if (!tx?.client) return 'Consumidor Final';
  if (typeof tx.client === 'object') return tx.client.name || 'Consumidor Final';
  return tx.client || 'Consumidor Final';
};

export const isFinalConsumerName = (value = '') => {
  const normalized = normalizeText(value);
  return !normalized || ['consumidor final', 'no asociado', 'cliente sin nombre'].includes(normalized);
};

export const getClientKey = (tx) => {
  const name = getClientName(tx);
  const memberNumber = tx?.client?.memberNumber || tx?.memberNumber || '';
  return `${normalizeText(name)}|${memberNumber}`;
};

export const getUserKey = (record = {}) =>
  record.userId || record.user_id || normalizeText(record.user || record.user_name || 'Sistema') || 'sistema';

export const getUserLabel = (record = {}) =>
  record.user || record.user_name || record.userId || record.user_id || 'Sistema';

export const isTemporaryCustomItem = (item = {}) => {
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

export const getExplicitItemUnitCost = (item = {}) =>
  toNumber(
    item.cost ??
      item.unitCost ??
      item.unit_cost ??
      item.purchasePrice ??
      item.purchase_price ??
      item.costPrice ??
      item.cost_price
  );

export const isDiscountItem = (item = {}) =>
  Boolean(item.isDiscount || item.is_discount || item.type === 'discount');

export const getItemDiscountAmount = (item = {}) => {
  if (!isDiscountItem(item)) return 0;
  const explicitTotal = toNumber(item.subtotal ?? item.lineSubtotal ?? item.line_total ?? item.lineTotal ?? item.total);
  if (explicitTotal) return Math.abs(explicitTotal);
  return Math.abs(toNumber(item.price ?? item.unit_price ?? item.newPrice) * getItemQty(item));
};

export const shouldSkipCostItem = (item = {}) =>
  item.isReward || item.is_reward || isDiscountItem(item);

export const getProductId = (item = {}) => item.productId || item.product_id || item.id || null;

export const getMetricProductKey = (item = {}, product = null) => {
  const itemProductId = getProductId(item);
  if (itemProductId !== null && itemProductId !== undefined) return String(itemProductId);
  if (product?.id !== null && product?.id !== undefined) return String(product.id);
  return normalizeText(item.title || item.product_title || item.name);
};

export const getItemQty = (item = {}) => toNumber(item.qty ?? item.quantity ?? 0);

export const buildInventoryLookups = (inventory = []) => {
  const byId = new Map();
  const byTitle = new Map();

  inventory.forEach((product) => {
    if (product?.id !== undefined && product?.id !== null) byId.set(String(product.id), product);
    const title = normalizeText(product?.title);
    if (title) byTitle.set(title, product);
  });

  return { byId, byTitle };
};

export const getLiveProduct = (item, lookups = { byId: new Map(), byTitle: new Map() }) => {
  if (isTemporaryCustomItem(item)) return null;

  const productId = getProductId(item);
  if (productId !== null && productId !== undefined) {
    const byId = lookups.byId.get(String(productId));
    if (byId) return byId;
  }
  return lookups.byTitle.get(normalizeText(item?.title || item?.product_title)) || null;
};

export const getItemRevenue = (item = {}) => {
  const subtotal = toNumber(item.subtotal ?? item.lineSubtotal ?? item.line_total ?? item.lineTotal ?? item.total);
  if (subtotal) return subtotal;
  return toNumber(item.price ?? item.unit_price ?? item.newPrice) * getItemQty(item);
};

export const getItemCost = (item = {}, lookups) => {
  if (shouldSkipCostItem(item)) return 0;

  if (isTemporaryCustomItem(item)) {
    return getExplicitItemUnitCost(item) * getItemQty(item);
  }

  if (item?.isCombo && Array.isArray(item.productsIncluded) && item.productsIncluded.length > 0) {
    const comboQty = toNumber(item.qty ?? item.quantity ?? 1) || 1;
    return item.productsIncluded.reduce((sum, included) => {
      const product = getLiveProduct(included, lookups);
      const qty = toNumber(included.quantity ?? included.qty ?? 1);
      return sum + toNumber(product?.purchasePrice ?? product?.purchase_price ?? included.purchasePrice ?? included.purchase_price ?? included.cost) * qty * comboQty;
    }, 0);
  }

  const product = getLiveProduct(item, lookups);
  return toNumber(product?.purchasePrice ?? product?.purchase_price ?? item.purchasePrice ?? item.purchase_price ?? item.cost) * getItemQty(item);
};

export const getTransactionCost = (tx = {}, lookups) => {
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
      return sum + toNumber(product?.purchasePrice ?? product?.purchase_price ?? change.purchasePrice ?? change.purchase_price ?? change.cost) * qty;
    }, customItemsCost);
  }

  return (tx.items || []).reduce((sum, item) => sum + getItemCost(item, lookups), 0);
};

export const getTransactionProfit = (tx = {}, lookups) =>
  toNumber(tx.total) - getTransactionCost(tx, lookups);

export const getSaleStatus = (tx = {}) => String(tx.status || 'completed').toLowerCase();

export const mergeTransactionsWithLogSales = (transactions = [], dailyLogs = []) => {
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

export const filterTransactionsForSales = ({ transactions, range, filters = {}, lookups }) =>
  transactions
    .map((tx) => ({ ...tx, metricDate: getTransactionDate(tx) }))
    .filter((tx) => {
      if (!isDateInRange(tx.metricDate, range)) return false;
      if (!filters.includeTest && (tx.isTest || isTestRecord(tx))) return false;

      const status = getSaleStatus(tx);
      if (!filters.includeVoided && ['voided', 'deleted'].includes(status)) return false;

      if (filters.status && filters.status !== 'all') {
        if (filters.status === 'restored' && !tx.isRestored) return false;
        if (filters.status !== 'restored' && status !== filters.status) return false;
      }

      if (filters.user && getUserKey(tx) !== filters.user) return false;

      if (filters.payment) {
        const hasPayment = normalizePaymentBreakdown(
          tx.paymentBreakdown,
          tx.payment,
          tx.installments,
          tx.cashReceived,
          tx.cashChange,
          tx.total,
        ).some((line) => line.method === filters.payment);
        if (!hasPayment) return false;
      }

      if (filters.client && getClientKey(tx) !== filters.client) return false;

      if (hasScopedItemFilters(filters)) {
        const hasItem = getTransactionMetricItems(tx, filters, lookups).length > 0;
        if (!hasItem) return false;
      }

      return true;
    });

export const filterExpensesForSales = ({ expenses, range, filters = {} }) =>
  (expenses || [])
    .map((expense) => ({ ...expense, metricDate: getRecordDate(expense) }))
    .filter((expense) => {
      if (!isDateInRange(expense.metricDate, range)) return false;
      if (!filters.includeTest && (expense.isTest || isTestRecord(expense))) return false;
      if (filters.user && getUserKey(expense) !== filters.user) return false;
      if (filters.payment && expense.paymentMethod !== filters.payment) return false;
      return true;
    });

export const filterRecordsByDate = (records, range, filters = {}) =>
  (records || [])
    .map((record) => ({ ...record, metricDate: getRecordDate(record) }))
    .filter((record) => {
      if (!isDateInRange(record.metricDate, range)) return false;
      if (!filters.includeTest && (record.isTest || isTestRecord(record))) return false;
      return true;
    });

export const getItemCategories = (item = {}, product = null) => {
  const raw = Array.isArray(product?.categories) && product.categories.length
    ? product.categories
    : Array.isArray(item.categories) && item.categories.length
      ? item.categories
      : String(product?.category || item.category || 'Sin categoria').split(',');

  const categories = raw.map((category) => String(category || '').trim()).filter(Boolean);
  return categories.length ? categories : ['Sin categoria'];
};

export const getItemProductType = (item = {}, product = null) =>
  product?.product_type || item.product_type || (item.isWeight ? 'weight' : 'quantity');

export const hasScopedItemFilters = (filters = {}) =>
  Boolean(filters.product || filters.category || (filters.productType && filters.productType !== 'all'));

export const itemMatchesMetricFilters = (item = {}, filters = {}, lookups = { byId: new Map(), byTitle: new Map() }) => {
  if (isDiscountItem(item)) return false;

  const product = getLiveProduct(item, lookups);
  const productKey = getMetricProductKey(item, product);
  const matchesProduct = !filters.product || productKey === filters.product;
  const matchesCategory = !filters.category || getItemCategories(item, product).includes(filters.category);
  const matchesType = !filters.productType || filters.productType === 'all' || getItemProductType(item, product) === filters.productType;

  return matchesProduct && matchesCategory && matchesType;
};

export const getTransactionMetricItems = (tx = {}, filters = {}, lookups = { byId: new Map(), byTitle: new Map() }) => {
  const items = Array.isArray(tx.items) ? tx.items : [];
  if (!hasScopedItemFilters(filters)) return items;
  return items.filter((item) => itemMatchesMetricFilters(item, filters, lookups));
};

export const addToMap = (map, key, seed, patch) => {
  const current = map.get(key) || { key, ...seed };
  map.set(key, { ...current, ...patch(current) });
};

export const calculateChange = (current, previous) => {
  if (!previous) return current ? null : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
};

export const sortBy = (items, key, limit = 12) =>
  [...items].sort((a, b) => toNumber(b[key]) - toNumber(a[key])).slice(0, limit);

export const buildSalesDataset = ({
  transactions = [],
  dailyLogs = [],
  expenses = [],
  inventory = [],
  range,
  filters = {},
  lookups: providedLookups,
}) => {
  const lookups = providedLookups || buildInventoryLookups(inventory);
  const mergedTransactions = mergeTransactionsWithLogSales(transactions, dailyLogs);
  const filterDefaults = {
    includeTest: false,
    includeVoided: false,
    status: 'all',
    productType: 'all',
    ...filters,
  };

  const scopedItemFilters = hasScopedItemFilters(filterDefaults);
  const filteredTransactions = filterTransactionsForSales({
    transactions: mergedTransactions,
    range,
    filters: filterDefaults,
    lookups,
  }).map((tx) => {
    const items = Array.isArray(tx.items) ? tx.items : [];
    const metricItems = getTransactionMetricItems(tx, filterDefaults, lookups);
    const originalTotal = toNumber(tx.total);
    const grossItemsRevenue = items.reduce((sum, item) => (
      isDiscountItem(item) ? sum : sum + Math.max(0, getItemRevenue(item))
    ), 0);
    const totalDiscount = items.reduce((sum, item) => sum + getItemDiscountAmount(item), 0);
    const revenue = scopedItemFilters
      ? metricItems.reduce((sum, item) => sum + getItemRevenue(item), 0)
      : originalTotal;
    const cost = scopedItemFilters
      ? metricItems.reduce((sum, item) => sum + getItemCost(item, lookups), 0)
      : getTransactionCost(tx, lookups);
    const discountImpact = scopedItemFilters && grossItemsRevenue > 0
      ? totalDiscount * Math.min(1, Math.max(0, revenue / grossItemsRevenue))
      : 0;
    const profit = revenue - cost - discountImpact;
    return {
      ...tx,
      date: tx.metricDate,
      total: revenue,
      originalTotal,
      items,
      metricItems,
      metricScopeRatio: scopedItemFilters && grossItemsRevenue > 0 ? Math.min(1, Math.max(0, revenue / grossItemsRevenue)) : 1,
      discountImpact,
      stockChanges: Array.isArray(tx.stockChanges) ? tx.stockChanges : [],
      cost,
      profit,
      net: profit,
    };
  });

  const filteredExpenses = filterExpensesForSales({ expenses, range, filters: filterDefaults });

  const revenue = filteredTransactions.reduce((sum, tx) => sum + toNumber(tx.total), 0);
  const cost = filteredTransactions.reduce((sum, tx) => sum + toNumber(tx.cost), 0);
  const discountImpact = filteredTransactions.reduce((sum, tx) => sum + toNumber(tx.discountImpact), 0);
  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
  const itemsSold = filteredTransactions.reduce((sum, tx) => (
    sum + (tx.metricItems || tx.items || []).reduce((itemSum, item) => (
      item?.isDiscount || item?.is_discount ? itemSum : itemSum + getItemQty(item)
    ), 0)
  ), 0);

  return {
    lookups,
    mergedTransactions,
    filteredTransactions,
    filteredExpenses,
    stats: {
      revenue,
      gross: revenue,
      cost,
      discounts: discountImpact,
      discountImpact,
      expenses: totalExpenses,
      profit: revenue - cost - discountImpact - totalExpenses,
      net: revenue - cost - discountImpact - totalExpenses,
      salesCount: filteredTransactions.length,
      count: filteredTransactions.length,
      averageTicket: filteredTransactions.length ? revenue / filteredTransactions.length : 0,
      itemsSold,
    },
  };
};
