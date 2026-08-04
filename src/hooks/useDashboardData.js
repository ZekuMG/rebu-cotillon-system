// src/hooks/useDashboardData.js
import { useCallback, useMemo } from 'react';
import { PAYMENT_METHODS } from '../data';
import { buildDashboardTransactionSummary } from '../utils/dashboardAggregations';
import { getPaymentMethodTotals } from '../utils/paymentBreakdown';
import {
  buildInventoryLookups,
  buildSalesDataset,
  getItemCategories,
  getItemQty,
  getItemRevenue,
  getLiveProduct,
  makeDashboardRange,
  normalizeText,
} from '../utils/salesMetricsCore';

const isLegacyWeightLikeItem = (item, liveProduct) => {
  if (liveProduct) return liveProduct.product_type === 'weight';
  if (item?.product_type === 'weight' || item?.isWeight) return true;

  const qty = Number(item?.qty ?? item?.quantity ?? 0);
  const price = Number(item?.price ?? 0);
  const rawId = String(item?.id || item?.productId || '');
  const rawTitle = String(item?.title || '').trim();
  const isCustomLike = item?.isCustom || rawId.startsWith('custom_') || rawTitle.startsWith('*');
  const hasLegacyQuantityMarker = !item?.product_type || item?.product_type === 'quantity';

  return hasLegacyQuantityMarker && !item?.isCombo && !item?.isDiscount && isCustomLike && qty >= 20 && price > 0 && price < 50;
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
  const lookups = useMemo(() => buildInventoryLookups(inventory || []), [inventory]);
  const dashboardRange = useMemo(() => makeDashboardRange(globalFilter), [globalFilter]);
  const salesDataset = useMemo(() => {
    return buildSalesDataset({
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
  }, [transactions, dailyLogs, expenses, inventory, dashboardRange, lookups]);

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

  const getRankingItemRevenue = useCallback((item, txTotal = 0, resolvedLiveProduct) => {
    const explicitRevenue = getItemRevenue(item);
    if (explicitRevenue > 0) return explicitRevenue;

    const qty = Number(item?.qty) || Number(item?.quantity) || 0;
    const price = Number(item?.price) || Number(item?.unit_price) || Number(item?.newPrice) || 0;
    if (qty <= 0 || price <= 0) return 0;

    const liveProduct = resolvedLiveProduct === undefined
      ? getLiveProductForItem(item)
      : resolvedLiveProduct;
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

  const kpiStats = useMemo(() => ({
    gross: salesDataset.stats.revenue,
    net: salesDataset.stats.profit,
    cost: salesDataset.stats.cost,
    expenses: salesDataset.stats.expenses,
    count: salesDataset.stats.salesCount,
  }), [salesDataset]);

  const averageTicket = kpiStats.count > 0 ? kpiStats.gross / kpiStats.count : 0;

  const transactionSummary = useMemo(() => buildDashboardTransactionSummary({
    transactions: filteredData,
    paymentMethods: PAYMENT_METHODS,
    resolvePaymentTotals: (tx) => getPaymentMethodTotals(
      tx.paymentBreakdown,
      tx.payment,
      tx.installments,
      tx.cashReceived,
      tx.cashChange,
      tx.total,
    ),
    resolveRankingItem: (item, tx) => {
      if (item?.isDiscount || item?.is_discount || item?.type === 'discount') return null;
      const liveProduct = getLiveProductForItem(item);
      return {
        item,
        qty: getItemQty(item),
        revenue: getRankingItemRevenue(item, tx.total, liveProduct),
        liveProduct,
        isWeightItem: isLegacyWeightLikeItem(item, liveProduct),
      };
    },
  }), [filteredData, getLiveProductForItem, getRankingItemRevenue]);

  const paymentStats = useMemo(() => PAYMENT_METHODS.map((method) => ({
    ...method,
    total: Number(transactionSummary.paymentTotals[method.label] || 0),
  })), [transactionSummary]);

  const rankingStats = useMemo(() => {
    const statsMap = {};

    transactionSummary.rankingItems.forEach(({
      item,
      qty,
      revenue,
      liveProduct,
      isWeightItem,
    }) => {

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
  }, [transactionSummary, rankingMode, rankingCriteria, getCategoryProductForItem]);

  const lowStockProducts = useMemo(() => {
    if (!inventory) return [];
    return inventory
      .filter((p) => p.is_active !== false && p.stock < 10)
      .sort((a, b) => a.stock - b.stock);
  }, [inventory]);

  const expiringProducts = useMemo(() => {
    if (!inventory) return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); 

    const alerts = inventory
      .filter(p => p.is_active !== false && p.expiration_date && Number(p.stock || 0) > 0) 
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

