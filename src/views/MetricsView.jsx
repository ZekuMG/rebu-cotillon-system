import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  CreditCard,
  Download,
  FileText,
  LineChart as LineChartIcon,
  PackageSearch,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import useMetricsData from '../hooks/useMetricsData';
import { FancyPrice } from '../components/FancyPrice';
import HintIcon from '../components/HintIcon';
import { formatCurrency, formatNumber } from '../utils/helpers';
import { hasPermission } from '../utils/userPermissions';

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];

const DEFAULT_FILTERS = {
  preset: '30d',
  startDate: '',
  endDate: '',
  user: '',
  payment: '',
  category: '',
  product: '',
  client: '',
  status: 'all',
  productType: 'all',
  includeVoided: false,
  includeTest: false,
};

const BASE_SECTIONS = [
  { id: 'summary', label: 'Resumen', icon: BarChart3 },
  { id: 'sales', label: 'Ventas', icon: TrendingUp },
  { id: 'profit', label: 'Ganancias', icon: WalletCards, permission: 'metrics.viewProfit' },
  { id: 'products', label: 'Productos', icon: ShoppingBag },
  { id: 'categories', label: 'Categorías', icon: Boxes },
  { id: 'payments', label: 'Pagos', icon: CreditCard },
  { id: 'clients', label: 'Clientes', icon: Users, permission: 'metrics.viewClients' },
  { id: 'stock', label: 'Stock', icon: PackageSearch },
  { id: 'orders', label: 'Pedidos', icon: FileText },
  { id: 'users', label: 'Usuarios', icon: ShieldCheck, permission: 'metrics.viewUsers' },
  { id: 'cash', label: 'Caja', icon: CalendarDays },
];

const SelectField = ({ label, value, onChange, children, className = '' }) => (
  <label className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
    <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 outline-none transition focus:border-fuchsia-300 focus:ring-2 focus:ring-fuchsia-100"
    >
      {children}
    </select>
  </label>
);

const InputField = ({ label, value, onChange, type = 'text', className = '' }) => (
  <label className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
    <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 outline-none transition focus:border-fuchsia-300 focus:ring-2 focus:ring-fuchsia-100"
    />
  </label>
);

const ToggleField = ({ checked, onChange, label }) => (
  <label className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-600">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-500"
    />
    {label}
  </label>
);

