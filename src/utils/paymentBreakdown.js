const CREDIT_SURCHARGE_RATE = 0.1;

const roundCurrency = (value) => {
  const numeric = Number(value) || 0;
  return Math.round(numeric * 100) / 100;
};

const buildRandomId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const getPaymentMethodLabel = (method) => {
  if (method === 'MercadoPago') return 'Mercado Pago';
  if (method === 'Debito') return 'Débito';
  if (method === 'Credito') return 'Crédito';
  if (method === 'Efectivo') return 'Efectivo';
  return String(method || 'Otros');
};

export const createPaymentLine = (overrides = {}) => ({
  id: overrides.id || buildRandomId('pay'),
  method: overrides.method || 'Efectivo',
  amount: roundCurrency(overrides.amount || 0),
  installments: Number(overrides.installments || 1),
  cashReceived: overrides.cashReceived === '' ? '' : roundCurrency(overrides.cashReceived || 0),
});

export const createOrderPaymentLine = (overrides = {}) => {
  const method = overrides.method || overrides.payment_method || 'Efectivo';
  const amount = roundCurrency(
    overrides.amount ??
    overrides.baseAmount ??
    overrides.base_amount ??
    overrides.allocated_amount ??
    overrides.chargedAmount ??
    overrides.charged_amount ??
    0,
  );
  const rawCashReceived = overrides.cashReceived ?? overrides.cash_received;
  const cashReceived = method === 'Efectivo'
    ? roundCurrency(
        rawCashReceived === '' || rawCashReceived === null || rawCashReceived === undefined
          ? amount
          : rawCashReceived,
      )
    : 0;

  return {
    id: overrides.id || buildRandomId('order_pay'),
    method,
    amount,
    surcharge: 0,
    chargedAmount: amount,
    installments: method === 'Credito' ? Number(overrides.installments || 1) || 1 : 0,
    cashReceived,
    cashChange: method === 'Efectivo'
      ? roundCurrency(overrides.cashChange ?? overrides.cash_change ?? Math.max(0, cashReceived - amount))
      : 0,
  };
};

export const createOrderPaymentEntry = (overrides = {}) => {
  const rawLines = Array.isArray(overrides.lines)
    ? overrides.lines
    : Array.isArray(overrides.paymentBreakdown)
      ? overrides.paymentBreakdown
      : [];
  const lines = rawLines
    .map((line) => createOrderPaymentLine(line))
    .filter((line) => Number(line.amount || 0) > 0);

  return {
    id: overrides.id || buildRandomId('order_entry'),
    entryType: overrides.entryType || overrides.type || 'payment',
    createdAt: overrides.createdAt || overrides.created_at || new Date().toISOString(),
    amount: roundCurrency(
      overrides.amount ??
      lines.reduce((sum, line) => sum + roundCurrency(line.amount), 0),
    ),
    lines,
  };
};

export const normalizeOrderPaymentHistory = (
  paymentHistory,
  fallbackPayment = 'Efectivo',
  fallbackInstallments = 0,
  fallbackPaidTotal = 0,
  fallbackCashReceived = 0,
  fallbackCashChange = 0,
) => {
  if (Array.isArray(paymentHistory) && paymentHistory.length > 0) {
    const entryLike = paymentHistory.some((entry) => Array.isArray(entry?.lines));

    if (entryLike) {
      return paymentHistory
        .map((entry) => createOrderPaymentEntry(entry))
        .filter((entry) => entry.lines.length > 0 && Number(entry.amount || 0) > 0);
    }

    const legacyLines = normalizePaymentBreakdown(
      paymentHistory,
      fallbackPayment,
      fallbackInstallments,
      fallbackCashReceived,
      fallbackCashChange,
      fallbackPaidTotal,
    );

    return legacyLines.length > 0 && Number(fallbackPaidTotal || 0) > 0
      ? [createOrderPaymentEntry({
          id: 'legacy_order_payment',
          entryType: 'legacy',
          amount: fallbackPaidTotal,
          lines: legacyLines.map((line) => createOrderPaymentLine(line)),
        })]
      : [];
  }

  const paidTotal = roundCurrency(fallbackPaidTotal || 0);
  if (paidTotal <= 0) return [];

  const legacyLines = normalizePaymentBreakdown(
    null,
    fallbackPayment,
    fallbackInstallments,
    fallbackCashReceived,
    fallbackCashChange,
    paidTotal,
  );

  return [createOrderPaymentEntry({
    id: 'legacy_order_payment',
    entryType: 'legacy',
    amount: paidTotal,
    lines: legacyLines.map((line) => createOrderPaymentLine(line)),
  })];
};

