export const TRANSACTION_SNAPSHOT_SCOPE_FULL = 'full';
export const TRANSACTION_SNAPSHOT_SCOPE_PARTIAL = 'partial';

const recordHasOwnColumn = (record, columnName) =>
  Object.prototype.hasOwnProperty.call(record || {}, columnName);

export const saleRowsRequireHistoryLogs = (sales = []) =>
  (Array.isArray(sales) ? sales : []).some((sale) => {
    const requiredSaleColumns = [
      'payment_breakdown',
      'cash_received',
      'cash_change',
      'user_id',
      'user_role',
      'status',
      'voided_at',
    ];

    if (requiredSaleColumns.some((columnName) => !recordHasOwnColumn(sale, columnName))) return true;

    const items = Array.isArray(sale.sale_items) ? sale.sale_items : [];
    if (Number(sale.total || 0) > 0 && items.length === 0) return true;

    const requiredItemColumns = ['subtotal', 'cost', 'is_custom', 'is_discount', 'is_combo', 'product_type'];
    return items.some((item) =>
      requiredItemColumns.some((columnName) => !recordHasOwnColumn(item, columnName))
    );
  });

export const getTransactionSnapshotScope = (snapshot) => (
  Array.isArray(snapshot?.transactions) &&
  snapshot?.transactionsScope === TRANSACTION_SNAPSHOT_SCOPE_FULL
    ? TRANSACTION_SNAPSHOT_SCOPE_FULL
    : TRANSACTION_SNAPSHOT_SCOPE_PARTIAL
);

export const shouldUseIncrementalTransactionSync = ({
  fullRequested = false,
  hasExistingTransactions = false,
  snapshotScope = TRANSACTION_SNAPSHOT_SCOPE_PARTIAL,
} = {}) => (
  !fullRequested &&
  hasExistingTransactions &&
  snapshotScope === TRANSACTION_SNAPSHOT_SCOPE_FULL
);

export const shouldHydrateFullTransactionHistory = ({
  fullRequested = false,
  progressive = false,
} = {}) => Boolean(fullRequested || !progressive);

export const shouldUseIncrementalMetricsSync = ({
  fullRequested = false,
  includeTransactions = true,
  hasExistingMetricsData = false,
  hasExistingTransactions = false,
  transactionSnapshotScope = TRANSACTION_SNAPSHOT_SCOPE_PARTIAL,
} = {}) => (
  !fullRequested &&
  hasExistingMetricsData &&
  (
    !includeTransactions ||
    shouldUseIncrementalTransactionSync({
      hasExistingTransactions,
      snapshotScope: transactionSnapshotScope,
    })
  )
);
