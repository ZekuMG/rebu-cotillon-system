const ORDER_STOCK_POLICY_FIELD = '_rebu_order_stock_policy';
const DEFERRED_STOCK_POLICY = 'deferred_until_completion';

const asItems = (recordOrItems) => {
  if (Array.isArray(recordOrItems)) return recordOrItems;
  if (Array.isArray(recordOrItems?.itemsSnapshot)) return recordOrItems.itemsSnapshot;
  if (Array.isArray(recordOrItems?.items_snapshot)) return recordOrItems.items_snapshot;
  return [];
};

export const markOrderItemsForDeferredStock = (items = []) =>
  asItems(items).map((item) => ({
    ...(item && typeof item === 'object' ? item : {}),
    [ORDER_STOCK_POLICY_FIELD]: DEFERRED_STOCK_POLICY,
  }));

export const hasDeferredOrderStockPolicy = (recordOrItems) =>
  asItems(recordOrItems).some(
    (item) => item?.[ORDER_STOCK_POLICY_FIELD] === DEFERRED_STOCK_POLICY,
  );

export const isOrderStockReserved = (orderRecord) => {
  if (!orderRecord || hasDeferredOrderStockPolicy(orderRecord)) return false;

  // Pedidos anteriores a la política diferida no guardaban una marca explícita.
  // En ellos, una seña parcial implicaba que el stock ya había sido descontado.
  return (
    Number(orderRecord.paidTotal || orderRecord.paid_total || 0) > 0 &&
    Number(orderRecord.remainingAmount || orderRecord.remaining_amount || 0) > 0 &&
    !['Retirado', 'Cancelado'].includes(String(orderRecord.status || '')) &&
    orderRecord.isActive !== false &&
    orderRecord.is_active !== false
  );
};

export const isOrderStockPending = (orderRecord) =>
  Boolean(orderRecord) &&
  hasDeferredOrderStockPolicy(orderRecord) &&
  Number(orderRecord.paidTotal || orderRecord.paid_total || 0) > 0 &&
  Number(orderRecord.remainingAmount || orderRecord.remaining_amount || 0) > 0 &&
  !['Retirado', 'Cancelado'].includes(String(orderRecord.status || '')) &&
  orderRecord.isActive !== false &&
  orderRecord.is_active !== false;

