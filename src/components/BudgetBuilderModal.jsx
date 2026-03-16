import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarRange,
  FileText,
  Package,
  Phone,
  Plus,
  Search,
  StickyNote,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { FancyPrice } from './FancyPrice';
import {
  buildBudgetSnapshot,
  calculateBudgetLineSubtotal,
  calculateBudgetTotal,
  createEmptyBudgetItem,
  DEFAULT_BUDGET_CONFIG,
  formatBudgetItemQuantity,
  hydrateBudgetSnapshot,
  normalizeBudgetBuilderItem,
} from '../utils/budgetHelpers';
import { formatCurrency, formatWeight } from '../utils/helpers';

const ITEMS_STEP = 30;

const getProductCategory = (product) => {
  if (Array.isArray(product.categories) && product.categories.length > 0) {
    return product.categories[0];
  }
  if (product.category) {
    return String(product.category).split(',')[0].trim();
  }
  return 'Otros';
};

const buildDraftFromRecord = (record, members) => {
  if (!record) {
    return {
      config: DEFAULT_BUDGET_CONFIG,
      items: [],
    };
  }

  const linkedMember = members.find((member) => String(member.id) === String(record.memberId));

  return {
    config: {
      documentTitle: record.documentTitle || 'PRESUPUESTO',
      eventLabel: record.eventLabel || '',
      customerMode: linkedMember ? 'member' : 'guest',
      memberId: record.memberId || null,
      customerName: record.customerName || '',
      customerPhone: record.customerPhone || '',
      customerNote: record.customerNote || '',
    },
    items: hydrateBudgetSnapshot(record.itemsSnapshot || []),
  };
};

