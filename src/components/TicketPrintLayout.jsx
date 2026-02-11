import React from 'react';
import { formatPrice, formatTime24 } from '../utils/helpers';

// ANCHO DE PAPEL: 32 Caracteres (Estándar XP-58)
const LINE_WIDTH = 32;

// --- FUNCIONES HELPER (Manejo de Texto) ---

// Genera una línea "Texto......$Precio"
// Corta el texto izquierdo si es muy largo para que no rompa el renglón
const line = (left = '', right = '') => {
  let l = String(left);
  const r = String(right);
  
  // Calculamos el espacio que ocupa la derecha + 1 espacio de separación
  const rightWidth = r.length + 1;
  const maxLeftWidth = LINE_WIDTH - rightWidth;

  // Si la izquierda es muy larga, la cortamos
  if (l.length > maxLeftWidth) {
    l = l.slice(0, maxLeftWidth); 
  }

  const space = LINE_WIDTH - l.length - r.length;
  // Math.max(0, ...) evita errores si el cálculo da negativo
  return l + ' '.repeat(Math.max(0, space)) + r;
};

// Centra un texto
const center = (text = '') => {
  const t = String(text).slice(0, LINE_WIDTH);
  const space = Math.floor((LINE_WIDTH - t.length) / 2);
  return ' '.repeat(Math.max(0, space)) + t;
};

// Genera una línea divisoria
const divider = () => '-'.repeat(LINE_WIDTH);

export const TicketPrintLayout = ({ transaction }) => {
  if (!transaction) return null;

  // --- 1. PREPARACIÓN DE DATOS ---
  const formattedId = String(transaction.id).padStart(6, '0');
  const dateStr = transaction.date?.split(',')[0] || transaction.date;
  const timeStr = transaction.time ? formatTime24(transaction.time) : '--:--';

  // --- 2. CÁLCULOS MONETARIOS ---
  // Filtramos items que no sean descuentos
  const items = (transaction.items || []).filter(i => i.type !== 'discount');

  // Calcular subtotal de items
  const itemsSubtotal = items.reduce((acc, item) => {
    const qty = item.qty || item.quantity || 1;
    return acc + Number(item.price) * qty;
  }, 0);

  // Calcular descuentos aplicados
  const redemptionDiscounts = (transaction.items || []).filter(i => i.type === 'discount');
  const totalRedemptionDiscount = redemptionDiscounts.reduce(
    (acc, i) => acc + Math.abs(i.price),
    0
  );

  // Calcular recargo (Si el total es mayor que subtotal - descuentos)
  let surcharge = 0;
  // Usamos 0.5 de tolerancia por redondeos de decimales
  if (transaction.total > itemsSubtotal - totalRedemptionDiscount + 0.5) {
    surcharge = transaction.total - (itemsSubtotal - totalRedemptionDiscount);
  }

  // --- 3. LÓGICA DE PUNTOS ---
  const showRedemption = (transaction.pointsSpent || 0) > 0;
  // Obtenemos los puntos actuales (usando currentPoints del snapshot o points del cliente actual)
  const currentPointsDisplay = transaction.client
    ? (transaction.client.currentPoints ?? transaction.client.points ?? 0)
    : 0;

  // === 4. CONSTRUCCIÓN DEL TICKET (Línea por Línea) ===
  const lines = [];

  // HEADER
  lines.push(center('COTILLON REBU'));
  lines.push(center('Articulos para Fiestas'));
  lines.push(divider());
  lines.push(center('Calle 158 4440 - Berazategui'));
  lines.push(center('Tel: 11-5483-0409'));
  lines.push(center('IG: @rebucotillon'));
  lines.push(divider());

  // SECCIÓN SOCIO (Formato Solicitado)
  if (transaction.client) {
    const memberNum = transaction.client.memberNumber;
    const clientName = transaction.client.name.toUpperCase();
    
    // Renglón 1: Socio (N°): Nombre
    lines.push(line(`Socio (#${memberNum}):`, clientName));

    // Renglón 2: Puntos ganados/canjeados
    if (transaction.isPointsTicket) {
      // Si es ticket de saldo, no mostramos movimiento
    } else {
      if (showRedemption) {
        lines.push(line('Puntos canjeados:', `-${transaction.pointsSpent}`));
      } else {
        lines.push(line('Puntos ganados:', `+${transaction.pointsGainedReal || 0}`));
      }
    }

    // Renglón 3: Total de puntos
    lines.push(line('Total de puntos:', `${currentPointsDisplay}`));
    
    lines.push(divider());
  }

  // FECHA Y HORA / ID
  lines.push(line(`${dateStr} ${timeStr}`, `#${formattedId}`));
  lines.push(divider());

  // LISTA DE PRODUCTOS (Solo si no es ticket de saldo)
  if (!transaction.isPointsTicket) {
    lines.push(line('DESCRIPCION', 'IMPORTE'));

    items.forEach(item => {
      const qty = item.qty || item.quantity || 1;
      const price = Number(item.price);
      
      // Formato Nombre: (2) Globos...
      const titlePrefix = qty > 1 ? `(${qty}) ` : '';
      const fullTitle = titlePrefix + item.title;
      
      const totalItemPrice = qty * price;
      const priceStr = item.isReward ? 'GRATIS' : `$${formatPrice(totalItemPrice)}`;

      // La función line() se encarga de recortar si el nombre es muy largo
      lines.push(line(fullTitle, priceStr));
    });

    lines.push(divider());

    // TOTALES
    lines.push(line('Subtotal', `$${formatPrice(itemsSubtotal)}`));

    // Mostrar descuentos si existen
    redemptionDiscounts.forEach(d => {
      lines.push(line('Descuento', `-$${formatPrice(Math.abs(d.price))}`));
    });

    // Mostrar recargo si existe
    if (surcharge > 0) {
      lines.push(line('Recargo', `$${formatPrice(surcharge)}`));
    }

    lines.push(divider());
    
    // TOTAL FINAL
    lines.push(line('TOTAL', `$${formatPrice(transaction.total)}`));
    
    // FORMA DE PAGO
    lines.push(`PAGO: ${transaction.payment.toUpperCase()}`);
    
    // CUOTAS (Solo si es Crédito y hay cuotas)
    if (transaction.payment === 'Credito' && transaction.installments > 1) {
       lines.push(`CUOTAS: ${transaction.installments}`); 
    }
  }

  // FOOTER
  lines.push(divider());
  lines.push(center('¡Gracias por tu compra!'));
  lines.push(center('Volve pronto :D'));
  
  // Espacio final para corte
  lines.push('\n\n.');

  // --- RENDERIZADO ---
  return (
    <div id="printable-area">
      {/* Estilos CSS mínimos para asegurar que el navegador respete el texto plano */}
      <style>{`
        @media print {
          @page {
            size: auto; /* Dejar que la impresora decida el largo */
            margin: 0mm; /* CERO margen de hoja */
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100%;
          }
          body * {
            visibility: hidden; /* Ocultar app */
          }
          #printable-area, #printable-area * {
            visibility: visible; /* Mostrar ticket */
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
          fontFamily: '"Courier New", Courier, monospace', // CRÍTICO: Fuente monoespaciada
          fontSize: '10px',      // Tamaño legible
          fontWeight: 'bold',    // Negrita para mayor contraste
          lineHeight: '1',     // Espaciado vertical
          margin: 0,
          padding: '0 2px',      // Margen de seguridad mínimo
          whiteSpace: 'pre-wrap',// Respetar espacios y saltos de línea
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