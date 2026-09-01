import { formatDateAR, formatTimeFullAR, isTestRecord } from './helpers';
import { normalizeExpenseDateValue, parseExpenseDateValue } from './expenseDates';
import {
  getOrderPaymentHistorySummary,
  getPrimaryPaymentInfo,
  normalizePaymentBreakdown,
} from './paymentBreakdown';
import {
  isPosBagItem,
  POS_BAG_ITEM_KIND,
} from './posSaleExtras';
import { getProductActiveState } from './productLifecycle';
import { normalizeFinalSalePrice, normalizeStoredProductSalePrice } from './finalSalePrice';
import { normalizeStoredProductPurchaseCost } from './finalPurchaseCost';

const MODIFIED_SALE_ACTIONS = new Set([
  'Venta Modificada',
  'Modificacion Pedido',
  'Modificacion de Pedido',
]);

const SALE_ITEM_SNAPSHOT_ACTIONS = new Set([
  'Venta Realizada',
  'Modificacion Pedido',
  'Modificacion de Pedido',
  'Venta Modificada',
  'Venta Restaurada',
]);

const getSafeDate = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const isModifiedSaleAction = (actionName) => {
  const normalizedAction = String(actionName || '').toLowerCase();
  return (
    MODIFIED_SALE_ACTIONS.has(actionName) ||
    (normalizedAction.includes('modificaci') && normalizedAction.includes('pedido'))
  );
};

const isSaleItemSnapshotAction = (actionName) => {
  const normalizedAction = String(actionName || '').toLowerCase();
  return (
    SALE_ITEM_SNAPSHOT_ACTIONS.has(actionName) ||
    (normalizedAction.includes('venta') && normalizedAction.includes('realizada')) ||
    (normalizedAction.includes('venta') && normalizedAction.includes('restaurada')) ||
    isModifiedSaleAction(actionName)
  );
};

export const safeCloudData = (result, tableName) => {
  if (result.status === 'fulfilled' && !result.value.error) {
    return result.value.data || [];
  }

  console.error(
    `Error en tabla [${tableName}]:`,
    result.status === 'rejected' ? result.reason : result.value.error
  );
  return null;
};

export const mapInventoryRecords = (products = []) =>
  (Array.isArray(products) ? products : [])
    .filter((product) => product && typeof product === 'object')
    .map((product) => ({
    ...product,
    imageThumb: product.image_thumb || product.imageThumb || '',
    isActive: getProductActiveState(product),
    supplierLinks: product.supplier_links && typeof product.supplier_links === 'object'
      ? product.supplier_links
      : product.supplierLinks && typeof product.supplierLinks === 'object'
        ? product.supplierLinks
        : {},
    categories: product.category
      ? product.category.split(',').map((category) => category.trim()).filter(Boolean)
      : [],
    price: normalizeStoredProductSalePrice(product.price, product.product_type),
    purchasePrice: normalizeStoredProductPurchaseCost(
      product.purchasePrice ?? product.purchase_price ?? 0,
      product.product_type,
    ),
    expiration_date: product.expiration_date || null,
    activeOffers: Array.isArray(product.active_offers)
      ? product.active_offers
      : Array.isArray(product.activeOffers)
        ? product.activeOffers
        : [],
  }));

export const mapMemberRecords = (clients = []) =>
  clients.map((client) => ({
    ...client,
    memberNumber: client.member_number,
    extraInfo: client.extraInfo || client.extrainfo || '',
    socialConnections: client.social_connections || client.socialConnections || {},
    createdAt: client.created_at,
  }));

export const mapAgendaContactRecord = (contact) => ({
  ...contact,
  contactType: contact.contact_type || 'supplier',
  taxId: contact.tax_id || '',
  contactPerson: contact.contact_person || '',
  isActive: contact.is_active !== false,
  createdAt: contact.created_at || null,
  updatedAt: contact.updated_at || null,
});

