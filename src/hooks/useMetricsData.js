import { useMemo } from 'react';
import { formatCurrency, formatNumber, isTestRecord, isVentaLog } from '../utils/helpers';
import { getPaymentMethodLabel, normalizePaymentBreakdown } from '../utils/paymentBreakdown';
import {
  buildSalesDataset,
  getCostBasisStatus,
  getItemCostInfo,
  getMetricProductKey,
  getTransactionDate,
  parseMetricDate,
} from '../utils/salesMetricsCore';
import {
  getPosBagItemsSummary,
  isPosBagItem,
} from '../utils/posSaleExtras';

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

const parseAnyDate = parseMetricDate;

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
  if (filters.preset === 'yesterday') {
    const yesterday = new Date(todayStart.getTime() - DAY_MS);
    return { start: startOfDay(yesterday), end: endOfDay(yesterday), label: 'Ayer' };
  }
  if (filters.preset === '3d') return { start: startOfDay(new Date(todayStart.getTime() - 2 * DAY_MS)), end: todayEnd, label: 'Últimos 3 días' };
  if (filters.preset === '7d') return { start: startOfDay(new Date(todayStart.getTime() - 6 * DAY_MS)), end: todayEnd, label: 'Últimos 7 días' };
  if (filters.preset === '14d') return { start: startOfDay(new Date(todayStart.getTime() - 13 * DAY_MS)), end: todayEnd, label: 'Últimas 2 semanas' };
  if (filters.preset === '90d') return { start: startOfDay(new Date(todayStart.getTime() - 89 * DAY_MS)), end: todayEnd, label: 'Últimos 90 días' };
  if (filters.preset === 'year') return { start: new Date(now.getFullYear(), 0, 1), end: todayEnd, label: 'Año actual' };

  return { start: startOfDay(new Date(todayStart.getTime() - 29 * DAY_MS)), end: todayEnd, label: 'Últimos 30 días' };
};

const makePreviousRange = (range) => {
  if (!range.start || !range.end) return { start: null, end: null, label: 'Sin comparación', isComparable: false };
  const duration = Math.max(DAY_MS, range.end.getTime() - range.start.getTime() + 1);
  return {
    start: new Date(range.start.getTime() - duration),
    end: new Date(range.start.getTime() - 1),
    label: 'Período anterior',
    isComparable: true,
  };
};

const isInRange = (date, range) => {
  if (!date) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
};

const getRecordDate = (record) =>
  parseAnyDate(
    record?.metricDate ||
      record?.expenseDate ||
      record?.expense_date ||
      record?.createdAt ||
      record?.created_at ||
      record?.date ||
      record?.pickupDate ||
      record?.pickup_date,
  );

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
  return getItemCostInfo(item, lookups).totalCost;
};

