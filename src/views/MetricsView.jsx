import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  CreditCard,
  Download,
  FileText,
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
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
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
const PIE_SEMANTIC_COLORS = {
  'mercado pago': '#38bdf8',
  efectivo: '#34d399',
  debito: '#fbbf24',
  credito: '#fb7185',
  'sin stock': '#fb7185',
  'bajo stock': '#fbbf24',
  'por vencer': '#c084fc',
  'stock ok': '#34d399',
  recurrentes: '#38bdf8',
  'una compra': '#34d399',
  manual: '#38bdf8',
  automatico: '#34d399',
  pendiente: '#fbbf24',
  completado: '#34d399',
  completada: '#34d399',
  cancelado: '#fb7185',
  cancelada: '#fb7185',
  presupuesto: '#a78bfa',
  'costo vendido': '#94a3b8',
  'costo ref': '#94a3b8',
  'resultado caja': '#34d399',
  gastos: '#fb7185',
  ganancia: '#34d399',
  'por peso': '#2dd4bf',
  'por unidad': '#38bdf8',
};

const normalizePieName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const getPieColor = (entry, index, nameKey = 'name') => {
  if (entry?.color) return entry.color;
  const normalizedName = normalizePieName(entry?.[nameKey]);
  if (PIE_SEMANTIC_COLORS[normalizedName]) return PIE_SEMANTIC_COLORS[normalizedName];
  const hash = [...normalizedName].reduce((sum, character) => ((sum * 31) + character.charCodeAt(0)) >>> 0, 0);
  return COLORS[(hash || index) % COLORS.length];
};

const formatPieValue = (value, valueType) => (
  valueType === 'currency' ? formatCurrency(value) : formatNumber(value)
);

const normalizeMetricText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const parseMetricDate = (record = {}) => {
  const rawDate = record.createdAt || record.created_at || record.sortDate || record.date || '';
  const rawTime = record.time || record.timestamp || '';
  const directDate = rawDate ? new Date(rawDate) : null;
  if (directDate && !Number.isNaN(directDate.getTime())) return directDate;

  const match = String(rawDate || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const [, day, month, year] = match;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const parsed = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${rawTime || '00:00'}`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
};

const getMetricUserLabel = (record = {}) =>
  record.user || record.user_name || record.userName || record.userId || record.user_id || 'Sistema';

const getMetricTransactionTotal = (record = {}) =>
  Number(record.revenue ?? record.total ?? record.totalAmount ?? record.amount ?? 0) || 0;

const getMetricTransactionItemCount = (record = {}) =>
  (record.metricItems || record.items || []).reduce((sum, item) => (
    sum + (Number(item.qty ?? item.quantity ?? item.cantidad ?? 1) || 0)
  ), 0);

const renderActivePieShape = (props) => (
  <Sector {...props} outerRadius={Number(props.outerRadius || 0) + 5} />
);

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

const METRICS_VIEW_MODE_STORAGE_KEY = 'rebu_metrics_view_mode_v1';
const DEFAULT_METRICS_VIEW_MODE = 'modern';
const PROFIT_CONTROL_VIEW_MODE = 'profit-control';

const METRICS_VIEW_MODE_OPTIONS = [
  { id: 'modern', label: 'Panel', helper: 'Operativo' },
  { id: PROFIT_CONTROL_VIEW_MODE, label: 'Lectura', helper: 'Simple' },
  { id: 'legacy', label: 'Clasica', helper: 'Detalle' },
];

const RANGE_FILTER_OPTIONS = [
  { value: 'today', label: 'Hoy', helper: 'Caja actual' },
  { value: 'yesterday', label: 'Ayer', helper: 'Dia anterior' },
  { value: '3d', label: '3 dias', helper: 'Corto' },
  { value: '7d', label: '7 dias', helper: 'Semana' },
  { value: '14d', label: '2 semanas', helper: 'Quincena' },
  { value: '30d', label: '30 dias', helper: 'Mes' },
  { value: '90d', label: '90 dias', helper: 'Trimestre' },
  { value: 'year', label: 'Anio', helper: 'Actual' },
  { value: 'all', label: 'Todo', helper: 'Historico' },
  { value: 'custom', label: 'Manual', helper: 'Fechas' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'completed', label: 'Completadas' },
  { value: 'voided', label: 'Anuladas' },
  { value: 'deleted', label: 'Eliminadas' },
  { value: 'restored', label: 'Restauradas' },
];

const normalizeMetricsViewMode = (value) => (
  value === 'legacy' || value === PROFIT_CONTROL_VIEW_MODE ? value : DEFAULT_METRICS_VIEW_MODE
);

const getStoredMetricsViewMode = () => {
  if (typeof window === 'undefined') return null;
  try {
    const storedMode = window.localStorage.getItem(METRICS_VIEW_MODE_STORAGE_KEY);
    return storedMode ? normalizeMetricsViewMode(storedMode) : null;
  } catch {
    return null;
  }
};

const calculatePercentageChange = (current, previous) => {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (!previousValue) return currentValue ? null : 0;
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
};

const formatComparisonDate = (date) =>
  date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '';

const formatComparisonRange = (range) => {
  if (!range?.start || !range?.end) return range?.label || 'Sin rango';
  const startLabel = formatComparisonDate(range.start);
  const endLabel = formatComparisonDate(range.end);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
};

const getComparisonLabel = (metrics) =>
  metrics?.canComparePreviousRange
    ? `${formatComparisonRange(metrics.range)} vs ${formatComparisonRange(metrics.previousRange)}`
    : 'Sin comparacion anterior';

const getPreferredMetricsViewMode = (user) => {
  const storedMode = getStoredMetricsViewMode();
  if (storedMode) return storedMode;
  if (user?.metricsViewMode) return normalizeMetricsViewMode(user.metricsViewMode);
  return DEFAULT_METRICS_VIEW_MODE;
};

const BASE_SECTIONS = [
  { id: 'summary', label: 'Resumen', icon: BarChart3 },
  { id: 'sales', label: 'Ventas', icon: TrendingUp },
  { id: 'profit', label: 'Ganancias', icon: WalletCards, permission: 'metrics.viewProfit' },
  { id: 'products', label: 'Productos', icon: ShoppingBag },
  { id: 'categories', label: 'Categorías', icon: Boxes },
  { id: 'payments', label: 'Pagos', icon: CreditCard },
  { id: 'clients', label: 'Socios', icon: Users, permission: 'metrics.viewClients' },
  { id: 'stock', label: 'Stock', icon: PackageSearch },
  { id: 'orders', label: 'Pedidos', icon: FileText },
  { id: 'users', label: 'Usuarios', icon: ShieldCheck, permission: 'metrics.viewUsers' },
  { id: 'cash', label: 'Caja', icon: CalendarDays },
];

const MODERN_SECTION_IDS = new Set(['summary', 'sales', 'products', 'payments', 'clients', 'stock', 'users', 'cash']);

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

const ModernChangeBadge = ({ change, invert = false }) => {
  if (!Number.isFinite(change)) return null;
  const isGood = invert ? change <= 0 : change >= 0;
  return (
    <span className={`metrics-modern-change ${isGood ? 'is-good' : 'is-bad'}`}>
      {change >= 0 ? '+' : ''}{formatNumber(change, 1)}%
    </span>
  );
};

const COST_BASIS_META = {
  real: {
    label: 'Real',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  estimated: {
    label: 'Estimado',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  missing: {
    label: 'Sin costo',
    className: 'border-slate-200 bg-slate-50 text-slate-500',
  },
};

const CostBasisBadge = ({ status }) => {
  const meta = COST_BASIS_META[status] || COST_BASIS_META.missing;
  return (
    <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[9px] font-black uppercase leading-none ${meta.className}`}>
      {meta.label}
    </span>
  );
};

const SOLD_COST_COLUMNS = [
  { key: 'cost', label: 'Costo vendido', align: 'right', render: (row) => <FancyPrice amount={row.cost} /> },
  { key: 'costStatus', label: 'Base', align: 'right', render: (row) => <CostBasisBadge status={row.costStatus} /> },
];

const PRODUCT_LOOKUP_LIMIT = 60;
const PRODUCT_LOOKUP_SALE_PRICE_FIELDS = ['price', 'newPrice', 'new_price', 'unitPrice', 'unit_price'];
const PRODUCT_LOOKUP_COST_FIELDS = ['purchasePrice', 'purchase_price', 'cost', 'unitCost', 'unit_cost', 'costPrice', 'cost_price'];
const PRODUCT_LOOKUP_STOCK_FIELDS = ['stock', 'quantity', 'qty'];

const PRODUCT_LOOKUP_COST_COLUMNS = [
  {
    key: 'cost',
    label: 'Costo vendido',
    align: 'right',
    render: (row) => (
      row.lookupOnly
        ? <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Sin ventas</span>
        : <FancyPrice amount={row.cost} />
    ),
  },
  {
    key: 'costStatus',
    label: 'Base',
    align: 'right',
    render: (row) => (
      row.lookupOnly
        ? (
          <span className="inline-flex h-5 items-center rounded-full border border-slate-200 bg-slate-50 px-2 text-[9px] font-black uppercase leading-none text-slate-500">
            Inventario
          </span>
        )
        : <CostBasisBadge status={row.costStatus} />
    ),
  },
];

const splitProductLookupTerms = (value) => normalizeMetricText(value).split(/\s+/).filter(Boolean);

const getFirstFiniteProductNumber = (source = {}, fields = []) => {
  for (const field of fields) {
    const rawValue = source?.[field];
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    const value = Number(rawValue);
    if (Number.isFinite(value)) return value;
  }
  return null;
};

const getInventoryProductName = (product = {}) =>
  String(product.title || product.name || product.product_title || 'Producto sin nombre').trim();

const getInventoryProductKey = (product = {}) => {
  if (product.id !== undefined && product.id !== null) return String(product.id);
  return normalizeMetricText(getInventoryProductName(product));
};

const getInventoryProductCategories = (product = {}) => {
  const categorySource = Array.isArray(product.categories) && product.categories.length
    ? product.categories
    : Array.isArray(product.category)
      ? product.category
      : String(product.category || '').split(',');
  const categories = categorySource.map((category) => String(category || '').trim()).filter(Boolean);
  return categories.length ? categories : ['Sin categoria'];
};

const getInventoryProductType = (product = {}) => (
  String(product.product_type || product.productType || '').toLowerCase() === 'weight'
    ? 'weight'
    : 'quantity'
);

const getProductTypeLabel = (type) => (type === 'weight' ? 'Por peso' : 'Por unidad');

const getInventoryProductSnapshot = (product = {}) => {
  const categories = getInventoryProductCategories(product);
  const type = getInventoryProductType(product);
  return {
    productKey: getInventoryProductKey(product),
    name: getInventoryProductName(product),
    category: categories.join(', '),
    categories,
    type,
    typeLabel: getProductTypeLabel(type),
    salePrice: getFirstFiniteProductNumber(product, PRODUCT_LOOKUP_SALE_PRICE_FIELDS),
    purchasePrice: getFirstFiniteProductNumber(product, PRODUCT_LOOKUP_COST_FIELDS),
    stock: getFirstFiniteProductNumber(product, PRODUCT_LOOKUP_STOCK_FIELDS),
    inventoryProduct: product,
  };
};

const getMetricProductLookupKey = (row = {}) => String(row.productKey || row.key || normalizeMetricText(row.name));

const getProductLookupSearchText = (source = {}) => {
  const product = source.inventoryProduct || source;
  const categories = source.categories || getInventoryProductCategories(product);
  return normalizeMetricText([
    source.name,
    product.title,
    product.name,
    product.product_title,
    product.barcode,
    product.barCode,
    product.code,
    product.sku,
    product.internalCode,
    product.internal_code,
    product.category,
    ...(Array.isArray(categories) ? categories : []),
  ].join(' '));
};

const matchesProductLookupTerms = (source, terms = []) => {
  if (!terms.length) return true;
  const searchText = getProductLookupSearchText(source);
  return terms.every((term) => searchText.includes(term));
};

const buildInventoryLookupRow = (product) => {
  const snapshot = getInventoryProductSnapshot(product);
  return {
    ...snapshot,
    key: `inventory:${snapshot.productKey}`,
    qty: 0,
    revenue: 0,
    cost: 0,
    profit: 0,
    costStatus: 'missing',
    lookupOnly: true,
    hasSales: false,
  };
};

const productMatchesInventoryFilters = (product, filters = {}) => {
  const productKey = getInventoryProductKey(product);
  const categories = getInventoryProductCategories(product);
  const type = getInventoryProductType(product);
  return (
    (!filters.product || productKey === filters.product) &&
    (!filters.category || categories.includes(filters.category)) &&
    (filters.productType === 'all' || type === filters.productType)
  );
};

const ModernHealthCard = ({ label, value, detail, change, tone = 'slate', hidden = false, invertChange = false }) => (
  <article className={`metrics-modern-kpi metrics-modern-kpi-${tone}`}>
    <div className="metrics-modern-kpi-head">
      <p>{label}</p>
      {!hidden && <ModernChangeBadge change={change} invert={invertChange} />}
    </div>
    <div className="metrics-modern-kpi-value">
      {hidden ? <span className="text-slate-400">Restringido</span> : value}
    </div>
    <p className="metrics-modern-kpi-detail">{hidden ? 'Permiso requerido' : detail}</p>
  </article>
);

