const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const toFiniteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatMoney = (value) => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(toFiniteNumber(value));

const formatPercent = (value, { signed = false } = {}) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  const sign = signed && numeric > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(numeric)}%`;
};

const formatDateTime = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
};

const buildDeltaCell = (delta = {}) => {
  if (!delta.changed) return '<span class="delta neutral">Sin cambio</span>';
  const directionClass = Number(delta.amount) > 0 ? 'increase' : 'decrease';
  const arrow = Number(delta.amount) > 0 ? '&#9650;' : '&#9660;';
  const percent = Number.isFinite(Number(delta.percent))
    ? formatPercent(Number(delta.percent), { signed: true })
    : formatMoney(delta.amount);
  return `<span class="delta ${directionClass}">${arrow} ${escapeHtml(percent)}</span>`;
};

const buildReference = (change = {}) => {
  const references = [];
  if (change.barcode) references.push(`Código ${change.barcode}`);
  if (change.supplierCode) references.push(`Prov. ${change.supplierCode}`);
  if (change.casaAlbertoId) references.push(`ID ${change.casaAlbertoId}`);
  return references.join(' - ');
};

const buildRows = (changes = []) => changes.map((change) => {
  const direction = ['increase', 'decrease'].includes(change?.direction) ? change.direction : 'neutral';
  const reference = buildReference(change);
  const primaryDelta = change?.cost?.changed ? change.cost : change.sale;
  return `<tr class="${direction}">
    <td class="date-cell"><strong>${escapeHtml(formatDateTime(change.createdAt))}</strong><span>${escapeHtml(change.eventLabel || 'Aprobación')} - ${escapeHtml(change.user || 'Sistema')}</span></td>
    <td class="product-cell"><strong>${escapeHtml(change.title || 'Producto sin nombre')}</strong>${reference ? `<span>${escapeHtml(reference)}</span>` : ''}</td>
    <td class="number old-value">${escapeHtml(formatMoney(change?.cost?.previous))}</td>
    <td class="number new-value">${escapeHtml(formatMoney(change?.cost?.next))}</td>
    <td class="number old-value">${escapeHtml(formatMoney(change?.sale?.previous))}</td>
    <td class="number new-value">${escapeHtml(formatMoney(change?.sale?.next))}</td>
    <td class="number">${buildDeltaCell(primaryDelta)}</td>
  </tr>`;
}).join('');

const buildSupplierPriceReportHtml = (input = {}) => {
  const report = input?.report && typeof input.report === 'object' ? input.report : input;
  const changes = Array.isArray(report?.changes) ? report.changes : [];
  const summary = report?.summary && typeof report.summary === 'object' ? report.summary : {};
  const periodLabel = report?.period?.label || 'Período seleccionado';
  const generatedAt = formatDateTime(report?.generatedAt || new Date().toISOString());
  const maxIncrease = Number.isFinite(Number(summary.maxIncreasePercent))
    ? formatPercent(summary.maxIncreasePercent, { signed: true })
    : '-';

  return `<!doctype html>
  <html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="light">
    <style>
      @page { size: A4 landscape; margin: 10mm 11mm 13mm; }
      * { box-sizing: border-box; }
      html { background: #ffffff; }
      body { margin: 0; color: #122033; background: #ffffff; font: 9px/1.35 Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      header { display: flex; align-items: flex-start; justify-content: space-between; border-top: 4px solid #14375b; padding-top: 9px; }
      .eyebrow { margin: 0 0 3px; color: #567088; font-size: 8px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
      h1 { margin: 0; color: #10233a; font-size: 21px; line-height: 1.05; letter-spacing: -.02em; }
      .subtitle { margin: 5px 0 0; color: #4f6478; font-size: 10px; font-weight: 700; }
      .document-meta { border-left: 1px solid #ccd7e2; padding-left: 15px; text-align: right; color: #52677a; }
      .document-meta strong { display: block; margin-bottom: 3px; color: #18314d; font-size: 11px; }
      .summary { display: grid; grid-template-columns: 1.1fr 1.1fr 1fr 1fr 1.1fr; gap: 6px; margin: 9px 0 7px; }
      .metric { min-height: 41px; border: 1px solid #d4dee8; border-radius: 5px; background: #f7f9fc; padding: 6px 9px; }
      .metric span { display: block; color: #64778a; font-size: 7px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
      .metric strong { display: block; margin-top: 2px; color: #122b46; font-size: 17px; line-height: 1; font-variant-numeric: tabular-nums; }
      .metric.increase { border-color: #efc876; background: #fff9eb; }
      .metric.increase strong { color: #8c5b04; }
      .metric.decrease { border-color: #9bd6bd; background: #f0fbf6; }
      .metric.decrease strong { color: #14714c; }
      .caption { margin: 0 0 6px; color: #607387; font-size: 8px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      col.date { width: 12%; } col.product { width: 28%; } col.money { width: 12%; } col.delta { width: 12%; }
      thead { display: table-header-group; }
      th { border-top: 1px solid #aebecd; border-bottom: 2px solid #6f8498; background: #edf2f7; padding: 6px 5px; color: #41566a; font-size: 7px; font-weight: 800; letter-spacing: .08em; text-align: left; text-transform: uppercase; }
      th.number, td.number { text-align: right; }
      tbody tr { break-inside: avoid; page-break-inside: avoid; }
      tbody tr.increase { box-shadow: inset 3px 0 0 #e2a827; }
      tbody tr.decrease { box-shadow: inset 3px 0 0 #2f9f72; }
      td { border-bottom: 1px solid #dde5ed; padding: 4px 5px; vertical-align: top; }
      td strong { color: #172b43; font-size: 8px; }
      td span { display: block; margin-top: 2px; color: #6d7f90; font-size: 7px; }
      .date-cell, .number { white-space: nowrap; font-variant-numeric: tabular-nums; }
      .product-cell { overflow-wrap: anywhere; }
      .old-value { color: #728296; }
      .new-value { color: #142b45; font-weight: 800; }
      .delta { display: inline-block; margin: 0; border-radius: 3px; padding: 3px 5px; font-size: 7px; font-weight: 800; }
      .delta.increase { color: #885904; background: #fff0c7; }
      .delta.decrease { color: #116543; background: #daf5e8; }
      .delta.neutral { color: #64748b; background: #eef2f6; }
      .empty { border: 1px dashed #b9c6d3; padding: 24px; color: #64778a; text-align: center; }
      footer { position: fixed; right: 0; bottom: -8mm; left: 0; display: flex; justify-content: space-between; border-top: 1px solid #d5dee7; padding-top: 4px; color: #7a8998; font-size: 7px; }
    </style>
  </head>
  <body>
    <header>
      <div>
        <p class="eyebrow">Rebu Cotillón - Auditoría de precios</p>
        <h1>Cambios de precios - Casa Alberto</h1>
        <p class="subtitle">${escapeHtml(periodLabel)} - desde ${escapeHtml(formatDateTime(report?.cutoff))}</p>
      </div>
      <div class="document-meta"><strong>Historial registrado</strong>Generado: ${escapeHtml(generatedAt)}<br>Los importes se expresan en pesos argentinos.</div>
    </header>
    <section class="summary">
      <div class="metric"><span>Cambios registrados</span><strong>${escapeHtml(summary.changeCount ?? changes.length)}</strong></div>
      <div class="metric"><span>Productos distintos</span><strong>${escapeHtml(summary.uniqueProducts ?? 0)}</strong></div>
      <div class="metric increase"><span>Subas de costo</span><strong>${escapeHtml(summary.costIncreases ?? 0)}</strong></div>
      <div class="metric decrease"><span>Bajas de costo</span><strong>${escapeHtml(summary.costDecreases ?? 0)}</strong></div>
      <div class="metric increase"><span>Mayor aumento</span><strong>${escapeHtml(maxIncrease)}</strong></div>
    </section>
    <p class="caption">Cada fila corresponde a una aprobación o reversión registrada. Un mismo producto puede aparecer más de una vez si cambió nuevamente dentro del período.</p>
    ${changes.length ? `<table>
      <colgroup><col class="date"><col class="product"><col class="money"><col class="money"><col class="money"><col class="money"><col class="delta"></colgroup>
      <thead><tr><th>Fecha / usuario</th><th>Producto</th><th class="number">Costo anterior</th><th class="number">Costo nuevo</th><th class="number">Venta anterior</th><th class="number">Venta nueva</th><th class="number">Variación principal</th></tr></thead>
      <tbody>${buildRows(changes)}</tbody>
    </table>` : '<div class="empty">No se registraron cambios aprobados para este período.</div>'}
    <footer><span>Rebu Cotillón - Casa Alberto</span><span>Documento generado desde el historial de aprobaciones. No modifica el inventario.</span></footer>
  </body>
  </html>`;
};

module.exports = {
  buildSupplierPriceReportHtml,
  escapeHtml,
};
