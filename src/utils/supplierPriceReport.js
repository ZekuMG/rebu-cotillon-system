export const SUPPLIER_PRICE_REPORT_PERIODS = Object.freeze([
  { days: 1, label: 'Últimas 24 horas', shortLabel: '24 h', fileLabel: '24 horas' },
  { days: 3, label: 'Últimos 3 días', shortLabel: '3 días', fileLabel: '3 dias' },
  { days: 7, label: 'Últimos 7 días', shortLabel: '7 días', fileLabel: '7 dias' },
  { days: 15, label: 'Últimos 15 días', shortLabel: '15 días', fileLabel: '15 dias' },
  { days: 30, label: 'Últimos 30 días', shortLabel: '30 días', fileLabel: '30 dias' },
]);

export const SUPPLIER_PRICE_REPORT_ACTIONS = Object.freeze([
  'Actualizacion Precio Proveedor',
  'Deshacer Precio Proveedor',
]);
const REPORT_ACTIONS = new Set(SUPPLIER_PRICE_REPORT_ACTIONS);
const CHANGE_EPSILON = 0.01;

const toFiniteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const calculateDelta = (previousValue, nextValue) => {
  const previous = toFiniteNumber(previousValue);
  const next = toFiniteNumber(nextValue);
  const amount = next - previous;
  return {
    previous,
    next,
    amount,
    percent: Math.abs(previous) >= CHANGE_EPSILON ? amount / previous * 100 : null,
    changed: Math.abs(amount) >= CHANGE_EPSILON,
  };
};

const normalizeDays = (days) => {
  const numericDays = Number(days);
  return SUPPLIER_PRICE_REPORT_PERIODS.some((period) => period.days === numericDays)
    ? numericDays
    : 1;
};

export const getSupplierPriceReportPeriod = (days) => {
  const normalizedDays = normalizeDays(days);
  return SUPPLIER_PRICE_REPORT_PERIODS.find((period) => period.days === normalizedDays);
};

export const getSupplierPriceReportCutoff = (days, now = new Date()) => {
  const normalizedDays = normalizeDays(days);
  const referenceTime = now instanceof Date ? now : new Date(now);
  return new Date(referenceTime.getTime() - normalizedDays * 24 * 60 * 60 * 1000);
};

const resolveDirection = (cost, sale) => {
  const primaryDelta = cost.changed ? cost.amount : sale.amount;
  if (primaryDelta > CHANGE_EPSILON) return 'increase';
  if (primaryDelta < -CHANGE_EPSILON) return 'decrease';
  return 'unchanged';
};

export const buildSupplierPriceChangeReport = (logs = [], { days = 1, now = new Date() } = {}) => {
  const period = getSupplierPriceReportPeriod(days);
  const generatedAt = now instanceof Date ? now : new Date(now);
  const cutoff = getSupplierPriceReportCutoff(period.days, generatedAt);
  const changes = [];

  for (const log of Array.isArray(logs) ? logs : []) {
    if (!REPORT_ACTIONS.has(log?.action)) continue;
    const createdAt = new Date(log.created_at || log.createdAt || '');
    if (!Number.isFinite(createdAt.getTime()) || createdAt < cutoff || createdAt > generatedAt) continue;

    const items = Array.isArray(log?.details?.items) ? log.details.items : [];
    for (const item of items) {
      const cost = calculateDelta(item?.before?.purchasePrice, item?.after?.purchasePrice);
      const sale = calculateDelta(item?.before?.price, item?.after?.price);
      if (!cost.changed && !sale.changed) continue;

      changes.push({
        logId: log.id ?? null,
        productId: item?.id ?? null,
        title: String(item?.title || 'Producto sin nombre'),
        barcode: String(item?.barcode || item?.inventoryBarcode || ''),
        supplierCode: String(item?.supplierCode || ''),
        casaAlbertoId: String(item?.casaAlbertoId || ''),
        user: String(log?.user || log?.details?.userName || 'Sistema'),
        eventType: log.action === 'Deshacer Precio Proveedor' ? 'undo' : 'approval',
        eventLabel: log.action === 'Deshacer Precio Proveedor' ? 'Reversión' : 'Aprobación',
        createdAt: createdAt.toISOString(),
        cost,
        sale,
        direction: resolveDirection(cost, sale),
      });
    }
  }

  changes.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  const percentageIncreases = changes
    .flatMap((change) => [change.cost, change.sale])
    .filter((delta) => delta.changed && delta.amount > 0 && Number.isFinite(delta.percent))
    .map((delta) => delta.percent);

  return {
    type: 'supplier-price-change-report',
    supplier: 'Casa Alberto',
    generatedAt: generatedAt.toISOString(),
    cutoff: cutoff.toISOString(),
    period,
    changes,
    summary: {
      changeCount: changes.length,
      uniqueProducts: new Set(changes.map((change) => String(change.productId ?? change.title))).size,
      costIncreases: changes.filter((change) => change.cost.changed && change.cost.amount > 0).length,
      costDecreases: changes.filter((change) => change.cost.changed && change.cost.amount < 0).length,
      saleIncreases: changes.filter((change) => change.sale.changed && change.sale.amount > 0).length,
      saleDecreases: changes.filter((change) => change.sale.changed && change.sale.amount < 0).length,
      maxIncreasePercent: percentageIncreases.length ? Math.max(...percentageIncreases) : null,
    },
  };
};