export default function BudgetBuilderModal({
  isOpen,
  onClose,
  inventory,
  categories,
  members,
  initialRecord = null,
  onSave,
  isSaving = false,
}) {
  const [draftConfig, setDraftConfig] = useState(DEFAULT_BUDGET_CONFIG);
  const [draftItems, setDraftItems] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [memberSearch, setMemberSearch] = useState('');
  const [catalogLimit, setCatalogLimit] = useState(ITEMS_STEP);

  useEffect(() => {
    if (!isOpen) return;
    const draft = buildDraftFromRecord(initialRecord, members);
    setDraftConfig(draft.config);
    setDraftItems(draft.items);
    setProductSearch('');
    setSelectedCategory('Todas');
    setMemberSearch('');
    setCatalogLimit(ITEMS_STEP);
  }, [isOpen, initialRecord, members]);

  useEffect(() => {
    setCatalogLimit(ITEMS_STEP);
  }, [productSearch, selectedCategory]);

  const filteredInventory = useMemo(() => {
    const searchWords = productSearch.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return (inventory || []).filter((product) => {
      const matchesCategory =
        selectedCategory === 'Todas' ||
        (Array.isArray(product.categories)
          ? product.categories.includes(selectedCategory)
          : product.category === selectedCategory);

      if (!matchesCategory) return false;

      if (searchWords.length === 0) return true;

      const title = (product.title || '').toLowerCase();
      const barcode = String(product.barcode || '').toLowerCase();
      return searchWords.every((word) => title.includes(word) || barcode.includes(word));
    });
  }, [inventory, productSearch, selectedCategory]);

  const visibleInventory = filteredInventory.slice(0, catalogLimit);

  const filteredMembers = useMemo(() => {
    const searchWords = memberSearch.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return (members || []).filter((member) => {
      if (searchWords.length === 0) return true;
      const haystack = [
        member.name,
        member.phone,
        member.dni,
        member.memberNumber,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchWords.every((word) => haystack.includes(word));
    });
  }, [members, memberSearch]);

  const selectedMember =
    draftConfig.customerMode === 'member'
      ? members.find((member) => String(member.id) === String(draftConfig.memberId))
      : null;

  const budgetTotal = calculateBudgetTotal(draftItems);
  const fieldShellClass =
    'rounded-[18px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(241,245,249,0.96)_100%)] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]';
  const panelShellClass = 'rounded-[20px] border border-slate-200 bg-slate-50/80 p-2.5';

  const handleCatalogScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 120 && catalogLimit < filteredInventory.length) {
      setCatalogLimit((prev) => prev + ITEMS_STEP);
    }
  };

  const addProductToDraft = (product) => {
    const normalizedProduct = normalizeBudgetBuilderItem({
      id: `${product.id}-${Date.now()}`,
      productId: product.id,
      title: product.title,
      category: getProductCategory(product),
      qty: product.product_type === 'weight' ? 1000 : 1,
      newPrice:
        product.product_type === 'weight'
          ? Math.round((Number(product.price) || 0) * 1000)
          : Number(product.price) || 0,
      product_type: product.product_type || 'quantity',
      isTemporary: false,
      stock: Number(product.stock || 0),
    });

    setDraftItems((prev) => {
      const qtyIncrement = product.product_type === 'weight' ? 1000 : 1;
      const existingIndex = prev.findIndex(
        (item) =>
          item.productId !== null &&
          String(item.productId) === String(product.id) &&
          !item.isTemporary
      );

      if (existingIndex === -1) {
        return [...prev, normalizedProduct];
      }

      return prev.map((item, index) =>
        index === existingIndex
          ? {
              ...item,
              qty: (Number(item.qty) || 0) + qtyIncrement,
              stock: Number(product.stock || item.stock || 0),
            }
          : item
      );
    });
  };

  const addManualItem = () => {
    setDraftItems((prev) => [...prev, createEmptyBudgetItem()]);
  };

  const updateDraftItem = (id, field, value) => {
    setDraftItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]:
                field === 'qty' || field === 'newPrice'
                  ? Number(value)
                  : value,
            }
          : item
      )
    );
  };

  const removeDraftItem = (id) => {
    setDraftItems((prev) => prev.filter((item) => item.id !== id));
  };

  const selectMember = (member) => {
    setDraftConfig((prev) => ({
      ...prev,
      customerMode: 'member',
      memberId: member.id,
      customerName: member.name || '',
      customerPhone: member.phone || '',
    }));
  };

  const switchCustomerMode = (mode) => {
    if (mode === 'member') {
      setDraftConfig((prev) => ({
        ...prev,
        customerMode: 'member',
      }));
      return;
    }

    setDraftConfig((prev) => ({
      ...prev,
      customerMode: 'guest',
      memberId: null,
    }));
  };

  const handleSubmit = async () => {
    const cleanItems = draftItems.filter((item) => item.title.trim() !== '');

    if (cleanItems.length === 0) {
      Swal.fire('Faltan artículos', 'Agregá al menos un artículo al presupuesto.', 'warning');
      return;
    }

    if (cleanItems.some((item) => Number(item.qty) <= 0 || Number(item.newPrice) < 0)) {
      Swal.fire(
        'Detalle inválido',
        'Revisá cantidades y precios. Ningún artículo puede quedar en cero o negativo.',
        'warning'
      );
      return;
    }

    if (draftConfig.customerMode === 'member' && !draftConfig.memberId) {
      Swal.fire('Falta socio', 'Seleccioná un socio para continuar con el presupuesto.', 'warning');
      return;
    }

    if (draftConfig.customerMode === 'guest') {
      if (
        !draftConfig.customerName.trim() ||
        !draftConfig.customerPhone.trim() ||
        !draftConfig.customerNote.trim()
      ) {
        Swal.fire(
          'Datos incompletos',
          'Para no socios completá nombre, teléfono y nota antes de guardar.',
          'warning'
        );
        return;
      }
    }

    await onSave({
      memberId: draftConfig.customerMode === 'member' ? draftConfig.memberId : null,
      customerName: draftConfig.customerName.trim(),
      customerPhone: draftConfig.customerPhone.trim(),
      customerNote: draftConfig.customerNote.trim(),
      documentTitle: (draftConfig.documentTitle || 'PRESUPUESTO').trim().toUpperCase(),
      eventLabel: draftConfig.eventLabel.trim(),
      itemsSnapshot: buildBudgetSnapshot(cleanItems),
      totalAmount: calculateBudgetTotal(cleanItems),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm p-2.5 sm:p-3">
      <div className="mx-auto flex h-full max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3.5 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <FileText size={16} />
            </div>
            <div>
              <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-800">
                {initialRecord ? 'Editar presupuesto' : 'Crear presupuesto'}
              </h2>
              <p className="text-[11px] font-medium text-slate-500">
                Armá el presupuesto, definí el cliente y congelá el detalle del pedido.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[14px] border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="min-h-0 border-b border-slate-200 bg-white lg:border-b-0 lg:border-r">
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-slate-200 px-3.5 py-2.5">
                <div className={`flex items-center gap-2 ${fieldShellClass}`}>
                  <Search size={14} className="text-slate-400" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar producto..."
                    className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
                  />
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className={`mt-2 w-full text-sm font-semibold text-slate-700 outline-none ${fieldShellClass}`}
                >
                  <option value="Todas">Todas las categorias</option>
                  {(categories || []).map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5 scrollbar-hide" onScroll={handleCatalogScroll}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {visibleInventory.map((product) => (
                    <button
                      key={`${product.id}-catalog`}
                      type="button"
                      onClick={() => addProductToDraft(product)}
                      className="rounded-[18px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.9)_0%,rgba(241,245,249,0.82)_100%)] px-3 py-2.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                    >
                      <div className="min-w-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">{product.title}</p>
                          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                            {getProductCategory(product)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="h-8 w-8 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                            {product.image ? (
                              <img src={product.image} alt={product.title} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                                <Package size={12} />
                              </div>
                            )}
                          </div>
                          <span className="rounded-full bg-white px-2 py-1 font-bold text-slate-500">
                            {product.product_type === 'weight' ? formatWeight(product.stock) : `${product.stock || 0} u.`}
                          </span>
                        </div>
                        <span className="font-black text-indigo-700">
                          <FancyPrice amount={product.product_type === 'weight' ? (Number(product.price) || 0) * 1000 : product.price} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 bg-slate-50">
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <div className="grid gap-2.5 xl:grid-cols-[1fr_1.2fr]">
                  <div className={panelShellClass}>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => switchCustomerMode('member')}
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition ${
                          draftConfig.customerMode === 'member'
                            ? 'bg-indigo-600 text-white'
                            : 'border border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        <Users size={12} />
                        Socio
                      </button>
                      <button
                        type="button"
                        onClick={() => switchCustomerMode('guest')}
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition ${
                          draftConfig.customerMode === 'guest'
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        <User size={12} />
                        No socio
                      </button>
                    </div>

                    {draftConfig.customerMode === 'member' ? (
                      <div className="mt-3">
                        <div className={`flex items-center gap-2 ${fieldShellClass}`}>
                          <Search size={14} className="text-slate-400" />
                          <input
                            type="text"
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                            placeholder="Buscar socio..."
                            className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
                          />
                        </div>
                        <div className="mt-2 max-h-40 overflow-y-auto rounded-[18px] border border-slate-200/80 bg-slate-100/80 p-1.5 scrollbar-hide">
                          {filteredMembers.slice(0, 8).map((member) => (
                            <button
                              key={member.id}
                              type="button"
                              onClick={() => selectMember(member)}
                              className={`mb-1 w-full rounded-xl px-3 py-2 text-left transition ${
                                String(draftConfig.memberId) === String(member.id)
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-white text-slate-700 hover:bg-indigo-50'
                              }`}
                            >
                              <p className="text-sm font-black">{member.name}</p>
                              <p className={`text-[11px] font-semibold ${String(draftConfig.memberId) === String(member.id) ? 'text-indigo-100' : 'text-slate-400'}`}>
                                #{member.memberNumber || '---'} {member.phone ? `· ${member.phone}` : ''}
                              </p>
                            </button>
                          ))}
                        </div>
                        {selectedMember && (
                          <div className="mt-2 rounded-[18px] border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
                            Socio vinculado: {selectedMember.name}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3 grid gap-2">
                        <label className={fieldShellClass}>
                          <span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                            <User size={11} />
                            Nombre
                          </span>
                          <input
                            type="text"
                            value={draftConfig.customerName}
                            onChange={(e) => setDraftConfig((prev) => ({ ...prev, customerName: e.target.value }))}
                            className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none"
                          />
                        </label>
                        <label className={fieldShellClass}>
                          <span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                            <Phone size={11} />
                            Telefono
                          </span>
                          <input
                            type="text"
                            value={draftConfig.customerPhone}
                            onChange={(e) => setDraftConfig((prev) => ({ ...prev, customerPhone: e.target.value }))}
                            className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none"
                          />
                        </label>
                        <label className={fieldShellClass}>
                          <span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                            <StickyNote size={11} />
                            Nota
                          </span>
                          <textarea
                            rows="2"
                            value={draftConfig.customerNote}
                            onChange={(e) => setDraftConfig((prev) => ({ ...prev, customerNote: e.target.value }))}
                            className="w-full resize-none bg-transparent text-sm font-medium text-slate-700 outline-none"
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  <div className={panelShellClass}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className={fieldShellClass}>
                        <span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                          <FileText size={11} />
                          Titulo
                        </span>
                        <input
                          type="text"
                          value={draftConfig.documentTitle}
                          onChange={(e) => setDraftConfig((prev) => ({ ...prev, documentTitle: e.target.value.toUpperCase() }))}
                          className="w-full bg-transparent text-sm font-black uppercase text-slate-700 outline-none"
                        />
                      </label>
                      <label className={fieldShellClass}>
                        <span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                          <CalendarRange size={11} />
                          Evento
                        </span>
                        <input
                          type="text"
                          value={draftConfig.eventLabel}
                          onChange={(e) => setDraftConfig((prev) => ({ ...prev, eventLabel: e.target.value }))}
                          className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none"
                        />
                      </label>
                    </div>

                    <div className="mt-2.5 rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
                        Total congelado
                      </p>
                      <p className="mt-1 text-[26px] font-black leading-none text-emerald-700">
                        <FancyPrice amount={budgetTotal} />
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-2.5 scrollbar-hide">
                <div className="mb-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                      Detalle del presupuesto
                    </p>
                    <p className="text-[11px] font-medium text-slate-400">
                      {draftItems.length} item(s) preparados para el documento.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addManualItem}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                  >
                    <Plus size={12} />
                    Item manual
                  </button>
                </div>

                <div className="space-y-2">
                  {draftItems.map((item) => {
                    const subtotal = calculateBudgetLineSubtotal(item);
                    return (
                      <div key={item.id} className="rounded-[18px] border border-slate-200/80 bg-white/85 px-2.5 py-2.5 shadow-sm">
                        <div className="grid gap-2 xl:grid-cols-[1.5fr_120px_140px_120px_38px]">
                          <label className={fieldShellClass}>
                            <span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                              <Package size={11} />
                              Articulo
                            </span>
                            <input
                              type="text"
                              value={item.title}
                              onChange={(e) => updateDraftItem(item.id, 'title', e.target.value)}
                              className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none"
                            />
                          </label>

                          <label className={fieldShellClass}>
                            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                              Cantidad
                            </span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={item.qty}
                              onChange={(e) => updateDraftItem(item.id, 'qty', e.target.value)}
                              className="w-full bg-transparent text-sm font-black text-slate-700 outline-none"
                            />
                          </label>

                          <label className={fieldShellClass}>
                            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                              Precio unitario
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.newPrice}
                              onChange={(e) => updateDraftItem(item.id, 'newPrice', e.target.value)}
                              className="w-full bg-transparent text-sm font-black text-slate-700 outline-none"
                            />
                          </label>

                          <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-2">
                            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-emerald-500">
                              Subtotal
                            </span>
                            <span className="text-sm font-black text-emerald-700">
                              {formatCurrency(subtotal)}
                            </span>
                            <div className="mt-1 text-[10px] font-semibold text-emerald-600">
                              {formatBudgetItemQuantity(item)}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeDraftItem(item.id)}
                            className="flex h-full items-center justify-center rounded-[18px] border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {draftItems.length === 0 && (
                    <div className="rounded-[20px] border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
                      <p className="text-sm font-bold text-slate-500">
                        Agregá productos desde el catálogo para empezar el presupuesto.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 bg-white px-3.5 py-2.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Total del documento
                    </p>
                    <p className="text-[26px] font-black leading-none text-slate-800">
                      <FancyPrice amount={budgetTotal} />
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-[18px] border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold text-slate-600 transition hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isSaving}
                      className="rounded-[18px] bg-slate-900 px-4 py-2 text-[13px] font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving ? 'Guardando...' : initialRecord ? 'Guardar cambios' : 'Guardar presupuesto'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
