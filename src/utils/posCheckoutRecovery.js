export const POS_CHECKOUT_JOURNAL_KEY = 'party_pos_checkout_attempts_v1';

const copy = (value) => JSON.parse(JSON.stringify(value));

export const posCheckoutValuesEqual = (left, right) => {
  const stable = (value) => Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
      : value;
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
};

export const compactPosCheckoutItems = (items) => items.map((item) => {
  const fields = ['id', 'productId', 'title', 'quantity', 'qty', 'price', 'subtotal', 'lineSubtotal',
    'product_type', 'isReward', 'isCustom', 'isCombo', 'isDiscount', 'isPosBag', 'itemKind',
    'couponCode', 'cost', 'unitCost', 'purchasePrice', 'costAtSale', 'unitCostAtSale',
    'purchasePriceAtSale', 'priceAtSale', 'costSource', 'category', 'categories'];
  return {
    ...Object.fromEntries(fields.filter((key) => item[key] !== undefined).map((key) => [key, item[key]])),
    ...(Array.isArray(item.productsIncluded) ? { productsIncluded: compactPosCheckoutItems(item.productsIncluded) } : {}),
  };
});

// Unlike the general offline cache, this journal must never silently discard a
// write: the request cannot reach the server until its key and payload are safe.
export const createPosCheckoutJournal = ({ storage, key = POS_CHECKOUT_JOURNAL_KEY }) => {
  const read = () => {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || Array.isArray(data) || typeof data !== 'object') {
      throw new Error('No se pudo leer el registro local de cobros.');
    }
    for (const [cartId, attempt] of Object.entries(data)) {
      if (attempt?.cartId !== cartId || !attempt?.request?.operationKey || !attempt?.request?.salePayload) {
        throw new Error('El registro local de cobros está incompleto. No se enviará otro cobro.');
      }
    }
    return data;
  };
  const write = (data) => {
    const serialized = JSON.stringify(data);
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) throw new Error('No se pudo asegurar el cobro en el almacenamiento local.');
  };
  const put = (attempt) => {
    const data = read();
    data[attempt.cartId] = copy(attempt);
    write(data);
    return data[attempt.cartId];
  };
  return {
    read,
    get: (cartId) => read()[cartId] || null,
    ensure: (attempt) => read()[attempt.cartId] || put(attempt),
    patch: (cartId, patch) => {
      const attempt = read()[cartId];
      if (!attempt) throw new Error('No se encontró el intento de cobro guardado.');
      return put({ ...attempt, ...patch });
    },
    remove: (cartId) => {
      const data = read();
      delete data[cartId];
      write(data);
    },
    pruneCompleted: (persistedCartIds) => {
      const data = read();
      const active = new Set(persistedCartIds.map(String));
      let changed = false;
      for (const [cartId, attempt] of Object.entries(data)) {
        if (attempt.status === 'completed' && !active.has(cartId)) {
          delete data[cartId];
          changed = true;
        }
      }
      if (changed) write(data);
      return changed;
    },
  };
};

export const isDefinitePosCheckoutRejection = (error) => (
  /^(22023|23503|23505|23514|42501|40001|40P01|57014|P0001)$/.test(String(error?.code || ''))
);

export const executePosCheckoutAttempt = async ({ journal, attempt, registerSale, loadSale, onConfirmed }) => {
  let saved = journal.ensure(attempt);
  if (!saved.saleId) {
    const previouslySubmitted = saved.submitted === true;
    saved = journal.patch(saved.cartId, { submitted: true });
    let result;
    try {
      // Always replay the frozen request, even if the caller supplies a newer cart.
      result = await registerSale(copy(saved.request));
    } catch (error) {
      // A PostgreSQL rejection rolled the transaction back. Network errors do
      // not tell us whether it committed, so their attempt must remain intact.
      if (!previouslySubmitted && isDefinitePosCheckoutRejection(error)) journal.remove(saved.cartId);
      throw error;
    }
    if (!result?.id) throw new Error('La nube no devolvió la identificación del cobro.');
    saved = journal.patch(saved.cartId, {
      saleId: result.id,
      duplicate: result._duplicate === true,
      status: 'confirmed',
    });
    if (onConfirmed) await onConfirmed(saved);
  }
  // A confirmed ID is persisted before this read. If the read fails, retrying
  // only fetches the receipt; it never submits or discounts the sale again.
  const sale = await loadSale(saved);
  if (!sale?.id || String(sale.id) !== String(saved.saleId)) {
    throw new Error('Todavía no se pudo recuperar la venta confirmada desde la nube.');
  }
  return { sale, attempt: saved };
};