export const flattenOrderPaymentHistory = (paymentHistory = []) =>
  normalizeOrderPaymentHistory(paymentHistory).flatMap((entry) =>
    (entry.lines || []).map((line, index) => ({
      ...line,
      entryId: entry.id,
      entryType: entry.entryType || 'payment',
      createdAt: entry.createdAt || null,
      id: line.id || `${entry.id || 'entry'}_${index}`,
    }))
  );

export const getOrderPaymentHistorySummary = (
  paymentHistory,
  fallbackPayment = 'Efectivo',
  fallbackInstallments = 0,
  fallbackPaidTotal = 0,
  fallbackCashReceived = 0,
  fallbackCashChange = 0,
) => {
  const normalizedHistory = normalizeOrderPaymentHistory(
    paymentHistory,
    fallbackPayment,
    fallbackInstallments,
    fallbackPaidTotal,
    fallbackCashReceived,
    fallbackCashChange,
  );
  const paymentBreakdown = flattenOrderPaymentHistory(normalizedHistory);
  const primaryPaymentInfo = getPrimaryPaymentInfo(
    paymentBreakdown,
    fallbackPayment,
    fallbackInstallments,
    fallbackCashReceived,
    fallbackCashChange,
    fallbackPaidTotal,
  );

  return {
    paymentHistory: normalizedHistory,
    paymentBreakdown,
    paymentMethod: primaryPaymentInfo.payment,
    primaryMethod: primaryPaymentInfo.primaryMethod,
    installments: primaryPaymentInfo.installments,
    cashReceived: primaryPaymentInfo.cashReceived,
    cashChange: primaryPaymentInfo.cashChange,
  };
};

export const getPaymentLineSurcharge = (line) => {
  if (line?.method !== 'Credito') return 0;
  return roundCurrency((Number(line?.amount) || 0) * CREDIT_SURCHARGE_RATE);
};

export const getPaymentLineChargedTotal = (line) => {
  return roundCurrency((Number(line?.amount) || 0) + getPaymentLineSurcharge(line));
};

export const getPaymentLineCashReceived = (line) => {
  if (line?.method !== 'Efectivo') return 0;
  const chargedTotal = getPaymentLineChargedTotal(line);
  if (line?.cashReceived === '' || line?.cashReceived === null || line?.cashReceived === undefined) {
    return chargedTotal;
  }
  const numeric = Number(line.cashReceived);
  return Number.isFinite(numeric) && numeric > 0 ? roundCurrency(numeric) : chargedTotal;
};

export const getPaymentLineCashChange = (line) => {
  if (line?.method !== 'Efectivo') return 0;
  return roundCurrency(Math.max(0, getPaymentLineCashReceived(line) - getPaymentLineChargedTotal(line)));
};

export const getPaymentLineCashMissing = (line) => {
  if (line?.method !== 'Efectivo') return 0;
  return roundCurrency(Math.max(0, getPaymentLineChargedTotal(line) - getPaymentLineCashReceived(line)));
};