export const mapAgendaContactRecords = (contacts = []) =>
  contacts.map(mapAgendaContactRecord);

export const mapLogRecords = (logs = []) =>
  logs.map((log) => {
    const action = isModifiedSaleAction(log.action) ? 'Venta Modificada' : log.action;
    
    // 🔧 PARSE details si viene como JSON string desde Supabase
    let details = log.details;
    if (typeof details === 'string') {
      try {
        details = JSON.parse(details);
      } catch {
        // Si falla el parse, mantener como string
      }
    }
    
    const shouldIgnoreNestedTestDetectionForLog = (actionName) => {
      const normalizedAction = String(actionName || '').toLowerCase();
      return normalizedAction.includes('cierre de caja') || normalizedAction.includes('cierre autom');
    };

    const mappedLog = {
      id: log.id,
      action,
      details,
      user: log.user_name || log.user || details?.userName || 'Sistema',
      userId: log.user_id || details?.userId || null,
      userRole: log.user_role || details?.userRole || details?.role || null,
      searchVerified: Boolean(log.search_verified),
      reason: log.reason,
      created_at: log.created_at || null,
      date: formatDateAR(getSafeDate(log.created_at)),
      timestamp: formatTimeFullAR(getSafeDate(log.created_at)),
    };

    mappedLog.isTest = shouldIgnoreNestedTestDetectionForLog(mappedLog.action)
      ? Boolean(mappedLog.details?.isTest || mappedLog.details?.testMarker === 'test')
      : isTestRecord({
          action: mappedLog.action,
          details: mappedLog.details,
          reason: mappedLog.reason,
        });

    return mappedLog;
  });

const withPosBagMetadata = (item = {}) => (
  isPosBagItem(item)
    ? { ...item, isPosBag: true, itemKind: POS_BAG_ITEM_KIND }
    : item
);

const mapSaleItemRecord = (item) => withPosBagMetadata({
  id: item.product_id,
  title: item.product_title,
  qty: Number(item.quantity ?? 0),
  price: Number(item.price ?? 0),
  subtotal: Number(item.subtotal ?? item.line_subtotal ?? 0) || undefined,
  cost: Number(item.cost ?? item.unit_cost ?? item.purchasePrice ?? item.purchase_price ?? 0) || 0,
  unitCost: Number(item.cost ?? item.unit_cost ?? item.purchasePrice ?? item.purchase_price ?? 0) || 0,
  purchasePrice: Number(item.cost ?? item.unit_cost ?? item.purchasePrice ?? item.purchase_price ?? 0) || 0,
  costAtSale: Number(item.cost ?? item.unit_cost ?? item.purchasePrice ?? item.purchase_price ?? 0) || 0,
  unitCostAtSale: Number(item.cost ?? item.unit_cost ?? item.purchasePrice ?? item.purchase_price ?? 0) || 0,
  purchasePriceAtSale: Number(item.cost ?? item.unit_cost ?? item.purchasePrice ?? item.purchase_price ?? 0) || 0,
  priceAtSale: Number(item.price ?? 0) || 0,
  lineSubtotal: Number(item.subtotal ?? item.line_subtotal ?? 0) || undefined,
  costSource: item.cost_source || item.costSource || 'sale_items',
  isReward: Boolean(item.is_reward),
  isCustom: Boolean(item.is_custom),
  isDiscount: Boolean(item.is_discount),
  isCombo: Boolean(item.is_combo),
  couponCode: item.coupon_code || item.couponCode || null,
  productId: item.product_id,
  product_type: item.product_type || null,
});

