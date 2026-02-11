import React from 'react';
import { formatPrice, formatTime24 } from '../utils/helpers';

const LINE_WIDTH = 32;

/* ================================
   HELPERS
================================ */

const line = (left = '', right = '') => {
  const lRaw = String(left);
  const rRaw = String(right);

  let l = lRaw.toUpperCase();
  const r = rRaw;

  const rightWidth = r.length + 1;
  const maxLeftWidth = LINE_WIDTH - rightWidth;

  if (l.length > maxLeftWidth) {
    l = l.slice(0, maxLeftWidth);
  }

  const space = LINE_WIDTH - l.length - r.length;

  return l + ' '.repeat(Math.max(0, space)) + r;
};

const center = (text = '') => {
  const t = String(text).toUpperCase().slice(0, LINE_WIDTH);
  const space = Math.floor((LINE_WIDTH - t.length) / 2);
  return ' '.repeat(Math.max(0, space)) + t;
};

const divider = () => '-'.repeat(LINE_WIDTH);

/* ================================
   COMPONENTE
================================ */

export const TicketPrintLayout = ({ transaction }) => {
  if (!transaction) return null;

  const formattedId = transaction?.id
    ? String(transaction.id).padStart(6, '0')
    : '';

  const dateStr = transaction?.date
    ? transaction.date.split(',')[0]
    : '';

  const timeStr = transaction?.time
    ? formatTime24(transaction.time)
    : '';

  const items = (transaction?.items || []).filter(
    i => i.type !== 'discount'
  );

  const itemsSubtotal = items.reduce((acc, item) => {
    const qty = item.qty || item.quantity || 1;
    return acc + Number(item.price || 0) * qty;
  }, 0);

  const redemptionDiscounts = (transaction?.items || []).filter(
    i => i.type === 'discount'
  );

  const totalRedemptionDiscount = redemptionDiscounts.reduce(
    (acc, i) => acc + Math.abs(Number(i.price || 0)),
    0
  );

  let surcharge = 0;

  if (
    transaction?.total != null &&
    transaction.total >
      itemsSubtotal - totalRedemptionDiscount + 0.5
  ) {
    surcharge =
      transaction.total -
      (itemsSubtotal - totalRedemptionDiscount);
  }

  const showRedemption = (transaction?.pointsSpent || 0) > 0;

  const currentPointsDisplay = transaction?.client
    ? transaction.client.currentPoints ??
      transaction.client.points ??
      0
    : null;

  const lines = [];

  /* ========= HEADER ========= */

  lines.push(center('COTILLON REBU'));
  lines.push(center('ARTICULOS PARA FIESTAS'));
  lines.push(divider());
  lines.push(center('CALLE 158 4440 - BERAZATEGUI'));
  lines.push(center('TEL: 11-5483-0409'));
  lines.push(center('IG: @REBUCOTILLON'));
  lines.push(divider());

  /* ========= SOCIO ========= */

  if (transaction?.client) {
    if (transaction.client.memberNumber) {
      lines.push(line(`SOCIO #${transaction.client.memberNumber}`, ''));
    }

    if (transaction.client.name) {
      lines.push(
        transaction.client.name
          .toUpperCase()
          .slice(0, LINE_WIDTH)
      );
    }

    if (!transaction.isPointsTicket) {
      if (showRedemption) {
        lines.push(
          line(
            'PUNTOS CANJEADOS:',
            `-${transaction.pointsSpent}`
          )
        );
      } else if (transaction.pointsEarned != null) {
        lines.push(
          line(
            'PUNTOS GANADOS:',
            `+${transaction.pointsEarned}`
          )
        );
      }
    }

    if (currentPointsDisplay != null) {
      lines.push(
        line(
          'PUNTOS TOTALES:',
          `${currentPointsDisplay}`
        )
      );
    }

    lines.push(divider());
  }

  /* ========= FECHA ========= */

  if (dateStr || timeStr || formattedId) {
    lines.push(
      line(`${dateStr} ${timeStr}`, formattedId ? `#${formattedId}` : '')
    );
    lines.push(divider());
  }

  /* ========= PRODUCTOS ========= */

  if (!transaction?.isPointsTicket) {
    items.forEach(item => {
      const qty = item.qty || item.quantity || 1;
      const price = Number(item.price || 0);

      const qtyPrefix = qty > 1 ? `${qty}x ` : '';
      const fullTitle =
        qtyPrefix + (item.title || 'ITEM');

      const totalItemPrice = qty * price;

      const priceStr = item.isReward
        ? 'GRATIS'
        : `$${formatPrice(totalItemPrice)}`;

      lines.push(line(fullTitle, priceStr));
    });

    lines.push(divider());

    if (
      totalRedemptionDiscount > 0 ||
      surcharge > 0
    ) {
      lines.push(
        line('SUBTOTAL', `$${formatPrice(itemsSubtotal)}`)
      );
    }

    redemptionDiscounts.forEach(d => {
      lines.push(
        line(
          'DESCUENTO',
          `-$${formatPrice(Math.abs(d.price))}`
        )
      );
    });

    if (surcharge > 0) {
      lines.push(
        line('RECARGO', `$${formatPrice(surcharge)}`)
      );
    }

    if (transaction?.total != null) {
      lines.push(
        line(
          'TOTAL A PAGAR',
          `$${formatPrice(transaction.total)}`
        )
      );
    }

    lines.push(divider());

    // ✅ FORMA DE PAGO REAL (SIN FORZAR)
    if (transaction?.payment) {
      lines.push(
        line('PAGO:', transaction.payment.toUpperCase())
      );
    }

    if (
      transaction?.installments &&
      transaction.installments > 1
    ) {
      lines.push(
        line('CUOTAS:', `${transaction.installments}`)
      );
    }
  }

  /* ========= FOOTER ========= */

  lines.push(divider());
  lines.push(center('¡GRACIAS POR TU COMPRA!'));
  lines.push('');
  lines.push('');
  lines.push('');

  return (
    <div id="printable-area">
      <style>{`
        @media print {
          @page {
            size: 58mm auto;
            margin: 0;
          }

          html, body {
            width: 58mm;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff;
          }

          body * {
            visibility: hidden;
          }

          #printable-area,
          #printable-area * {
            visibility: visible;
          }

          #printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 58mm;
          }
        }
      `}</style>

      <pre
        style={{
          fontFamily: 'monospace',
          fontSize: '11px',
          fontWeight: '700',
          lineHeight: '1.2',
          margin: 0,
          padding: '4px',
          whiteSpace: 'pre',
          color: '#000',
          width: '100%',
        }}
      >
        {lines.join('\n')}
      </pre>
    </div>
  );
};
