// src/components/ExportPdfLayout.jsx
import React from 'react';
import logoImg from '../assets/logo-rebu.jpg';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0);
};

// Límite estricto dinámico
const limitText = (text, limit = 40) => {
  if (!text) return '-';
  return text.length > limit ? text.substring(0, limit) + '...' : text;
};

export const ExportPdfLayout = ({ data }) => {
  if (!data) return null;

  const { config, items, date } = data;
  const isClient = config.isForClient;
  
  const time = data.time || new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  
  const clientCols = config.clientColumns || { showQty: true, showUnitPrice: true, showSubtotal: false, showTotal: true };

  const total = items.reduce((acc, item) => {
    const q = Number(item.qty) || 1;
    const p = Number(item.newPrice) || 0;
    return acc + (item.product_type === 'weight' ? p * (q / 1000) : p * q);
  }, 0);

  const groupedItems = items.reduce((acc, item) => {
    const cat = item.category || 'Otros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  let activeColsCount = 1; 
  if (clientCols.showQty) activeColsCount++;
  if (clientCols.showUnitPrice) activeColsCount++;
  if (clientCols.showSubtotal) activeColsCount++;

  return (
    <div className="bg-white text-black w-full max-w-[210mm] mx-auto text-sm print:p-0 print:max-w-none relative min-h-screen overflow-hidden">
      
      {/* MARCA DE AGUA */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0 print:fixed">
        <img 
          src={logoImg} 
          alt="Watermark" 
          className="w-[80%] max-w-[600px] object-contain opacity-[0.04]"
          style={{ WebkitPrintColorAdjust: 'exact' }} 
        />
      </div>

      {/* Contenido principal */}
      <div className="relative z-10 w-full bg-transparent">
        {isClient ? (
          <div className="block w-full">
            
            {/* ENCABEZADO */}
            <div className="mb-6 border-b-2 border-slate-800 flex justify-between items-end px-4">
              
              {/* IZQUIERDA: Grilla de Tarjetas Adaptable (No infinita) */}
              <div className="w-full max-w-[380px] mb-4 grid grid-cols-2 gap-3 ml-2">
                
                {/* Tarjeta: Cliente (Límite 40) */}
                <div 
                  className="col-span-2 border border-slate-200 rounded-lg p-2.5 flex flex-col justify-center shadow-sm"
                  style={{ backgroundColor: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                >
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-0.5">Cliente</span>
                  <span className="text-[13px] font-black text-slate-800">{limitText(config.clientName, 40)}</span>
                </div>

                {/* Tarjeta: Teléfono (Límite 10) */}
                <div 
                  className="border border-slate-200 rounded-lg p-2.5 flex flex-col justify-center shadow-sm"
                  style={{ backgroundColor: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                >
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-0.5">Teléfono</span>
                  <span className="text-[13px] font-black text-slate-800">{limitText(config.clientPhone, 10)}</span>
                </div>

                {/* Tarjeta: Fecha y Hora */}
                <div 
                  className="border border-slate-200 rounded-lg p-2.5 flex flex-col justify-center shadow-sm"
                  style={{ backgroundColor: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                >
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-0.5">Fecha y Hora</span>
                  <span className="text-[13px] font-black text-slate-800">{date} - {time} hs</span>
                </div>

                {/* Tarjeta: Evento (Límite 40) */}
                <div 
                  className="col-span-2 border border-slate-200 rounded-lg p-2.5 flex flex-col justify-center shadow-sm"
                  style={{ backgroundColor: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                >
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-0.5">Evento</span>
                  <span className="text-[13px] font-black text-slate-800">{limitText(config.clientEvent, 40)}</span>
                </div>

              </div>

              {/* DERECHA: Logo tocando la línea negra */}
              <div className="shrink-0 flex items-end justify-end w-[160px] mr-2">
                <img 
                  src={logoImg} 
                  alt="REBU Cotillón" 
                  className="h-[170px] w-auto object-contain -mb-[2px]" 
                  style={{ WebkitPrintColorAdjust: 'exact' }} 
                />
              </div>
            </div>

            {/* Tabla de Productos */}
            <table className="w-full border-collapse mb-6 text-sm">
              <thead className="table-header-group">
                <tr className="bg-slate-100 border-y-2 border-slate-800">
                  <th className="text-left py-2 px-3 font-bold uppercase tracking-wider">Producto</th>
                  {clientCols.showQty && <th className="text-center py-2 px-3 font-bold uppercase tracking-wider w-24">Cant.</th>}
                  {clientCols.showUnitPrice && <th className="text-right py-2 px-3 font-bold uppercase tracking-wider w-36">Precio Unit.</th>}
                  {clientCols.showSubtotal && <th className="text-right py-2 px-3 font-bold uppercase tracking-wider w-36">Subtotal</th>}
                </tr>
              </thead>
              <tbody className="table-row-group">
                
                {Object.entries(groupedItems).map(([category, catItems]) => (
                  <React.Fragment key={category}>
                    <tr className="bg-slate-200 break-after-avoid">
                      <td colSpan={activeColsCount} className="py-2 px-3 font-black text-slate-800 uppercase tracking-widest text-[11px] border-b border-slate-300">
                        {category}
                      </td>
                    </tr>
                    
                    {catItems.map((item, idx) => {
                      const isWeight = item.product_type === 'weight';
                      const q = Number(item.qty) || 1;
                      const p = Number(item.newPrice) || 0;
                      const subtotal = isWeight ? p * (q / 1000) : p * q;

                      return (
                        <tr key={item.id || idx} className="border-b border-slate-200 break-inside-avoid">
                          <td className="py-1.5 px-4 font-medium text-slate-800 flex items-center gap-2">
                            <span className="text-slate-400 text-lg leading-none">•</span> 
                            <span>{item.title}</span>
                            {isWeight && (
                              <span className="bg-amber-100 text-amber-700 text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-widest border border-amber-300 whitespace-nowrap">
                                Por Peso
                              </span>
                            )}
                          </td>
                          {clientCols.showQty && (
                            <td className="py-1.5 px-3 text-center font-mono text-xs">
                              {q} <span className="text-[10px] text-slate-400">{isWeight ? 'g' : 'u'}</span>
                            </td>
                          )}
                          {clientCols.showUnitPrice && (
                            <td className="py-1.5 px-3 text-right">
                              {formatCurrency(p)}
                              {isWeight && <span className="block text-[8px] text-slate-400 -mt-1">por Kg</span>}
                            </td>
                          )}
                          {clientCols.showSubtotal && (
                            <td className="py-1.5 px-3 text-right font-bold">
                              {formatCurrency(subtotal)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}

                {clientCols.showTotal && (
                  <tr className="border-t-2 border-slate-800 font-black text-lg bg-slate-50 break-inside-avoid">
                    <td colSpan={Math.max(1, activeColsCount - 1)} className="text-right py-3 px-3 uppercase tracking-widest">TOTAL PRESUPUESTO:</td>
                    <td className="text-right py-3 px-3 text-emerald-600">{formatCurrency(total)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Términos y Condiciones */}
            <div className="border border-slate-300 rounded-lg p-4 break-inside-avoid shadow-sm" style={{ backgroundColor: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
              <h4 className="font-black mb-2 uppercase tracking-wider text-slate-800 text-xs">Pasos para realizar tu compra:</h4>
              <ol className="list-decimal pl-4 space-y-1.5 text-[11px] text-slate-700 text-justify">
                <li><strong>Reserva:</strong> Para confirmar el pedido y reservar la mercadería se solicita una seña del 50% del total del presupuesto. El saldo restante deberá abonarse antes o al momento de la entrega o retiro.</li>
                <li><strong>Modificaciones:</strong> Cualquier modificación en el pedido deberá realizarse con al menos 72 horas de anticipación del día pactado de entrega, y quedará sujeta a disponibilidad de stock.</li>
                <li><strong>Cancelaciones:</strong> En caso de cancelación del pedido, la seña entregada no es reembolsable, ya que se utiliza para la reserva de mercadería y preparación del pedido.</li>
                <li><strong>Actualización de precios:</strong> Los precios indicados en el presupuesto quedan congelados únicamente al realizar el pago de la seña. En caso contrario, los valores podrán sufrir modificaciones.</li>
                <li><strong>Validez del presupuesto:</strong> Este presupuesto tiene una validez de 7 días.</li>
              </ol>
              <p className="mt-4 font-black text-center text-xs text-fuchsia-700 uppercase tracking-widest">Muchas gracias por elegir REBU Cotillón para tu evento.</p>
            </div>
          </div>
        ) : (

          /* MODO 2: REPORTE INTERNO DE CATÁLOGO */
          <div className="block w-full">
            
            <div className="mb-6 border-b-2 border-slate-800 flex justify-between items-end px-4">
              
              <div className="w-full max-w-[380px] mb-4 grid grid-cols-2 gap-3 ml-2">
                <div 
                  className="col-span-2 border border-slate-200 rounded-lg p-2.5 flex flex-col justify-center shadow-sm"
                  style={{ backgroundColor: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                >
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-0.5">Fecha y Hora</span>
                  <span className="text-[13px] font-black text-slate-800">{date} - {time} hs</span>
                </div>

                <div 
                  className="col-span-2 border border-indigo-200 rounded-lg p-2.5 flex flex-col justify-center shadow-sm"
                  style={{ backgroundColor: '#eef2ff', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                >
                  <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-widest mb-0.5">Tipo de Documento</span>
                  <span className="text-[13px] font-black text-indigo-800">Reporte Interno de Inventario</span>
                </div>
              </div>

              <div className="shrink-0 flex items-end justify-end w-[160px] mr-2">
                <img 
                  src={logoImg} 
                  alt="REBU Cotillón" 
                  className="h-[150px] w-auto object-contain -mb-[2px]" 
                  style={{ WebkitPrintColorAdjust: 'exact' }} 
                />
              </div>
            </div>
            
            <table className="w-full border-collapse text-sm">
              <thead className="table-header-group">
                <tr className="bg-slate-100 border-y-2 border-slate-800">
                  <th className="text-left py-2 px-3 font-bold uppercase">Producto</th>
                  {config.columns.cost && <th className="text-right py-2 px-3 font-bold uppercase">Costo</th>}
                  {config.columns.price && <th className="text-right py-2 px-3 font-bold uppercase">Precio Orig.</th>}
                  {config.columns.newPrice && <th className="text-right py-2 px-3 font-bold uppercase text-indigo-700">Precio Edit.</th>}
                  {config.columns.stock && <th className="text-right py-2 px-3 font-bold uppercase">Stock</th>}
                </tr>
              </thead>
              <tbody className="table-row-group">
                {Object.entries(groupedItems).map(([category, catItems]) => (
                  <React.Fragment key={category}>
                    <tr className="bg-slate-200 break-after-avoid">
                      <td colSpan={1 + (config.columns.cost?1:0) + (config.columns.price?1:0) + (config.columns.newPrice?1:0) + (config.columns.stock?1:0)} className="py-2 px-3 font-black text-slate-800 uppercase tracking-widest text-[11px] border-b border-slate-300">
                        {category}
                      </td>
                    </tr>
                    {catItems.map((item, idx) => {
                      const isWeight = item.product_type === 'weight';
                      return (
                        <tr key={idx} className="border-b border-slate-200 break-inside-avoid">
                          <td className="py-1.5 px-4 font-medium flex items-center gap-2">
                            <span className="text-slate-400">•</span> 
                            <span>{item.title}</span>
                            {isWeight && <span className="bg-amber-100 text-amber-700 text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-widest border border-amber-300 whitespace-nowrap">Por Peso</span>}
                          </td>
                          {config.columns.cost && <td className="text-right py-1.5 px-3 text-slate-500">{formatCurrency(item.cost)} {isWeight && <span className="text-[9px] text-slate-400">/Kg</span>}</td>}
                          {config.columns.price && <td className="text-right py-1.5 px-3">{formatCurrency(item.price)} {isWeight && <span className="text-[9px] text-slate-400">/Kg</span>}</td>}
                          {config.columns.newPrice && <td className="text-right py-1.5 px-3 font-bold text-indigo-600">{formatCurrency(item.newPrice)} {isWeight && <span className="text-[9px] text-indigo-300">/Kg</span>}</td>}
                          {config.columns.stock && <td className="text-right py-1.5 px-3 font-mono">{item.stock} <span className="text-slate-400 text-[10px]">{isWeight ? 'g' : 'u'}</span></td>}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            <div className="mt-4 text-right text-xs font-bold text-slate-400 break-inside-avoid">
              Total de ítems exportados: {items.length}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};