const mapRecoveredSaleItem = (item) => withPosBagMetadata({
  id: item.id || item.productId || item.product_id || null,
  title: item.title || item.product_title || item.name || 'Producto Recuperado',
  qty: Number(item.quantity ?? item.qty ?? 1),
  price: Number(item.price ?? 0),
  subtotal: Number(item.subtotal ?? item.lineSubtotal ?? item.line_total ?? item.lineTotal ?? 0) || undefined,
  cost: Number(item.costAtSale ?? item.cost_at_sale ?? item.cost ?? item.unitCost ?? item.unit_cost ?? item.purchasePriceAtSale ?? item.purchase_price_at_sale ?? item.purchasePrice ?? item.purchase_price ?? 0) || 0,
  unitCost: Number(item.unitCostAtSale ?? item.unit_cost_at_sale ?? item.costAtSale ?? item.cost_at_sale ?? item.cost ?? item.unitCost ?? item.unit_cost ?? item.purchasePriceAtSale ?? item.purchase_price_at_sale ?? item.purchasePrice ?? item.purchase_price ?? 0) || 0,
  purchasePrice: Number(item.purchasePriceAtSale ?? item.purchase_price_at_sale ?? item.costAtSale ?? item.cost_at_sale ?? item.cost ?? item.unitCost ?? item.unit_cost ?? item.purchasePrice ?? item.purchase_price ?? 0) || 0,
  costAtSale: Number(item.costAtSale ?? item.cost_at_sale ?? item.cost ?? item.unitCost ?? item.unit_cost ?? item.purchasePriceAtSale ?? item.purchase_price_at_sale ?? item.purchasePrice ?? item.purchase_price ?? 0) || 0,
  unitCostAtSale: Number(item.unitCostAtSale ?? item.unit_cost_at_sale ?? item.costAtSale ?? item.cost_at_sale ?? item.cost ?? item.unitCost ?? item.unit_cost ?? item.purchasePriceAtSale ?? item.purchase_price_at_sale ?? item.purchasePrice ?? item.purchase_price ?? 0) || 0,
  purchasePriceAtSale: Number(item.purchasePriceAtSale ?? item.purchase_price_at_sale ?? item.costAtSale ?? item.cost_at_sale ?? item.cost ?? item.unitCost ?? item.unit_cost ?? item.purchasePrice ?? item.purchase_price ?? 0) || 0,
  priceAtSale: Number(item.priceAtSale ?? item.price_at_sale ?? item.price ?? 0) || 0,
  lineSubtotal: Number(item.lineSubtotal ?? item.line_subtotal ?? item.subtotal ?? item.line_total ?? item.lineTotal ?? 0) || undefined,
  costSource: item.costSource || item.cost_source || null,
  isReward: Boolean(item.isReward ?? item.is_reward ?? false),
  isDiscount: Boolean(item.isDiscount ?? item.is_discount ?? false),
  discountMode: item.discountMode || item.discount_mode || null,
  discountPercent: item.discountPercent ?? item.discount_percent ?? null,
  productId: item.productId || item.id || item.product_id || null,
  product_type: item.product_type || null,
  isCustom: Boolean(item.isCustom ?? item.is_custom ?? false),
  isCombo: Boolean(item.isCombo ?? item.is_combo ?? false),
  isPosBag: Boolean(item.isPosBag ?? item.is_pos_bag ?? false),
  itemKind: item.itemKind || item.item_kind || null,
  couponCode: item.couponCode || item.coupon_code || null,
  category: item.category || null,
  categories: Array.isArray(item.categories) ? item.categories : null,
  productsIncluded: Array.isArray(item.productsIncluded || item.products_included)
    ? item.productsIncluded || item.products_included
    : [],
});

const getSaleSnapshotItems = (log) => {
  if (!log?.details || typeof log.details !== 'object') return [];
  const snapshot = log.details.itemsSnapshot || log.details.items || log.details.itemsRestored || [];
  return Array.isArray(snapshot) ? snapshot : [];
};

