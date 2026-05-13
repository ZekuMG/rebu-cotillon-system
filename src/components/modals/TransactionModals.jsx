import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Search,
  Trash2,
  AlertTriangle,
  FileText,
  Barcode,
  Package,
  ShoppingCart,
  User,
  Gift,
  TicketPercent,
  ChevronDown
} from 'lucide-react';
import { PAYMENT_METHODS } from '../../data';
// ♻️ FIX: Importamos FancyPrice
import AsyncActionButton from '../AsyncActionButton';
import { FancyPrice } from '../FancyPrice';
import usePendingAction from '../../hooks/usePendingAction';
import {
  createPaymentLine,
  getPaymentBreakdownTotals,
  getPaymentLineCashChange,
  getPaymentLineCashMissing,
  getPaymentLineCashReceived,
  getPaymentLineChargedTotal,
  getPaymentSummary,
  normalizePaymentBreakdown,
} from '../../utils/paymentBreakdown';
import { normalizeLegacyOffer } from '../../utils/offerHelpers';

const roundCurrency = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const EditTransactionModal = ({
  transaction, onClose, inventory, setEditingTransaction,
  transactionSearch, setTransactionSearch,
  editReason, setEditReason, onSave,
  members = [],
  offers = [],
}) => {
  const searchInputRef = useRef(null);
  const { isPending, runAction } = usePendingAction();
  const [showMemberMenu, setShowMemberMenu] = useState(false);
  const [memberFilterSearch, setMemberFilterSearch] = useState('');

  // Auto-focus en el buscador para que la pistola láser funcione directo
  useEffect(() => {
    if (transaction?.id) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [transaction?.id]);

  // Lector de Código de Barras Global para el Modal
  useEffect(() => {
    let buffer = '';
    let lastTime = 0;

    const handleKeyDown = (e) => {
      if (!transaction) return;
      const target = e.target;
      const isTypingField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      if (isTypingField && target !== searchInputRef.current) return;
      
      if (e.key === 'Enter' && buffer.length > 3) {
        e.preventDefault();
        const scanned = buffer;
        buffer = '';
        const product = inventory.find(p => String(p.barcode) === scanned);
        if (product) handleAddLocalItem(product);
      } else if (e.key.length === 1) {
        const now = Date.now();
        if (now - lastTime > 50) buffer = ''; 
        buffer += e.key;
        lastTime = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [transaction, inventory]);

  if (!transaction) return null;

  // ── LÓGICA LOCAL DEL MODAL (Evita errores del padre) ──
  const clearDerivedLineTotals = (item = {}) => {
    const { subtotal, lineSubtotal, line_subtotal, lineTotal, line_total, ...rest } = item;
    return rest;
  };

  const getLineSubtotal = (item = {}) => {
    const price = Number(item.price || 0);
    const qty = Number(item.qty ?? item.quantity ?? 0);
    if (Number.isFinite(price) && Number.isFinite(qty) && qty !== 0) {
      if ((item.product_type || 'quantity') !== 'weight') return price * qty;
      return price >= 100 ? price * (qty / 1000) : price * qty;
    }
    const explicitSubtotal = Number(item.subtotal ?? item.lineSubtotal ?? item.line_subtotal);
    return Number.isFinite(explicitSubtotal) ? explicitSubtotal : 0;
  };

  const getItemsSubtotal = (items = []) =>
    items.reduce((acc, i) => acc + getLineSubtotal(i), 0);

  const getTransactionPaymentLines = (sourceTransaction, subtotal) => {
    if (Array.isArray(sourceTransaction.paymentBreakdown) && sourceTransaction.paymentBreakdown.length > 0) {
      return normalizePaymentBreakdown(
        sourceTransaction.paymentBreakdown,
        sourceTransaction.payment,
        sourceTransaction.installments,
        sourceTransaction.cashReceived,
        sourceTransaction.cashChange,
        sourceTransaction.total,
      );
    }

    return [
      createPaymentLine({
        id: 'edit_payment_primary',
        method: sourceTransaction.payment || 'Efectivo',
        amount: subtotal,
        installments: sourceTransaction.payment === 'Credito' ? Number(sourceTransaction.installments || 1) || 1 : 0,
        cashReceived: sourceTransaction.payment === 'Efectivo' ? (sourceTransaction.cashReceived || subtotal) : 0,
      }),
    ];
  };

  const buildPaymentState = (sourceTransaction, items, requestedLines = null) => {
    const subtotal = roundCurrency(getItemsSubtotal(items));
    const sourceLines = requestedLines || getTransactionPaymentLines(sourceTransaction, subtotal);
    const lineCount = sourceLines.length > 1 ? 2 : 1;
    const primarySource = sourceLines[0] || createPaymentLine({ id: 'edit_payment_primary', method: 'Efectivo', amount: subtotal });
    const secondarySource = sourceLines[1] || createPaymentLine({
      id: 'edit_payment_secondary',
      method: primarySource.method === 'Efectivo' ? 'Debito' : 'Efectivo',
      amount: 0,
    });
    const primaryAmount = lineCount > 1
      ? Math.min(Math.max(roundCurrency(primarySource.amount || 0), 0), subtotal)
      : subtotal;
    const secondaryAmount = lineCount > 1 ? Math.max(roundCurrency(subtotal - primaryAmount), 0) : 0;
    const baseLines = lineCount > 1
      ? [
          { ...primarySource, amount: primaryAmount },
          { ...secondarySource, amount: secondaryAmount },
        ]
      : [{ ...primarySource, amount: subtotal }];
    const editLines = lineCount > 1
      ? baseLines.map((line) =>
          line.method === 'Efectivo'
            ? { ...line, cashReceived: undefined, cashChange: 0 }
            : line
        )
      : baseLines;
    const normalizedLines = normalizePaymentBreakdown(editLines, primarySource.method || 'Efectivo', primarySource.installments || 0, 0, 0, subtotal);
    const totals = getPaymentBreakdownTotals(normalizedLines);
    const payment = getPaymentSummary(normalizedLines, normalizedLines[0]?.method || 'Efectivo', normalizedLines[0]?.installments || 0);

    return {
      subtotal,
      total: totals.chargedTotal,
      payment,
      paymentBreakdown: normalizedLines,
      installments: normalizedLines.find((line) => line.method === 'Credito')?.installments || 0,
      cashReceived: normalizedLines
        .filter((line) => line.method === 'Efectivo')
        .reduce((sum, line) => sum + getPaymentLineCashReceived(line), 0),
      cashChange: normalizedLines
        .filter((line) => line.method === 'Efectivo')
        .reduce((sum, line) => sum + getPaymentLineCashChange(line), 0),
    };
  };

  const applyTransactionState = (draftTransaction, nextItems = draftTransaction.items, requestedLines = null) => {
    const paymentState = buildPaymentState(draftTransaction, nextItems, requestedLines);
    setEditingTransaction({
      ...draftTransaction,
      items: nextItems,
      total: paymentState.total,
      payment: paymentState.payment,
      paymentBreakdown: paymentState.paymentBreakdown,
      installments: paymentState.installments,
      cashReceived: paymentState.cashReceived,
      cashChange: paymentState.cashChange,
    });
  };

  const handleAddLocalItem = (product) => {
    const newItems = [...transaction.items];
    const existingIdx = newItems.findIndex(i => (i.id || i.productId) === product.id);
    
    if (existingIdx >= 0) {
      const currentItem = clearDerivedLineTotals(newItems[existingIdx]);
      const currentQty = Number(currentItem.qty ?? currentItem.quantity ?? 0) || 0;
      newItems[existingIdx] = {
        ...currentItem,
        qty: currentQty + 1,
        quantity: currentQty + 1,
      };
    } else {
      newItems.push({
        id: product.id,
        productId: product.id,
        title: product.title,
        price: Number(product.price) || 0,
        qty: 1,
        product_type: product.product_type || 'quantity'
      });
    }
    applyTransactionState(transaction, newItems);
    setTransactionSearch('');
  };

  const handleUpdateItem = (index, field, value) => {
    const newItems = [...transaction.items];
    const numValue = value === '' ? '' : Number(value);
    const nextItem = { ...clearDerivedLineTotals(newItems[index]), [field]: numValue };
    if (field === 'qty') nextItem.quantity = numValue;
    newItems[index] = nextItem;
    applyTransactionState(transaction, newItems);
  };

  const handleRemoveLocalItem = (index) => {
    const newItems = transaction.items.filter((_, i) => i !== index);
    applyTransactionState(transaction, newItems);
  };

  const handlePaymentChangeLocal = (payment) => {
    const subtotal = roundCurrency(getItemsSubtotal(transaction.items));
    applyTransactionState(
      { ...transaction, payment, installments: payment === 'Credito' ? 1 : 0, paymentBreakdown: null },
      transaction.items,
      [createPaymentLine({
        id: 'edit_payment_primary',
        method: payment,
        amount: subtotal,
        installments: payment === 'Credito' ? 1 : 0,
        cashReceived: payment === 'Efectivo' ? subtotal : 0,
      })],
    );
  };

  const paymentLines = Array.isArray(transaction.paymentBreakdown) && transaction.paymentBreakdown.length > 0
    ? normalizePaymentBreakdown(
        transaction.paymentBreakdown,
        transaction.payment,
        transaction.installments,
        transaction.cashReceived,
        transaction.cashChange,
        transaction.total,
      )
    : buildPaymentState(transaction, transaction.items).paymentBreakdown;
  const isSplitPayment = paymentLines.length > 1;
  const itemsSubtotal = roundCurrency(getItemsSubtotal(transaction.items));
  const paymentTotals = getPaymentBreakdownTotals(paymentLines);
  const cashMissingAmount = paymentTotals.cashMissingTotal;
  const cashChangeAmount = paymentTotals.cashChangeTotal;
  const creditSurcharge = paymentTotals.surchargeTotal;

  const updatePaymentLines = (updater) => {
    const nextLines = typeof updater === 'function' ? updater(paymentLines.map((line) => ({ ...line }))) : updater;
    const sanitizedLines = Array.isArray(nextLines) && nextLines.length > 1
      ? nextLines.map((line) =>
          line.method === 'Efectivo'
            ? { ...line, cashReceived: undefined, cashChange: 0 }
            : line
        )
      : nextLines;
    applyTransactionState(transaction, transaction.items, sanitizedLines);
  };

  const handleSplitPaymentToggle = () => {
    if (isSplitPayment) {
      const primary = paymentLines[0] || createPaymentLine({ method: 'Efectivo', amount: itemsSubtotal });
      updatePaymentLines([{ ...primary, amount: itemsSubtotal }]);
      return;
    }

    const primary = paymentLines[0] || createPaymentLine({ method: 'Efectivo', amount: itemsSubtotal });
    const primaryAmount = Math.min(roundCurrency(itemsSubtotal / 2), itemsSubtotal);
    updatePaymentLines([
      { ...primary, amount: primaryAmount },
      createPaymentLine({
        id: 'edit_payment_secondary',
        method: primary.method === 'Efectivo' ? 'Debito' : 'Efectivo',
        amount: Math.max(roundCurrency(itemsSubtotal - primaryAmount), 0),
      }),
    ]);
  };

  const handlePaymentLineMethodChange = (lineIndex, method) => {
    updatePaymentLines((lines) =>
      lines.map((line, index) => (
        index === lineIndex
          ? {
              ...line,
              method,
              installments: method === 'Credito' ? Number(line.installments || 1) || 1 : 0,
              cashReceived: method === 'Efectivo' ? getPaymentLineChargedTotal({ ...line, method }) : 0,
            }
          : line
      ))
    );
  };

  const handlePrimaryPaymentAmountChange = (value) => {
    const primaryAmount = Math.min(Math.max(roundCurrency(value), 0), itemsSubtotal);
    updatePaymentLines((lines) => [
      { ...lines[0], amount: primaryAmount },
      { ...(lines[1] || createPaymentLine({ method: 'Debito' })), amount: Math.max(roundCurrency(itemsSubtotal - primaryAmount), 0) },
    ]);
  };

  const discountBaseTotal = transaction.items.reduce((sum, item) => (
    item.isDiscount || item.isReward || item.type === 'discount'
      ? sum
      : sum + getLineSubtotal(item)
  ), 0);

  const selectedMemberId =
    transaction.client && typeof transaction.client === 'object'
      ? String(transaction.client.id || '')
      : '';
  const selectedMember =
    (members || []).find((member) => String(member.id) === selectedMemberId) ||
    (transaction.client && typeof transaction.client === 'object' ? transaction.client : null);
  const selectedMemberLabel = selectedMember
    ? `${selectedMember.name || 'Socio'} #${selectedMember.memberNumber || selectedMember.member_number || '---'}`
    : 'Sin socio';
  const visibleMemberOptions = (members || []).filter((member) => {
    const search = memberFilterSearch.trim().toLowerCase();
    if (!search) return true;
    return [
      member.name,
      member.memberNumber,
      member.member_number,
      member.dni,
      member.phone,
      member.email,
    ].some((value) => String(value || '').toLowerCase().includes(search));
  });

  const compactOffers = (offers || [])
    .map((offer) => ({ ...offer, canonical: offer.canonical || normalizeLegacyOffer(offer, {}, inventory) }))
    .filter((offer) =>
      offer.canonical?.benefitType === 'coupon' ||
      offer.canonical?.benefitType === 'discount'
    )
    .slice(0, 5);

  const handleMemberChange = (memberId) => {
    if (!memberId) {
      setEditingTransaction({
        ...transaction,
        client: null,
        memberNumber: null,
        pointsEarned: 0,
        pointsSpent: 0,
      });
      return;
    }

    const member = (members || []).find((item) => String(item.id) === String(memberId));
    if (!member) return;
    setEditingTransaction({
      ...transaction,
      client: member,
      memberNumber: member.memberNumber || member.member_number || null,
      pointsEarned: Math.floor(Number(transaction.total || itemsSubtotal || 0) / 500),
    });
  };

  const handlePointsSpentChange = (value) => {
    const requestedPoints = Math.max(0, Number(value) || 0);
    const selectedMember = (members || []).find((member) => String(member.id) === selectedMemberId);
    const availablePoints = Number(selectedMember?.points || transaction.client?.points || 0);
    setEditingTransaction({
      ...transaction,
      pointsSpent: selectedMember ? Math.min(requestedPoints, availablePoints) : requestedPoints,
    });
  };

  const applyDiscountItem = ({ title, amount, originalOfferId = null, couponCode = '' }) => {
    const discountAmount = Math.min(Math.abs(Number(amount) || 0), Math.max(discountBaseTotal, 0));
    if (discountAmount <= 0) return;

    const nextItems = [
      ...transaction.items,
      {
        id: `edit_discount_${originalOfferId || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        productId: null,
        title,
        price: -discountAmount,
        qty: 1,
        quantity: 1,
        subtotal: -discountAmount,
        product_type: 'quantity',
        isDiscount: true,
        type: 'discount',
        originalOfferId,
        couponCode,
      },
    ];
    applyTransactionState(transaction, nextItems);
  };

  const handleApplyOffer = (offer) => {
    const canonical = offer.canonical || normalizeLegacyOffer(offer, {}, inventory);
    const rawValue = Number(canonical.discountValue || offer.discountValue || 0);
    const discountAmount = canonical.discountMode === 'percentage'
      ? Math.round((discountBaseTotal * rawValue) / 100)
      : rawValue;

    applyDiscountItem({
      title: canonical.benefitType === 'coupon'
        ? `Cupon ${canonical.couponCode || offer.name || 'Manual'}`
        : offer.name || 'Descuento',
      amount: discountAmount,
      originalOfferId: offer.id || null,
      couponCode: canonical.couponCode || '',
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-3 animate-in fade-in duration-200">
      <div className="bg-white rounded-[14px] shadow-2xl w-full max-w-4xl flex flex-col max-h-[88vh] border border-slate-200">
        
        {/* HEADER */}
        <div className="flex justify-between items-center p-2.5 border-b border-slate-100 bg-slate-50/50 rounded-t-[14px]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-sm">
              <ShoppingCart size={15} />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-slate-800">Modificar Venta #{transaction.id}</h3>
              <p className="text-[10px] text-slate-500">Agrega, quita o ajusta cantidades</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* BODY */}
        <div className="grid h-[min(62vh,540px)] min-h-0 grid-cols-1 overflow-hidden bg-[#f8fafc] lg:grid-cols-[318px_minmax(0,1fr)]">
          <div className="min-h-0 space-y-1.5 overflow-y-auto border-r border-slate-200 p-2.5 custom-scrollbar">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Subtotal</p>
                <p className="mt-1 text-sm font-black text-slate-800"><FancyPrice amount={itemsSubtotal} /></p>
              </div>
              <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-green-600">Total</p>
                <p className="mt-1 text-sm font-black text-green-700"><FancyPrice amount={transaction.total} /></p>
              </div>
            </div>

            {creditSurcharge > 0 && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-800">
                <AlertTriangle size={13} className="mr-1 inline" /> Recargo credito: <FancyPrice amount={creditSurcharge} />
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  <User size={12} /> Socio y extras
                </p>
                <span className="text-[10px] font-bold text-slate-400">
                  {transaction.pointsEarned || 0} pts ganados
                </span>
              </div>

              <select
                className="hidden"
                value={selectedMemberId}
                onChange={(e) => handleMemberChange(e.target.value)}
              >
                <option value="">Sin socio</option>
                {(members || []).map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} #{member.memberNumber || member.member_number || '---'}
                  </option>
                ))}
              </select>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMemberMenu((prev) => !prev)}
                  className={`flex h-8 w-full items-center gap-1.5 rounded-lg border px-2 text-left text-[11px] font-bold transition-all ${
                    showMemberMenu || selectedMemberId
                      ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                  }`}
                  title="Filtrar por socio"
                >
                  <User size={13} className={selectedMemberId ? 'text-blue-500' : 'text-slate-400'} />
                  <span className="min-w-0 flex-1 truncate">{selectedMemberLabel}</span>
                  <ChevronDown size={13} className={`shrink-0 text-slate-400 transition-transform ${showMemberMenu ? 'rotate-180' : ''}`} />
                </button>

                {showMemberMenu && (
                  <>
                    <div className="fixed inset-0 z-[210]" onClick={() => setShowMemberMenu(false)} />
                    <div className="absolute left-0 top-full z-[220] mt-1.5 w-full min-w-[260px] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                      <div className="relative mb-2">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          value={memberFilterSearch}
                          onChange={(event) => setMemberFilterSearch(event.target.value)}
                          placeholder="Buscar socio..."
                          className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                          autoFocus
                        />
                      </div>
                      <div className="custom-scrollbar max-h-52 overflow-y-auto pr-1">
                        <button
                          type="button"
                          onClick={() => {
                            handleMemberChange('');
                            setShowMemberMenu(false);
                            setMemberFilterSearch('');
                          }}
                          className={`mb-1 flex h-8 w-full items-center rounded-lg px-2 text-left text-xs font-bold transition ${
                            !selectedMemberId
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Sin socio
                        </button>
                        {visibleMemberOptions.map((member) => {
                          const memberNumber = member.memberNumber || member.member_number || '---';
                          return (
                            <button
                              key={member.id}
                              type="button"
                              onClick={() => {
                                handleMemberChange(member.id);
                                setShowMemberMenu(false);
                                setMemberFilterSearch('');
                              }}
                              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-bold transition ${
                                String(member.id) === selectedMemberId
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'text-slate-600 hover:bg-slate-50'
                              }`}
                              title={`${member.name} #${memberNumber}`}
                            >
                              <span className="min-w-0 flex-1 truncate">{member.name}</span>
                              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">#{memberNumber}</span>
                            </button>
                          );
                        })}
                        {visibleMemberOptions.length === 0 && (
                          <p className="px-2 py-3 text-center text-xs font-semibold text-slate-400">Sin socios</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <label className="block">
                  <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.1em] text-fuchsia-600">
                    <Gift size={11} /> Canje
                  </span>
                  <input
                    type="number"
                    min="0"
                    className="mt-1 h-8 w-full rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-2 text-[11px] font-bold text-slate-800 outline-none focus:ring-2 focus:ring-fuchsia-400"
                    value={transaction.pointsSpent || 0}
                    onChange={(e) => handlePointsSpentChange(e.target.value)}
                    disabled={!selectedMemberId}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => applyDiscountItem({ title: 'Descuento manual', amount: Math.round(discountBaseTotal * 0.1) })}
                  className="mt-5 h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-black text-emerald-700 transition hover:bg-emerald-100"
                >
                  -10%
                </button>
              </div>

              {compactOffers.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-600">
                    <TicketPercent size={11} /> Cupones / descuentos
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {compactOffers.map((offer) => (
                      <button
                        key={offer.id || offer.name}
                        type="button"
                        onClick={() => handleApplyOffer(offer)}
                        className="max-w-full truncate rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 transition hover:bg-emerald-100"
                        title={offer.name}
                      >
                        {offer.canonical?.benefitType === 'coupon' ? `Cupon ${offer.canonical.couponCode || offer.name}` : offer.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Pago</p>
                <button type="button" onClick={handleSplitPaymentToggle} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-600 transition hover:bg-slate-100">
                  {isSplitPayment ? 'Un solo pago' : 'Dividir pago'}
                </button>
              </div>

              <div className="space-y-2">
                {paymentLines.map((line, lineIndex) => {
                  const isCash = line.method === 'Efectivo';
                  const cashMissing = getPaymentLineCashMissing(line);
                  const cashChange = getPaymentLineCashChange(line);
                  return (
                    <div key={line.id || `edit-payment-${lineIndex}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <div className="grid grid-cols-[1fr_96px] gap-2">
                        <select className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" value={line.method} onChange={(e) => handlePaymentLineMethodChange(lineIndex, e.target.value)}>
                          {PAYMENT_METHODS.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
                        </select>
                        {isSplitPayment && lineIndex === 0 ? (
                          <input type="number" min="0" step="1" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-[11px] font-black text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" value={line.amount} onChange={(e) => handlePrimaryPaymentAmountChange(e.target.value)} />
                        ) : (
                          <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-[11px] font-black text-slate-700"><FancyPrice amount={line.amount} /></div>
                        )}
                      </div>

                      {line.method === 'Credito' && (
                        <select className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-[11px] font-bold text-blue-800 outline-none focus:ring-2 focus:ring-blue-500" value={Number(line.installments || 1)} onChange={(e) => updatePaymentLines((lines) => lines.map((entry, index) => index === lineIndex ? { ...entry, installments: Number(e.target.value || 1) || 1 } : entry))}>
                          <option value={1}>1 pago</option><option value={3}>3 cuotas</option><option value={6}>6 cuotas</option><option value={12}>12 cuotas</option>
                        </select>
                      )}

                      {isCash && isSplitPayment && (
                        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                          <p className="text-[9px] font-black uppercase tracking-[0.1em] text-emerald-700">Pagado con efectivo</p>
                          <p className="mt-0.5 text-[11px] font-black text-emerald-800">
                            <FancyPrice amount={getPaymentLineChargedTotal(line)} />
                          </p>
                        </div>
                      )}

                      {isCash && !isSplitPayment && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-emerald-700">Recibido</span>
                            <input type="number" min="0" step="1" className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500" value={line.cashReceived ?? ''} onChange={(e) => updatePaymentLines((lines) => lines.map((entry, index) => index === lineIndex ? { ...entry, cashReceived: e.target.value } : entry))} />
                          </label>
                          <div className={`rounded-lg border px-2 py-1.5 ${cashMissing > 0 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                            <p className="text-[9px] font-black uppercase tracking-[0.1em]">{cashMissing > 0 ? 'Falta' : 'Cambio'}</p>
                            <p className="mt-1 text-[11px] font-black"><FancyPrice amount={cashMissing > 0 ? cashMissing : cashChange} /></p>
                          </div>
                        </div>
                      )}
                      <p className="mt-1 text-right text-[10px] font-bold text-slate-500">Cobra <FancyPrice amount={getPaymentLineChargedTotal(line)} /></p>
                    </div>
                  );
                })}
              </div>
            </div>
          
          {/* Buscador */}
          <div className="relative hidden">
            <div className="flex items-center border border-slate-200 rounded-xl px-3 bg-white shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
              <Search size={16} className="text-slate-400" />
              <input
                ref={searchInputRef}
                type="text" 
                placeholder="Buscar por nombre o escanear código de barras..." 
                className="w-full p-2 bg-transparent text-xs outline-none text-slate-700"
                value={transactionSearch} 
                onChange={(e) => setTransactionSearch(e.target.value)} 
              />
              <Barcode size={18} className="text-slate-300" />
            </div>
            
            {transactionSearch && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 shadow-xl rounded-xl max-h-48 overflow-y-auto z-20 p-1 animate-in fade-in slide-in-from-top-2">
                {inventory.filter((p) => p.title.toLowerCase().includes(transactionSearch.toLowerCase())).map((p) => (
                  <button key={p.id} onClick={() => handleAddLocalItem(p)} className="w-full text-left p-2.5 hover:bg-blue-50 text-sm flex justify-between items-center rounded-lg transition-colors group">
                    <span className="font-medium text-slate-700 group-hover:text-blue-700 flex items-center gap-2">
                      <Package size={14} className="text-slate-400" /> {p.title}
                    </span>
                    {/* ♻️ FIX: FancyPrice en el precio del buscador */}
                    <span className="font-bold text-slate-800">
                      <FancyPrice amount={p.price} />
                    </span>
                  </button>
                ))}
                {inventory.filter((p) => p.title.toLowerCase().includes(transactionSearch.toLowerCase())).length === 0 && (
                   <div className="p-3 text-center text-sm text-slate-500">No se encontraron productos.</div>
                )}
              </div>
            )}
          </div>

          </div>

          <div className="min-h-0 overflow-y-auto p-2.5 custom-scrollbar">
          <div className="relative mb-2">
            <div className="flex items-center border border-slate-200 rounded-xl px-3 bg-white shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
              <Search size={16} className="text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar por nombre o escanear codigo de barras..."
                className="w-full p-2 bg-transparent text-xs outline-none text-slate-700"
                value={transactionSearch}
                onChange={(e) => setTransactionSearch(e.target.value)}
              />
              <Barcode size={18} className="text-slate-300" />
            </div>

            {transactionSearch && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 shadow-xl rounded-xl max-h-48 overflow-y-auto z-20 p-1 animate-in fade-in slide-in-from-top-2">
                {inventory.filter((p) => p.title.toLowerCase().includes(transactionSearch.toLowerCase())).map((p) => (
                  <button key={p.id} onClick={() => handleAddLocalItem(p)} className="w-full text-left p-2.5 hover:bg-blue-50 text-sm flex justify-between items-center rounded-lg transition-colors group">
                    <span className="font-medium text-slate-700 group-hover:text-blue-700 flex items-center gap-2">
                      <Package size={14} className="text-slate-400" /> {p.title}
                    </span>
                    <span className="font-bold text-slate-800">
                      <FancyPrice amount={p.price} />
                    </span>
                  </button>
                ))}
                {inventory.filter((p) => p.title.toLowerCase().includes(transactionSearch.toLowerCase())).length === 0 && (
                   <div className="p-3 text-center text-sm text-slate-500">No se encontraron productos.</div>
                )}
              </div>
            )}
          </div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Productos</p>
          <div className="space-y-1.5">
            {transaction.items.map((item, index) => {
              const isWeight = item.product_type === 'weight' || item.isWeight || (item.qty > 20 && item.price < 50);
              const rowTotal = getLineSubtotal(item);

              return (
                <div key={`item-${index}`} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm transition-all hover:border-blue-300">
                  
                  {/* Nombre */}
                  <div className="flex-1 min-w-[120px]">
                    <p className="text-xs font-bold text-slate-800 truncate" title={item.title}>{item.title}</p>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{isWeight ? 'Venta por Peso' : 'Unidades'}</span>
                  </div>

                  {/* Precio Unitario */}
                  <div className="w-[90px]">
                    <label className="text-[9px] font-bold text-slate-400 uppercase mb-0.5 block">Precio Unit.</label>
                    <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-black text-slate-700">
                      <FancyPrice amount={isWeight && Number(item.price || 0) < 100 ? Number(item.price || 0) * 1000 : Number(item.price || 0)} />
                      {isWeight && <span className="ml-0.5 text-[9px] text-slate-400">/kg</span>}
                    </div>
                  </div>

                  {/* Cantidad */}
                  <div className="w-[90px]">
                    <label className="text-[9px] font-bold text-slate-400 uppercase mb-0.5 block">Cantidad</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        min="1"
                        step={isWeight ? "10" : "1"}
                        className="w-full pr-6 pl-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" 
                        value={item.qty} 
                        onChange={(e) => handleUpdateItem(index, 'qty', e.target.value)} 
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">{isWeight ? 'g' : 'u'}</span>
                    </div>
                  </div>

                  {/* Total Fila */}
                  <div className="w-[70px] text-right">
                    <label className="text-[9px] font-bold text-slate-400 uppercase mb-0.5 block">Total</label>
                    {/* ♻️ FIX: FancyPrice al subtotal */}
                    <p className="text-sm font-black text-slate-800">
                      <FancyPrice amount={rowTotal} />
                    </p>
                  </div>

                  {/* Eliminar */}
                  <button type="button" onClick={() => handleRemoveLocalItem(index)} className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors mt-3">
                    <Trash2 size={14} />
                  </button>

                </div>
              );
            })}
            {transaction.items.length === 0 && (
               <div className="p-6 text-center border-2 border-dashed border-slate-300 rounded-xl bg-slate-50">
                 <p className="text-sm font-bold text-slate-500">La venta está vacía</p>
               </div>
            )}
          </div>
          </div>
        </div>

        {/* FOOTER (Opciones de Pago y Guardado) */}
        <form onSubmit={(event) => {
          event.preventDefault();
          void runAction(`edit-transaction:${transaction.id}`, async () => {
            await onSave(event);
          });
        }} className="p-2.5 border-t border-slate-200 bg-white rounded-b-[14px]">
          <div className="hidden grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Método de Pago</label>
              <select className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" value={transaction.payment} onChange={(e) => handlePaymentChangeLocal(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Total a Cobrar</label>
              <div className="w-full px-3 py-1.5 border border-green-200 rounded-lg bg-green-50 text-green-700 text-lg font-black text-right">
                {/* ♻️ FIX: FancyPrice al Total final */}
                <FancyPrice amount={transaction.total} />
              </div>
            </div>
          </div>
          
          {transaction.payment === '__legacy_credit__' && (
            <div className="flex items-center justify-between bg-blue-50 p-3 rounded-xl border border-blue-100 mb-4">
              <span className="text-xs font-bold text-blue-800 flex items-center gap-1"><AlertTriangle size={14}/> 10% recargo aplicado</span>
              <select className="text-xs p-1.5 font-bold rounded-lg border border-blue-200 bg-white text-blue-800 outline-none focus:ring-2 focus:ring-blue-500" value={transaction.installments || 1} onChange={(e) => setEditingTransaction({ ...transaction, installments: Number(e.target.value) })}>
                <option value={1}>1 pago</option><option value={3}>3 cuotas</option><option value={6}>6 cuotas</option><option value={12}>12 cuotas</option>
              </select>
            </div>
          )}

          {transaction.payment === '__legacy_cash__' && (
            <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/80 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                  <AlertTriangle size={14} /> Cobro en efectivo
                </span>
                <button
                  type="button"
                  onClick={() => setEditingTransaction({
                    ...transaction,
                    cashReceived: Number(transaction.total || 0),
                    cashChange: 0,
                  })}
                  className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  Pago completo
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide block mb-1">Monto recibido</label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-500 font-bold text-xs">$</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="w-full rounded-lg border border-emerald-200 bg-white pl-5 pr-2 py-2 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                      value={transaction.cashReceived ?? ''}
                      onChange={(e) => {
                        const rawValue = e.target.value;
                        const nextCashReceived = rawValue === '' ? '' : Number(rawValue);
                        setEditingTransaction({
                          ...transaction,
                          cashReceived: nextCashReceived,
                          cashChange: rawValue === ''
                            ? 0
                            : Math.max(0, Number(nextCashReceived || 0) - Number(transaction.total || 0)),
                        });
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Producto</p>
                  <p className="mt-1 text-sm font-black text-slate-800"><FancyPrice amount={transaction.total} /></p>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Devolución</p>
                  <p className="mt-1 text-sm font-black text-slate-800"><FancyPrice amount={cashChangeAmount} /></p>
                </div>
              </div>

              {cashMissingAmount > 0 && (
                <p className="mt-3 text-[11px] font-bold text-amber-700">
                  Faltan <FancyPrice amount={cashMissingAmount} /> para completar el pago.
                </p>
              )}
            </div>
          )}

          <div className="mb-2">
            <label className="text-[10px] font-bold text-amber-600 uppercase tracking-wide block mb-1 flex items-center gap-1"><FileText size={12} /> Motivo / Nota de la modificación (Opcional)</label>
            <textarea className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-amber-50 focus:ring-2 focus:ring-amber-500 outline-none text-amber-900" rows="2" placeholder="Ej: Me equivoqué en el precio, el cliente sumó un producto..." value={editReason} onChange={(e) => setEditReason(e.target.value)}></textarea>
          </div>

          <AsyncActionButton type="submit" pending={isPending(`edit-transaction:${transaction.id}`)} disabled={transaction.items.length === 0 || cashMissingAmount > 0 || isPending(`edit-transaction:${transaction.id}`)} loadingLabel="Guardando..." className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md disabled:bg-slate-300 disabled:cursor-not-allowed">
            Guardar y Aplicar Cambios
          </AsyncActionButton>
        </form>
      </div>
    </div>
  );
};

export const RefundModal = ({ transaction, onClose, refundReason, setRefundReason, onConfirm }) => {
  const { isPending, runAction } = usePendingAction();
  if (!transaction) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
          <h3 className="font-bold text-red-800 flex items-center gap-2"><AlertTriangle size={18} /> {transaction.status === 'voided' ? 'Eliminar Registro' : 'Anular Venta'}</h3>
          <button onClick={onClose}><X size={18} className="text-red-400 hover:text-red-600" /></button>
        </div>
        <form onSubmit={(event) => {
          event.preventDefault();
          void runAction(`refund-transaction:${transaction.id}`, async () => {
            await onConfirm(event);
          });
        }} className="p-5">
          <p className="text-sm text-slate-600 mb-4">{transaction.status === 'voided' ? 'Esta acción borrará definitivamente el registro del historial. No se puede deshacer.' : `Se marcará la venta #${transaction.id} como anulada y se devolverá el stock al inventario.`}</p>
          <div className="mb-4">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Motivo (Opcional)</label>
            <textarea className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none" rows="3" placeholder="Ej: Cliente devolvió los productos..." value={refundReason} onChange={(e) => setRefundReason(e.target.value)} autoFocus></textarea>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <AsyncActionButton type="submit" pending={isPending(`refund-transaction:${transaction.id}`)} loadingLabel={transaction.status === 'voided' ? 'Borrando...' : 'Anulando...'} className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-60 disabled:cursor-wait">{transaction.status === 'voided' ? 'Borrar Definitivamente' : 'Confirmar Anulación'}</AsyncActionButton>
          </div>
        </form>
      </div>
    </div>
  );
};
