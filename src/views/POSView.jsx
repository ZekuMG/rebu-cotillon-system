import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle,
  Package,
  X,
  SlidersHorizontal,
  LayoutGrid,
  List,
  ScanBarcode,
  User, 
  Gift,
  UserMinus,
  Scale,
  Edit2,
  Wand2,
  AlertTriangle,
  TicketPercent // Icono para ofertas
} from 'lucide-react';
import Swal from 'sweetalert2'; // Para las alertas inteligentes
import { PAYMENT_METHODS } from '../data';
import { formatWeight } from '../utils/helpers';
import { FancyPrice } from '../components/FancyPrice';
import { HintIcon } from '../components/HintIcon';
import { normalizeLegacyOffer } from '../utils/offerHelpers';

const POS_BATCH_SIZE = 50;

const isProductExpired = (dateString) => {
  if (!dateString) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = dateString.split('-');
  const expDate = new Date(year, month - 1, day);
  return expDate.getTime() < today.getTime();
};

const WeightInputModal = ({ product, effectiveStock, onConfirm, onClose }) => {
  const [grams, setGrams] = useState('');
  const gramsNum = parseInt(grams) || 0;
  const totalPrice = gramsNum * (Number(product.price) || 0);
  const isValid = gramsNum > 0 && gramsNum <= effectiveStock;
  const quickAmounts = [50, 100, 250, 500, 1000];
  
  const expired = isProductExpired(product.expiration_date);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200">
        <div className="p-4 bg-amber-50 border-b border-amber-100 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Scale size={18} className="text-amber-600" />
            <h3 className="font-bold text-amber-800">Producto por Peso</h3>
          </div>
          <button onClick={onClose}><X size={18} className="text-amber-400 hover:text-amber-600" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-slate-100 overflow-hidden border shrink-0 relative">
              {product.image ? (
                <img src={product.image} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-200 text-[9px] font-bold text-slate-400 text-center p-1">{product.title.slice(0, 12)}</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-slate-800 text-sm truncate">
                {product.title}
                {expired && <span className="ml-2 text-[8px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded uppercase font-bold border border-red-200 align-middle">Vencido</span>}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-amber-600 font-bold"><FancyPrice amount={product.price * 1000} />/kg</span>
                <span className="text-[10px] text-slate-400">•</span>
                <span className="text-[10px] text-slate-500">Disponible: {formatWeight(effectiveStock)}</span>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Cantidad (gramos)</label>
            <input type="number" min="1" max={effectiveStock} step="1" autoFocus placeholder="Ej: 105" className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-center text-2xl font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" value={grams} onChange={(e) => setGrams(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && isValid) onConfirm(gramsNum); }} />
            {gramsNum > effectiveStock && (
              <p className="text-[10px] text-red-500 mt-1 text-center font-bold">Stock insuficiente (máx: {formatWeight(effectiveStock)})</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {quickAmounts.filter(a => a <= effectiveStock).map((amount) => (
              <button key={amount} type="button" onClick={() => setGrams(String(amount))} className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${gramsNum === amount ? 'bg-amber-100 border-amber-400 text-amber-700' : 'bg-white border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600'}`}>
                {amount >= 1000 ? `${amount / 1000}kg` : `${amount}g`}
              </button>
            ))}
          </div>
          {gramsNum > 0 && (
            <div className="bg-slate-50 rounded-xl p-3 border text-center">
              <p className="text-[10px] text-slate-400 uppercase font-bold">Total estimado</p>
              <p className="text-2xl font-black text-slate-900"><FancyPrice amount={totalPrice} /></p>
              <p className="text-[10px] text-slate-500">{formatWeight(gramsNum)} × <FancyPrice amount={product.price * 1000} />/kg</p>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
            <button onClick={() => isValid && onConfirm(gramsNum)} disabled={!isValid} className={`flex-1 py-3 rounded-xl font-bold transition-colors ${isValid ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-md' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
              Agregar {gramsNum > 0 ? formatWeight(gramsNum) : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CustomProductModal = ({ isOpen, onClose, onConfirm }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('quantity'); 
  const [price, setPrice] = useState(''); 
  const [amount, setAmount] = useState(''); 

  if (!isOpen) return null;

  const p = Number(price) || 0;
  const a = Number(amount) || 0;
  const isValid = title.trim().length > 0 && p > 0 && a > 0;
  
  const totalEstimado = type === 'quantity' ? (p * a) : ((p / 1000) * a);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;

    const customId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    const customProduct = {
      id: customId,
      title: `* ${title.trim()}`, 
      price: type === 'weight' ? p / 1000 : p,
      product_type: type,
      stock: 999999, // Ficticio para que no joda
      isCustom: true
    };

    onConfirm(customProduct, a);
    
    setTitle('');
    setType('quantity');
    setPrice('');
    setAmount('');
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200">
        <div className="p-4 bg-fuchsia-50 border-b border-fuchsia-100 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-fuchsia-600" />
            <h3 className="font-bold text-fuchsia-800">Artículo Personalizado</h3>
          </div>
          <button onClick={onClose}><X size={18} className="text-fuchsia-400 hover:text-fuchsia-600" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nombre del Artículo *</label>
            <input 
              type="text" 
              autoFocus 
              required
              placeholder="Ej: Globo suelto" 
              className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none font-bold text-slate-800" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Tipo de Venta</label>
            <div className="flex bg-slate-100 p-1 rounded-lg border h-[42px] items-center">
              <button
                type="button"
                onClick={() => { setType('quantity'); setAmount(''); setPrice(''); }}
                className={`flex-1 h-full rounded-md text-sm font-bold transition-all flex items-center justify-center gap-1 ${type === 'quantity' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Package size={14}/> Unidad
              </button>
              <button
                type="button"
                onClick={() => { setType('weight'); setAmount(''); setPrice(''); }}
                className={`flex-1 h-full rounded-md text-sm font-bold transition-all flex items-center justify-center gap-1 ${type === 'weight' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Scale size={14}/> Peso
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                {type === 'quantity' ? 'Precio Unit. ($)' : 'Precio x Kg ($)'} *
              </label>
              <input 
                type="number" 
                min="1" 
                step="1" 
                required
                placeholder="0" 
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-fuchsia-500 outline-none font-bold text-slate-800" 
                value={price} 
                onChange={(e) => setPrice(e.target.value)} 
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                {type === 'quantity' ? 'Cantidad (u)' : 'Peso (gramos)'} *
              </label>
              <input 
                type="number" 
                min="1" 
                step="1" 
                required
                placeholder="0" 
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-fuchsia-500 outline-none font-bold text-slate-800" 
                value={amount} 
                onChange={(e) => setAmount(e.target.value)} 
              />
            </div>
          </div>

          {totalEstimado > 0 && (
            <div className="bg-slate-50 rounded-xl p-3 border text-center mt-2">
              <p className="text-[10px] text-slate-400 uppercase font-bold">Total del artículo</p>
              <p className="text-2xl font-black text-slate-900"><FancyPrice amount={totalEstimado} /></p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl font-bold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
            <button type="submit" disabled={!isValid} className={`flex-1 py-3 rounded-xl font-bold transition-colors ${isValid ? 'bg-fuchsia-600 text-white hover:bg-fuchsia-700 shadow-md' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
              Agregar al Carrito
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default function POSView({
  inventory, categories, addToCart, cart, removeFromCart, updateCartItemQty,
  selectedPayment, setSelectedPayment, installments, setInstallments,
  calculateTotal, handleCheckout, posSearch, setPosSearch,
  selectedCategory, setSelectedCategory, posViewMode, setPosViewMode,
  gridColumns, setGridColumns, selectedClient, setSelectedClient,
  onOpenMemberPanel,
  onOpenClientModal,
  onOpenRedemptionModal,
  transactions = [],
  offers = [], // Recibimos las ofertas
  currentUser: _currentUser = null,
  userCatalog: _userCatalog = null,
}) {
  const [showGridMenu, setShowGridMenu] = useState(false);
  const cashReceivedInputRef = useRef(null);
  const [weightModalProduct, setWeightModalProduct] = useState(null);
  const [editingWeightItemId, setEditingWeightItemId] = useState(null);
  const [editingWeightValue, setEditingWeightValue] = useState('');
  
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isOffersDrawerOpen, setIsOffersDrawerOpen] = useState(false); // Modal de combos

  const [isDiscountDrawerOpen, setIsDiscountDrawerOpen] = useState(false);
  const [customDiscountPercent, setCustomDiscountPercent] = useState('');
  const [visibleCount, setVisibleCount] = useState(POS_BATCH_SIZE);
  const [cashReceivedInput, setCashReceivedInput] = useState('');

  const openMemberSelectPanel = () => {
    if (onOpenMemberPanel) {
      onOpenMemberPanel({ initialMode: 'member', initialFocus: 'select' });
      return;
    }
    onOpenClientModal?.();
  };

  const openMemberRedeemPanel = () => {
    if (onOpenMemberPanel) {
      onOpenMemberPanel({ initialMode: 'member', initialFocus: 'redeem' });
      return;
    }
    onOpenRedemptionModal?.();
  };

  const openGuestPanel = () => {
    if (onOpenMemberPanel) {
      onOpenMemberPanel({ initialMode: 'guest', initialFocus: 'select' });
      return;
    }
    onOpenClientModal?.();
  };

  useEffect(() => {
    setVisibleCount(POS_BATCH_SIZE);
  }, [posSearch, selectedCategory]);

  useEffect(() => {
    if (selectedPayment === 'Efectivo') {
      setCashReceivedInput('');
      setTimeout(() => cashReceivedInputRef.current?.focus(), 0);
      return;
    }

    if (selectedPayment !== 'Efectivo') {
      setCashReceivedInput('');
    }
  }, [selectedPayment]);

  useEffect(() => {
    if (cart.length === 0 && selectedPayment === 'Efectivo') {
      setCashReceivedInput('');
    }
  }, [cart.length, selectedPayment]);

  const extractCouponCodeFromItem = (item) => {
    const title = String(item?.title || '');
    const description = String(item?.description || '');
    const couponMatch =
      title.match(/cup[oó]n\s+([a-z0-9_-]+)/i) ||
      description.match(/cup[oó]n\s+([a-z0-9_-]+)/i);

    return couponMatch ? String(couponMatch[1]).trim().toUpperCase() : '';
  };

  const selectedClientUsedCoupons = useMemo(() => {
    if (!selectedClient || selectedClient.id === 'guest') return new Set();

    if (Array.isArray(selectedClient.usedCoupons) && selectedClient.usedCoupons.length > 0) {
      return new Set(selectedClient.usedCoupons.map((code) => String(code).trim().toUpperCase()).filter(Boolean));
    }

    const memberId = String(selectedClient.id || '');
    const memberNumber = String(selectedClient.memberNumber || '');

    const usedCodes = (transactions || []).flatMap((tx) => {
      if (tx.status === 'voided' || !tx.client) return [];

      const sameClient =
        String(tx.client?.id || '') === memberId ||
        String(tx.client?.memberNumber || '') === memberNumber;

      if (!sameClient) return [];

      return (tx.items || [])
        .map((item) => extractCouponCodeFromItem(item))
        .filter(Boolean);
    });

    return new Set(usedCodes);
  }, [selectedClient, transactions]);

  const getEffectiveStock = (productId, originalStock) => {
    // Si el item es custom, combo, o de descuento, NO revisamos contra el stock original
    // (Ya que el stock original suele ser undef o 0 o no importa para estos items)
    if (String(productId).startsWith('custom_') || String(productId).startsWith('combo_') || String(productId).startsWith('desc_')) {
      return 999999;
    }

    const itemInCart = cart.find(item => item.id === productId && !item.isReward && !item.isCustom && !item.isCombo && !item.isDiscount);
    const qtyInCart = itemInCart ? itemInCart.quantity : 0;
    return originalStock - qtyInCart;
  };

  const handleProductClick = (product) => {
    if (product.product_type === 'weight') {
      const effectiveStock = getEffectiveStock(product.id, product.stock);
      if (effectiveStock <= 0) return;
      setWeightModalProduct(product);
    } else {
      addToCart(product);
    }
  };

  const handleWeightConfirm = (grams) => {
    if (weightModalProduct) {
      addToCart(weightModalProduct, grams);
      setWeightModalProduct(null);
    }
  };

  const handleCustomConfirm = (customProduct, amount) => {
    addToCart(customProduct, amount);
  };

  // AGREGAR OFERTA AL CARRITO
  const getDiscountBaseTotal = () =>
    cart.reduce((acc, item) => {
      if (item.isDiscount) return acc;
      return acc + (Number(item.price) || 0) * (Number(item.quantity) || 0);
    }, 0);

  const parseOfferNumericValue = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value !== 'string') return Number(value) || 0;

    const trimmedValue = value.trim();
    if (!trimmedValue) return 0;

    const normalizedValue =
      trimmedValue.includes(',') && trimmedValue.includes('.')
        ? trimmedValue.replace(/\./g, '').replace(',', '.')
        : trimmedValue.replace(',', '.');

    return Number(normalizedValue) || 0;
  };

  const handleApplyManualDiscount = (percentageValue) => {
    const percentage = Number(percentageValue);
    const baseTotal = getDiscountBaseTotal();

    if (!percentage || percentage <= 0 || baseTotal <= 0) return;

    const discountAmount = Math.round((baseTotal * percentage) / 100);
    if (discountAmount <= 0) return;

    addToCart({
      id: `desc_manual_${percentage}_${Date.now()}`,
      title: `Descuento manual ${percentage}%`,
      price: -discountAmount,
      quantity: 1,
      isCustom: true,
      isDiscount: true,
      product_type: 'quantity',
      description: `${percentage}% sobre el pedido actual`,
      stock: 999999
    }, 1);

    setCustomDiscountPercent('');
    setIsDiscountDrawerOpen(false);
  };

  const handleApplyOfferDiscount = (offer) => {
    const canonical = offer?.canonical || normalizeLegacyOffer(offer, productsByCategory, inventory);
    const baseTotal = getDiscountBaseTotal();
    const offerId = offer?.id ?? canonical?.couponCode ?? offer?.name;
    const configuredDiscountValue = parseOfferNumericValue(canonical?.discountValue ?? offer?.discountValue ?? 0);
    const couponCode = String(canonical?.couponCode || '').trim().toUpperCase();

    if (baseTotal <= 0) return { ok: false, reason: 'no_base' };
    if (canonical?.benefitType === 'coupon' && couponCode && selectedClientUsedCoupons.has(couponCode)) {
      return { ok: false, reason: 'used_before', couponCode };
    }
    if (
      offerId &&
      cart.some((item) => item.isDiscount && String(item.originalOfferId) === String(offerId))
    ) {
      return { ok: false, reason: 'duplicate' };
    }

    const rawDiscount =
      canonical.discountMode === 'percentage'
        ? Math.round((baseTotal * configuredDiscountValue) / 100)
        : configuredDiscountValue;

    const discountAmount = Math.min(baseTotal, rawDiscount);
    if (discountAmount <= 0) return { ok: false, reason: 'invalid' };

    const discountLabel =
      canonical.benefitType === 'coupon'
        ? `Cupón ${canonical.couponCode || offer.name}`
        : `Descuento ${offer.name}`;

    addToCart({
      id: `desc_offer_${offerId}_${Date.now()}`,
      title: discountLabel,
      price: -discountAmount,
      quantity: 1,
      isCustom: true,
      isDiscount: true,
      originalOfferId: offerId,
      product_type: 'quantity',
      description:
        canonical.discountMode === 'percentage'
          ? `${offer.name} (${configuredDiscountValue}% sobre el pedido)`
          : `${offer.name} (-$${discountAmount.toLocaleString('es-AR')})`,
      stock: 999999
    }, 1);

    setPosSearch('');
    setIsDiscountDrawerOpen(false);
    return { ok: true };
  };

  const handleApplySearchOffer = (offer) => {
    if (offer.canonical.benefitType === 'combo' || offer.applyTo === 'Seleccion') {
      handleAddComboToCart(offer);
      return;
    }

    const result = handleApplyOfferDiscount(offer);
    if (!result.ok) showOfferApplyError(result);
  };

  const showOfferApplyError = (result) => {
    Swal.fire({
      title: 'No se pudo aplicar',
      text:
        result.reason === 'no_base'
          ? 'Primero agrega productos al pedido para usar descuentos o cupones.'
          : result.reason === 'used_before'
          ? `El codigo ${result.couponCode || 'del cupon'} ya fue utilizado anteriormente por este socio.`
          : result.reason === 'duplicate'
          ? 'Ese descuento o cupon ya fue aplicado al pedido actual.'
          : 'Ese descuento o cupon no tiene un valor valido.',
      icon: 'warning',
      confirmButtonColor: '#059669',
    });
  };

  const getComboAvailability = (offer) => {
    const requiredByProduct = (offer?.productsIncluded || []).reduce((acc, product) => {
      const productId = String(product.id);
      acc[productId] = {
        product,
        requiredQty: (acc[productId]?.requiredQty || 0) + 1,
      };
      return acc;
    }, {});

    const lines = Object.values(requiredByProduct).map(({ product, requiredQty }) => {
      const inventoryProduct = (inventory || []).find((item) => String(item.id) === String(product.id));
      const remainingStock = inventoryProduct
        ? Math.max(0, getEffectiveStock(inventoryProduct.id, Number(inventoryProduct.stock) || 0))
        : 0;

      return {
        ...product,
        requiredQty,
        remainingStock,
        hasStock: remainingStock >= requiredQty,
      };
    });

    const availableBundles = lines.length > 0
      ? Math.min(...lines.map((line) => Math.floor(line.remainingStock / line.requiredQty)))
      : 0;

    return {
      lines,
      availableBundles: Number.isFinite(availableBundles) ? Math.max(0, availableBundles) : 0,
      isAvailable: lines.length > 0 && lines.every((line) => line.hasStock),
    };
  };

  const handleAddComboToCart = (offer) => {
    const availability = getComboAvailability(offer);
    if (!availability.isAvailable) {
      Swal.fire({
        title: 'Combo sin stock suficiente',
        text: 'Uno o mas productos del combo no tienen stock disponible para venderlo.',
        icon: 'warning',
        confirmButtonColor: '#7c3aed',
      });
      return;
    }

    const comboId = `combo_${Date.now()}`;
    const comboItem = {
      id: comboId,
      title: `🎫 ${offer.name} (${offer.type})`,
      price: Number(offer.offerPrice),
      quantity: 1,
      isCombo: true,
      originalOfferId: offer.id,
      product_type: 'quantity',
      productsIncluded: offer.productsIncluded, // Guardamos qué contiene para luego descontar stock en checkout
      stock: 999999 // Ficticio para evitar alertas
    };

    addToCart(comboItem, 1);
    setIsOffersDrawerOpen(false);
    
    // (Opcional: Mostrar alerta si falta stock de alguno de los items del combo)
  };

  const handleSaveWeightEdit = (itemId) => {
    const newGrams = parseInt(editingWeightValue);
    if (!isNaN(newGrams) && newGrams > 0) {
      updateCartItemQty(itemId, newGrams);
    }
    setEditingWeightItemId(null);
    setEditingWeightValue('');
  };

  // AUTO-CHEQUEO INTELIGENTE DE OFERTAS
  const checkSmartDiscounts = () => {
    const applicableOffers = [];

    // 1. Agrupamos cantidades del carrito por ID (ignorando premios o combos ya armados)
    const cartQtyMap = {};
    cart.forEach(item => {
      if (!item.isReward && !item.isCustom && !item.isCombo && !item.isDiscount) {
        cartQtyMap[item.id] = (cartQtyMap[item.id] || 0) + item.quantity;
      }
    });

    // 2. Evaluamos cada oferta activa
    offers.forEach(offer => {
      if (offer.applyTo === 'Seleccion') return; // Ignoramos los Combos manuales

      // Evitamos aplicar la misma oferta 2 veces si ya está el ítem de descuento
      const alreadyApplied = cart.some(c => c.isDiscount && c.originalOfferId === offer.id);
      if (alreadyApplied) return; 

      // Evaluador MULTI-BUY (2x1, 3x2, etc)
      if (['2x1', '3x1', '3x2', '4x2', '4x3'].includes(offer.type)) {
        let matchCount = 0;
        let applicableItems = [];
        
        offer.productsIncluded.forEach(op => {
          if (cartQtyMap[op.id]) {
            matchCount += cartQtyMap[op.id];
            applicableItems.push({ ...op, inCart: cartQtyMap[op.id] });
          }
        });

        const [req, pay] = offer.type.split('x').map(Number); // ej: 3x2 -> req=3, pay=2
        
        if (matchCount >= req) {
           const timesApplied = Math.floor(matchCount / req);
           const freeItemsCount = timesApplied * (req - pay);
           
           // Ordenamos de menor a mayor precio para descontar los más baratos (lógica comercial estándar)
           applicableItems.sort((a, b) => a.price - b.price);
           let discountAmount = 0;
           let freeItemsLeft = freeItemsCount;
           
           applicableItems.forEach(item => {
              if (freeItemsLeft > 0) {
                 const deductQty = Math.min(item.inCart, freeItemsLeft);
                 discountAmount += deductQty * item.price;
                 freeItemsLeft -= deductQty;
              }
           });

           if (discountAmount > 0) {
             applicableOffers.push({
               id: `desc_${offer.id}_${Date.now()}`,
               title: `🎁 Promo ${offer.type}: ${offer.name}`,
               price: -discountAmount, // Precio negativo para restar al total
               quantity: 1,
               isCustom: true, // Ignora validación de stock
               isDiscount: true,
               originalOfferId: offer.id,
               product_type: 'quantity',
               description: `Aplicar ${offer.type} en ${offer.name} (-$${discountAmount.toLocaleString('es-AR')})`,
               stock: 999999
             });
           }
        }
      }
      
      // Evaluador MAYORISTA
      if (offer.type === 'Mayorista') {
         offer.productsIncluded.forEach(op => {
            if (cartQtyMap[op.id] >= offer.itemsCount) {
               const currentPriceInCart = cart.find(c => c.id === op.id)?.price;
               if (currentPriceInCart > offer.offerPrice) {
                  const diff = currentPriceInCart - offer.offerPrice;
                  const discountAmount = diff * cartQtyMap[op.id];
                  applicableOffers.push({
                     id: `desc_mayo_${op.id}_${Date.now()}`,
                     title: `💎 Mayorista: ${op.title}`,
                     price: -discountAmount,
                     quantity: 1,
                     isCustom: true,
                     isDiscount: true,
                     originalOfferId: offer.id,
                     product_type: 'quantity',
                     description: `Precio Mayorista en ${op.title} (-$${discountAmount.toLocaleString('es-AR')})`,
                     stock: 999999
                  });
               }
            }
         });
      }
    });

    // 3. Si hay ofertas aplicables, frenamos el flujo y preguntamos
    if (applicableOffers.length > 0) {
       let htmlContent = '<ul style="text-align:left; font-size:14px; margin-top:10px; color:#475569;">';
       applicableOffers.forEach(o => {
          htmlContent += `<li style="margin-bottom:4px;">✅ <b>${o.description}</b></li>`;
       });
       htmlContent += '</ul>';

       Swal.fire({
          title: '¡Ofertas Detectadas!',
          html: `El sistema detectó descuentos aplicables a este carrito:${htmlContent}`,
          icon: 'info',
          showCancelButton: true,
          confirmButtonText: 'Aplicar Descuentos',
          cancelButtonText: 'No, continuar así',
          confirmButtonColor: '#8b5cf6', 
          cancelButtonColor: '#94a3b8'
       }).then((result) => {
          if (result.isConfirmed) {
             // Inyectamos los descuentos al carrito
             applicableOffers.forEach(discountItem => {
                addToCart(discountItem);
             });
             // Mensaje de éxito e interrupción para que el Usuario de Caja vea el carrito actualizado
             Swal.fire({
               title: '¡Aplicado!',
               text: 'Revisa el total actualizado y presiona Cobrar nuevamente.',
               icon: 'success',
               timer: 2000,
               showConfirmButton: false
             });
          } else if (result.dismiss === Swal.DismissReason.cancel) {
             // El usuario decidió no aplicarlos, seguimos al cobro normal
             proceedToCheckoutFlow();
          }
       });
       return true; // Retornamos true para pausar el handlePreCheckout
    }
    return false; // No hay ofertas, sigue de largo
  };

  const proceedToCheckoutFlow = () => {
    if (selectedPayment === 'Efectivo' && cashReceivedInput.trim() !== '' && cashReceivedAmount < total) {
      Swal.fire('Monto insuficiente', 'El monto recibido en efectivo debe cubrir el total de la compra.', 'warning');
      return;
    }
    if (cart.length > 0 && !selectedClient) {
      openGuestPanel();
    } else {
      handleCheckout({
        cashReceived: selectedPayment === 'Efectivo' ? cashReceivedAmount : null,
        cashChange: selectedPayment === 'Efectivo' ? cashChangeAmount : 0,
      });
    }
  };

  const handlePreCheckout = () => {
    const hasDiscountsPending = checkSmartDiscounts();
    if (hasDiscountsPending) return; // Pausa
    proceedToCheckoutFlow(); // Sigue
  };

  const filteredProducts = useMemo(() => {
    const searchString = (posSearch || '').toLowerCase().trim();
    const searchWords = searchString ? searchString.split(/\s+/) : [];

    return (inventory || []).filter((product) => {
      const matchesSearch = searchWords.length === 0 || searchWords.every(word =>
        (product.title || '').toLowerCase().includes(word) ||
        String(product.id).toLowerCase().includes(word) ||
        (product.barcode && String(product.barcode).toLowerCase().includes(word))
      );

      const matchesCategory =
        selectedCategory === 'Todas' ||
        (Array.isArray(product.categories)
          ? product.categories.includes(selectedCategory)
          : product.category === selectedCategory);

      return matchesSearch && matchesCategory;
    });
  }, [inventory, posSearch, selectedCategory]);

  const handleScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 400) {
      if (visibleCount < filteredProducts.length) {
        setVisibleCount((prev) => prev + POS_BATCH_SIZE);
      }
    }
  };

  const displayedProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );
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
  const normalizedPosOffers = useMemo(
    () =>
      (offers || []).map((offer) => {
        const canonical = normalizeLegacyOffer(offer, productsByCategory, inventory);
        return {
          ...offer,
          canonical,
          couponCode: canonical.couponCode || '',
        };
      }),
    [offers, productsByCategory, inventory]
  );
  const selectableOffers = useMemo(
    () => offers.filter((offer) => offer.applyTo === 'Seleccion'),
    [offers]
  );
  const selectableDiscountOffers = useMemo(
    () =>
      normalizedPosOffers.filter((offer) =>
        offer.canonical.benefitType === 'coupon' ||
        (offer.canonical.benefitType === 'discount' &&
          (offer.canonical.scopeMode === 'all_products' || (offer.productsIncluded || []).length === 0))
      ),
    [normalizedPosOffers]
  );
  const matchingPosOffers = useMemo(() => {
    const search = posSearch.trim().toLowerCase();
    if (!search) return [];

    return normalizedPosOffers.filter((offer) =>
      offer.name.toLowerCase().includes(search) ||
      offer.couponCode.toLowerCase().includes(search)
    );
  }, [normalizedPosOffers, posSearch]);

  const handlePosSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return;

    const search = posSearch.trim().toLowerCase();
    if (!search) return;

    const exactMatch = normalizedPosOffers.find((offer) =>
      offer.name.toLowerCase() === search || offer.couponCode.toLowerCase() === search
    );

    if (!exactMatch) return;

    e.preventDefault();
    handleApplySearchOffer(exactMatch);
  };

  const subtotal = cart.reduce((t, i) => t + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
  const total = calculateTotal();
  const hasTypedCashAmount = cashReceivedInput.trim() !== '';
  const cashReceivedAmount = selectedPayment === 'Efectivo'
    ? (!hasTypedCashAmount ? total : Number(cashReceivedInput || 0))
    : total;
  const cashChangeAmount = selectedPayment === 'Efectivo'
    ? Math.max(0, cashReceivedAmount - total)
    : 0;
  const cashMissingAmount = selectedPayment === 'Efectivo'
    ? (hasTypedCashAmount ? Math.max(0, total - cashReceivedAmount) : 0)
    : 0;
  const pointsToEarn = Math.floor(Math.max(0, total) / 500);
  const discountBaseTotal = getDiscountBaseTotal();
  const isGuestSelectedClient = Boolean(selectedClient && (selectedClient.id === 'guest' || selectedClient.id === 0));
  const hasVisibleSelectedClient = Boolean(selectedClient);

  return (
    <div className="flex h-full overflow-hidden bg-slate-100 relative">
      
      {/* COLUMNA IZQUIERDA: CATÁLOGO */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        
        {/* Header POS */}
        <div className="p-3 bg-white border-b shrink-0 flex gap-2.5 items-center z-30 relative">
          
          {/* BOTÓN DE OFERTAS */}
          <div className="flex items-center gap-2 shrink-0">
            {selectableOffers.length > 0 && (
              <button 
                onClick={() => setIsOffersDrawerOpen(true)}
                className="bg-violet-100 hover:bg-violet-200 text-violet-700 border border-violet-200 px-2.5 py-2.5 rounded-xl font-black flex items-center gap-1.5 shadow-sm transition-colors"
                title="Ver Combos y Ofertas"
              >
                <TicketPercent size={20} />
                <span className="hidden md:inline uppercase text-xs tracking-wider">Combos</span>
              </button>
            )}
            <button
              onClick={() => setIsDiscountDrawerOpen(true)}
              disabled={discountBaseTotal <= 0}
              className={`px-2.5 py-2.5 rounded-xl font-black flex items-center gap-1.5 shadow-sm border transition-colors ${
                discountBaseTotal > 0
                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
              }`}
              title={discountBaseTotal > 0 ? 'Aplicar descuento manual' : 'Agrega productos para habilitar descuentos'}
            >
              <TicketPercent size={20} />
              <span className="hidden md:inline uppercase text-xs tracking-wider">Descuentos</span>
            </button>
          </div>

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input type="text" placeholder="Buscar producto, oferta o cupon..." className="w-full pl-10 pr-3 py-2.5 border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-fuchsia-500 outline-none transition-all font-medium text-sm" value={posSearch} onChange={(e) => setPosSearch(e.target.value)} onKeyDown={handlePosSearchKeyDown} autoFocus />
          </div>
          <div className="w-36 relative hidden sm:block">
            <select className="w-full px-3 py-2.5 border rounded-xl bg-slate-50 font-medium text-sm outline-none focus:ring-2 focus:ring-fuchsia-500 appearance-none cursor-pointer" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              <option value="Todas">Categorías</option>
              {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">▼</div>
          </div>
          <div className="flex items-center gap-2">
            {posViewMode === 'grid' && (
              <div className="relative">
                <button onClick={() => setShowGridMenu(!showGridMenu)} className={`p-2.5 rounded-xl border transition-all ${showGridMenu ? 'bg-slate-100 ring-2 ring-slate-200' : 'bg-white hover:bg-slate-50'}`}><SlidersHorizontal size={18} className="text-slate-600" /></button>
                {showGridMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowGridMenu(false)}></div>
                    <div className="absolute top-full right-0 mt-2 w-60 bg-white rounded-xl shadow-2xl border border-slate-200 p-5 z-50 animate-in fade-in zoom-in-95">
                      <div className="flex justify-between items-center mb-4"><span className="text-xs font-bold text-slate-500 uppercase">Tamaño</span><span className="text-xs font-bold text-fuchsia-600 bg-fuchsia-50 px-2 py-1 rounded-md border border-fuchsia-100">{gridColumns}x</span></div>
                      <div className="relative h-6 flex items-center"><input type="range" min="4" max="10" step="1" value={gridColumns} onChange={(e) => setGridColumns(Number(e.target.value))} className="custom-range w-full" /></div>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="flex bg-slate-100 p-1 rounded-xl border h-[42px] items-center">
              <button onClick={() => setPosViewMode('grid')} className={`p-2 rounded-lg transition-all h-full flex items-center ${posViewMode === 'grid' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={18} /></button>
              <button onClick={() => setPosViewMode('list')} className={`p-2 rounded-lg transition-all h-full flex items-center ${posViewMode === 'list' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><List size={18} /></button>
            </div>
          </div>
        </div>

        {/* Grid / Lista de Productos con onScroll */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar bg-slate-100/50" onScroll={handleScroll}>
          {matchingPosOffers.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Coincidencias en ofertas y descuentos</p>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {matchingPosOffers.map((offer) => (
                  <button
                    key={`match-${offer.id}`}
                    type="button"
                    onClick={() => handleApplySearchOffer(offer)}
                    className={`rounded-xl border px-2.5 py-2.5 text-left shadow-sm transition-all ${
                      offer.canonical.benefitType === 'combo'
                        ? 'border-violet-200 bg-violet-50 hover:bg-violet-100'
                        : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-black text-slate-900">{offer.name}</p>
                        <p className="mt-1 text-[11px] font-medium text-slate-500">
                          {offer.canonical.benefitType === 'coupon'
                            ? `Código: ${offer.couponCode || 'SIN-CODIGO'}`
                            : offer.canonical.benefitType === 'discount'
                            ? 'Descuento manual'
                            : 'Combo disponible'}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                        offer.canonical.benefitType === 'combo'
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {offer.canonical.benefitType === 'combo'
                          ? 'Combo'
                          : offer.canonical.discountMode === 'percentage'
                          ? `${Number(offer.canonical.discountValue || offer.discountValue || 0)}%`
                          : 'Cupón'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {posViewMode === 'grid' ? (
            <div className="grid gap-2.5 transition-all duration-300" style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}>
              
              {/* TARJETA: ARTÍCULO PERSONALIZADO (GRILLA) */}
              <button
                onClick={() => setIsCustomModalOpen(true)}
                className="group bg-fuchsia-50 border-2 border-dashed border-fuchsia-300 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:bg-fuchsia-100 hover:border-fuchsia-400 transition-all text-center flex flex-col items-center justify-center min-h-[124px] active:scale-[0.98]"
              >
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm mb-2 text-fuchsia-500 group-hover:scale-110 transition-transform">
                  <Wand2 size={20} />
                </div>
                <span className={`font-bold text-fuchsia-700 leading-snug px-2 ${gridColumns > 6 ? 'text-[11px]' : 'text-sm'}`}>Artículo Libre</span>
                <span className={`text-fuchsia-500 mt-1 ${gridColumns > 6 ? 'text-[9px]' : 'text-[10px]'}`}>Precio manual</span>
              </button>

              {displayedProducts.map((product) => {
                const effectiveStock = getEffectiveStock(product.id, product.stock);
                const isOutOfStock = effectiveStock <= 0;
                const isWeight = product.product_type === 'weight';
                let stockBadgeClass = effectiveStock > (isWeight ? 500 : 10) ? 'bg-green-100 text-green-700' : effectiveStock > (isWeight ? 100 : 5) ? 'bg-amber-100 text-amber-700' : effectiveStock > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-500';
                
                const expired = isProductExpired(product.expiration_date);

                return (
                  <button key={product.id} onClick={() => handleProductClick(product)} disabled={isOutOfStock} className={`group bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all text-left flex flex-col relative ${isOutOfStock ? 'opacity-60 grayscale cursor-not-allowed' : 'hover:border-fuchsia-300 active:scale-[0.98]'}`}>
                    <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden w-full">
                      {product.image ? (<img src={product.image} alt={product.title} className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500" />) : (<div className="w-full h-full flex flex-col items-center justify-center bg-slate-200/50 p-2 text-center group-hover:bg-slate-200 transition-colors"><span className={`font-bold text-slate-500 uppercase leading-tight ${gridColumns > 6 ? 'text-[10px]' : 'text-xs'}`}>{product.title}</span></div>)}
                      
                      {expired && !isOutOfStock && (
                        <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center z-10 pointer-events-none backdrop-blur-[0.5px]">
                           <span className="bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded shadow-md border border-red-800 flex items-center gap-1">
                             <AlertTriangle size={10} /> VENCIDO
                           </span>
                        </div>
                      )}

                      <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm backdrop-blur-sm z-20 ${stockBadgeClass}`}>
                        {isOutOfStock ? 'SIN STOCK' : (isWeight ? formatWeight(effectiveStock) : `${effectiveStock} u.`)}
                      </div>
                      
                      {isWeight && !isOutOfStock && (
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[9px] font-bold shadow-sm flex items-center gap-0.5 z-20">
                          <Scale size={8} /> PESO
                        </div>
                      )}
                    </div>
                    <div className={`flex flex-col flex-1 w-full z-20 bg-white ${gridColumns > 6 ? 'p-2' : 'p-2.5'}`}>
                      <h3 className={`font-bold leading-snug mb-0.5 line-clamp-2 ${gridColumns > 6 ? 'text-[10px]' : 'text-[13px]'} ${expired ? 'text-red-700' : 'text-slate-800'}`}>
                        {product.title}
                      </h3>
                      <div className="mt-auto pt-1.5 flex items-end justify-between">
                        <span className={`font-bold text-fuchsia-600 ${gridColumns > 6 ? 'text-[13px]' : 'text-base'}`}>
                          {isWeight ? (
                            <><FancyPrice amount={product.price * 1000} /><span className="text-[10px] font-medium text-fuchsia-400">/kg</span></>
                          ) : (
                            <><FancyPrice amount={product.price} /></>
                          )}
                        </span>
                        <div className={`w-5 h-5 rounded-full ${isWeight ? 'bg-amber-500' : 'bg-slate-900'} text-white flex items-center justify-center shadow-lg transition-colors ${gridColumns > 8 || isOutOfStock ? 'hidden' : 'flex'}`}>
                          {isWeight ? <Scale size={10} /> : <Plus size={12} />}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              
              {/* TARJETA: ARTÍCULO PERSONALIZADO (LISTA) */}
              <button
                onClick={() => setIsCustomModalOpen(true)}
                className="flex items-center gap-2.5 p-2.5 bg-fuchsia-50 border-2 border-dashed border-fuchsia-300 rounded-xl shadow-sm hover:shadow-md hover:bg-fuchsia-100 transition-all text-left group active:scale-[0.99]"
              >
                <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shrink-0 border border-fuchsia-200 text-fuchsia-500 group-hover:scale-110 transition-transform">
                   <Wand2 size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-fuchsia-800 text-sm">Artículo Personalizado Libre</h4>
                  <span className="text-[10px] text-fuchsia-600 font-medium">Ingresar nombre y precio de forma manual</span>
                </div>
                <div className="text-right flex items-center gap-3">
                   <div className="w-7 h-7 rounded-full bg-fuchsia-200 text-fuchsia-700 flex items-center justify-center">
                     <Plus size={14} />
                   </div>
                </div>
              </button>

              {displayedProducts.map((product) => {
                const effectiveStock = getEffectiveStock(product.id, product.stock);
                const isOutOfStock = effectiveStock <= 0;
                const isWeight = product.product_type === 'weight';
                
                const expired = isProductExpired(product.expiration_date);

                return (
                  <button key={product.id} onClick={() => handleProductClick(product)} disabled={isOutOfStock} className={`flex items-center gap-2.5 p-2.5 bg-white border rounded-xl shadow-sm hover:shadow-md transition-all text-left group ${isOutOfStock ? 'opacity-60 grayscale cursor-not-allowed bg-slate-50' : 'hover:border-fuchsia-300 active:scale-[0.99]'}`}>
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 border relative">
                      {product.image ? (<img src={product.image} alt="" className="w-full h-full object-cover" />) : (<div className="w-full h-full flex items-center justify-center bg-slate-200 text-[8px] font-bold text-slate-500 p-1 text-center leading-none">{product.title.slice(0, 8)}..</div>)}
                      {isWeight && <div className="absolute bottom-0 right-0 bg-amber-500 rounded-tl px-1 py-0.5 z-20"><Scale size={8} className="text-white" /></div>}
                      
                      {expired && !isOutOfStock && (
                        <div className="absolute inset-0 bg-red-600/20 flex items-center justify-center backdrop-blur-[1px] z-10 pointer-events-none">
                          <AlertTriangle size={16} className="text-red-600 drop-shadow-md" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-bold text-sm truncate ${expired ? 'text-red-700' : 'text-slate-800'}`}>
                        {product.title}
                        {expired && <span className="ml-2 text-[8px] bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider align-middle">Vencido</span>}
                      </h4>
                      {isWeight && <span className="text-[10px] text-amber-600 font-bold">Producto por peso</span>}
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div className="w-[74px] text-right">
                        <p className="font-bold text-base text-fuchsia-600">
                          <FancyPrice amount={isWeight ? product.price * 1000 : product.price} />
                          {isWeight && <span className="text-[10px] font-medium">/kg</span>}
                        </p>
                      </div>
                      {!isOutOfStock && (
                        <div className={`w-7 h-7 rounded-full ${isWeight ? 'bg-amber-100 text-amber-600 group-hover:bg-amber-500' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-900'} group-hover:text-white flex items-center justify-center transition-colors`}>
                          {isWeight ? <Scale size={13} /> : <Plus size={14} />}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {filteredProducts.length === 0 && (
             <div className="mt-10 flex flex-col items-center justify-center text-slate-400">
                <Package size={48} className="mb-3 opacity-50" />
                <p>No se encontraron productos en el inventario</p>
             </div>
          )}
        </div>
      </div>

      {/* COLUMNA DERECHA: CARRITO */}
      <div className="w-[352px] bg-white border-l flex flex-col min-h-0 shadow-2xl z-20 shrink-0">
        
        <div className="border-b bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex min-w-0 items-center gap-1.5 text-[15px] font-bold text-slate-800">
              <ShoppingCart size={18} className="shrink-0 text-fuchsia-600" /> Pedido Actual
            </h2>
            <span className="shrink-0 rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[11px] font-bold text-fuchsia-700">
              {cart.reduce((acc, item) => acc + (item.product_type === 'weight' ? 1 : item.quantity), 0)} items
            </span>
          </div>
          <div className="min-w-0">
            {hasVisibleSelectedClient ? (
              isGuestSelectedClient ? (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className="inline-flex h-6 items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-1.5 py-1 text-[10px] font-bold text-slate-600 shadow-sm">
                    <User size={11} /> Consumidor final
                  </div>
                  <button
                    onClick={() => setSelectedClient && setSelectedClient(null)}
                    className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 transition-colors hover:text-red-500"
                    title="Quitar identificacion"
                  >
                    <UserMinus size={12} />
                  </button>
                </div>
              ) : (
                <div className="mt-1.5 rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 px-2.5 py-2 shadow-sm transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate text-[13px] font-bold text-slate-800">
                            {`#${selectedClient.memberNumber} - ${selectedClient.name}`}
                          </span>
                          <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                            {selectedClient.points} pts
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] font-bold text-green-600">
                          +{pointsToEarn} pts por esta compra
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        onClick={openMemberRedeemPanel}
                        className="rounded-md border border-fuchsia-200 bg-white px-2 py-1 text-[10px] font-bold text-fuchsia-600 transition-colors hover:bg-fuchsia-50"
                      >
                        Canjear
                      </button>
                      <button
                        onClick={() => setSelectedClient && setSelectedClient(null)}
                        className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 transition-colors hover:text-red-500"
                        title="Quitar socio"
                      >
                        <UserMinus size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="mt-1.5">
                <button
                  onClick={openMemberSelectPanel}
                  className="inline-flex h-6 items-center gap-1 rounded-md border border-fuchsia-200 bg-fuchsia-50 px-1.5 py-1 text-[10px] font-bold text-fuchsia-600 transition-colors hover:bg-fuchsia-100 hover:text-fuchsia-700"
                >
                  <User size={11} /> Asignar socio
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300">
              <ShoppingCart size={64} className="mb-4 opacity-50" />
              <p className="font-medium text-slate-400">Carrito vacío</p>
            </div>
          ) : (
            cart.map((item) => {
              const isWeight = item.product_type === 'weight';
              const isEditingWeight = editingWeightItemId === item.id;
              const isCustom = item.isCustom;
              const isCombo = item.isCombo; // Detectamos si es un combo
              const isDiscount = item.isDiscount; // Detectamos si es un descuento

              const expired = isProductExpired(item.expiration_date);

              return (
                <div key={`${item.id}-${item.isReward ? 'r' : 'p'}`} className={`group flex gap-2 rounded-lg border p-2 shadow-sm transition-colors ${item.isReward ? 'bg-fuchsia-50 border-fuchsia-100' : isWeight ? 'bg-amber-50/30 border-amber-100' : isDiscount ? 'bg-emerald-50/50 border-emerald-200' : isCustom ? 'bg-indigo-50/40 border-indigo-100' : isCombo ? 'bg-violet-50/50 border-violet-200' : 'bg-white hover:border-fuchsia-200'}`}>
                  <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${isCombo ? 'bg-violet-100' : isDiscount ? 'bg-emerald-100' : 'bg-slate-50'}`}>
                    {item.image ? (
                      <img src={item.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      isDiscount ? (
                         <TicketPercent size={16} className="text-emerald-500" />
                      ) : isCustom ? (
                         <Wand2 size={16} className="text-indigo-400" />
                      ) : isCombo ? (
                         <TicketPercent size={16} className="text-violet-500" />
                      ) : (
                         <div className="w-full h-full flex items-center justify-center bg-slate-100 text-[9px] font-bold text-slate-400 text-center p-1 leading-none">{item.title.slice(0,12)}..</div>
                      )
                    )}
                    {isWeight && <div className="absolute bottom-0 right-0 bg-amber-500 rounded-tl px-0.5 py-0.5"><Scale size={7} className="text-white" /></div>}
                  </div>
                  
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className={`line-clamp-2 text-[12px] font-bold leading-tight ${item.isReward ? 'text-fuchsia-700' : isDiscount ? 'text-emerald-700' : isCustom ? 'text-indigo-800' : isCombo ? 'text-violet-800' : expired ? 'text-red-700' : 'text-slate-800'}`}>
                        {item.isReward && <Gift size={11} className="inline mr-1 text-fuchsia-500" />}
                        {item.title}
                        {expired && <AlertTriangle size={12} className="inline ml-1 text-red-500" title="¡Producto Vencido!" />}
                      </h4>
                      <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                    </div>
                    
                    <div className="flex justify-between items-end">
                      {isWeight ? (
                        <div className="flex items-center gap-1">
                          {isEditingWeight ? (
                            <div className="flex items-center gap-1">
                              <input type="number" min="1" autoFocus className="w-14 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[11px] font-bold text-center outline-none focus:ring-1 focus:ring-amber-500" value={editingWeightValue} onChange={(e) => setEditingWeightValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveWeightEdit(item.id); if (e.key === 'Escape') setEditingWeightItemId(null); }} onBlur={() => handleSaveWeightEdit(item.id)} />
                              <span className="text-[10px] text-amber-600 font-bold">g</span>
                            </div>
                          ) : (
                            <button onClick={() => { setEditingWeightItemId(item.id); setEditingWeightValue(String(item.quantity)); }} className="flex items-center gap-1 rounded-lg bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 transition-colors hover:bg-amber-200" title="Click para editar gramos">
                              <Scale size={9} />
                              {formatWeight(item.quantity)}
                              <Edit2 size={8} className="ml-0.5 opacity-50" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 rounded-md border bg-slate-50 p-[2px]">
                          <button onClick={() => updateCartItemQty(item.id, item.quantity - 1)} className="flex h-5 w-5 items-center justify-center rounded bg-white shadow-sm hover:text-red-500 disabled:opacity-50" disabled={item.quantity <= 1 || item.isReward || isDiscount}><Minus size={11} /></button>
                          <input
                            type="number"
                            min="1"
                            max={Math.max(1, Number(item.stock) || 1)}
                            value={item.quantity}
                            onChange={(e) => {
                              if (e.target.value === '') return;
                              updateCartItemQty(item.id, e.target.value);
                            }}
                            className="h-5 w-11 rounded bg-white px-1 text-center text-[11px] font-bold text-slate-700 outline-none"
                            disabled={item.isReward || isCombo || isDiscount}
                          />
                          <button onClick={() => updateCartItemQty(item.id, item.quantity + 1)} className="flex h-5 w-5 items-center justify-center rounded bg-white shadow-sm hover:text-green-500 disabled:opacity-50" disabled={item.isReward || isCombo || isDiscount}><Plus size={11} /></button>
                        </div>
                      )}
                      <p className={`text-[13px] font-bold ${item.isReward ? 'text-fuchsia-600' : isDiscount ? 'text-emerald-600' : isCombo ? 'text-violet-700' : 'text-slate-800'}`}>
                        {item.isReward ? 'GRATIS' : isDiscount ? <span className="text-emerald-600 font-black">-${Math.abs(item.price * item.quantity).toLocaleString('es-AR')}</span> : <FancyPrice amount={item.price * item.quantity} />}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="space-y-2.5 border-t bg-slate-50/95 p-3">
          {/* Pago */}
          <div className="grid grid-cols-4 gap-1.5">
            {PAYMENT_METHODS.map((method) => {
              const isSelected = selectedPayment === method.id;
              return (
                <button key={method.id} onClick={() => setSelectedPayment(method.id)} className={`flex h-14 flex-col items-center justify-center rounded-lg border p-2 text-[10px] font-bold transition-all ${isSelected ? 'scale-[1.03] border-slate-800 bg-slate-800 text-white shadow-md' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-100'}`}>
                  {method.id === 'Efectivo' && <Banknote size={16} className="mb-1" />}
                  {method.id === 'MercadoPago' && <Smartphone size={16} className="mb-1" />}
                  {(method.id === 'Debito' || method.id === 'Credito') && <CreditCard size={16} className="mb-1" />}
                  <span className="text-center leading-tight">{method.label}</span>
                </button>
              );
            })}
          </div>

          {selectedPayment === 'Credito' && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 p-2 rounded-lg animate-in fade-in slide-in-from-bottom-2">
              <span className="text-xs font-bold text-amber-700 whitespace-nowrap">Cuotas:</span>
              <select className="flex-1 bg-white border border-amber-200 text-xs rounded p-1 outline-none font-bold text-slate-700" value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                <option value={1}>1 pago (10%)</option>
                <option value={3}>3 cuotas</option>
                <option value={6}>6 cuotas</option>
                <option value={12}>12 cuotas</option>
              </select>
            </div>
          )}

          {selectedPayment === 'Efectivo' && (
            <div className="space-y-2 rounded-xl border border-emerald-300 bg-gradient-to-br from-emerald-50 via-emerald-100/80 to-white px-2.5 py-2.5 shadow-sm animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
                    Cobro en efectivo
                  </label>
                  <HintIcon
                    hint="Carga el monto recibido para calcular la devolucion."
                    size={13}
                    side="left"
                    className="rounded-full border border-emerald-200 bg-white/90 p-[1px] shadow-sm"
                  />
                </div>
                <span className="rounded-full border border-emerald-200 bg-white/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-600 shadow-sm">
                  Efectivo
                </span>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-white/90 px-3 py-2 shadow-sm transition-all focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-200">
                <input
                  ref={cashReceivedInputRef}
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashReceivedInput}
                  onChange={(e) => setCashReceivedInput(e.target.value)}
                  placeholder="Ingresar el total en efectivo"
                  className="w-full appearance-none bg-transparent text-[15px] font-black text-slate-800 outline-none placeholder:text-slate-400 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>

              {hasTypedCashAmount && cashMissingAmount > 0 && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-600">
                  Faltan <FancyPrice amount={cashMissingAmount} /> para completar el pago.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1 border-t border-slate-200 pt-2">
            <div className="flex justify-between text-xs text-slate-500"><span>Subtotal</span><span><FancyPrice amount={subtotal} /></span></div>
            {selectedPayment === 'Credito' && (<div className="flex justify-between text-xs text-amber-600 font-bold"><span>Recargo (10%)</span><span>+<FancyPrice amount={subtotal * 0.1} /></span></div>)}
            {selectedPayment === 'Efectivo' && (
              <>
                <div className="flex justify-between text-xs text-slate-500"><span>Efectivo recibido</span><span><FancyPrice amount={cashReceivedAmount} /></span></div>
                <div className="flex justify-between text-xs font-bold text-emerald-600"><span>Devolución</span><span><FancyPrice amount={cashChangeAmount} /></span></div>
              </>
            )}
            <div className="flex justify-between items-end pt-2">
              <span className="text-sm font-bold text-slate-800 uppercase">Total a Pagar</span>
              <span className="text-[24px] font-black text-slate-900"><FancyPrice amount={total} /></span>
            </div>
          </div>

          <button onClick={handlePreCheckout} disabled={cart.length === 0 || (selectedPayment === 'Efectivo' && hasTypedCashAmount && cashMissingAmount > 0)} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 py-3 text-[15px] font-bold text-white shadow-lg transition-all hover:from-black hover:to-slate-900 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50">
            <CheckCircle className="group-hover:scale-110 transition-transform" />
            {cart.length === 0 ? 'CARRITO VACÍO' : 'COBRAR'}
          </button>
        </div>
      </div>

      {/* Modales */}
      {weightModalProduct && (
        <WeightInputModal
          product={weightModalProduct}
          effectiveStock={getEffectiveStock(weightModalProduct.id, weightModalProduct.stock)}
          onConfirm={handleWeightConfirm}
          onClose={() => setWeightModalProduct(null)}
        />
      )}

      {isCustomModalOpen && (
        <CustomProductModal 
          isOpen={isCustomModalOpen} 
          onClose={() => setIsCustomModalOpen(false)} 
          onConfirm={handleCustomConfirm} 
        />
      )}
      {/* DRAWER DE OFERTAS Y COMBOS */}
      {isOffersDrawerOpen && (
        <>
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] transition-opacity"
            onClick={() => setIsOffersDrawerOpen(false)}
          ></div>
          <div className="absolute top-0 left-0 h-full w-[400px] max-w-full bg-white shadow-2xl z-[61] flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-4 bg-violet-700 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <TicketPercent size={20} />
                <h2 className="font-bold text-lg">Combos Disponibles</h2>
              </div>
              <button onClick={() => setIsOffersDrawerOpen(false)} className="text-violet-200 hover:text-white bg-violet-800/50 p-1.5 rounded-lg"><X size={20}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 custom-scrollbar space-y-3">
              {selectableOffers.map((offer) => {
                const availability = getComboAvailability(offer);

                return (
                <div key={offer.id} className={`rounded-xl p-4 shadow-sm flex flex-col border ${availability.isAvailable ? 'bg-white border-slate-200' : 'bg-red-50/30 border-red-200'}`}>
                   <div className="flex justify-between items-start mb-2">
                     <div>
                       <span className="bg-violet-100 text-violet-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">{offer.type}</span>
                       <h3 className="font-bold text-slate-800 text-base mt-1">{offer.name}</h3>
                       <p className={`mt-1 text-[11px] font-bold ${availability.isAvailable ? 'text-slate-500' : 'text-red-600'}`}>
                         {availability.isAvailable
                           ? `${availability.availableBundles} combos disponibles`
                           : 'Sin stock suficiente para vender este combo'}
                       </p>
                     </div>
                     <span className="font-black text-emerald-600 text-lg">${Number(offer.offerPrice).toLocaleString('es-AR')}</span>
                   </div>
                   
                   <div className="mt-2 pt-2 border-t border-slate-100 mb-4">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Incluye:</p>
                     <ul className="text-xs text-slate-600 font-medium space-y-1">
                        {availability.lines.map((line) => (
                          <li key={`${offer.id}-${line.id}`} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-2 py-1.5">
                            <div className="flex min-w-0 items-start gap-1">
                              <span className="text-violet-400 mt-0.5">*</span>
                              <span className="truncate">{line.title}</span>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[10px] font-black text-slate-600">x{line.requiredQty}</p>
                              <p className={`text-[10px] font-bold ${line.hasStock ? 'text-slate-400' : 'text-red-500'}`}>
                                Stock: {line.remainingStock}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button 
                      onClick={() => handleAddComboToCart(offer)}
                      disabled={!availability.isAvailable}
                      className={`w-full mt-auto py-2.5 font-bold text-sm rounded-lg border transition-colors flex justify-center items-center gap-2 ${
                        availability.isAvailable
                          ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-600 hover:text-white hover:border-violet-600'
                          : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      }`}
                    >
                      <Plus size={16} /> {availability.isAvailable ? 'Agregar al Pedido' : 'Sin stock'}
                    </button>
                </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {isDiscountDrawerOpen && (
        <>
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] transition-opacity"
            onClick={() => setIsDiscountDrawerOpen(false)}
          ></div>
          <div className="absolute top-0 left-0 h-full w-[380px] max-w-full bg-white shadow-2xl z-[61] flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-4 bg-emerald-700 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <TicketPercent size={20} />
                <div>
                  <h2 className="font-bold text-lg">Descuentos</h2>
                  <p className="text-[11px] text-emerald-100">Aplicados sobre el pedido actual</p>
                </div>
              </div>
              <button onClick={() => setIsDiscountDrawerOpen(false)} className="text-emerald-200 hover:text-white bg-emerald-800/50 p-1.5 rounded-lg"><X size={20}/></button>
            </div>

            <div className="p-4 border-b bg-emerald-50/70 shrink-0">
              <div className="rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Base para descuento</p>
                <p className="text-2xl font-black text-slate-900"><FancyPrice amount={discountBaseTotal} /></p>
                <p className="text-[11px] text-slate-500">No incluye descuentos ya aplicados.</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 custom-scrollbar space-y-4">
              {selectableDiscountOffers.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Ofertas y cupones guardados</p>
                  <div className="space-y-2">
                    {selectableDiscountOffers.map((offer) => (
                      <button
                        key={`drawer-${offer.id}`}
                        onClick={() => {
                          const result = handleApplyOfferDiscount(offer);
                          if (!result.ok) showOfferApplyError(result);
                        }}
                        disabled={discountBaseTotal <= 0}
                        className="w-full rounded-xl border border-emerald-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-emerald-400 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-900">{offer.name}</p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {offer.canonical.benefitType === 'coupon'
                                ? `Código ${offer.couponCode || 'SIN-CODIGO'}`
                                : offer.canonical.discountMode === 'percentage'
                                ? `${Number(offer.canonical.discountValue || offer.discountValue || 0)}% sobre el pedido`
                                : `${Number(offer.canonical.discountValue || offer.discountValue || 0)} de descuento fijo`}
                            </p>
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">
                            {offer.canonical.benefitType === 'coupon' ? 'Cupón' : 'Descuento'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Accesos rápidos</p>
                <div className="grid grid-cols-2 gap-3">
                  {[5, 10, 15, 20].map((percent) => {
                    const amount = Math.round((discountBaseTotal * percent) / 100);
                    return (
                      <button
                        key={percent}
                        onClick={() => handleApplyManualDiscount(percent)}
                        disabled={discountBaseTotal <= 0}
                        className="rounded-xl border border-emerald-200 bg-white p-4 text-left shadow-sm hover:border-emerald-400 hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-lg font-black text-emerald-700">{percent}%</span>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Manual</span>
                        </div>
                        <p className="mt-2 text-xs font-bold text-slate-700">Descuenta <FancyPrice amount={amount} /></p>
                        <p className="mt-1 text-[11px] text-slate-500">Aplicar ahora al carrito.</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Descuento personalizado</p>
                  <p className="text-[11px] text-slate-500 mt-1">Ingresá un porcentaje manual, por ejemplo 10%.</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      value={customDiscountPercent}
                      onChange={(e) => setCustomDiscountPercent(e.target.value)}
                      placeholder="10"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-8 text-sm font-bold outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">%</span>
                  </div>
                  <button
                    onClick={() => handleApplyManualDiscount(customDiscountPercent)}
                    disabled={discountBaseTotal <= 0 || !Number(customDiscountPercent)}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Aplicar
                  </button>
                </div>
                {Number(customDiscountPercent) > 0 && (
                  <p className="text-xs font-bold text-emerald-700">
                    Descuento estimado: <FancyPrice amount={Math.round((discountBaseTotal * Number(customDiscountPercent)) / 100)} />
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}


