import React from 'react';
import { formatPrice, formatTime24 } from '../utils/helpers';

// =============================================
// VERSIÓN A: 24 Caracteres por línea
// Bold + fontSize 10px (letra más grande y gruesa)
// =============================================
const LINE_WIDTH = 24;

// --- FUNCIONES HELPER (Manejo de Texto) ---

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

export const TicketPrintLayout = ({ transaction }) => {
  if (!transaction) return null;

  // --- 1. PREPARACIÓN DE DATOS ---
  const formattedId = String(transaction.id).padStart(6, '0');
  const dateStr = transaction.date?.split(',')[0] || transaction.date;
  const timeStr = transaction.time ? formatTime24(transaction.time) : '--:--';

  // --- 2. CÁLCULOS MONETARIOS ---
  const items = (transaction.items || []).filter(i => i.type !== 'discount');

  const itemsSubtotal = items.reduce((acc, item) => {
    const qty = item.qty || item.quantity || 1;
    return acc + Number(item.price) * qty;
  }, 0);

  const redemptionDiscounts = (transaction.items || []).filter(i => i.type === 'discount');
  const totalRedemptionDiscount = redemptionDiscounts.reduce(
    (acc, i) => acc + Math.abs(i.price),
    0
  );

  let surcharge = 0;
  if (transaction.total > itemsSubtotal - totalRedemptionDiscount + 0.5) {
    surcharge = transaction.total - (itemsSubtotal - totalRedemptionDiscount);
  }

  // --- 3. LÓGICA DE PUNTOS ---
  const showRedemption = (transaction.pointsSpent || 0) > 0;
  const currentPointsDisplay = transaction.client
    ? (transaction.client.currentPoints ?? transaction.client.points ?? 0)
    : 0;

  // === 4. CONSTRUCCIÓN DEL TICKET ===
  const lines = [];

  // HEADER
  lines.push(center('COTILLON REBU'));
  lines.push(center('Art. para Fiestas'));
  lines.push(divider());
  lines.push(center('Calle 158 4440'));
  lines.push(center('Berazategui'));
  lines.push(center('Tel: 11-5483-0409'));
  lines.push(center('IG: @rebucotillon'));
  lines.push(divider());

  // SECCIÓN SOCIO
  if (transaction.client) {
    const memberNum = transaction.client.memberNumber;
    const clientName = transaction.client.name.toUpperCase();
    
    lines.push(`Socio (#${memberNum}):`);
    lines.push(clientName);

    if (!transaction.isPointsTicket) {
      if (showRedemption) {
        lines.push(line('Pts canjeados:', `-${transaction.pointsSpent}`));
      } else {
        lines.push(line('Pts ganados:', `+${transaction.pointsGainedReal || 0}`));
      }
    }

    lines.push(line('Total puntos:', `${currentPointsDisplay}`));
    
    lines.push(divider());
  }

  // FECHA Y HORA / ID
  lines.push(`${dateStr} ${timeStr}`);
  lines.push(`#${formattedId}`);
  lines.push(divider());

  // LISTA DE PRODUCTOS
  if (!transaction.isPointsTicket) {
    lines.push(line('DESCRIPCION', 'IMPORTE'));

    items.forEach(item => {
      const qty = item.qty || item.quantity || 1;
      const price = Number(item.price);
      
      const titlePrefix = qty > 1 ? `(${qty}) ` : '';
      const fullTitle = titlePrefix + item.title;

      const totalItemPrice = qty * price;
      const priceStr = item.isReward ? 'GRATIS' : `$${formatPrice(totalItemPrice)}`;

      lines.push(line(fullTitle, priceStr));
    });

    lines.push(divider());

    // TOTALES
    lines.push(line('Subtotal', `$${formatPrice(itemsSubtotal)}`));

    redemptionDiscounts.forEach(d => {
      lines.push(line('Descuento', `-$${formatPrice(Math.abs(d.price))}`));
    });

    if (surcharge > 0) {
      lines.push(line('Recargo', `$${formatPrice(surcharge)}`));
    }

    lines.push(divider());
    
    lines.push(line('TOTAL', `$${formatPrice(transaction.total)}`));
    
    lines.push(`PAGO: ${transaction.payment.toUpperCase()}`);
    
    if (transaction.payment === 'Credito' && transaction.installments > 1) {
       lines.push(`CUOTAS: ${transaction.installments}`); 
    }
  }

  // FOOTER
  lines.push(divider());
  lines.push(center('Gracias por tu'));
  lines.push(center('compra!'));
  lines.push(center('Volve pronto :D'));
  
  lines.push('\n\n.');

  // --- RENDERIZADO ---
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
          overflow: 'hidden'
        }}
      >
        {lines.join('\n')}
      </pre>
    </div>
  );
};