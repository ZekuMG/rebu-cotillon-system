// src/hooks/useDashboardData.js
// ♻️ REFACTOR: Lógica de cálculo extraída de DashboardView.jsx
// Centraliza filteredData, kpiStats, chartData, paymentStats, rankingStats, lowStockProducts

import { useMemo } from 'react';
import { PAYMENT_METHODS } from '../data';
import { isVentaLog } from '../utils/helpers';

/**
 * Custom hook que calcula todos los datos derivados del Dashboard.
 * @param {object} params
 * @param {Array} params.transactions - Transacciones activas
 * @param {Array} params.dailyLogs - Logs del día
 * @param {Array} params.inventory - Inventario actual
 * @param {string} params.globalFilter - 'day' | 'week' | 'month'
 * @param {string} params.rankingMode - 'products' | 'categories'
 * @param {Array} params.expenses - Gastos registrados
 * @returns {object} Datos calculados para el Dashboard
 */
export default function useDashboardData({ transactions, dailyLogs, inventory, globalFilter, rankingMode, expenses = [] }) {
  const todayStr = useMemo(() => new Date().toLocaleDateString('es-AR'), []);
  const currentHour = new Date().getHours();

  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    const cleanDate = dateStr.split(',')[0].trim();
    const [day, month, year] = cleanDate.split('/').map(Number);
    if (!day || !month || !year) return null;
    return new Date(year, month - 1, day);
  };

  const getProductCost = (productId) => {
    if (!inventory) return 0;
    const product = inventory.find(p => p.id === productId);
    return product ? (Number(product.purchasePrice) || 0) : 0;
  };

  // =====================================================
  // HELPER: Filtro de rango por período (reutilizable)
  // =====================================================
  const isInRange = useMemo(() => {
    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;

    return (dateObj) => {
      if (!dateObj) return false;
      const dateStr = dateObj.toLocaleDateString('es-AR');

      if (globalFilter === 'day') return dateStr === todayStr;
      if (globalFilter === 'week') {
        const diffDays = Math.floor((now - dateObj) / oneDay);
        return diffDays >= 0 && diffDays < 7;
      }
      if (globalFilter === 'month') {
        return dateObj.getMonth() === now.getMonth() && dateObj.getFullYear() === now.getFullYear();
      }
      return false;
    };
  }, [globalFilter, todayStr]);

  // =====================================================
  // DATOS FILTRADOS POR PERÍODO (Ventas)
  // =====================================================
  const filteredData = useMemo(() => {
    const validTransactions = [];
    const processedTxIds = new Set();

    (transactions || []).forEach(tx => {
      if (tx.status === 'voided') return;
      const txDate = parseDate(tx.date);
      if (isInRange(txDate)) {
        validTransactions.push({
          source: 'tx', id: tx.id, date: txDate, time: tx.time,
          total: Number(tx.total) || 0, payment: tx.payment, items: tx.items || []
        });
        processedTxIds.add(tx.id);
      }
    });

    (dailyLogs || []).forEach(log => {
      if (isVentaLog(log) && log.details) {
        const txId = log.details.transactionId;
        if (!processedTxIds.has(txId)) {
          const logDate = parseDate(log.date);
          if (isInRange(logDate)) {
            validTransactions.push({
              source: 'log', id: txId || log.id, date: logDate,
              time: log.timestamp || '00:00',
              total: Number(log.details.total) || 0,
              payment: log.details.payment || 'Efectivo',
              items: log.details.items || []
            });
          }
        }
      }
    });

    return validTransactions;
  }, [globalFilter, transactions, dailyLogs, todayStr, isInRange]);

  // =====================================================
  // GASTOS FILTRADOS POR PERÍODO
  // =====================================================
  const filteredExpenses = useMemo(() => {
    return (expenses || []).filter(exp => {
      const expDate = parseDate(exp.date);
      return isInRange(expDate);
    });
  }, [expenses, isInRange]);

  // =====================================================
  // EXPENSE STATS: Total, Cantidad, Desglose por Categoría
  // =====================================================
  const expenseStats = useMemo(() => {
    const total = filteredExpenses.reduce((acc, exp) => acc + (Number(exp.amount) || 0), 0);
    const count = filteredExpenses.length;

    // Desglose por categoría
    const byCategory = {};
    filteredExpenses.forEach(exp => {
      const cat = exp.category || 'Otros';
      if (!byCategory[cat]) byCategory[cat] = { name: cat, total: 0, count: 0 };
      byCategory[cat].total += (Number(exp.amount) || 0);
      byCategory[cat].count += 1;
    });

    // Desglose por método de pago
    const byPayment = {};
    filteredExpenses.forEach(exp => {
      const method = exp.paymentMethod || 'Efectivo';
      if (!byPayment[method]) byPayment[method] = { name: method, total: 0 };
      byPayment[method].total += (Number(exp.amount) || 0);
    });

    return {
      total,
      count,
      byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
      byPayment: Object.values(byPayment).sort((a, b) => b.total - a.total),
    };
  }, [filteredExpenses]);

  // =====================================================
  // KPIs: VENTAS, INGRESO BRUTO, GANANCIA NETA
  // =====================================================
  const kpiStats = useMemo(() => {
    let gross = 0;
    let net = 0;
    const count = filteredData.length;

    filteredData.forEach(tx => {
      gross += tx.total;
      let cost = 0;
      tx.items.forEach(item => {
        const qty = Number(item.qty) || Number(item.quantity) || 0;
        const pCost = getProductCost(item.id || item.productId);
        cost += pCost * qty;
      });
      net += (tx.total - cost);
    });

    // Descontar gastos del período para obtener la ganancia neta real
    net -= expenseStats.total;

    return { gross, net, count };
  }, [filteredData, inventory, expenseStats]);

  const averageTicket = kpiStats.count > 0 ? kpiStats.gross / kpiStats.count : 0;

  // =====================================================
  // DATOS DEL GRÁFICO
  // =====================================================
  const chartData = useMemo(() => {
    if (globalFilter === 'day') {
      const ranges = [
        { label: '9-12', start: 9, end: 12, sales: 0, count: 0 },
        { label: '12-14', start: 12, end: 14, sales: 0, count: 0 },
        { label: '14-17', start: 14, end: 17, sales: 0, count: 0 },
        { label: '17-21', start: 17, end: 21, sales: 0, count: 0 },
        { label: '21+', start: 21, end: 24, sales: 0, count: 0 },
      ];

      filteredData.forEach(tx => {
        if (!tx.time) return;
        const hour = parseInt(tx.time.split(':')[0], 10);
        const range = ranges.find(r => hour >= r.start && hour < r.end);
        if (range) {
          range.sales += tx.total;
          range.count += 1;
        }
      });

      return ranges.map(r => ({ ...r, isCurrent: currentHour >= r.start && currentHour < r.end }));
    }

    const daysMap = new Map();
    const now = new Date();
    const daysToShow = globalFilter === 'week' ? 7 : 30;

    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('es-AR');
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      const dayName = d.toLocaleDateString('es-AR', { weekday: 'short' });
      daysMap.set(key, { label, dayName, sales: 0, count: 0, fullDate: key, isToday: i === 0 });
    }

    filteredData.forEach(tx => {
      const key = tx.date.toLocaleDateString('es-AR');
      if (daysMap.has(key)) {
        const entry = daysMap.get(key);
        entry.sales += tx.total;
        entry.count += 1;
      }
    });

    const dayArray = Array.from(daysMap.values());

    if (globalFilter === 'month') {
      const currentDayOfMonth = new Date().getDate();
      const getCurrentWeekIndex = () => {
        if (currentDayOfMonth <= 7) return 0;
        if (currentDayOfMonth <= 14) return 1;
        if (currentDayOfMonth <= 21) return 2;
        return 3;
      };
      const currentWeekIdx = getCurrentWeekIndex();

      const weeks = [
        { label: '1-7', sales: 0, count: 0, isCurrent: currentWeekIdx === 0 },
        { label: '8-14', sales: 0, count: 0, isCurrent: currentWeekIdx === 1 },
        { label: '15-21', sales: 0, count: 0, isCurrent: currentWeekIdx === 2 },
        { label: '22+', sales: 0, count: 0, isCurrent: currentWeekIdx === 3 },
      ];

      filteredData.forEach(tx => {
        if (!tx.date) return;
        const dayOfMonth = tx.date.getDate();
        let weekIdx;
        if (dayOfMonth <= 7) weekIdx = 0;
        else if (dayOfMonth <= 14) weekIdx = 1;
        else if (dayOfMonth <= 21) weekIdx = 2;
        else weekIdx = 3;
        weeks[weekIdx].sales += tx.total;
        weeks[weekIdx].count += 1;
      });

      return weeks;
    }
    return dayArray;
  }, [globalFilter, filteredData, currentHour]);

  const maxSales = useMemo(() => {
    const max = Math.max(...chartData.map(d => d.sales));
    return max > 0 ? max : 1;
  }, [chartData]);

  // =====================================================
  // MÉTODOS DE PAGO
  // =====================================================
  const paymentStats = useMemo(() => {
    return PAYMENT_METHODS.map(method => {
      const total = filteredData
        .filter(tx => tx.payment === method.id)
        .reduce((sum, tx) => sum + tx.total, 0);
      return { ...method, total };
    });
  }, [filteredData]);

  // =====================================================
  // RANKING PRODUCTOS / CATEGORÍAS
  // =====================================================
  const rankingStats = useMemo(() => {
    const statsMap = {};

    filteredData.forEach(tx => {
      tx.items.forEach(item => {
        const qty = Number(item.qty) || Number(item.quantity) || 0;
        const revenue = (Number(item.price) || 0) * qty;

        if (rankingMode === 'products') {
          const key = item.title || 'Desconocido';
          if (!statsMap[key]) statsMap[key] = { name: key, qty: 0, revenue: 0 };
          statsMap[key].qty += qty;
          statsMap[key].revenue += revenue;
        } else {
          let cats = [];
          const liveProduct = inventory ? inventory.find(p => p.id === item.id) : null;

          if (liveProduct) {
            if (Array.isArray(liveProduct.categories) && liveProduct.categories.length > 0) {
              cats = liveProduct.categories;
            } else if (liveProduct.category) {
              cats = [liveProduct.category];
            }
          }

          if (cats.length === 0) {
            if (Array.isArray(item.categories) && item.categories.length > 0) {
              cats = item.categories;
            } else if (item.category) {
              cats = [item.category];
            }
          }

          if (cats.length === 0) cats = ['Sin Categoría'];

          cats.forEach(cat => {
            if (!statsMap[cat]) statsMap[cat] = { name: cat, qty: 0, revenue: 0 };
            statsMap[cat].qty += qty;
            statsMap[cat].revenue += revenue;
          });
        }
      });
    });

    return Object.values(statsMap).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [filteredData, rankingMode, inventory]);

  // =====================================================
  // STOCK BAJO
  // =====================================================
  const lowStockProducts = useMemo(() => {
    if (!inventory) return [];
    return inventory.filter((p) => p.stock < 10).sort((a, b) => a.stock - b.stock).slice(0, 5);
  }, [inventory]);

  // =====================================================
  // HELPER: Mensaje estado vacío
  // =====================================================
  const getEmptyStateMessage = () => {
    switch (globalFilter) {
      case 'day': return 'Sin ventas hoy';
      case 'week': return 'Sin ventas esta semana';
      case 'month': return 'Sin ventas este mes';
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
    getEmptyStateMessage,
    expenseStats,
  };
}