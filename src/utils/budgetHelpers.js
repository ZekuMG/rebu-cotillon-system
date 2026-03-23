import { formatDateAR, formatTimeAR, formatWeight } from './helpers';

export const DEFAULT_BUDGET_CLIENT_COLUMNS = {
  showQty: true,
  showUnitPrice: true,
  showSubtotal: false,
  showTotal: true,
};

export const DEFAULT_BUDGET_CONFIG = {
  documentTitle: 'PRESUPUESTO',
  eventLabel: '',
  customerMode: 'guest',
  memberId: null,
  customerName: '',
  customerPhone: '',
  customerNote: '',
};

export const createEmptyBudgetItem = (overrides = {}) => {
  const nextType = overrides.product_type || 'quantity';
  return {
    id: `temp-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    productId: null,
    title: '',
    category: 'Adicionales',
    qty: nextType === 'weight' ? 1000 : 1,
    newPrice: 0,
    product_type: nextType,
    isTemporary: true,
    stock: 0,
    ...overrides,
  };
};

export const calculateBudgetLineSubtotal = (item = {}) => {
  const qty = Number(item.qty) || 0;
  const price = Number(item.newPrice) || 0;
  return item.product_type === 'weight' ? price * (qty / 1000) : price * qty;
};

export const calculateBudgetTotal = (items = []) =>
  items.reduce((acc, item) => acc + calculateBudgetLineSubtotal(item), 0);

export const normalizeBudgetBuilderItem = (item = {}) => ({
  id: item.id ?? `line-${Date.now()}`,
  productId: item.productId ?? item.product_id ?? null,
  title: item.title || '',
  category: item.category || 'Otros',
  qty: Number(item.qty ?? item.quantity ?? 1) || 1,
  newPrice: Number(item.newPrice ?? item.unit_price ?? item.price ?? 0) || 0,
  product_type: item.product_type || 'quantity',
  isTemporary: Boolean(item.isTemporary ?? item.is_custom ?? false),
  stock:
    item.stock === undefined || item.stock === null || item.stock === ''
      ? undefined
      : Number(item.stock) || 0,
});

export const buildBudgetSnapshot = (items = []) =>
  items
    .map(normalizeBudgetBuilderItem)
    .filter((item) => item.title.trim() !== '')
    .map((item) => ({
      id: item.id,
      product_id: item.productId,
      title: item.title.trim(),
      category: item.category || 'Otros',
      quantity: Number(item.qty) || 1,
      unit_price: Number(item.newPrice) || 0,
      subtotal: calculateBudgetLineSubtotal(item),
      product_type: item.product_type || 'quantity',
      is_custom: Boolean(item.isTemporary || !item.productId),
    }));

export const hydrateBudgetSnapshot = (itemsSnapshot = []) =>
  (itemsSnapshot || []).map((item) =>
    normalizeBudgetBuilderItem({
      id: item.id,
      product_id: item.product_id,
      title: item.title,
      category: item.category,
      quantity: item.quantity,
      unit_price: item.unit_price,
      product_type: item.product_type,
      is_custom: item.is_custom,
    })
  );

export const buildExportItemsFromSnapshot = (itemsSnapshot = []) =>
  hydrateBudgetSnapshot(itemsSnapshot).map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    qty: item.qty,
    newPrice: item.newPrice,
    product_type: item.product_type,
    isTemporary: item.isTemporary,
    stock: item.stock,
  }));

export const buildBudgetExportConfig = (record) => ({
  isForClient: true,
  documentTitle: record.documentTitle || 'PRESUPUESTO',
  clientName: record.customerName || '',
  clientPhone: record.customerPhone || '',
  clientEvent: record.eventLabel || '',
  createdAtLabel: record.type === 'order' ? 'Pedido hecho el' : 'Presupuesto hecho el',
  createdAtDisplay: record.createdAt ? `${formatDateAR(record.createdAt)} - ${formatTimeAR(record.createdAt)} hs` : '',
  pickupDateLabel: 'Fecha de retiro',
  pickupDate: record.pickupDate ? formatDateAR(`${record.pickupDate}T12:00:00`) : '',
  financialSummary: {
    totalAmount: Number(record.totalAmount || 0),
    depositAmount: Number(record.depositAmount || 0),
    paidTotal: Number(record.paidTotal || 0),
    additionalPaid: Math.max(Number(record.paidTotal || 0) - Number(record.depositAmount || 0), 0),
    remainingAmount:
      record.remainingAmount !== undefined && record.remainingAmount !== null
        ? Number(record.remainingAmount || 0)
        : Math.max(Number(record.totalAmount || 0) - Number(record.paidTotal || 0), 0),
  },
  clientColumns: DEFAULT_BUDGET_CLIENT_COLUMNS,
  columns: { cost: false, price: true, newPrice: false, stock: false },
});

export const deriveOrderStatus = ({ paidTotal = 0, totalAmount = 0, currentStatus = '' }) => {
  if (currentStatus === 'Retirado') return 'Retirado';
  if (currentStatus === 'Cancelado') return 'Cancelado';
  if ((Number(paidTotal) || 0) >= (Number(totalAmount) || 0) && Number(totalAmount) > 0) {
    return 'Pagado';
  }
  if ((Number(paidTotal) || 0) > 0) return 'Señado';
  return 'Pendiente';
};

export const formatBudgetItemQuantity = (item = {}) => {
  const qty = Number(item.qty ?? item.quantity ?? 0) || 0;
  if (item.product_type === 'weight') {
    return formatWeight(qty);
  }
  return `${qty} u.`;
};
