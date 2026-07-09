import React, { useMemo, useState } from 'react';
import { FileOutput, Printer, ReceiptText } from 'lucide-react';
import { TicketPrintLayout } from '../components/TicketPrintLayout';
import { TEMP_TICKET_TEST_PROFILES } from '../constants/ticketTestProfiles';
import { formatCurrency } from '../utils/helpers';

const buildFallbackTicket = () => ({
  id: 'test',
  date: new Date().toLocaleDateString('es-AR'),
  time: new Date().toISOString(),
  payment: 'Efectivo',
  total: 45600,
  client: {
    name: 'Cliente de prueba',
    memberNumber: '0001',
    currentPoints: 120,
  },
  items: [
    {
      title: 'ADORNO SET FELIZ CUMPLE 3D FUTBOL x3u.UPALALA',
      qty: 1,
      price: 15900,
      subtotal: 15900,
    },
    {
      title: 'ALFAJOR FULBITO RELLENO SABOR MANI BULTO 40x30gr 879',
      qty: 2,
      price: 6300,
      subtotal: 12600,
    },
    {
      title: 'BANDERIN PARTY TIME FELIZ CUMPLEANOS TEXTURADO PLATEADO x1 73358',
      qty: 1,
      price: 17100,
      subtotal: 17100,
    },
  ],
});

const getTicketDateLabel = (transaction = {}) => {
  const date = transaction.date?.split(',')?.[0] || transaction.date || 'Sin fecha';
  return String(date);
};

export default function TicketTestView({ transactions = [], onPrintTestTicket }) {
  const ticketOptions = useMemo(() => {
    const realTickets = (transactions || [])
      .filter((transaction) => Array.isArray(transaction.items) && transaction.items.length > 0)
      .slice(0, 8);
    return [buildFallbackTicket(), ...realTickets];
  }, [transactions]);
  const [selectedTicketId, setSelectedTicketId] = useState(String(ticketOptions[0]?.id || 'test'));

  const selectedTicket = ticketOptions.find((ticket) => String(ticket.id) === selectedTicketId) || ticketOptions[0] || buildFallbackTicket();

  return (
    <div className="ticket-test-view flex h-full min-h-0 flex-col overflow-hidden bg-[#07111f] text-slate-100">
      <div className="shrink-0 border-b border-slate-700/70 bg-[#0f1e33] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-400/12 text-sky-200">
                <ReceiptText size={18} />
              </span>
              <div>
                <h2 className="text-lg font-black text-white">Prueba Tickets</h2>
                <p className="text-xs font-bold text-slate-400">Seccion temporal para comparar medidas antes de definir el ticket final.</p>
              </div>
            </div>
          </div>

          <label className="flex min-w-[280px] max-w-md flex-1 flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Venta usada para probar</span>
            <select
              value={selectedTicketId}
              onChange={(event) => setSelectedTicketId(event.target.value)}
              className="h-10 rounded-md border border-slate-700 bg-slate-950/40 px-3 text-xs font-bold text-slate-100 outline-none transition focus:border-sky-400"
            >
              {ticketOptions.map((ticket, index) => (
                <option key={`${ticket.id}-${index}`} value={String(ticket.id)}>
                  {ticket.id === 'test'
                    ? 'Ticket de prueba con nombres largos'
                    : `#${String(ticket.id).padStart(6, '0')} - ${getTicketDateLabel(ticket)} - ${formatCurrency(ticket.total || 0)}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid min-w-[420px] grid-cols-1 gap-4">
          {TEMP_TICKET_TEST_PROFILES.filter((profile) => profile.paperLabel === '58mm').map((profile) => (
            <section key={profile.id} className="flex min-h-[720px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#0f1e33]">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-700/70 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200">{profile.paperLabel}</p>
                  <h3 className="mt-0.5 text-base font-black text-white">{profile.label}</h3>
                  <p className="mt-1 text-[11px] font-bold leading-snug text-slate-400">{profile.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onPrintTestTicket?.(selectedTicket, profile)}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-emerald-400/35 bg-emerald-400/14 px-3 text-[11px] font-black text-emerald-100 transition hover:bg-emerald-400/20"
                >
                  <Printer size={14} />
                  Imprimir
                </button>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-700/50 px-4 py-2 text-[10px] font-bold text-slate-400">
                <span>{profile.lineWidth} caracteres por linea</span>
                <span>producto: {profile.productLineWidth || profile.lineWidth}</span>
                <span>{profile.fontSize}px / x{profile.lineHeight}</span>
              </div>

              <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-[#0b1728] p-3">
                <div className="ticket-test-preview-stage h-fit rounded-lg border border-slate-700 bg-slate-200 p-1.5">
                  <div
                    className="ticket-test-paper rounded-md bg-white px-0.5 py-2"
                    style={{ width: `${profile.widthMm}mm` }}
                  >
                    <TicketPrintLayout transaction={selectedTicket} profile={profile} />
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