const getSaleSnapshotScore = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return 0;

  let score = 1;
  if (items.some((item) => item?.product_type)) score += 4;
  if (items.some((item) => item?.isCustom || item?.isCombo || item?.isReward || item?.productId || item?.product_id || item?.id)) score += 2;
  if (items.some((item) => item?.price !== undefined)) score += 1;
  if (items.some((item) => (
    item?.purchasePriceAtSale !== undefined ||
    item?.purchase_price_at_sale !== undefined ||
    item?.unitCostAtSale !== undefined ||
    item?.unit_cost_at_sale !== undefined ||
    item?.costAtSale !== undefined ||
    item?.cost_at_sale !== undefined ||
    item?.cost !== undefined
  ))) score += 3;

  return score;
};

const enrichSaleItemsWithSnapshot = (items = [], snapshotItems = []) => {
  if (!Array.isArray(snapshotItems) || snapshotItems.length === 0) return items;

  const normalizedSnapshotItems = snapshotItems.map(mapRecoveredSaleItem);
  const usedIndexes = new Set();

  const enrichedItems = items.map((item, itemIndex) => {
    let matchedSnapshotIndex = normalizedSnapshotItems.findIndex((snapshotItem, snapshotIndex) => {
      if (usedIndexes.has(snapshotIndex)) return false;

      const sameProductId =
        snapshotItem.productId &&
        item.productId &&
        String(snapshotItem.productId) === String(item.productId);
      const sameId =
        snapshotItem.id &&
        item.id &&
        String(snapshotItem.id) === String(item.id);
      const sameTitle =
        snapshotItem.title &&
        item.title &&
        String(snapshotItem.title) === String(item.title);
      const sameQty = Number(snapshotItem.qty ?? 0) === Number(item.qty ?? 0);
      const samePrice = Number(snapshotItem.price ?? 0) === Number(item.price ?? 0);

      return sameProductId || sameId || (sameTitle && sameQty && samePrice) || (sameTitle && !item.productId);
    });

    if (matchedSnapshotIndex === -1 && normalizedSnapshotItems[itemIndex] && !usedIndexes.has(itemIndex)) {
      matchedSnapshotIndex = itemIndex;
    }

    if (matchedSnapshotIndex === -1) return item;

    usedIndexes.add(matchedSnapshotIndex);
    const snapshotItem = normalizedSnapshotItems[matchedSnapshotIndex];

    return withPosBagMetadata({
      ...item,
      id: item.id || snapshotItem.id,
      title: item.title || snapshotItem.title,
      qty: item.qty ?? snapshotItem.qty,
      price: item.price ?? snapshotItem.price,
      subtotal: item.subtotal ?? snapshotItem.subtotal ?? undefined,
      isReward: item.isReward ?? snapshotItem.isReward,
      isDiscount: item.isDiscount ?? snapshotItem.isDiscount,
      discountMode: item.discountMode || snapshotItem.discountMode || null,
      discountPercent: item.discountPercent ?? snapshotItem.discountPercent ?? null,
      productId: item.productId || snapshotItem.productId,
      product_type: item.product_type || snapshotItem.product_type || null,
      isCustom: item.isCustom ?? snapshotItem.isCustom,
      isCombo: item.isCombo ?? snapshotItem.isCombo,
      isPosBag: item.isPosBag ?? snapshotItem.isPosBag,
      itemKind: item.itemKind || snapshotItem.itemKind || null,
      couponCode: item.couponCode || snapshotItem.couponCode || null,
      category: item.category || snapshotItem.category || null,
      categories: item.categories || snapshotItem.categories || null,
      productsIncluded: item.productsIncluded || snapshotItem.productsIncluded || [],
      cost: item.cost || snapshotItem.cost || 0,
      unitCost: item.unitCost || snapshotItem.unitCost || snapshotItem.cost || 0,
      purchasePrice: item.purchasePrice || snapshotItem.purchasePrice || snapshotItem.cost || 0,
      costAtSale: item.costAtSale || snapshotItem.costAtSale || snapshotItem.cost || 0,
      unitCostAtSale: item.unitCostAtSale || snapshotItem.unitCostAtSale || snapshotItem.unitCost || snapshotItem.cost || 0,
      purchasePriceAtSale: item.purchasePriceAtSale || snapshotItem.purchasePriceAtSale || snapshotItem.purchasePrice || snapshotItem.cost || 0,
      priceAtSale: item.priceAtSale || snapshotItem.priceAtSale || snapshotItem.price || 0,
      lineSubtotal: item.lineSubtotal || snapshotItem.lineSubtotal || snapshotItem.subtotal || undefined,
      costSource: snapshotItem.costSource || item.costSource || null,
    });
  });

  const missingSnapshotItems = normalizedSnapshotItems.filter((_, snapshotIndex) => !usedIndexes.has(snapshotIndex));
  return [...enrichedItems, ...missingSnapshotItems];
};