const _getTransactionCost = (tx = {}, lookups) => {
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

const emptyCostBasis = () => ({ snapshot: 0, inventory: 0, missing: 0, excluded: 0 });

const mergeCostBasis = (current = emptyCostBasis(), next = emptyCostBasis()) => ({
  snapshot: toNumber(current.snapshot) + toNumber(next.snapshot),
  inventory: toNumber(current.inventory) + toNumber(next.inventory),
  missing: toNumber(current.missing) + toNumber(next.missing),
  excluded: toNumber(current.excluded) + toNumber(next.excluded),
});

const withCostStatus = (item = {}) => {
  const costBasis = item.costBasis || emptyCostBasis();
  return {
    ...item,
    costBasis,
    costStatus: getCostBasisStatus(costBasis, item.cost),
  };
};

const calculateChange = (current, previous) => {
  if (!previous) return current ? null : 0;
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
  const lookups = buildInventoryLookups(inventory);
  const upsertProductOption = (key, label, product = null, item = null) => {
    if (!key) return;
    const current = products.get(key) || { label: label || 'Producto', categories: new Set(), types: new Set() };
    getItemCategories(item || {}, product).forEach((category) => current.categories.add(category));
    current.types.add(getItemProductType(item || {}, product));
    products.set(key, current);
  };

  transactions.forEach((tx) => {
    users.set(getUserKey(tx), getUserLabel(tx));
    normalizePaymentBreakdown(tx.paymentBreakdown, tx.payment, tx.installments, tx.cashReceived, tx.cashChange, tx.total)
      .forEach((line) => payments.set(line.method, getPaymentMethodLabel(line.method)));
    clients.set(getClientKey(tx), getClientName(tx));
    (tx.items || []).forEach((item) => {
      if (item?.isDiscount || item?.is_discount) return;
      const product = getLiveProduct(item, lookups);
      const productKey = getMetricProductKey(item, product);
      upsertProductOption(productKey, item.title || item.product_title || product?.title || 'Producto', product, item);
      getItemCategories(item, product).forEach((category) => categories.set(category, category));
    });
  });

  inventory.forEach((product) => {
    const productKey = product.id !== undefined && product.id !== null ? String(product.id) : normalizeText(product.title);
    upsertProductOption(productKey, product.title || 'Producto', product, {});
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
    products: [...products.entries()]
      .map(([value, option]) => ({
        value,
        label: option.label,
        categories: [...option.categories],
        types: [...option.types],
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    categories: [...categories.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
  };
};

const _filterTransactions = ({ transactions, range, filters, lookups }) =>
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
          const productKey = getMetricProductKey(item, product);
          const matchesProduct = !filters.product || productKey === filters.product;
          const matchesCategory = !filters.category || getItemCategories(item, product).includes(filters.category);
          const matchesType = filters.productType === 'all' || getItemProductType(item, product) === filters.productType;
          return matchesProduct && matchesCategory && matchesType;
        });
        if (!hasItem) return false;
      }
      return true;
    });

const _filterExpenses = ({ expenses, range, filters }) =>
  expenses
    .map((expense) => ({ ...expense, metricDate: getRecordDate(expense) }))
    .filter((expense) => {
      if (!isInRange(expense.metricDate, range)) return false;
      if (!filters.includeTest && (expense.isTest || isTestRecord(expense))) return false;
      if (filters.user && getUserKey(expense) !== filters.user) return false;
      if (filters.payment && expense.paymentMethod !== filters.payment) return false;
      return true;
    });

const getRecordItems = (record = {}) => {
  if (Array.isArray(record.itemsSnapshot)) return record.itemsSnapshot;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.itemsSold)) return record.itemsSold;
  if (Array.isArray(record.items_sold_list)) return record.items_sold_list;
  return [];
};

const getRecordPaymentMap = (record = {}) => {
  if (record.paymentMethods && typeof record.paymentMethods === 'object') return record.paymentMethods;
  if (record.payment_methods_summary && typeof record.payment_methods_summary === 'object') return record.payment_methods_summary;
  return null;
};

const recordMatchesPaymentFilter = (record = {}, filters = {}) => {
  if (!filters.payment) return true;

  const paymentMap = getRecordPaymentMap(record);
  if (paymentMap) {
    const selectedLabel = getPaymentMethodLabel(filters.payment);
    return Object.keys(paymentMap).some((method) => method === filters.payment || method === selectedLabel);
  }

  const total = record.totalAmount ?? record.paidTotal ?? record.totalSales ?? record.total ?? 0;
  const lines = normalizePaymentBreakdown(
    record.paymentBreakdown,
    record.paymentMethod,
    record.installments,
    record.cashReceived,
    record.cashChange,
    total,
  );
  return lines.some((line) => line.method === filters.payment);
};

const recordMatchesClientFilter = (record = {}, filters = {}) => {
  if (!filters.client) return true;

  const [filterName = '', filterMemberNumber = ''] = String(filters.client).split('|');
  const recordName = normalizeText(record.customerName || record.clientName || record.client?.name || record.name || '');
  const recordMemberNumber = String(record.memberNumber || record.client?.memberNumber || record.member_id || record.memberId || '');

  if (filterMemberNumber && recordMemberNumber && filterMemberNumber === recordMemberNumber) return true;
  return Boolean(filterName && recordName && filterName === recordName);
};

