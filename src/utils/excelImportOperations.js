export const canApplyExcelImportRow = ({
  applied = false,
  hasProduct = false,
  hasBlockingErrors = false,
  hasApplicableChanges = false,
} = {}) => (
  !applied
  && hasProduct
  && !hasBlockingErrors
  && hasApplicableChanges
);

export const runExcelImportBatch = async (
  items = [],
  worker,
  { concurrency = 4 } = {},
) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { succeeded: [], failed: [] };
  }
  if (typeof worker !== 'function') {
    throw new TypeError('La operacion del lote debe ser una funcion.');
  }

  const safeConcurrency = Math.max(1, Math.min(Math.trunc(Number(concurrency) || 1), items.length));
  const results = new Array(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = {
          status: 'fulfilled',
          item: items[index],
          value: await worker(items[index], index),
        };
      } catch (error) {
        results[index] = {
          status: 'rejected',
          item: items[index],
          error,
        };
      }
    }
  };

  await Promise.all(Array.from({ length: safeConcurrency }, () => runWorker()));

  return {
    succeeded: results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value),
    failed: results
      .filter((result) => result.status === 'rejected')
      .map((result) => ({ item: result.item, error: result.error })),
  };
};

const undoValuesEqual = (left, right) => {
  if (typeof left === 'number' || typeof right === 'number') {
    return Number(left || 0) === Number(right || 0);
  }
  if (left && typeof left === 'object' && right && typeof right === 'object') {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return (left ?? null) === (right ?? null);
};

const UNDO_FIELD_LABELS = {
  stock: 'stock',
  purchasePrice: 'costo',
  price: 'precio de venta',
  barcode: 'codigo de barras',
  supplierLinks: 'vinculo con Excel',
  isActive: 'estado del producto',
};

export const getExcelImportUndoConflicts = ({ current = {}, before = {}, after = {} } = {}) => (
  Object.keys(UNDO_FIELD_LABELS).filter((field) => (
    !undoValuesEqual(before[field], after[field])
    && !undoValuesEqual(current[field], after[field])
  )).map((field) => UNDO_FIELD_LABELS[field])
);

export const mergeExcelImportProductResult = (
  product = {},
  predictedAfter = {},
  actualAfter = null,
) => ({
  ...product,
  stock: actualAfter?.stock ?? predictedAfter.stock ?? product.stock,
  purchasePrice: actualAfter?.purchasePrice ?? predictedAfter.cost ?? product.purchasePrice,
  price: actualAfter?.price ?? predictedAfter.price ?? product.price,
  barcode: actualAfter?.barcode ?? predictedAfter.barcode ?? product.barcode,
  ...(actualAfter?.supplierLinks
    ? {
        supplierLinks: actualAfter.supplierLinks,
        supplier_links: actualAfter.supplierLinks,
      }
    : {}),
  ...(actualAfter?.isActive !== undefined
    ? {
        isActive: actualAfter.isActive,
        is_active: actualAfter.isActive,
      }
    : {}),
});