const findSaleSnapshotLog = (logs, saleId) =>
  logs.reduce((bestLog, log) => {
    const isCandidate =
      isSaleItemSnapshotAction(log.action) &&
      String(log.details?.transactionId) === String(saleId);

    if (!isCandidate) return bestLog;

    if (!bestLog) return log;

    const currentScore = getSaleSnapshotScore(getSaleSnapshotItems(log));
    const bestScore = getSaleSnapshotScore(getSaleSnapshotItems(bestLog));

    return currentScore > bestScore ? log : bestLog;
  }, null);

const findSaleRestoreLog = (logs, saleId) =>
  logs.find(
    (log) =>
      log.action === 'Venta Restaurada' &&
      String(log.details?.transactionId) === String(saleId)
  );

export const mapSaleRecords = (sales = [], parsedLogs = []) =>
  sales.map((sale) => {
    const snapshotLog = findSaleSnapshotLog(parsedLogs, sale.id);
    const snapshotItems = getSaleSnapshotItems(snapshotLog);
    let items = (sale.sale_items || []).map(mapSaleItemRecord);

    if (items.length === 0 && Number(sale.total) > 0) {
      items = snapshotItems.map(mapRecoveredSaleItem);
    } else if (snapshotItems.length > 0) {
      items = enrichSaleItemsWithSnapshot(items, snapshotItems);
    }

    const restoreLog = findSaleRestoreLog(parsedLogs, sale.id);
    const paymentBreakdown = normalizePaymentBreakdown(
      sale.payment_breakdown ?? snapshotLog?.details?.paymentBreakdown,
      sale.payment_method,
      sale.installments,
      sale.cash_received,
      sale.cash_change,
      sale.total,
    );
    const primaryPaymentInfo = getPrimaryPaymentInfo(
      paymentBreakdown,
      sale.payment_method,
      sale.installments,
      sale.cash_received,
      sale.cash_change,
      sale.total,
    );
    const mappedSale = {
      id: sale.id,
      createdAt: sale.created_at || null,
      date: formatDateAR(getSafeDate(sale.created_at)),
      time: formatTimeFullAR(getSafeDate(sale.created_at)),
      total: sale.total,
      payment: primaryPaymentInfo.payment,
      paymentBreakdown,
      primaryPaymentMethod: primaryPaymentInfo.primaryMethod,
      cashReceived: Number(primaryPaymentInfo.cashReceived ?? snapshotLog?.details?.cashReceived ?? 0),
      cashChange: Number(primaryPaymentInfo.cashChange ?? snapshotLog?.details?.cashChange ?? 0),
      installments: primaryPaymentInfo.installments,
      items,
      client: sale.clients
        ? { name: sale.clients.name, memberNumber: sale.clients.member_number }
        : null,
      pointsEarned: sale.points_earned,
      pointsSpent: sale.points_spent,
      orderId: sale.order_id || snapshotLog?.details?.orderId || null,
      pointsSource: sale.points_source || 'sale',
      pointsChange: snapshotLog?.details?.pointsChange || null,
      user: sale.user_name || snapshotLog?.details?.userName || 'Desconocido',
      userId: sale.user_id || snapshotLog?.details?.userId || null,
      userRole: sale.user_role || snapshotLog?.details?.userRole || null,
      stockChanges: Array.isArray(snapshotLog?.details?.stockChanges)
        ? snapshotLog.details.stockChanges
        : [],
      status: sale.status || 'completed',
      voidedAt: sale.voided_at || null,
      isRestored: Boolean(restoreLog),
      restoredAt: restoreLog ? `${restoreLog.date} ${restoreLog.timestamp}` : null,
    };

    mappedSale.isTest = isTestRecord(mappedSale);
    return mappedSale;
  });

