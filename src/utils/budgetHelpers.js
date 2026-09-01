import { formatDateAR, formatTimeAR, formatWeight } from './helpers.js';
import { normalizeFinalSalePrice } from './finalSalePrice.js';

const asArray = (value) => (Array.isArray(value) ? value : []);
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};
const toText = (value, fallback = '') =>
  value === undefined || value === null ? fallback : String(value);

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
  paymentMethod: 'Efectivo',
  installments: 1,
  isSplitPayment: false,
  paymentLines: [],
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
  const qty = toFiniteNumber(item.qty ?? item.quantity, 0);
  const price = toFiniteNumber(item.newPrice ?? item.unit_price ?? item.price, 0);
  return item.product_type === 'weight' ? price * (qty / 1000) : price * qty;
};

export const calculateBudgetTotal = (items = []) =>
  asArray(items).reduce((acc, item) => acc + calculateBudgetLineSubtotal(asObject(item)), 0);

const normalizeBudgetIncludedProduct = (value = {}) => {
  const product = asObject(value);
  const productType = product.product_type || 'quantity';
  const purchasePrice = Number(
    product.purchasePrice ??
      product.purchase_price ??
      product.cost ??
      product.unitCost ??
      product.unit_cost ??
      0
  ) || 0;
  return {
    id: product.id ?? product.productId ?? product.product_id ?? null,
    productId: product.productId ?? product.product_id ?? product.id ?? null,
    title: product.title || product.name || '',
    price: Number(product.price || product.newPrice || product.unit_price || 0) || 0,
    cost: purchasePrice,
    unitCost: purchasePrice,
    purchasePrice,
    purchase_price: purchasePrice,
    product_type: productType,
    quantity:
      Number(product.quantity ?? product.qty ?? (productType === 'weight' ? 1000 : 1)) ||
      (productType === 'weight' ? 1000 : 1),
  };
};

export const normalizeBudgetBuilderItem = (value = {}) => {
  const item = asObject(value);
  return {
    id: item.id ?? `line-${Date.now()}`,
    productId: item.productId ?? item.product_id ?? null,
    title: toText(item.title),
    category: toText(item.category, 'Otros') || 'Otros',
    qty: toFiniteNumber(item.qty ?? item.quantity, 1),
    newPrice: toFiniteNumber(item.newPrice ?? item.unit_price ?? item.price, 0),
    purchasePrice: toFiniteNumber(
      item.purchasePrice ??
        item.purchase_price ??
        item.cost ??
        item.unitCost ??
        item.unit_cost ??
        0,
      0,
    ),
    product_type: item.product_type || 'quantity',
    isTemporary: Boolean(item.isTemporary ?? item.is_custom ?? false),
    stock:
      item.stock === undefined || item.stock === null || item.stock === ''
        ? undefined
        : toFiniteNumber(item.stock, 0),
    isCombo: Boolean(item.isCombo ?? item.is_combo ?? false),
    isDiscount: Boolean(item.isDiscount ?? item.is_discount ?? false),
    originalOfferId: item.originalOfferId ?? item.original_offer_id ?? null,
    productsIncluded: Array.isArray(item.productsIncluded || item.products_included)
      ? (item.productsIncluded || item.products_included).map(normalizeBudgetIncludedProduct)
      : [],
  };
};

export const buildBudgetSnapshot = (items = []) =>
  asArray(items)
    .map(normalizeBudgetBuilderItem)
    .filter((item) => item.title.trim() !== '')
    .map((item) => {
      const finalUnitPrice = item.isDiscount
        ? toFiniteNumber(item.newPrice, 0)
        : normalizeFinalSalePrice(item.newPrice);
      const normalizedItem = { ...item, newPrice: finalUnitPrice };
      return {
        id: item.id,
        product_id: item.productId,
        title: item.title.trim(),
        category: item.category || 'Otros',
        quantity: toFiniteNumber(item.qty, 0),
        unit_price: finalUnitPrice,
        purchase_price: toFiniteNumber(item.purchasePrice, 0),
        unit_cost: toFiniteNumber(item.purchasePrice, 0),
        cost: toFiniteNumber(item.purchasePrice, 0),
        subtotal: calculateBudgetLineSubtotal(normalizedItem),
        product_type: item.product_type || 'quantity',
        is_combo: Boolean(item.isCombo),
        is_discount: Boolean(item.isDiscount),
        is_custom: Boolean((item.isTemporary || !item.productId) && !item.isCombo && !item.isDiscount),
        original_offer_id: item.originalOfferId || null,
        products_included: Array.isArray(item.productsIncluded)
          ? item.productsIncluded.map(normalizeBudgetIncludedProduct)
          : [],
      };
    });

