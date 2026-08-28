const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const formatCurrency = (value) => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(toFiniteNumber(value));

const formatQuantity = (item) => {
  const quantity = toFiniteNumber(item?.qty ?? item?.quantity);
  if (item?.product_type !== 'weight') return `${quantity} u.`;
  if (quantity >= 1000 && quantity % 100 === 0) return `${quantity / 1000} kg`;
  return `${quantity} g`;
};

const calculateSubtotal = (item) => {
  const quantity = toFiniteNumber(item?.qty ?? item?.quantity);
  const price = toFiniteNumber(item?.newPrice ?? item?.unit_price ?? item?.price);
  return item?.product_type === 'weight' ? price * quantity / 1000 : price * quantity;
};

const buildExportPdfHtml = (input = {}) => {
  const config = input?.config && typeof input.config === 'object' ? input.config : {};
  const items = Array.isArray(input?.items)
    ? input.items.filter((item) => item && typeof item === 'object').slice(0, 500)
    : [];
  const groupedItems = new Map();
  items.forEach((item) => {
    const category = String(item.category || 'Otros');
    if (!groupedItems.has(category)) groupedItems.set(category, []);
    groupedItems.get(category).push(item);
  });

  const rows = Array.from(groupedItems.entries()).map(([category, categoryItems]) => `
    <tr class="category"><td colspan="4">${escapeHtml(category)}</td></tr>
    ${categoryItems.map((item) => {
      const price = toFiniteNumber(item.newPrice ?? item.unit_price ?? item.price);
      return `<tr>
        <td>${escapeHtml(item.title || 'Artículo')}</td>
        <td class="number">${escapeHtml(formatQuantity(item))}</td>
        <td class="number">${escapeHtml(formatCurrency(price))}</td>
        <td class="number strong">${escapeHtml(formatCurrency(calculateSubtotal(item)))}</td>
      </tr>`;
    }).join('')}
  `).join('');

  const calculatedTotal = items.reduce((total, item) => total + calculateSubtotal(item), 0);
  const summary = config?.financialSummary && typeof config.financialSummary === 'object'
    ? config.financialSummary
    : {};
  const total = Number.isFinite(Number(summary.totalAmount))
    ? Number(summary.totalAmount)
    : calculatedTotal;
  const paid = toFiniteNumber(summary.paidTotal);
  const remaining = Number.isFinite(Number(summary.remainingAmount))
    ? Number(summary.remainingAmount)
    : Math.max(total - paid, 0);
  const hasPaymentSummary = paid > 0 || remaining > 0;
  const generatedAt = input.date || new Intl.DateTimeFormat('es-AR').format(new Date());

  return `<!doctype html>
  <html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="light">
    <style>
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #fff; color: #0f172a; }
      body { font: 12px/1.42 Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0f172a; padding-bottom: 12px; }
      .brand { font-size: 13px; font-weight: 800; letter-spacing: .18em; color: #64748b; }
      h1 { margin: 5px 0 0; font-size: 25px; letter-spacing: .12em; }
      .date { text-align: right; color: #475569; }
      .customer { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 22px; margin-top: 17px; padding: 12px; border: 1px solid #cbd5e1; background: #f8fafc; }
      .field small { display: block; margin-bottom: 2px; color: #64748b; font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .field strong { font-size: 13px; }
      table { width: 100%; margin-top: 17px; border-collapse: collapse; }
      thead { display: table-header-group; }
      th { padding: 8px 7px; border-block: 2px solid #334155; background: #f1f5f9; color: #334155; font-size: 10px; text-align: left; text-transform: uppercase; }
      td { padding: 7px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      tr { break-inside: avoid; }
      .category td { padding: 6px 7px; background: #f1f5f9; color: #475569; font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
      .number { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .strong { font-weight: 700; }
      .summary { width: 270px; margin: 18px 0 0 auto; border-top: 2px solid #0f172a; }
      .summary div { display: flex; justify-content: space-between; gap: 16px; padding-top: 7px; color: #475569; }
      .summary .total { color: #0f172a; font-size: 18px; font-weight: 800; }
      footer { margin-top: 24px; border-top: 1px solid #cbd5e1; padding-top: 8px; color: #64748b; font-size: 9px; }
    </style>
  </head>
  <body>
    <header>
      <div><div class="brand">REBU COTILLÓN</div><h1>${escapeHtml(config.documentTitle || 'PRESUPUESTO')}</h1></div>
      <div class="date">${escapeHtml(config.createdAtLabel || 'Fecha')}<br><strong>${escapeHtml(config.createdAtDisplay || generatedAt)}</strong></div>
    </header>
    <section class="customer">
      <div class="field"><small>Cliente</small><strong>${escapeHtml(config.clientName || 'Cliente')}</strong></div>
      <div class="field"><small>Teléfono</small><strong>${escapeHtml(config.clientPhone || '-')}</strong></div>
      ${config.clientEvent ? `<div class="field"><small>Evento</small><strong>${escapeHtml(config.clientEvent)}</strong></div>` : ''}
      ${config.pickupDate ? `<div class="field"><small>${escapeHtml(config.pickupDateLabel || 'Fecha de retiro')}</small><strong>${escapeHtml(config.pickupDate)}</strong></div>` : ''}
    </section>
    <table>
      <thead><tr><th>Producto</th><th class="number">Cantidad</th><th class="number">Precio unit.</th><th class="number">Subtotal</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">Sin artículos</td></tr>'}</tbody>
    </table>
    <section class="summary">
      ${hasPaymentSummary ? `<div><span>Abonado</span><strong>${escapeHtml(formatCurrency(paid))}</strong></div><div><span>Restante</span><strong>${escapeHtml(formatCurrency(remaining))}</strong></div>` : ''}
      <div class="total"><span>Total</span><strong>${escapeHtml(formatCurrency(total))}</strong></div>
    </section>
    <footer>Documento generado por Rebu Cotillón.</footer>
  </body>
  </html>`;
};

module.exports = { buildExportPdfHtml };
