import React from 'react';
import { formatCurrency, formatNumber, formatTime24 } from '../utils/helpers';
import { getPaymentBreakdownDisplayItems, getPaymentSummary } from '../utils/paymentBreakdown';

const LINE_WIDTH = 24;

const line = (left = '', right = '') => {
  let l = String(left);
  const r = String(right);
  const rightWidth = r.length + 1;
  const maxLeftWidth = LINE_WIDTH - rightWidth;

  if (l.length > maxLeftWidth) {
    l = l.slice(0, maxLeftWidth);
  }

  const space = LINE_WIDTH - l.length - r.length;
  return l + ' '.repeat(Math.max(0, space)) + r;
};

const center = (text = '') => {
  const t = String(text).slice(0, LINE_WIDTH);
  const space = Math.floor((LINE_WIDTH - t.length) / 2);
  return ' '.repeat(Math.max(0, space)) + t;
};

const divider = () => '-'.repeat(LINE_WIDTH);

const getExplicitSubtotal = (item = {}) => {
  const explicitSubtotal = Number(item.subtotal ?? item.lineSubtotal ?? item.line_subtotal ?? item.lineTotal);
  return Number.isFinite(explicitSubtotal) && explicitSubtotal !== 0 ? explicitSubtotal : null;
};

const getLineSubtotal = (item = {}) => {
  const explicitSubtotal = getExplicitSubtotal(item);
  if (explicitSubtotal !== null) return explicitSubtotal;

  const qty = Number(item.qty || item.quantity || 0);
  const price = Number(item.price || 0);
  if ((item.product_type || 'quantity') !== 'weight') return price * qty;
  return price >= 100 ? price * (qty / 1000) : price * qty;
};

export const TicketPrintLayout = ({ transaction }) => {
  if (!transaction) return null;

  const paymentItems = getPaymentBreakdownDisplayItems(
    transaction.paymentBreakdown,
    transaction.payment,
    transaction.installments,
    transaction.cashReceived,
    transaction.cashChange,
    transaction.total,
  );
  const paymentSummary = getPaymentSummary(
    transaction.paymentBreakdown,
    transaction.payment,
    transaction.installments,
  );

  const formattedId = String(transaction.id).padStart(6, '0');
  const dateStr = transaction.date?.split(',')[0] || transaction.date;
  const timeStr = transaction.time ? formatTime24(transaction.time) : '--:--';

  const allItems = transaction.items || [];
  const items = allItems.filter((item) => item.type !== 'discount' && !item.isDiscount);
  const redemptionDiscounts = allItems.filter((item) => item.type === 'discount' || item.isDiscount);
  const itemsSubtotal = items.reduce((acc, item) => {
    if (item.isReward) return acc;
    return acc + getLineSubtotal(item);
  }, 0);
  const totalRedemptionDiscount = redemptionDiscounts.reduce(
    (acc, item) => acc + Math.abs(getLineSubtotal(item)),
    0,
  );
  const surcharge = transaction.total > itemsSubtotal - totalRedemptionDiscount + 0.5
    ? transaction.total - (itemsSubtotal - totalRedemptionDiscount)
    : 0;

  const pointsSpent = Number(transaction.pointsSpent || 0);
  const showRedemption = pointsSpent > 0;
  const pointsGained = Number(transaction.pointsEarned || transaction.pointsGainedReal || transaction.pointsGained || 0);
  const pointsChangeNew = Number(transaction.pointsChange?.new);
  const clientCurrentPoints = Number(transaction.client?.currentPoints ?? transaction.client?.points);
  const currentPointsDisplay = transaction.client
    ? Number.isFinite(pointsChangeNew)
      ? pointsChangeNew
      : Number.isFinite(clientCurrentPoints)
        ? clientCurrentPoints
        : 0
    : 0;

  const lines = [];

  lines.push(center('REBU COTILLON'));
  lines.push(center('Articulos para Fiestas'));
  lines.push(divider());
  lines.push(center('Calle 158 4440'));
  lines.push(center('Berazategui'));
  lines.push(center('Numero: 11 6638-4715'));
  lines.push(center('Insta: @rebucotillon'));
  lines.push(divider());

  if (transaction.client) {
    const memberNum = String(transaction.client.memberNumber || '0').padStart(4, '0');
    const clientName = String(transaction.client.name || 'Socio').toUpperCase();

    lines.push(`Socio (#${memberNum}):`);
    lines.push(clientName);

    if (!transaction.isPointsTicket) {
      if (showRedemption) {
        lines.push(line('Pts canjeados:', `-${formatNumber(pointsSpent)}`));
      }
      lines.push(line('Pts ganados:', `+${formatNumber(pointsGained)}`));
    }

    lines.push(line('Saldo actual:', `${formatNumber(currentPointsDisplay)}`));
    lines.push(divider());
  }

  lines.push(`${dateStr} ${timeStr}`);
  lines.push(`#${formattedId}`);
  lines.push(divider());

  if (!transaction.isPointsTicket) {
    lines.push(line('DESCRIPCION', 'IMPORTE'));

    items.forEach((item) => {
      const qty = Number(item.qty || item.quantity || 1);
      const titlePrefix = qty !== 1 ? `(${formatNumber(qty)}) ` : '';
      const fullTitle = titlePrefix + (item.title || 'Producto');
      const priceStr = item.isReward ? 'GRATIS' : formatCurrency(getLineSubtotal(item));

      lines.push(line(fullTitle, priceStr));
    });

    lines.push(divider());
    lines.push(line('Subtotal', formatCurrency(itemsSubtotal)));

    redemptionDiscounts.forEach((item) => {
      lines.push(line('Descuento', `-${formatCurrency(Math.abs(getLineSubtotal(item)))}`));
    });

    if (surcharge > 0) {
      lines.push(line('Recargo', formatCurrency(surcharge)));
    }

    lines.push(divider());
    lines.push(line('TOTAL', formatCurrency(transaction.total)));

    lines.push(`PAGO: ${String(paymentSummary).toUpperCase()}`);
    paymentItems.forEach((paymentItem) => {
      const paymentLabel = String(paymentItem.label || paymentItem.title || paymentItem.method || 'Pago').toUpperCase();
      const showCashReceived =
        paymentItems.length === 1 &&
        paymentItem.method === 'Efectivo' &&
        Number(paymentItem.cashChange || 0) > 0;
      lines.push(line(paymentLabel, formatCurrency(paymentItem.chargedAmount || 0)));
      if (showCashReceived) {
        lines.push(line('RECIBIDO', formatCurrency(paymentItem.cashReceived || paymentItem.chargedAmount || 0)));
        lines.push(line('DEVOLUCION', formatCurrency(paymentItem.cashChange || 0)));
      }
    });
  }

  lines.push(divider());
  lines.push(center('Gracias por tu'));
  lines.push(center('compra!'));
  lines.push(center('Volve pronto :D'));
  lines.push('\n\n.');

  return (
    <div id="printable-area">
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 0mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100%;
          }
          body * {
            visibility: hidden;
          }
          #printable-area, #printable-area * {
            visibility: visible;
          }
          #printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>

      <pre
        style={{
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: '10px',
          fontWeight: 'bold',
          lineHeight: '1',
          margin: 0,
          padding: '0 2px',
          whiteSpace: 'pre-wrap',
          color: 'black',
          width: '100%',
          overflow: 'hidden',
        }}
      >
        {lines.join('\n')}
      </pre>
    </div>
  );
};
