import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Wallet,
  X,
} from 'lucide-react';
import Swal from 'sweetalert2';
import BudgetBuilderModal from '../components/BudgetBuilderModal';
import { FancyPrice } from '../components/FancyPrice';
import {
  calculateBudgetLineSubtotal,
  deriveOrderStatus,
  formatBudgetItemQuantity,
  hydrateBudgetSnapshot,
} from '../utils/budgetHelpers';
import { formatCurrency, formatDateAR } from '../utils/helpers';

const RECORD_TYPE_LABELS = {
  budget: 'Presupuesto',
  order: 'Pedido',
};

const STATUS_STYLES = {
  Presupuesto: 'bg-slate-100 text-slate-600 border-slate-200',
  Pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
  Señado: 'bg-sky-50 text-sky-700 border-sky-200',
  Pagado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelado: 'bg-rose-50 text-rose-700 border-rose-200',
  Retirado: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
};

const buildRecordView = (record, membersMap, type) => {
  const member = record.memberId ? membersMap.get(String(record.memberId)) : null;
  const customerName = member?.name || record.customerName || 'Cliente sin nombre';
  const customerPhone = member?.phone || record.customerPhone || 'Sin telefono';
  const status = type === 'budget' ? 'Presupuesto' : deriveOrderStatus(record);

  return {
    ...record,
    type,
    customerKind: member ? 'Socio' : 'No socio',
    customerName,
    customerPhone,
    status,
    items: hydrateBudgetSnapshot(record.itemsSnapshot || []),
  };
};

const formatPickupDate = (pickupDate) => {
  if (!pickupDate) return 'Sin fecha';
  return formatDateAR(`${pickupDate}T12:00:00`);
};