const recordMatchesItemFilters = (record = {}, filters = {}, lookups) => {
  if (!filters.product && !filters.category && filters.productType === 'all') return true;
  return getRecordItems(record).some((item) => {
    const product = getLiveProduct(item, lookups);
    const productKey = getMetricProductKey(item, product);
    const matchesProduct = !filters.product || productKey === filters.product;
    const matchesCategory = !filters.category || getItemCategories(item, product).includes(filters.category);
    const matchesType = filters.productType === 'all' || getItemProductType(item, product) === filters.productType;
    return matchesProduct && matchesCategory && matchesType;
  });
};

const filterRecordsByDate = (records, range, filters) =>
  (records || [])
    .map((record) => ({ ...record, metricDate: getRecordDate(record) }))
    .filter((record) => {
      if (!isInRange(record.metricDate, range)) return false;
      if (!filters.includeTest && (record.isTest || isTestRecord(record))) return false;
      return true;
    });

const filterBusinessRecords = (records, range, filters, lookups) =>
  filterRecordsByDate(records, range, filters).filter((record) => {
    if (filters.user && getUserKey(record) !== filters.user) return false;
    if (!recordMatchesPaymentFilter(record, filters)) return false;
    if (!recordMatchesClientFilter(record, filters)) return false;
    if (!recordMatchesItemFilters(record, filters, lookups)) return false;
    return true;
  });

const filterClosureRecords = (records, range, filters) =>
  filterRecordsByDate(records, range, filters).filter((record) => {
    if (filters.user && getUserKey(record) !== filters.user) return false;
    return true;
  });

const getMemberKey = (member = {}) =>
  `${normalizeText(member.name)}|${member.memberNumber || member.member_number || ''}`;

const filterMemberCreationRecords = (members = [], range, filters = {}) =>
  (members || [])
    .map((member) => ({ ...member, metricDate: parseAnyDate(member.createdAt || member.created_at) }))
    .filter((member) => {
      if (!isInRange(member.metricDate, range)) return false;
      if (!filters.includeTest && (member.isTest || isTestRecord(member))) return false;
      if (filters.client && getMemberKey(member) !== filters.client) return false;
      return true;
    });

const buildMemberCreationStats = (members = [], range, filters = {}) => {
  const createdMembers = filterMemberCreationRecords(members, range, filters);
  return {
    newCount: createdMembers.length,
    newMembers: createdMembers
      .map((member) => ({
        ...member,
        createdAtLabel: member.metricDate ? member.metricDate.toLocaleDateString('es-AR') : '-',
      }))
      .sort((a, b) => (b.metricDate?.getTime?.() || 0) - (a.metricDate?.getTime?.() || 0)),
  };
};

