// src/hooks/useDashboardData.js
import { useCallback, useMemo } from 'react';
import { PAYMENT_METHODS } from '../data';
import { getPaymentMethodTotals } from '../utils/paymentBreakdown';
import {
  buildInventoryLookups,
  buildSalesDataset,
  getItemCategories,
  getItemCost,
  getLiveProduct,
  isTemporaryCustomItem,
  makeDashboardRange,
  normalizeText,
  parseMetricDate,
  shouldSkipCostItem,
} from '../utils/salesMetricsCore';

const getDashboardStockChangeCost = (change = {}, lookups) => {
  const productId = change.productId || change.product_id || change.id;
  const product = productId ? lookups.byId.get(String(productId)) : null;
  const qty = Math.abs(Number(
    change.quantitySold ??
      change.quantityReserved ??
      change.quantityChanged ??
      change.quantity ??
      change.qty ??
      0
  ) || 0);
  if (qty <= 0) return 0;

  const unitCost = Number(
    product?.purchasePrice ??
      product?.purchase_price ??
      change.purchasePrice ??
      change.purchase_price ??
      change.unitCost ??
      change.unit_cost ??
      change.cost ??
      0
  ) || 0;

  return unitCost * qty;
};

const getDashboardTransactionCost = (tx = {}, lookups) => {
  const items = Array.isArray(tx.items) ? tx.items : [];
  const stockChanges = Array.isArray(tx.stockChanges) ? tx.stockChanges : [];
  const itemCost = items.reduce((sum, item) => sum + getItemCost(item, lookups), 0);

  if (!stockChanges.length) return itemCost;

  const stockCost = stockChanges.reduce((sum, change) => sum + getDashboardStockChangeCost(change, lookups), 0);
  const customItemCost = items.reduce((sum, item) => {
    if (!isTemporaryCustomItem(item) || shouldSkipCostItem(item)) return sum;
    return sum + getItemCost(item, lookups);
  }, 0);

  return Math.max(stockCost + customItemCost, itemCost);
};

const rebuildDashboardSalesDataset = (dataset, lookups) => {
  const filteredTransactions = (dataset.filteredTransactions || []).map((tx) => {
    const cost = getDashboardTransactionCost(tx, lookups);
    const total = Number(tx.total || 0);
    const profit = total - cost;
    return {
      ...tx,
      cost,
      profit,
      net: profit,
    };
  });
  const revenue = filteredTransactions.reduce((sum, tx) => sum + (Number(tx.total) || 0), 0);
  const cost = filteredTransactions.reduce((sum, tx) => sum + (Number(tx.cost) || 0), 0);
  const expenses = Number(dataset.stats?.expenses || 0);

  return {
    ...dataset,
    filteredTransactions,
    stats: {
      ...dataset.stats,
      revenue,
      gross: revenue,
      cost,
      profit: revenue - cost - expenses,
      net: revenue - cost - expenses,
      averageTicket: filteredTransactions.length ? revenue / filteredTransactions.length : 0,
    },
  };
};

