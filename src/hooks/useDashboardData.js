// src/hooks/useDashboardData.js
import { useMemo } from 'react';
import { PAYMENT_METHODS } from '../data';
import { isVentaLog, normalizeDate } from '../utils/helpers';

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

  const safeParseDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;
    if (typeof dateStr === 'string' && dateStr.includes('/')) {
       const parts = dateStr.split('/');
       if (parts.length === 3) {
         let y = parseInt(parts[2], 10);
         if (y < 100) y += 2000;
         return new Date(y, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
       }
    }
    return normalizeDate(dateStr);
  };

  const getProductCost = (productId) => {
    if (!inventory) return 0;
    const product = inventory.find(p => p.id === productId);
    return product ? (Number(product.purchasePrice) || 0) : 0;
  };

  const getTransactionNet = (tx) => {
    let cost = 0;
    (tx.items || []).forEach(item => {
      const qty = Number(item.qty) || Number(item.quantity) || 0;
      const pCost = getProductCost(item.id || item.productId);
      cost += pCost * qty;
    });
    return (Number(tx.total) || 0) - cost;
  };

  const isInRange = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();
    const annualStart = new Date(currentYear, currentMonth - 11, 1);
    annualStart.setHours(0, 0, 0, 0);
    
    const todayNum = (currentYear * 10000) + ((currentMonth + 1) * 100) + currentDay;
    
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 6); 
    const weekAgoNum = (weekAgo.getFullYear() * 10000) + ((weekAgo.getMonth() + 1) * 100) + weekAgo.getDate();

    const monthAgo = new Date(now);
    monthAgo.setDate(now.getDate() - 29);
    const monthAgoNum = (monthAgo.getFullYear() * 10000) + ((monthAgo.getMonth() + 1) * 100) + monthAgo.getDate();

    return (dateObj) => {
      if (!dateObj) return false;
      const compYear = dateObj.getFullYear();
      const compMonth = dateObj.getMonth();
      const compDay = dateObj.getDate();
      const compNum = (compYear * 10000) + ((compMonth + 1) * 100) + compDay;

      if (globalFilter === 'day') return compNum === todayNum;
      if (globalFilter === 'week') return compNum >= weekAgoNum && compNum <= todayNum;
      if (globalFilter === 'month') return compNum >= monthAgoNum && compNum <= todayNum;
      if (globalFilter === 'year') return dateObj >= annualStart && dateObj <= now;
      return false;
    };
  }, [globalFilter]);

  const filteredData = useMemo(() => {
    const validTransactions = [];
    const processedTxIds = new Set();

    (transactions || []).forEach(tx => {
      if (tx.status === 'voided') return;
      const txDate = safeParseDate(tx.date); 
      if (txDate && isInRange(txDate)) {
        validTransactions.push({
          source: 'tx', id: tx.id, date: txDate, time: tx.time, total: Number(tx.total) || 0, 
          payment: tx.payment, items: tx.items || [], 
          client: tx.client // ✨ NUEVO: Pasamos el cliente
        });
        processedTxIds.add(tx.id);
      }
    });

    (dailyLogs || []).forEach(log => {
      if (isVentaLog(log) && log.details) {
        const txId = log.details.transactionId;
        if (!processedTxIds.has(txId)) { 
          const logDate = safeParseDate(log.date);
          if (logDate && isInRange(logDate)) {
            validTransactions.push({
              source: 'log', id: txId || log.id, date: logDate, time: log.timestamp || '00:00',
              total: Number(log.details.total) || 0, payment: log.details.payment || 'Efectivo', items: log.details.items || [],
              client: log.details.client // ✨ NUEVO: Pasamos el cliente
            });
          }
        }
      }
    });

    return validTransactions;
  }, [globalFilter, transactions, dailyLogs, isInRange]);

  const filteredExpenses = useMemo(() => {
    return (expenses || []).filter(exp => {
      const expDate = safeParseDate(exp.date || exp.created_at);
      return expDate && isInRange(expDate);
    });
  }, [expenses, isInRange]);

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

  const kpiStats = useMemo(() => {
    let gross = 0; let net = 0; const count = filteredData.length;
    filteredData.forEach(tx => {
      gross += tx.total; let cost = 0;
      tx.items.forEach(item => {
        const qty = Number(item.qty) || Number(item.quantity) || 0;
        const pCost = getProductCost(item.id || item.productId);
        cost += pCost * qty;
      });
      net += (tx.total - cost);
    });
    net -= expenseStats.total;
    return { gross, net, count };
  }, [filteredData, inventory, expenseStats]);

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
          range.net += getTransactionNet(tx);
          range.count += 1;
          range.transactions.push(tx);
        }
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
        const key = `${tx.date.getFullYear()}-${tx.date.getMonth()}-${tx.date.getDate()}`;
        if (daysMap.has(key)) {
          const entry = daysMap.get(key);
          entry.sales += tx.total;
          entry.net += getTransactionNet(tx);
          entry.count += 1;
          entry.transactions.push(tx);
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
        entry.net += getTransactionNet(tx);
        entry.count += 1; 
        entry.transactions.push(tx); 
      }
    });

    return Array.from(daysMap.values());
  }, [globalFilter, filteredData, currentHour, inventory]);

  const maxSales = useMemo(() => {
    const max = Math.max(...chartData.map(d => d.sales)); return max > 0 ? max : 1;
  }, [chartData]);

  const paymentStats = useMemo(() => {
    return PAYMENT_METHODS.map(method => {
      const total = filteredData.filter(tx => tx.payment === method.id).reduce((sum, tx) => sum + tx.total, 0);
      return { ...method, total };
    });
  }, [filteredData]);

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

  const rankingStats = useMemo(() => {
    const statsMap = {};

    filteredData.forEach(tx => {
      tx.items.forEach(item => {
        const qty = Number(item.qty) || Number(item.quantity) || 0;
        const revenue = (Number(item.price) || 0) * qty;
        
        const liveProduct = inventory ? inventory.find(p => p.id === (item.id || item.productId)) : null;
        const isWeightItem = isLegacyWeightLikeItem(item, liveProduct);

        let keys = [];

        if (rankingMode === 'products') {
          if (isWeightItem) return; 
          keys = [item.title || 'Desconocido'];
        } else if (rankingMode === 'weight') {
          if (!isWeightItem) return;
          keys = [item.title || 'Desconocido'];
        } else {
          let cats = [];
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
      .sort((a, b) => b[rankingCriteria || 'revenue'] - a[rankingCriteria || 'revenue'])
      .slice(0, 10); 
  }, [filteredData, rankingMode, rankingCriteria, inventory]);

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