function MiniModal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export default function OrdersView({
  budgets,
  orders,
  members,
  inventory,
  categories,
  onCreateBudget,
  onUpdateBudget,
  onDeleteBudget,
  onConvertBudgetToOrder,
  onRegisterOrderPayment,
  onCancelOrder,
  onMarkOrderRetired,
  onPrintRecord,
}) {
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

  const membersMap = useMemo(
    () => new Map((members || []).map((member) => [String(member.id), member])),
    [members]
  );

  const allRecords = useMemo(() => {
    const budgetRecords = (budgets || []).filter((record) => record.isActive !== false).map((record) =>
      buildRecordView(record, membersMap, 'budget')
    );
    const orderRecords = (orders || []).filter((record) => record.isActive !== false).map((record) =>
      buildRecordView(record, membersMap, 'order')
    );
    return [...budgetRecords, ...orderRecords].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }, [budgets, orders, membersMap]);

  const filteredRecords = useMemo(() => {
    const searchWords = search.toLowerCase().trim().split(/\s+/).filter(Boolean);

    return allRecords.filter((record) => {
      if (typeFilter !== 'all' && record.type !== typeFilter) return false;
      if (statusFilter !== 'all' && record.status !== statusFilter) return false;

      if (searchWords.length === 0) return true;

      const haystack = [
        record.customerName,
        record.customerPhone,
        record.documentTitle,
        record.eventLabel,
        record.status,
        record.customerKind,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchWords.every((word) => haystack.includes(word));
    });
  }, [allRecords, search, statusFilter, typeFilter]);

  useEffect(() => {
    if (filteredRecords.length === 0) {
      setSelectedKey(null);
      return;
    }

    const hasSelected = filteredRecords.some((record) => `${record.type}-${record.id}` === selectedKey);
    if (!hasSelected) {
      setSelectedKey(`${filteredRecords[0].type}-${filteredRecords[0].id}`);
    }
  }, [filteredRecords, selectedKey]);

  const selectedRecord =
    filteredRecords.find((record) => `${record.type}-${record.id}` === selectedKey) || null;
  const linkedOrderForBudget =
    selectedRecord?.type === 'budget'
      ? orders.find(
          (order) => String(order.budgetId) === String(selectedRecord.id) && order.isActive !== false
        )
      : null;

  const handleOpenCreateBudget = () => {
    setEditingBudget(null);
    setIsBudgetModalOpen(true);
  };

  const handleOpenEditBudget = (budgetRecord) => {
    setEditingBudget(budgetRecord);
    setIsBudgetModalOpen(true);
  };

  const handleSaveBudget = async (payload) => {
    setIsSavingBudget(true);
    try {
      if (editingBudget) {
        await onUpdateBudget(editingBudget.id, payload);
      } else {
        await onCreateBudget(payload);
      }
      setIsBudgetModalOpen(false);
      setEditingBudget(null);
    } finally {
      setIsSavingBudget(false);
    }
  };

  const openConvertModal = (budgetRecord) => {
    setConvertTarget(budgetRecord);
    setPickupDate('');
    setDepositAmount('');
  };

  const handleConvertBudget = async () => {
    if (!convertTarget || !pickupDate || Number(depositAmount) <= 0) {
      Swal.fire('Datos incompletos', 'Indicá una fecha de retiro y una seña mayor a cero.', 'warning');
      return;
    }

    setIsConverting(true);
    try {
      await onConvertBudgetToOrder(convertTarget, {
        pickupDate,
        depositAmount: Number(depositAmount),
      });
      setConvertTarget(null);
      setPickupDate('');
      setDepositAmount('');
    } finally {
      setIsConverting(false);
    }
  };

  const openPaymentModal = (orderRecord) => {
    setPaymentTarget(orderRecord);
    setPaymentAmount('');
  };

  const handleSavePayment = async () => {
    if (!paymentTarget || Number(paymentAmount) <= 0) {
      Swal.fire('Monto inválido', 'Ingresá un pago mayor a cero para continuar.', 'warning');
      return;
    }
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
    if (Number(orderRecord.remainingAmount || 0) > 0) {
      Swal.fire('Saldo pendiente', 'El pedido debe estar totalmente abonado para retirarse.', 'warning');
      return;
    }

    const result = await Swal.fire({
      title: 'Marcar como retirado',
      text: 'El pedido quedará cerrado como entregado.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, marcar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#111827',
      cancelButtonColor: '#94a3b8',
    });

    if (!result.isConfirmed) return;
    await onMarkOrderRetired(orderRecord);
  };

  const handleCancelSelectedOrder = async (orderRecord) => {
    const currentDeposit = Number(orderRecord.depositAmount || 0);
    const currentPaid = Number(orderRecord.paidTotal || 0);
    const hasDeposit = currentDeposit > 0 || currentPaid > 0;

    const result = await Swal.fire({
      title: 'Cancelar pedido',
      text: hasDeposit
        ? 'ElegÃ­ si querÃ©s conservar la seÃ±a o devolverla.'
        : 'El pedido pasarÃ¡ a estado cancelado.',
      icon: 'warning',
      showCancelButton: true,
      showDenyButton: hasDeposit,
      confirmButtonText: hasDeposit ? 'Conservar seÃ±a' : 'Cancelar pedido',
      denyButtonText: 'Devolver seÃ±a',
      cancelButtonText: 'Volver',
      confirmButtonColor: '#b91c1c',
      denyButtonColor: '#0f766e',
      cancelButtonColor: '#94a3b8',
    });

    if (result.isDismissed) return;

    await onCancelOrder(orderRecord, {
      keepDeposit: hasDeposit ? result.isConfirmed : false,
    });
  };

  const handleDeleteSelectedBudget = async (budgetRecord) => {
    const linkedOrder =
      orders.find((order) => String(order.budgetId) === String(budgetRecord.id) && order.isActive !== false) || null;

    const result = await Swal.fire({
      title: 'Eliminar presupuesto',
      text: linkedOrder
        ? 'Este presupuesto ya tiene un pedido vinculado. Se eliminará solo el presupuesto y el pedido se mantendrá.'
        : 'El presupuesto dejará de aparecer en Pedidos.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Volver',
      confirmButtonColor: '#b91c1c',
      cancelButtonColor: '#94a3b8',
    });

    if (!result.isConfirmed) return;
    await onDeleteBudget(budgetRecord);
  };

  return (
    <>
      <div className="grid h-full min-h-0 gap-0 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="min-h-0 border-b border-slate-200 bg-white xl:border-b-0 xl:border-r">
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Pedidos y presupuestos
                  </p>
                  <p className="text-xs font-medium text-slate-400">
                    Seguimiento operativo de seña, saldo y retiro.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenCreateBudget}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-slate-800"
                >
                  <Plus size={12} />
                  Crear presupuesto
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Search size={14} className="text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar pedido, cliente o telefono..."
                  className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
                >
                  <option value="all">Todos los tipos</option>
                  <option value="budget">Presupuestos</option>
                  <option value="order">Pedidos</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
                >
                  <option value="all">Todos los estados</option>
                  <option value="Presupuesto">Presupuesto</option>
                  <option value="Pendiente">Pendiente</option>
                  <option value="Señado">Señado</option>
                  <option value="Pagado">Pagado</option>
                  <option value="Cancelado">Cancelado</option>
                  <option value="Retirado">Retirado</option>
                </select>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-hide">
              <div className="space-y-2">
                {filteredRecords.map((record) => {
                  const key = `${record.type}-${record.id}`;
                  const isActive = key === selectedKey;
                  const isBudget = record.type === 'budget';
                  const itemCount = record.items?.length || record.itemsSnapshot?.length || 0;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedKey(key)}
                      className={`w-full rounded-[24px] border px-3 py-3 text-left transition ${
                        isActive
                          ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {isBudget ? (
                        <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-indigo-200 bg-white/80 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-700">
                                Presupuesto
                              </span>
                              <span
                                className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                                  isActive
                                    ? 'border-white/20 bg-white/10 text-white'
                                    : 'border-sky-200 bg-sky-50 text-sky-700'
                                }`}
                              >
                                Creado
                              </span>
                            </div>
                            <p className={`mt-2 truncate text-sm font-black ${isActive ? 'text-white' : 'text-slate-800'}`}>
                              {record.customerName}
                            </p>
                            <p className={`text-[11px] font-semibold ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
                              {record.customerKind} Ã‚Â· {record.customerPhone}
                            </p>
                            {record.eventLabel && (
                              <p className={`mt-2 truncate text-[11px] font-semibold ${isActive ? 'text-white/75' : 'text-slate-500'}`}>
                                {record.eventLabel}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className={`text-xs font-semibold ${isActive ? 'text-white/60' : 'text-slate-400'}`}>
                              {formatDateAR(record.createdAt)}
                            </p>
                            <p className={`mt-2 text-sm font-black ${isActive ? 'text-white' : 'text-slate-800'}`}>
                              <FancyPrice amount={record.totalAmount} />
                            </p>
                          </div>
                        </div>
                        <div className={`mt-3 grid gap-2 text-[11px] font-semibold ${isActive ? 'text-white/80' : 'text-slate-500'} sm:grid-cols-3`}>
                          <span>Total: {formatCurrency(record.totalAmount)}</span>
                          <span>Items: {itemCount}</span>
                          <span className="truncate">Doc: {record.documentTitle || 'PRESUPUESTO'}</span>
                        </div>
                        </>
                      ) : (
                        <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                                  isActive
                                    ? 'border-white/20 bg-white/10 text-white'
                                    : 'border-slate-200 bg-slate-50 text-slate-500'
                                }`}
                              >
                                {RECORD_TYPE_LABELS[record.type]}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                                  isActive
                                    ? 'border-white/20 bg-white/10 text-white'
                                    : STATUS_STYLES[record.status] || STATUS_STYLES.Pendiente
                                }`}
                              >
                                {record.status}
                              </span>
                            </div>
                            <p className={`mt-2 truncate text-sm font-black ${isActive ? 'text-white' : 'text-slate-800'}`}>
                              {record.customerName}
                            </p>
                          <p className={`text-[11px] font-semibold ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
                            {record.customerKind} · {record.customerPhone}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xs font-semibold ${isActive ? 'text-white/60' : 'text-slate-400'}`}>
                            {formatDateAR(record.createdAt)}
                          </p>
                          <p className={`mt-2 text-sm font-black ${isActive ? 'text-white' : 'text-slate-800'}`}>
                            <FancyPrice amount={record.totalAmount} />
                          </p>
                        </div>
                      </div>

                      <div className={`mt-3 grid gap-2 text-[11px] font-semibold ${isActive ? 'text-white/80' : 'text-slate-500'} sm:grid-cols-3`}>
                        <span>Total: {formatCurrency(record.totalAmount)}</span>
                        <span>Seña: {formatCurrency(record.depositAmount || 0)}</span>
                        <span>Restante: {formatCurrency(record.remainingAmount || 0)}</span>
                      </div>
                        </>
                      )}
                    </button>
                  );
                })}

                {filteredRecords.length === 0 && (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center">
                    <p className="text-sm font-bold text-slate-500">No hay registros que coincidan con la búsqueda.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 bg-slate-50">
          {selectedRecord ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-black text-slate-800">{selectedRecord.customerName}</h2>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${STATUS_STYLES[selectedRecord.status] || STATUS_STYLES.Pendiente}`}>
                        {selectedRecord.status}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                        {RECORD_TYPE_LABELS[selectedRecord.type]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {selectedRecord.customerKind} · {selectedRecord.customerPhone}
                      {selectedRecord.eventLabel ? ` · ${selectedRecord.eventLabel}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onPrintRecord(selectedRecord)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                    >
                      <Printer size={12} />
                      Imprimir
                    </button>

                    {selectedRecord.type === 'budget' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEditBudget(selectedRecord)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                        >
                          <FileText size={12} />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => openConvertModal(selectedRecord)}
                          disabled={Boolean(linkedOrderForBudget)}
                          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ReceiptText size={12} />
                          {linkedOrderForBudget ? 'Pedido ya creado' : 'Convertir a pedido'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSelectedBudget(selectedRecord)}
                          className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-rose-700 transition hover:bg-rose-100"
                        >
                          <X size={12} />
                          Eliminar
                        </button>
                      </>
                    )}

                    {selectedRecord.type === 'order' && !['Retirado', 'Cancelado'].includes(selectedRecord.status) && (
                      <>
                        {selectedRecord.status !== 'Pagado' && (
                          <button
                            type="button"
                            onClick={() => openPaymentModal(selectedRecord)}
                            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-slate-800"
                          >
                            <Wallet size={12} />
                            Registrar pago
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCancelSelectedOrder(selectedRecord)}
                          className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-rose-700 transition hover:bg-rose-100"
                        >
                          <X size={12} />
                          Cancelar pedido
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRetireOrder(selectedRecord)}
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700 transition hover:bg-emerald-100"
                        >
                          <CheckCircle2 size={12} />
                          Marcar retirado
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 gap-3 p-4 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="min-h-0 overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-4 scrollbar-hide">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Resumen operativo
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Creado</p>
                      <p className="mt-1 text-sm font-black text-slate-800">{formatDateAR(selectedRecord.createdAt)}</p>
                    </div>
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Retiro</p>
                      <p className="mt-1 text-sm font-black text-slate-800">
                        {formatPickupDate(selectedRecord.pickupDate)}
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-500">Seña</p>
                      <p className="mt-1 text-lg font-black text-emerald-700">
                        <FancyPrice amount={selectedRecord.depositAmount || 0} />
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-sky-200 bg-sky-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-500">Abonado</p>
                      <p className="mt-1 text-lg font-black text-sky-700">
                        <FancyPrice amount={selectedRecord.paidTotal || 0} />
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-500">Restante</p>
                      <p className="mt-1 text-lg font-black text-amber-700">
                        <FancyPrice amount={selectedRecord.remainingAmount || 0} />
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Total</p>
                      <p className="mt-1 text-lg font-black text-slate-800">
                        <FancyPrice amount={selectedRecord.totalAmount || 0} />
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Cliente</p>
                    <p className="mt-1 text-sm font-black text-slate-800">{selectedRecord.customerName}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{selectedRecord.customerPhone}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{selectedRecord.customerKind}</p>
                    {selectedRecord.customerNote && (
                      <>
                        <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Nota</p>
                        <p className="mt-1 text-sm font-medium text-slate-600">{selectedRecord.customerNote}</p>
                      </>
                    )}
                    {linkedOrderForBudget && (
                      <>
                        <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Pedido vinculado</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">#{linkedOrderForBudget.id}</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-4 scrollbar-hide">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Articulos del {selectedRecord.type === 'budget' ? 'presupuesto' : 'pedido'}
                  </p>
                  <div className="mt-3 space-y-2">
                    {selectedRecord.items.map((item) => {
                      const subtotal = calculateBudgetLineSubtotal(item);
                      return (
                        <div key={item.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-800">{item.title}</p>
                              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                {item.category}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-slate-800">{formatCurrency(subtotal)}</p>
                              <p className="text-[11px] font-semibold text-slate-500">
                                {formatBudgetItemQuantity(item)}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                            <span className="rounded-full bg-white px-2 py-1">
                              Unitario: {formatCurrency(item.newPrice)}
                              {item.product_type === 'weight' ? ' /Kg' : ''}
                            </span>
                            {item.productId ? (
                              <span className="rounded-full bg-white px-2 py-1">ID #{item.productId}</span>
                            ) : (
                              <span className="rounded-full bg-white px-2 py-1">Item manual</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div className="max-w-md">
                <ClipboardList size={42} className="mx-auto mb-4 text-slate-300" />
                <p className="text-base font-black text-slate-600">Seleccioná un presupuesto o pedido</p>
                <p className="mt-2 text-sm font-medium text-slate-400">
                  Acá vas a ver artículos, cantidades, precios, seña, saldo pendiente y fecha de retiro.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <BudgetBuilderModal
        isOpen={isBudgetModalOpen}
        onClose={() => {
          setIsBudgetModalOpen(false);
          setEditingBudget(null);
        }}
        inventory={inventory}
        categories={categories}
        members={members}
        initialRecord={editingBudget}
        onSave={handleSaveBudget}
        isSaving={isSavingBudget}
      />

      {convertTarget && (
        <MiniModal title="Convertir a pedido" onClose={() => setConvertTarget(null)}>
          <div className="space-y-3">
            <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                <CalendarRange size={11} />
                Fecha de retiro
              </span>
              <input
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none"
              />
            </label>

            <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                <CreditCard size={11} />
                Seña inicial
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none"
              />
            </label>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600">
              Total del presupuesto: <span className="font-black text-slate-800">{formatCurrency(convertTarget.totalAmount)}</span>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConvertTarget(null)}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConvertBudget}
                disabled={isConverting}
                className="flex-1 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isConverting ? 'Convirtiendo...' : 'Crear pedido'}
              </button>
            </div>
          </div>
        </MiniModal>
      )}

      {paymentTarget && (
        <MiniModal title="Registrar pago" onClose={() => setPaymentTarget(null)}>
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600">
              Restante actual: <span className="font-black text-slate-800">{formatCurrency(paymentTarget.remainingAmount)}</span>
            </div>

            <label className="block rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                <Wallet size={11} />
                Monto a registrar
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none"
              />
            </label>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPaymentTarget(null)}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePayment}
                disabled={isSavingPayment}
                className="flex-1 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingPayment ? 'Guardando...' : 'Aplicar pago'}
              </button>
            </div>
          </div>
        </MiniModal>
      )}
    </>
  );
}