export const normalizePaymentBreakdown = (
  paymentBreakdown,
  fallbackPayment = 'Efectivo',
  fallbackInstallments = 0,
  fallbackCashReceived = 0,
  fallbackCashChange = 0,
  fallbackTotal = 0,
) => {
  if (Array.isArray(paymentBreakdown) && paymentBreakdown.length > 0) {
    return paymentBreakdown.map((entry, index) => {
      const method = entry?.method || entry?.payment_method || fallbackPayment || 'Efectivo';
      const baseAmount = roundCurrency(
        entry?.amount ?? entry?.baseAmount ?? entry?.base_amount ?? entry?.subtotal ?? entry?.allocated_amount ?? 0,
      );
      const surcharge = roundCurrency(
        entry?.surcharge ?? entry?.creditSurcharge ?? entry?.credit_surcharge ?? getPaymentLineSurcharge({ method, amount: baseAmount }),
      );
      const chargedAmount = roundCurrency(
        entry?.chargedAmount ??
        entry?.charged_amount ??
        entry?.total ??
        entry?.lineTotal ??
        (baseAmount + surcharge),
      );
      const rawCashReceived = entry?.cashReceived ?? entry?.cash_received;
      const cashReceived = method === 'Efectivo'
        ? roundCurrency(
            rawCashReceived === '' || rawCashReceived === null || rawCashReceived === undefined
              ? chargedAmount
              : rawCashReceived,
          )
        : 0;
      const cashChange = method === 'Efectivo'
        ? roundCurrency(entry?.cashChange ?? entry?.cash_change ?? Math.max(0, cashReceived - chargedAmount))
        : 0;

      return {
        id: entry?.id || `normalized_${index}`,
        method,
        label: getPaymentMethodLabel(method),
        amount: baseAmount,
        surcharge,
        chargedAmount,
        installments: method === 'Credito' ? Number(entry?.installments || 1) : 0,
        cashReceived,
        cashChange,
      };
    });
  }

  const method = fallbackPayment || 'Efectivo';
  const installments = method === 'Credito' ? Number(fallbackInstallments || 1) : 0;
  const total = roundCurrency(fallbackTotal || 0);
  const surcharge = method === 'Credito' ? roundCurrency(total - (total / (1 + CREDIT_SURCHARGE_RATE))) : 0;
  const amount = method === 'Credito' ? roundCurrency(total - surcharge) : total;
  const cashReceived = method === 'Efectivo'
    ? roundCurrency(fallbackCashReceived || total)
    : 0;
  const cashChange = method === 'Efectivo'
    ? roundCurrency(fallbackCashChange || Math.max(0, cashReceived - total))
    : 0;

  return [{
    id: 'legacy',
    method,
    label: getPaymentMethodLabel(method),
    amount,
    surcharge,
    chargedAmount: total,
    installments,
    cashReceived,
    cashChange,
  }];
};

export const getPaymentBreakdownTotals = (paymentLines = []) => {
  const normalized = normalizePaymentBreakdown(paymentLines);
  const baseTotal = normalized.reduce((sum, line) => sum + roundCurrency(line.amount), 0);
  const surchargeTotal = normalized.reduce((sum, line) => sum + roundCurrency(line.surcharge), 0);
  const chargedTotal = normalized.reduce((sum, line) => sum + roundCurrency(line.chargedAmount), 0);
  const cashReceivedTotal = normalized.reduce((sum, line) => sum + roundCurrency(line.cashReceived || 0), 0);
  const cashChangeTotal = normalized.reduce((sum, line) => sum + roundCurrency(line.cashChange || 0), 0);
  const cashMissingTotal = normalized.reduce(
    (sum, line) => sum + roundCurrency(getPaymentLineCashMissing(line)),
    0,
  );

  return {
    baseTotal: roundCurrency(baseTotal),
    surchargeTotal: roundCurrency(surchargeTotal),
    chargedTotal: roundCurrency(chargedTotal),
    cashReceivedTotal: roundCurrency(cashReceivedTotal),
    cashChangeTotal: roundCurrency(cashChangeTotal),
    cashMissingTotal: roundCurrency(cashMissingTotal),
  };
};