const analyzePeriod = ({ transactions, expenses, budgets, orders, closures, members, range, filters, lookups }) => {
  const isHourlyRange = ['today', 'yesterday', '3d'].includes(filters.preset);
  const salesDataset = buildSalesDataset({ transactions, expenses, range, filters, lookups });
  const filteredTransactions = salesDataset.filteredTransactions;
  const filteredExpenses = salesDataset.filteredExpenses;
  const filteredBudgets = filterBusinessRecords(budgets, range, filters, lookups);
  const filteredOrders = filterBusinessRecords(orders, range, filters, lookups);
  const filteredClosures = filterClosureRecords(closures, range, filters);
  const memberCreationStats = buildMemberCreationStats(members, range, filters);

  const periodMap = new Map();
  const productMap = new Map();
  const categoryMap = new Map();
  const paymentMap = new Map();
  const userMap = new Map();
  const clientMap = new Map();
  const hourMap = new Map();
  const weekdayMap = new Map();
  const typeMap = new Map();
  const finalConsumerStats = { name: 'CONSUMIDOR FINAL', revenue: 0, salesCount: 0, averageTicket: 0 };

  let revenue = 0;
  let cost = 0;
  let itemsSold = 0;
  let posBagCount = 0;
  let posBagRevenue = 0;
  let posBagSalesCount = 0;

  filteredTransactions.forEach((tx) => {
    const txRevenue = toNumber(tx.total);
    const txCost = toNumber(tx.cost);
    const txProfit = toNumber(tx.profit);
    const txItemsForStats = (tx.metricItems || tx.items || []).filter((item) => !(item?.isDiscount || item?.is_discount));
    const txDiscountEligibleGrossRevenue = txItemsForStats.reduce((sum, item) => (
      isPosBagItem(item) ? sum : sum + Math.max(0, getItemRevenue(item))
    ), 0);
    const txPosBagSummary = getPosBagItemsSummary(txItemsForStats);
    const txItemDiscountImpact = toNumber(tx.itemDiscountImpact ?? tx.discountImpact);
    const txItemCount = txItemsForStats.reduce((sum, item) => sum + getItemQty(item), 0);
    revenue += txRevenue;
    cost += txCost;
    posBagCount += txPosBagSummary.count;
    posBagRevenue += txPosBagSummary.revenue;
    if (txPosBagSummary.count > 0) posBagSalesCount += 1;

    const periodKey = isHourlyRange ? getHourKey(tx.metricDate) : formatDateKey(tx.metricDate);
    const periodLabel = isHourlyRange ? getHourLabel(tx.metricDate) : formatShortDate(tx.metricDate);
    addToMap(periodMap, periodKey, { label: periodLabel, revenue: 0, cost: 0, profit: 0, expenses: 0, expenseCount: 0, salesCount: 0 }, (current) => ({
      revenue: current.revenue + txRevenue,
      cost: current.cost + txCost,
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

    const hasPaymentBreakdown = Array.isArray(tx.paymentBreakdown) && tx.paymentBreakdown.length > 0;
    const paymentScopeRatio = hasPaymentBreakdown && Number.isFinite(tx.metricScopeRatio) ? tx.metricScopeRatio : 1;
    const paymentTotal = hasPaymentBreakdown
      ? toNumber(tx.originalTotal ?? tx.total)
      : Math.max(0, toNumber(tx.total) - toNumber(tx.discountImpact));
    const paymentLines = normalizePaymentBreakdown(
      tx.paymentBreakdown,
      tx.payment,
      tx.installments,
      tx.cashReceived,
      tx.cashChange,
      paymentTotal,
    );
    paymentLines.forEach((line, lineIndex) => {
      const method = getPaymentMethodLabel(line.method);
      const amount = toNumber(line.chargedAmount) * paymentScopeRatio;
      addToMap(paymentMap, method, { name: method, value: 0, salesCount: 0, history: [] }, (current) => ({
        value: current.value + amount,
        salesCount: current.salesCount + 1,
        history: [
          ...(current.history || []),
          {
            key: `${tx.id || periodKey}-${line.id || lineIndex}-${current.salesCount || 0}`,
            transactionId: tx.id,
            method,
            rawMethod: line.method,
            amount,
            saleTotal: txRevenue,
            itemCount: txItemCount,
            clientName: getClientName(tx),
            user: getUserLabel(tx),
            date: tx.metricDate,
            time: tx.time || tx.timestamp || '',
            sortTime: tx.metricDate?.getTime?.() || 0,
          },
        ],
      }));
    });

    addToMap(userMap, getUserKey(tx), { name: getUserLabel(tx), revenue: 0, profit: 0, salesCount: 0 }, (current) => ({
      revenue: current.revenue + txRevenue,
      profit: current.profit + txProfit,
      salesCount: current.salesCount + 1,
    }));

    const clientName = getClientName(tx);
    if (isFinalConsumerName(clientName)) {
      finalConsumerStats.revenue += txRevenue;
      finalConsumerStats.salesCount += 1;
    } else {
      addToMap(clientMap, getClientKey(tx), { name: clientName, revenue: 0, salesCount: 0, lastDate: tx.metricDate }, (current) => ({
        revenue: current.revenue + txRevenue,
        salesCount: current.salesCount + 1,
        lastDate: !current.lastDate || tx.metricDate > current.lastDate ? tx.metricDate : current.lastDate,
      }));
    }

    txItemsForStats.forEach((item) => {
      if (item?.isDiscount || item?.is_discount) return;
      const product = getLiveProduct(item, lookups);
      const title = item.title || item.product_title || product?.title || 'Producto';
      const qty = getItemQty(item);
      const itemGrossRevenue = getItemRevenue(item);
      const itemDiscountImpact = !isPosBagItem(item) && txDiscountEligibleGrossRevenue > 0
        ? txItemDiscountImpact * Math.min(1, Math.max(0, itemGrossRevenue / txDiscountEligibleGrossRevenue))
        : 0;
      const itemRevenue = Math.max(0, itemGrossRevenue - itemDiscountImpact);
      const itemCostInfo = getItemCostInfo(item, lookups);
      const itemCost = itemCostInfo.totalCost;
      const productKey = getMetricProductKey(item, product);
      const productType = getItemProductType(item, product);
      const categories = getItemCategories(item, product);
      itemsSold += qty;

      addToMap(productMap, productKey, { name: title, qty: 0, revenue: 0, cost: 0, profit: 0, type: productType, costBasis: emptyCostBasis() }, (current) => ({
        qty: current.qty + qty,
        revenue: current.revenue + itemRevenue,
        cost: current.cost + itemCost,
        profit: current.profit + itemRevenue - itemCost,
        costBasis: mergeCostBasis(current.costBasis, itemCostInfo.basis),
      }));

      addToMap(typeMap, productType, { name: productType === 'weight' ? 'Por peso' : 'Por unidad', qty: 0, revenue: 0 }, (current) => ({
        qty: current.qty + qty,
        revenue: current.revenue + itemRevenue,
      }));

      categories.forEach((category) => {
        addToMap(categoryMap, category, { name: category, qty: 0, revenue: 0, cost: 0, profit: 0, costBasis: emptyCostBasis(), products: new Map() }, (current) => {
          const products = new Map(current.products || []);
          const productEntry = products.get(productKey) || { key: productKey, name: title, qty: 0, revenue: 0, cost: 0, profit: 0, costBasis: emptyCostBasis() };
          products.set(productKey, {
            ...productEntry,
            qty: productEntry.qty + qty,
            revenue: productEntry.revenue + itemRevenue,
            cost: productEntry.cost + itemCost,
            profit: productEntry.profit + itemRevenue - itemCost,
            costBasis: mergeCostBasis(productEntry.costBasis, itemCostInfo.basis),
          });

          return {
            qty: current.qty + qty,
            revenue: current.revenue + itemRevenue,
            cost: current.cost + itemCost,
            profit: current.profit + itemRevenue - itemCost,
            costBasis: mergeCostBasis(current.costBasis, itemCostInfo.basis),
            products,
          };
        });
      });
    });
  });

  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
  filteredExpenses.forEach((expense) => {
    const periodKey = isHourlyRange ? getHourKey(expense.metricDate) : formatDateKey(expense.metricDate);
    const periodLabel = isHourlyRange ? getHourLabel(expense.metricDate) : formatShortDate(expense.metricDate);
    addToMap(periodMap, periodKey, { label: periodLabel, revenue: 0, cost: 0, profit: 0, expenses: 0, expenseCount: 0, salesCount: 0 }, (current) => ({
      expenses: current.expenses + toNumber(expense.amount),
      expenseCount: current.expenseCount + 1,
      profit: current.profit - toNumber(expense.amount),
    }));
  });

  const periodCostBasis = [...productMap.values()].reduce(
    (basis, item) => mergeCostBasis(basis, item.costBasis),
    emptyCostBasis(),
  );

  const stats = {
    revenue,
    cost,
    costBasis: periodCostBasis,
    costStatus: getCostBasisStatus(periodCostBasis, cost),
    discounts: filteredTransactions.reduce((sum, tx) => sum + toNumber(tx.itemDiscountImpact ?? tx.discountImpact), 0),
    discountImpact: filteredTransactions.reduce((sum, tx) => sum + toNumber(tx.discountImpact), 0),
    theoreticalProfit: filteredTransactions.reduce((sum, tx) => sum + toNumber(tx.theoreticalProfit), 0),
    theoreticalNet: filteredTransactions.reduce((sum, tx) => sum + toNumber(tx.theoreticalProfit), 0) - totalExpenses,
    expenses: totalExpenses,
    profit: filteredTransactions.reduce((sum, tx) => sum + toNumber(tx.profit), 0) - totalExpenses,
    salesCount: filteredTransactions.length,
    averageTicket: filteredTransactions.length ? revenue / filteredTransactions.length : 0,
    itemsSold,
    posBagCount,
    posBagRevenue,
    posBagSalesCount,
  };

  const periodSeries = [...periodMap.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((day) => ({ ...day }));

  const allProductStats = sortBy([...productMap.values()].map((item) => withCostStatus({
    ...item,
    total: item.revenue + item.profit,
    marginRate: item.revenue ? (item.profit / item.revenue) * 100 : 0,
  })), 'revenue', Number.MAX_SAFE_INTEGER);

  return {
    stats,
    posBagStats: {
      count: posBagCount,
      revenue: posBagRevenue,
      salesCount: posBagSalesCount,
    },
    filteredTransactions,
    filteredExpenses,
    filteredBudgets,
    filteredOrders,
    filteredClosures,
    dailySeries: periodSeries,
    periodSeries,
    periodMode: isHourlyRange ? 'hour' : 'day',
    periodLabel: isHourlyRange ? 'horario' : 'día',
    periodLabelPlural: isHourlyRange ? 'horarios' : 'días',
    allProductStats,
    productStats: allProductStats.slice(0, 20),
    categoryStats: sortBy([...categoryMap.values()].map((item) => {
      const products = [...(item.products || new Map()).values()]
        .map((product) => withCostStatus({
          ...product,
          total: product.revenue + product.profit,
          marginRate: product.revenue ? (product.profit / product.revenue) * 100 : 0,
        }))
        .sort((a, b) => toNumber(b.revenue) - toNumber(a.revenue))
        .slice(0, 12);

      return withCostStatus({
        ...item,
        products: undefined,
        productBreakdown: products,
        total: item.revenue + item.profit,
        marginRate: item.revenue ? (item.profit / item.revenue) * 100 : 0,
      });
    }), 'revenue', 16),
    paymentStats: sortBy([...paymentMap.values()].map((item) => ({
      ...item,
      history: [...(item.history || [])]
        .sort((a, b) => toNumber(b.sortTime) - toNumber(a.sortTime))
        .slice(0, 40),
    })), 'value', 10),
    userStats: sortBy([...userMap.values()].map((item) => ({
      ...item,
      total: item.revenue + item.profit,
      averageTicket: item.salesCount ? item.revenue / item.salesCount : 0,
    })), 'revenue', 12),
    clientStats: [...clientMap.values()].map((item) => ({
      ...item,
      averageTicket: item.salesCount ? item.revenue / item.salesCount : 0,
      lastDateLabel: item.lastDate ? item.lastDate.toLocaleDateString('es-AR') : '-',
    })).sort((a, b) => toNumber(b.revenue) - toNumber(a.revenue)),
    finalConsumerStats: {
      ...finalConsumerStats,
      averageTicket: finalConsumerStats.salesCount ? finalConsumerStats.revenue / finalConsumerStats.salesCount : 0,
    },
    memberStats: memberCreationStats,
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

const buildOrderStats = (orders = [], budgets = [], range, filters, lookups) => {
  const filteredOrders = filterBusinessRecords(orders, range, filters, lookups);
  const filteredBudgets = filterBusinessRecords(budgets, range, filters, lookups);
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
  const filteredClosures = filterClosureRecords(closures, range, filters);
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
      section: 'stock',
    });
  }

  if (stockStats.expiring.length) {
    recommendations.push({
      tone: 'warning',
      title: 'Productos por vencer',
      detail: `${stockStats.expiring.length} productos vencen o vencieron dentro de la ventana de 14 días.`,
      section: 'stock',
    });
  }

  if (revenueChange < -15) {
    recommendations.push({
      tone: 'warning',
      title: 'Caída de ventas',
      detail: `El ingreso bajó ${formatNumber(Math.abs(revenueChange), 1)}% contra el período anterior.`,
      section: 'sales',
    });
  } else if (revenueChange > 15) {
    recommendations.push({
      tone: 'success',
      title: 'Ventas en crecimiento',
      detail: `El ingreso subió ${formatNumber(revenueChange, 1)}% contra el período anterior.`,
      section: 'sales',
    });
  }

  if (profitChange < -15) {
    recommendations.push({
      tone: 'danger',
      title: 'Revisar resultado de caja',
      detail: `El resultado bajó ${formatNumber(Math.abs(profitChange), 1)}%. Mirá gastos, cobros y descuentos.`,
      section: 'profit',
    });
  }

  if (lowMarginProduct) {
    recommendations.push({
      tone: 'warning',
      title: 'Margen bajo',
      detail: `${lowMarginProduct.name} tiene margen estimado de ${formatNumber(lowMarginProduct.marginRate, 1)}%.`,
      section: 'products',
    });
  }

  if (peakHour) {
    recommendations.push({
      tone: 'info',
      title: 'Horario fuerte',
      detail: `${peakHour.label} concentra ${peakHour.salesCount} ventas por ${formatCurrency(peakHour.revenue)}.`,
      section: 'sales',
    });
  }

  if (orderStats.pendingAmount > 0) {
    recommendations.push({
      tone: 'info',
      title: 'Pedidos con saldo',
      detail: `Hay ${formatCurrency(orderStats.pendingAmount)} pendientes de cobrar en pedidos filtrados.`,
      section: 'orders',
    });
  }

  if ((members || []).length > 0 && current.clientStats.length === 0) {
    recommendations.push({
      tone: 'info',
      title: 'Activar socios',
      detail: 'No hay ventas asociadas a socios en este rango. Puede servir una acción de fidelización.',
      section: 'clients',
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
      members,
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
      members,
      range: previousRange,
      filters,
      lookups,
    });
    const stockStats = buildStockStats(inventory);
    const orderStats = buildOrderStats(orders, budgets, range, filters, lookups);
    const closureStats = buildClosureStats(pastClosures, range, filters);
    const recommendations = buildRecommendations({ current, previous, stockStats, orderStats, members });
    const canComparePreviousRange = Boolean(previousRange.isComparable);
    const getComparableChange = (currentValue, previousValue) =>
      canComparePreviousRange ? calculateChange(currentValue, previousValue) : null;

    return {
      range,
      previousRange,
      canComparePreviousRange,
      filterOptions,
      current,
      previous,
      stockStats,
      orderStats,
      closureStats,
      recommendations,
      changes: {
        revenue: getComparableChange(current.stats.revenue, previous.stats.revenue),
        grossProfit: getComparableChange(
          current.stats.revenue - current.stats.cost,
          previous.stats.revenue - previous.stats.cost,
        ),
        profit: getComparableChange(current.stats.profit, previous.stats.profit),
        salesCount: getComparableChange(current.stats.salesCount, previous.stats.salesCount),
        averageTicket: getComparableChange(current.stats.averageTicket, previous.stats.averageTicket),
        expenses: getComparableChange(current.stats.expenses, previous.stats.expenses),
      },
    };
  }, [transactions, dailyLogs, expenses, pastClosures, inventory, members, budgets, orders, filters]);
}