const MetricsModeSwitch = ({ value, onChange, className = '' }) => (
  <div
    className={`metrics-view-mode-toggle inline-flex h-8 shrink-0 items-center rounded-md border border-slate-200 bg-slate-100 p-0.5 ${className}`}
    role="group"
    aria-label="Modo de metricas"
  >
    {METRICS_VIEW_MODE_OPTIONS.map((option) => {
      const isActiveOption = value === option.id;
      return (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`inline-flex h-7 min-w-[78px] items-center justify-center rounded-[5px] px-2 text-[10px] font-black uppercase leading-none transition ${
            isActiveOption
              ? 'is-active bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:bg-white/70 hover:text-slate-700'
          }`}
          title={option.helper}
          aria-pressed={isActiveOption}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

const MetricLensSelect = ({ label, value, onChange, children, className = '' }) => (
  <label className={`metrics-lens-select flex min-h-8 min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50/80 px-2 py-1 ${className}`}>
    <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-w-0 flex-1 bg-transparent text-[11px] font-black text-slate-800 outline-none"
    >
      {children}
    </select>
  </label>
);

const ModernLedgerRow = ({ label, value, tone = 'slate', strong = false }) => (
  <div className={`metrics-modern-ledger-row metrics-modern-ledger-${tone} ${strong ? 'is-strong' : ''}`}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const ModernFilterGroup = ({ step, title, helper, children, className = '' }) => (
  <section className={`metrics-modern-filter-group ${className}`}>
    <div className="metrics-modern-filter-title">
      <span>{step}</span>
      <div>
        <p>{title}</p>
        {helper && <small>{helper}</small>}
      </div>
    </div>
    {children}
  </section>
);

const ModernSelectControl = ({ label, value, onChange, children, icon: Icon, className = '' }) => (
  <label className={`metrics-modern-select ${className}`}>
    <span>
      {Icon && <Icon size={13} />}
      {label}
    </span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {children}
    </select>
  </label>
);

const ModernToggleChip = ({ checked, onChange, label }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`metrics-modern-toggle-chip ${checked ? 'is-active' : ''}`}
    aria-pressed={checked}
  >
    <span>{checked ? 'On' : 'Off'}</span>
    {label}
  </button>
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

const MetricCard = ({ label, value, sublabel, change, tone = 'slate', hidden = false, hint, invertChange = false }) => {
  const toneClass = {
    slate: 'text-slate-900 bg-slate-50 border-slate-200',
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    sky: 'text-sky-700 bg-sky-50 border-sky-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    rose: 'text-rose-700 bg-rose-50 border-rose-200',
    violet: 'text-violet-700 bg-violet-50 border-violet-200',
  }[tone] || 'text-slate-900 bg-slate-50 border-slate-200';

  const changeLabel = Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${formatNumber(change, 1)}%` : null;
  const isGoodChange = invertChange ? change <= 0 : change >= 0;
  const changeClass = isGoodChange ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';

  return (
    <div className={`min-h-[78px] rounded-lg border px-3 py-2.5 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[9px] font-black uppercase tracking-[0.12em] opacity-70">{label}</p>
        {hint && <HintIcon hint={hint} size={13} />}
      </div>
      <div className="mt-1.5 min-w-0 truncate text-xl font-black leading-none tracking-normal 2xl:text-2xl">
        {hidden ? <span className="text-slate-400">Restringido</span> : value}
      </div>
      <div className="mt-1.5 flex min-h-[18px] items-center justify-between gap-2">
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

const FinanceBreakdown = ({ stats, profitStatusLabel = null, profitStatusToneClass = null }) => {
  const collectedRevenue = Math.max(0, Number(stats.revenue || 0) - Number(stats.discountImpact || 0));
  const marginRate = collectedRevenue ? (stats.profit / collectedRevenue) * 100 : 0;
  const items = [
    {
      label: 'Ingreso cobrado',
      value: collectedRevenue,
      tone: 'text-sky-700 bg-sky-50 border-sky-100',
      hint: 'Total efectivamente cobrado en ventas del rango, neto de descuentos aplicados.',
    },
    {
      label: 'Costo vendido',
      value: stats.cost,
      tone: 'text-slate-700 bg-slate-50 border-slate-200',
      hint: 'Costo de la mercaderia vendida: usa la foto guardada en la venta y, para ventas viejas, inventario actual como estimacion.',
      costStatus: stats.costStatus,
    },
    {
      label: 'Gastos',
      value: stats.expenses,
      tone: 'text-rose-700 bg-rose-50 border-rose-100',
      hint: 'Gastos registrados dentro del rango filtrado.',
    },
    {
      label: 'Resultado caja',
      value: stats.profit,
      displayValue: profitStatusLabel,
      tone: profitStatusToneClass || (stats.profit >= 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-rose-700 bg-rose-50 border-rose-100'),
      hint: 'Ingreso cobrado menos gastos reales registrados. No descuenta costo de mercaderia automaticamente.',
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
            {item.displayValue || <FancyPrice amount={item.value} />}
          </div>
          {item.costStatus && (
            <div className="mt-1">
              <CostBasisBadge status={item.costStatus} />
            </div>
          )}
        </div>
      ))}
      <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-500">
        <span>Formula: ingreso cobrado - gastos registrados = resultado de caja</span>
        <span className={`rounded-full px-2 py-0.5 font-black ${marginRate >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          Resultado / cobrado {formatNumber(marginRate, 1)}%
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

const useMeasuredWidth = () => {
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

  return [frameRef, width];
};

const ChartFrame = ({ height = 300, children }) => {
  const [frameRef, width] = useMeasuredWidth();

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

const EvolutionChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  const activeKeys = new Set(payload.map((item) => item.dataKey));
  const showSalesCount = activeKeys.has('revenue') || activeKeys.has('profit');
  const showExpenseCount = activeKeys.has('expenses');

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-black text-slate-700">{label}</p>
      {payload.map((item) => (
        <p key={`${item.dataKey}-${item.name}`} className="font-semibold" style={{ color: item.color }}>
          {item.name}: {formatCurrency(item.value)}
        </p>
      ))}
      {showSalesCount && (
        <p className="mt-1 font-semibold text-violet-700">
          Total de ventas: {formatNumber(row.salesCount || 0)}
        </p>
      )}
      {showExpenseCount && (
        <p className="font-semibold text-rose-700">
          Total de gastos: {formatNumber(row.expenseCount || 0)}
        </p>
      )}
    </div>
  );
};

const Table = ({ columns, rows, emptyText, onRowClick, isRowSelected }) => (
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
            rows.map((row, index) => {
              const isInteractive = typeof onRowClick === 'function';
              const selected = Boolean(isRowSelected?.(row, index));
              return (
              <tr
                key={row.key || `${row.name || row.label}-${index}`}
                tabIndex={isInteractive ? 0 : undefined}
                onClick={isInteractive ? () => onRowClick(row, index) : undefined}
                onKeyDown={isInteractive ? (event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onRowClick(row, index);
                } : undefined}
                className={`${isInteractive ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-fuchsia-200' : ''} ${selected ? 'bg-fuchsia-50/80' : 'hover:bg-slate-50'}`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    title={typeof row[column.key] === 'string' ? row[column.key] : undefined}
                    className={`px-3 py-2 font-semibold text-slate-700 ${column.align === 'right' ? 'text-right' : ''}`}
                  >
                    {column.render ? column.render(row, index) : (
                      typeof row[column.key] === 'string'
                        ? <span className="block max-w-[220px] truncate">{row[column.key]}</span>
                        : row[column.key]
                    )}
                  </td>
                ))}
              </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const StatStrip = ({ items = [] }) => (
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
    {items.map((item) => (
            <div
              key={item.label}
              title={typeof item.value === 'string' ? item.value : undefined}
              className={`rounded-lg border px-3 py-2 ${item.tone || 'border-slate-200 bg-slate-50 text-slate-700'}`}
            >
        <p className="text-[9px] font-black uppercase tracking-[0.12em] opacity-70">{item.label}</p>
        <div className="mt-1 truncate text-base font-black">{item.value}</div>
        {item.sub && <p className="mt-0.5 truncate text-[10px] font-semibold opacity-70">{item.sub}</p>}
      </div>
    ))}
  </div>
);

const AreaMetricPanel = ({ data = [], areas = [], height = 280, yFormatter = (value) => `$${formatNumber(value)}`, showLegend = true }) => (
  data.length ? (
    <ChartFrame height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            {areas.map((area) => (
              <linearGradient key={area.key} id={`area-${area.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={area.color} stopOpacity={0.22} />
                <stop offset="95%" stopColor={area.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
          <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={yFormatter} />
          <Tooltip content={<ChartTooltip />} />
          {showLegend && <Legend />}
          {areas.map((area) => (
            <Area
              key={area.key}
              type="monotone"
              dataKey={area.key}
              name={area.label}
              stroke={area.color}
              fill={`url(#area-${area.key})`}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  ) : <EmptyState />
);

const PieMetricPanel = ({
  data = [],
  dataKey = 'value',
  nameKey = 'name',
  height = 260,
  selectedName,
  onSelectionChange,
  valueType = 'number',
  totalLabel = 'Total',
  getSecondaryText,
}) => {
  const [internalSelectedName, setInternalSelectedName] = useState(null);
  const [hoveredName, setHoveredName] = useState(null);
  const [chartRef, chartWidth] = useMeasuredWidth();
  const isControlled = selectedName !== undefined;
  const activeName = isControlled ? selectedName : internalSelectedName;
  const normalizedData = useMemo(() => data.map((entry, index) => ({
    ...entry,
    __pieColor: getPieColor(entry, index, nameKey),
    __pieValue: Number(entry?.[dataKey] || 0),
  })), [data, dataKey, nameKey]);
  const total = normalizedData.reduce((sum, entry) => sum + entry.__pieValue, 0);
  const focusName = hoveredName || activeName;
  const focusIndex = normalizedData.findIndex((entry) => entry?.[nameKey] === focusName);
  const focusEntry = focusIndex >= 0 ? normalizedData[focusIndex] : null;
  const centerValue = focusEntry ? focusEntry.__pieValue : total;
  const centerPercent = focusEntry && total > 0 ? (focusEntry.__pieValue / total) * 100 : 100;
  const resolveEntry = (entry) => (
    entry?.payload && entry.payload?.[nameKey] !== undefined ? entry.payload : entry
  );

  useEffect(() => {
    if (!activeName || normalizedData.some((entry) => entry?.[nameKey] === activeName)) return;
    if (isControlled) onSelectionChange?.(null);
    else setInternalSelectedName(null);
  }, [activeName, isControlled, nameKey, normalizedData, onSelectionChange]);

  const selectEntry = (entry) => {
    const resolvedEntry = resolveEntry(entry);
    const nextName = resolvedEntry?.[nameKey] || null;
    const nextSelection = activeName === nextName ? null : nextName;
    if (isControlled) onSelectionChange?.(nextSelection, resolvedEntry);
    else setInternalSelectedName(nextSelection);
  };

  const handleEntryKeyDown = (event, entry) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectEntry(entry);
  };

  if (!normalizedData.length) return <EmptyState />;

  return (
    <div className="metrics-pie-wheel" style={{ '--metrics-pie-height': `${height}px` }}>
      <div ref={chartRef} className="metrics-pie-chart" onMouseLeave={() => setHoveredName(null)}>
        {chartWidth > 8 ? (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={normalizedData}
                  dataKey={dataKey}
                  nameKey={nameKey}
                  innerRadius="52%"
                  outerRadius="78%"
                  paddingAngle={3}
                  activeIndex={focusIndex >= 0 ? focusIndex : undefined}
                  activeShape={renderActivePieShape}
                  isAnimationActive
                  animationDuration={150}
                  onClick={selectEntry}
                  onMouseEnter={(entry) => setHoveredName(resolveEntry(entry)?.[nameKey] || null)}
                >
                  {normalizedData.map((entry) => {
                    const entryName = entry?.[nameKey];
                    const isFocused = !focusName || entryName === focusName;
                    return (
                      <Cell
                        key={entryName}
                        fill={entry.__pieColor}
                        opacity={isFocused ? 1 : 0.3}
                        stroke="var(--rebu-surface-1)"
                        strokeWidth={activeName === entryName ? 3 : 1}
                        role="button"
                        tabIndex={0}
                        focusable="true"
                        aria-label={`${entryName}: ${formatPieValue(entry.__pieValue, valueType)}`}
                        aria-pressed={activeName === entryName}
                        onFocus={() => setHoveredName(entryName)}
                        onBlur={() => setHoveredName(null)}
                        onKeyDown={(event) => handleEntryKeyDown(event, entry)}
                        className="metrics-pie-sector"
                      />
                    );
                  })}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="metrics-pie-center" aria-live="polite">
              <span title={focusEntry?.[nameKey]}>{focusEntry?.[nameKey] || totalLabel}</span>
              <strong>{formatPieValue(centerValue, valueType)}</strong>
              <small>{focusEntry ? `${formatNumber(centerPercent, 1)}% del total` : `${formatNumber(normalizedData.length)} grupos`}</small>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-400">
            Preparando gráfico...
          </div>
        )}
      </div>

      <div className="metrics-pie-legend custom-scrollbar" role="group" aria-label="Referencias del grafico">
        {normalizedData.map((entry) => {
          const entryName = entry?.[nameKey];
          const percent = total > 0 ? (entry.__pieValue / total) * 100 : 0;
          const isSelected = activeName === entryName;
          const isDimmed = Boolean(focusName && focusName !== entryName);
          return (
            <button
              key={entryName}
              type="button"
              aria-pressed={isSelected}
              className={`metrics-pie-legend-row ${isSelected ? 'is-selected' : ''} ${isDimmed ? 'is-dimmed' : ''}`}
              onClick={() => selectEntry(entry)}
              onMouseEnter={() => setHoveredName(entryName)}
              onMouseLeave={() => setHoveredName(null)}
              onFocus={() => setHoveredName(entryName)}
              onBlur={() => setHoveredName(null)}
            >
              <span className="metrics-pie-legend-dot" style={{ backgroundColor: entry.__pieColor }} />
              <span className="metrics-pie-legend-copy">
                <strong title={entryName}>{entryName}</strong>
                <small>{getSecondaryText?.(entry) || `${formatNumber(percent, 1)}% del total`}</small>
              </span>
              <span className="metrics-pie-legend-value">
                <strong>{formatPieValue(entry.__pieValue, valueType)}</strong>
                <small>{formatNumber(percent, 1)}%</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

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
    rows.push(['Resumen', 'Costo vendido', metrics.current.stats.cost]);
    rows.push(['Resumen', 'Resultado caja', metrics.current.stats.profit]);
  }

  rows.push([]);
  rows.push(['Productos', 'Nombre', 'Cantidad', 'Ingreso', canViewProfit ? 'Costo vendido' : '', canViewProfit ? 'Base' : '']);
  metrics.current.productStats.forEach((item) => rows.push(['Productos', item.name, item.qty, item.revenue, canViewProfit ? item.cost : '', canViewProfit ? (COST_BASIS_META[item.costStatus]?.label || 'Sin costo') : '']));

  rows.push([]);
  rows.push(['Categorías', 'Nombre', 'Cantidad', 'Ingreso', canViewProfit ? 'Costo vendido' : '', canViewProfit ? 'Base' : '']);
  metrics.current.categoryStats.forEach((item) => rows.push(['Categorías', item.name, item.qty, item.revenue, canViewProfit ? item.cost : '', canViewProfit ? (COST_BASIS_META[item.costStatus]?.label || 'Sin costo') : '']));

  rows.push([]);
  rows.push(['Pagos', 'Medio', 'Importe', 'Usos']);
  metrics.current.paymentStats.forEach((item) => rows.push(['Pagos', item.name, item.value, item.salesCount]));

  if (canViewClients) {
    rows.push([]);
    rows.push(['Clientes', 'Nombre', 'Ventas', 'Ingreso', 'Última compra']);
    metrics.current.clientStats.forEach((item) => rows.push(['Clientes', item.name, item.salesCount, item.revenue, item.lastDateLabel]));
  }

  if (canViewUsers) {
    rows.push([]);
    rows.push(['Usuarios', 'Nombre', 'Ventas', 'Ingreso', canViewProfit ? 'Resultado' : '']);
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
  isProfitSyncing: _isProfitSyncing = false,
  emptyStateMessage = '',
  onRefresh,
  isActive = true,
}) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeSection, setActiveSection] = useState('summary');
  const [viewMode, setViewMode] = useState(() => getPreferredMetricsViewMode(currentUser));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModernControlOpen, setIsModernControlOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [summaryEvolutionMetrics, setSummaryEvolutionMetrics] = useState(['revenue']);
  const [pieSelections, setPieSelections] = useState({});
  const [productLookupQuery, setProductLookupQuery] = useState('');

  const canViewProfit = hasPermission(currentUser, 'metrics.viewProfit');
  const canViewUsers = hasPermission(currentUser, 'metrics.viewUsers');
  const canViewClients = hasPermission(currentUser, 'metrics.viewClients');
  const canExport = hasPermission(currentUser, 'metrics.export');
  const canConfigureAlerts = hasPermission(currentUser, 'metrics.configureAlerts');
  const isModernMode = viewMode === 'modern';
  const isProfitControlMode = viewMode === PROFIT_CONTROL_VIEW_MODE;

  useEffect(() => {
    setSummaryEvolutionMetrics((current) => {
      const next = current.filter((metric) => canViewProfit || metric !== 'profit');
      return next.length ? next : ['revenue'];
    });
  }, [canViewProfit]);

  useEffect(() => {
    setViewMode(getPreferredMetricsViewMode(currentUser));
  }, [currentUser]);

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
  const visibleProductOptions = useMemo(() => (
    metrics.filterOptions.products.filter((option) => {
      const categories = Array.isArray(option.categories) ? option.categories : [];
      const types = Array.isArray(option.types) ? option.types : [];
      const matchesCategory = !filters.category || categories.includes(filters.category);
      const matchesType = filters.productType === 'all' || types.includes(filters.productType);
      return matchesCategory && matchesType;
    })
  ), [metrics.filterOptions.products, filters.category, filters.productType]);
  const currentProductStats = metrics.current.productStats;
  const currentAllProductStats = metrics.current.allProductStats || currentProductStats;
  const productLookupTerms = useMemo(() => splitProductLookupTerms(productLookupQuery), [productLookupQuery]);
  const productLookupRows = useMemo(() => {
    const hasLookup = productLookupTerms.length > 0;
    const metricRows = hasLookup
      ? currentAllProductStats
      : currentProductStats;
    const inventoryByKey = new Map();
    const inventoryByName = new Map();

    (inventory || []).forEach((product) => {
      const productKey = getInventoryProductKey(product);
      const productName = normalizeMetricText(getInventoryProductName(product));
      if (productKey) inventoryByKey.set(productKey, product);
      if (productName) inventoryByName.set(productName, product);
    });

    const soldRows = (metricRows || [])
      .map((row) => {
        const productKey = getMetricProductLookupKey(row);
        const inventoryProduct = inventoryByKey.get(productKey) || inventoryByName.get(normalizeMetricText(row.name));
        const snapshot = inventoryProduct ? getInventoryProductSnapshot(inventoryProduct) : {};
        return {
          ...row,
          ...snapshot,
          key: row.key,
          productKey,
          name: row.name || snapshot.name || 'Producto',
          type: row.type || snapshot.type || 'quantity',
          typeLabel: snapshot.typeLabel || getProductTypeLabel(row.type),
          lookupOnly: false,
          hasSales: true,
        };
      })
      .filter((row) => matchesProductLookupTerms(row, productLookupTerms));

    if (!hasLookup) return soldRows;

    const seenKeys = new Set(soldRows.map((row) => row.productKey).filter(Boolean));
    const seenNames = new Set(soldRows.map((row) => normalizeMetricText(row.name)).filter(Boolean));
    const inventoryRows = (inventory || [])
      .filter((product) => productMatchesInventoryFilters(product, filters))
      .filter((product) => matchesProductLookupTerms(product, productLookupTerms))
      .filter((product) => {
        const productKey = getInventoryProductKey(product);
        const productName = normalizeMetricText(getInventoryProductName(product));
        return !seenKeys.has(productKey) && !seenNames.has(productName);
      })
      .map(buildInventoryLookupRow);

    return [...soldRows, ...inventoryRows]
      .sort((a, b) => (Number(b.revenue || 0) - Number(a.revenue || 0)) || String(a.name).localeCompare(String(b.name)))
      .slice(0, PRODUCT_LOOKUP_LIMIT);
  }, [
    filters,
    inventory,
    currentAllProductStats,
    currentProductStats,
    productLookupTerms,
  ]);
  const selectedProductLookup = productLookupTerms.length ? productLookupRows[0] || null : null;
  const allSoldProductCount = currentAllProductStats.length;

  useEffect(() => {
    if (!filters.product) return;
    if (visibleProductOptions.some((option) => option.value === filters.product)) return;
    setFilters((prev) => ({ ...prev, product: '' }));
  }, [filters.product, visibleProductOptions]);

  const isProfitUnverified = false;
  const profitStatusLabel = null;
  const profitStatusDetail = 'Ingreso cobrado - gastos';
  const profitStatusTone = metrics.current.stats.profit >= 0
      ? 'emerald'
      : 'rose';

  const sections = useMemo(() => {
    const allowedSections = BASE_SECTIONS.filter((section) => !section.permission || hasPermission(currentUser, section.permission));
    return isModernMode ? allowedSections.filter((section) => MODERN_SECTION_IDS.has(section.id)) : allowedSections;
  }, [currentUser, isModernMode]);

  useEffect(() => {
    if (sections.some((section) => section.id === activeSection)) return;
    setActiveSection('summary');
  }, [activeSection, sections]);

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const resetFilters = () => setFilters(DEFAULT_FILTERS);
  const updatePieSelection = (chartKey, value) => {
    setPieSelections((current) => ({ ...current, [chartKey]: value || null }));
  };
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

  const handleMetricsViewModeChange = (mode) => {
    const nextMode = normalizeMetricsViewMode(mode);
    setViewMode(nextMode);
    setIsModernControlOpen(false);
    try {
      window.localStorage.setItem(METRICS_VIEW_MODE_STORAGE_KEY, nextMode);
    } catch (error) {
      console.error('No se pudo guardar la preferencia de metricas:', error);
    }
  };

  const handleCsvExport = () => {
    exportCsv('metricas-rebu.csv', buildCsvRows({ metrics, canViewProfit, canViewUsers, canViewClients }));
  };

  const handlePdfExport = () => {
    window.print();
  };

  const handleModernSectionSelect = (sectionId) => {
    setActiveSection(sectionId);
    setIsModernControlOpen(false);
  };

  const renderModeSwitch = (className = '') => (
    <MetricsModeSwitch value={viewMode} onChange={handleMetricsViewModeChange} className={className} />
  );

  const renderModernFiltersPanel = () => (
    <div className="metrics-modern-filters">
      <div className="metrics-modern-filter-layout">
        <ModernFilterGroup
          step="1"
          title="Periodo"
          helper="Rango activo"
          className="metrics-modern-filter-period"
        >
          <div className="metrics-modern-range-grid">
            {RANGE_FILTER_OPTIONS.map((option) => {
              const isActiveRange = filters.preset === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateFilter('preset', option.value)}
                  className={`metrics-modern-range-chip ${isActiveRange ? 'is-active' : ''}`}
                  aria-pressed={isActiveRange}
                >
                  <strong>{option.label}</strong>
                  <span>{option.helper}</span>
                </button>
              );
            })}
          </div>
          {filters.preset === 'custom' && (
            <div className="metrics-modern-date-row">
              <InputField label="Desde" type="date" value={filters.startDate} onChange={(value) => updateFilter('startDate', value)} />
              <InputField label="Hasta" type="date" value={filters.endDate} onChange={(value) => updateFilter('endDate', value)} />
            </div>
          )}
        </ModernFilterGroup>

        <ModernFilterGroup
          step="2"
          title="Ventas"
          helper="Estado y pago"
          className="metrics-modern-filter-sales"
        >
          <div className="metrics-modern-status-row">
            {STATUS_FILTER_OPTIONS.map((option) => {
              const isActiveStatus = filters.status === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateFilter('status', option.value)}
                  className={`metrics-modern-status-chip ${isActiveStatus ? 'is-active' : ''}`}
                  aria-pressed={isActiveStatus}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <ModernSelectControl label="Pago" value={filters.payment} onChange={(value) => updateFilter('payment', value)} icon={CreditCard}>
            <option value="">Todos los pagos</option>
            {metrics.filterOptions.payments.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </ModernSelectControl>
        </ModernFilterGroup>

        <ModernFilterGroup
          step="3"
          title="Detalle"
          helper="Rubro, producto o socio"
          className="metrics-modern-filter-refine"
        >
          <div className="metrics-modern-refine-grid">
            <ModernSelectControl label="Categoria" value={filters.category} onChange={(value) => updateFilter('category', value)} icon={Boxes}>
              <option value="">Todas las categorias</option>
              {metrics.filterOptions.categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </ModernSelectControl>
            <ModernSelectControl label="Producto" value={filters.product} onChange={(value) => updateFilter('product', value)} icon={ShoppingBag} className="metrics-modern-product-select">
              <option value="">Todos los productos</option>
              {visibleProductOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </ModernSelectControl>
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              className={`metrics-modern-advanced-button ${showAdvancedFilters || hasAdvancedFilters ? 'is-active' : ''}`}
            >
              <SlidersHorizontal size={14} />
              Mas{hasAdvancedFilters ? ' *' : ''}
            </button>
            <button type="button" onClick={resetFilters} className="metrics-modern-clear-button">
              Limpiar
            </button>
          </div>

          {showAdvancedFilters && (
            <div className="metrics-modern-advanced-grid">
              <ModernSelectControl label="Tipo de producto" value={filters.productType} onChange={(value) => updateFilter('productType', value)} icon={PackageSearch}>
                <option value="all">Todos los tipos</option>
                <option value="quantity">Unidad</option>
                <option value="weight">Peso</option>
              </ModernSelectControl>
              {canViewUsers && (
                <ModernSelectControl label="Usuario" value={filters.user} onChange={(value) => updateFilter('user', value)} icon={ShieldCheck}>
                  <option value="">Todos los usuarios</option>
                  {metrics.filterOptions.users.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </ModernSelectControl>
              )}
              {canViewClients && (
                <ModernSelectControl label="Socio" value={filters.client} onChange={(value) => updateFilter('client', value)} icon={Users}>
                  <option value="">Todos los socios</option>
                  {metrics.filterOptions.clients.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </ModernSelectControl>
              )}
              <ModernToggleChip checked={filters.includeVoided} onChange={(value) => updateFilter('includeVoided', value)} label="Incluir anuladas" />
              <ModernToggleChip checked={filters.includeTest} onChange={(value) => updateFilter('includeTest', value)} label="Incluir test" />
            </div>
          )}
        </ModernFilterGroup>
      </div>
    </div>
  );

  const isHourlyMode = metrics.current.periodMode === 'hour';
  const summaryEvolutionOptions = [
    { id: 'revenue', label: 'Ingreso', color: '#0ea5e9', tone: 'border-sky-200 bg-sky-50 text-sky-700' },
    ...(canViewProfit ? [{ id: 'profit', label: 'Resultado', color: '#10b981', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' }] : []),
    { id: 'expenses', label: 'Gastos', color: '#ef4444', tone: 'border-rose-200 bg-rose-50 text-rose-700' },
  ];
  const activeEvolutionOptions = summaryEvolutionOptions.filter((option) => summaryEvolutionMetrics.includes(option.id));
  const toggleSummaryEvolutionMetric = (metricId) => {
    setSummaryEvolutionMetrics((current) => {
      const exists = current.includes(metricId);
      if (exists && current.length === 1) return current;
      return exists ? current.filter((item) => item !== metricId) : [...current, metricId];
    });
  };
  const periodUnit = metrics.current.periodLabel || 'día';
  const _periodUnitPlural = metrics.current.periodLabelPlural || 'días';
  const hourlyPulseSeries = useMemo(() => {
    const rowsByHour = new Map((metrics.current.hourStats || []).map((row) => [String(row.key).padStart(2, '0'), row]));
    return Array.from({ length: 14 }, (_, index) => {
      const hour = index + 8;
      const key = String(hour).padStart(2, '0');
      const row = rowsByHour.get(key) || {};
      return {
        key,
        label: `${key}:00`,
        salesCount: Number(row.salesCount || 0),
        revenue: Number(row.revenue || 0),
      };
    });
  }, [metrics]);
  const showHourlyPulse =
    hourlyPulseSeries.some((row) => Number(row.salesCount || 0) > 0);

  const hasSourceData =
    transactions.length > 0 ||
    dailyLogs.length > 0 ||
    expenses.length > 0 ||
    pastClosures.length > 0 ||
    inventory.length > 0 ||
    budgets.length > 0 ||
    orders.length > 0;

  const renderHeaderActions = (modern = false) => (
    <div className={`flex flex-wrap items-center gap-2 ${modern ? 'metrics-modern-actions' : ''}`}>
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
  );

  const _renderFiltersPanel = (modern = false) => (
    modern ? renderModernFiltersPanel() :
    <div className={modern ? 'metrics-modern-filters rounded-lg border border-slate-200 bg-white p-2' : 'rounded-lg border border-slate-200 bg-slate-50 p-2'}>
      <div className={modern ? 'grid grid-cols-2 items-end gap-2 md:grid-cols-4 xl:grid-cols-[0.8fr_0.85fr_0.85fr_0.95fr_1.35fr_auto_auto]' : 'grid grid-cols-2 items-end gap-2 md:grid-cols-4 xl:grid-cols-[0.9fr_0.85fr_0.9fr_1fr_1.7fr_auto_auto]'}>
        <SelectField label="Rango" value={filters.preset} onChange={(value) => updateFilter('preset', value)}>
          <option value="today">Hoy</option>
          <option value="yesterday">Ayer</option>
          <option value="3d">Ultimos 3 dias</option>
          <option value="7d">Ultimos 7 dias</option>
          <option value="14d">Ultimas 2 semanas</option>
          <option value="30d">Ultimos 30 dias</option>
          <option value="90d">Ultimos 90 dias</option>
          <option value="year">Anio actual</option>
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
        <SelectField label="Categoria" value={filters.category} onChange={(value) => updateFilter('category', value)}>
          <option value="">Todas</option>
          {metrics.filterOptions.categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </SelectField>
        <SelectField label="Producto" value={filters.product} onChange={(value) => updateFilter('product', value)} className="min-w-[220px]">
          <option value="">Todos</option>
          {visibleProductOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
            <SelectField label="Socio" value={filters.client} onChange={(value) => updateFilter('client', value)}>
              <option value="">Todos</option>
              {metrics.filterOptions.clients.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SelectField>
          )}
          <ToggleField checked={filters.includeVoided} onChange={(value) => updateFilter('includeVoided', value)} label="Anuladas" />
          <ToggleField checked={filters.includeTest} onChange={(value) => updateFilter('includeTest', value)} label="Test" />
        </div>
      )}
    </div>
  );

  const renderSectionTabs = (modern = false) => (
    <div className={`custom-scrollbar flex gap-1.5 overflow-x-auto pb-1 ${modern ? 'metrics-modern-tabs' : ''}`}>
      {sections.map((section) => {
        const Icon = section.icon;
        const isActiveSection = activeSection === section.id;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => (modern ? handleModernSectionSelect(section.id) : setActiveSection(section.id))}
            className={modern
              ? `metrics-modern-tab ${isActiveSection ? 'is-active' : ''}`
              : `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-black transition ${
                  isActiveSection
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
  );

  const renderModernSidebar = () => (
    <aside className={`metrics-modern-sidebar ${isModernControlOpen ? 'is-open' : ''}`}>
      <div className="metrics-modern-sidebar-inner custom-scrollbar">
        <div className="metrics-modern-sidebar-head">
          <div>
            <p>Lectura</p>
            <span>Periodo, seccion y detalle.</span>
          </div>
          <button
            type="button"
            onClick={() => setIsModernControlOpen(false)}
            className="metrics-modern-sidebar-close"
          >
            Cerrar
          </button>
        </div>

        <div className="metrics-modern-sidebar-block">
          <div className="metrics-modern-sidebar-label">Secciones</div>
          {renderSectionTabs(true)}
        </div>

        <div className="metrics-modern-sidebar-block">
          <div className="metrics-modern-sidebar-label">Filtros</div>
          {renderModernFiltersPanel()}
        </div>
      </div>
    </aside>
  );

  const renderProfitControlFilters = () => (
    <section className="metrics-profit-filterbar rounded-lg border border-slate-200 bg-white/95 px-2.5 py-2 shadow-sm">
      <div className="flex flex-col gap-2 2xl:flex-row 2xl:items-center">
        <div className="flex min-w-[176px] items-center gap-2">
          <span className="metrics-filter-mark inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700">
            <Search size={15} />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Consulta</p>
            <p className="truncate text-[12px] font-black text-slate-900">{metrics.range.label}</p>
          </div>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[0.68fr_0.78fr_0.9fr_0.95fr_minmax(190px,1.2fr)]">
          <MetricLensSelect label="Rango" value={filters.preset} onChange={(value) => updateFilter('preset', value)}>
            {RANGE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </MetricLensSelect>
          <MetricLensSelect label="Estado" value={filters.status} onChange={(value) => updateFilter('status', value)}>
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </MetricLensSelect>
          <MetricLensSelect label="Pago" value={filters.payment} onChange={(value) => updateFilter('payment', value)}>
            <option value="">Todos</option>
            {metrics.filterOptions.payments.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </MetricLensSelect>
          <MetricLensSelect label="Rubro" value={filters.category} onChange={(value) => updateFilter('category', value)}>
            <option value="">Todos</option>
            {metrics.filterOptions.categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </MetricLensSelect>
          <MetricLensSelect label="Producto" value={filters.product} onChange={(value) => updateFilter('product', value)}>
            <option value="">Todos</option>
            {visibleProductOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </MetricLensSelect>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowAdvancedFilters((prev) => !prev)}
            aria-expanded={showAdvancedFilters}
            className={`metrics-filter-action inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[11px] font-black transition ${
              showAdvancedFilters || hasAdvancedFilters
                ? 'is-active border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <SlidersHorizontal size={14} />
            Ajustes
          </button>
          <button type="button" onClick={resetFilters} className="metrics-filter-action inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-black text-slate-600 transition hover:bg-slate-100">
            Limpiar
          </button>
        </div>
      </div>

      {filters.preset === 'custom' && (
        <div className="mt-2 grid grid-cols-1 gap-2 border-t border-slate-100 pt-2 sm:grid-cols-2">
          <InputField label="Desde" type="date" value={filters.startDate} onChange={(value) => updateFilter('startDate', value)} />
          <InputField label="Hasta" type="date" value={filters.endDate} onChange={(value) => updateFilter('endDate', value)} />
        </div>
      )}

      {showAdvancedFilters && (
        <div className="mt-2 grid grid-cols-1 items-center gap-2 border-t border-slate-100 pt-2 sm:grid-cols-2 lg:grid-cols-[0.8fr_1fr_1fr_auto_auto]">
          <MetricLensSelect label="Tipo" value={filters.productType} onChange={(value) => updateFilter('productType', value)}>
            <option value="all">Todos</option>
            <option value="quantity">Unidad</option>
            <option value="weight">Peso</option>
          </MetricLensSelect>
          {canViewUsers && (
            <MetricLensSelect label="Usuario" value={filters.user} onChange={(value) => updateFilter('user', value)}>
              <option value="">Todos</option>
              {metrics.filterOptions.users.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </MetricLensSelect>
          )}
          {canViewClients && (
            <MetricLensSelect label="Socio" value={filters.client} onChange={(value) => updateFilter('client', value)}>
              <option value="">Todos</option>
              {metrics.filterOptions.clients.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </MetricLensSelect>
          )}
          <label className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-black text-slate-600">
            <input type="checkbox" checked={filters.includeVoided} onChange={(event) => updateFilter('includeVoided', event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-500" />
            Anuladas
          </label>
          <label className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-black text-slate-600">
            <input type="checkbox" checked={filters.includeTest} onChange={(event) => updateFilter('includeTest', event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-500" />
            Test
          </label>
        </div>
      )}
    </section>
  );

  const renderProfitControlMode = () => {
    const stats = metrics.current.stats;
    const revenue = Number(stats.revenue || 0);
    const cost = Number(stats.cost || 0);
    const expensesTotal = Number(stats.expenses || 0);
    const netProfit = Number(stats.profit || 0);
    const grossProfit = revenue - cost;
    const grossMarginRate = revenue ? (grossProfit / revenue) * 100 : 0;
    const netMarginRate = revenue ? (netProfit / revenue) * 100 : 0;
    const costRate = revenue ? (cost / revenue) * 100 : 0;
    const expenseRate = revenue ? (expensesTotal / revenue) * 100 : 0;
    const productRows = [...metrics.current.productStats]
      .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
      .slice(0, 14);
    const leadingProduct = productRows[0] || metrics.current.productStats[0];
    const profitControlSeries = metrics.current.dailySeries.map((row) => ({
      ...row,
      grossProfit: Number(row.profit || 0) + Number(row.expenses || 0),
      netProfit: Number(row.profit || 0),
    }));
    const hasEvolutionData = profitControlSeries.some((row) => (
      Number(row.revenue || 0) !== 0 ||
      Number(row.grossProfit || 0) !== 0 ||
      Number(row.netProfit || 0) !== 0
    ));
    const summaryCards = [
      {
        label: 'Ventas totales',
        value: <FancyPrice amount={revenue} />,
        helper: `${formatNumber(stats.salesCount)} ventas`,
        icon: ShoppingBag,
        tone: 'from-violet-500 to-fuchsia-500',
      },
      {
        label: 'Costo vendido',
        value: <FancyPrice amount={cost} />,
        helper: `${formatNumber(costRate, 1)}% de ventas`,
        icon: PackageSearch,
        tone: 'from-teal-500 to-emerald-500',
        restricted: !canViewProfit,
      },
      {
        label: 'Margen vendido',
        value: <FancyPrice amount={grossProfit} />,
        helper: `${formatNumber(grossMarginRate, 1)}%`,
        icon: BarChart3,
        tone: 'from-blue-500 to-sky-500',
        restricted: !canViewProfit,
      },
      {
        label: 'Gastos y comisiones',
        value: <FancyPrice amount={expensesTotal} />,
        helper: `${formatNumber(expenseRate, 1)}%`,
        icon: FileText,
        tone: 'from-amber-500 to-orange-500',
      },
      {
        label: 'Resultado caja',
        value: profitStatusLabel || <FancyPrice amount={netProfit} />,
        helper: `${formatNumber(netMarginRate, 1)}%`,
        icon: WalletCards,
        tone: 'from-emerald-600 to-green-500',
        restricted: !canViewProfit,
      },
    ];
    const detailRows = [
      { label: 'Ventas cobradas', value: <FancyPrice amount={revenue} /> },
      { label: '(-) Gastos registrados', value: <FancyPrice amount={expensesTotal} /> },
      { label: '= Resultado caja', value: profitStatusLabel || <FancyPrice amount={netProfit} />, strong: true, tone: isProfitUnverified ? 'text-amber-700' : netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700', restricted: !canViewProfit },
      { label: 'Costo vendido', value: <FancyPrice amount={cost} />, restricted: !canViewProfit },
      { label: 'Margen vendido', value: <FancyPrice amount={grossProfit} />, strong: true, tone: grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700', restricted: !canViewProfit },
    ];
    const profitControlInsight = !canViewProfit
      ? null
      : isProfitUnverified
        ? {
            tone: 'warning',
            title: 'Costos pendientes',
            text: 'Revisar productos antes de tomar decisiones finas.',
          }
        : netProfit < 0 && expensesTotal > revenue
          ? {
              tone: 'danger',
              title: 'Gastos por encima de cobros',
              text: 'Los gastos registrados superan lo cobrado en el rango.',
            }
          : netProfit < 0
            ? {
                tone: 'danger',
                title: 'Caja negativa',
                text: 'El resultado de caja queda debajo de cero. Revisar gastos y cobros.',
              }
            : netMarginRate < 8
              ? {
                  tone: 'warning',
                  title: 'Resultado ajustado',
                  text: `Queda ${formatNumber(netMarginRate, 1)}% sobre lo cobrado. Hay poco aire operativo.`,
                }
              : {
                  tone: 'success',
                  title: 'Caja positiva',
                  text: `Queda ${formatNumber(netMarginRate, 1)}% sobre lo cobrado despues de gastos.`,
                };
    return (
      <div className="metrics-view flex h-full min-h-0 flex-col bg-slate-100">
        <div className="relative z-20 shrink-0 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700">
                <WalletCards size={18} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black text-slate-950">Lectura simple de metricas</h2>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                    {metrics.range.label}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Lo importante del rango, explicado como caja: entro, salio y quedo.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {renderModeSwitch()}
              {renderHeaderActions(true)}
            </div>
          </div>
        </div>

        <main className="custom-scrollbar min-h-0 flex-1 overflow-auto bg-[linear-gradient(135deg,#f8fbff_0%,#eef5fb_52%,#f7fbff_100%)] p-2.5">
          <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-2.5">
            {renderProfitControlFilters()}

            {metrics.current.filteredTransactions.length === 0 && metrics.current.filteredExpenses.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                <div className="flex items-center gap-2">
                  <Search size={16} />
                  No hay ventas ni gastos para los filtros activos.
                </div>
              </div>
            ) : null}

            <section className="metrics-profit-control-card space-y-2.5">
              <div className="metrics-profit-summary-row grid grid-cols-1 items-start gap-2.5 xl:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="metrics-profit-explainer order-2 self-start rounded-lg border border-slate-200 bg-white/80 p-3 xl:order-1">
                  <p className="text-sm font-black leading-5 text-slate-950">Lectura rapida</p>
                  <div className="mt-2.5 space-y-2 text-[12px] font-semibold leading-5 text-slate-700">
                    {profitControlInsight ? (
                      <div className={`metrics-profit-insight metrics-profit-insight-${profitControlInsight.tone}`}>
                        <strong>{profitControlInsight.title}</strong>
                        <span>{profitControlInsight.text}</span>
                      </div>
                    ) : null}
                    <div className="space-y-1.5 border-t border-slate-200 pt-2.5 text-[11px] leading-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Resultado / ventas</span>
                        <strong className={netMarginRate >= 0 ? 'text-emerald-600' : 'text-rose-500'}>{formatNumber(netMarginRate, 1)}%</strong>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Gastos / ventas</span>
                        <strong className="text-amber-500">{formatNumber(expenseRate, 1)}%</strong>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Resultado</span>
                        <strong className={netProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}>{formatCurrency(netProfit)}</strong>
                      </div>
                    </div>
                    {isProfitUnverified ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-800">
                        Hay costos sin verificar. Revisalos antes de tomar decisiones finas.
                      </div>
                    ) : null}
                  </div>
                </aside>

                <div className="order-1 min-w-0 rounded-lg border border-slate-200 bg-white p-2.5 xl:order-2">
                  <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[172px_minmax(0,1fr)] 2xl:grid-cols-[190px_minmax(0,1fr)]">
                    <div className="metrics-summary-context rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Resumen del rango</p>
                      <h3 className="mt-1 text-base font-black leading-tight text-slate-950">Control de caja</h3>
                      <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-500">{getComparisonLabel(metrics)}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                      {summaryCards.map((card) => {
                        const Icon = card.icon;
                        return (
                          <article key={card.label} className="min-h-[94px] rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                            <div className="flex items-start gap-2.5">
                              <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br ${card.tone} text-white shadow-sm`}>
                                <Icon size={17} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[11px] font-black text-slate-700">{card.label}</p>
                                <div className="mt-1 truncate text-[20px] font-black leading-none text-slate-950">
                                  {card.restricted ? <span className="text-base text-slate-400">Restringido</span> : card.value}
                                </div>
                                <p className="mt-1.5 truncate text-[11px] font-semibold text-slate-500">{card.restricted ? 'Permiso requerido' : card.helper}</p>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(360px,0.66fr)_minmax(0,1.34fr)]">
                <section className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <FileText size={17} className="text-fuchsia-600" />
                      <h3 className="text-sm font-black text-slate-900">Detalle del rango</h3>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                          <tr>
                            <th className="px-3 py-2 font-black">Concepto</th>
                            <th className="px-3 py-2 text-right font-black">Importe</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {detailRows.map((row) => (
                            <tr key={row.label} className={row.strong ? 'bg-slate-50/80' : ''}>
                              <td className={`px-3 py-2 ${row.strong ? 'font-black text-slate-900' : 'font-semibold text-slate-700'}`}>{row.label}</td>
                              <td className={`px-3 py-2 text-right text-sm font-black ${row.tone || 'text-slate-800'}`}>
                                {row.restricted ? <span className="text-xs text-slate-400">Restringido</span> : row.value}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp size={17} className="text-sky-600" />
                        <div>
                          <h3 className="text-sm font-black text-slate-900">Evolucion de caja</h3>
                          <p className="text-[10px] font-semibold text-slate-500">Azul: cobrado. Verde: resultado.</p>
                        </div>
                      </div>
                    </div>
                    {canViewProfit && hasEvolutionData ? (
                      <ChartFrame height={248}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={profitControlSeries} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#dbe5ef" />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#7c8da3" interval="preserveStartEnd" minTickGap={18} />
                            <YAxis width={64} tick={{ fontSize: 10 }} stroke="#7c8da3" tickFormatter={(value) => `$${formatNumber(value)}`} />
                            <Tooltip content={<EvolutionChartTooltip />} />
                            <Legend verticalAlign="top" height={24} />
                            <Line type="monotone" dataKey="grossProfit" name="Ingreso cobrado" stroke="#2563eb" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
                            <Line type="monotone" dataKey="netProfit" name="Resultado caja" stroke="#16a34a" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </ChartFrame>
                    ) : (
                      <EmptyState text={canViewProfit ? 'Sin evolucion para estos filtros.' : 'Permiso requerido para ver ganancias.'} />
                    )}
                  </section>
              </div>
            </section>

            <section className="metrics-profit-products-card grid grid-cols-1 items-start gap-2.5 xl:grid-cols-[minmax(0,1fr)_236px] 2xl:grid-cols-[minmax(0,1fr)_252px]">
              <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="mb-2.5 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-950">Productos</h3>
                    <p className="text-[11px] font-semibold text-slate-500">Ranking por ingreso vendido.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[min(620px,55vw)]">
                    <MetricLensSelect label="Producto" value={filters.product} onChange={(value) => updateFilter('product', value)}>
                      <option value="">Todos</option>
                      {visibleProductOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </MetricLensSelect>
                    <MetricLensSelect label="Categoria" value={filters.category} onChange={(value) => updateFilter('category', value)}>
                      <option value="">Todas</option>
                      {metrics.filterOptions.categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </MetricLensSelect>
                  </div>
                </div>
                <div className="custom-scrollbar overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                      <tr>
                        <th className="px-3 py-2 font-black">Producto</th>
                        <th className="px-3 py-2 font-black">Tipo</th>
                        <th className="px-3 py-2 text-right font-black">Cantidad</th>
                        <th className="px-3 py-2 text-right font-black">Ventas</th>
                        {canViewProfit && <th className="px-3 py-2 text-right font-black">Costo vendido</th>}
                        {canViewProfit && <th className="px-3 py-2 text-right font-black">Base</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(canViewProfit ? productRows : metrics.current.productStats).length ? (
                        (canViewProfit ? productRows : metrics.current.productStats).map((row, index) => (
                          <tr key={row.key || `${row.name}-${index}`} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-black text-slate-800">
                              <span className="block max-w-[360px] truncate 2xl:max-w-[520px]" title={row.name}>{row.name}</span>
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-500">{row.type === 'weight' ? 'Peso' : 'Unidad'}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatNumber(row.qty)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-700"><FancyPrice amount={row.revenue} /></td>
                            {canViewProfit && <td className="px-3 py-2 text-right font-semibold text-slate-700"><FancyPrice amount={row.cost} /></td>}
                            {canViewProfit && <td className="px-3 py-2 text-right"><CostBasisBadge status={row.costStatus} /></td>}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={canViewProfit ? 6 : 4} className="px-3 py-8 text-center font-bold text-slate-400">Sin productos vendidos.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <aside className="metrics-products-explainer self-start rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
                <p className="text-sm font-black leading-5 text-slate-950">Lectura por producto</p>
                    <p className="mt-2 text-[12px] font-semibold leading-5 text-slate-700">Compara ventas, cantidad y costo vendido para revisar precios y reposicion.</p>
                {leadingProduct ? (
                  <div className="mt-3 rounded-md border border-emerald-200 bg-white/70 px-2.5 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Producto lider</p>
                    <p className="mt-1 truncate text-sm font-black text-slate-900" title={leadingProduct.name}>{leadingProduct.name}</p>
                    {canViewProfit && (
                      <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-emerald-100 pt-2 text-[10px] font-semibold text-slate-500">
                        <span>Ventas</span>
                        <strong className="text-right text-slate-800">{formatCurrency(leadingProduct.revenue || 0)}</strong>
                        <span>Costo</span>
                        <strong className="text-right text-slate-800">{formatCurrency(leadingProduct.cost || 0)}</strong>
                      </div>
                    )}
                  </div>
                ) : null}
              </aside>
            </section>
          </div>
        </main>
      </div>
    );
  };

  const renderModernHeader = () => (
    <div className="metrics-modern-header relative z-20 shrink-0 border-b border-slate-200 px-3 py-2 shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="metrics-modern-mark">
              <BarChart3 size={17} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black text-slate-900">Metricas</h2>
                <span className="metrics-modern-range-pill">{metrics.range.label}</span>
                <span className="metrics-modern-test-pill">Vista nueva</span>
                <span className="metrics-modern-comparison-pill">{getComparisonLabel(metrics)}</span>
              </div>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Resumen operativo del rango activo.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {renderModeSwitch()}
            <button
              type="button"
              onClick={() => setIsModernControlOpen(true)}
              className="metrics-modern-control-button"
            >
              <SlidersHorizontal size={14} />
              Filtros
            </button>
            {renderHeaderActions(true)}
          </div>
        </div>
      </div>
    </div>
  );

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

  const renderModernSummary = () => {
    const stats = metrics.current.stats;
    const marginRate = stats.revenue ? (stats.profit / stats.revenue) * 100 : 0;
    const stockValue = canViewProfit ? metrics.stockStats.totalCost : metrics.stockStats.totalRetail;
    const strongestPeriod = metrics.current.dailySeries.reduce((best, row) => (
      Number(row.revenue || 0) > Number(best?.revenue || 0) ? row : best
    ), null);
    const topProduct = metrics.current.productStats[0] || null;
    const topPayment = metrics.current.paymentStats[0] || null;
    const paymentTotal = metrics.current.paymentStats.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const visiblePayments = metrics.current.paymentStats.slice(0, 4);
    const topRecommendation = metrics.recommendations[0] || null;

    return (
      <div className="metrics-modern-summary space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <ModernHealthCard
            label="Ingreso bruto"
            value={<FancyPrice amount={stats.revenue} />}
            detail="Bruto"
            change={metrics.changes.revenue}
            tone="sky"
          />
          <ModernHealthCard
            label="Resultado caja"
            value={profitStatusLabel || <FancyPrice amount={stats.profit} />}
            detail={profitStatusLabel ? profitStatusDetail : `Margen ${formatNumber(marginRate, 1)}%`}
            change={metrics.changes.profit}
            tone={profitStatusTone}
            hidden={!canViewProfit}
          />
          <ModernHealthCard
            label="Ventas"
            value={formatNumber(stats.salesCount)}
            detail="Tickets"
            change={metrics.changes.salesCount}
            tone="violet"
          />
          <ModernHealthCard
            label="Ticket prom."
            value={<FancyPrice amount={stats.averageTicket} />}
            detail="Por venta"
            change={metrics.changes.averageTicket}
            tone="amber"
          />
          <ModernHealthCard
            label="Gastos"
            value={<FancyPrice amount={stats.expenses} />}
            detail={`${metrics.current.filteredExpenses.length} mov.`}
            change={metrics.changes.expenses}
            invertChange
            tone="rose"
          />
          <ModernHealthCard
            label="Stock actual"
            value={<FancyPrice amount={stockValue} />}
            detail={canViewProfit ? 'Costo actual' : 'Venta actual'}
            tone="slate"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.65fr_0.85fr]">
          <section className="metrics-modern-panel metrics-modern-evolution">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp size={17} className="text-sky-600" />
                  <h3 className="text-sm font-black text-slate-900">
                    {isHourlyMode ? 'Evolucion por horario' : 'Evolucion de salud'}
                  </h3>
                </div>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-500">Ritmo de ingresos, ganancia y gastos.</p>
              </div>
              <div className="metrics-modern-chart-toggles">
                {summaryEvolutionOptions.map((option) => {
                  const isActiveOption = summaryEvolutionMetrics.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleSummaryEvolutionMetric(option.id)}
                      className={isActiveOption ? 'is-active' : ''}
                      aria-pressed={isActiveOption}
                    >
                      <span style={{ backgroundColor: option.color }} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {metrics.current.dailySeries.length ? (
              <ChartFrame height={260}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.current.dailySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      {summaryEvolutionOptions.map((option) => (
                        <linearGradient key={option.id} id={`metrics-modern-${option.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={option.color} stopOpacity={0.24} />
                          <stop offset="95%" stopColor={option.color} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d8e2ee" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#7c8da3" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#7c8da3" tickFormatter={(value) => `$${formatNumber(value)}`} />
                    <Tooltip content={<EvolutionChartTooltip />} />
                    <Legend verticalAlign="top" height={24} />
                    {activeEvolutionOptions.map((option) => (
                      <Area
                        key={option.id}
                        type="monotone"
                        dataKey={option.id}
                        name={option.label}
                        stroke={option.color}
                        fill={`url(#metrics-modern-${option.id})`}
                        strokeWidth={2.5}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </ChartFrame>
            ) : <EmptyState />}

            {showHourlyPulse && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[11px] font-semibold text-slate-500">
                    <span className="font-black uppercase tracking-[0.12em] text-slate-600">Pulso horario</span>
                    <span className="mx-1 text-slate-400">·</span>
                    Movimientos por hora
                  </p>
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-black text-violet-700">
                    08:00 a 21:00
                  </span>
                </div>
                <AreaMetricPanel
                  data={hourlyPulseSeries}
                  areas={[{ key: 'salesCount', label: 'Movimientos', color: '#8b5cf6' }]}
                  yFormatter={(value) => formatNumber(value)}
                  height={110}
                  showLegend={false}
                />
              </div>
            )}

            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="metrics-modern-insight">
                <span>Mejor tramo</span>
                <strong>{strongestPeriod?.label || '-'}</strong>
                <small>{strongestPeriod ? <FancyPrice amount={strongestPeriod.revenue} /> : 'Sin ventas'}</small>
              </div>
              <div className="metrics-modern-insight">
                <span>Top producto</span>
                <strong title={topProduct?.name || undefined}>{topProduct?.name || '-'}</strong>
                <small>{topProduct ? <FancyPrice amount={topProduct.revenue} /> : 'Sin ventas'}</small>
              </div>
              <div className="metrics-modern-insight">
                <span>Medio lider</span>
                <strong title={topPayment?.name || undefined}>{topPayment?.name || '-'}</strong>
                <small>{topPayment ? <FancyPrice amount={topPayment.value} /> : 'Sin pagos'}</small>
              </div>
            </div>
          </section>

          <div className="space-y-3">
            <section className="metrics-modern-panel">
              <div className="mb-2 flex items-center gap-2">
                <WalletCards size={16} className="text-emerald-600" />
                <h3 className="text-sm font-black text-slate-900">Tira de caja</h3>
              </div>
              <div className="metrics-modern-ledger">
                <ModernLedgerRow label="Ingreso bruto" value={<FancyPrice amount={stats.revenue} />} tone="sky" />
                {canViewProfit && <ModernLedgerRow label="Costo vendido" value={<FancyPrice amount={stats.cost} />} />}
                <ModernLedgerRow label="Gastos" value={<FancyPrice amount={stats.expenses} />} tone="rose" />
                {canViewProfit ? (
                  <>
                    <ModernLedgerRow label="Resultado" value={profitStatusLabel || <FancyPrice amount={stats.profit} />} tone={profitStatusTone} strong />
                    <ModernLedgerRow label="Resultado / ingreso" value={`${formatNumber(marginRate, 1)}%`} tone="emerald" />
                  </>
                ) : (
                  <ModernLedgerRow label="Ticket promedio" value={<FancyPrice amount={stats.averageTicket} />} tone="amber" strong />
                )}
              </div>
            </section>

            <section className="metrics-modern-panel">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <CreditCard size={16} className="shrink-0 text-sky-600" />
                  <h3 className="truncate text-sm font-black text-slate-900">Metodos de pago</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSection('payments')}
                  className="metrics-modern-payment-detail"
                >
                  Ver detalle
                </button>
              </div>
              {visiblePayments.length ? (
                <div className="metrics-modern-payment-list">
                  {visiblePayments.map((item, index) => {
                    const share = paymentTotal > 0 ? (Number(item.value || 0) / paymentTotal) * 100 : 0;
                    return (
                      <div key={item.name} className="metrics-modern-payment-row">
                        <div className="metrics-modern-payment-main">
                          <span
                            className="metrics-modern-payment-dot"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="metrics-modern-payment-name" title={item.name}>{item.name}</span>
                          <span className="metrics-modern-payment-uses">{formatNumber(item.salesCount)} usos</span>
                          <strong><FancyPrice amount={item.value} /></strong>
                        </div>
                        <div className="metrics-modern-payment-track">
                          <span
                            style={{
                              width: `${Math.max(2, Math.min(100, share))}%`,
                              backgroundColor: COLORS[index % COLORS.length],
                            }}
                          />
                        </div>
                        <span className="metrics-modern-payment-share">{formatNumber(share, 1)}%</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="metrics-modern-payment-empty">Sin pagos para estos filtros.</div>
              )}
            </section>

            <section className="metrics-modern-panel">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-fuchsia-600" />
                  <h3 className="text-sm font-black text-slate-900">Pulso</h3>
                </div>
                {topRecommendation && <span className="metrics-modern-range-pill">Top</span>}
              </div>
              <div className="space-y-2">
                {metrics.recommendations.length ? metrics.recommendations.slice(0, 3).map((item, index) => (
                  <div key={`${item.title}-${index}`} className={`metrics-modern-alert metrics-modern-alert-${item.tone || 'info'}`}>
                    <p>{item.title}</p>
                    <span>{item.detail}</span>
                  </div>
                )) : (
                  <div className="metrics-modern-alert metrics-modern-alert-success">
                    <p>Sin alertas importantes</p>
                    <span>Los filtros actuales no muestran seniales criticas.</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  };

  const renderSummary = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Ingreso bruto" value={<FancyPrice amount={metrics.current.stats.revenue} />} sublabel={metrics.range.label} change={metrics.changes.revenue} tone="sky" hint="Total vendido en el rango filtrado, antes de restar costos o gastos." />
        <MetricCard label="Resultado caja" value={profitStatusLabel || <FancyPrice amount={metrics.current.stats.profit} />} sublabel={profitStatusLabel ? profitStatusDetail : 'Ingreso cobrado - gastos'} change={metrics.changes.profit} tone={profitStatusTone} hidden={!canViewProfit} hint="Resultado del periodo: ingreso cobrado menos gastos registrados. El costo vendido se usa para margen de productos." />
        <MetricCard label="Ventas" value={formatNumber(metrics.current.stats.salesCount)} sublabel="Tickets emitidos" change={metrics.changes.salesCount} tone="violet" />
        <MetricCard label="Ticket promedio" value={<FancyPrice amount={metrics.current.stats.averageTicket} />} sublabel="Promedio por venta" change={metrics.changes.averageTicket} tone="amber" hint="Ingreso bruto dividido por cantidad de ventas." />
        <MetricCard label="Gastos" value={<FancyPrice amount={metrics.current.stats.expenses} />} sublabel={`${metrics.current.filteredExpenses.length} movimientos`} change={metrics.changes.expenses} invertChange tone="rose" hint="Suma de gastos registrados en el rango filtrado." />
        <MetricCard label="Stock actual" value={<FancyPrice amount={canViewProfit ? metrics.stockStats.totalCost : metrics.stockStats.totalRetail} />} sublabel={canViewProfit ? 'Snapshot a costo' : 'Snapshot a venta'} tone="slate" hint={canViewProfit ? 'Valor estimado del stock actual a precio de compra; no depende del rango filtrado.' : 'Valor estimado del stock actual a precio de venta; no depende del rango filtrado.'} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.45fr_0.9fr]">
        <Panel
          title={isHourlyMode ? 'Evolución por horario' : 'Evolución del período'}
          icon={TrendingUp}
          action={(
            <div className="inline-flex flex-wrap gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
              {summaryEvolutionOptions.map((option) => (
                <label
                  key={option.id}
                  className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded border px-2 text-[10px] font-black transition ${
                    summaryEvolutionMetrics.includes(option.id)
                      ? option.tone
                      : 'border-transparent text-slate-500 hover:bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={summaryEvolutionMetrics.includes(option.id)}
                    onChange={() => toggleSummaryEvolutionMetric(option.id)}
                    className="h-3 w-3 rounded border-slate-300"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          )}
          hint={`Compara ingreso bruto, cantidad de ventas y, si tenés permiso, resultado de caja por ${periodUnit}.`}
        >
          {metrics.current.dailySeries.length ? (
            <ChartFrame height={260}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.current.dailySeries}>
                  <defs>
                    {summaryEvolutionOptions.map((option) => (
                      <linearGradient key={option.id} id={`metrics-${option.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={option.color} stopOpacity={0.22} />
                        <stop offset="95%" stopColor={option.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(value) => `$${formatNumber(value)}`} />
                  <Tooltip content={<EvolutionChartTooltip />} />
                  <Legend verticalAlign="top" height={24} />
                  {activeEvolutionOptions.map((option) => (
                    <Area
                      key={option.id}
                      type="monotone"
                      dataKey={option.id}
                      name={option.label}
                      stroke={option.color}
                      fill={`url(#metrics-${option.id})`}
                      strokeWidth={2}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </ChartFrame>
          ) : <EmptyState />}

          {showHourlyPulse && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[11px] font-semibold text-slate-500">
                  <span className="font-black uppercase tracking-[0.12em] text-slate-600">Pulso horario</span>
                  <span className="mx-1 text-slate-400">·</span>
                  Movimientos acumulados por hora
                </p>
                <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-black text-violet-700">
                  08:00 a 21:00
                </span>
              </div>
              <AreaMetricPanel
                data={hourlyPulseSeries}
                areas={[{ key: 'salesCount', label: 'Movimientos', color: '#8b5cf6' }]}
                yFormatter={(value) => formatNumber(value)}
                height={110}
                showLegend={false}
              />
            </div>
          )}
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
    <div className="space-y-4">
      <StatStrip
        items={[
          { label: 'Ventas', value: formatNumber(metrics.current.stats.salesCount), sub: metrics.range.label, tone: 'border-violet-200 bg-violet-50 text-violet-700' },
          { label: 'Ingreso', value: <FancyPrice amount={metrics.current.stats.revenue} />, sub: 'Total vendido', tone: 'border-sky-200 bg-sky-50 text-sky-700' },
          { label: 'Ticket prom.', value: <FancyPrice amount={metrics.current.stats.averageTicket} />, sub: 'Por venta', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
          {
            label: 'Mejor tramo',
            value: metrics.current.dailySeries.reduce((best, row) => (
              Number(row.revenue || 0) > Number(best?.revenue || 0) ? row : best
            ), null)?.label || '-',
            sub: 'Mayor ingreso',
            tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          },
        ]}
      />
      <Panel title={isHourlyMode ? 'Ritmo por horario' : 'Ritmo de ventas'} icon={TrendingUp}>
        <AreaMetricPanel
          data={metrics.current.dailySeries}
          areas={[{ key: 'revenue', label: 'Ingreso', color: '#0ea5e9' }]}
          height={280}
        />
      </Panel>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title={isHourlyMode ? 'Detalle por horario' : 'Detalle por periodo'} icon={TrendingUp}>
          <Table
            emptyText="Sin ventas para estos filtros."
            columns={[
              { key: 'label', label: isHourlyMode ? 'Horario' : 'Dia' },
              { key: 'salesCount', label: 'Ventas', align: 'right', render: (row) => formatNumber(row.salesCount) },
              { key: 'revenue', label: 'Ingreso', align: 'right', render: (row) => <FancyPrice amount={row.revenue} /> },
              ...(canViewProfit ? [{ key: 'profit', label: 'Resultado', align: 'right', render: (row) => <FancyPrice amount={row.profit} /> }] : []),
            ]}
            rows={metrics.current.dailySeries}
          />
        </Panel>
        <Panel title="Medios de pago" icon={CreditCard} hint="Los usos cuentan lineas de pago; una venta dividida puede sumar mas de un uso.">
          <Table
            emptyText="Sin pagos para estos filtros."
            columns={[
              { key: 'name', label: 'Medio' },
              { key: 'salesCount', label: 'Usos', align: 'right', render: (row) => formatNumber(row.salesCount) },
              { key: 'value', label: 'Importe', align: 'right', render: (row) => <FancyPrice amount={row.value} /> },
            ]}
            rows={metrics.current.paymentStats}
          />
        </Panel>
      </div>
    </div>
  );

  const renderProfit = () => {
    const financialPieData = [
      { name: 'Gastos', value: Math.max(Number(metrics.current.stats.expenses || 0), 0) },
      { name: 'Resultado caja', value: Math.max(Number(metrics.current.stats.profit || 0), 0) },
      { name: 'Costo vendido', value: Math.max(Number(metrics.current.stats.cost || 0), 0) },
    ].filter((item) => item.value > 0);
    const selectedFinancialName = pieSelections.profitBreakdown || null;
    const financialColumns = selectedFinancialName === 'Costo vendido'
      ? [{
          key: 'cost',
          label: 'Costo vendido',
          align: 'right',
          render: (row) => <FancyPrice amount={row.cost} />,
        }]
      : selectedFinancialName === 'Gastos'
        ? [{ key: 'expenses', label: 'Gastos', align: 'right', render: (row) => <FancyPrice amount={row.expenses} /> }]
        : selectedFinancialName === 'Resultado caja'
          ? [{ key: 'profit', label: 'Resultado', align: 'right', render: (row) => <FancyPrice amount={row.profit} /> }]
          : [
              { key: 'revenue', label: 'Ingreso', align: 'right', render: (row) => <FancyPrice amount={row.revenue} /> },
              { key: 'profit', label: 'Resultado', align: 'right', render: (row) => <FancyPrice amount={row.profit} /> },
              { key: 'expenses', label: 'Gastos', align: 'right', render: (row) => <FancyPrice amount={row.expenses} /> },
              { key: 'cost', label: 'Costo vendido', align: 'right', render: (row) => <FancyPrice amount={row.cost} /> },
            ];

    return (
    <div className="space-y-4">
      <StatStrip
        items={[
          { label: 'Ingreso', value: <FancyPrice amount={metrics.current.stats.revenue} />, sub: 'Cobrado', tone: 'border-sky-200 bg-sky-50 text-sky-700' },
          { label: 'Resultado caja', value: profitStatusLabel || <FancyPrice amount={metrics.current.stats.profit} />, sub: profitStatusLabel ? profitStatusDetail : 'Cobrado - gastos', tone: isProfitUnverified ? 'border-amber-200 bg-amber-50 text-amber-700' : metrics.current.stats.profit >= 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700' },
          { label: 'Gastos', value: <FancyPrice amount={metrics.current.stats.expenses} />, sub: `${metrics.current.filteredExpenses.length} movimientos`, tone: 'border-rose-200 bg-rose-50 text-rose-700' },
          { label: 'Ratio caja', value: `${formatNumber(metrics.current.stats.revenue ? (metrics.current.stats.profit / metrics.current.stats.revenue) * 100 : 0, 1)}%`, sub: 'Resultado / ingreso', tone: 'border-slate-200 bg-slate-50 text-slate-700' },
        ]}
      />
      <Panel
        title="Resultado financiero"
        icon={WalletCards}
        hint="El desglose muestra lo cobrado, gastos reales y costo vendido del rango actual."
      >
        <FinanceBreakdown
          stats={metrics.current.stats}
          profitStatusLabel={profitStatusLabel}
          profitStatusToneClass={isProfitUnverified ? 'text-amber-700 bg-amber-50 border-amber-100' : null}
        />
      </Panel>

      <Panel title={isHourlyMode ? 'Evolucion de caja por horario' : 'Evolucion de caja'} icon={TrendingUp}>
        <AreaMetricPanel
          data={metrics.current.dailySeries}
          areas={[
            { key: 'revenue', label: 'Ingreso', color: '#0ea5e9' },
            { key: 'profit', label: 'Resultado', color: '#10b981' },
            { key: 'expenses', label: 'Gastos', color: '#ef4444' },
          ]}
          height={280}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title={isHourlyMode ? 'Detalle financiero por horario' : 'Detalle financiero por periodo'} icon={TrendingUp} hint={`Ingreso, resultado de caja, gastos y costo vendido por ${periodUnit}.`}>
          <PieMetricPanel
            data={financialPieData}
            height={250}
            valueType="currency"
            selectedName={selectedFinancialName}
            onSelectionChange={(name) => updatePieSelection('profitBreakdown', name)}
          />
          <Table
            emptyText="Sin movimientos financieros."
            columns={[
              { key: 'label', label: isHourlyMode ? 'Horario' : 'Periodo' },
              ...financialColumns,
            ]}
            rows={metrics.current.dailySeries}
          />
        </Panel>
        <Panel title="Costo por producto" icon={ShoppingBag} hint="Ingreso del producto, costo vendido y base usada para ese costo.">
          <Table
            emptyText="Sin productos vendidos."
            columns={[
              { key: 'name', label: 'Producto' },
              { key: 'revenue', label: 'Ingreso', align: 'right', render: (row) => <FancyPrice amount={row.revenue} /> },
              ...SOLD_COST_COLUMNS,
            ]}
            rows={metrics.current.productStats}
          />
        </Panel>
      </div>
    </div>
    );
  };

  const renderProducts = () => {
    const categoryPieData = metrics.current.categoryStats.slice(0, 10);
    const selectedCategoryName = pieSelections.productCategories || null;
    const selectedCategory = selectedCategoryName
      ? metrics.current.categoryStats.find((category) => category.name === selectedCategoryName)
      : null;
    const hasProductLookup = productLookupTerms.length > 0;
    const productLookupResultLabel = productLookupRows.length === 1
      ? '1 resultado'
      : `${formatNumber(productLookupRows.length)} resultados`;

    return (
      <div className="space-y-4">
        <StatStrip
          items={[
            { label: 'Productos vendidos', value: formatNumber(allSoldProductCount), sub: 'Con movimiento', tone: 'border-sky-200 bg-sky-50 text-sky-700' },
            { label: 'Unidades/items', value: formatNumber(metrics.current.stats.itemsSold), sub: 'Cantidad total', tone: 'border-violet-200 bg-violet-50 text-violet-700' },
            { label: 'Categorias', value: formatNumber(metrics.current.categoryStats.length), sub: 'Con ventas', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
            { label: 'Top producto', value: metrics.current.productStats[0]?.name || '-', sub: 'Mayor ingreso', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
          ]}
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.9fr]">
          <Panel
            title={hasProductLookup ? 'Consulta de productos' : 'Ranking de productos'}
            icon={ShoppingBag}
            action={(
              <label className="relative block w-[180px] sm:w-[260px]">
                <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={productLookupQuery}
                  onChange={(event) => setProductLookupQuery(event.target.value)}
                  placeholder="Buscar producto"
                  aria-label="Buscar producto por nombre"
                  className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-[11px] font-bold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-fuchsia-300 focus:bg-white focus:ring-2 focus:ring-fuchsia-100"
                />
              </label>
            )}
          >
            {hasProductLookup && (
              <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[11px] font-black text-slate-700">
                    {selectedProductLookup ? selectedProductLookup.name : 'Sin coincidencias'}
                  </p>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black text-slate-500">
                    {productLookupResultLabel}
                  </span>
                </div>
                {selectedProductLookup ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                      <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Estado</span>
                      <strong className={`mt-1 block truncate text-[11px] ${selectedProductLookup.lookupOnly ? 'text-slate-500' : 'text-emerald-700'}`}>
                        {selectedProductLookup.lookupOnly ? 'Sin ventas' : 'Con ventas'}
                      </strong>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                      <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Categoria</span>
                      <strong className="mt-1 block truncate text-[11px] text-slate-700" title={selectedProductLookup.category}>
                        {selectedProductLookup.category || '-'}
                      </strong>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                      <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Stock</span>
                      <strong className="mt-1 block truncate text-[11px] text-slate-700">
                        {Number.isFinite(selectedProductLookup.stock) ? formatNumber(selectedProductLookup.stock) : '-'}
                      </strong>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                      <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Tipo</span>
                      <strong className="mt-1 block truncate text-[11px] text-slate-700">
                        {selectedProductLookup.typeLabel || getProductTypeLabel(selectedProductLookup.type)}
                      </strong>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                      <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Precio</span>
                      <strong className="mt-1 block truncate text-[11px] text-slate-700">
                        {Number.isFinite(selectedProductLookup.salePrice) ? <FancyPrice amount={selectedProductLookup.salePrice} /> : '-'}
                      </strong>
                    </div>
                    {canViewProfit && (
                      <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                        <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Costo inv.</span>
                        <strong className="mt-1 block truncate text-[11px] text-slate-700">
                          {Number.isFinite(selectedProductLookup.purchasePrice) ? <FancyPrice amount={selectedProductLookup.purchasePrice} /> : '-'}
                        </strong>
                      </div>
                    )}
                    <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                      <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Vendido</span>
                      <strong className="mt-1 block truncate text-[11px] text-slate-700">
                        {formatNumber(selectedProductLookup.qty)}
                      </strong>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white px-2 py-1.5">
                      <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Ingreso</span>
                      <strong className="mt-1 block truncate text-[11px] text-slate-700">
                        <FancyPrice amount={selectedProductLookup.revenue} />
                      </strong>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">
                    No encontre productos con ese nombre en ventas ni inventario.
                  </p>
                )}
              </div>
            )}
            <Table
              emptyText={hasProductLookup ? 'Sin productos encontrados.' : 'Sin productos vendidos.'}
              columns={[
                {
                  key: 'name',
                  label: 'Producto',
                  render: (row) => (
                    <div className="min-w-0">
                      <span className="block max-w-[220px] truncate font-black text-slate-800" title={row.name}>
                        {row.name}
                      </span>
                      {row.lookupOnly ? (
                        <span className="mt-0.5 block text-[10px] font-bold text-slate-400">Sin ventas en periodo</span>
                      ) : row.category ? (
                        <span className="mt-0.5 block max-w-[220px] truncate text-[10px] font-bold text-slate-400">{row.category}</span>
                      ) : null}
                    </div>
                  ),
                },
                { key: 'qty', label: 'Cantidad', align: 'right', render: (row) => formatNumber(row.qty) },
                { key: 'revenue', label: 'Ingreso', align: 'right', render: (row) => <FancyPrice amount={row.revenue} /> },
                ...(canViewProfit ? PRODUCT_LOOKUP_COST_COLUMNS : []),
              ]}
              rows={productLookupRows}
            />
          </Panel>
          <Panel title={isModernMode ? 'Categorias por ingreso' : 'Tipo de producto'} icon={isModernMode ? Boxes : PackageSearch}>
            {isModernMode ? (
              <PieMetricPanel
                data={categoryPieData}
                dataKey="revenue"
                height={300}
                valueType="currency"
                selectedName={selectedCategory?.name}
                onSelectionChange={(name) => updatePieSelection('productCategories', name)}
                getSecondaryText={(entry) => `${formatNumber(entry.qty)} unidades/items`}
              />
            ) : metrics.current.typeStats.length ? (
              <PieMetricPanel
                data={metrics.current.typeStats}
                dataKey="revenue"
                height={300}
                valueType="currency"
                selectedName={pieSelections.productTypes || null}
                onSelectionChange={(name) => updatePieSelection('productTypes', name)}
                getSecondaryText={(entry) => `${formatNumber(entry.qty)} unidades/items`}
              />
            ) : <EmptyState />}
          </Panel>
        </div>

        {isModernMode && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Detalle de categorias" icon={Boxes}>
              <Table
                emptyText="Sin categorias vendidas."
                columns={[
                  { key: 'name', label: 'Categoria' },
                  { key: 'qty', label: 'Cantidad', align: 'right', render: (row) => formatNumber(row.qty) },
                  { key: 'revenue', label: 'Ingreso', align: 'right', render: (row) => <FancyPrice amount={row.revenue} /> },
                  ...(canViewProfit ? SOLD_COST_COLUMNS : []),
                ]}
                rows={metrics.current.categoryStats}
                onRowClick={(row) => updatePieSelection('productCategories', row.name)}
                isRowSelected={(row) => row.name === selectedCategoryName}
              />
            </Panel>

            <Panel
              title={selectedCategory ? `Articulos de ${selectedCategory.name}` : 'Articulos de categoria'}
              icon={ShoppingBag}
              action={selectedCategory ? (
                <button
                  type="button"
                  onClick={() => updatePieSelection('productCategories', null)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-500 hover:bg-slate-50"
                >
                  Limpiar
                </button>
              ) : null}
            >
              <Table
                emptyText="Selecciona una categoria del grafico."
                columns={[
                  { key: 'name', label: 'Articulo' },
                  { key: 'qty', label: 'Cantidad', align: 'right', render: (row) => formatNumber(row.qty) },
                  { key: 'revenue', label: 'Ingreso', align: 'right', render: (row) => <FancyPrice amount={row.revenue} /> },
                  ...(canViewProfit ? SOLD_COST_COLUMNS : []),
                ]}
                rows={selectedCategory?.productBreakdown || []}
              />
            </Panel>
          </div>
        )}
      </div>
    );
  };

  const renderCategories = () => {
    const categoryPieData = metrics.current.categoryStats.slice(0, 10);
    const selectedCategoryName = pieSelections.categories || null;
    const selectedCategory = selectedCategoryName
      ? metrics.current.categoryStats.find((category) => category.name === selectedCategoryName)
      : null;

    return (
      <div className="space-y-4">
        <StatStrip
          items={[
            { label: 'Categorias', value: formatNumber(metrics.current.categoryStats.length), sub: 'Con ventas', tone: 'border-sky-200 bg-sky-50 text-sky-700' },
            { label: 'Top categoria', value: metrics.current.categoryStats[0]?.name || '-', sub: 'Mayor ingreso', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
            { label: 'Ingreso top', value: <FancyPrice amount={metrics.current.categoryStats[0]?.revenue || 0} />, sub: 'Categoria lider', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
            ...(canViewProfit ? [{ label: 'Margen vendido top', value: <FancyPrice amount={metrics.current.categoryStats[0]?.profit || 0} />, sub: 'Categoria lider', tone: 'border-violet-200 bg-violet-50 text-violet-700' }] : []),
          ]}
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel
            title="Categorias por ingreso"
            icon={Boxes}
            hint="Toca una porcion para ver los articulos incluidos en esa categoria."
          >
            <PieMetricPanel
              data={categoryPieData}
              dataKey="revenue"
              height={320}
              valueType="currency"
              selectedName={selectedCategory?.name}
              onSelectionChange={(name) => updatePieSelection('categories', name)}
              getSecondaryText={(entry) => `${formatNumber(entry.qty)} unidades/items`}
            />
          </Panel>
          <Panel title="Detalle de categorias" icon={Boxes}>
            <Table
              emptyText="Sin categorias vendidas."
              columns={[
                { key: 'name', label: 'Categoria' },
                { key: 'qty', label: 'Cantidad', align: 'right', render: (row) => formatNumber(row.qty) },
                { key: 'revenue', label: 'Ingreso', align: 'right', render: (row) => <FancyPrice amount={row.revenue} /> },
                ...(canViewProfit ? SOLD_COST_COLUMNS : []),
              ]}
              rows={metrics.current.categoryStats}
              onRowClick={(row) => updatePieSelection('categories', row.name)}
              isRowSelected={(row) => row.name === selectedCategoryName}
            />
          </Panel>
        </div>

        {selectedCategory && (
          <Panel
            title={`Articulos de ${selectedCategory.name}`}
            icon={ShoppingBag}
            action={(
              <button
                type="button"
                onClick={() => updatePieSelection('categories', null)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-500 hover:bg-slate-50"
              >
                Limpiar
              </button>
            )}
          >
            <Table
              emptyText="Sin articulos para esta categoria."
              columns={[
                { key: 'name', label: 'Articulo' },
                { key: 'qty', label: 'Cantidad', align: 'right', render: (row) => formatNumber(row.qty) },
                { key: 'revenue', label: 'Ingreso', align: 'right', render: (row) => <FancyPrice amount={row.revenue} /> },
                ...(canViewProfit ? SOLD_COST_COLUMNS : []),
              ]}
              rows={selectedCategory.productBreakdown || []}
            />
          </Panel>
        )}
      </div>
    );
  };

  const renderPayments = () => {
    const selectedPaymentName = pieSelections.payments || null;
    const visiblePaymentRows = selectedPaymentName
      ? metrics.current.paymentStats.filter((row) => row.name === selectedPaymentName)
      : metrics.current.paymentStats;
    const paymentHistoryRows = (selectedPaymentName
      ? visiblePaymentRows.flatMap((row) => row.history || [])
      : metrics.current.paymentStats.flatMap((row) => row.history || [])
    )
      .sort((a, b) => Number(b.sortTime || 0) - Number(a.sortTime || 0))
      .slice(0, 40);
    const formatPaymentHistoryDate = (row) => {
      const date = row.date instanceof Date ? row.date : null;
      if (!date || Number.isNaN(date.getTime())) return row.time || '-';
      const day = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      const time = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      return `${day} ${time}`;
    };

    return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr_1fr]">
      <Panel title="Distribucion de pagos" icon={CreditCard}>
        <PieMetricPanel
          data={metrics.current.paymentStats}
          dataKey="value"
          height={320}
          valueType="currency"
          selectedName={selectedPaymentName}
          onSelectionChange={(name) => updatePieSelection('payments', name)}
          getSecondaryText={(entry) => `${formatNumber(entry.salesCount)} usos`}
        />
      </Panel>
      <Panel title="Medios de pago" icon={CreditCard}>
        <Table
          emptyText="Sin pagos para estos filtros."
          columns={[
            { key: 'name', label: 'Medio' },
            { key: 'salesCount', label: 'Usos', align: 'right', render: (row) => formatNumber(row.salesCount) },
            { key: 'value', label: 'Importe', align: 'right', render: (row) => <FancyPrice amount={row.value} /> },
          ]}
          rows={visiblePaymentRows}
          onRowClick={(row) => updatePieSelection('payments', row.name)}
          isRowSelected={(row) => row.name === selectedPaymentName}
        />
      </Panel>
      </div>

      <Panel
        title={selectedPaymentName ? `Historial de ${selectedPaymentName}` : 'Historial reciente de pagos'}
        icon={CalendarDays}
        action={selectedPaymentName ? (
          <button
            type="button"
            onClick={() => updatePieSelection('payments', null)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-500 hover:bg-slate-50"
          >
            Ver todos
          </button>
        ) : null}
      >
        <Table
          emptyText="Sin historial de pagos para estos filtros."
          columns={[
            { key: 'date', label: 'Fecha', render: (row) => formatPaymentHistoryDate(row) },
            { key: 'method', label: 'Medio' },
            { key: 'clientName', label: 'Cliente' },
            { key: 'user', label: 'Usuario' },
            { key: 'itemCount', label: 'Items', align: 'right', render: (row) => formatNumber(row.itemCount) },
            { key: 'amount', label: 'Importe', align: 'right', render: (row) => <FancyPrice amount={row.amount} /> },
          ]}
          rows={paymentHistoryRows}
        />
      </Panel>
    </div>
    );
  };

  const renderClients = () => {
    const clients = metrics.current.clientStats;
    const previousClients = metrics.previous.clientStats || [];
    const newClients = metrics.current.memberStats?.newCount || 0;
    const previousNewClients = metrics.previous.memberStats?.newCount || 0;
    const finalConsumer = metrics.current.finalConsumerStats || { revenue: 0, salesCount: 0, averageTicket: 0 };
    const previousFinalConsumer = metrics.previous.finalConsumerStats || { revenue: 0, salesCount: 0, averageTicket: 0 };
    const topClient = clients[0] || null;
    const recurringClients = clients.filter((client) => Number(client.salesCount || 0) > 1).length;
    const previousRecurringClients = previousClients.filter((client) => Number(client.salesCount || 0) > 1).length;
    const clientRevenue = clients.reduce((sum, client) => sum + Number(client.revenue || 0), 0);
    const previousClientRevenue = previousClients.reduce((sum, client) => sum + Number(client.revenue || 0), 0);
    const clientSales = clients.reduce((sum, client) => sum + Number(client.salesCount || 0), 0);
    const previousClientSales = previousClients.reduce((sum, client) => sum + Number(client.salesCount || 0), 0);
    const clientAverageTicket = clientSales ? clientRevenue / clientSales : 0;
    const previousClientAverageTicket = previousClientSales ? previousClientRevenue / previousClientSales : 0;
    const newClientsSublabel = metrics.canComparePreviousRange
      ? `Anterior: ${formatNumber(previousNewClients)}`
      : 'Altas en el rango';
    const selectedClientType = pieSelections.clientTypes || null;
    const visibleClients = selectedClientType === 'Recurrentes'
      ? clients.filter((client) => Number(client.salesCount || 0) > 1)
      : selectedClientType === 'Una compra'
        ? clients.filter((client) => Number(client.salesCount || 0) === 1)
        : clients;
    const getClientChange = (currentValue, previousValue) => {
      if (!metrics.canComparePreviousRange) return null;
      const currentNumber = Number(currentValue || 0);
      const previousNumber = Number(previousValue || 0);
      if (!currentNumber && !previousNumber) return null;
      return calculatePercentageChange(currentNumber, previousNumber);
    };

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            label="Socios nuevos"
            value={formatNumber(newClients)}
            sublabel={newClientsSublabel}
            change={getClientChange(newClients, previousNewClients)}
            tone="emerald"
            hint="Cuenta socios por fecha de alta. En rangos comparables usa el periodo anterior equivalente; en 30 dias son los 30 dias previos."
          />
          <MetricCard label="Socios con compras" value={formatNumber(clients.length)} sublabel="En el rango" change={getClientChange(clients.length, previousClients.length)} tone="sky" />
          <MetricCard label="Recurrentes" value={formatNumber(recurringClients)} sublabel="Mas de una compra" change={getClientChange(recurringClients, previousRecurringClients)} tone="emerald" />
          <MetricCard label="Ingreso socios" value={<FancyPrice amount={clientRevenue} />} sublabel="Total asociado" change={getClientChange(clientRevenue, previousClientRevenue)} tone="violet" />
          <MetricCard label="Ticket socio" value={<FancyPrice amount={clientAverageTicket} />} sublabel="Promedio" change={getClientChange(clientAverageTicket, previousClientAverageTicket)} tone="amber" />
          <MetricCard label="CONSUMIDOR FINAL" value={<FancyPrice amount={finalConsumer.revenue} />} sublabel={`${formatNumber(finalConsumer.salesCount)} ventas sin socio`} change={getClientChange(finalConsumer.revenue, previousFinalConsumer.revenue)} tone="rose" />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          {topClient && (
            <Panel title="Socio destacado" icon={Users}>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-100 bg-sky-50 px-4 py-3">
                <div className="min-w-0">
                  <p title={topClient.name} className="truncate text-base font-black text-slate-900">{topClient.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Ultima compra: {topClient.lastDateLabel}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-right">
                  <div className="rounded-lg bg-white px-3 py-2">
                    <p className="text-[9px] font-black uppercase text-slate-400">Ventas</p>
                    <p className="text-sm font-black text-slate-800">{formatNumber(topClient.salesCount)}</p>
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2">
                    <p className="text-[9px] font-black uppercase text-slate-400">Ingreso</p>
                    <p className="text-sm font-black text-sky-700"><FancyPrice amount={topClient.revenue} /></p>
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2">
                    <p className="text-[9px] font-black uppercase text-slate-400">Ticket</p>
                    <p className="text-sm font-black text-amber-700"><FancyPrice amount={topClient.averageTicket} /></p>
                  </div>
                </div>
              </div>
            </Panel>
          )}
          <Panel title="Tipo de socios" icon={Users}>
            <PieMetricPanel
              data={[
                { name: 'Recurrentes', value: recurringClients },
                { name: 'Una compra', value: Math.max(clients.length - recurringClients, 0) },
              ].filter((item) => item.value > 0)}
              height={220}
              selectedName={selectedClientType}
              onSelectionChange={(name) => updatePieSelection('clientTypes', name)}
            />
          </Panel>
        </div>

        <Panel title="Ventas por socio" icon={Users}>
          <Table
            emptyText="Sin socios para estos filtros."
            columns={[
              { key: 'name', label: 'Socio' },
              { key: 'salesCount', label: 'Ventas', align: 'right', render: (row) => formatNumber(row.salesCount) },
              { key: 'revenue', label: 'Ingreso', align: 'right', render: (row) => <FancyPrice amount={row.revenue} /> },
              { key: 'averageTicket', label: 'Ticket prom.', align: 'right', render: (row) => <FancyPrice amount={row.averageTicket} /> },
              { key: 'lastDateLabel', label: 'Ultima compra', align: 'right' },
            ]}
            rows={visibleClients}
          />
        </Panel>
      </div>
    );
  };

  const renderStock = () => {
    const selectedStockStatus = pieSelections.stock || null;
    const stockPieData = [
      { name: 'Sin stock', value: metrics.stockStats.outOfStock.length },
      { name: 'Bajo stock', value: metrics.stockStats.lowStock.length },
      { name: 'Por vencer', value: metrics.stockStats.expiring.length },
      {
        name: 'Stock OK',
        value: Math.max(
          metrics.stockStats.activeProducts
            - metrics.stockStats.outOfStock.length
            - metrics.stockStats.lowStock.length
            - metrics.stockStats.expiring.length,
          0,
        ),
      },
    ].filter((item) => item.value > 0);
    const showStockPanel = (name) => !selectedStockStatus || selectedStockStatus === name;

    return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard label="Productos activos" value={formatNumber(metrics.stockStats.activeProducts)} sublabel="Catálogo actual" />
        <MetricCard label="Sin stock" value={formatNumber(metrics.stockStats.outOfStock.length)} sublabel="Requieren reposición" tone="rose" />
        <MetricCard label="Bajo stock" value={formatNumber(metrics.stockStats.lowStock.length)} sublabel="Menos de 10 unidades" tone="amber" />
        <MetricCard label="Por vencer" value={formatNumber(metrics.stockStats.expiring.length)} sublabel="Ventana de 14 días" tone="violet" />
      </div>
      <Panel title="Estado del stock" icon={PackageSearch}>
        <PieMetricPanel
          data={stockPieData}
          height={240}
          selectedName={selectedStockStatus}
          onSelectionChange={(name) => updatePieSelection('stock', name)}
        />
      </Panel>
      <div className={`grid grid-cols-1 gap-4 ${selectedStockStatus ? '' : 'xl:grid-cols-3'}`}>
        {showStockPanel('Sin stock') && <Panel title="Sin stock" icon={PackageSearch}>
          <Table
            emptyText="Sin productos agotados."
            columns={[
              { key: 'title', label: 'Producto' },
              { key: 'stock', label: 'Stock', align: 'right', render: (row) => formatNumber(row.stock) },
            ]}
            rows={metrics.stockStats.outOfStock.slice(0, 30)}
          />
        </Panel>}
        {showStockPanel('Bajo stock') && <Panel title="Bajo stock" icon={PackageSearch}>
          <Table
            emptyText="Sin alertas de bajo stock."
            columns={[
              { key: 'title', label: 'Producto' },
              { key: 'stock', label: 'Stock', align: 'right', render: (row) => formatNumber(row.stock) },
            ]}
            rows={metrics.stockStats.lowStock.slice(0, 30)}
          />
        </Panel>}
        {showStockPanel('Por vencer') && <Panel title="Vencimientos" icon={AlertTriangle}>
          <Table
            emptyText="Sin vencimientos cercanos."
            columns={[
              { key: 'title', label: 'Producto' },
              { key: 'daysUntil', label: 'Días', align: 'right', render: (row) => row.daysUntil },
            ]}
            rows={metrics.stockStats.expiring.slice(0, 30)}
          />
        </Panel>}
        {selectedStockStatus === 'Stock OK' && (
          <Panel title="Stock disponible" icon={PackageSearch}>
            <div className="metrics-pie-local-summary">
              <span>Productos sin alertas activas</span>
              <strong>{formatNumber(stockPieData.find((item) => item.name === 'Stock OK')?.value || 0)}</strong>
              <small>No se genera una lista adicional para productos en estado normal.</small>
            </div>
          </Panel>
        )}
      </div>
    </div>
    );
  };

  const renderOrders = () => {
    const selectedOrderStatus = pieSelections.orders || null;
    const visibleOrderRows = selectedOrderStatus
      ? metrics.orderStats.byStatus.filter((row) => row.name === selectedOrderStatus)
      : metrics.orderStats.byStatus;

    return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <MetricCard label="Pedidos" value={formatNumber(metrics.orderStats.ordersCount)} sublabel={<FancyPrice amount={metrics.orderStats.totalOrders} />} tone="sky" />
        <MetricCard label="Presupuestos" value={formatNumber(metrics.orderStats.budgetsCount)} sublabel={<FancyPrice amount={metrics.orderStats.totalBudgets} />} tone="violet" />
        <MetricCard label="Saldo pendiente" value={<FancyPrice amount={metrics.orderStats.pendingAmount} />} sublabel="Por cobrar" tone="amber" />
        <MetricCard label="Conversion" value={`${formatNumber(metrics.orderStats.conversionRate, 1)}%`} sublabel="Presupuesto a pedido" tone="emerald" />
      </div>
      <Panel title="Pedidos por estado" icon={FileText}>
        <PieMetricPanel
          data={metrics.orderStats.byStatus.filter((row) => Number(row.total || 0) > 0)}
          dataKey="total"
          height={240}
          valueType="currency"
          selectedName={selectedOrderStatus}
          onSelectionChange={(name) => updatePieSelection('orders', name)}
          getSecondaryText={(entry) => `${formatNumber(entry.count)} pedidos`}
        />
        <Table
          emptyText="Sin pedidos para estos filtros."
          columns={[
            { key: 'name', label: 'Estado' },
            { key: 'count', label: 'Pedidos', align: 'right', render: (row) => formatNumber(row.count) },
            { key: 'total', label: 'Total', align: 'right', render: (row) => <FancyPrice amount={row.total} /> },
            { key: 'pending', label: 'Pendiente', align: 'right', render: (row) => <FancyPrice amount={row.pending} /> },
          ]}
          rows={visibleOrderRows}
        />
      </Panel>
    </div>
    );
  };

  const renderUsers = () => {
    const selectedUserName = pieSelections.users || null;
    const visibleUserRows = selectedUserName
      ? metrics.current.userStats.filter((row) => row.name === selectedUserName)
      : metrics.current.userStats;
    const selectedUserRecentSales = selectedUserName
      ? metrics.current.filteredTransactions
        .filter((tx) => normalizeMetricText(getMetricUserLabel(tx)) === normalizeMetricText(selectedUserName))
        .map((tx) => ({ ...tx, metricSortDate: parseMetricDate(tx) }))
        .sort((a, b) => (b.metricSortDate?.getTime?.() || 0) - (a.metricSortDate?.getTime?.() || 0))
        .slice(0, 8)
      : [];

    return (
    <div className="space-y-4">
      <StatStrip
        items={[
          { label: 'Usuarios activos', value: formatNumber(metrics.current.userStats.length), sub: 'Con ventas', tone: 'border-sky-200 bg-sky-50 text-sky-700' },
          { label: 'Top usuario', value: metrics.current.userStats[0]?.name || '-', sub: 'Mayor ingreso', tone: 'border-violet-200 bg-violet-50 text-violet-700' },
          { label: 'Ingreso top', value: <FancyPrice amount={metrics.current.userStats[0]?.revenue || 0} />, sub: 'Usuario lider', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
          { label: 'Ventas top', value: formatNumber(metrics.current.userStats[0]?.salesCount || 0), sub: 'Tickets', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
        ]}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="Participacion por usuario" icon={ShieldCheck}>
          <PieMetricPanel
            data={metrics.current.userStats.filter((row) => Number(row.revenue || 0) > 0)}
            dataKey="revenue"
            height={260}
            valueType="currency"
            selectedName={selectedUserName}
            onSelectionChange={(name) => updatePieSelection('users', name)}
            getSecondaryText={(entry) => `${formatNumber(entry.salesCount)} ventas`}
          />
        </Panel>
        <Panel title="Rendimiento por usuario" icon={ShieldCheck}>
          <Table
            emptyText="Sin usuarios para estos filtros."
            columns={[
              { key: 'name', label: 'Usuario' },
              { key: 'salesCount', label: 'Ventas', align: 'right', render: (row) => formatNumber(row.salesCount) },
              { key: 'revenue', label: 'Ingreso', align: 'right', render: (row) => <FancyPrice amount={row.revenue} /> },
              { key: 'averageTicket', label: 'Ticket prom.', align: 'right', render: (row) => <FancyPrice amount={row.averageTicket} /> },
              ...(canViewProfit ? [{ key: 'profit', label: 'Resultado', align: 'right', render: (row) => <FancyPrice amount={row.profit} /> }] : []),
            ]}
            rows={visibleUserRows}
          />
        </Panel>
      </div>
      {selectedUserName && (
        <Panel
          title={`Ultimas ventas de ${selectedUserName}`}
          icon={ShoppingBag}
          hint="Ventas ya filtradas por el rango activo y el usuario seleccionado."
        >
          <Table
            emptyText="Sin ventas recientes para este usuario en el rango activo."
            columns={[
              {
                key: 'date',
                label: 'Fecha',
                render: (row) => (
                  row.metricSortDate
                    ? `${row.metricSortDate.toLocaleDateString('es-AR')} ${row.metricSortDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
                    : `${row.date || '-'} ${row.time || row.timestamp || ''}`.trim()
                ),
              },
              { key: 'id', label: 'Ticket', render: (row) => `#${String(row.id || row.number || '-').padStart(4, '0')}` },
              { key: 'paymentMethod', label: 'Pago', render: (row) => row.paymentMethod || row.payment || 'Sin dato' },
              { key: 'items', label: 'Items', align: 'right', render: (row) => formatNumber(getMetricTransactionItemCount(row)) },
              { key: 'total', label: 'Total', align: 'right', render: (row) => <FancyPrice amount={getMetricTransactionTotal(row)} /> },
            ]}
            rows={selectedUserRecentSales}
          />
        </Panel>
      )}
    </div>
    );
  };

  const renderCash = () => {
    const selectedClosureType = pieSelections.cash || null;
    const closureTypeData = [
      { name: 'Manual', count: metrics.closureStats.manual },
      { name: 'Automatico', count: metrics.closureStats.automatic },
    ].filter((item) => item.count > 0);
    const visibleClosureTypes = selectedClosureType
      ? closureTypeData.filter((item) => item.name === selectedClosureType)
      : closureTypeData;

    return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <MetricCard label="Cierres" value={formatNumber(metrics.closureStats.count)} sublabel={`${metrics.closureStats.manual} manuales / ${metrics.closureStats.automatic} auto`} />
        <MetricCard label="Ventas cerradas" value={<FancyPrice amount={metrics.closureStats.totalSales} />} sublabel="Segun reportes" tone="sky" />
        <MetricCard label="Ganancia cierre" value={<FancyPrice amount={metrics.closureStats.netProfit} />} sublabel="Segun reportes" tone="emerald" hidden={!canViewProfit} />
        <MetricCard label="Ticket cierre" value={<FancyPrice amount={metrics.closureStats.averageTicket} />} sublabel="Promedio de cierres" tone="amber" />
      </div>
      <Panel title="Actividad de caja" icon={CalendarDays}>
        <PieMetricPanel
          data={closureTypeData}
          dataKey="count"
          height={220}
          selectedName={selectedClosureType}
          onSelectionChange={(name) => updatePieSelection('cash', name)}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visibleClosureTypes.map((item) => (
            <div key={item.name} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{item.name}</p>
              <p className="mt-1 text-2xl font-black text-slate-800">{formatNumber(item.count)}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
    );
  };

  const renderActiveSection = () => {
    if (isModernMode && !MODERN_SECTION_IDS.has(activeSection)) return renderModernSummary();

    switch (activeSection) {
      case 'summary': return isModernMode ? renderModernSummary() : renderSummary();
      case 'sales': return renderSales();
      case 'profit': return canViewProfit ? renderProfit() : (isModernMode ? renderModernSummary() : renderSummary());
      case 'products': return renderProducts();
      case 'categories': return renderCategories();
      case 'payments': return renderPayments();
      case 'clients': return canViewClients ? renderClients() : (isModernMode ? renderModernSummary() : renderSummary());
      case 'stock': return renderStock();
      case 'orders': return renderOrders();
      case 'users': return canViewUsers ? renderUsers() : (isModernMode ? renderModernSummary() : renderSummary());
      case 'cash': return renderCash();
      default: return isModernMode ? renderModernSummary() : renderSummary();
    }
  };

  if (isProfitControlMode) {
    return renderProfitControlMode();
  }

  if (isModernMode) {
    return (
      <div className="metrics-view metrics-view-modern flex h-full min-h-0 flex-col bg-slate-100">
        {renderModernHeader()}
        <div className={`metrics-modern-backdrop ${isModernControlOpen ? 'is-open' : ''}`} onClick={() => setIsModernControlOpen(false)} />
        <div className="metrics-modern-shell">
          {renderModernSidebar()}
          <main className="metrics-modern-content custom-scrollbar">
            <div className="rebu-content-frame pb-8">
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
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="metrics-view flex h-full min-h-0 flex-col bg-slate-100">
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
              {renderModeSwitch()}
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
              <option value="yesterday">Ayer</option>
              <option value="3d">Últimos 3 días</option>
              <option value="7d">Últimos 7 días</option>
              <option value="14d">Últimas 2 semanas</option>
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
              {visibleProductOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
        <div className="rebu-content-frame pb-8">
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
