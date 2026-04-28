import React from 'react';
import logoImg from '../../assets/logo-rebu.jpg';
import {
  X,
  CheckCircle,
  Printer,
  FileOutput,
  User,
  Package,
  Receipt,
  CreditCard,
  TicketPercent,
} from 'lucide-react';
import { FancyPrice } from '../FancyPrice';
import { formatWeight } from '../../utils/helpers';
import { TicketPrintLayout } from '../TicketPrintLayout';
import { getPaymentBreakdownDisplayItems, getPaymentSummary } from '../../utils/paymentBreakdown';

export const ImageModal = ({ isOpen, image, onClose }) => {
  if (!isOpen || !image) return null;
  return (
    <div className="fixed inset-0 z-[60] flex cursor-pointer items-center justify-center bg-black/95 p-4" onClick={onClose}>
      <img src={image} alt="Zoom" className="max-h-full max-w-full rounded-lg shadow-2xl" />
      <button className="absolute right-5 top-5 text-white/70 hover:text-white">
        <X size={32} />
      </button>
    </div>
  );
};

export const SaleSuccessModal = ({ transaction, onClose, onPrint }) => {
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
  const orderedItems = [...(transaction.items || [])].sort((a, b) => {
    const getPriority = (item) => {
      if (item?.isReward) return 2;
      if (item?.isDiscount) return 1;
      return 0;
    };
    return getPriority(a) - getPriority(b);
  });
  const isCashOnlyPayment =
    paymentItems.length === 1 &&
    paymentItems[0]?.method === 'Efectivo';

  const clientName =
    typeof transaction.client === 'string'
      ? transaction.client
      : transaction.client?.name || 'Consumidor final';
  const memberNumber = typeof transaction.client === 'object' ? transaction.client?.memberNumber : null;
  const currentPoints =
    typeof transaction.client === 'object'
      ? Number(transaction.client?.points ?? transaction.client?.currentPoints ?? 0)
      : 0;
  const totalItems = (transaction.items || []).reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0,
  );
  const previousPoints = memberNumber
    ? currentPoints - Number(transaction.pointsEarned || 0) + Number(transaction.pointsSpent || 0)
    : 0;
  const effectiveCashReceived =
    Number(transaction.cashReceived || 0) > 0
      ? Number(transaction.cashReceived || 0)
      : Number(transaction.total || 0) + Number(transaction.cashChange || 0);

  const formatItemQuantity = (item) => {
    if ((item.product_type || 'quantity') === 'weight') {
      return formatWeight(Number(item.quantity || 0));
    }
    return `${Number(item.quantity || 0)} u`;
  };

  const getItemSubtotal = (item) => {
    if (item.isReward) return null;
    const quantityFactor =
      (item.product_type || 'quantity') === 'weight'
        ? Number(item.quantity || 0) / 1000
        : Number(item.quantity || 0);
    return (Number(item.price) || 0) * quantityFactor;
  };

  const getItemDiscountAmount = (item) => {
    const quantityFactor =
      (item.product_type || 'quantity') === 'weight'
        ? Number(item.quantity || 0) / 1000
        : Number(item.quantity || 0);
    return Math.abs((Number(item.price) || 0) * quantityFactor);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="mx-auto flex max-h-[92vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 px-5 py-2.5 text-center">
          <div className="mx-auto mb-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg">
            <CheckCircle size={26} className="text-green-500" />
          </div>
          <h3 className="text-[17px] font-bold text-white">Venta exitosa</h3>
          <p className="text-sm text-green-100">La transacción se registró correctamente.</p>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[260px_minmax(360px,1fr)_300px]">
          <div className="order-2 min-h-0 space-y-2 overflow-y-auto px-3.5 pb-3.5 pt-2.5 md:px-4 md:pb-4 md:pt-3">
            <div className="hidden">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Número de compra</p>
              <p className="text-[26px] font-black leading-none text-slate-800 sm:col-start-2 sm:row-start-2">#{String(transaction.id).padStart(6, '0')}</p>
              <div className="mt-2 grid gap-1.5 sm:mt-0 sm:contents">
                <div className="rounded-lg bg-white/80 px-2.5 py-1.5 text-left sm:col-start-1 sm:row-span-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-blue-400">Vendedor</p>
                  <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] font-black leading-tight text-blue-700">
                    <User size={13} className="shrink-0" />
                    <span className="min-w-0 break-words">{transaction.user || 'Sin usuario'}</span>
                  </p>
                </div>
                <div className="rounded-lg bg-white/80 px-2.5 py-1.5 text-left sm:col-start-3 sm:row-span-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-fuchsia-400">Método de pago</p>
                  <p className="mt-0.5 flex min-w-0 items-start gap-1.5 text-[12px] font-black leading-tight text-fuchsia-700">
                    <CreditCard size={13} className="mt-[1px] shrink-0" />
                    <span className="min-w-0 break-words">{paymentSummary}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-1.5 sm:grid-cols-[0.9fr_1.1fr]">
              <div className="hidden min-w-0 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 min-h-[74px]">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-400">Vendedor</p>
                <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] font-black leading-tight text-blue-700">
                  <User size={13} className="shrink-0" />
                  <span className="min-w-0 break-words">{transaction.user || 'Sin usuario'}</span>
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-1 text-center min-h-[68px] flex flex-col items-center justify-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Número de compra</p>
                <p className="mt-0.5 text-[24px] font-black leading-none text-slate-800">#{String(transaction.id).padStart(6, '0')}</p>
              </div>
              <div className="min-w-0 rounded-xl border border-fuchsia-100 bg-fuchsia-50 px-3 py-1.5 min-h-[68px]">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-fuchsia-400">Método de pago</p>
                <p className="mt-0.5 flex min-w-0 items-start gap-1.5 text-[12px] font-black leading-tight text-fuchsia-700">
                  <CreditCard size={13} className="mt-[1px] shrink-0" />
                  <span className="min-w-0 break-words">{paymentSummary}</span>
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="min-w-0 rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Socio</p>
                    <p className="mt-0.5 break-words text-[13px] font-black leading-tight text-slate-800">
                      {clientName}
                      {memberNumber ? ` #${String(memberNumber).padStart(4, '0')}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-black text-sky-600">
                      <span className="inline-flex items-center gap-1">
                        <User size={10} />
                        {transaction.user || 'Sin usuario'}
                      </span>
                    </div>
                    <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-black text-sky-600">
                      Puntos
                    </span>
                  </div>
                </div>
                <div className="mt-1 grid gap-1 sm:grid-cols-4">
                  <div className="rounded-lg bg-white/80 px-2.5 py-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-sky-400">Antes</p>
                    <p className="mt-0.5 text-[13px] font-black text-sky-700">{memberNumber ? previousPoints : 'Sin socio'}</p>
                  </div>
                  <div className="rounded-lg bg-white/80 px-2.5 py-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-rose-400">Canjeados</p>
                    <p className="mt-0.5 text-[13px] font-black text-rose-600">{Number(transaction.pointsSpent || 0)}</p>
                  </div>
                  <div className="rounded-lg bg-white/80 px-2.5 py-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-400">Ganados</p>
                    <p className="mt-0.5 text-[13px] font-black text-emerald-600">{Number(transaction.pointsEarned || 0)}</p>
                  </div>
                  <div className="rounded-lg bg-white/80 px-2.5 py-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.12em] text-blue-400">{memberNumber ? 'Actuales' : 'Estado'}</p>
                    <p className="mt-0.5 text-[13px] font-black text-blue-700">{memberNumber ? currentPoints : 'Sin socio'}</p>
                  </div>
                </div>
              </div>
              <div className="hidden rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 min-h-[88px]">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-400">Puntos</p>
                <div className="mt-0.5 space-y-0.5 text-[13px] font-bold leading-tight text-emerald-700">
                  <p>Ganados: {Number(transaction.pointsEarned || 0)}</p>
                  <p>Canjeados: {Number(transaction.pointsSpent || 0)}</p>
                  {memberNumber ? <p>Actuales: {currentPoints}</p> : <p>Sin socio asignado</p>}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <Receipt size={15} className="text-slate-500" />
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Datos de la compra</p>
                </div>
                <div className="mt-2 grid gap-1.5 text-[13px] text-slate-700 sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-1.5">
                    <span className="font-bold text-slate-500">Fecha</span>
                    <span className="font-black text-slate-800">{transaction.date || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-1.5">
                    <span className="font-bold text-slate-500">Hora</span>
                    <span className="font-black text-slate-800">{transaction.time || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-1.5">
                    <span className="font-bold text-slate-500">Items</span>
                    <span className="font-black text-slate-800">{totalItems}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-1.5">
                    <span className="font-bold text-slate-500">Estado</span>
                    <span className="font-black text-emerald-600">Completada</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              {paymentItems.map((paymentItem) => (
                <div key={paymentItem.key} className="rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 break-words text-[14px] font-black leading-none text-slate-700">{paymentItem.title}</span>
                    <span className="shrink-0 text-[15px] font-black text-slate-800">
                      <FancyPrice amount={paymentItem.chargedAmount || 0} />
                    </span>
                  </div>
                  {paymentItem.method === 'Efectivo' && isCashOnlyPayment && (
                    <div className="mt-0.5 flex items-center justify-between text-[11px] font-bold leading-tight">
                      <span className="text-blue-600">Recibido</span>
                      <span className="text-blue-700">
                        <FancyPrice amount={Number(paymentItem.cashReceived || effectiveCashReceived || 0)} />
                      </span>
                    </div>
                  )}
                  {paymentItem.method === 'Efectivo' && isCashOnlyPayment && Number(paymentItem.cashChange || 0) > 0 && (
                    <div className="mt-0.5 flex items-center justify-between text-[11px] font-bold leading-tight">
                      <span className="text-emerald-600">Devolución</span>
                      <span className="text-emerald-700">
                        <FancyPrice amount={paymentItem.cashChange} />
                      </span>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex items-end justify-between gap-3 border-t border-slate-200 pt-2">
                <span className="font-black text-slate-600">TOTAL</span>
                <span className="text-[28px] font-black leading-none text-green-600">
                  <FancyPrice amount={transaction.total} />
                </span>
              </div>
            </div>
          </div>

          <div className="order-3 flex min-h-0 flex-col border-t border-slate-200 bg-slate-50 px-2.5 pb-2.5 pt-2 lg:max-h-[calc(92vh-150px)] lg:self-start lg:border-l lg:border-t-0 lg:px-[3%] lg:pb-3 lg:pt-2.5">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Package size={15} className="text-slate-500" />
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Productos del pedido</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black text-slate-500">
                {orderedItems.length}
              </span>
            </div>

            <div className="mt-2 max-h-full space-y-1 overflow-y-auto pr-0.5">
              {orderedItems.map((item, index) => {
                const itemSubtotal = getItemSubtotal(item);
                const itemDiscountAmount = getItemDiscountAmount(item);
                const itemImage = item.imageThumb || item.image_thumb || item.image || '';
                const isRewardItem = Boolean(item.isReward);
                const isDiscountItem = Boolean(item.isDiscount);
                const isDiscountLike = Boolean(isRewardItem || isDiscountItem);

                return (
                  <div
                    key={`${item.id || item.title}-${index}`}
                    title={item.title || 'Producto'}
                    className="rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                          {itemImage ? (
                            <img
                              src={itemImage}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              fetchpriority="low"
                              className="h-full w-full object-cover"
                            />
                          ) : isDiscountLike ? (
                            <div className={`flex h-full w-full items-center justify-center ${isRewardItem ? 'bg-violet-50 text-violet-500' : 'bg-emerald-50 text-emerald-500'}`}>
                              <TicketPercent size={20} strokeWidth={2.4} />
                            </div>
                          ) : (
                            <img
                              src={logoImg}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              fetchpriority="low"
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-black leading-tight text-slate-900">{item.title || 'Producto'}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] font-bold leading-tight text-slate-500">
                            <span>{formatItemQuantity(item)}</span>
                            {isDiscountLike && (
                              <span className={`rounded-full px-2 py-0.5 ${isRewardItem ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                <TicketPercent size={10} className="mr-1 inline" />
                                Descuento
                              </span>
                            )}
                            {item.isCombo && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-700">Combo</span>}
                            {item.isCustom && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Personalizado</span>}
                          </div>
                          {!isDiscountLike && (
                            <p className="mt-0.5 truncate text-[9px] font-bold leading-tight text-slate-400">
                              Valor unitario:{' '}
                              <span className="text-slate-600">
                                {(item.product_type || 'quantity') === 'weight'
                                  ? `$${Number(item.price || 0).toLocaleString('es-AR')} / kg`
                                  : <FancyPrice amount={Number(item.price || 0)} />}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 rounded-md bg-slate-50 px-1.5 py-0.5 text-right">
                        <p className={`text-[9px] font-black uppercase tracking-[0.1em] ${isRewardItem ? 'text-violet-400' : isDiscountItem ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {isDiscountLike ? 'Descuento' : 'Subtotal'}
                        </p>
                        <p className={`text-[12px] font-black ${isRewardItem ? 'text-violet-600' : isDiscountItem ? 'text-emerald-600' : 'text-slate-800'}`}>
                          {isDiscountLike ? <FancyPrice amount={itemDiscountAmount} /> : <FancyPrice amount={itemSubtotal} />}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="order-1 flex min-h-0 flex-col border-t border-slate-200 bg-slate-100 px-3 pb-3 pt-2.5 lg:border-r lg:border-t-0 lg:px-[4%] lg:pb-3.5 lg:pt-3">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <FileOutput size={13} className="shrink-0 text-slate-500" />
                <p className="min-w-0 whitespace-nowrap text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Vista previa del ticket</p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-black text-slate-500">
                58mm
              </span>
            </div>

            <div className="mt-2.5 flex min-h-0 flex-1 justify-center overflow-y-auto rounded-lg border border-slate-200 bg-slate-200 p-2.5">
              <div className="w-[82%] overflow-hidden rounded-sm bg-white px-[3%] py-2.5 shadow-md">
                <TicketPrintLayout transaction={transaction} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t bg-slate-50 p-2.5">
          <button
            onClick={onPrint}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-800 py-2 text-sm font-bold text-white transition hover:bg-slate-900"
          >
            <Printer size={17} /> Imprimir ticket
          </button>
          <button
            onClick={onClose}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-500 py-2 text-sm font-bold text-white transition hover:bg-green-600"
          >
            <CheckCircle size={17} /> Continuar
          </button>
        </div>
      </div>
    </div>
  );
};

export const TicketModal = ({ transaction, onClose, onPrint }) => {
  if (!transaction) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b bg-slate-100 p-4 shrink-0">
          <h3 className="flex items-center gap-2 font-bold text-slate-800">
            <FileOutput size={18} /> Visualización Ticket
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex justify-center overflow-y-auto bg-slate-200 p-6">
          <TicketPrintLayout transaction={transaction} />
        </div>

        <div className="border-t bg-white p-4 shrink-0">
          <button
            onClick={onPrint}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 font-bold text-white transition hover:bg-slate-800 shadow-lg"
          >
            <Printer size={20} /> Imprimir Ahora
          </button>
        </div>
      </div>
    </div>
  );
};

