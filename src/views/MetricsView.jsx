import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
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
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
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
const WEEKDAY_SEQUENCE = [
  { key: 'lun', label: 'Lun' },
  { key: 'mar', label: 'Mar' },
  { key: 'mie', label: 'Mié' },
  { key: 'jue', label: 'Jue' },
  { key: 'vie', label: 'Vie' },
  { key: 'sab', label: 'Sáb' },
  { key: 'dom', label: 'Dom' },
];
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

const RANGE_FILTER_OPTIONS = [
  { value: 'today', label: 'Hoy', helper: 'Caja actual' },
  { value: 'yesterday', label: 'Ayer', helper: 'Día anterior' },
  { value: '3d', label: '3 días', helper: 'Corto' },
  { value: '7d', label: '7 días', helper: 'Semana' },
  { value: '14d', label: '2 semanas', helper: 'Quincena' },
  { value: '30d', label: '30 días', helper: 'Mes' },
  { value: '90d', label: '90 días', helper: 'Trimestre' },
  { value: 'year', label: 'Año', helper: 'Actual' },
  { value: 'all', label: 'Todo', helper: 'Histórico' },
  { value: 'custom', label: 'Manual', helper: 'Fechas' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'completed', label: 'Completadas' },
  { value: 'voided', label: 'Anuladas' },
  { value: 'deleted', label: 'Eliminadas' },
  { value: 'restored', label: 'Restauradas' },
];

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
    : 'Sin comparación anterior';

const BASE_SECTIONS = [
  { id: 'summary', label: 'Resumen', icon: BarChart3, group: 'overview', question: '¿Cómo terminó el período y qué requiere atención?' },
  { id: 'sales', label: 'Ventas', icon: TrendingUp, group: 'sales', question: '¿Cuándo se vende y cómo cambia el ritmo?' },
  { id: 'products', label: 'Productos', icon: ShoppingBag, group: 'sales', question: '¿Qué productos explican el ingreso y el margen?' },
  { id: 'categories', label: 'Categorías', icon: Boxes, group: 'sales', question: '¿Qué familias de productos sostienen el resultado?' },
  { id: 'payments', label: 'Pagos', icon: CreditCard, group: 'sales', question: '¿Cómo se cobra y dónde se concentra el dinero?' },
  { id: 'clients', label: 'Socios', icon: Users, group: 'sales', question: '¿Quién vuelve, cuánto aporta y con qué frecuencia?', permission: 'metrics.viewClients' },
  { id: 'profit', label: 'Ganancias', icon: WalletCards, group: 'control', question: '¿Qué queda después de costos y gastos?', permission: 'metrics.viewProfit' },
  { id: 'stock', label: 'Stock', icon: PackageSearch, group: 'control', question: '¿Dónde está el capital y qué necesita reposición?' },
  { id: 'orders', label: 'Pedidos', icon: FileText, group: 'control', question: '¿Qué trabajo pendiente puede convertirse en cobro?' },
  { id: 'cash', label: 'Caja', icon: CalendarDays, group: 'control', question: '¿Qué pasó en caja y en sus cierres?' },
  { id: 'users', label: 'Usuarios', icon: ShieldCheck, group: 'team', question: '¿Cómo se distribuye el desempeño del equipo?', permission: 'metrics.viewUsers' },
];

const SECTION_GROUPS = [
  { id: 'overview', label: 'Panorama' },
  { id: 'sales', label: 'Venta' },
  { id: 'control', label: 'Control' },
  { id: 'team', label: 'Equipo' },
];

const SelectField = ({ label, value, onChange, children, className = '' }) => (
  <label className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
    <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</span>
    <select
      name={`metrics-${normalizeMetricText(label).replace(/\s+/g, '-')}`}
      autoComplete="off"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 outline-none transition focus-visible:border-fuchsia-300 focus-visible:ring-2 focus-visible:ring-fuchsia-100"
    >
      {children}
    </select>
  </label>
);

