import React from 'react';
import {
  X,
  Printer,
  Calendar,
  Clock,
  User,
  DollarSign,
  TrendingUp,
  CreditCard,
  Package,
  FileText,
  Users // Icono para clientes
} from 'lucide-react';
import { formatPrice } from '../../utils/helpers';

export const DailyReportModal = ({ isOpen, onClose, report }) => {
  if (!isOpen || !report) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    // CORRECCIÓN VISUAL: Usamos 'items-start' y 'overflow-y-auto' en el padre para evitar que el centro corte el contenido
    <div className="fixed inset-0 bg-black/80 flex justify-center items-start z-[70] p-4 backdrop-blur-sm overflow-y-auto">
      
      {/* Margen vertical (my-10) para dar aire y permitir scroll natural */}
      <div className="relative w-full max-w-3xl bg-gray-100 my-10 flex flex-col shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* HEADER MODAL (No sale en impresión) */}
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0 print:hidden">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText className="text-fuchsia-400" size={20} /> Visualización de Reporte
          </h2>
          <div className="flex gap-3">
            <button 
              onClick={handlePrint}
              className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors text-sm"
            >
              <Printer size={16} /> Imprimir / PDF
            </button>
            <button 
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-2 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* --- DOCUMENTO A4 (ÁREA DE IMPRESIÓN) --- */}
        <div className="flex-1 p-8 print:p-0 bg-gray-50 flex justify-center">
          <div 
            id="printable-report"
            className="bg-white w-full max-w-[210mm] min-h-[297mm] p-[15mm] shadow-lg print:shadow-none print:w-full print:max-w-none box-border text-slate-800"
          >
            {/* ================= PÁGINA 1: RESUMEN FINANCIERO ================= */}
            
            {/* ENCABEZADO */}
            <div className="border-b-2 border-slate-800 pb-4 mb-6 flex justify-between items-end">
              <div>
                <h1 className="text-3xl font-black text-slate-900 uppercase tracking-wide">Reporte Diario</h1>
                <p className="text-sm text-slate-500 font-bold mt-1">COTILLÓN REBU - RESUMEN DE CIERRE</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400 uppercase">Fecha de Cierre</p>
                <p className="text-xl font-bold text-slate-800">{report.date}</p>
              </div>
            </div>

            {/* INFO GENERAL */}
            <div className="grid grid-cols-3 gap-4 mb-8 bg-slate-50 p-4 rounded-lg border border-slate-100 print:bg-white print:border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-full print:border print:border-slate-300"><Clock size={20} /></div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Horario</p>
                  <p className="font-bold text-sm">{report.openTime} - {report.closeTime}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-fuchsia-100 text-fuchsia-600 rounded-full print:border print:border-slate-300"><User size={20} /></div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Responsable</p>
                  <p className="font-bold text-sm">{report.user}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-full print:border print:border-slate-300"><TrendingUp size={20} /></div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Operaciones</p>
                  <p className="font-bold text-sm">{report.salesCount} ventas</p>
                </div>
              </div>
            </div>

            {/* BALANCE FINANCIERO */}
            <div className="mb-8">
              <h3 className="text-sm font-black text-slate-900 uppercase border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
                <DollarSign size={16} /> Balance Financiero
              </h3>
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm border-b border-dashed border-slate-200 pb-2">
                    <span className="text-slate-500 font-medium">Caja Inicial (Apertura)</span>
                    <span className="font-bold text-slate-700">${formatPrice(report.openingBalance)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-b border-dashed border-slate-200 pb-2">
                    <span className="text-slate-500 font-medium">Ingresos por Ventas (Bruto)</span>
                    <span className="font-bold text-green-600">+ ${formatPrice(report.totalSales)}</span>
                  </div>
                  {/* Mostrar gastos si existen */}
                  {report.totalExpenses > 0 && (
                    <div className="flex justify-between items-center text-sm border-b border-dashed border-slate-200 pb-2">
                        <span className="text-slate-500 font-medium">Gastos Operativos</span>
                        <span className="font-bold text-red-500">- ${formatPrice(report.totalExpenses)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm border-b border-dashed border-slate-200 pb-2">
                    <span className="text-slate-500 font-medium">Costo Mercadería (Estimado)</span>
                    <span className="font-bold text-slate-400">- ${formatPrice(report.totalCost)}</span>
                  </div>
                </div>
                
                <div className="bg-slate-900 text-white p-4 rounded-xl flex flex-col justify-center items-center text-center print:bg-slate-100 print:text-slate-900 print:border-2 print:border-slate-900">
                  <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">Ganancia Neta (Aprox)</p>
                  <p className="text-3xl font-black">${formatPrice(report.netProfit)}</p>
                </div>
              </div>
            </div>

            {/* MÉTODOS DE PAGO */}
            <div className="mb-8">
              <h3 className="text-sm font-black text-slate-900 uppercase border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
                <CreditCard size={16} /> Desglose por Medio de Pago
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(report.paymentMethods || {}).map(([method, amount]) => (
                  <div key={method} className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-center print:border-slate-300">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">{method}</p>
                    <p className="font-bold text-lg text-slate-800">${formatPrice(amount)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* DETALLE STOCK VENDIDO */}
            <div className="mb-8">
              <h3 className="text-sm font-black text-slate-900 uppercase border-b border-slate-200 pb-2 mb-4 flex items-center gap-2">
                <Package size={16} /> Stock Vendido ({report.itemsSold?.length || 0} items)
              </h3>
              
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-50 print:bg-white">
                    <th className="py-2 px-2 font-bold text-slate-600">Producto</th>
                    <th className="py-2 px-2 font-bold text-slate-600 text-center">Cant.</th>
                    <th className="py-2 px-2 font-bold text-slate-600 text-right">Total ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(report.itemsSold || []).map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-2 text-slate-700 font-medium truncate max-w-[200px]">{item.title}</td>
                      <td className="py-2 px-2 text-slate-600 text-center font-bold">{item.qty}</td>
                      <td className="py-2 px-2 text-slate-800 text-right font-bold">${formatPrice(item.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(report.itemsSold || []).length === 0 && (
                <p className="text-center text-slate-400 py-4 italic">No se registraron ventas de productos.</p>
              )}
            </div>

            {/* ================= PÁGINA 2: NUEVOS CLIENTES ================= */}
            {/* Solo mostramos la página si hay clientes nuevos */}
            {report.newClients && report.newClients.length > 0 && (
              <>
                {/* SALTO DE PÁGINA PARA IMPRESIÓN */}
                <div className="print:break-before-page mt-12 print:mt-0"></div>
                
                <div className="pt-8 print:pt-8">
                    <div className="border-b-2 border-slate-800 pb-4 mb-6 flex justify-between items-end">
                      <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                           <Users size={24} className="text-slate-800"/> Nuevos Socios
                        </h1>
                        <p className="text-sm text-slate-500 font-bold mt-1">REGISTRO DE ALTAS DEL DÍA</p>
                      </div>
                      <div className="text-right">
                        <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold border border-slate-200">
                           Total: {report.newClients.length}
                        </span>
                      </div>
                    </div>

                    <table className="w-full text-xs text-left border border-slate-200 rounded-lg overflow-hidden">
                        <thead>
                          <tr className="bg-slate-100 print:bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                            <th className="py-3 px-4 font-bold">Hora</th>
                            <th className="py-3 px-4 font-bold">N° Socio</th>
                            <th className="py-3 px-4 font-bold">Nombre</th>
                            <th className="py-3 px-4 font-bold">Contacto (Email)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {report.newClients.map((client, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-3 px-4 font-mono text-slate-500">{client.time}</td>
                              <td className="py-3 px-4 font-bold text-slate-700">#{String(client.number).padStart(4, '0')}</td>
                              <td className="py-3 px-4 font-medium text-slate-800">{client.name}</td>
                              <td className="py-3 px-4 text-slate-600">{client.email}</td>
                            </tr>
                          ))}
                        </tbody>
                    </table>
                </div>
              </>
            )}

            {/* FOOTER GLOBAL */}
            <div className="mt-12 pt-4 border-t border-slate-100 flex justify-center text-xs text-slate-300">
                <p>Generado automáticamente por PartyManager - {new Date().toLocaleString()}</p>
            </div>

          </div>
        </div>
      </div>

      {/* ESTILOS DE IMPRESIÓN ESPECÍFICOS */}
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white; }
          /* Reset de posición para que imprima todo el scroll */
          .fixed { position: static; overflow: visible; background: white; display: block; } 
          .bg-black\\/80 { background: white !important; }
          .animate-in { animation: none !important; }
          .shadow-2xl { shadow: none !important; }
          
          /* Ocultar elementos de UI */
          button { display: none !important; }
          ::-webkit-scrollbar { display: none; }
          
          /* Forzar salto de página */
          .break-before-page { page-break-before: always; }
        }
      `}</style>
    </div>
  );
};