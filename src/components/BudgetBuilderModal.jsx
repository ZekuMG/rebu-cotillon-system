import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarRange,
  CreditCard,
  FileText,
  Package,
  Phone,
  Plus,
  Search,
  StickyNote,
  TicketPercent,
  Trash2,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Swal from 'sweetalert2';
import AsyncActionButton from './AsyncActionButton';
import { FancyPrice } from './FancyPrice';
import { HintIcon } from './HintIcon';
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
import { normalizeLegacyOffer } from '../utils/offerHelpers';
import {
  createPaymentLine,
  getPaymentBreakdownDisplayItems,
  getPaymentMethodLabel,
  getPaymentSummary,
} from '../utils/paymentBreakdown';

const ITEMS_STEP = 30;
const BUDGET_PAYMENT_METHODS = [
  { id: 'Efectivo', label: 'Efectivo', icon: Wallet },
  { id: 'Debito', label: 'Débito', icon: CreditCard },
  { id: 'Credito', label: 'Crédito', icon: CreditCard },
  { id: 'MercadoPago', label: 'Mercado Pago', icon: TicketPercent },
];

const roundBudgetPaymentValue = (value) => {
  const numeric = Number(value) || 0;
  return Math.round(numeric * 100) / 100;
};

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
      paymentMethod: record.paymentBreakdown?.[0]?.method || record.paymentMethod || 'Efectivo',
      installments: Number(record.installments || 1) || 1,
      isSplitPayment: (record.paymentBreakdown || []).length > 1,
      paymentLines: Array.isArray(record.paymentBreakdown)
        ? record.paymentBreakdown.map((line, index) =>
            createPaymentLine({
              id: line.id || `budget_line_${index}`,
              method: line.method || 'Efectivo',
              amount: Number(line.amount || 0),
              installments: line.method === 'Credito' ? Number(line.installments || 1) : 1,
            })
          )
        : [],
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
  offers = [],
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
  const [showOffersPanel, setShowOffersPanel] = useState(false);
  const [offerView, setOfferView] = useState('combo');
  const [activePaymentLineIndex, setActivePaymentLineIndex] = useState(0);
  const initialRecordKey = initialRecord?.id ? `edit-${initialRecord.id}` : 'new';
  const draftStorageKey = `rebu-budget-builder-${initialRecordKey}`;
  const initialDraftRef = useRef({ key: '', draft: { config: DEFAULT_BUDGET_CONFIG, items: [] } });

  if (initialDraftRef.current.key !== initialRecordKey) {
    initialDraftRef.current = {
      key: initialRecordKey,
      draft: buildDraftFromRecord(initialRecord, members),
    };
  }

  useEffect(() => {
    if (!isOpen) return;
    try {
      const storedDraft = window.localStorage.getItem(draftStorageKey);
      if (storedDraft) {
        const parsedDraft = JSON.parse(storedDraft);
        setDraftConfig({ ...DEFAULT_BUDGET_CONFIG, ...(parsedDraft?.config || {}) });
        setDraftItems(Array.isArray(parsedDraft?.items) ? hydrateBudgetSnapshot(parsedDraft.items) : []);
        setProductSearch(parsedDraft?.ui?.productSearch || '');
        setSelectedCategory(parsedDraft?.ui?.selectedCategory || 'Todas');
        setMemberSearch(parsedDraft?.ui?.memberSearch || '');
        setCatalogLimit(ITEMS_STEP);
        return;
      }
    } catch (error) {
      console.warn('No se pudo restaurar el borrador del presupuesto:', error);
    }

    const draft = initialDraftRef.current.draft;
    setDraftConfig(draft.config);
    setDraftItems(draft.items);
    setProductSearch('');
    setSelectedCategory('Todas');
    setMemberSearch('');
    setCatalogLimit(ITEMS_STEP);
  }, [isOpen, draftStorageKey]);

  useEffect(() => {
    if (!isOpen) return;
    try {
      window.localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          config: draftConfig,
          items: buildBudgetSnapshot(draftItems),
          ui: {
            productSearch,
            selectedCategory,
            memberSearch,
          },
        })
      );
    } catch (error) {
      console.warn('No se pudo persistir el borrador del presupuesto:', error);
    }
  }, [isOpen, draftConfig, draftItems, productSearch, selectedCategory, memberSearch, draftStorageKey]);

  useEffect(() => {
    setCatalogLimit(ITEMS_STEP);
  }, [productSearch, selectedCategory]);

  useEffect(() => {
    if (!isOpen) return;
    setActivePaymentLineIndex(0);
  }, [isOpen, initialRecordKey]);

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

  const productsByCategory = useMemo(
    () =>
      (categories || []).reduce((acc, categoryName) => {
        acc[categoryName] = (inventory || []).filter((product) =>
          Array.isArray(product.categories)
            ? product.categories.includes(categoryName)
            : product.category === categoryName
        );
        return acc;
      }, {}),
    [categories, inventory]
  );

  const normalizedBudgetOffers = useMemo(
    () =>
      (offers || []).map((offer) => ({
        ...offer,
        canonical: normalizeLegacyOffer(offer, productsByCategory, inventory),
      })),
    [offers, productsByCategory, inventory]
  );

  const selectableBudgetOffers = useMemo(
    () =>
      normalizedBudgetOffers.filter((offer) =>
        offer.canonical?.benefitType === 'combo' ||
        offer.canonical?.benefitType === 'fixed_price' ||
        offer.canonical?.benefitType === 'coupon' ||
        (offer.canonical?.benefitType === 'discount' &&
          (offer.canonical?.scopeMode === 'all_products' || (offer.productsIncluded || []).length === 0))
      ),
    [normalizedBudgetOffers]
  );

  const visibleBudgetOffers = useMemo(
    () =>
      selectableBudgetOffers.filter((offer) => {
        const canonical = offer.canonical;
        const isCombo =
          canonical?.benefitType === 'combo' ||
          canonical?.benefitType === 'fixed_price' ||
          offer.applyTo === 'Seleccion';

        return offerView === 'combo' ? isCombo : !isCombo;
      }),
    [offerView, selectableBudgetOffers]
  );

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
  const normalizedBudgetPaymentLines = useMemo(() => {
    const fallbackMethod = draftConfig.paymentMethod || 'Efectivo';
    const fallbackInstallments = Number(draftConfig.installments || 1) || 1;
    const normalizedTotal = roundBudgetPaymentValue(budgetTotal);

    if (draftConfig.isSplitPayment) {
      const configuredLines = Array.isArray(draftConfig.paymentLines) ? draftConfig.paymentLines : [];
      const currentPrimary =
        configuredLines[0] ||
        createPaymentLine({
          id: 'budget_primary',
          method: fallbackMethod,
          amount: normalizedTotal,
          installments: fallbackInstallments,
        });
      const currentSecondary =
        configuredLines[1] ||
        createPaymentLine({
          id: 'budget_secondary',
          method: fallbackMethod === 'Efectivo' ? 'Debito' : 'Efectivo',
          amount: 0,
        });

      const primaryAmount = Math.min(
        normalizedTotal,
        Math.max(0, roundBudgetPaymentValue(currentPrimary.amount || 0))
      );
      const remainingAmount = roundBudgetPaymentValue(Math.max(0, normalizedTotal - primaryAmount));

      return [
        createPaymentLine({
          id: currentPrimary.id || 'budget_primary',
          method: currentPrimary.method || fallbackMethod,
          amount: primaryAmount,
          installments:
            (currentPrimary.method || fallbackMethod) === 'Credito'
              ? Number(currentPrimary.installments || 1) || 1
              : 1,
        }),
        createPaymentLine({
          id: currentSecondary.id || 'budget_secondary',
          method: currentSecondary.method || (fallbackMethod === 'Efectivo' ? 'Debito' : 'Efectivo'),
          amount: remainingAmount,
          installments:
            (currentSecondary.method || '') === 'Credito'
              ? Number(currentSecondary.installments || 1) || 1
              : 1,
        }),
      ];
    }

    return [
      createPaymentLine({
        id: 'budget_single',
        method: fallbackMethod,
        amount: normalizedTotal,
        installments: fallbackMethod === 'Credito' ? fallbackInstallments : 1,
      }),
    ];
  }, [
    budgetTotal,
    draftConfig.installments,
    draftConfig.isSplitPayment,
    draftConfig.paymentLines,
    draftConfig.paymentMethod,
  ]);
  const budgetPaymentSummary = getPaymentSummary(
    normalizedBudgetPaymentLines,
    draftConfig.paymentMethod || 'Efectivo',
    draftConfig.installments || 0,
  );
  const budgetPaymentItems = getPaymentBreakdownDisplayItems(
    normalizedBudgetPaymentLines,
    draftConfig.paymentMethod || 'Efectivo',
    draftConfig.installments || 0,
    0,
    0,
    budgetTotal,
  );
  const splitPrimaryBudgetLine = normalizedBudgetPaymentLines[0] || null;
  const splitSecondaryBudgetLine = normalizedBudgetPaymentLines[1] || null;
  const activeBudgetMethod = draftConfig.isSplitPayment
    ? normalizedBudgetPaymentLines[activePaymentLineIndex]?.method || normalizedBudgetPaymentLines[0]?.method || 'Efectivo'
    : draftConfig.paymentMethod || 'Efectivo';
  const discountBaseTotal = calculateBudgetTotal(
    draftItems.filter((item) => Number(item.newPrice || 0) >= 0)
  );
  const fieldShellClass =
    'rounded-[16px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(241,245,249,0.94)_0%,rgba(236,242,248,0.96)_100%)] px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]';
  const panelShellClass = 'rounded-[18px] border border-slate-200 bg-slate-50/85 p-1.5';
  const fieldInputClass =
    'w-full rounded-[11px] border border-white/65 bg-white/55 px-2 py-1 text-[12px] font-medium text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none placeholder:text-slate-400';
  const fieldSelectClass =
    'w-full rounded-[11px] border border-white/65 bg-white/55 px-2 py-1 text-[12px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none';
  const fieldNumberClass =
    'w-full rounded-[11px] border border-white/65 bg-white/55 px-2 py-1 text-center text-[12px] font-black text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
  const quantityInputClass =
    'w-full rounded-[11px] border border-indigo-100/80 bg-white/70 px-2 py-1 text-center text-[12px] font-black text-indigo-700 outline-none [appearance:textfield] ring-1 ring-indigo-100/60 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
  const lockedFieldClass =
    'flex min-h-[30px] items-center rounded-[11px] border border-slate-200/70 bg-slate-100/80 px-2 py-1 text-[12px] font-semibold text-slate-500';

  const handleCatalogScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 120 && catalogLimit < filteredInventory.length) {
      setCatalogLimit((prev) => prev + ITEMS_STEP);
    }
  };

  const handleToggleSplitPayment = () => {
    setDraftConfig((prev) => {
      if (prev.isSplitPayment) {
        const primaryLine =
          normalizedBudgetPaymentLines[0] ||
          createPaymentLine({
            method: prev.paymentMethod || 'Efectivo',
            amount: budgetTotal,
            installments: prev.installments || 1,
          });
        return {
          ...prev,
          isSplitPayment: false,
          paymentMethod: primaryLine.method || prev.paymentMethod || 'Efectivo',
          installments:
            (primaryLine.method || prev.paymentMethod) === 'Credito'
              ? Number(primaryLine.installments || 1) || 1
              : 1,
          paymentLines: [],
        };
      }

      const primaryLine =
        normalizedBudgetPaymentLines[0] ||
        createPaymentLine({
          method: prev.paymentMethod || 'Efectivo',
          amount: budgetTotal,
          installments: prev.installments || 1,
        });

      return {
        ...prev,
        isSplitPayment: true,
        paymentLines: [
          createPaymentLine({
            id: 'budget_primary',
            method: primaryLine.method || prev.paymentMethod || 'Efectivo',
            amount: roundBudgetPaymentValue(budgetTotal),
            installments:
              (primaryLine.method || prev.paymentMethod) === 'Credito'
                ? Number(primaryLine.installments || 1) || 1
                : 1,
          }),
          createPaymentLine({
            id: 'budget_secondary',
            method: (primaryLine.method || prev.paymentMethod) === 'Efectivo' ? 'Debito' : 'Efectivo',
            amount: 0,
            installments: 1,
          }),
        ],
      };
    });
    setActivePaymentLineIndex(0);
  };

  const handleSelectBudgetPaymentMethod = (methodId) => {
    if (draftConfig.isSplitPayment) {
      const nextLines = normalizedBudgetPaymentLines.map((line) => ({ ...line }));
      const targetIndex = activePaymentLineIndex === 1 ? 1 : 0;
      nextLines[targetIndex] = {
        ...nextLines[targetIndex],
        method: methodId,
        installments: methodId === 'Credito' ? Number(nextLines[targetIndex].installments || 1) || 1 : 1,
      };
      setDraftConfig((prev) => ({
        ...prev,
        paymentMethod: nextLines[0]?.method || methodId,
        installments:
          (nextLines[0]?.method || methodId) === 'Credito'
            ? Number(nextLines[0]?.installments || 1) || 1
            : 1,
        paymentLines: nextLines,
      }));
      return;
    }

    setDraftConfig((prev) => ({
      ...prev,
      paymentMethod: methodId,
      installments: methodId === 'Credito' ? Number(prev.installments || 1) || 1 : 1,
      paymentLines: [],
    }));
  };

  const handlePrimaryPaymentAmountChange = (value) => {
    const nextAmount = Math.max(
      0,
      Math.min(roundBudgetPaymentValue(value), roundBudgetPaymentValue(budgetTotal))
    );
    const nextLines = normalizedBudgetPaymentLines.map((line, index) =>
      index === 0 ? { ...line, amount: nextAmount } : line
    );
    setDraftConfig((prev) => ({
      ...prev,
      paymentLines: nextLines,
    }));
  };

  const handleBudgetInstallmentsChange = (lineIndex, value) => {
    const nextInstallments = Number(value || 1) || 1;
    if (draftConfig.isSplitPayment) {
      const nextLines = normalizedBudgetPaymentLines.map((line, index) =>
        index === lineIndex ? { ...line, installments: nextInstallments } : line
      );
      setDraftConfig((prev) => ({
        ...prev,
        installments:
          (nextLines[0]?.method || prev.paymentMethod) === 'Credito'
            ? Number(nextLines[0]?.installments || 1) || 1
            : 1,
        paymentLines: nextLines,
      }));
      return;
    }

    setDraftConfig((prev) => ({ ...prev, installments: nextInstallments }));
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

  const applyOfferToDraft = (offer) => {
    const canonical = offer?.canonical || normalizeLegacyOffer(offer, productsByCategory, inventory);

    if (canonical.benefitType === 'combo' || canonical.benefitType === 'fixed_price' || offer.applyTo === 'Seleccion') {
      const comboItem = createEmptyBudgetItem({
        id: `combo-${offer.id || Date.now()}-${Date.now()}`,
        title: offer.name || 'Combo manual',
        category: 'Combos',
        qty: 1,
        newPrice: Number(offer.offerPrice || 0),
        product_type: 'quantity',
        isCombo: true,
        isTemporary: true,
        originalOfferId: offer.id || null,
        productsIncluded: Array.isArray(offer.productsIncluded) ? offer.productsIncluded : [],
      });

      setDraftItems((prev) => [...prev, comboItem]);
      return;
    }

    if (canonical.benefitType === 'coupon' || canonical.benefitType === 'discount') {
      const rawValue = Number(canonical.discountValue || offer.discountValue || 0);
      const discountAmount =
        canonical.discountMode === 'percentage'
          ? Math.round((discountBaseTotal * rawValue) / 100)
          : rawValue;

      if (discountAmount <= 0 || discountBaseTotal <= 0) {
        Swal.fire('Descuento inválido', 'Agregá productos al presupuesto antes de aplicar un descuento.', 'warning');
        return;
      }

      const discountItem = createEmptyBudgetItem({
        id: `discount-${offer.id || Date.now()}-${Date.now()}`,
        title:
          canonical.benefitType === 'coupon'
            ? `Cupón ${canonical.couponCode || offer.name || 'Manual'}`
            : offer.name || 'Descuento manual',
        category: canonical.benefitType === 'coupon' ? 'Cupones' : 'Descuentos',
        qty: 1,
        newPrice: -Math.abs(discountAmount),
        product_type: 'quantity',
        isDiscount: true,
        isTemporary: true,
        originalOfferId: offer.id || null,
      });

      setDraftItems((prev) => [...prev, discountItem]);
    }
  };

  const updateDraftItem = (id, field, value) => {
    setDraftItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? item.productId !== null && !item.isTemporary && (field === 'title' || field === 'product_type')
            ? item
            : field === 'product_type'
            ? {
                ...item,
                product_type: value === 'weight' ? 'weight' : 'quantity',
                qty:
                  value === 'weight'
                    ? item.product_type === 'weight'
                      ? Math.max(Number(item.qty) || 0, 100)
                      : 1000
                    : item.product_type === 'weight'
                      ? 1
                      : Math.max(Math.round(Number(item.qty) || 1), 1),
              }
            : {
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

  const resetDraftToZero = async () => {
    const result = await Swal.fire({
      title: 'Volver a 0',
      text: 'Se va a limpiar todo el presupuesto actual. Podés seguir armándolo desde cero.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, limpiar',
      cancelButtonText: 'No',
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#cbd5e1',
      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    setDraftConfig(DEFAULT_BUDGET_CONFIG);
    setDraftItems([]);
    setProductSearch('');
    setSelectedCategory('Todas');
    setMemberSearch('');
    setCatalogLimit(ITEMS_STEP);
    setShowOffersPanel(false);

    try {
      window.localStorage.removeItem(draftStorageKey);
    } catch (error) {
      console.warn('No se pudo limpiar el borrador del presupuesto:', error);
    }
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
      paymentMethod: budgetPaymentSummary,
      paymentBreakdown: normalizedBudgetPaymentLines.map((line) => ({
        id: line.id,
        method: line.method,
        amount: roundBudgetPaymentValue(line.amount || 0),
        installments: line.method === 'Credito' ? Number(line.installments || 1) || 1 : 0,
      })),
      installments: normalizedBudgetPaymentLines.find((line) => line.method === 'Credito')?.installments || 0,
      itemsSnapshot: buildBudgetSnapshot(cleanItems),
      totalAmount: calculateBudgetTotal(cleanItems),
    });

    try {
      window.localStorage.removeItem(draftStorageKey);
    } catch (error) {
      console.warn('No se pudo limpiar el borrador guardado:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm p-2.5 sm:p-3">
      <div className="mx-auto flex h-full max-h-[94vh] w-full max-w-[94rem] flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[12px] bg-indigo-100 text-indigo-700">
              <FileText size={15} />
            </div>
            <div>
              <h2 className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-800">
                {initialRecord ? (initialRecord.type === 'order' ? 'Editar pedido' : 'Editar presupuesto') : 'Crear presupuesto'}
              </h2>
              <p className="text-[10px] font-medium text-slate-500">
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

        <div className="grid min-h-0 flex-1 gap-0 overflow-x-hidden lg:grid-cols-[0.8fr_1.2fr]">
          <div className="min-h-0 border-b border-slate-200 bg-white lg:border-b-0 lg:border-r">
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-slate-200 px-2.5 py-1.5">
                <div className={`flex items-center gap-2 ${fieldShellClass}`}>
                  <Search size={14} className="text-slate-400" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar producto..."
                    className={fieldInputClass}
                  />
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className={`mt-2 ${fieldSelectClass} ${fieldShellClass}`}
                >
                  <option value="Todas">Todas las categorias</option>
                  {(categories || []).map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <div className="mt-2 rounded-[16px] border border-slate-200 bg-white/80 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                        Combos y descuentos
                      </p>
                      <p className="text-[10px] font-medium text-slate-400">
                        Aplicá promociones manuales al presupuesto.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOffersPanel((prev) => !prev)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700 transition hover:bg-emerald-100"
                    >
                      <TicketPercent size={12} />
                      {showOffersPanel ? 'Ocultar' : 'Ver disponibles'}
                    </button>
                  </div>

                  {showOffersPanel && (
                    <div className="mt-2 rounded-[14px] border border-emerald-200 bg-emerald-50/70 p-1.5">
                      <div className="mb-1.5 flex items-center gap-1 rounded-[12px] border border-emerald-200/70 bg-white/75 p-1">
                        <button
                          type="button"
                          onClick={() => setOfferView('combo')}
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] transition ${
                            offerView === 'combo'
                              ? 'bg-emerald-600 text-white'
                              : 'text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          Combos
                        </button>
                        <button
                          type="button"
                          onClick={() => setOfferView('discount')}
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] transition ${
                            offerView === 'discount'
                              ? 'bg-emerald-600 text-white'
                              : 'text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          Cupón y desc.
                        </button>
                      </div>

                      {visibleBudgetOffers.length === 0 ? (
                        <div className="rounded-[12px] border border-dashed border-emerald-200 bg-white/80 px-3 py-3 text-center">
                          <p className="text-[12px] font-bold text-emerald-700">
                            {offerView === 'combo'
                              ? 'No hay combos manuales disponibles.'
                              : 'No hay cupones ni descuentos disponibles.'}
                          </p>
                        </div>
                      ) : (
                        <div className="grid gap-1.5">
                          {visibleBudgetOffers.map((offer) => {
                            const canonical = offer.canonical;
                            const isCombo = canonical.benefitType === 'combo' || canonical.benefitType === 'fixed_price' || offer.applyTo === 'Seleccion';
                            const label = isCombo
                              ? 'Combo'
                              : canonical.benefitType === 'coupon'
                                ? 'Cupón'
                                : 'Descuento';
                            const detail = isCombo
                              ? <FancyPrice amount={Number(offer.offerPrice || 0)} />
                              : canonical.discountMode === 'percentage'
                                ? `${Number(canonical.discountValue || offer.discountValue || 0)}%`
                                : <FancyPrice amount={Number(canonical.discountValue || offer.discountValue || 0)} />;
                            const comboProducts = Array.isArray(offer.productsIncluded) ? offer.productsIncluded.slice(0, 3) : [];
                            const remainingProducts = Array.isArray(offer.productsIncluded) ? Math.max(offer.productsIncluded.length - 3, 0) : 0;

                            return (
                              <button
                                key={`budget-offer-${offer.id}`}
                                type="button"
                                onClick={() => applyOfferToDraft(offer)}
                                className="rounded-[14px] border border-emerald-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-[12px] font-black text-slate-800">{offer.name}</p>
                                    <p className="mt-1 text-[10px] font-semibold text-slate-500">{label}</p>
                                  </div>
                                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                                    {detail}
                                  </span>
                                </div>

                                {isCombo && comboProducts.length > 0 && (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {comboProducts.map((product) => (
                                      <span
                                        key={`${offer.id}-${product.id ?? product.title}`}
                                        className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500"
                                      >
                                        {product.title}
                                      </span>
                                    ))}
                                    {remainingProducts > 0 && (
                                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">
                                        +{remainingProducts}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-1.5 scrollbar-hide" onScroll={handleCatalogScroll}>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {visibleInventory.map((product) => (
                    <button
                      key={`${product.id}-catalog`}
                      type="button"
                      onClick={() => addProductToDraft(product)}
                      className="group overflow-hidden rounded-[18px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(241,245,249,0.96)_100%)] text-left shadow-[0_10px_24px_rgba(148,163,184,0.12)] transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-[0_16px_30px_rgba(99,102,241,0.18)]"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden border-b border-slate-200/80 bg-slate-100">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.title}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(224,231,255,0.9),rgba(226,232,240,0.95))] px-4 text-center text-slate-500">
                            <Package size={26} className="mb-2 text-indigo-400" />
                            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                              Sin imagen
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
                          <span className="rounded-full bg-white/92 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-600 shadow-sm">
                            {getProductCategory(product)}
                          </span>
                          <span className="rounded-full bg-slate-900/75 px-2 py-1 text-[9px] font-black text-white shadow-sm backdrop-blur-sm">
                            {product.product_type === 'weight'
                              ? formatWeight(product.stock)
                              : `${product.stock || 0} u.`}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2 p-2.5">
                        <div className="min-w-0">
                          <p className="min-h-[34px] text-[13px] font-black leading-tight text-slate-800">
                            {product.title}
                          </p>
                          <p className="mt-1 text-[10px] font-semibold text-slate-500">
                            {product.product_type === 'weight' ? 'Venta por peso' : 'Venta por unidad'}
                          </p>
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                              {product.product_type === 'weight' ? 'Precio/Kg' : 'Precio/u'}
                            </p>
                            <span className="mt-0.5 block text-[16px] font-black leading-none text-indigo-700">
                              <FancyPrice
                                amount={
                                  product.product_type === 'weight'
                                    ? (Number(product.price) || 0) * 1000
                                    : product.price
                                }
                              />
                            </span>
                          </div>
                          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-indigo-700 transition group-hover:border-indigo-300 group-hover:bg-indigo-100">
                            Agregar
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 bg-slate-50">
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-slate-200 bg-slate-50 px-2.5 py-1.5">
                <div className="grid gap-1.5 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className={panelShellClass}>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => switchCustomerMode('member')}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] transition ${
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
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] transition ${
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
                      <div className="mt-2">
                        <div className={`flex items-center gap-2 ${fieldShellClass}`}>
                          <Search size={14} className="text-slate-400" />
                          <input
                            type="text"
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                            placeholder="Buscar socio..."
                            className={fieldInputClass}
                          />
                        </div>
                        <div className="mt-1.5 max-h-32 overflow-y-auto overflow-x-hidden rounded-[16px] border border-slate-200/80 bg-slate-100/80 p-1 scrollbar-hide">
                          {filteredMembers.slice(0, 8).map((member) => (
                            <button
                              key={member.id}
                              type="button"
                              onClick={() => selectMember(member)}
                              className={`mb-0.5 w-full rounded-[12px] px-2 py-1 text-left transition ${
                                String(draftConfig.memberId) === String(member.id)
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-white text-slate-700 hover:bg-indigo-50'
                              }`}
                            >
                              <p className="text-[12px] font-black">{member.name}</p>
                              <p className={`text-[10px] font-semibold ${String(draftConfig.memberId) === String(member.id) ? 'text-indigo-100' : 'text-slate-400'}`}>
                                #{member.memberNumber || '---'} {member.phone ? `· ${member.phone}` : ''}
                              </p>
                            </button>
                          ))}
                        </div>
                        {selectedMember && (
                          <div className="mt-1.5 rounded-[14px] border border-indigo-200 bg-indigo-50/90 px-2 py-1 text-[10px] font-semibold text-indigo-700">
                            Socio vinculado: {selectedMember.name}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 grid gap-1.5">
                        <label className={fieldShellClass}>
                          <span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                            <User size={11} />
                            Nombre
                          </span>
                          <input
                            type="text"
                            value={draftConfig.customerName}
                            onChange={(e) => setDraftConfig((prev) => ({ ...prev, customerName: e.target.value }))}
                            className={fieldInputClass}
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
                            className={fieldInputClass}
                          />
                        </label>
                        <label className={fieldShellClass}>
                          <span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                            <StickyNote size={11} />
                            Nota
                          </span>
                          <textarea
                            rows="1"
                            value={draftConfig.customerNote}
                            onChange={(e) => setDraftConfig((prev) => ({ ...prev, customerNote: e.target.value }))}
                            className={`${fieldInputClass} resize-none`}
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  <div className={panelShellClass}>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      <label className={fieldShellClass}>
                        <span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                          <FileText size={11} />
                          Titulo
                        </span>
                        <input
                          type="text"
                          value={draftConfig.documentTitle}
                          onChange={(e) => setDraftConfig((prev) => ({ ...prev, documentTitle: e.target.value.toUpperCase() }))}
                          className={`${fieldInputClass} text-[13px] font-black uppercase`}
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
                          className={fieldInputClass}
                        />
                      </label>
                    </div>

                    {initialRecord?.type !== 'order' && (
                      <div className="mt-1.5 rounded-[16px] border border-fuchsia-200 bg-white/90 p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-fuchsia-700">
                              Pago previsto
                            </p>
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                              {budgetPaymentSummary}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleToggleSplitPayment}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] transition ${
                              draftConfig.isSplitPayment
                                ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
                                : 'border-slate-200 bg-white text-slate-500 hover:border-fuchsia-200 hover:bg-fuchsia-50 hover:text-fuchsia-700'
                            }`}
                          >
                            <Plus size={11} />
                            {draftConfig.isSplitPayment ? 'Quitar pago extra' : 'Agregar otro pago'}
                          </button>
                        </div>

                        <div className="mt-2 grid grid-cols-4 gap-1">
                          {BUDGET_PAYMENT_METHODS.map((method) => {
                            const Icon = method.icon;
                            const isActive = activeBudgetMethod === method.id;
                            return (
                              <button
                                key={`budget-payment-${method.id}`}
                                type="button"
                                onClick={() => handleSelectBudgetPaymentMethod(method.id)}
                                className={`rounded-[12px] border px-2 py-1.5 text-center transition ${
                                  isActive
                                    ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 shadow-sm'
                                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                <Icon size={12} className="mx-auto mb-1" />
                                <span className="block text-[9px] font-black leading-tight">{method.label}</span>
                              </button>
                            );
                          })}
                        </div>

                        {draftConfig.isSplitPayment ? (
                          <>
                            <p className="mt-2 text-[10px] font-medium text-slate-400">
                              El segundo pago completa automáticamente el monto restante.
                            </p>
                            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                              {[
                                { key: 'primary', line: splitPrimaryBudgetLine, index: 0, editable: true },
                                { key: 'secondary', line: splitSecondaryBudgetLine, index: 1, editable: false },
                              ].map(({ key, line, index, editable }) => (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => setActivePaymentLineIndex(index)}
                                  className={`rounded-[14px] border p-2 text-left transition ${
                                    activePaymentLineIndex === index
                                      ? 'border-fuchsia-300 bg-fuchsia-50/60 ring-1 ring-fuchsia-200'
                                      : 'border-slate-200 bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                                      {getPaymentMethodLabel(line?.method)}
                                    </span>
                                    <span className="text-[9px] font-semibold text-slate-400">
                                      {index === 0 ? 'Principal' : 'Restante'}
                                    </span>
                                  </div>
                                  <div className="mt-1.5 rounded-[12px] border border-slate-200 bg-white/80 px-2 py-1.5">
                                    <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Monto</p>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={roundBudgetPaymentValue(line?.amount || 0)}
                                      onChange={editable ? (e) => handlePrimaryPaymentAmountChange(e.target.value) : undefined}
                                      readOnly={!editable}
                                      disabled={!editable}
                                      className={`${fieldNumberClass} mt-1 border-0 bg-transparent px-0 py-0 text-left text-[13px] text-slate-800 shadow-none ${
                                        editable ? '' : 'cursor-not-allowed text-slate-500'
                                      }`}
                                    />
                                  </div>
                                  {line?.method === 'Credito' && (
                                    <select
                                      className="mt-1.5 w-full rounded-[11px] border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 outline-none"
                                      value={Number(line.installments || 1)}
                                      onChange={(e) => handleBudgetInstallmentsChange(index, e.target.value)}
                                    >
                                      <option value={1}>1 pago</option>
                                      <option value={3}>3 cuotas</option>
                                      <option value={6}>6 cuotas</option>
                                      <option value={12}>12 cuotas</option>
                                    </select>
                                  )}
                                </button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="mt-2 rounded-[14px] border border-slate-200 bg-slate-50 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                                {getPaymentMethodLabel(draftConfig.paymentMethod)}
                              </span>
                              <span className="text-[12px] font-black text-slate-800">
                                <FancyPrice amount={budgetTotal} />
                              </span>
                            </div>
                            {draftConfig.paymentMethod === 'Credito' && (
                              <select
                                className="mt-1.5 w-full rounded-[11px] border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 outline-none"
                                value={Number(draftConfig.installments || 1)}
                                onChange={(e) => handleBudgetInstallmentsChange(0, e.target.value)}
                              >
                                <option value={1}>1 pago</option>
                                <option value={3}>3 cuotas</option>
                                <option value={6}>6 cuotas</option>
                                <option value={12}>12 cuotas</option>
                              </select>
                            )}
                          </div>
                        )}

                        {budgetPaymentItems.length > 1 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {budgetPaymentItems.map((item) => (
                              <span
                                key={item.key}
                                className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[9px] font-black text-fuchsia-700"
                              >
                                {item.title}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-1.5 rounded-[16px] border border-emerald-200 bg-emerald-50 px-2 py-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
                        Total congelado
                      </p>
                      <p className="mt-0.5 text-[18px] font-black leading-none text-emerald-700">
                        <FancyPrice amount={budgetTotal} />
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-1.5 scrollbar-hide">
                <div className="mb-1.5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                      Detalle del presupuesto
                    </p>
                    <p className="text-[10px] font-medium text-slate-400">
                      {draftItems.length} item(s) preparados para el documento.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addManualItem}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100/90 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 transition hover:border-slate-300 hover:bg-slate-200/80 hover:text-slate-800"
                  >
                    <Plus size={12} />
                    Item manual
                  </button>
                </div>

                <div className="hidden mb-2 items-center justify-between rounded-[16px] border border-slate-200 bg-white/80 px-2.5 py-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                      Combos y descuentos
                    </p>
                    <p className="text-[10px] font-medium text-slate-400">
                      Aplicá promociones manuales al presupuesto.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOffersPanel((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <TicketPercent size={12} />
                    {showOffersPanel ? 'Ocultar' : 'Ver disponibles'}
                  </button>
                </div>


                <div className="space-y-1">
                  {draftItems.map((item) => {
                    const subtotal = calculateBudgetLineSubtotal(item);
                    const isInventoryItem = item.productId !== null && !item.isTemporary;
                    return (
                      <div
                        key={item.id}
                        className="overflow-hidden rounded-[13px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(241,245,249,0.94)_0%,rgba(236,242,248,0.96)_100%)] px-1.5 py-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
                      >
                        <div className="grid min-w-0 gap-1 sm:grid-cols-[minmax(0,1.52fr)_90px_94px_94px_120px_30px]">
                          <label className={fieldShellClass}>
                            <span className="mb-0.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                              <Package size={11} />
                              Articulo
                            </span>
                            {isInventoryItem ? (
                              <div className={lockedFieldClass}>{item.title}</div>
                            ) : (
                              <input
                                type="text"
                                value={item.title}
                                onChange={(e) => updateDraftItem(item.id, 'title', e.target.value)}
                                className={fieldInputClass}
                              />
                            )}
                          </label>

                          <label className={fieldShellClass}>
                            <span className="mb-0.5 block text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                              Tipo
                            </span>
                            {isInventoryItem ? (
                              <div className={lockedFieldClass}>
                                {item.product_type === 'weight' ? 'Peso' : 'Unidad'}
                              </div>
                            ) : (
                              <select
                                value={item.product_type === 'weight' ? 'weight' : 'quantity'}
                                onChange={(e) => updateDraftItem(item.id, 'product_type', e.target.value)}
                                className={fieldSelectClass}
                              >
                                <option value="quantity">Unidad</option>
                                <option value="weight">Peso</option>
                              </select>
                            )}
                          </label>

                          <label className={fieldShellClass}>
                            <span className="mb-0.5 flex items-center gap-1 whitespace-nowrap text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                              {item.product_type === 'weight' ? 'Peso (g)' : 'Cantidad'}
                              {item.product_type === 'weight' && (
                                <HintIcon
                                  hint={'La cantidad se ingresa en gramos. \n\nEjemplo:\n100g = 0,1kg\n1.000g = 1kg\n10.000g = 10kg'}
                                  size={13}
                                />
                              )}
                            </span>
                            <input
                              type="number"
                              min={item.product_type === 'weight' ? '100' : '1'}
                              step={item.product_type === 'weight' ? '100' : '1'}
                              value={item.qty}
                              onChange={(e) => updateDraftItem(item.id, 'qty', e.target.value)}
                              className={quantityInputClass}
                            />
                          </label>

                          <label className={fieldShellClass}>
                            <span className="mb-0.5 flex items-center gap-1 whitespace-nowrap text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                              {item.product_type === 'weight' ? 'Precio/Kg' : 'Precio/u'}
                              {item.product_type === 'weight' && (
                                <HintIcon
                                  hint={'Es el precio por Kilo.\n\nEjemplo: \nsi ponés 2800, el kilo vale $2.800,00.'}
                                  size={13}
                                />
                              )}
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.newPrice}
                              onChange={(e) => updateDraftItem(item.id, 'newPrice', e.target.value)}
                              className={fieldNumberClass}
                            />
                          </label>

                          <div className="rounded-[13px] border border-emerald-200 bg-emerald-50 px-2 py-[3px]">
                            <span className="mb-0.5 block text-[10px] font-black uppercase tracking-[0.1em] text-emerald-500">
                              Subtotal
                            </span>
                            <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                              <span className="text-center text-[12px] font-black text-emerald-700">
                                {formatCurrency(subtotal)}
                              </span>
                              <span className="text-center text-[9px] font-semibold text-emerald-600">
                                {formatBudgetItemQuantity(item)}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeDraftItem(item.id)}
                            className="flex h-full min-h-[38px] items-center justify-center rounded-[12px] border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {draftItems.length === 0 && (
                    <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-100/80 px-4 py-8 text-center">
                      <p className="text-[13px] font-bold text-slate-500">
                        Agregá productos desde el catálogo para empezar el presupuesto.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 bg-white px-3 py-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                      Total del documento
                    </p>
                    <p className="text-[22px] font-black leading-none text-slate-800">
                      <FancyPrice amount={budgetTotal} />
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!initialRecord && (
                      <button
                        type="button"
                        onClick={resetDraftToZero}
                        className="rounded-[16px] border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-[12px] font-bold text-amber-700 transition hover:bg-amber-100"
                      >
                        Volver a 0
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-[16px] border border-slate-200 bg-slate-100/90 px-3.5 py-1.5 text-[12px] font-bold text-slate-600 transition hover:bg-slate-200/80"
                    >
                      Cancelar
                    </button>
                    <AsyncActionButton
                      type="button"
                      onAction={handleSubmit}
                      pending={isSaving}
                      disabled={isSaving}
                      loadingLabel="Guardando..."
                      className="rounded-[16px] bg-indigo-600 px-3.5 py-1.5 text-[12px] font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving ? 'Guardando...' : initialRecord ? 'Guardar cambios' : 'Guardar presupuesto'}
                    </AsyncActionButton>
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