export default function useDashboardData({ 
  transactions, 
  dailyLogs, 
  inventory, 
  globalFilter, 
  rankingMode, 
  rankingCriteria, 
  expenses = [] 
}) {
  const currentHour = new Date().getHours();
  const lookups = useMemo(() => buildInventoryLookups(inventory || []), [inventory]);
  const dashboardRange = useMemo(() => makeDashboardRange(globalFilter), [globalFilter]);
  const salesDataset = useMemo(() => {
    const dataset = buildSalesDataset({
      transactions,
      dailyLogs,
      expenses,
      inventory,
      range: dashboardRange,
      lookups,
      filters: {
        includeTest: false,
        includeVoided: false,
        status: 'all',
        productType: 'all',
      },
    });
    return rebuildDashboardSalesDataset(dataset, lookups);
  }, [transactions, dailyLogs, expenses, inventory, dashboardRange, lookups]);

  const safeParseDate = useCallback((dateStr) => {
    return parseMetricDate(dateStr);
  }, []);

  const getLiveProductForItem = useCallback((item) => getLiveProduct(item, lookups), [lookups]);

  const getCategoryProductForItem = useCallback((item = {}) => {
    const liveProduct = getLiveProductForItem(item);
    if (liveProduct) return liveProduct;

    const rawId = String(item.id || item.productId || item.product_id || '');
    const rawTitle = String(item.title || item.product_title || item.name || '').trim();
    const hasCustomMarker =
      item.isCustom ||
      item.is_custom ||
      item.isTemporary ||
      item.isTemporaryCustom ||
      item.type === 'custom' ||
      item.itemType === 'custom' ||
      rawTitle.startsWith('*') ||
      rawId.startsWith('custom_') ||
      rawId.startsWith('temp-');

    if (hasCustomMarker) return null;

    const normalizedTitle = normalizeText(rawTitle);
    return normalizedTitle ? lookups.byTitle.get(normalizedTitle) || null : null;
  }, [getLiveProductForItem, lookups]);

  const getRankingItemRevenue = useCallback((item, txTotal = 0) => {
    const qty = Number(item?.qty) || Number(item?.quantity) || 0;
    const price = Number(item?.price) || Number(item?.unit_price) || Number(item?.newPrice) || 0;
    if (qty <= 0 || price <= 0) return 0;

    const liveProduct = getLiveProductForItem(item);
    const isWeightItem = isLegacyWeightLikeItem(item, liveProduct);
    const subtotal =
      Number(item?.subtotal ?? item?.lineSubtotal ?? item?.line_total ?? item?.lineTotal ?? item?.total ?? 0);

    if (!isWeightItem) {
      if (Number.isFinite(subtotal) && subtotal > 0) return subtotal;
      return price * qty;
    }

    const perGramRevenue = price * qty;
    const perKgRevenue = price * (qty / 1000);
    const safeTxTotal = Number(txTotal) || 0;

    if (safeTxTotal > 0) {
      const maxReasonableLineRevenue = safeTxTotal * 1.1;
      const perGramLooksWrong = perGramRevenue > maxReasonableLineRevenue;
      const perKgLooksWrong = perKgRevenue > maxReasonableLineRevenue;

      if (perGramLooksWrong && !perKgLooksWrong) return perKgRevenue;
      if (!perGramLooksWrong && perKgLooksWrong) return perGramRevenue;
    }

    if (Number.isFinite(subtotal) && subtotal > 0) {
      const subtotalDiffPerGram = Math.abs(subtotal - perGramRevenue);
      const subtotalDiffPerKg = Math.abs(subtotal - perKgRevenue);
      return subtotalDiffPerKg < subtotalDiffPerGram ? perKgRevenue : perGramRevenue;
    }

    if (liveProduct) {
      const liveGramPrice = Number(liveProduct.price) || 0;
      const liveKgPrice = liveGramPrice * 1000;
      if (liveGramPrice > 0 && liveKgPrice > 0) {
        const gramDistance = Math.abs(price - liveGramPrice) / liveGramPrice;
        const kgDistance = Math.abs(price - liveKgPrice) / liveKgPrice;
        return kgDistance < gramDistance ? perKgRevenue : perGramRevenue;
      }
    }

    return price >= 100 ? perKgRevenue : perGramRevenue;
  }, [getLiveProductForItem]);

  const filteredData = salesDataset.filteredTransactions;
  const filteredExpenses = salesDataset.filteredExpenses;

  const expenseStats = useMemo(() => {
    const total = filteredExpenses.reduce((acc, exp) => acc + (Number(exp.amount) || 0), 0);
    const count = filteredExpenses.length;
    const byCategory = {};
    filteredExpenses.forEach(exp => {
      const cat = exp.category || 'Otros';
      if (!byCategory[cat]) byCategory[cat] = { name: cat, total: 0, count: 0 };
      byCategory[cat].total += (Number(exp.amount) || 0);
      byCategory[cat].count += 1;
    });
    const byPayment = {};
    filteredExpenses.forEach(exp => {
      const method = exp.paymentMethod || 'Efectivo';
      if (!byPayment[method]) byPayment[method] = { name: method, total: 0 };
      byPayment[method].total += (Number(exp.amount) || 0);
    });
    return {
      total, count,
      byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
      byPayment: Object.values(byPayment).sort((a, b) => b.total - a.total),
    };
  }, [filteredExpenses]);

  const getExpenseHour = useCallback((expense = {}) => {
    const rawTime = expense.time || expense.timestamp;
    if (typeof rawTime === 'string' && rawTime.includes(':')) {
      const hour = parseInt(rawTime.split(':')[0], 10);
      if (Number.isFinite(hour)) return hour;
    }

    const dateObj = safeParseDate(expense.createdAt || expense.created_at || expense.date);
    return dateObj ? dateObj.getHours() : 0;
  }, [safeParseDate]);

  const buildDateKey = (dateObj) =>
    dateObj ? `${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()}` : '';

  const kpiStats = useMemo(() => ({
    gross: salesDataset.stats.revenue,
    net: salesDataset.stats.profit,
    cost: salesDataset.stats.cost,
    expenses: salesDataset.stats.expenses,
    count: salesDataset.stats.salesCount,
  }), [salesDataset]);

  const averageTicket = kpiStats.count > 0 ? kpiStats.gross / kpiStats.count : 0;

  const chartData = useMemo(() => {
    if (globalFilter === 'day') {
      const ranges = [
        { label: '9-12', start: 9, end: 12, sales: 0, net: 0, count: 0, transactions: [] },
        { label: '12-14', start: 12, end: 14, sales: 0, net: 0, count: 0, transactions: [] },
        { label: '14-17', start: 14, end: 17, sales: 0, net: 0, count: 0, transactions: [] },
        { label: '17-21', start: 17, end: 21, sales: 0, net: 0, count: 0, transactions: [] },
        { label: '21+', start: 21, end: 24, sales: 0, net: 0, count: 0, transactions: [] },
      ];
      filteredData.forEach(tx => {
        if (!tx.time) return;
        const hour = parseInt(tx.time.split(':')[0], 10);
        const range = ranges.find(r => hour >= r.start && hour < r.end);
        if (range) {
          range.sales += tx.total;
          range.net += Number(tx.net) || 0;
          range.count += 1;
          range.transactions.push(tx);
        }
      });

      filteredExpenses.forEach(expense => {
        const amount = Number(expense.amount) || 0;
        if (amount <= 0) return;
        const hour = getExpenseHour(expense);
        const range =
          ranges.find(r => hour >= r.start && hour < r.end) ||
          (hour < ranges[0].start ? ranges[0] : ranges[ranges.length - 1]);
        if (range) range.net -= amount;
      });

      return ranges.map(r => ({ ...r, isCurrent: currentHour >= r.start && currentHour < r.end }));
    }

    if (globalFilter === 'year') {
      const daysMap = new Map();
      const now = new Date();

      for (let i = 364; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const isMonthStart = d.getDate() === 1 || i === 364;

        daysMap.set(key, {
          label: isMonthStart ? d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') : '',
          shortLabel: d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
          monthName: d.toLocaleDateString('es-AR', { month: 'long' }),
          dayNum: d.getDate(),
          year: d.getFullYear(),
          sales: 0,
          net: 0,
          count: 0,
          isToday: i === 0,
          isCurrent: i === 0,
          isMonthStart,
          transactions: [],
        });
      }

      filteredData.forEach(tx => {
        if (!tx.date) return;
        const key = buildDateKey(tx.date);
        if (daysMap.has(key)) {
          const entry = daysMap.get(key);
          entry.sales += tx.total;
          entry.net += Number(tx.net) || 0;
          entry.count += 1;
          entry.transactions.push(tx);
        }
      });

      filteredExpenses.forEach(expense => {
        const expenseDate = safeParseDate(expense.date || expense.created_at || expense.createdAt);
        const key = buildDateKey(expenseDate);
        if (daysMap.has(key)) {
          daysMap.get(key).net -= Number(expense.amount) || 0;
        }
      });

      return Array.from(daysMap.values());
    }

    const daysMap = new Map();
    const now = new Date();
    const daysToShow = globalFilter === 'week' ? 7 : 30;

    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = `${d.getDate()}/${d.getMonth() + 1}`;
      const dateStr = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

      daysMap.set(key, { 
        label: key, 
        dayName: d.toLocaleDateString('es-AR', { weekday: 'short' }), 
        dayNum: d.getDate(),
        monthName: d.toLocaleDateString('es-AR', { month: 'short' }),
        sales: 0, 
        net: 0,
        count: 0, 
        dateStr: dateStr, 
        isToday: i === 0,
        isCurrent: i === 0,
        transactions: [] 
      });
    }

    filteredData.forEach(tx => {
      if (!tx.date) return;
      const key = `${tx.date.getDate()}/${tx.date.getMonth() + 1}`;
      if (daysMap.has(key)) { 
        const entry = daysMap.get(key); 
        entry.sales += tx.total;
        entry.net += Number(tx.net) || 0;
        entry.count += 1; 
        entry.transactions.push(tx); 
      }
    });

    filteredExpenses.forEach(expense => {
      const expenseDate = safeParseDate(expense.date || expense.created_at || expense.createdAt);
      if (!expenseDate) return;
      const key = `${expenseDate.getDate()}/${expenseDate.getMonth() + 1}`;
      if (daysMap.has(key)) {
        daysMap.get(key).net -= Number(expense.amount) || 0;
      }
    });

    return Array.from(daysMap.values());
  }, [globalFilter, filteredData, filteredExpenses, currentHour, getExpenseHour, safeParseDate]);

  const maxSales = useMemo(() => {
    const max = Math.max(...chartData.map(d => d.sales)); return max > 0 ? max : 1;
  }, [chartData]);

  const paymentStats = useMemo(() => {
    return PAYMENT_METHODS.map(method => {
      const total = filteredData.reduce((sum, tx) => {
        const totalsByMethod = getPaymentMethodTotals(
          tx.paymentBreakdown,
          tx.payment,
          tx.installments,
          tx.cashReceived,
          tx.cashChange,
          tx.total,
        );
        return sum + Number(totalsByMethod[method.label] || 0);
      }, 0);
      return { ...method, total };
    });
  }, [filteredData]);

  function isLegacyWeightLikeItem(item, liveProduct) {
    if (liveProduct) return liveProduct.product_type === 'weight';
    if (item?.product_type === 'weight' || item?.isWeight) return true;

    const qty = Number(item?.qty ?? item?.quantity ?? 0);
    const price = Number(item?.price ?? 0);
    const rawId = String(item?.id || item?.productId || '');
    const rawTitle = String(item?.title || '').trim();
    const isCustomLike = item?.isCustom || rawId.startsWith('custom_') || rawTitle.startsWith('*');
    const hasLegacyQuantityMarker = !item?.product_type || item?.product_type === 'quantity';

    return hasLegacyQuantityMarker && !item?.isCombo && !item?.isDiscount && isCustomLike && qty >= 20 && price > 0 && price < 50;
  }

  const rankingStats = useMemo(() => {
    const statsMap = {};

    filteredData.forEach(tx => {
      tx.items.forEach(item => {
        const qty = Number(item.qty) || Number(item.quantity) || 0;
        const revenue = getRankingItemRevenue(item, tx.total);
        
        const liveProduct = getLiveProductForItem(item);
        const isWeightItem = isLegacyWeightLikeItem(item, liveProduct);

        let keys = [];

        if (rankingMode === 'products') {
          if (isWeightItem) return; 
          keys = [item.title || 'Desconocido'];
        } else if (rankingMode === 'weight') {
          if (!isWeightItem) return;
          keys = [item.title || 'Desconocido'];
        } else {
          let cats = getItemCategories(item, getCategoryProductForItem(item));
          if (liveProduct) {
            if (Array.isArray(liveProduct.categories) && liveProduct.categories.length > 0) { cats = liveProduct.categories; } 
            else if (liveProduct.category) { cats = [liveProduct.category]; }
          }
          if (cats.length === 0) {
            if (Array.isArray(item.categories) && item.categories.length > 0) { cats = item.categories; } 
            else if (item.category) { cats = [item.category]; }
          }
          if (cats.length === 0) cats = ['Sin Categoría'];
          keys = cats;
        }

        keys.forEach(k => {
          if (!statsMap[k]) statsMap[k] = { name: k, qty: 0, revenue: 0, unitQty: 0, weightQty: 0 };
          statsMap[k].qty += qty;
          statsMap[k].revenue += revenue;
          if (isWeightItem) { statsMap[k].weightQty += qty; } else { statsMap[k].unitQty += qty; }
        });
      });
    });

    return Object.values(statsMap)
      .sort((a, b) => {
        if (rankingCriteria !== 'qty' || rankingMode !== 'categories') {
          return b[rankingCriteria || 'revenue'] - a[rankingCriteria || 'revenue'];
        }
        const aQtyScore = Number(a.unitQty || 0) + (Number(a.weightQty || 0) / 1000);
        const bQtyScore = Number(b.unitQty || 0) + (Number(b.weightQty || 0) / 1000);
        return bQtyScore - aQtyScore;
      })
      .slice(0, 10); 
  }, [filteredData, rankingMode, rankingCriteria, getCategoryProductForItem, getLiveProductForItem, getRankingItemRevenue]);

  const lowStockProducts = useMemo(() => {
    if (!inventory) return [];
    return inventory.filter((p) => p.stock < 10).sort((a, b) => a.stock - b.stock);
  }, [inventory]);

  const expiringProducts = useMemo(() => {
    if (!inventory) return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); 

    const alerts = inventory
      .filter(p => p.expiration_date) 
      .map(p => {
        const [year, month, day] = p.expiration_date.split('-');
        const expDate = new Date(year, month - 1, day);
        expDate.setHours(0, 0, 0, 0);
        
        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return { ...p, daysUntil: diffDays };
      })
      .filter(p => p.daysUntil <= 14) 
      .sort((a, b) => a.daysUntil - b.daysUntil); 

    return alerts;
  }, [inventory]);

  const getEmptyStateMessage = () => {
    switch (globalFilter) {
      case 'day': return 'Sin ventas hoy';
      case 'week': return 'Sin ventas esta semana';
      case 'month': return 'Sin ventas en los últimos 30 días';
      case 'year': return 'Sin ventas en los últimos 12 meses';
      default: return 'Sin datos';
    }
  };

  return {
    kpiStats, 
    averageTicket, 
    chartData, 
    maxSales, 
    paymentStats, 
    rankingStats, 
    lowStockProducts, 
    expiringProducts, 
    getEmptyStateMessage, 
    expenseStats, 
    filteredData, 
    filteredExpenses,  
  };
}