const Panel = ({ title, icon: Icon, hint, children, action }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
    <div className="mb-2 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon size={17} className="shrink-0 text-fuchsia-500" />}
        <h3 className="truncate text-sm font-black text-slate-800">{title}</h3>
        {hint && <HintIcon hint={hint} size={13} />}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const MetricCard = ({ label, value, sublabel, change, tone = 'slate', hidden = false, hint }) => {
  const toneClass = {
    slate: 'text-slate-900 bg-slate-50 border-slate-200',
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    sky: 'text-sky-700 bg-sky-50 border-sky-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    rose: 'text-rose-700 bg-rose-50 border-rose-200',
    violet: 'text-violet-700 bg-violet-50 border-violet-200',
  }[tone] || 'text-slate-900 bg-slate-50 border-slate-200';

  const changeLabel = Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${formatNumber(change, 1)}%` : null;
  const changeClass = change >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';

  return (
    <div className={`min-h-[88px] rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[9px] font-black uppercase tracking-[0.12em] opacity-70">{label}</p>
        {hint && <HintIcon hint={hint} size={13} />}
      </div>
      <div className="mt-2 min-w-0 truncate text-xl font-black tracking-normal 2xl:text-2xl">
        {hidden ? <span className="text-slate-400">Restringido</span> : value}
      </div>
      <div className="mt-2 flex min-h-[20px] items-center justify-between gap-2">
        <p className="truncate text-[10px] font-semibold opacity-70">{hidden ? 'Permiso requerido' : sublabel}</p>
        {!hidden && changeLabel && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${changeClass}`}>
            {changeLabel}
          </span>
        )}
      </div>
    </div>
  );
};

const FinanceBreakdown = ({ stats }) => {
  const marginRate = stats.revenue ? (stats.profit / stats.revenue) * 100 : 0;
  const items = [
    {
      label: 'Ingreso bruto',
      value: stats.revenue,
      tone: 'text-sky-700 bg-sky-50 border-sky-100',
      hint: 'Total vendido antes de restar costos y gastos.',
    },
    {
      label: 'Costo vendido',
      value: stats.cost,
      tone: 'text-slate-700 bg-slate-50 border-slate-200',
      hint: 'Costo estimado de la mercadería vendida, calculado desde stockChanges o precio de compra.',
    },
    {
      label: 'Gastos',
      value: stats.expenses,
      tone: 'text-rose-700 bg-rose-50 border-rose-100',
      hint: 'Gastos registrados dentro del rango filtrado.',
    },
    {
      label: 'Ganancia neta',
      value: stats.profit,
      tone: stats.profit >= 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-rose-700 bg-rose-50 border-rose-100',
      hint: 'Ingreso bruto menos costo vendido y gastos.',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className={`rounded-lg border px-3 py-2 ${item.tone}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[9px] font-black uppercase tracking-[0.12em] opacity-70">{item.label}</p>
            <HintIcon hint={item.hint} size={12} />
          </div>
          <div className="mt-1 truncate text-lg font-black">
            <FancyPrice amount={item.value} />
          </div>
        </div>
      ))}
      <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-500">
        <span>Fórmula: ingreso bruto - costo vendido - gastos = ganancia neta</span>
        <span className={`rounded-full px-2 py-0.5 font-black ${marginRate >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          Margen neto {formatNumber(marginRate, 1)}%
        </span>
      </div>
    </div>
  );
};

const EmptyState = ({ text = 'Sin datos para estos filtros.' }) => (
  <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm font-bold text-slate-400">
    {text}
  </div>
);

const ChartFrame = ({ height = 300, children }) => {
  const frameRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return undefined;

    const updateWidth = () => {
      const nextWidth = Math.floor(node.getBoundingClientRect().width || 0);
      setWidth((current) => (Math.abs(current - nextWidth) > 1 ? nextWidth : current));
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frameRef} className="min-w-0 overflow-hidden" style={{ width: '100%', minWidth: 1, height, minHeight: height }}>
      {width > 8 ? children : (
        <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-400">
          Preparando gráfico...
        </div>
      )}
    </div>
  );
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-black text-slate-700">{label}</p>
      {payload.map((item) => (
        <p key={`${item.dataKey}-${item.name}`} className="font-semibold" style={{ color: item.color }}>
          {item.name}: {String(item.dataKey).toLowerCase().includes('count') || String(item.name).toLowerCase().includes('ventas')
            ? formatNumber(item.value)
            : formatCurrency(item.value)}
        </p>
      ))}
    </div>
  );
};

const Table = ({ columns, rows, emptyText }) => (
  <div className="overflow-hidden rounded-lg border border-slate-200">
    <div className="custom-scrollbar max-h-[340px] overflow-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`px-3 py-2 font-black ${column.align === 'right' ? 'text-right' : ''}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center font-bold text-slate-400">{emptyText}</td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row.key || `${row.name || row.label}-${index}`} className="hover:bg-slate-50">
                {columns.map((column) => (
                  <td key={column.key} className={`px-3 py-2 font-semibold text-slate-700 ${column.align === 'right' ? 'text-right' : ''}`}>
                    {column.render ? column.render(row, index) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const exportCsv = (filename, rows) => {
  const escape = (value) => {
    const raw = String(value ?? '');
    return /[",\n;]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
  };
  const csv = rows.map((row) => row.map(escape).join(';')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const buildCsvRows = ({ metrics, canViewProfit, canViewUsers, canViewClients }) => {
  const rows = [
    ['Sección', 'Métrica', 'Valor'],
    ['Resumen', 'Ingreso bruto', metrics.current.stats.revenue],
    ['Resumen', 'Ventas', metrics.current.stats.salesCount],
    ['Resumen', 'Ticket promedio', metrics.current.stats.averageTicket],
    ['Resumen', 'Productos vendidos', metrics.current.stats.itemsSold],
    ['Resumen', 'Gastos', metrics.current.stats.expenses],
  ];

  if (canViewProfit) {
    rows.push(['Resumen', 'Costo estimado', metrics.current.stats.cost]);
    rows.push(['Resumen', 'Ganancia neta', metrics.current.stats.profit]);
  }

  rows.push([]);
  rows.push(['Productos', 'Nombre', 'Cantidad', 'Ingreso', canViewProfit ? 'Ganancia' : '']);
  metrics.current.productStats.forEach((item) => rows.push(['Productos', item.name, item.qty, item.revenue, canViewProfit ? item.profit : '']));

  rows.push([]);
  rows.push(['Categorías', 'Nombre', 'Cantidad', 'Ingreso', canViewProfit ? 'Ganancia' : '']);
  metrics.current.categoryStats.forEach((item) => rows.push(['Categorías', item.name, item.qty, item.revenue, canViewProfit ? item.profit : '']));

  rows.push([]);
  rows.push(['Pagos', 'Medio', 'Importe', 'Ventas']);
  metrics.current.paymentStats.forEach((item) => rows.push(['Pagos', item.name, item.value, item.salesCount]));

  if (canViewClients) {
    rows.push([]);
    rows.push(['Clientes', 'Nombre', 'Ventas', 'Ingreso', 'Última compra']);
    metrics.current.clientStats.forEach((item) => rows.push(['Clientes', item.name, item.salesCount, item.revenue, item.lastDateLabel]));
  }

  if (canViewUsers) {
    rows.push([]);
    rows.push(['Usuarios', 'Nombre', 'Ventas', 'Ingreso', canViewProfit ? 'Ganancia' : '']);
    metrics.current.userStats.forEach((item) => rows.push(['Usuarios', item.name, item.salesCount, item.revenue, canViewProfit ? item.profit : '']));
  }

  return rows;
};

export default function MetricsView({
  transactions = [],
  expenses = [],
  pastClosures = [],
  inventory = [],
  members = [],
  budgets = [],
  orders = [],
  dailyLogs = [],
  currentUser,
  isLoading = false,
  emptyStateMessage = '',
  onRefresh,
  isActive = true,
}) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeSection, setActiveSection] = useState('summary');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const canViewProfit = hasPermission(currentUser, 'metrics.viewProfit');
  const canViewUsers = hasPermission(currentUser, 'metrics.viewUsers');
  const canViewClients = hasPermission(currentUser, 'metrics.viewClients');
  const canExport = hasPermission(currentUser, 'metrics.export');
  const canConfigureAlerts = hasPermission(currentUser, 'metrics.configureAlerts');

  const metrics = useMetricsData({
    transactions,
    expenses,
    pastClosures,
    inventory,
    members,
    budgets,
    orders,
    dailyLogs,
    filters,
  });

  const sections = useMemo(
    () => BASE_SECTIONS.filter((section) => !section.permission || hasPermission(currentUser, section.permission)),
    [currentUser],
  );

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const resetFilters = () => setFilters(DEFAULT_FILTERS);
  const hasAdvancedFilters =
    Boolean(filters.user || filters.client || filters.productType !== 'all' || filters.includeVoided || filters.includeTest);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCsvExport = () => {
    exportCsv('metricas-rebu.csv', buildCsvRows({ metrics, canViewProfit, canViewUsers, canViewClients }));
  };

  const handlePdfExport = () => {
    window.print();
  };

  const isHourlyMode = metrics.current.periodMode === 'hour';
  const periodUnit = metrics.current.periodLabel || 'día';
  const periodUnitPlural = metrics.current.periodLabelPlural || 'días';

  const hasSourceData =
    transactions.length > 0 ||
    expenses.length > 0 ||
    pastClosures.length > 0 ||
    inventory.length > 0 ||
    budgets.length > 0 ||
    orders.length > 0;

  if (!isActive) {
    return <div className="h-full min-h-0 bg-slate-100" />;
  }

  if (isLoading && !hasSourceData) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-3 animate-spin text-fuchsia-600" size={34} />
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Cargando métricas</p>
          <p className="mt-2 text-sm font-medium text-slate-500">Estamos trayendo histórico completo para analizar el negocio.</p>
        </div>
      </div>
    );
  }

  if (emptyStateMessage && !hasSourceData) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto mb-3 text-amber-500" size={34} />
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Métricas no disponibles</p>
          <p className="mt-2 text-sm font-medium text-slate-500">{emptyStateMessage}</p>
        </div>
      </div>
    );
  }

  const renderSummary = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Ingreso bruto" value={<FancyPrice amount={metrics.current.stats.revenue} />} sublabel={metrics.range.label} change={metrics.changes.revenue} tone="sky" hint="Total vendido en el rango filtrado, antes de restar costos o gastos." />
        <MetricCard label="Ganancia neta" value={<FancyPrice amount={metrics.current.stats.profit} />} sublabel="Ingreso - costo - gastos" change={metrics.changes.profit} tone="emerald" hidden={!canViewProfit} hint="Resultado final estimado del período: ingreso bruto menos costo de mercadería vendida y gastos." />
        <MetricCard label="Ventas" value={formatNumber(metrics.current.stats.salesCount)} sublabel="Tickets emitidos" change={metrics.changes.salesCount} tone="violet" />
        <MetricCard label="Ticket promedio" value={<FancyPrice amount={metrics.current.stats.averageTicket} />} sublabel="Promedio por venta" change={metrics.changes.averageTicket} tone="amber" hint="Ingreso bruto dividido por cantidad de ventas." />
        <MetricCard label="Gastos" value={<FancyPrice amount={metrics.current.stats.expenses} />} sublabel={`${metrics.current.filteredExpenses.length} movimientos`} tone="rose" hint="Suma de gastos registrados en el rango filtrado." />
        <MetricCard label="Stock valorizado" value={<FancyPrice amount={canViewProfit ? metrics.stockStats.totalCost : metrics.stockStats.totalRetail} />} sublabel={canViewProfit ? 'Costo actual' : 'Valor de venta'} tone="slate" hint={canViewProfit ? 'Valor estimado del stock actual a precio de compra.' : 'Valor estimado del stock actual a precio de venta.'} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.45fr_0.9fr]">
        <Panel
          title={isHourlyMode ? 'Evolución de hoy por horario' : 'Evolución del período'}
          icon={LineChartIcon}
          hint={`Compara ingreso bruto, cantidad de ventas y, si tenés permiso, ganancia neta por ${periodUnit}.`}
        >
          {metrics.current.dailySeries.length ? (
            <ChartFrame height={320}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.current.dailySeries}>
                  <defs>
                    <linearGradient id="metricsRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.26} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="metricsProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(value) => `$${formatNumber(value)}`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" name="Ingreso" stroke="#0ea5e9" fill="url(#metricsRevenue)" strokeWidth={2} />
                  {canViewProfit && <Area type="monotone" dataKey="profit" name="Ganancia" stroke="#10b981" fill="url(#metricsProfit)" strokeWidth={2} />}
                  <Line type="monotone" dataKey="salesCount" name="Ventas" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartFrame>
          ) : <EmptyState />}
        </Panel>

        <Panel title="Alertas y recomendaciones" icon={Sparkles} action={canConfigureAlerts ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500">Calculadas</span> : null}>
          <div className="space-y-2">
            {metrics.recommendations.length ? metrics.recommendations.map((item, index) => {
              const toneClass = {
                danger: 'border-rose-200 bg-rose-50 text-rose-700',
                warning: 'border-amber-200 bg-amber-50 text-amber-700',
                success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
                info: 'border-sky-200 bg-sky-50 text-sky-700',
              }[item.tone] || 'border-slate-200 bg-slate-50 text-slate-700';
              return (
                <div key={`${item.title}-${index}`} className={`rounded-lg border px-3 py-2 ${toneClass}`}>
                  <p className="text-xs font-black">{item.title}</p>
                  <p className="mt-0.5 text-[11px] font-semibold opacity-80">{item.detail}</p>
                </div>
              );
            }) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-700">
                No hay alertas importantes para estos filtros.
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );

  const renderSales = () => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title={isHourlyMode ? 'Ventas por horario' : 'Ventas por día'} icon={TrendingUp}>
        {metrics.current.dailySeries.length ? (
          <ChartFrame height={310}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.current.dailySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="salesCount" name="Ventas" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : <EmptyState />}
      </Panel>
      <Panel title={isHourlyMode ? 'Ingreso por horario' : 'Horarios fuertes'} icon={CalendarDays}>
        {(isHourlyMode ? metrics.current.dailySeries : metrics.current.hourStats).length ? (
          <ChartFrame height={310}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={isHourlyMode ? metrics.current.dailySeries : metrics.current.hourStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="revenue" name="Ingreso" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : <EmptyState />}
      </Panel>
    </div>
  );

  const renderProfit = () => (
    <div className="space-y-4">
      <Panel
        title="Resultado financiero"
        icon={WalletCards}
        hint="El desglose muestra los importes que explican la ganancia neta del rango actual."
      >
        <FinanceBreakdown stats={metrics.current.stats} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title={isHourlyMode ? 'Evolución financiera por horario' : 'Evolución financiera'} icon={LineChartIcon} hint={`Ingreso bruto, ganancia neta y gastos por ${periodUnit}. Sirve para ver en qué ${periodUnitPlural} se generó o se perdió margen.`}>
        <ChartFrame height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metrics.current.dailySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(value) => `$${formatNumber(value)}`} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="revenue" name="Ingreso" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="profit" name="Ganancia" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="expenses" name="Gastos" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      </Panel>
      <Panel title="Margen por producto" icon={ShoppingBag} hint="El margen es la ganancia estimada de cada producto sobre su ingreso. Puede variar si faltan costos de compra.">
        <Table
          emptyText="Sin productos vendidos."
          columns={[
            { key: 'name', label: 'Producto' },
            { key: 'revenue', label: 'Ingreso', align: 'right', render: (row) => <FancyPrice amount={row.revenue} /> },
            { key: 'profit', label: 'Ganancia', align: 'right', render: (row) => <FancyPrice amount={row.profit} /> },
            { key: 'marginRate', label: 'Margen', align: 'right', render: (row) => `${formatNumber(row.marginRate, 1)}%` },
          ]}
          rows={metrics.current.productStats}
        />
      </Panel>
      </div>
    </div>
  );

  const renderProducts = () => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.9fr]">
      <Panel title="Ranking de productos" icon={ShoppingBag}>
        {metrics.current.productStats.length ? (
          <ChartFrame height={360}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.current.productStats.slice(0, 10)} layout="vertical" margin={{ left: 18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="revenue" name="Ingreso" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : <EmptyState />}
      </Panel>
      <Panel title="Tipo de producto" icon={PackageSearch}>
        {metrics.current.typeStats.length ? (
          <ChartFrame height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={metrics.current.typeStats} dataKey="revenue" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={4}>
                  {metrics.current.typeStats.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : <EmptyState />}
      </Panel>
    </div>
  );

  const renderCategories = () => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Panel title="Categorías por ingreso" icon={Boxes}>
        {metrics.current.categoryStats.length ? (
          <ChartFrame height={330}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.current.categoryStats.slice(0, 12)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="revenue" name="Ingreso" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : <EmptyState />}
      </Panel>
      <Panel title="Detalle de categorías" icon={Boxes}>
        <Table
          emptyText="Sin categorías vendidas."
          columns={[
            { key: 'name', label: 'Categoría' },
            { key: 'qty', label: 'Cantidad', align: 'right', render: (row) => formatNumber(row.qty) },
            { key: 'revenue', label: 'Ingreso', align: 'right', render: (row) => <FancyPrice amount={row.revenue} /> },
            ...(canViewProfit ? [{ key: 'profit', label: 'Ganancia', align: 'right', render: (row) => <FancyPrice amount={row.profit} /> }] : []),
          ]}
          rows={metrics.current.categoryStats}
        />
      </Panel>
    </div>
  );

  const renderPayments = () => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr_1fr]">
      <Panel title="Distribución de pagos" icon={CreditCard}>
        {metrics.current.paymentStats.length ? (
          <ChartFrame height={320}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={metrics.current.paymentStats} dataKey="value" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={3}>
                  {metrics.current.paymentStats.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : <EmptyState />}
      </Panel>
      <Panel title="Medios de pago" icon={CreditCard}>
        <Table
          emptyText="Sin pagos para estos filtros."
          columns={[
            { key: 'name', label: 'Medio' },
            { key: 'salesCount', label: 'Ventas', align: 'right', render: (row) => formatNumber(row.salesCount) },
            { key: 'value', label: 'Importe', align: 'right', render: (row) => <FancyPrice amount={row.value} /> },
          ]}
          rows={metrics.current.paymentStats}
        />
      </Panel>
    </div>
  );

  const renderClients = () => (
    <Panel title="Clientes y socios" icon={Users}>
      <Table
        emptyText="Sin clientes para estos filtros."
        columns={[
          { key: 'name', label: 'Cliente' },
          { key: 'salesCount', label: 'Ventas', align: 'right', render: (row) => formatNumber(row.salesCount) },
          { key: 'revenue', label: 'Ingreso', align: 'right', render: (row) => <FancyPrice amount={row.revenue} /> },
          { key: 'averageTicket', label: 'Ticket prom.', align: 'right', render: (row) => <FancyPrice amount={row.averageTicket} /> },
          { key: 'lastDateLabel', label: 'Última compra', align: 'right' },
        ]}
        rows={metrics.current.clientStats}
      />
    </Panel>
  );

  const renderStock = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard label="Productos activos" value={formatNumber(metrics.stockStats.activeProducts)} sublabel="Catálogo actual" />
        <MetricCard label="Sin stock" value={formatNumber(metrics.stockStats.outOfStock.length)} sublabel="Requieren reposición" tone="rose" />
        <MetricCard label="Bajo stock" value={formatNumber(metrics.stockStats.lowStock.length)} sublabel="Menos de 10 unidades" tone="amber" />
        <MetricCard label="Por vencer" value={formatNumber(metrics.stockStats.expiring.length)} sublabel="Ventana de 14 días" tone="violet" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Sin stock" icon={PackageSearch}>
          <Table
            emptyText="Sin productos agotados."
            columns={[
              { key: 'title', label: 'Producto' },
              { key: 'stock', label: 'Stock', align: 'right', render: (row) => formatNumber(row.stock) },
            ]}
            rows={metrics.stockStats.outOfStock.slice(0, 30)}
          />
        </Panel>
        <Panel title="Bajo stock" icon={PackageSearch}>
          <Table
            emptyText="Sin alertas de bajo stock."
            columns={[
              { key: 'title', label: 'Producto' },
              { key: 'stock', label: 'Stock', align: 'right', render: (row) => formatNumber(row.stock) },
            ]}
            rows={metrics.stockStats.lowStock.slice(0, 30)}
          />
        </Panel>
        <Panel title="Vencimientos" icon={AlertTriangle}>
          <Table
            emptyText="Sin vencimientos cercanos."
            columns={[
              { key: 'title', label: 'Producto' },
              { key: 'daysUntil', label: 'Días', align: 'right', render: (row) => row.daysUntil },
            ]}
            rows={metrics.stockStats.expiring.slice(0, 30)}
          />
        </Panel>
      </div>
    </div>
  );

  const renderOrders = () => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <MetricCard label="Pedidos" value={formatNumber(metrics.orderStats.ordersCount)} sublabel={<FancyPrice amount={metrics.orderStats.totalOrders} />} tone="sky" />
        <MetricCard label="Presupuestos" value={formatNumber(metrics.orderStats.budgetsCount)} sublabel={<FancyPrice amount={metrics.orderStats.totalBudgets} />} tone="violet" />
        <MetricCard label="Saldo pendiente" value={<FancyPrice amount={metrics.orderStats.pendingAmount} />} sublabel="Por cobrar" tone="amber" />
        <MetricCard label="Conversión" value={`${formatNumber(metrics.orderStats.conversionRate, 1)}%`} sublabel="Presupuesto a pedido" tone="emerald" />
      </div>
      <Panel title="Pedidos por estado" icon={FileText}>
        {metrics.orderStats.byStatus.length ? (
          <ChartFrame height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.orderStats.byStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="total" name="Total" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : <EmptyState />}
      </Panel>
    </div>
  );

  const renderUsers = () => (
    <Panel title="Rendimiento por usuario" icon={ShieldCheck}>
      <Table
        emptyText="Sin usuarios para estos filtros."
        columns={[
          { key: 'name', label: 'Usuario' },
          { key: 'salesCount', label: 'Ventas', align: 'right', render: (row) => formatNumber(row.salesCount) },
          { key: 'revenue', label: 'Ingreso', align: 'right', render: (row) => <FancyPrice amount={row.revenue} /> },
          { key: 'averageTicket', label: 'Ticket prom.', align: 'right', render: (row) => <FancyPrice amount={row.averageTicket} /> },
          ...(canViewProfit ? [{ key: 'profit', label: 'Ganancia', align: 'right', render: (row) => <FancyPrice amount={row.profit} /> }] : []),
        ]}
        rows={metrics.current.userStats}
      />
    </Panel>
  );

  const renderCash = () => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <MetricCard label="Cierres" value={formatNumber(metrics.closureStats.count)} sublabel={`${metrics.closureStats.manual} manuales / ${metrics.closureStats.automatic} auto`} />
        <MetricCard label="Ventas cerradas" value={<FancyPrice amount={metrics.closureStats.totalSales} />} sublabel="Según reportes" tone="sky" />
        <MetricCard label="Ganancia cierre" value={<FancyPrice amount={metrics.closureStats.netProfit} />} sublabel="Según reportes" tone="emerald" hidden={!canViewProfit} />
        <MetricCard label="Ticket cierre" value={<FancyPrice amount={metrics.closureStats.averageTicket} />} sublabel="Promedio de cierres" tone="amber" />
      </div>
      <Panel title="Actividad de caja" icon={CalendarDays}>
        <ChartFrame height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[
              { name: 'Manual', count: metrics.closureStats.manual },
              { name: 'Automático', count: metrics.closureStats.automatic },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip />
              <Bar dataKey="count" name="Cierres" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </Panel>
    </div>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'sales': return renderSales();
      case 'profit': return canViewProfit ? renderProfit() : renderSummary();
      case 'products': return renderProducts();
      case 'categories': return renderCategories();
      case 'payments': return renderPayments();
      case 'clients': return canViewClients ? renderClients() : renderSummary();
      case 'stock': return renderStock();
      case 'orders': return renderOrders();
      case 'users': return canViewUsers ? renderUsers() : renderSummary();
      case 'cash': return renderCash();
      default: return renderSummary();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <div className="relative z-20 shrink-0 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-fuchsia-600" />
                <h2 className="text-lg font-black text-slate-900">Métricas</h2>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                  {metrics.range.label}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Ventas, productos, stock, caja y operación.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={!onRefresh || isRefreshing}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                Actualizar
              </button>
              {canExport && (
                <>
                  <button type="button" onClick={handleCsvExport} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 text-[11px] font-black text-sky-700 transition hover:bg-sky-100">
                    <Download size={14} /> CSV
                  </button>
                  <button type="button" onClick={handlePdfExport} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-fuchsia-200 bg-fuchsia-50 px-2.5 text-[11px] font-black text-fuchsia-700 transition hover:bg-fuchsia-100">
                    <Printer size={14} /> PDF
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-4 xl:grid-cols-[0.9fr_0.85fr_0.9fr_1fr_1.7fr_auto_auto]">
            <SelectField label="Rango" value={filters.preset} onChange={(value) => updateFilter('preset', value)}>
              <option value="today">Hoy</option>
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
              <option value="90d">Últimos 90 días</option>
              <option value="year">Año actual</option>
              <option value="all">Todo</option>
              <option value="custom">Personalizado</option>
            </SelectField>
            {filters.preset === 'custom' && (
              <>
                <InputField label="Desde" type="date" value={filters.startDate} onChange={(value) => updateFilter('startDate', value)} />
                <InputField label="Hasta" type="date" value={filters.endDate} onChange={(value) => updateFilter('endDate', value)} />
              </>
            )}
            <SelectField label="Estado" value={filters.status} onChange={(value) => updateFilter('status', value)}>
              <option value="all">Todos</option>
              <option value="completed">Completadas</option>
              <option value="voided">Anuladas</option>
              <option value="deleted">Eliminadas</option>
              <option value="restored">Restauradas</option>
            </SelectField>
            <SelectField label="Pago" value={filters.payment} onChange={(value) => updateFilter('payment', value)}>
              <option value="">Todos</option>
              {metrics.filterOptions.payments.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SelectField>
            <SelectField label="Categoría" value={filters.category} onChange={(value) => updateFilter('category', value)}>
              <option value="">Todas</option>
              {metrics.filterOptions.categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SelectField>
            <SelectField label="Producto" value={filters.product} onChange={(value) => updateFilter('product', value)} className="min-w-[220px]">
              <option value="">Todos</option>
              {metrics.filterOptions.products.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SelectField>
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[11px] font-black transition ${
                showAdvancedFilters || hasAdvancedFilters
                  ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              <SlidersHorizontal size={14} />
              Avanzados{hasAdvancedFilters ? ' *' : ''}
            </button>
            <button type="button" onClick={resetFilters} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-black text-slate-600 transition hover:bg-slate-100">
              Limpiar
            </button>
            </div>

            {showAdvancedFilters && (
              <div className="mt-2 grid grid-cols-2 items-end gap-2 border-t border-slate-200 pt-2 md:grid-cols-4 xl:grid-cols-[0.8fr_1fr_1.4fr_auto_auto]">
                <SelectField label="Tipo" value={filters.productType} onChange={(value) => updateFilter('productType', value)}>
                  <option value="all">Todos</option>
                  <option value="quantity">Unidad</option>
                  <option value="weight">Peso</option>
                </SelectField>
                {canViewUsers && (
                  <SelectField label="Usuario" value={filters.user} onChange={(value) => updateFilter('user', value)}>
                    <option value="">Todos</option>
                    {metrics.filterOptions.users.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </SelectField>
                )}
                {canViewClients && (
                  <SelectField label="Cliente" value={filters.client} onChange={(value) => updateFilter('client', value)}>
                    <option value="">Todos</option>
                    {metrics.filterOptions.clients.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </SelectField>
                )}
                <ToggleField checked={filters.includeVoided} onChange={(value) => updateFilter('includeVoided', value)} label="Anuladas" />
                <ToggleField checked={filters.includeTest} onChange={(value) => updateFilter('includeTest', value)} label="Test" />
              </div>
            )}
          </div>

          <div className="custom-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-black transition ${
                    isActive
                      ? 'border-fuchsia-200 bg-fuchsia-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={14} />
                  {section.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-3">
        <div className="mx-auto max-w-7xl space-y-3 pb-8">
          {metrics.current.filteredTransactions.length === 0 && metrics.current.filteredExpenses.length === 0 && activeSection !== 'stock' ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
              <div className="flex items-center gap-2">
                <Search size={16} />
                No hay ventas ni gastos para los filtros activos. Algunas secciones pueden mostrar inventario, pedidos o caja igualmente.
              </div>
            </div>
          ) : null}
          {renderActiveSection()}
        </div>
      </div>
    </div>
  );
}