const InputField = ({ label, value, onChange, type = 'text', className = '' }) => (
  <label className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
    <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</span>
    <input
      name={`metrics-${normalizeMetricText(label).replace(/\s+/g, '-')}`}
      autoComplete="off"
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 outline-none transition focus-visible:border-fuchsia-300 focus-visible:ring-2 focus-visible:ring-fuchsia-100"
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

const MetricLensSelect = ({ label, value, onChange, children, className = '' }) => (
  <label className={`metrics-lens-select flex min-h-8 min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50/80 px-2 py-1 ${className}`}>
    <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</span>
    <select
      name={`metrics-${normalizeMetricText(label).replace(/\s+/g, '-')}`}
      autoComplete="off"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-w-0 flex-1 bg-transparent text-[11px] font-black text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-100"
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
  <section className="metrics-panel border border-slate-200 bg-white p-3">
    <div className="metrics-panel-header mb-2 flex items-center justify-between gap-3">
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
  const changeLabel = Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${formatNumber(change, 1)}%` : null;
  const isGoodChange = invertChange ? change <= 0 : change >= 0;
  const changeClass = isGoodChange ? 'is-good' : 'is-bad';

  return (
    <div className={`metrics-metric-cell metrics-metric-${tone} min-h-[78px] px-3 py-2.5`}>
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
          <span className={`metrics-change-text shrink-0 text-[10px] font-black ${changeClass}`}>
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
          Preparando gráfico…
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

const HourlyChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="metrics-chart-tooltip border border-slate-200 bg-white px-3 py-2 text-xs">
      <p className="mb-1 font-black text-slate-700">{label}</p>
      <p className="font-semibold text-violet-700">Compras: {formatNumber(row.salesCount || 0)}</p>
      <p className="font-semibold text-sky-700">Ingreso: {formatCurrency(row.revenue || 0)}</p>
      <p className="mt-1 text-[10px] font-semibold text-slate-500">
        Ticket medio: {formatCurrency(row.salesCount ? row.revenue / row.salesCount : 0)}
      </p>
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
                className={`${isInteractive ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-200' : ''} ${selected ? 'bg-fuchsia-50/80' : 'hover:bg-slate-50'}`}
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
  <div className={`metrics-stat-strip grid grid-cols-1 sm:grid-cols-2 ${
    items.length === 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'
  }`}>
    {items.map((item) => (
            <div
              key={item.label}
              title={typeof item.value === 'string' ? item.value : undefined}
              className={`metrics-stat-cell border-slate-200 px-3 py-2 ${item.tone || 'text-slate-700'}`}
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
            Preparando gráfico…
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
    ['Resumen', 'Bolsitas cobradas', metrics.current.posBagStats?.count || 0],
    ['Resumen', 'Ingreso por bolsitas', metrics.current.posBagStats?.revenue || 0],
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
  isLoading: _isLoading = false,
  isProfitSyncing: _isProfitSyncing = false,
  emptyStateMessage: _emptyStateMessage = '',
  onRefresh,
  isActive: _isActive = true,
}) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeSection, setActiveSection] = useState('summary');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [summaryEvolutionMetrics, setSummaryEvolutionMetrics] = useState(['revenue']);
  const [pieSelections, setPieSelections] = useState({});
  const [productLookupQuery, setProductLookupQuery] = useState('');
  const contentScrollRef = useRef(null);

  const canViewProfit = hasPermission(currentUser, 'metrics.viewProfit');
  const canViewUsers = hasPermission(currentUser, 'metrics.viewUsers');
  const canViewClients = hasPermission(currentUser, 'metrics.viewClients');
  const canExport = hasPermission(currentUser, 'metrics.export');

  useEffect(() => {
    setSummaryEvolutionMetrics((current) => {
      const next = current.filter((metric) => canViewProfit || metric !== 'profit');
      return next.length ? next : ['revenue'];
    });
  }, [canViewProfit]);

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

  const sections = useMemo(() => {
    return BASE_SECTIONS.filter((section) => !section.permission || hasPermission(currentUser, section.permission));
  }, [currentUser]);
  const sectionGroups = useMemo(() => SECTION_GROUPS.map((group) => ({
    ...group,
    sections: sections.filter((section) => section.group === group.id),
  })).filter((group) => group.sections.length), [sections]);
  const activeSectionMeta = sections.find((section) => section.id === activeSection) || sections[0] || BASE_SECTIONS[0];
  const activeSectionGroup = SECTION_GROUPS.find((group) => group.id === activeSectionMeta.group) || SECTION_GROUPS[0];

  useEffect(() => {
    if (sections.some((section) => section.id === activeSection)) return;
    setActiveSection('summary');
  }, [activeSection, sections]);

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0 });
  }, [activeSection]);

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

  const handleCsvExport = () => {
    exportCsv('metricas-rebu.csv', buildCsvRows({ metrics, canViewProfit, canViewUsers, canViewClients }));
  };

  const handlePdfExport = () => {
    window.print();
  };

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
    const fullDay = Array.from({ length: 24 }, (_, hour) => {
      const key = String(hour).padStart(2, '0');
      const row = rowsByHour.get(key) || {};
      return {
        key,
        label: `${key}:00`,
        salesCount: Number(row.salesCount || 0),
        revenue: Number(row.revenue || 0),
      };
    });

    const activeHours = fullDay
      .map((row, index) => (row.salesCount > 0 || row.revenue > 0 ? index : -1))
      .filter((index) => index >= 0);
    if (!activeHours.length) return fullDay.slice(8, 22);

    const firstHour = Math.max(0, activeHours[0] - 1);
    const lastHour = Math.min(23, activeHours[activeHours.length - 1] + 1);
    return fullDay.slice(firstHour, lastHour + 1);
  }, [metrics]);
  const showHourlyPulse =
    hourlyPulseSeries.some((row) => Number(row.salesCount || 0) > 0);
  const hourlyPeak = hourlyPulseSeries.reduce((best, row) => (
    Number(row.salesCount || 0) > Number(best?.salesCount || 0) ? row : best
  ), null);
  const hourlySalesTotal = hourlyPulseSeries.reduce((sum, row) => sum + Number(row.salesCount || 0), 0);
  const hourlyPeakShare = hourlySalesTotal && hourlyPeak
    ? (Number(hourlyPeak.salesCount || 0) / hourlySalesTotal) * 100
    : 0;
  const weeklyRhythmSeries = useMemo(() => {
    const rowsByWeekday = new Map((metrics.current.weekdayStats || []).map((row) => [
      normalizePieName(row.key || row.label).slice(0, 3),
      row,
    ]));
    return WEEKDAY_SEQUENCE.map((weekday) => {
      const row = rowsByWeekday.get(weekday.key) || {};
      return {
        key: weekday.key,
        label: weekday.label,
        salesCount: Number(row.salesCount || 0),
        revenue: Number(row.revenue || 0),
      };
    });
  }, [metrics]);

  const renderSummary = () => {
    const stats = metrics.current.stats;
    const revenue = Number(stats.revenue || 0);
    const cost = Number(stats.cost || 0);
    const expensesTotal = Number(stats.expenses || 0);
    const netProfit = Number(stats.profit || 0);
    const grossProfit = revenue - cost;
    const grossMarginRate = revenue ? (grossProfit / revenue) * 100 : 0;
    const netMarginRate = revenue ? (netProfit / revenue) * 100 : 0;
    const costRate = revenue ? (cost / revenue) * 100 : 0;

    const profitControlInsight = !canViewProfit
      ? null
      : isProfitUnverified
        ? {
            tone: 'warning',
            title: 'Costos de inventario pendientes de verificación',
            text: 'Hay productos vendidos sin costo cargado en el inventario. El margen y rentabilidad son estimados.',
          }
        : netProfit < 0 && expensesTotal > revenue
          ? {
              tone: 'danger',
              title: 'Gastos por encima de los ingresos',
              text: `Los egresos registrados (${formatCurrency(expensesTotal)}) superan las ventas cobradas (${formatCurrency(revenue)}) en este período.`,
            }
          : netProfit < 0
            ? {
                tone: 'danger',
                title: 'Resultado de caja negativo',
                text: `Los gastos registrados dejan la caja ${formatCurrency(Math.abs(netProfit))} por debajo de lo cobrado. Conviene revisar los egresos del período.`,
              }
            : netMarginRate < 8
              ? {
                  tone: 'warning',
                  title: 'Margen operativo ajustado',
                  text: `Queda un ${formatNumber(netMarginRate, 1)}% (${formatCurrency(netProfit)}) sobre lo cobrado. Margen estrecho frente a imprevistos.`,
                }
              : {
                  tone: 'success',
                  title: 'Caja operativa positiva',
                  text: `Después de los gastos registrados queda un ${formatNumber(netMarginRate, 1)}% de lo cobrado (${formatCurrency(netProfit)}). El margen de mercadería se muestra por separado.`,
                };

    const topProduct = metrics.current.productStats[0] || null;
    const strongestPeriod = metrics.current.dailySeries.reduce((best, row) => (
      Number(row.revenue || 0) > Number(best?.revenue || 0) ? row : best
    ), null);
    const topPayment = metrics.current.paymentStats[0] || null;
    const paymentTotal = metrics.current.paymentStats.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const topPaymentShare = paymentTotal && topPayment ? (Number(topPayment.value || 0) / paymentTotal) * 100 : 0;
    const topProductShare = revenue && topProduct ? (Number(topProduct.revenue || 0) / revenue) * 100 : 0;
    const summarySignals = [
      {
        label: 'Mejor tramo',
        value: strongestPeriod?.label || '-',
        detail: strongestPeriod ? `${formatCurrency(strongestPeriod.revenue)} · pico ${hourlyPeak?.label || 'sin hora'}` : 'Sin ventas',
        section: 'sales',
      },
      {
        label: 'Cobro dominante',
        value: topPayment?.name || '-',
        detail: topPayment ? `${formatNumber(topPaymentShare, 1)}% · ${formatCurrency(topPayment.value)}` : 'Sin pagos',
        section: 'payments',
      },
      {
        label: 'Producto líder',
        value: topProduct?.name || '-',
        detail: topProduct ? `${formatNumber(topProductShare, 1)}% del ingreso · ${formatNumber(topProduct.qty)} ${topProduct.type === 'weight' ? 'g' : 'un.'}` : 'Sin productos',
        section: 'products',
      },
    ];
    const allowedSectionIds = new Set(sections.map((section) => section.id));
    const guidedRecommendations = metrics.recommendations
      .filter((item) => !item.section || allowedSectionIds.has(item.section))
      .slice(0, 3);
    const recommendationRows = guidedRecommendations.length
      ? guidedRecommendations
      : [{ title: 'Sin alertas críticas', detail: 'Los indicadores del período no requieren atención inmediata.', tone: 'success', section: null }];

    return (
      <div className="metrics-summary space-y-4">
        {profitControlInsight && (
          <section className={`metrics-diagnostic-line is-${profitControlInsight.tone}`}>
            {profitControlInsight.tone === 'success' ? <Sparkles size={15} /> : <AlertTriangle size={15} />}
            <strong>{profitControlInsight.title}</strong>
            <span>{profitControlInsight.text}</span>
          </section>
        )}

        <section className="metrics-reading-band" aria-label="Lectura principal del período">
          <div className="metrics-reading-primary">
            <span>Ingreso bruto</span>
            <strong><FancyPrice amount={revenue} /></strong>
            <small>{metrics.range.label}</small>
          </div>
          {canViewProfit && (
            <div>
              <span>Margen mercadería</span>
              <strong><FancyPrice amount={grossProfit} /></strong>
              <small>{formatNumber(grossMarginRate, 1)}% antes de gastos</small>
            </div>
          )}
          <div>
            <span>Resultado de caja</span>
            <strong>{canViewProfit ? (profitStatusLabel || <FancyPrice amount={netProfit} />) : 'Restringido'}</strong>
            <small>{canViewProfit ? `${formatNumber(netMarginRate, 1)}% sobre lo cobrado` : 'Permiso requerido'}</small>
          </div>
          <div>
            <span>Compras</span>
            <strong>{formatNumber(stats.salesCount)}</strong>
            <small>tickets emitidos</small>
          </div>
          <div>
            <span>Ticket medio</span>
            <strong><FancyPrice amount={stats.averageTicket} /></strong>
            <small>{Number.isFinite(metrics.changes.averageTicket) ? `${metrics.changes.averageTicket >= 0 ? '+' : ''}${formatNumber(metrics.changes.averageTicket, 1)}% vs. anterior` : 'sin comparación'}</small>
          </div>
        </section>

        {canViewProfit && (
          <section className="metrics-cash-equation" aria-label="Composición de caja">
            <div className="metrics-equation-title">
              <WalletCards size={15} />
              <span>Composición de caja</span>
            </div>
            <div><small>Cobrado</small><strong><FancyPrice amount={revenue} /></strong></div>
            <b aria-hidden="true">−</b>
            <div><small>Gastos registrados</small><strong><FancyPrice amount={expensesTotal} /></strong></div>
            <b aria-hidden="true">=</b>
            <div className={netProfit >= 0 ? 'is-positive' : 'is-negative'}><small>Resultado</small><strong><FancyPrice amount={netProfit} /></strong></div>
            <p>Costo vendido: <strong>{formatCurrency(cost)}</strong> ({formatNumber(costRate, 1)}% del ingreso), usado para leer margen de mercadería.</p>
          </section>
        )}

        <section className="metrics-guided-reading" aria-labelledby="metrics-guided-reading-title">
          <header>
            <Sparkles size={15} aria-hidden="true" />
            <div>
              <h3 id="metrics-guided-reading-title">Cómo leer este período</h3>
              <p>Seguí las señales para pasar del resultado al detalle que lo explica.</p>
            </div>
          </header>
          <div className="metrics-insight-line">
            <div className="metrics-summary-patterns">
              {summarySignals.map((signal) => {
                const targetSection = sections.find((section) => section.id === signal.section);
                return (
                  <button
                    key={signal.label}
                    type="button"
                    onClick={() => setActiveSection(signal.section)}
                    aria-label={`${signal.label}: ${signal.value}. Abrir ${targetSection?.label || 'detalle'}`}
                  >
                    <span>{signal.label}</span>
                    <strong title={signal.value}>{signal.value}</strong>
                    <small>{signal.detail}</small>
                    <em>Ver {targetSection?.label || 'detalle'} <ArrowRight size={11} aria-hidden="true" /></em>
                  </button>
                );
              })}
            </div>
            <div className="metrics-recommendations">
              <div className="metrics-recommendations-title">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>Próximas decisiones</span>
              </div>
              {recommendationRows.map((item, index) => {
                const targetSection = item.section ? sections.find((section) => section.id === item.section) : null;
                const content = (
                  <>
                    <i aria-hidden="true" />
                    <p>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                      {targetSection && <em>Revisar {targetSection.label} <ArrowRight size={11} aria-hidden="true" /></em>}
                    </p>
                  </>
                );
                return targetSection ? (
                  <button
                    key={`${item.title}-${index}`}
                    type="button"
                    className={`is-${item.tone || 'info'}`}
                    onClick={() => setActiveSection(targetSection.id)}
                    aria-label={`${item.title}. Revisar ${targetSection.label}`}
                  >
                    {content}
                  </button>
                ) : (
                  <div key={`${item.title}-${index}`} className={`is-${item.tone || 'info'}`}>{content}</div>
                );
              })}
            </div>
          </div>
        </section>

        <div className="metrics-analysis-grid">
          <section className="metrics-chart-section">
            <header>
              <div>
                <p>Evolución del período</p>
                <span>Ingreso, resultado y gastos por {periodUnit}</span>
              </div>
              <div className="metrics-series-controls" role="group" aria-label="Series visibles">
                {summaryEvolutionOptions.map((option) => {
                  const isSelected = summaryEvolutionMetrics.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleSummaryEvolutionMetric(option.id)}
                      className={isSelected ? 'is-active' : ''}
                      aria-pressed={isSelected}
                    >
                      <i style={{ backgroundColor: option.color }} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </header>
            {metrics.current.dailySeries.length ? (
              <ChartFrame height={300}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.current.dailySeries} margin={{ top: 8, right: 10, left: 2, bottom: 0 }}>
                    <defs>
                      {summaryEvolutionOptions.map((option) => (
                        <linearGradient key={option.id} id={`metrics-${option.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="4%" stopColor={option.color} stopOpacity={0.2} />
                          <stop offset="96%" stopColor={option.color} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid vertical={false} stroke="#dbe5ef" strokeOpacity={0.72} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} stroke="#7c8da3" minTickGap={18} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} stroke="#7c8da3" tickFormatter={(value) => `$${formatNumber(value)}`} width={66} />
                    <Tooltip content={<EvolutionChartTooltip />} cursor={{ stroke: '#94a3b8', strokeOpacity: 0.35 }} />
                    {activeEvolutionOptions.map((option) => (
                      <Area
                        key={option.id}
                        type="monotone"
                        dataKey={option.id}
                        name={option.label}
                        stroke={option.color}
                        fill={`url(#metrics-${option.id})`}
                        strokeWidth={2.2}
                        dot={false}
                        activeDot={{ r: 3.5 }}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </ChartFrame>
            ) : <EmptyState />}
          </section>

          <section className="metrics-chart-section metrics-hourly-section">
            <header>
              <div>
                <p>Compras por hora</p>
                <span>{isHourlyMode ? 'Ritmo de la jornada seleccionada' : 'Patrón acumulado del período'}</span>
              </div>
            </header>
            {showHourlyPulse ? (
              <>
                <div className="metrics-hourly-reading">
                  <div><span>Hora pico</span><strong>{hourlyPeak?.label || '-'}</strong></div>
                  <div><span>Compras</span><strong>{formatNumber(hourlyPeak?.salesCount || 0)}</strong></div>
                  <div><span>Peso del pico</span><strong>{formatNumber(hourlyPeakShare, 1)}%</strong></div>
                </div>
                <ChartFrame height={238}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={hourlyPulseSeries} margin={{ top: 12, right: 4, left: -16, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#dbe5ef" strokeOpacity={0.72} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} stroke="#7c8da3" interval="preserveStartEnd" minTickGap={8} />
                      <YAxis yAxisId="sales" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10 }} stroke="#7c8da3" />
                      <YAxis yAxisId="revenue" orientation="right" hide />
                      <Tooltip content={<HourlyChartTooltip />} cursor={{ fill: 'rgba(139, 92, 246, 0.06)' }} />
                      <Bar yAxisId="sales" dataKey="salesCount" name="Compras" fill="#8b5cf6" fillOpacity={0.72} radius={[3, 3, 0, 0]} maxBarSize={24} />
                      <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Ingreso" stroke="#0ea5e9" strokeWidth={2} dot={false} activeDot={{ r: 3.5 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartFrame>
                <p className="metrics-chart-footnote">Barras: cantidad de compras · línea: ingreso</p>
              </>
            ) : <EmptyState text="Sin compras para construir el patrón horario." />}
          </section>
        </div>

      </div>
    );
  };

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
      <div className={`grid grid-cols-1 gap-4 ${isHourlyMode ? '' : 'xl:grid-cols-[1.25fr_0.75fr]'}`}>
        <Panel title={isHourlyMode ? 'Ritmo por horario' : 'Ritmo de ventas'} icon={TrendingUp}>
          <AreaMetricPanel
            data={metrics.current.dailySeries}
            areas={[{ key: 'revenue', label: 'Ingreso', color: '#0ea5e9' }]}
            height={280}
          />
        </Panel>
        {!isHourlyMode && (
          <Panel title="Ritmo por día de la semana" icon={CalendarDays} hint="Acumula todas las compras del rango por día de la semana para revelar patrones repetidos.">
            <ChartFrame height={280}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={weeklyRhythmSeries} margin={{ top: 12, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#dbe5ef" strokeOpacity={0.72} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} stroke="#7c8da3" />
                  <YAxis yAxisId="sales" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10 }} stroke="#7c8da3" />
                  <YAxis yAxisId="revenue" orientation="right" hide />
                  <Tooltip content={<HourlyChartTooltip />} cursor={{ fill: 'rgba(139, 92, 246, 0.06)' }} />
                  <Bar yAxisId="sales" dataKey="salesCount" name="Compras" fill="#8b5cf6" fillOpacity={0.68} radius={[3, 3, 0, 0]} maxBarSize={34} />
                  <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Ingreso" stroke="#0ea5e9" strokeWidth={2} dot={false} activeDot={{ r: 3.5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartFrame>
            <p className="metrics-chart-footnote">Barras: compras · línea: ingreso acumulado</p>
          </Panel>
        )}
      </div>
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
            { label: 'Bolsitas', value: formatNumber(metrics.current.posBagStats?.count || 0), sub: `${formatCurrency(metrics.current.posBagStats?.revenue || 0)} cobrados`, tone: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700' },
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
                <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  name="metrics-product-search"
                  autoComplete="off"
                  type="search"
                  value={productLookupQuery}
                  onChange={(event) => setProductLookupQuery(event.target.value)}
                  placeholder="Buscar producto…"
                  aria-label="Buscar producto por nombre"
                  className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-[11px] font-bold text-slate-700 outline-none transition placeholder:text-slate-400 focus-visible:border-fuchsia-300 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-fuchsia-100"
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
          <Panel title="Tipo de producto" icon={PackageSearch}>
            {metrics.current.typeStats.length ? (
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
      <section className={`metrics-stock-valuation ${canViewProfit ? '' : 'is-restricted'}`} aria-label="Valorización del stock actual">
        <div className="metrics-stock-valuation-title">
          <WalletCards size={15} />
          <span>Capital en stock</span>
          <small>Foto actual, independiente del rango de ventas</small>
        </div>
        {canViewProfit && (
          <div>
            <span>Valor a costo</span>
            <strong><FancyPrice amount={metrics.stockStats.totalCost} /></strong>
          </div>
        )}
        <div>
          <span>Valor a venta</span>
          <strong><FancyPrice amount={metrics.stockStats.totalRetail} /></strong>
        </div>
        {canViewProfit && (
          <div className="is-projected">
            <span>Margen proyectado</span>
            <strong><FancyPrice amount={metrics.stockStats.projectedMargin} /></strong>
          </div>
        )}
      </section>
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
    switch (activeSection) {
      case 'summary': return renderSummary();
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
    <div className="metrics-view flex h-full min-h-0 flex-col bg-slate-100">
      <div className="metrics-header relative z-20 shrink-0 border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-fuchsia-600" aria-hidden="true" />
                <h2 className="text-lg font-black text-slate-900">Métricas</h2>
                <span className="metrics-header-context text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                  {metrics.range.label}
                </span>
                <span className="metrics-header-context text-[9px] font-semibold text-slate-500">
                  {getComparisonLabel(metrics)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Ventas, costos, caja, stock y diagnóstico operativo.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={!onRefresh || isRefreshing}
                className="metrics-header-action inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-black text-slate-600 transition disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} aria-hidden="true" />
                Actualizar
              </button>
              {canExport && (
                <>
                  <button type="button" onClick={handleCsvExport} className="metrics-header-action inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-black text-sky-700 transition">
                    <Download size={14} aria-hidden="true" /> CSV
                  </button>
                  <button type="button" onClick={handlePdfExport} className="metrics-header-action inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-black text-fuchsia-700 transition">
                    <Printer size={14} aria-hidden="true" /> PDF
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="metrics-filter-line border-y border-slate-200 bg-slate-50 p-2">
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
              <SlidersHorizontal size={14} aria-hidden="true" />
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

          <nav className="metrics-section-nav custom-scrollbar flex overflow-x-auto" aria-label="Áreas de análisis">
            {sectionGroups.map((group) => (
              <div key={group.id} className="metrics-section-group">
                <span className="metrics-section-group-label">{group.label}</span>
                {group.sections.map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      id={`metrics-section-tab-${section.id}`}
                      type="button"
                      onClick={() => setActiveSection(section.id)}
                      className={`metrics-section-tab inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-black transition ${isActive ? 'is-active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                      aria-controls="metrics-active-section"
                    >
                      <Icon size={14} aria-hidden="true" />
                      {section.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="metrics-section-guide" aria-live="polite">
            <span>{activeSectionGroup.label}</span>
            <strong>{activeSectionMeta.question}</strong>
          </div>
        </div>
      </div>

      <div ref={contentScrollRef} className="custom-scrollbar flex-1 overflow-y-auto p-3">
        <div
          id="metrics-active-section"
          className="rebu-content-frame pb-8"
          role="region"
          aria-labelledby={`metrics-section-tab-${activeSectionMeta.id}`}
        >
          {metrics.current.filteredTransactions.length === 0 && metrics.current.filteredExpenses.length === 0 && activeSection !== 'stock' ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
              <div className="flex items-center gap-2">
                <Search size={16} aria-hidden="true" />
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