export const mapExpenseRecords = (expenses = []) =>
  expenses.map((expense) => {
    const createdAt = expense.created_at || expense.createdAt || new Date().toISOString();
    const createdAtDate = getSafeDate(createdAt);
    const expenseDate = normalizeExpenseDateValue(
      expense.expense_date || expense.expenseDate || createdAt,
      createdAt,
    );
    const metricDate = parseExpenseDateValue(expenseDate) || createdAtDate;
    metricDate.setHours(
      createdAtDate.getHours(),
      createdAtDate.getMinutes(),
      createdAtDate.getSeconds(),
      createdAtDate.getMilliseconds(),
    );
    const paymentMethod = expense.payment_method || expense.paymentMethod || 'Efectivo';
    const mappedExpense = {
      id: expense.id,
      created_at: createdAt,
      createdAt,
      expense_date: expenseDate,
      expenseDate,
      metricDate,
      description: expense.description || expense.note || 'Gasto General',
      amount: Number(expense.amount || 0),
      category: expense.category || 'Varios',
      paymentMethod,
      date: formatDateAR(metricDate),
      time: formatTimeFullAR(createdAtDate),
      user: expense.user_name || 'Sistema',
      userId: expense.user_id || null,
      userRole: expense.user_role || null,
    };

    mappedExpense.isTest = isTestRecord({
      description: mappedExpense.description,
      category: mappedExpense.category,
    });

    return mappedExpense;
  });

export const mapCashClosureRecord = (closure) => ({
  id: closure.id,
  createdAt: closure.created_at || null,
  date: closure.date,
  openTime: closure.open_time,
  closeTime: closure.close_time,
  user: closure.user_name || closure.user || 'Sistema',
  userId: closure.user_id || null,
  userRole: closure.user_role || null,
  type: closure.type,
  openingBalance: Number(closure.opening_balance || 0),
  totalSales: Number(closure.total_sales || 0),
  finalBalance: Number(closure.final_balance || 0),
  totalCost: Number(closure.total_cost || 0),
  totalExpenses: Number(closure.total_expenses || 0),
  netProfit: Number(closure.net_profit || 0),
  salesCount: closure.sales_count || 0,
  averageTicket: Number(closure.average_ticket || 0),
  paymentMethods: closure.payment_methods_summary || {},
  itemsSold: closure.items_sold_list || [],
  newClients: closure.new_clients_list || [],
  newClientsCount: Array.isArray(closure.new_clients_list) ? closure.new_clients_list.length : 0,
  expensesSnapshot: closure.expenses_snapshot || [],
  transactionsSnapshot: closure.transactions_snapshot || [],
  hasDetail: [
    'payment_methods_summary',
    'items_sold_list',
    'expenses_snapshot',
    'transactions_snapshot',
  ].some((key) => Object.prototype.hasOwnProperty.call(closure || {}, key)),
});

export const mapCashClosureRecords = (closures = []) => closures.map(mapCashClosureRecord);

export const mapCategoryRecords = (categories = []) => categories.map((category) => category.name);

export const mapRewardRecords = (rewards = []) =>
  rewards.map((reward) => ({
    id: reward.id,
    title: reward.title,
    description: reward.description,
    pointsCost: reward.points_cost,
    type: reward.type,
    discountAmount: reward.discount_amount,
    stock: reward.stock,
    isActive: reward.is_active !== false,
  }));

