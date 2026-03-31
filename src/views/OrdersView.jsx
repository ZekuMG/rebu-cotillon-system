import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, CheckCircle2, ClipboardList, CreditCard, FileText, Package, Plus, ReceiptText, Search, Trash2, Wallet, X } from 'lucide-react';
import Swal from 'sweetalert2';
import BudgetBuilderModal from '../components/BudgetBuilderModal';
import { FancyPrice } from '../components/FancyPrice';
import { calculateBudgetLineSubtotal, deriveOrderStatus, formatBudgetItemQuantity, hydrateBudgetSnapshot } from '../utils/budgetHelpers';
import { formatCurrency, formatDateAR } from '../utils/helpers';
import { hasPermission } from '../utils/userPermissions';
import useIncrementalFeed from '../hooks/useIncrementalFeed';

const RECORD_TYPE_LABELS = { budget: 'Presupuesto', order: 'Pedido' };
const STATUS_STYLES = {
  Presupuesto: 'bg-slate-100 text-slate-600 border-slate-200',
  Creado: 'bg-sky-50 text-sky-700 border-sky-200',
  Pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
  'Se\u00f1ado': 'bg-sky-50 text-sky-700 border-sky-200',
  Pagado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelado: 'bg-rose-50 text-rose-700 border-rose-200',
  Retirado: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
};
const PRIMARY_BUTTON_CLASS = 'inline-flex items-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40';
const NEUTRAL_BUTTON_CLASS = 'inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40';
const DANGER_BUTTON_CLASS = 'inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40';
const SUCCESS_BUTTON_CLASS = 'inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40';

const normalizeLegacyOrderStatus = (value = '') => String(value || '').replace('Se?ado', 'Se\u00f1ado').replace('Se?ado', 'Se\u00f1ado');
const formatPickupDate = (pickupDate) => (!pickupDate ? 'Sin fecha' : formatDateAR(`${pickupDate}T12:00:00`));
const getSharedRecordId = (recordOrType, id, budgetId) => {
  if (recordOrType && typeof recordOrType === 'object') {
    return recordOrType.type === 'order' && recordOrType.budgetId ? recordOrType.budgetId : recordOrType.id;
  }
  return recordOrType === 'order' && budgetId ? budgetId : id;
};
const formatRecordCode = (recordOrType, id, budgetId) =>
  `ID-${String(getSharedRecordId(recordOrType, id, budgetId) || '').slice(0, 8).toUpperCase() || 'SINID'}`;

const buildRecordView = (record, membersMap, type) => {
  const member = record.memberId ? membersMap.get(String(record.memberId)) : null;
  return {
    ...record,
    type,
    customerKind: member ? 'Socio' : 'No socio',
    customerName: member?.name || record.customerName || 'Cliente sin nombre',
    customerPhone: member?.phone || record.customerPhone || 'Sin teléfono',
    status: type === 'budget' ? 'Presupuesto' : deriveOrderStatus({ ...record, currentStatus: normalizeLegacyOrderStatus(record.status) }),
    items: hydrateBudgetSnapshot(record.itemsSnapshot || []),
  };
};

