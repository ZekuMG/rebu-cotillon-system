// src/hooks/useDashboardData.js
// ♻️ REFACTOR: Lógica de cálculo extraída de DashboardView.jsx
// Centraliza filteredData, kpiStats, chartData, paymentStats, rankingStats, lowStockProducts

import { useMemo } from 'react';
import { PAYMENT_METHODS } from '../data';
import { isVentaLog, normalizeDate } from '../utils/helpers'; // Importamos el parser robusto

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
  const currentHour = new Date().getHours();

  // Función interna segura usando el helper
  const safeParseDate = (dateStr) => {
    // Si ya es un objeto Date, devolverlo
    if (dateStr instanceof Date) return dateStr;
    // Si es string, normalizarlo con nuestro helper
    return normalizeDate(dateStr);
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
    // Normalizamos 'now' al inicio del día para comparaciones justas
    now.setHours(0,0,0,0);
    const oneDay = 24 * 60 * 60 * 1000;

    return (dateObj) => {
      if (!dateObj) return false;
      
      // Normalizamos la fecha a comparar
      const compDate = new Date(dateObj);
      compDate.setHours(0,0,0,0); // Ignorar hora para comparar días

      if (globalFilter === 'day') {
        // Mismo día, mes y año
        return compDate.getTime() === now.getTime();
      }
      if (globalFilter === 'week') {
        // Diferencia en días
        const diffTime = now.getTime() - compDate.getTime();
        const diffDays = diffTime / oneDay;
        // La semana incluye hoy (0) y hasta hace 7 días
        return diffDays >= 0 && diffDays < 7;
      }
      if (globalFilter === 'month') {
        // Mismo mes y año
        return compDate.getMonth() === now.getMonth() && compDate.getFullYear() === now.getFullYear();
      }
      return false;
    };
  }, [globalFilter]);

  // =====================================================
  // DATOS FILTRADOS POR PERÍODO (Ventas)
  // =====================================================
  const filteredData = useMemo(() => {
    const validTransactions = [];
    const processedTxIds = new Set();

    // 1. Procesar Transacciones Reales (prioridad)
    (transactions || []).forEach(tx => {
      if (tx.status === 'voided') return;
      
      const txDate = safeParseDate(tx.date); // Parser robusto DD/MM/YYYY
      
      if (txDate && isInRange(txDate)) {
        validTransactions.push({
          source: 'tx', 
          id: tx.id, 
          date: txDate, // Guardamos el objeto Date real
          time: tx.time,
          total: Number(tx.total) || 0, 
          payment: tx.payment, 
          items: tx.items || []
        });
        processedTxIds.add(tx.id);
      }
    });

    // 2. Procesar Logs (fallback para ventas sin registro completo)
    (dailyLogs || []).forEach(log => {
      if (isVentaLog(log) && log.details) {
        const txId = log.details.transactionId;
        if (!processedTxIds.has(txId)) { // Evitar duplicados
          
          const logDate = safeParseDate(log.date); // Parser robusto
          
          if (logDate && isInRange(logDate)) {
            validTransactions.push({
              source: 'log', 
              id: txId || log.id, 
              date: logDate, // Guardamos el objeto Date real
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
  }, [globalFilter, transactions, dailyLogs, isInRange]);

  // =====================================================
  // GASTOS FILTRADOS POR PERÍODO
  // =====================================================
  const filteredExpenses = useMemo(() => {
    return (expenses || []).filter(exp => {
      const expDate = safeParseDate(exp.date);
      return expDate && isInRange(expDate);
    });
  }, [expenses, isInRange]);

  // =====================================================
  // EXPENSE STATS
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
  // KPIs
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
      // Clave única día/mes
      const key = `${d.getDate()}/${d.getMonth() + 1}`;
      const label = key;
      const dayName = d.toLocaleDateString('es-AR', { weekday: 'short' });
      daysMap.set(key, { label, dayName, sales: 0, count: 0, fullDate: key, isToday: i === 0 });
    }

    filteredData.forEach(tx => {
      // Usamos el objeto Date real que ya parseamos en filteredData
      if (!tx.date) return;
      
      const d = tx.date;
      const key = `${d.getDate()}/${d.getMonth() + 1}`;
      
      if (daysMap.has(key)) {
        const entry = daysMap.get(key);
        entry.sales += tx.total;
        entry.count += 1;
      }
    });

    const dayArray = Array.from(daysMap.values());

    if (globalFilter === 'month') {
      // Lógica de semanas dentro del mes actual
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

        let keys = [];
        if (rankingMode === 'products') {
          keys = [item.title || 'Desconocido'];
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
          keys = cats;
        }

        keys.forEach(k => {
          if (!statsMap[k]) statsMap[k] = { name: k, qty: 0, revenue: 0 };
          statsMap[k].qty += qty;
          statsMap[k].revenue += revenue;
        });
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
    filteredData,       // ✅ NUEVO: Ventas filtradas por período
    filteredExpenses,   // ✅ NUEVO: Gastos filtrados por período
  };
}