export const mapOfferRecords = (offers = []) =>
  offers.map((offer) => ({
    id: offer.id,
    name: offer.name,
    type: offer.type,
    applyTo: offer.apply_to,
    productsIncluded: offer.products_included || [],
    itemsCount: Number(offer.items_count),
    discountValue: Number(offer.discount_value),
    offerPrice: normalizeFinalSalePrice(offer.offer_price),
    profitMargin:
      typeof offer.profit_margin === 'string'
        ? offer.profit_margin
        : Number(offer.profit_margin || 0),
    createdBy: offer.created_by,
  }));

export const mapBudgetRecords = (budgets = []) =>
  budgets.map((budget) => {
    const paymentBreakdown = normalizePaymentBreakdown(
      budget.payment_breakdown,
      budget.payment_method || 'Efectivo',
      budget.installments || 0,
      0,
      0,
      budget.total_amount || 0,
    );
    const primaryPaymentInfo = getPrimaryPaymentInfo(
      paymentBreakdown,
      budget.payment_method || 'Efectivo',
      budget.installments || 0,
      0,
      0,
      budget.total_amount || 0,
    );

    return {
      id: budget.id,
      memberId: budget.member_id,
      customerName: budget.customer_name || '',
      customerPhone: budget.customer_phone || '',
      customerNote: budget.customer_note || '',
      documentTitle: budget.document_title || 'PRESUPUESTO',
      eventLabel: budget.event_label || '',
      paymentMethod: primaryPaymentInfo.payment,
      paymentBreakdown,
      installments: primaryPaymentInfo.installments,
      itemsSnapshot: budget.items_snapshot || [],
      totalAmount: Number(budget.total_amount || 0),
      createdAt: budget.created_at,
      isActive: budget.is_active !== false,
      type: 'budget',
      status: 'Presupuesto',
    };
  });

export const mapOrderRecords = (orders = []) =>
  orders.map((order) => {
    const paidTotal = Number(order.paid_total || 0);
    const paymentSummary = getOrderPaymentHistorySummary(
      order.payment_breakdown,
      order.payment_method || 'Pedido',
      order.installments || 0,
      paidTotal,
    );

    return {
      id: order.id,
      budgetId: order.budget_id,
      memberId: order.member_id,
      customerName: order.customer_name || '',
      customerPhone: order.customer_phone || '',
      customerNote: order.customer_note || '',
      documentTitle: order.document_title || 'PEDIDO',
      eventLabel: order.event_label || '',
      paymentMethod: paymentSummary.paymentMethod,
      paymentBreakdown: paymentSummary.paymentBreakdown,
      paymentHistory: paymentSummary.paymentHistory,
      installments: paymentSummary.installments,
      cashReceived: Number(paymentSummary.cashReceived || 0),
      cashChange: Number(paymentSummary.cashChange || 0),
      itemsSnapshot: order.items_snapshot || [],
      totalAmount: Number(order.total_amount || 0),
      depositAmount: Number(order.deposit_amount || 0),
      paidTotal,
      pointsCredited:
        order.points_credited === undefined || order.points_credited === null
          ? null
          : Math.max(0, Number(order.points_credited) || 0),
      pointsAccountingMode: order.points_accounting_mode || 'legacy',
      version: Math.max(1, Number(order.version) || 1),
      remainingAmount: Number(order.remaining_amount || 0),
      pickupDate: order.pickup_date || null,
      status: order.status || 'Pendiente',
      createdAt: order.created_at,
      isActive: order.is_active !== false,
      type: 'order',
    };
  });

export const mapRegisterState = (registerState) => {
  if (!registerState) return null;

  return {
    isRegisterClosed: !registerState.is_open,
    openingBalance: Number(registerState.opening_balance),
    closingTime: registerState.closing_time || '21:00',
    registerOpenedAt: registerState.opened_at || null,
  };
};
