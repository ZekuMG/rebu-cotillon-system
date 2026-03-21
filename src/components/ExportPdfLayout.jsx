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

  const displayTitle = (config.documentTitle || 'PRESUPUESTO').toUpperCase();
  const summary = config.financialSummary || null;
  const hasOrderSummary = Boolean(
    summary && (
      Number(summary.depositAmount || 0) > 0 ||
      Number(summary.additionalPaid || 0) > 0 ||
      Number(summary.paidTotal || 0) > 0 ||
      Number(summary.remainingAmount || 0) > 0
    )
  );

  return (
    <div className="bg-white text-black w-full max-w-[210mm] mx-auto text-sm print:p-0 print:max-w-none relative min-h-screen overflow-hidden">
      
      {/* MARCA DE AGUA */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0 print:fixed">
        <img 
          src={logoImg} 
          alt="Watermark" 
          className="w-[80%] max-w-[600px] object-contain opacity-[0.04]"
          style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} 
        />
      </div>

      <div className="relative z-10 w-full bg-transparent px-2">
        {isClient ? (
          <div className="block w-full">
            
            {/* ENCABEZADO */}
            <div className="mb-4 border-b-2 border-slate-800 flex justify-between items-end pb-2">
              
              {/* IZQUIERDA: Título y Datos */}
              <div className="flex flex-col w-full max-w-[420px]">
                
                <h1 
                  className="text-2xl font-black tracking-[0.2em] text-slate-800 mb-3"
                  style={{ fontFamily: 'Calibri, sans-serif' }}
                >
                  {displayTitle}
                </h1>

                <div className="space-y-3" style={{ fontFamily: 'Calibri, sans-serif' }}>
                  <div className="flex gap-4">
                    <div className="flex flex-col flex-1">
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-[2px]">Cliente</span>
                      <span className="text-[13px] leading-tight font-black text-slate-800 border-b border-slate-300 min-h-[17px]">
                        {config.clientName || ''}
                      </span>
                    </div>
                    <div className="flex flex-col w-[150px]">
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-[2px]">{config.createdAtLabel || 'Fecha y Hora'}</span>
                      <span className="text-[13px] leading-tight font-black text-slate-800 border-b border-slate-300 min-h-[17px]">
                        {config.createdAtDisplay || `${date} - ${time} hs`}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex flex-col flex-1">
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-[2px]">Evento</span>
                      <span className="text-[13px] leading-tight font-black text-slate-800 border-b border-slate-300 min-h-[17px]">
                        {config.clientEvent || ''}
                      </span>
                    </div>
                    <div className="flex flex-col w-[130px]">
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-[2px]">Teléfono</span>
                      <span className="text-[13px] leading-tight font-black text-slate-800 border-b border-slate-300 min-h-[17px]">
                        {config.clientPhone || ''}
                      </span>
                    </div>
                  </div>
                  {(config.pickupDate || '').trim() !== '' && (
                    <div className="flex gap-4">
                      <div className="flex flex-col flex-1">
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-[2px]">{config.pickupDateLabel || 'Fecha de retiro'}</span>
                        <span className="text-[13px] leading-tight font-black text-slate-800 border-b border-slate-300 min-h-[17px]">
                          {config.pickupDate}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* DERECHA: Logo apoyado en la línea */}
              <div className="shrink-0 flex items-end justify-end">
                <img 
                  src={logoImg} 
                  alt="REBU Cotillón" 
                  className="h-[175px] w-auto object-contain -mb-[2px]" 
                  style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} 
                />
              </div>
            </div>

            {/* TABLA DE PRODUCTOS */}
            <table className="w-full border-collapse mb-6 text-sm">
              <thead className="table-header-group">
                <tr className="bg-slate-100 border-y-2 border-slate-800">
                  <th className="text-left py-2 px-3 font-bold uppercase tracking-wider text-[11px]">Producto</th>
                  {clientCols.showQty && <th className="text-center py-2 px-3 font-bold uppercase tracking-wider w-20 text-[11px]">Cant.</th>}
                  {clientCols.showUnitPrice && <th className="text-right py-2 px-3 font-bold uppercase tracking-wider w-32 text-[11px]">Precio Unit.</th>}
                  {clientCols.showSubtotal && <th className="text-right py-2 px-3 font-bold uppercase tracking-wider w-32 text-[11px]">Subtotal</th>}
                </tr>
              </thead>
              <tbody className="table-row-group">
                {Object.entries(groupedItems).map(([category, catItems]) => (
                  <React.Fragment key={category}>
                    <tr className="bg-slate-100/50 break-after-avoid">
                      <td colSpan={activeColsCount} className="py-1.5 px-3 font-black text-slate-700 uppercase tracking-widest text-[11px] border-b border-slate-200">
                        {category}
                      </td>
                    </tr>
                    {catItems.map((item, idx) => {
                      const isWeight = item.product_type === 'weight';
                      const q = Number(item.qty) || 1;
                      const p = Number(item.newPrice) || 0;
                      const subtotal = isWeight ? p * (q / 1000) : p * q;

                      const rowColorClass = idx % 2 !== 0 ? 'bg-slate-50/80' : 'bg-transparent';
                      
                      // ✨ LOGICA DE AGOTADO / SIN PRECIO:
                      // Si el stock es <= 0 (y no es item extra) O si el precio es 0
                      const isAgotado = (item.stock !== undefined && Number(item.stock) <= 0 && !item.isTemporary) || p === 0;

                      return (
                        <tr 
                          key={item.id || idx} 
                          className={`border-b border-slate-100 break-inside-avoid ${rowColorClass} ${isAgotado ? 'opacity-80' : ''}`}
                          style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                        >
                          <td className={`py-1.5 px-4 font-medium text-[0px] ${isAgotado ? 'text-slate-500' : 'text-slate-800'}`}>
                            <div className="flex items-start gap-2 text-[12px]">
                              <span className="text-slate-400 text-lg leading-none shrink-0">•</span>
                              <div className="min-w-0 flex-1">
                                <span className="break-words">{item.title}</span>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  {isAgotado && (
                                    <span className="bg-red-100 text-red-700 text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest border border-red-300 whitespace-nowrap shrink-0">
                                      Agotado - Preguntar Stock
                                    </span>
                                  )}

                                  {isWeight && (
                                    <span className="bg-amber-100 text-amber-700 text-[8px] px-1 py-0.5 rounded font-bold uppercase tracking-widest border border-amber-200 whitespace-nowrap shrink-0">
                                      Peso
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          {clientCols.showQty && (
                            <td className={`py-1.5 px-3 text-center font-mono text-[12px] ${isAgotado ? 'text-slate-400' : ''}`}>
                              {isWeight && q >= 1000 && q % 100 === 0 ? (
                                <>{q / 1000} <span className="text-[10px] text-slate-400">Kg</span></>
                              ) : (
                                <>{q} <span className="text-[10px] text-slate-400">{isWeight ? 'g' : 'u'}</span></>
                              )}
                            </td>
                          )}
                          {clientCols.showUnitPrice && (
                            <td className={`py-1.5 px-3 text-right text-[12px] ${isAgotado ? 'text-slate-400' : ''}`}>
                              {formatCurrency(p)}
                              {isWeight && <span className="block text-[9px] text-slate-400 -mt-1">/Kg</span>}
                            </td>
                          )}
                          {clientCols.showSubtotal && (
                            <td className={`py-1.5 px-3 text-right font-bold text-[12px] ${isAgotado ? 'text-slate-400' : ''}`}>
                              {formatCurrency(subtotal)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
                {clientCols.showTotal && (
                  <>
                    <tr className="border-t-2 border-slate-800 font-black text-lg bg-slate-50 break-inside-avoid" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                      <td colSpan={Math.max(1, activeColsCount - 1)} className="text-right py-3 px-3 uppercase tracking-widest text-sm">
                        {displayTitle === 'PEDIDO' ? 'TOTAL PEDIDO:' : 'TOTAL PRESUPUESTO:'}
                      </td>
                      <td className="text-right py-3 px-3 text-emerald-600">
                        {formatCurrency(summary?.totalAmount ?? total)}
                      </td>
                    </tr>
                    {hasOrderSummary && (
                      <>
                        {Number(summary.depositAmount || 0) > 0 && (
                          <tr className="border-b border-slate-100 break-inside-avoid">
                            <td colSpan={Math.max(1, activeColsCount - 1)} className="text-right py-2 px-3 uppercase tracking-widest text-[11px] font-bold text-slate-500">
                              Seña:
                            </td>
                            <td className="text-right py-2 px-3 text-[13px] font-black text-sky-600">
                              -{formatCurrency(summary.depositAmount)}
                            </td>
                          </tr>
                        )}
                        {Number(summary.additionalPaid || 0) > 0 && (
                          <tr className="border-b border-slate-100 break-inside-avoid">
                            <td colSpan={Math.max(1, activeColsCount - 1)} className="text-right py-2 px-3 uppercase tracking-widest text-[11px] font-bold text-slate-500">
                              Abonado:
                            </td>
                            <td className="text-right py-2 px-3 text-[13px] font-black text-indigo-600">
                              -{formatCurrency(summary.additionalPaid)}
                            </td>
                          </tr>
                        )}
                        {Number(summary.paidTotal || 0) > 0 && (
                          <tr className="border-b border-slate-100 break-inside-avoid bg-slate-50/70" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                            <td colSpan={Math.max(1, activeColsCount - 1)} className="text-right py-2 px-3 uppercase tracking-widest text-[11px] font-bold text-slate-600">
                              Total abonado:
                            </td>
                            <td className="text-right py-2 px-3 text-[13px] font-black text-slate-800">
                              {formatCurrency(summary.paidTotal)}
                            </td>
                          </tr>
                        )}
                        <tr className="border-t border-slate-200 break-inside-avoid">
                          <td colSpan={Math.max(1, activeColsCount - 1)} className="text-right py-2.5 px-3 uppercase tracking-widest text-[11px] font-black text-amber-700">
                            Restante:
                          </td>
                          <td className="text-right py-2.5 px-3 text-[15px] font-black text-amber-700">
                            {formatCurrency(summary.remainingAmount || 0)}
                          </td>
                        </tr>
                      </>
                    )}
                  </>
                )}
              </tbody>
            </table>

            {/* CONDICIONES COMERCIALES */}
            <div className="border border-slate-300 rounded-lg p-4 break-inside-avoid shadow-sm" style={{ backgroundColor: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
              <h4 className="font-black mb-2 uppercase tracking-wider text-slate-800 text-[11px]">Pasos para realizar tu compra:</h4>
              <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-700">
                <li><strong>Reserva:</strong> Seña del 50% para confirmar y reservar mercadería. El saldo se abona al momento de la entrega o retiro.</li>
                <li><strong>Modificaciones:</strong> Con 72hs de anticipación, sujeto a disponibilidad de stock.</li>
                <li><strong>Cancelaciones:</strong> La seña no es reembolsable ya que se utiliza para reserva de mercadería.</li>
                <li><strong>Actualización:</strong> Los precios quedan congelados únicamente con el pago de la seña.</li>
                <li><strong>Validez:</strong> Este presupuesto tiene una validez de 7 días.</li>
              </ol>
            </div>
          </div>
        ) : (

          /* ========================================= */
          /* MODO 2: REPORTE INTERNO DE INVENTARIO     */
          /* ========================================= */
          <div className="block w-full">
            
            <div className="mb-4 border-b-2 border-slate-800 flex justify-between items-end pb-2">
              <div className="flex flex-col w-full max-w-[400px]">
                
                <h1 
                  className="text-2xl font-black uppercase tracking-[0.1em] text-slate-800 mb-3"
                  style={{ fontFamily: 'Calibri, sans-serif' }}
                >
                  Reporte Interno
                </h1>

                <div className="space-y-2.5" style={{ fontFamily: 'Calibri, sans-serif' }}>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-[2px]">Fecha y Hora</span>
                    <span className="text-[13px] leading-tight font-black text-slate-800 border-b border-slate-300 min-h-[17px]">
                      {date} - {time} hs
                    </span>
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex items-end justify-end">
                <img 
                  src={logoImg} 
                  alt="REBU Cotillón" 
                  className="h-[130px] w-auto object-contain -mb-[2px]" 
                  style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} 
                />
              </div>
            </div>
            
            <table className="w-full border-collapse text-sm">
              <thead className="table-header-group">
                <tr className="bg-slate-100 border-y-2 border-slate-800">
                  <th className="text-left py-2 px-3 font-bold uppercase text-[11px]">Producto</th>
                  {config.columns.cost && <th className="text-right py-2 px-3 font-bold uppercase text-[11px]">Costo</th>}
                  {config.columns.price && <th className="text-right py-2 px-3 font-bold uppercase text-[11px]">Precio Orig.</th>}
                  {config.columns.newPrice && <th className="text-right py-2 px-3 font-bold uppercase text-indigo-700 text-[11px]">Precio Edit.</th>}
                  {config.columns.stock && <th className="text-right py-2 px-3 font-bold uppercase text-[11px]">Stock</th>}
                </tr>
              </thead>
              <tbody className="table-row-group">
                {Object.entries(groupedItems).map(([category, catItems]) => (
                  <React.Fragment key={category}>
                    <tr className="bg-slate-100/50 break-after-avoid">
                      <td colSpan={1 + (config.columns.cost?1:0) + (config.columns.price?1:0) + (config.columns.newPrice?1:0) + (config.columns.stock?1:0)} className="py-1.5 px-3 font-black text-slate-700 uppercase tracking-widest text-[11px] border-b border-slate-300">
                        {category}
                      </td>
                    </tr>
                    {catItems.map((item, idx) => {
                      const isWeight = item.product_type === 'weight';
                      const rowColorClass = idx % 2 !== 0 ? 'bg-slate-50/80' : 'bg-transparent';
                      const p = Number(item.newPrice) || 0;
                      
                      // ✨ LOGICA DE AGOTADO EN REPORTE INTERNO (Stock 0 o Precio 0)
                      const isAgotado = (item.stock !== undefined && Number(item.stock) <= 0) || p === 0;

                      return (
                        <tr 
                          key={idx} 
                          className={`border-b border-slate-100 break-inside-avoid ${rowColorClass} ${isAgotado ? 'opacity-80' : ''}`}
                          style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
                        >
                          <td className={`py-1.5 px-4 font-medium text-[12px] ${isAgotado ? 'text-slate-500' : 'text-slate-800'}`}>
                            <span className="text-slate-400">•</span> 
                            <div className="flex items-start gap-2">
                              <span className="text-slate-400 text-lg leading-none shrink-0">•</span>
                              <div className="min-w-0 flex-1">
                                <span className="break-words">{item.title}</span>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  {isAgotado && (
                                    <span className="bg-red-100 text-red-700 text-[8px] px-1 py-0.5 rounded font-black uppercase tracking-widest border border-red-300 whitespace-nowrap shrink-0">
                                      Agotado - Preguntar
                                    </span>
                                  )}

                                  {isWeight && (
                                    <span className="bg-amber-100 text-amber-700 text-[8px] px-1 py-0.5 rounded font-bold uppercase tracking-widest border border-amber-200 whitespace-nowrap shrink-0">
                                      Peso
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          {config.columns.cost && <td className={`text-right py-1.5 px-3 text-[12px] ${isAgotado ? 'text-slate-400' : 'text-slate-500'}`}>{formatCurrency(item.cost)} {isWeight && <span className="text-[9px] text-slate-400">/Kg</span>}</td>}
                          {config.columns.price && <td className={`text-right py-1.5 px-3 text-[12px] ${isAgotado ? 'text-slate-400' : ''}`}>{formatCurrency(item.price)} {isWeight && <span className="text-[9px] text-slate-400">/Kg</span>}</td>}
                          {config.columns.newPrice && <td className={`text-right py-1.5 px-3 font-bold text-[12px] ${isAgotado ? 'text-slate-400' : 'text-indigo-600'}`}>{formatCurrency(item.newPrice)} {isWeight && <span className={`text-[9px] ${isAgotado ? 'text-slate-400' : 'text-indigo-300'}`}>/Kg</span>}</td>}
                          {config.columns.stock && <td className={`text-right py-1.5 px-3 font-mono text-[12px] ${isAgotado ? 'text-red-500 font-bold' : ''}`}>{item.stock} <span className="text-slate-400 text-[10px]">{isWeight ? 'g' : 'u'}</span></td>}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            <div className="mt-4 text-right text-[11px] font-bold text-slate-400 break-inside-avoid">
              Total de ítems exportados: {items.length}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
