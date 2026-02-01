import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  Edit2,
  DollarSign,
  Package,
  BarChart3,
  Calendar,
  CalendarDays,
  Clock,
  CalendarRange,
} from 'lucide-react';
import { PAYMENT_METHODS } from '../data';

export default function DashboardView({
  openingBalance,
  totalSales,
  salesCount,
  currentUser,
  setTempOpeningBalance,
  setIsOpeningBalanceModalOpen,
  transactions,
  dailyLogs,
  inventory,
}) {
  const [topProductsView, setTopProductsView] = useState('day');
  const [salesChartView, setSalesChartView] = useState('week');

  // =====================================================
  // HELPERS
  // =====================================================

  const normalizeDate = (dateStr) => {
    if (!dateStr) return null;
    const cleanDate = dateStr.split(',')[0].trim();
    const parts = cleanDate.split('/');
    if (parts.length >= 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      return { day, month, year, str: `${day}/${month}/${year}` };
    }
    return null;
  };

  const dateToNormalized = (date) => ({
    day: date.getDate(),
    month: date.getMonth() + 1,
    year: date.getFullYear(),
    str: `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`,
  });

  const isVentaLog = (log) => {
    const action = log.action || '';
    return action === 'Venta Realizada' || action === 'Nueva Venta';
  };

  const getVentaTotal = (details) => {
    if (!details) return 0;
    if (details.total !== undefined) return Number(details.total) || 0;
    if (details.items && Array.isArray(details.items)) {
      return details.items.reduce((sum, item) => {
        const price = Number(item.price) || 0;
        const qty = Number(item.qty) || Number(item.quantity) || 0;
        return sum + price * qty;
      }, 0);
    }
    return 0;
  };

  const currentHour = new Date().getHours();
  const todayStr = useMemo(() => dateToNormalized(new Date()).str, []);

  // =====================================================
  // CALCULAR VENTAS DEL DÍA (combinando transactions + dailyLogs de hoy)
  // =====================================================
  const todayStats = useMemo(() => {
    let total = 0;
    let count = 0;

    // Sumar transactions del estado actual
    (transactions || []).forEach((tx) => {
      if (tx.status !== 'voided') {
        total += tx.total || 0;
        count += 1;
      }
    });

    // También incluir ventas de dailyLogs que sean de hoy
    // (por si el generador creó ventas para hoy)
    (dailyLogs || []).forEach((log) => {
      if (isVentaLog(log) && log.details) {
        const logDate = normalizeDate(log.date);
        if (logDate && logDate.str === todayStr) {
          // Verificar que no sea una transacción ya contada
          const txId = log.details.transactionId;
          const alreadyCounted = (transactions || []).some(
            (tx) => tx.id === txId
          );
          if (!alreadyCounted) {
            total += getVentaTotal(log.details);
            count += 1;
          }
        }
      }
    });

    return { total, count };
  }, [transactions, dailyLogs, todayStr]);

  // Usar las estadísticas calculadas si las props son 0
  const displayTotalSales = totalSales > 0 ? totalSales : todayStats.total;
  const displaySalesCount = salesCount > 0 ? salesCount : todayStats.count;

  // =====================================================
  // VENTAS POR HORARIO (Vista: Día)
  // =====================================================
  const salesByHour = useMemo(() => {
    const timeRanges = [
      { label: '9-12', start: 9, end: 12, sales: 0, count: 0 },
      { label: '12-14', start: 12, end: 14, sales: 0, count: 0 },
      { label: '16-19', start: 16, end: 19, sales: 0, count: 0 },
      { label: '19-21', start: 19, end: 21, sales: 0, count: 0 },
    ];

    // Logs de hoy
    (dailyLogs || []).forEach((log) => {
      if (isVentaLog(log) && log.details) {
        const logDate = normalizeDate(log.date);
        if (logDate && logDate.str === todayStr) {
          const timeParts = log.timestamp ? log.timestamp.split(':') : [];
          if (timeParts.length >= 1) {
            const hour = parseInt(timeParts[0], 10);
            timeRanges.forEach((range) => {
              if (hour >= range.start && hour < range.end) {
                range.sales += getVentaTotal(log.details);
                range.count += 1;
              }
            });
          }
        }
      }
    });

    // Transactions actuales
    (transactions || []).forEach((tx) => {
      if (tx.status !== 'voided') {
        // Intentar extraer la hora de tx.date o tx.time
        let hour = null;
        if (tx.time) {
          const timeParts = tx.time.split(':');
          hour = parseInt(timeParts[0], 10);
        } else if (tx.date && tx.date.includes(',')) {
          const dateTimeParts = tx.date.split(', ');
          if (dateTimeParts.length >= 2) {
            const timeParts = dateTimeParts[1].split(':');
            hour = parseInt(timeParts[0], 10);
          }
        }
        if (hour !== null && !isNaN(hour)) {
          timeRanges.forEach((range) => {
            if (hour >= range.start && hour < range.end) {
              range.sales += tx.total || 0;
              range.count += 1;
            }
          });
        }
      }
    });

    timeRanges.forEach((range) => {
      range.isCurrent = currentHour >= range.start && currentHour < range.end;
    });

    return timeRanges;
  }, [dailyLogs, transactions, currentHour, todayStr]);

  // =====================================================
  // VENTAS POR DÍA (Vista: Semana) - SIN DOMINGOS
  // =====================================================
  const salesByDay = useMemo(() => {
    const today = new Date();
    const days = [];
    let daysAdded = 0;
    let offset = 0;

    // Agregar 7 días laborales (sin domingos)
    while (daysAdded < 7) {
      const date = new Date(today);
      date.setDate(date.getDate() - offset);

      // Excluir domingos (0 = domingo)
      if (date.getDay() !== 0) {
        const normalized = dateToNormalized(date);
        days.unshift({
          ...normalized,
          label: `${normalized.day}/${normalized.month}`,
          dayName: date.toLocaleDateString('es-AR', { weekday: 'short' }),
          sales: 0,
          count: 0,
          isToday: offset === 0,
        });
        daysAdded++;
      }
      offset++;
    }

    // Procesar dailyLogs
    (dailyLogs || []).forEach((log) => {
      if (isVentaLog(log) && log.details && log.date) {
        const logDate = normalizeDate(log.date);
        if (logDate) {
          const dayIndex = days.findIndex((d) => d.str === logDate.str);
          if (dayIndex !== -1) {
            days[dayIndex].sales += getVentaTotal(log.details);
            days[dayIndex].count += 1;
          }
        }
      }
    });

    // Agregar transactions de hoy
    const todayData = days.find((d) => d.isToday);
    if (todayData) {
      (transactions || []).forEach((tx) => {
        if (tx.status !== 'voided') {
          todayData.sales += tx.total || 0;
          todayData.count += 1;
        }
      });
    }

    return days;
  }, [dailyLogs, transactions]);

  // =====================================================
  // VENTAS POR SEMANA (Vista: Mes)
  // =====================================================
  const salesByWeek = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const lastDay = new Date(currentYear, currentMonth, 0).getDate();
    const todayDay = today.getDate();

    const weeks = [
      { label: '1-7', start: 1, end: 7, sales: 0, count: 0 },
      { label: '8-14', start: 8, end: 14, sales: 0, count: 0 },
      { label: '15-21', start: 15, end: 21, sales: 0, count: 0 },
      { label: `22-${lastDay}`, start: 22, end: lastDay, sales: 0, count: 0 },
    ];

    weeks.forEach((week) => {
      week.isCurrent = todayDay >= week.start && todayDay <= week.end;
    });

    (dailyLogs || []).forEach((log) => {
      if (isVentaLog(log) && log.details && log.date) {
        const logDate = normalizeDate(log.date);
        if (
          logDate &&
          logDate.month === currentMonth &&
          logDate.year === currentYear
        ) {
          weeks.forEach((week) => {
            if (logDate.day >= week.start && logDate.day <= week.end) {
              week.sales += getVentaTotal(log.details);
              week.count += 1;
            }
          });
        }
      }
    });

    // Agregar transactions de hoy a la semana correspondiente
    (transactions || []).forEach((tx) => {
      if (tx.status !== 'voided') {
        weeks.forEach((week) => {
          if (todayDay >= week.start && todayDay <= week.end) {
            week.sales += tx.total || 0;
            week.count += 1;
          }
        });
      }
    });

    return weeks;
  }, [dailyLogs, transactions]);

  const chartData = useMemo(() => {
    switch (salesChartView) {
      case 'day':
        return salesByHour;
      case 'week':
        return salesByDay;
      case 'month':
        return salesByWeek;
      default:
        return salesByDay;
    }
  }, [salesChartView, salesByHour, salesByDay, salesByWeek]);

  const maxSales = useMemo(() => {
    const allSales = chartData.map((d) => d.sales);
    const max = Math.max(...allSales);
    return max > 0 ? max : 1;
  }, [chartData]);

  const yAxisLabels = useMemo(() => {
    if (maxSales <= 0) return ['$0', '$0', '$0', '$0'];
    return [
      `$${Math.round(maxSales).toLocaleString()}`,
      `$${Math.round(maxSales * 0.66).toLocaleString()}`,
      `$${Math.round(maxSales * 0.33).toLocaleString()}`,
      '$0',
    ];
  }, [maxSales]);

  const chartInfo = useMemo(() => {
    switch (salesChartView) {
      case 'day':
        return { title: 'Ventas de Hoy', subtitle: 'Por horario' };
      case 'week':
        return {
          title: 'Ventas por Día',
          subtitle: 'Últimos 7 días (sin dom.)',
        };
      case 'month':
        return { title: 'Ventas del Mes', subtitle: 'Por semana' };
      default:
        return { title: 'Ventas', subtitle: '' };
    }
  }, [salesChartView]);

  const topProductsToday = useMemo(() => {
    const productSales = {};

    // Desde transactions
    (transactions || []).forEach((tx) => {
      if (tx.items && tx.status !== 'voided') {
        tx.items.forEach((item) => {
          const key = item.title || item.id;
          if (!productSales[key]) {
            productSales[key] = { title: item.title, qty: 0, revenue: 0 };
          }
          productSales[key].qty += item.qty || item.quantity || 0;
          productSales[key].revenue +=
            (item.price || 0) * (item.qty || item.quantity || 0);
        });
      }
    });

    // Desde dailyLogs de hoy
    (dailyLogs || []).forEach((log) => {
      if (isVentaLog(log) && log.details && log.details.items) {
        const logDate = normalizeDate(log.date);
        if (logDate && logDate.str === todayStr) {
          log.details.items.forEach((item) => {
            const key = item.title || item.id;
            if (!productSales[key]) {
              productSales[key] = { title: item.title, qty: 0, revenue: 0 };
            }
            productSales[key].qty += item.qty || item.quantity || 0;
            productSales[key].revenue +=
              (item.price || 0) * (item.qty || item.quantity || 0);
          });
        }
      }
    });

    return Object.values(productSales)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [transactions, dailyLogs, todayStr]);

  const topProductsMonth = useMemo(() => {
    const productSales = {};
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    (dailyLogs || []).forEach((log) => {
      if (isVentaLog(log) && log.details && log.details.items) {
        const logDate = normalizeDate(log.date);
        if (
          logDate &&
          logDate.month === currentMonth &&
          logDate.year === currentYear
        ) {
          log.details.items.forEach((item) => {
            const key = item.title || item.id;
            if (!productSales[key]) {
              productSales[key] = { title: item.title, qty: 0, revenue: 0 };
            }
            productSales[key].qty += item.qty || item.quantity || 0;
            productSales[key].revenue +=
              (item.price || 0) * (item.qty || item.quantity || 0);
          });
        }
      }
    });

    (transactions || []).forEach((tx) => {
      if (tx.items && tx.status !== 'voided') {
        tx.items.forEach((item) => {
          const key = item.title || item.id;
          if (!productSales[key]) {
            productSales[key] = { title: item.title, qty: 0, revenue: 0 };
          }
          productSales[key].qty += item.qty || item.quantity || 0;
          productSales[key].revenue +=
            (item.price || 0) * (item.qty || item.quantity || 0);
        });
      }
    });

    return Object.values(productSales)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [dailyLogs, transactions]);

  const topProducts =
    topProductsView === 'day' ? topProductsToday : topProductsMonth;
  const avgTicket =
    displaySalesCount > 0 ? displayTotalSales / displaySalesCount : 0;

  const lowStockProducts = useMemo(() => {
    if (!inventory) return [];
    return inventory.filter((p) => p.stock > 0 && p.stock < 10).slice(0, 5);
  }, [inventory]);

  // =====================================================
  // RENDER
  // =====================================================
  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Tarjetas principales - más compactas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase">
              Caja Inicial
            </span>
            {currentUser.role === 'admin' && (
              <button
                onClick={() => {
                  setTempOpeningBalance(String(openingBalance));
                  setIsOpeningBalanceModalOpen(true);
                }}
                className="text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 p-1 rounded transition"
              >
                <Edit2 size={12} />
              </button>
            )}
          </div>
          <span className="text-xl font-bold text-slate-800">
            ${openingBalance.toLocaleString()}
          </span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-300"></div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-fuchsia-100 relative overflow-hidden">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] font-bold text-fuchsia-400 uppercase">
              Total Vendido
            </span>
            <TrendingUp size={14} className="text-fuchsia-500" />
          </div>
          <span className="text-xl font-bold text-fuchsia-600">
            ${displayTotalSales.toLocaleString()}
          </span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-fuchsia-400 to-fuchsia-600"></div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-100 relative overflow-hidden">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] font-bold text-blue-400 uppercase">
              Ventas Hoy
            </span>
            <Package size={14} className="text-blue-500" />
          </div>
          <span className="text-xl font-bold text-blue-600">
            {displaySalesCount}{' '}
            <span className="text-sm font-normal text-slate-400">ventas</span>
          </span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-400"></div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-green-100 relative overflow-hidden">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] font-bold text-green-500 uppercase">
              Promedio x Venta
            </span>
            <DollarSign size={14} className="text-green-500" />
          </div>
          <span className="text-xl font-bold text-green-600">
            ${avgTicket.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-green-400"></div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 size={18} className="text-fuchsia-500" />
                {chartInfo.title}
              </h3>
              <span className="text-xs text-slate-400">
                {chartInfo.subtitle}
              </span>
            </div>

            <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
              <button
                onClick={() => setSalesChartView('day')}
                className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-all ${
                  salesChartView === 'day'
                    ? 'bg-white text-fuchsia-600 font-bold shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Clock size={12} /> Día
              </button>
              <button
                onClick={() => setSalesChartView('week')}
                className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-all ${
                  salesChartView === 'week'
                    ? 'bg-white text-fuchsia-600 font-bold shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Calendar size={12} /> Semana
              </button>
              <button
                onClick={() => setSalesChartView('month')}
                className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-all ${
                  salesChartView === 'month'
                    ? 'bg-white text-fuchsia-600 font-bold shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <CalendarRange size={12} /> Mes
              </button>
            </div>
          </div>

          {/* Gráfico de barras */}
          <div className="flex">
            <div
              className="flex flex-col justify-between pr-2 py-1 text-right"
              style={{ height: '180px', minWidth: '65px' }}
            >
              {yAxisLabels.map((label, idx) => (
                <span
                  key={idx}
                  className="text-[9px] text-slate-400 whitespace-nowrap"
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="flex-1 relative">
              <div
                className="absolute inset-0 flex flex-col justify-between pointer-events-none"
                style={{ height: '180px' }}
              >
                <div className="border-t border-slate-200"></div>
                <div className="border-t border-dashed border-slate-100"></div>
                <div className="border-t border-dashed border-slate-100"></div>
                <div className="border-t border-slate-200"></div>
              </div>

              <div
                className="flex items-end justify-around gap-2 relative"
                style={{ height: '180px' }}
              >
                {chartData.map((item, idx) => {
                  const heightPercent =
                    maxSales > 0 ? (item.sales / maxSales) * 100 : 0;
                  const isCurrent =
                    item.isCurrent ||
                    (salesChartView === 'week' && item.isToday);
                  const hasData = item.sales > 0;

                  return (
                    <div
                      key={idx}
                      className="flex-1 h-full flex flex-col items-center justify-end group relative"
                    >
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-20 pointer-events-none shadow-lg">
                        <p className="font-bold">
                          ${item.sales.toLocaleString()}
                        </p>
                        <p className="text-slate-300">{item.count} pedidos</p>
                      </div>

                      <div
                        className={`w-full max-w-[36px] rounded-t transition-all duration-500 cursor-pointer ${
                          isCurrent
                            ? 'bg-fuchsia-500 hover:bg-fuchsia-600 shadow-md'
                            : hasData
                            ? 'bg-fuchsia-300 hover:bg-fuchsia-400'
                            : 'bg-slate-100'
                        }`}
                        style={{
                          height: hasData
                            ? `${Math.max(heightPercent, 4)}%`
                            : '3px',
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-around gap-2 mt-2 pt-2 border-t border-slate-200">
                {chartData.map((item, idx) => {
                  const isCurrent =
                    item.isCurrent ||
                    (salesChartView === 'week' && item.isToday);
                  return (
                    <div key={idx} className="flex-1 text-center">
                      <p
                        className={`text-[10px] font-bold ${
                          isCurrent ? 'text-fuchsia-600' : 'text-slate-600'
                        }`}
                      >
                        {item.label}
                      </p>
                      <p
                        className={`text-[9px] ${
                          isCurrent ? 'text-fuchsia-400' : 'text-slate-400'
                        }`}
                      >
                        {salesChartView === 'week'
                          ? item.dayName
                          : salesChartView === 'day'
                          ? 'hs'
                          : 'días'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t flex justify-between text-xs">
            <span className="text-slate-500">
              Total:{' '}
              <span className="font-bold text-slate-700">
                $
                {chartData
                  .reduce((acc, d) => acc + d.sales, 0)
                  .toLocaleString()}
              </span>
            </span>
            <span className="text-slate-500">
              Pedidos:{' '}
              <span className="font-bold text-slate-700">
                {chartData.reduce((acc, d) => acc + d.count, 0)}
              </span>
            </span>
          </div>
        </div>

        {/* Métodos de pago */}
        <div className="bg-white p-5 rounded-xl shadow-sm border">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <DollarSign size={18} className="text-green-500" />
            Por Método de Pago
          </h3>
          <div className="space-y-3">
            {PAYMENT_METHODS.map((m) => {
              const totalMethod = (transactions || [])
                .filter((t) => t.payment === m.id && t.status !== 'voided')
                .reduce((acc, t) => acc + t.total, 0);
              const percent =
                displayTotalSales > 0
                  ? (totalMethod / displayTotalSales) * 100
                  : 0;

              return (
                <div key={m.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-bold text-slate-600">{m.label}</span>
                    <span className="text-slate-800 font-bold">
                      ${totalMethod.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-fuchsia-500 h-2 rounded-full transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Productos más vendidos + Stock bajo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp size={18} className="text-green-500" />
              Productos Más Vendidos
            </h3>
            <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
              <button
                onClick={() => setTopProductsView('day')}
                className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-all ${
                  topProductsView === 'day'
                    ? 'bg-white text-fuchsia-600 font-bold shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Calendar size={12} /> Hoy
              </button>
              <button
                onClick={() => setTopProductsView('month')}
                className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-all ${
                  topProductsView === 'month'
                    ? 'bg-white text-fuchsia-600 font-bold shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <CalendarDays size={12} /> Mes
              </button>
            </div>
          </div>
          {topProducts.length > 0 ? (
            <div className="space-y-2">
              {topProducts.map((product, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-slate-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0
                          ? 'bg-amber-400 text-white'
                          : idx === 1
                          ? 'bg-slate-400 text-white'
                          : idx === 2
                          ? 'bg-amber-700 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium text-slate-700 truncate max-w-[150px]">
                      {product.title}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-800">
                      {product.qty} uds
                    </p>
                    <p className="text-[10px] text-slate-400">
                      ${product.revenue.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-4">
              {topProductsView === 'day'
                ? 'Sin ventas registradas hoy'
                : 'Sin ventas registradas este mes'}
            </p>
          )}
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Package size={18} className="text-amber-500" />
            Stock Bajo
            {lowStockProducts.length > 0 && (
              <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {lowStockProducts.length}
              </span>
            )}
          </h3>
          {lowStockProducts.length > 0 ? (
            <div className="space-y-2">
              {lowStockProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-2 bg-amber-50 rounded-lg border border-amber-100"
                >
                  <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]">
                    {product.title}
                  </span>
                  <span
                    className={`text-sm font-bold px-2 py-0.5 rounded ${
                      product.stock <= 3
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {product.stock} uds
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-4">
              Todo el stock está en niveles normales
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
