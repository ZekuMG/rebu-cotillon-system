import React from 'react';
import { formatCurrency, formatNumber, formatTime24 } from '../utils/helpers';
import { getPaymentBreakdownDisplayItems, getPaymentSummary } from '../utils/paymentBreakdown';

const DEFAULT_TICKET_PROFILE = {
  lineWidth: 24,
  fontSize: 10,
  lineHeight: 1,
  horizontalPadding: 2,
  wrapProductNames: false,
  productLineWidth: null,
};

const buildTicketProfile = (profile = {}) => ({
  ...DEFAULT_TICKET_PROFILE,
  ...(profile || {}),
  lineWidth: Number(profile?.lineWidth || DEFAULT_TICKET_PROFILE.lineWidth),
  fontSize: Number(profile?.fontSize || DEFAULT_TICKET_PROFILE.fontSize),
  lineHeight: Number(profile?.lineHeight || DEFAULT_TICKET_PROFILE.lineHeight),
  horizontalPadding: Number(profile?.horizontalPadding ?? DEFAULT_TICKET_PROFILE.horizontalPadding),
  productLineWidth: profile?.productLineWidth ? Number(profile.productLineWidth) : null,
});

const createLineFormatter = (lineWidth) => (left = '', right = '') => {
  let l = String(left);
  const r = String(right);
  const rightWidth = r.length + 1;
  const maxLeftWidth = lineWidth - rightWidth;

  if (l.length > maxLeftWidth) {
    l = l.slice(0, maxLeftWidth);
  }

  const space = lineWidth - l.length - r.length;
  return l + ' '.repeat(Math.max(0, space)) + r;
};

const createCenterFormatter = (lineWidth) => (text = '') => {
  const t = String(text).slice(0, lineWidth);
  const space = Math.floor((lineWidth - t.length) / 2);
  return ' '.repeat(Math.max(0, space)) + t;
};

const createDivider = (lineWidth) => () => '-'.repeat(lineWidth);

const wrapText = (text = '', width = 24) => {
  const safeWidth = Math.max(8, Number(width || 24));
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return [''];

  const chunks = [];
  let current = '';

  words.forEach((word) => {
    if (word.length > safeWidth) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let index = 0; index < word.length; index += safeWidth) {
        chunks.push(word.slice(index, index + safeWidth));
      }
      return;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length > safeWidth) {
      if (current) chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) chunks.push(current);
  return chunks.length ? chunks : [''];
};

const pushItemLine = (lines, { title, priceStr, line, lineWidth, wrapProductNames, productLineWidth }) => {
  if (!wrapProductNames) {
    lines.push(line(title, priceStr));
    return;
  }

  const productWidth = Math.max(8, Math.min(Number(productLineWidth || lineWidth), lineWidth));
  const firstLineWidth = Math.max(8, Math.min(productWidth, lineWidth - String(priceStr).length - 1));
  const firstLineParts = wrapText(title, firstLineWidth);
  const firstPart = firstLineParts.shift() || title.slice(0, firstLineWidth);

  lines.push(line(firstPart, priceStr));

  const continuationText = firstLineParts.join(' ');
  const continuationParts = continuationText
    ? wrapText(continuationText, productWidth)
    : [];

  continuationParts.forEach((part) => {
    lines.push(part);
  });
};

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

const getPointMovementDelta = (movement = {}) => {
  const explicitDelta = Number(movement.signedDiff);
  if (Number.isFinite(explicitDelta) && explicitDelta !== 0) return explicitDelta;
  const points = Number(movement.points || 0);
  return movement.type === 'earned' ? points : -points;
};

const getPointMovementLabel = (movement = {}) => {
  if (movement.concept) return movement.concept;
  if (movement.type === 'earned') return 'Puntos por compra';
  if (movement.type === 'redeemed') return 'Canje de puntos';
  if (movement.type === 'expired') return 'Vencimiento';
  return 'Ajuste manual';
};

const getPointMovementTime = (movement = {}) => {
  const rawTime = movement.time || movement.timestamp || '';
  if (!rawTime) return '--:--';
  return formatTime24(String(rawTime).replace(/hs/ig, '').trim()).slice(0, 5);
};

const isFiniteNumber = (value) => Number.isFinite(Number(value));

export const TicketPrintLayout = ({ transaction, profile }) => {
  if (!transaction) return null;

  const ticketProfile = buildTicketProfile(profile);
  const lineWidth = ticketProfile.lineWidth;
  const line = createLineFormatter(lineWidth);
  const center = createCenterFormatter(lineWidth);
  const divider = createDivider(lineWidth);

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
  const pointHistory = Array.isArray(transaction.pointHistory)
    ? transaction.pointHistory.slice(0, 10)
    : [];

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

  if (transaction.isPointsTicket) {
    lines.push(center('PUNTOS REB'));
    lines.push(divider());
    lines.push('ULTIMOS 10 MOVS');

    if (pointHistory.length === 0) {
      lines.push('Sin movimientos.');
    } else {
      pointHistory.forEach((movement) => {
        const delta = getPointMovementDelta(movement);
        const sign = delta >= 0 ? '+' : '-';
        const pointsText = `${sign}${formatNumber(Math.abs(delta))} pts`;
        const dateLabel = `${movement.date || '--/--/--'} ${getPointMovementTime(movement)}`;
        const conceptLines = wrapText(getPointMovementLabel(movement), lineWidth);

        lines.push(line(dateLabel, pointsText));
        conceptLines.slice(0, 2).forEach((part) => lines.push(part));

        if (isFiniteNumber(movement.prevPoints) && isFiniteNumber(movement.newPoints)) {
          lines.push(line('Saldo mov:', `${formatNumber(movement.prevPoints)}>${formatNumber(movement.newPoints)}`));
        }
      });
    }

    lines.push(divider());
  }

  if (!transaction.isPointsTicket) {
    lines.push(line('DESCRIPCION', 'IMPORTE'));

    items.forEach((item) => {
      const qty = Number(item.qty || item.quantity || 1);
      const titlePrefix = qty !== 1 ? `(${formatNumber(qty)}) ` : '';
      const fullTitle = titlePrefix + (item.title || 'Producto');
      const priceStr = item.isReward ? 'GRATIS' : formatCurrency(getLineSubtotal(item));

      pushItemLine(lines, {
        title: fullTitle,
        priceStr,
        line,
        lineWidth,
        wrapProductNames: ticketProfile.wrapProductNames,
        productLineWidth: ticketProfile.productLineWidth,
      });
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
  lines.push('');
  lines.push('');

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
          fontSize: `${ticketProfile.fontSize}px`,
          fontWeight: 'bold',
          lineHeight: String(ticketProfile.lineHeight),
          margin: 0,
          padding: `0 ${ticketProfile.horizontalPadding}px`,
          whiteSpace: 'pre',
          color: 'black',
          width: 'max-content',
          maxWidth: 'none',
          overflow: 'visible',
        }}
      >
        {lines.join('\n')}
      </pre>
    </div>
  );
};