export const getPaymentSummary = (paymentBreakdown, fallbackPayment = 'Efectivo', fallbackInstallments = 0) => {
  const normalized = normalizePaymentBreakdown(paymentBreakdown, fallbackPayment, fallbackInstallments);
  const uniqueMethods = [...new Set(normalized.map((line) => getPaymentMethodLabel(line.method)).filter(Boolean))];
  if (uniqueMethods.length === 0) return getPaymentMethodLabel(fallbackPayment);
  return uniqueMethods.join(' + ');
};

export const getPrimaryPaymentInfo = (
  paymentBreakdown,
  fallbackPayment = 'Efectivo',
  fallbackInstallments = 0,
  fallbackCashReceived = 0,
  fallbackCashChange = 0,
  fallbackTotal = 0,
) => {
  const normalized = normalizePaymentBreakdown(
    paymentBreakdown,
    fallbackPayment,
    fallbackInstallments,
    fallbackCashReceived,
    fallbackCashChange,
    fallbackTotal,
  );
  const firstLine = normalized[0] || null;

  return {
    payment: getPaymentSummary(normalized, fallbackPayment, fallbackInstallments),
    primaryMethod: firstLine?.method || fallbackPayment || 'Efectivo',
    installments:
      normalized.find((line) => line.method === 'Credito')?.installments ||
      (fallbackPayment === 'Credito' ? Number(fallbackInstallments || 0) : 0),
    cashReceived: normalized
      .filter((line) => line.method === 'Efectivo')
      .reduce((sum, line) => sum + roundCurrency(line.cashReceived || 0), 0),
    cashChange: normalized
      .filter((line) => line.method === 'Efectivo')
      .reduce((sum, line) => sum + roundCurrency(line.cashChange || 0), 0),
    paymentBreakdown: normalized,
  };
};

export const getPaymentMethodTotals = (paymentBreakdown, fallbackPayment, fallbackInstallments, fallbackCashReceived, fallbackCashChange, fallbackTotal) => {
  const normalized = normalizePaymentBreakdown(
    paymentBreakdown,
    fallbackPayment,
    fallbackInstallments,
    fallbackCashReceived,
    fallbackCashChange,
    fallbackTotal,
  );
  return normalized.reduce((acc, line) => {
    const label = getPaymentMethodLabel(line.method);
    acc[label] = roundCurrency((acc[label] || 0) + roundCurrency(line.chargedAmount));
    return acc;
  }, {});
};

export const matchesPaymentFilter = (paymentBreakdown, filterPayment, fallbackPayment, fallbackInstallments, fallbackCashReceived, fallbackCashChange, fallbackTotal) => {
  if (!filterPayment) return true;
  const normalized = normalizePaymentBreakdown(
    paymentBreakdown,
    fallbackPayment,
    fallbackInstallments,
    fallbackCashReceived,
    fallbackCashChange,
    fallbackTotal,
  );
  return normalized.some((line) => line.method === filterPayment);
};

export const getPaymentBreakdownDisplayItems = (
  paymentBreakdown,
  fallbackPayment = 'Efectivo',
  fallbackInstallments = 0,
  fallbackCashReceived = 0,
  fallbackCashChange = 0,
  fallbackTotal = 0,
) => {
  const normalized = normalizePaymentBreakdown(
    paymentBreakdown,
    fallbackPayment,
    fallbackInstallments,
    fallbackCashReceived,
    fallbackCashChange,
    fallbackTotal,
  );

  return normalized.map((line, index) => {
    const parts = [getPaymentMethodLabel(line.method)];
    if (line.method === 'Credito' && Number(line.installments) > 1) {
      parts.push(`${line.installments} cuotas`);
    }

    return {
      ...line,
      key: line.id || `payment_${index}`,
      label: getPaymentMethodLabel(line.method),
      title: parts.join(' · '),
    };
  });
};