function MiniModal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function RecordCard({ record, isActive, onSelect }) {
  const statusLabel = record.type === 'budget' ? 'Creado' : record.status;
  const itemCount = record.items?.length || record.itemsSnapshot?.length || 0;
  return (
    <button type="button" onClick={onSelect} className={`w-full rounded-[14px] border px-2.5 py-1.5 text-left transition ${isActive ? 'border-sky-200 bg-white shadow-[0_3px_12px_rgba(148,163,184,0.1)] ring-1 ring-sky-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">{RECORD_TYPE_LABELS[record.type]}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] ${STATUS_STYLES[statusLabel] || STATUS_STYLES.Pendiente}`}>{statusLabel}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-black text-slate-500">{formatRecordCode(record)}</span>
          </div>
          <p className="mt-0.5 truncate text-[12px] font-black leading-tight text-slate-800">{record.customerName}</p>
          <p className="text-[11px] font-semibold text-slate-500">{record.customerKind} · {record.customerPhone}</p>
          {record.eventLabel && <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">{record.eventLabel}</p>}
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold text-slate-400">{formatDateAR(record.createdAt)}</p>
          <p className="mt-1 text-[13px] font-black text-slate-800"><FancyPrice amount={record.totalAmount} /></p>
        </div>
      </div>
      <div className="mt-1 grid gap-x-2 gap-y-0.5 text-[10px] font-semibold text-slate-500 sm:grid-cols-3">
        <span>Total: {formatCurrency(record.totalAmount)}</span>
        {record.type === 'budget' ? <><span>Items: {itemCount}</span><span className="truncate">Doc: {record.documentTitle || 'PRESUPUESTO'}</span></> : <><span>Seña: {formatCurrency(record.depositAmount || 0)}</span><span>Restante: {formatCurrency(record.remainingAmount || 0)}</span></>}
      </div>
    </button>
  );
}

export default function OrdersView({ budgets, orders, members, inventory, categories, offers, currentUser = null, isLoading = false, emptyStateMessage = '', onCreateBudget, onUpdateBudget, onUpdateOrder, onDeleteBudget, onDeleteOrder, onConvertBudgetToOrder, onRegisterOrderPayment, onCancelOrder, onMarkOrderRetired, onPrintRecord }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedKey, setSelectedKey] = useState(null);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [convertTarget, setConvertTarget] = useState(null);
  const [pickupDate, setPickupDate] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const canCreateBudget = hasPermission(currentUser, 'orders.createBudget');
  const canEditBudget = hasPermission(currentUser, 'orders.editBudget');
  const canDeleteBudget = hasPermission(currentUser, 'orders.deleteBudget');
  const canCreateOrder = hasPermission(currentUser, 'orders.createOrder');
  const canEditOrder = hasPermission(currentUser, 'orders.editOrder');
  const canCancelOrder = hasPermission(currentUser, 'orders.cancelOrder');
  const canDeleteOrder = hasPermission(currentUser, 'orders.deleteOrder');
  const canMarkRetired = hasPermission(currentUser, 'orders.markRetired');
  const canRegisterOrderPayment = hasPermission(currentUser, 'orders.registerPayment');

  const membersMap = useMemo(() => new Map((members || []).map((member) => [String(member.id), member])), [members]);
  const inventoryById = useMemo(
    () => new Map((inventory || []).map((product) => [String(product.id), product])),
    [inventory]
  );
  const inventoryByTitle = useMemo(
    () =>
      new Map(
        (inventory || [])
          .filter((product) => String(product.title || '').trim() !== '')
          .map((product) => [String(product.title || '').trim().toLowerCase(), product])
      ),
    [inventory]
  );
  const allRecords = useMemo(() => {
    const activeOrders = (orders || []).filter((record) => record.isActive !== false);
    const linkedBudgetIds = new Set(
      activeOrders
        .map((record) => record.budgetId)
        .filter((budgetId) => budgetId !== undefined && budgetId !== null)
        .map((budgetId) => String(budgetId))
    );
    const budgetRecords = (budgets || [])
      .filter((record) => record.isActive !== false)
      .filter((record) => !linkedBudgetIds.has(String(record.id)))
      .map((record) => buildRecordView(record, membersMap, 'budget'));
    const orderRecords = activeOrders.map((record) => buildRecordView(record, membersMap, 'order'));
    return [...budgetRecords, ...orderRecords].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [budgets, orders, membersMap]);
  const filteredRecords = useMemo(() => {
    const searchWords = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return allRecords.filter((record) => {
      if (typeFilter !== 'all' && record.type !== typeFilter) return false;
      if (statusFilter !== 'all' && record.status !== statusFilter) return false;
      if (searchWords.length === 0) return true;
      const haystack = [record.customerName, record.customerPhone, record.documentTitle, record.eventLabel, record.status, record.customerKind, formatRecordCode(record)].filter(Boolean).join(' ').toLowerCase();
      return searchWords.every((word) => haystack.includes(word));
    });
  }, [allRecords, search, statusFilter, typeFilter]);
  const visibleRecordsFeed = useIncrementalFeed(filteredRecords, {
    resetKey: `${search}|${typeFilter}|${statusFilter}|${filteredRecords.length}`,
  });

  useEffect(() => {
    if (filteredRecords.length === 0) return void setSelectedKey(null);
    const hasSelected = filteredRecords.some((record) => `${record.type}-${record.id}` === selectedKey);
    if (!hasSelected) setSelectedKey(`${filteredRecords[0].type}-${filteredRecords[0].id}`);
  }, [filteredRecords, selectedKey]);

  const selectedRecord = filteredRecords.find((record) => `${record.type}-${record.id}` === selectedKey) || null;
  const hasSourceRecords = (budgets?.length || 0) > 0 || (orders?.length || 0) > 0;

  if (isLoading && !hasSourceRecords) {
    return (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Cargando pedidos</p>
          <p className="mt-2 text-sm font-medium text-slate-500">Estamos trayendo presupuestos y pedidos sin frenar el resto de la app.</p>
        </div>
      </div>
    );
  }

  if (emptyStateMessage && !hasSourceRecords) {
    return (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="max-w-md text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Pedidos no disponibles</p>
          <p className="mt-2 text-sm font-medium text-slate-500">{emptyStateMessage}</p>
        </div>
      </div>
    );
  }
  const linkedOrderForBudget = selectedRecord?.type === 'budget' ? orders.find((order) => String(order.budgetId) === String(selectedRecord.id) && order.isActive !== false) : null;
  const resolveRecordItemProduct = (item) => {
    if (item?.productId !== null && item?.productId !== undefined) {
      const productFromId = inventoryById.get(String(item.productId));
      if (productFromId) return productFromId;
    }

    const normalizedTitle = String(item?.title || '').trim().toLowerCase();
    if (!normalizedTitle) return null;
    return inventoryByTitle.get(normalizedTitle) || null;
  };

  const handleSaveBudget = async (payload) => {
    setIsSavingBudget(true);
    try {
      if (editingBudget?.type === 'order') await onUpdateOrder(editingBudget.id, payload);
      else if (editingBudget) await onUpdateBudget(editingBudget.id, payload);
      else await onCreateBudget(payload);
      setIsBudgetModalOpen(false);
      setEditingBudget(null);
    } finally {
      setIsSavingBudget(false);
    }
  };

  const handleConvertBudget = async () => {
    if (!convertTarget) return;
    const normalizedDeposit = Math.max(Number(depositAmount || 0), 0);
    const missingFields = [];
    if (!pickupDate) missingFields.push('fecha de retiro');
    if (normalizedDeposit <= 0) missingFields.push('seña inicial');
    if (missingFields.length > 0) {
      const result = await Swal.fire({
        title: 'Datos opcionales sin completar',
        text: missingFields.length === 2 ? 'No seleccionaste fecha de retiro ni seña inicial. ¿Continuar sin agregar?' : `No seleccionaste ${missingFields[0]}. ¿Continuar sin agregar?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, continuar',
        cancelButtonText: 'No',
        confirmButtonColor: '#0ea5e9',
        cancelButtonColor: '#94a3b8',
      });
      if (!result.isConfirmed) return;
    }
    setIsConverting(true);
    try {
      const newOrder = await onConvertBudgetToOrder(convertTarget, { pickupDate: pickupDate || null, depositAmount: normalizedDeposit });
      if (newOrder?.id) {
        setSelectedKey(`order-${newOrder.id}`);
      }
      setConvertTarget(null);
      setPickupDate('');
      setDepositAmount('');
    } finally {
      setIsConverting(false);
    }
  };

  const handleSavePayment = async () => {
    if (!paymentTarget || Number(paymentAmount) <= 0) return void Swal.fire('Monto inválido', 'Ingresá un pago mayor a cero para continuar.', 'warning');
    setIsSavingPayment(true);
    try {
      await onRegisterOrderPayment(paymentTarget, Number(paymentAmount));
      setPaymentTarget(null);
      setPaymentAmount('');
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleRetireOrder = async (orderRecord) => {
    if (Number(orderRecord.remainingAmount || 0) > 0) return void Swal.fire('Saldo pendiente', 'El pedido debe estar totalmente abonado para retirarse.', 'warning');
    const result = await Swal.fire({ title: 'Marcar como retirado', text: 'El pedido quedará cerrado como entregado.', icon: 'question', showCancelButton: true, confirmButtonText: 'Sí, marcar', cancelButtonText: 'Cancelar', confirmButtonColor: '#059669', cancelButtonColor: '#94a3b8' });
    if (result.isConfirmed) await onMarkOrderRetired(orderRecord);
  };

  const handleCancelSelectedOrder = async (orderRecord) => {
    const currentDeposit = Number(orderRecord.depositAmount || 0);
    const currentPaid = Number(orderRecord.paidTotal || 0);
    const hasDeposit = currentDeposit > 0 || currentPaid > 0;
    const result = await Swal.fire({
      title: 'Cancelar pedido',
      text: hasDeposit ? 'Elegí si querés conservar la seña o devolverla.' : 'El pedido pasará a estado cancelado.',
      icon: 'warning',
      showCancelButton: true,
      showDenyButton: hasDeposit,
      confirmButtonText: hasDeposit ? 'Conservar seña' : 'Cancelar pedido',
      denyButtonText: 'Devolver seña',
      cancelButtonText: 'Volver',
      confirmButtonColor: '#dc2626',
      denyButtonColor: '#0f766e',
      cancelButtonColor: '#94a3b8',
    });
    if (!result.isConfirmed && !result.isDenied) return;
    await onCancelOrder(orderRecord, { keepDeposit: result.isConfirmed });
  };

  const handleDeleteSelectedBudget = async (budgetRecord) => {
    const linkedOrder = orders.find((order) => String(order.budgetId) === String(budgetRecord.id) && order.isActive !== false) || null;
    const result = await Swal.fire({
      title: 'Eliminar presupuesto',
      text: linkedOrder ? 'Este presupuesto ya tiene un pedido vinculado. Se eliminará solo el presupuesto y el pedido se mantendrá.' : 'El presupuesto dejará de aparecer en Pedidos.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Volver',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#94a3b8',
    });
    if (result.isConfirmed) await onDeleteBudget(budgetRecord);
  };

  const handleDeleteSelectedOrder = async (orderRecord) => {
    const result = await Swal.fire({ title: 'Eliminar pedido', text: 'El pedido dejará de aparecer en Pedidos.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Volver', confirmButtonColor: '#dc2626', cancelButtonColor: '#94a3b8' });
    if (result.isConfirmed) await onDeleteOrder(orderRecord);
  };

  return (
    <>
      <div className="grid h-full min-h-0 gap-0 xl:grid-cols-[356px_minmax(0,1fr)]">
        <div className="min-h-0 border-b border-slate-200 bg-white xl:border-b-0 xl:border-r">
          <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-slate-200 px-2.5 py-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Pedidos y presupuestos</p><p className="text-xs font-medium text-slate-400">Seguimiento operativo de seña, saldo y retiro.</p></div>
                  {canCreateBudget && <button
                    type="button"
                    onClick={() => { setEditingBudget(null); setIsBudgetModalOpen(true); }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-sky-700 transition hover:bg-sky-100"
                >
                  <Plus size={11} />
                  Crear presupuesto
                </button>}
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-[16px] border border-slate-200 bg-white px-3 py-2 transition focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <Search size={14} />
                </div>
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar pedido, cliente o teléfono..." className="w-full bg-transparent text-[14px] font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400" />
              </div>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 outline-none"><option value="all">Todos los tipos</option><option value="budget">Presupuestos</option><option value="order">Pedidos</option></select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 outline-none"><option value="all">Todos los estados</option><option value="Presupuesto">Presupuesto</option><option value="Pendiente">Pendiente</option><option value="Señado">Señado</option><option value="Pagado">Pagado</option><option value="Cancelado">Cancelado</option><option value="Retirado">Retirado</option></select>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-2 py-1.5 scrollbar-hide" onScroll={visibleRecordsFeed.handleScroll}>
              <div className="space-y-1">
                {visibleRecordsFeed.visibleItems.map((record) => <RecordCard key={`${record.type}-${record.id}`} record={record} isActive={`${record.type}-${record.id}` === selectedKey} onSelect={() => setSelectedKey(`${record.type}-${record.id}`)} />)}
                {filteredRecords.length === 0 && <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center"><p className="text-sm font-bold text-slate-500">No hay registros que coincidan con la búsqueda.</p></div>}
              </div>
            </div>
            {filteredRecords.length > 0 && (
              <div className="border-t border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500">
                Mostrando <span className="font-black text-slate-700">{visibleRecordsFeed.visibleCount}</span> de <span className="font-black text-slate-700">{filteredRecords.length}</span> registros
              </div>
            )}
          </div>
        </div>
        <div className="min-h-0 bg-slate-50">
          {selectedRecord ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-slate-200 bg-white px-2.5 py-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[14px] font-black text-slate-800">{selectedRecord.customerName}</h2>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${STATUS_STYLES[selectedRecord.type === 'budget' ? 'Creado' : selectedRecord.status] || STATUS_STYLES.Pendiente}`}>{selectedRecord.type === 'budget' ? 'Creado' : selectedRecord.status}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{RECORD_TYPE_LABELS[selectedRecord.type]}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] font-black text-slate-500">{formatRecordCode(selectedRecord)}</span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500">{selectedRecord.customerKind} · {selectedRecord.customerPhone}{selectedRecord.eventLabel ? ` · ${selectedRecord.eventLabel}` : ''}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button type="button" onClick={() => onPrintRecord(selectedRecord)} className={NEUTRAL_BUTTON_CLASS}><FileText size={12} />Generar PDF</button>
                    {selectedRecord.type === 'budget' && <>
                      {canEditBudget && <button type="button" onClick={() => { setEditingBudget(selectedRecord); setIsBudgetModalOpen(true); }} className={NEUTRAL_BUTTON_CLASS}><FileText size={12} />Editar</button>}
                      {canCreateOrder && <button type="button" onClick={() => { setConvertTarget(selectedRecord); setPickupDate(''); setDepositAmount(''); }} disabled={Boolean(linkedOrderForBudget)} className={PRIMARY_BUTTON_CLASS}><ReceiptText size={12} />{linkedOrderForBudget ? 'Pedido ya creado' : 'Convertir a pedido'}</button>}
                      {canDeleteBudget && <button type="button" onClick={() => handleDeleteSelectedBudget(selectedRecord)} className={DANGER_BUTTON_CLASS}><Trash2 size={12} />Eliminar</button>}
                    </>}
                    {selectedRecord.type === 'order' && <>
                      {!['Pagado', 'Retirado', 'Cancelado'].includes(selectedRecord.status) && canEditOrder && <button type="button" onClick={() => { setEditingBudget(selectedRecord); setIsBudgetModalOpen(true); }} className={NEUTRAL_BUTTON_CLASS}><FileText size={12} />Editar</button>}
                      {!['Pagado', 'Retirado', 'Cancelado'].includes(selectedRecord.status) && canRegisterOrderPayment && <button type="button" onClick={() => { setPaymentTarget(selectedRecord); setPaymentAmount(''); }} className={PRIMARY_BUTTON_CLASS}><Wallet size={12} />Registrar pago</button>}
                      {!['Retirado', 'Cancelado'].includes(selectedRecord.status) && canCancelOrder && <button type="button" onClick={() => handleCancelSelectedOrder(selectedRecord)} className={DANGER_BUTTON_CLASS}><X size={12} />Cancelar pedido</button>}
                      {!['Retirado', 'Cancelado'].includes(selectedRecord.status) && canMarkRetired && <button type="button" onClick={() => handleRetireOrder(selectedRecord)} className={SUCCESS_BUTTON_CLASS}><CheckCircle2 size={12} />Marcar retirado</button>}
                      {canDeleteOrder && <button type="button" onClick={() => handleDeleteSelectedOrder(selectedRecord)} className={DANGER_BUTTON_CLASS}><Trash2 size={12} />Eliminar pedido</button>}
                    </>}
                  </div>
                </div>
              </div>
              <div className="grid min-h-0 flex-1 gap-1.5 p-2 lg:grid-cols-[0.56fr_1.44fr]">
                <div className="min-h-0 overflow-y-auto rounded-[18px] border border-slate-200 bg-white p-2 scrollbar-hide">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Resumen operativo</p>
                  <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    <div className="rounded-[13px] border border-slate-200 bg-slate-50 p-1.5"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">ID</p><p className="mt-0.5 font-mono text-[12px] font-black text-slate-800">{formatRecordCode(selectedRecord)}</p></div>
                    <div className="rounded-[13px] border border-slate-200 bg-slate-50 p-1.5"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{selectedRecord.type === 'order' ? 'Documento origen' : 'Documento'}</p><p className="mt-0.5 text-[12px] font-black text-slate-800">{selectedRecord.documentTitle || 'PRESUPUESTO'}</p></div>
                    <div className="rounded-[13px] border border-slate-200 bg-slate-50 p-1.5"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Creado</p><p className="mt-0.5 text-[12px] font-black text-slate-800">{formatDateAR(selectedRecord.createdAt)}</p></div>
                    <div className="rounded-[13px] border border-slate-200 bg-slate-50 p-1.5"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Retiro</p><p className="mt-0.5 text-[12px] font-black text-slate-800">{formatPickupDate(selectedRecord.pickupDate)}</p></div>
                    <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 p-2"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-500">Sena</p><p className="mt-0.5 text-[17px] font-black text-emerald-700"><FancyPrice amount={selectedRecord.depositAmount || 0} /></p></div>
                    <div className="rounded-[15px] border border-sky-200 bg-sky-50 p-2"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-sky-500">Abonado</p><p className="mt-0.5 text-[15px] font-black text-sky-700"><FancyPrice amount={selectedRecord.paidTotal || 0} /></p></div>
                    <div className="rounded-[15px] border border-amber-200 bg-amber-50 p-2"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-500">Restante</p><p className="mt-0.5 text-[15px] font-black text-amber-700"><FancyPrice amount={selectedRecord.remainingAmount || 0} /></p></div>
                    <div className="rounded-[15px] border border-slate-200 bg-slate-50 p-2"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Total</p><p className="mt-0.5 text-[15px] font-black text-slate-800"><FancyPrice amount={selectedRecord.totalAmount || 0} /></p></div>
                  </div>
                  <div className="mt-1.5 rounded-[13px] border border-slate-200 bg-slate-50 p-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Cliente</p>
                    <p className="mt-0.5 text-[13px] font-black text-slate-800">{selectedRecord.customerName}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{selectedRecord.customerPhone}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{selectedRecord.customerKind}</p>
                    {selectedRecord.customerNote && <><p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Nota</p><p className="mt-0.5 text-[12px] font-medium text-slate-600">{selectedRecord.customerNote}</p></>}
                    {linkedOrderForBudget && <><p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Pedido vinculado</p><p className="mt-0.5 font-mono text-[12px] font-semibold text-slate-600">{formatRecordCode(linkedOrderForBudget)}</p></>}
                  </div>
                </div>
                <div className="min-h-0 overflow-y-auto rounded-[18px] border border-slate-200 bg-white p-2 scrollbar-hide">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Artículos del {selectedRecord.type === 'budget' ? 'presupuesto' : 'pedido'}</p>
                  <div className="mt-1.5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {selectedRecord.items.map((item) => {
                      const subtotal = calculateBudgetLineSubtotal(item);
                      const linkedProduct = resolveRecordItemProduct(item);
                      const itemImage = linkedProduct?.image;
                      const resolvedCategory = linkedProduct?.category || item.category || 'Sin categoría';
                      const stockLabel =
                        linkedProduct?.stock !== undefined
                          ? item.product_type === 'weight'
                            ? `Disp. ${formatBudgetItemQuantity({ ...item, qty: linkedProduct.stock })}`
                            : `Disp. ${linkedProduct.stock || 0} u.`
                          : item.productId
                            ? `Stock #${item.productId}`
                            : 'Item manual';

                      return <div key={item.id} className="overflow-hidden rounded-[16px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(241,245,249,0.98)_100%)] shadow-[0_8px_20px_rgba(148,163,184,0.1)]">
                        <div className="relative aspect-[16/10] overflow-hidden border-b border-slate-200 bg-slate-100">
                          {itemImage ? (
                            <img src={itemImage} alt={item.title} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(224,231,255,0.95),rgba(226,232,240,0.98))] px-3 text-center text-slate-500">
                              <Package size={22} className="mb-1.5 text-slate-400" />
                              <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                                Sin foto
                              </span>
                            </div>
                          )}
                          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1.5 p-1.5">
                            <span className="rounded-full bg-white/92 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-slate-600 shadow-sm">
                              {resolvedCategory}
                            </span>
                            <span className="rounded-full bg-slate-900/75 px-2 py-0.5 text-[8px] font-black text-white shadow-sm backdrop-blur-sm">
                              {formatBudgetItemQuantity(item)}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1.5 p-2">
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="min-w-0 flex-1">
                              <p className="max-h-[30px] overflow-hidden text-[12px] font-black leading-tight text-slate-800">{item.title}</p>
                              <p className="mt-0.5 text-[9px] font-semibold text-slate-500">
                                {item.product_type === 'weight' ? 'Precio por kilo' : 'Precio unitario'}
                              </p>
                            </div>
                            <div className="shrink-0 rounded-[10px] border border-emerald-200 bg-emerald-50/90 px-1.5 py-1 text-right">
                              <p className="text-[8px] font-black uppercase tracking-[0.08em] text-emerald-500">Subtotal</p>
                              <p className="mt-0.5 text-[11px] font-black text-emerald-700">{formatCurrency(subtotal)}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-[9px] font-semibold text-slate-500">
                            <span className="rounded-[10px] border border-slate-200 bg-white/90 px-1.5 py-1 leading-none">
                              <span className="block text-[7px] font-black uppercase tracking-[0.08em] leading-none text-slate-400">
                                {item.product_type === 'weight' ? 'Precio/Kg' : 'Precio/u'}
                              </span>
                              <span className="mt-0.5 block text-[10px] font-black leading-none text-slate-700">
                                {formatCurrency(item.newPrice)}
                              </span>
                            </span>
                            <span className="rounded-[10px] border border-slate-200 bg-white/90 px-1.5 py-1 leading-none">
                              <span className="block text-[7px] font-black uppercase tracking-[0.08em] leading-none text-slate-400">Origen</span>
                              <span className="mt-0.5 block truncate text-[10px] font-black leading-none text-slate-700">
                                {item.productId ? `Stock #${item.productId}` : 'Item manual'}
                              </span>
                            </span>
                          </div>
                          <div className="rounded-[10px] border border-slate-200 bg-slate-50/90 px-1.5 py-1 leading-none">
                            <p className="text-[7px] font-black uppercase tracking-[0.08em] leading-none text-slate-400">Referencia</p>
                            <p className="mt-0.5 truncate text-[10px] font-black leading-none text-slate-700">{stockLabel}</p>
                          </div>
                        </div>
                      </div>;
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center"><div className="max-w-md"><ClipboardList size={42} className="mx-auto mb-4 text-slate-300" /><p className="text-base font-black text-slate-600">Seleccioná un presupuesto o pedido</p><p className="mt-2 text-sm font-medium text-slate-400">Acá vas a ver artículos, cantidades, precios, seña, saldo pendiente y fecha de retiro.</p></div></div>
          )}
        </div>
      </div>

      <BudgetBuilderModal isOpen={isBudgetModalOpen} onClose={() => { setIsBudgetModalOpen(false); setEditingBudget(null); }} inventory={inventory} categories={categories} members={members} offers={offers} initialRecord={editingBudget} onSave={handleSaveBudget} isSaving={isSavingBudget} />

      {convertTarget && <MiniModal title="Convertir a pedido" onClose={() => setConvertTarget(null)}><div className="space-y-3">
        <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"><span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400"><CalendarRange size={11} />Fecha de retiro</span><input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none" /></label>
        <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"><span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400"><CreditCard size={11} />Seña inicial</span><input type="number" min="0" step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none" /></label>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600">Total del presupuesto: <span className="font-black text-slate-800">{formatCurrency(convertTarget.totalAmount)}</span></div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setConvertTarget(null)} className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100">Cancelar</button>
          <button type="button" onClick={handleConvertBudget} disabled={isConverting} className="flex-1 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-black text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60">{isConverting ? 'Convirtiendo...' : 'Crear pedido'}</button>
        </div>
      </div></MiniModal>}

      {paymentTarget && <MiniModal title="Registrar pago" onClose={() => setPaymentTarget(null)}><div className="space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600">Restante actual: <span className="font-black text-slate-800">{formatCurrency(paymentTarget.remainingAmount)}</span></div>
        <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"><span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400"><Wallet size={11} />Monto a registrar</span><input type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none" /></label>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setPaymentTarget(null)} className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100">Cancelar</button>
          <button type="button" onClick={handleSavePayment} disabled={isSavingPayment} className="flex-1 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-black text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60">{isSavingPayment ? 'Guardando...' : 'Aplicar pago'}</button>
        </div>
      </div></MiniModal>}
    </>
  );
}

