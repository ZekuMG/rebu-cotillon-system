import { formatDateAR, formatTimeFullAR, isTestRecord } from './helpers';

const MODIFIED_SALE_ACTIONS = new Set([
  'Venta Modificada',
  'Modificacion Pedido',
  'Modificación de Pedido',
]);

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
  products.map((product) => ({
    ...product,
    categories: product.category
      ? product.category.split(',').map((category) => category.trim()).filter(Boolean)
      : [],
    purchasePrice: product.purchasePrice || 0,
    expiration_date: product.expiration_date || null,
  }));

export const mapMemberRecords = (clients = []) =>
  clients.map((client) => ({
    ...client,
    memberNumber: client.member_number,
    createdAt: client.created_at,
  }));

export const mapLogRecords = (logs = []) =>
  logs.map((log) => {
    const action = MODIFIED_SALE_ACTIONS.has(log.action) ? 'Modificación Pedido' : log.action;
    const mappedLog = {
      id: log.id,
      action,
      details: log.details,
      user: log.user,
      reason: log.reason,
      date: formatDateAR(new Date(log.created_at)),
      timestamp: formatTimeFullAR(new Date(log.created_at)),
    };

    mappedLog.isTest = isTestRecord({
      action: mappedLog.action,
      details: mappedLog.details,
      reason: mappedLog.reason,
    });

    return mappedLog;
  });

const mapSaleItemRecord = (item) => ({
  id: item.product_id,
  title: item.product_title,
  qty: item.quantity,
  price: item.price,
  isReward: item.is_reward,
  productId: item.product_id,
});

const mapRecoveredSaleItem = (item) => ({
  id: item.id || item.productId,
  title: item.title || item.name || 'Producto Recuperado',
  qty: Number(item.quantity || item.qty || 1),
  price: Number(item.price || 0),
  isReward: item.isReward || false,
  productId: item.productId || item.id,
});

const findSaleRecoveryLog = (logs, saleId) =>
  logs.find(
    (log) =>
      (log.action === 'Venta Realizada' || log.action === 'Modificación Pedido') &&
      String(log.details?.transactionId) === String(saleId)
  );

const findSaleRestoreLog = (logs, saleId) =>
  logs.find(
    (log) =>
      log.action === 'Venta Restaurada' &&
      String(log.details?.transactionId) === String(saleId)
  );

export const mapSaleRecords = (sales = [], parsedLogs = []) =>
  sales.map((sale) => {
    let items = (sale.sale_items || []).map(mapSaleItemRecord);

    if (items.length === 0 && Number(sale.total) > 0) {
      const recoveryLog = findSaleRecoveryLog(parsedLogs, sale.id);
      if (recoveryLog) {
        const recoveredItems = recoveryLog.details?.items || recoveryLog.details?.itemsSnapshot || [];
        items = recoveredItems.map(mapRecoveredSaleItem);
      }
    }

    const restoreLog = findSaleRestoreLog(parsedLogs, sale.id);
    const mappedSale = {
      id: sale.id,
      date: formatDateAR(new Date(sale.created_at)),
      time: formatTimeFullAR(new Date(sale.created_at)),
      total: sale.total,
      payment: sale.payment_method,
      installments: sale.installments,
      items,
      client: sale.clients
        ? { name: sale.clients.name, memberNumber: sale.clients.member_number }
        : null,
      pointsEarned: sale.points_earned,
      pointsSpent: sale.points_spent,
      user: sale.user_name || 'Desconocido',
      status: 'completed',
      isRestored: Boolean(restoreLog),
      restoredAt: restoreLog ? `${restoreLog.date} ${restoreLog.timestamp}` : null,
    };

    mappedSale.isTest = isTestRecord(mappedSale);
    return mappedSale;
  });

export const mapExpenseRecords = (expenses = []) =>
  expenses.map((expense) => {
    const mappedExpense = {
      id: expense.id,
      description: expense.description,
      amount: expense.amount,
      category: expense.category,
      paymentMethod: expense.payment_method,
      date: formatDateAR(new Date(expense.created_at)),
      time: formatTimeFullAR(new Date(expense.created_at)),
      user: expense.user_name || 'Sistema',
    };

    mappedExpense.isTest = isTestRecord({
      description: mappedExpense.description,
      category: mappedExpense.category,
    });

    return mappedExpense;
  });

export const mapCashClosureRecord = (closure) => ({
  id: closure.id,
  date: closure.date,
  openTime: closure.open_time,
  closeTime: closure.close_time,
  user: closure.user_name,
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
  expensesSnapshot: closure.expenses_snapshot || [],
  transactionsSnapshot: closure.transactions_snapshot || [],
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
    offerPrice: Number(offer.offer_price),
    profitMargin: Number(offer.profit_margin),
    createdBy: offer.created_by,
  }));

export const mapRegisterState = (registerState) => {
  if (!registerState) return null;

  return {
    isRegisterClosed: !registerState.is_open,
    openingBalance: Number(registerState.opening_balance),
    closingTime: registerState.closing_time || '21:00',
    registerOpenedAt: registerState.opened_at || null,
  };
};