export const hydrateBudgetSnapshot = (itemsSnapshot = []) =>
  asArray(itemsSnapshot).map((value) => {
    const item = asObject(value);
    return normalizeBudgetBuilderItem({
      id: item.id,
      product_id: item.product_id,
      title: item.title,
      category: item.category,
      quantity: item.quantity,
      unit_price: item.unit_price,
      purchase_price: item.purchase_price ?? item.unit_cost ?? item.cost,
      product_type: item.product_type,
      is_custom: item.is_custom,
      is_combo: item.is_combo,
      is_discount: item.is_discount,
      original_offer_id: item.original_offer_id,
      products_included: item.products_included,
    });
  });

export const buildExportItemsFromSnapshot = (itemsSnapshot = []) =>
  hydrateBudgetSnapshot(itemsSnapshot).map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    qty: item.qty,
    newPrice: item.newPrice,
    purchasePrice: item.purchasePrice,
    product_type: item.product_type,
    isTemporary: item.isTemporary,
    // A client PDF is an immutable commercial snapshot. Live inventory is
    // deliberately excluded so an exhausted/deleted product can never block it.
    isCombo: item.isCombo,
    isDiscount: item.isDiscount,
    originalOfferId: item.originalOfferId,
    productsIncluded: item.productsIncluded,
  }));

export const buildBudgetExportConfig = (record = {}) => {
  const safeRecord = asObject(record);
  const totalAmount = toFiniteNumber(safeRecord.totalAmount, 0);
  const depositAmount = toFiniteNumber(safeRecord.depositAmount, 0);
  const paidTotal = toFiniteNumber(safeRecord.paidTotal, 0);
  const remainingAmount = safeRecord.remainingAmount !== undefined && safeRecord.remainingAmount !== null
    ? toFiniteNumber(safeRecord.remainingAmount, 0)
    : Math.max(totalAmount - paidTotal, 0);

  return {
    isForClient: true,
    documentTitle: toText(safeRecord.documentTitle, 'PRESUPUESTO') || 'PRESUPUESTO',
    clientName: toText(safeRecord.customerName),
    clientPhone: toText(safeRecord.customerPhone),
    clientEvent: toText(safeRecord.eventLabel),
    createdAtLabel: safeRecord.type === 'order' ? 'Pedido hecho el' : 'Presupuesto hecho el',
    createdAtDisplay: safeRecord.createdAt ? `${formatDateAR(safeRecord.createdAt)} - ${formatTimeAR(safeRecord.createdAt)} hs` : '',
    pickupDateLabel: 'Fecha de retiro',
    pickupDate: safeRecord.pickupDate ? formatDateAR(`${safeRecord.pickupDate}T12:00:00`) : '',
    financialSummary: {
      totalAmount,
      depositAmount,
      paidTotal,
      additionalPaid: Math.max(paidTotal - depositAmount, 0),
      remainingAmount,
    },
    clientColumns: DEFAULT_BUDGET_CLIENT_COLUMNS,
    columns: { cost: false, price: true, newPrice: false, stock: false },
  };
};

export const buildBudgetPdfPayload = (record = {}) => ({
  config: buildBudgetExportConfig(record),
  items: buildExportItemsFromSnapshot(asObject(record).itemsSnapshot),
});

export const getBudgetItemsValidationError = (items = []) => {
  const cleanItems = asArray(items).filter((item) => toText(item?.title).trim() !== '');
  if (cleanItems.length === 0) return 'Agregá al menos un artículo al presupuesto.';

  const hasInvalidQuantity = cleanItems.some((item) => {
    const quantity = Number(item?.qty ?? item?.quantity);
    return !Number.isFinite(quantity) || quantity <= 0;
  });
  if (hasInvalidQuantity) return 'Revisá las cantidades: deben ser números mayores a cero.';

  const hasInvalidPrice = cleanItems.some((item) => {
    const price = Number(item?.newPrice ?? item?.unit_price ?? item?.price);
    if (!Number.isFinite(price)) return true;
    return price < 0 && !(item?.isDiscount ?? item?.is_discount);
  });
  if (hasInvalidPrice) return 'Revisá los precios: solo las líneas de descuento pueden ser negativas.';

  const total = calculateBudgetTotal(cleanItems);
  if (!Number.isFinite(total) || total < 0) {
    return 'El total no puede ser negativo. Reducí o quitá alguno de los descuentos.';
  }

  return '';
};

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
  const qty = toFiniteNumber(item.qty ?? item.quantity, 0);
  if (item.product_type === 'weight') {
    return formatWeight(qty);
  }
  return `${qty} u.`;
};
