import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Filter,
  ChevronDown,
  ArrowDownUp,
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
import AsyncActionButton from '../components/AsyncActionButton';
import { FancyPrice } from '../components/FancyPrice';
import { HintIcon } from '../components/HintIcon';
import usePendingAction from '../hooks/usePendingAction';
import { normalizeLegacyOffer } from '../utils/offerHelpers';
import {
  createPaymentLine,
  getPaymentBreakdownTotals,
  getPaymentMethodLabel,
  getPaymentSummary,
  normalizePaymentBreakdown,
} from '../utils/paymentBreakdown';
import { getProductImageUrl } from '../utils/productImages';
import { getProductActiveState } from '../utils/productLifecycle';
import {
  couponRequiresInstagramConnection,
  formatInstagramHandle,
  getCouponUsageOverrides,
  getInstagramConnection,
  hasInstagramConnection,
  normalizeInstagramHandle,
} from '../utils/socialConnections';

const POS_BATCH_SIZE = 50;
const REBU_WIDE_QUERY = '(min-width: 1920px)';
const POS_CART_BOUNDS = {
  compact: { min: 352, default: 360, max: 384 },
  wide: { min: 352, default: 384, max: 520 },
};

const isWideResolution = () =>
  typeof window !== 'undefined' && window.matchMedia(REBU_WIDE_QUERY).matches;

const getPosCartBounds = (isWide = isWideResolution()) =>
  isWide ? POS_CART_BOUNDS.wide : POS_CART_BOUNDS.compact;

const clampCartWidth = (value, bounds = getPosCartBounds()) =>
  Math.min(bounds.max, Math.max(bounds.min, value));

const formatComboIncludedQty = (quantity, productType) => {
  const safeQuantity = Number(quantity || 0);
  return productType === 'weight' ? formatWeight(safeQuantity) : `x${safeQuantity}`;
};

const getComboIncludedUnitPrice = (item) => {
  const price = Number(item?.price || 0);
  if (!price) return null;
  return item?.product_type === 'weight' ? price * 1000 : price;
};

const normalizePaymentInputValue = (value) => {
  const normalizedValue = String(value ?? '').replace(',', '.').replace(/[^\d.]/g, '');
  const [integerPart, ...decimalParts] = normalizedValue.split('.');
  if (decimalParts.length === 0) return integerPart;
  return `${integerPart}.${decimalParts.join('').slice(0, 2)}`;
};

const getEditableCashInputValue = (line) => {
  if (!line || line.method !== 'Efectivo') return '';
  if (line.cashReceived === null || line.cashReceived === undefined) return '';
  if (line.cashReceived === 0) return '';
  return String(line.cashReceived);
};

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
  const productImage = getProductImageUrl(product);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200">
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
              {productImage ? (
                <img src={productImage} alt="" decoding="async" className="w-full h-full object-cover" />
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
                <span className="text-[10px] text-slate-400">·</span>
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
              <p className="text-[10px] text-slate-500">{formatWeight(gramsNum)} x <FancyPrice amount={product.price * 1000} />/kg</p>
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

const normalizeCustomSearchText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const getReferenceProductUnitCost = (product = {}) =>
  Number(
    product.purchasePrice ??
      product.purchase_price ??
      product.cost ??
      product.unitCost ??
      product.unit_cost ??
      product.costPrice ??
      product.cost_price ??
      0
  ) || 0;

const CustomProductModal = ({ isOpen, onClose, onConfirm, inventory = [] }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('quantity'); 
  const [price, setPrice] = useState(''); 
  const [cost, setCost] = useState('');
  const [amount, setAmount] = useState(''); 

  const similarProducts = useMemo(() => {
    const normalizedTitle = normalizeCustomSearchText(title.replace(/^\*\s*/, ''));
    const tokens = normalizedTitle.split(/\s+/).filter((token) => token.length >= 3);
    if (tokens.length === 0) return [];

    return (inventory || [])
      .map((product) => {
        const normalizedProductTitle = normalizeCustomSearchText(product?.title);
        if (!normalizedProductTitle) return null;
        const matchedTokens = tokens.filter((token) => normalizedProductTitle.includes(token));
        const startsWithScore = normalizedProductTitle.startsWith(normalizedTitle) ? 2 : 0;
        const exactScore = normalizedProductTitle === normalizedTitle ? 4 : 0;
        const score = matchedTokens.length + startsWithScore + exactScore;
        if (score <= 0) return null;
        return { product, score, unitCost: getReferenceProductUnitCost(product) };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || b.unitCost - a.unitCost)
      .slice(0, 6);
  }, [inventory, title]);

  if (!isOpen) return null;

  const p = Number(price) || 0;
  const c = Number(cost);
  const a = Number(amount) || 0;
  const hasValidCost = cost.trim() !== '' && Number.isFinite(c) && c >= 0;
  const isValid = title.trim().length > 0 && p > 0 && a > 0 && hasValidCost;
  
  const totalEstimado = type === 'quantity' ? (p * a) : ((p / 1000) * a);
  const totalCostEstimado = hasValidCost ? (type === 'quantity' ? c * a : ((c / 1000) * a)) : 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return;

    const customId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    const normalizedUnitCost = type === 'weight' ? c / 1000 : c;
    const customProduct = {
      id: customId,
      title: `* ${title.trim()}`, 
      price: type === 'weight' ? p / 1000 : p,
      cost: normalizedUnitCost,
      unitCost: normalizedUnitCost,
      purchasePrice: normalizedUnitCost,
      costSource: 'manual_custom',
      product_type: type,
      stock: 999999, // Ficticio para que no joda
      isCustom: true
    };

    onConfirm(customProduct, a);
    
    setTitle('');
    setType('quantity');
    setPrice('');
    setCost('');
    setAmount('');
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200">
        <div className="p-4 bg-fuchsia-50 border-b border-fuchsia-100 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-fuchsia-600" />
            <h3 className="font-bold text-fuchsia-800">Artículo Personalizado</h3>
          </div>
          <button onClick={onClose}><X size={18} className="text-fuchsia-400 hover:text-fuchsia-600" /></button>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-0 md:grid-cols-[1fr_280px]">
          <div className="p-5 space-y-4">
          
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
                onClick={() => { setType('quantity'); setAmount(''); setPrice(''); setCost(''); }}
                className={`flex-1 h-full rounded-md text-sm font-bold transition-all flex items-center justify-center gap-1 ${type === 'quantity' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Package size={14}/> Unidad
              </button>
              <button
                type="button"
                onClick={() => { setType('weight'); setAmount(''); setPrice(''); setCost(''); }}
                className={`flex-1 h-full rounded-md text-sm font-bold transition-all flex items-center justify-center gap-1 ${type === 'weight' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Scale size={14}/> Peso
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-bold uppercase text-slate-500">
                <span>{type === 'quantity' ? 'Costo Unit. ($)' : 'Costo x Kg ($)'} *</span>
                <HintIcon
                  size={13}
                  side="center-left"
                  hint="Costo de compra o referencia.
No lo ve el cliente; sirve para calcular margen y costo estimado."
                />
              </label>
              <input 
                type="number" 
                min="0" 
                step="1" 
                required
                placeholder="0" 
                className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:ring-2 focus:ring-fuchsia-500 outline-none font-bold text-slate-800" 
                value={cost} 
                onChange={(e) => setCost(e.target.value)} 
              />
            </div>
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
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="bg-slate-50 rounded-xl p-3 border text-center">
              <p className="text-[10px] text-slate-400 uppercase font-bold">Total del artículo</p>
              <p className="text-xl font-black text-slate-900"><FancyPrice amount={totalEstimado} /></p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center">
                <p className="text-[10px] text-emerald-600 uppercase font-bold">Costo estimado</p>
                <p className="text-xl font-black text-emerald-800"><FancyPrice amount={totalCostEstimado} /></p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl font-bold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
            <button type="submit" disabled={!isValid} className={`flex-1 py-3 rounded-xl font-bold transition-colors ${isValid ? 'bg-fuchsia-600 text-white hover:bg-fuchsia-700 shadow-md' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
              Agregar al Carrito
            </button>
          </div>
          </div>

          <div className="border-t md:border-l md:border-t-0 border-slate-200 bg-slate-50/80 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Referencia de costos</p>
            <h4 className="mt-1 text-sm font-black text-slate-900">Productos similares</h4>
            <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-500">
              Usalo como guia para cargar el costo del articulo libre.
            </p>

            <div className="mt-3 max-h-[270px] space-y-2 overflow-y-auto pr-1">
              {similarProducts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center">
                  <p className="text-xs font-bold text-slate-500">Escribi un nombre para buscar referencias.</p>
                </div>
              ) : (
                similarProducts.map(({ product, unitCost }) => {
                  const displayCost = product.product_type === 'weight' ? unitCost * 1000 : unitCost;
                  return (
                    <button
                      key={product.id || product.title}
                      type="button"
                      onClick={() => setCost(String(Math.round(displayCost)))}
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-fuchsia-200 hover:bg-fuchsia-50"
                      title={product.title}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-xs font-black leading-snug text-slate-800">{product.title}</p>
                        <span className="shrink-0 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
                          <FancyPrice amount={displayCost} />
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">
                        {product.product_type === 'weight' ? 'Costo x kg' : 'Costo unitario'}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default function POSView({
  inventory, categories, addToCart, cart, removeFromCart, updateCartItemQty,
  selectedPayment, setSelectedPayment, installments, setInstallments,
  handleCheckout, posSearch, setPosSearch,
  selectedCategory, setSelectedCategory, posViewMode, setPosViewMode,
  gridColumns, setGridColumns, selectedClient, setSelectedClient,
  onOpenMemberPanel,
  onOpenClientModal,
  onOpenRedemptionModal,
  onUpdateClient,
  transactions = [],
  offers = [], // Recibimos las ofertas
  currentUser: _currentUser = null,
  userCatalog: _userCatalog = null,
}) {
  const [showGridMenu, setShowGridMenu] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [categoryFilterSearch, setCategoryFilterSearch] = useState('');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortFilterSearch, setSortFilterSearch] = useState('');
  const [sortBy, setSortBy] = useState('title-asc');
  const [weightModalProduct, setWeightModalProduct] = useState(null);
  const [editingWeightItemId, setEditingWeightItemId] = useState(null);
  const [editingWeightValue, setEditingWeightValue] = useState('');
  
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isOffersDrawerOpen, setIsOffersDrawerOpen] = useState(false); // Modal de combos

  const [isDiscountDrawerOpen, setIsDiscountDrawerOpen] = useState(false);
  const [customDiscountPercent, setCustomDiscountPercent] = useState('');
  const [visibleCount, setVisibleCount] = useState(POS_BATCH_SIZE);
  const [paymentLines, setPaymentLines] = useState([createPaymentLine({ method: selectedPayment || 'Efectivo', installments: installments || 1, cashReceived: '' })]);
  const [isSplitPaymentMode, setIsSplitPaymentMode] = useState(false);
  const [activeSplitLineIndex, setActiveSplitLineIndex] = useState(0);
  const [isWideLayout, setIsWideLayout] = useState(isWideResolution);
  const [productHoverPreview, setProductHoverPreview] = useState(null);
  const { isPending, runAction } = usePendingAction();
  const cartBounds = useMemo(() => getPosCartBounds(isWideLayout), [isWideLayout]);
  const maxGridColumns = isWideLayout ? 10 : 8;
  const [cartPanelWidth, setCartPanelWidth] = useState(() => {
    const initialBounds = getPosCartBounds();
    if (typeof window === 'undefined') return initialBounds.default;
    const storedWidth = Number(window.localStorage.getItem('rebu-pos-cart-width'));
    return Number.isFinite(storedWidth) ? clampCartWidth(storedWidth, initialBounds) : initialBounds.default;
  });

  const startCartResize = (event) => {
    event.preventDefault();

    const handlePointerMove = (moveEvent) => {
      const nextWidth = clampCartWidth(window.innerWidth - moveEvent.clientX, cartBounds);
      setCartPanelWidth(nextWidth);
    };

    const stopResize = () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', stopResize);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', stopResize);
  };

  const updateProductHoverPreview = (event, product, imageSrc) => {
    if (!imageSrc || typeof window === 'undefined') return;

    const previewSize = isWideLayout ? 220 : 184;
    const offset = 18;
    const viewportPadding = 12;
    let x = event.clientX + offset;
    let y = event.clientY + offset;

    if (x + previewSize > window.innerWidth - viewportPadding) {
      x = event.clientX - previewSize - offset;
    }
    if (y + previewSize > window.innerHeight - viewportPadding) {
      y = window.innerHeight - previewSize - viewportPadding;
    }

    setProductHoverPreview({
      src: imageSrc,
      title: product?.title || 'Producto',
      x: Math.max(viewportPadding, x),
      y: Math.max(viewportPadding, y),
      size: previewSize,
    });
  };

  const clearProductHoverPreview = () => setProductHoverPreview(null);

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
  }, [posSearch, selectedCategory, sortBy]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia(REBU_WIDE_QUERY);
    const handleChange = () => setIsWideLayout(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => {
    setCartPanelWidth((currentWidth) => clampCartWidth(currentWidth, cartBounds));
  }, [cartBounds]);

  useEffect(() => {
    if (gridColumns <= maxGridColumns) return;
    setGridColumns(maxGridColumns);
  }, [gridColumns, maxGridColumns, setGridColumns]);

  useEffect(() => {
    if (cart.length === 0) {
      setIsSplitPaymentMode(false);
      setActiveSplitLineIndex(0);
      setPaymentLines([createPaymentLine({ method: 'Efectivo', installments: 1, cashReceived: '' })]);
    }
  }, [cart.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('rebu-pos-cart-width', String(cartPanelWidth));
  }, [cartPanelWidth]);

  const extractCouponCodeFromItem = (item) => {
    const explicitCode = String(item?.couponCode || item?.coupon_code || '').trim();
    if (explicitCode) return explicitCode.toUpperCase();

    const title = String(item?.title || '');
    const description = String(item?.description || '');
    const couponMatch =
      title.match(/cup[oó]n\s+([a-z0-9_-]+)/i) ||
      description.match(/cup[oó]n\s+([a-z0-9_-]+)/i);

    return couponMatch ? String(couponMatch[1]).trim().toUpperCase() : '';
  };

  const selectedClientUsedCoupons = useMemo(() => {
    if (!selectedClient || selectedClient.id === 'guest') return new Set();

    const memberId = String(selectedClient.id || '');
    const memberNumber = String(selectedClient.memberNumber || '');
    const reenabledCodes = new Set(getCouponUsageOverrides(selectedClient).reenabledCodes);

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

    const snapshotUsedCodes = Array.isArray(selectedClient.usedCoupons)
      ? selectedClient.usedCoupons.map((code) => String(code).trim().toUpperCase()).filter(Boolean)
      : [];

    return new Set(
      [...usedCodes, ...snapshotUsedCodes]
        .map((code) => String(code || '').trim().toUpperCase())
        .filter((code) => code && !reenabledCodes.has(code)),
    );
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
      discountMode: 'percentage',
      discountPercent: percentage,
      product_type: 'quantity',
      description: `${percentage}% sobre el pedido actual`,
      stock: 999999
    }, 1);

    setCustomDiscountPercent('');
    setIsDiscountDrawerOpen(false);
  };

  const handleApplyOfferDiscount = (offer, options = {}) => {
    const canonical = offer?.canonical || normalizeLegacyOffer(offer, productsByCategory, inventory);
    const baseTotal = getDiscountBaseTotal();
    const offerId = offer?.id ?? canonical?.couponCode ?? offer?.name;
    const configuredDiscountValue = parseOfferNumericValue(canonical?.discountValue ?? offer?.discountValue ?? 0);
    const couponCode = String(canonical?.couponCode || '').trim().toUpperCase();
    const effectiveClient = options.clientOverride || selectedClient;
    const effectiveUsedCoupons = options.clientOverride
      ? (() => {
          const reenabledCodes = new Set(getCouponUsageOverrides(options.clientOverride).reenabledCodes);
          return new Set(
            (options.clientOverride.usedCoupons || [])
              .map((code) => String(code).trim().toUpperCase())
              .filter((code) => code && !reenabledCodes.has(code)),
          );
        })()
      : selectedClientUsedCoupons;

    if (baseTotal <= 0) return { ok: false, reason: 'no_base' };
    if (canonical?.benefitType === 'coupon' && couponCode && effectiveUsedCoupons.has(couponCode)) {
      return { ok: false, reason: 'used_before', couponCode };
    }
    if (canonical?.benefitType === 'coupon' && couponRequiresInstagramConnection(couponCode)) {
      const hasRealClient = effectiveClient && effectiveClient.id !== 'guest' && effectiveClient.id !== 0;
      if (!hasRealClient) {
        return { ok: false, reason: 'instagram_member_required', couponCode };
      }
      const instagram = getInstagramConnection(effectiveClient);
      if (!instagram.handle) {
        return { ok: false, reason: 'instagram_missing', couponCode };
      }
      if (!hasInstagramConnection(effectiveClient)) {
        return { ok: false, reason: 'instagram_unconfirmed', couponCode, instagramHandle: instagram.handle };
      }
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
      couponCode,
      originalOfferId: offerId,
      discountMode: canonical.discountMode === 'percentage' ? 'percentage' : 'fixed',
      discountPercent: canonical.discountMode === 'percentage' ? configuredDiscountValue : 0,
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
    if (!result.ok) showOfferApplyError(result, offer);
  };

  const updateSelectedClientInstagram = async (updates) => {
    if (!selectedClient || selectedClient.id === 'guest' || selectedClient.id === 0 || !onUpdateClient) {
      return null;
    }

    const updatedClient = await onUpdateClient(selectedClient.id, updates);
    if (!updatedClient?.id) return null;

    const nextClient = {
      ...selectedClient,
      ...updatedClient,
      usedCoupons: selectedClient.usedCoupons || updatedClient.usedCoupons || [],
    };
    setSelectedClient(nextClient);
    return nextClient;
  };

  const applyOfferAfterInstagramUpdate = (offer, updatedClient) => {
    const result = handleApplyOfferDiscount(offer, { clientOverride: updatedClient });
    if (!result.ok) {
      showOfferApplyError(result, offer);
      return;
    }

    Swal.fire({
      title: 'Cupón aplicado',
      text: 'Instagram confirmado. REBUINSTA ya quedo agregado al pedido.',
      icon: 'success',
      timer: 1800,
      showConfirmButton: false,
    });
  };

  const handleMissingInstagramForCoupon = async (result, offer) => {
    if (!onUpdateClient) {
      Swal.fire({
        title: 'No se pudo aplicar',
        text: `El socio seleccionado todavia no tiene Instagram confirmado para usar ${result.couponCode || 'este cupon'}.`,
        icon: 'warning',
        confirmButtonColor: '#059669',
      });
      return;
    }

    const firstStep = await Swal.fire({
      title: 'Instagram requerido',
      text: `El socio seleccionado todavia no tiene Instagram confirmado para usar ${result.couponCode || 'este cupon'}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Agregar Instagram',
      cancelButtonText: 'Salir',
      confirmButtonColor: '#059669',
      cancelButtonColor: '#64748b',
    });

    if (!firstStep.isConfirmed) return;

    const inputStep = await Swal.fire({
      title: 'Agregar Instagram',
      input: 'text',
      inputLabel: selectedClient?.name ? `Instagram de ${selectedClient.name}` : 'Usuario de Instagram',
      inputPlaceholder: '@usuario',
      showCancelButton: true,
      confirmButtonText: 'Guardar y confirmar',
      cancelButtonText: 'Salir',
      confirmButtonColor: '#059669',
      cancelButtonColor: '#64748b',
      inputValidator: (value) => {
        const normalized = normalizeInstagramHandle(value);
        if (!normalized) return 'Ingresá un usuario de Instagram.';
        return undefined;
      },
    });

    if (!inputStep.isConfirmed) return;

    const normalizedHandle = normalizeInstagramHandle(inputStep.value);
    const updatedClient = await updateSelectedClientInstagram({
      instagramHandle: normalizedHandle,
      instagramConnected: true,
      instagramNotes: `Confirmado desde POS para ${result.couponCode || 'cupon'}`,
    });

    if (!updatedClient) return;
    applyOfferAfterInstagramUpdate(offer, updatedClient);
  };

  const handleUnconfirmedInstagramForCoupon = async (result, offer) => {
    const instagram = getInstagramConnection(selectedClient);
    const instagramLabel = formatInstagramHandle(result.instagramHandle || instagram.handle) || 'Instagram cargado';

    const decision = await Swal.fire({
      title: 'Confirmar Instagram',
      html: `
        <div style="text-align:left">
          <p>El socio tiene <strong>${instagramLabel}</strong>, pero todavia no esta confirmado.</p>
          <p style="margin-top:8px;color:#64748b;font-size:13px">Confirmalo solo si corresponde habilitar REBUINSTA para este socio.</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirmar',
      cancelButtonText: 'No confirmar',
      confirmButtonColor: '#059669',
      cancelButtonColor: '#64748b',
    });

    if (!decision.isConfirmed) return;

    const updatedClient = await updateSelectedClientInstagram({
      instagramHandle: instagram.handle,
      instagramConnected: true,
      instagramNotes: instagram.notes || `Confirmado desde POS para ${result.couponCode || 'cupon'}`,
    });

    if (!updatedClient) return;
    applyOfferAfterInstagramUpdate(offer, updatedClient);
  };

  const showOfferApplyError = (result, offer = null) => {
    if (result.reason === 'instagram_missing') {
      handleMissingInstagramForCoupon(result, offer);
      return;
    }

    if (result.reason === 'instagram_unconfirmed') {
      handleUnconfirmedInstagramForCoupon(result, offer);
      return;
    }

    Swal.fire({
      title: 'No se pudo aplicar',
      text:
        result.reason === 'no_base'
          ? 'Primero agrega productos al pedido para usar descuentos o cupones.'
          : result.reason === 'used_before'
          ? `El codigo ${result.couponCode || 'del cupon'} ya fue utilizado anteriormente por este socio.`
          : result.reason === 'instagram_member_required'
          ? `El codigo ${result.couponCode || 'del cupon'} requiere seleccionar un socio con Instagram confirmado.`
          : result.reason === 'instagram_missing' || result.reason === 'instagram_unconfirmed'
          ? `El socio seleccionado todavia no tiene Instagram confirmado para usar ${result.couponCode || 'este cupon'}.`
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
      const requiredQuantity = Math.max(
        Number(product.quantity ?? product.qty ?? (product.product_type === 'weight' ? 1000 : 1)) || 0,
        0
      );
      acc[productId] = {
        product,
        requiredQty: (acc[productId]?.requiredQty || 0) + requiredQuantity,
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
      title: `?? ${offer.name} (${offer.type})`,
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
  const checkSmartDiscounts = async () => {
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
               title: `?? Promo ${offer.type}: ${offer.name}`,
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
                     title: `?? Mayorista: ${op.title}`,
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
          htmlContent += `<li style="margin-bottom:4px;">? <b>${o.description}</b></li>`;
       });
       htmlContent += '</ul>';

       const result = await Swal.fire({
          title: '¡Ofertas Detectadas!',
          html: `El sistema detectó descuentos aplicables a este carrito:${htmlContent}`,
          icon: 'info',
          showCancelButton: true,
          confirmButtonText: 'Aplicar Descuentos',
          cancelButtonText: 'No, continuar así',
          confirmButtonColor: '#8b5cf6', 
          cancelButtonColor: '#94a3b8'
       });
       if (result.isConfirmed) {
          // Inyectamos los descuentos al carrito
             applicableOffers.forEach(discountItem => {
                addToCart(discountItem);
             });
             // Mensaje de éxito e interrupción para que el usuario de caja vea el carrito actualizado
             await Swal.fire({
               title: '¡Aplicado!',
               text: 'Revisa el total actualizado y presiona Cobrar nuevamente.',
               icon: 'success',
               timer: 2000,
               showConfirmButton: false
             });
          } else if (result.dismiss === Swal.DismissReason.cancel) {
             // El usuario decidió no aplicarlos, seguimos al cobro normal
             await proceedToCheckoutFlow();
          }
       return true; // Retornamos true para pausar el handlePreCheckout
    }
    return false; // No hay ofertas, sigue de largo
  };

  const proceedToCheckoutFlow = async () => {
    if (hasOverassignedPayments) {
      Swal.fire('Montos excedidos', 'La suma asignada supera el subtotal del pedido. Ajusta los tramos antes de cobrar.', 'warning');
      return;
    }
    if (Math.abs(remainingBaseAmount) > 0.009) {
      Swal.fire('Pago incompleto', 'Todavía falta asignar parte del pedido a un método de pago.', 'warning');
      return;
    }
    if (cashMissingAmount > 0) {
      Swal.fire('Monto insuficiente', 'El efectivo recibido debe cubrir el tramo en efectivo de la compra.', 'warning');
      return;
    }
    if (cart.length > 0 && !selectedClient) {
      openGuestPanel();
    } else {
      await handleCheckout?.({
        paymentLines: normalizedPaymentLines,
        cashReceived: cashReceivedAmount || null,
        cashChange: cashChangeAmount || 0,
      });
    }
  };

  const handlePreCheckout = async () => {
    const hasDiscountsPending = await checkSmartDiscounts();
    if (hasDiscountsPending) return; // Pausa
    await proceedToCheckoutFlow(); // Sigue
  };

  const roundPaymentValue = (value) => Math.round((Number(value) || 0) * 100) / 100;
  const getDefaultSplitSecondaryMethod = (primaryMethod) => (primaryMethod === 'Efectivo' ? 'MercadoPago' : 'Efectivo');

  const subtotal = cart.reduce((t, i) => t + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
  const cartDiscountTotal = cart.reduce(
    (sum, item) => sum + ((item.isReward || item.isDiscount) ? Math.abs((Number(item.price) || 0) * (Number(item.quantity) || 0)) : 0),
    0,
  );
  const displaySubtotal = subtotal + cartDiscountTotal;
  const normalizedPaymentLines = normalizePaymentBreakdown(paymentLines);
  const visiblePaymentLines = normalizedPaymentLines.filter((line) => Number(line.amount || 0) > 0.009);
  const paymentLinesForDisplay = visiblePaymentLines.length > 0 ? visiblePaymentLines : normalizedPaymentLines.slice(0, 1);
  const rawCurrentPaymentLine = paymentLines[0] || createPaymentLine({ method: selectedPayment || 'Efectivo', amount: subtotal, installments: installments || 1, cashReceived: '' });
  const rawSplitPrimaryLine = paymentLines[0] || createPaymentLine({ id: 'split_primary', method: selectedPayment || 'Efectivo', amount: subtotal, installments: installments || 1, cashReceived: '' });
  const rawSplitSecondaryLine = paymentLines[1] || createPaymentLine({ id: 'split_secondary', method: getDefaultSplitSecondaryMethod(rawSplitPrimaryLine.method), amount: 0, cashReceived: '' });
  const currentPaymentLine = normalizedPaymentLines[0] || createPaymentLine({ method: selectedPayment || 'Efectivo', amount: subtotal, installments: installments || 1 });
  const splitPrimaryLine = normalizedPaymentLines[0] || createPaymentLine({ id: 'split_primary', method: selectedPayment || 'Efectivo', amount: subtotal, installments: installments || 1 });
  const splitSecondaryLine = normalizedPaymentLines[1] || createPaymentLine({ id: 'split_secondary', method: getDefaultSplitSecondaryMethod(splitPrimaryLine.method), amount: 0 });
  const currentPaymentMethod = rawCurrentPaymentLine.method || currentPaymentLine.method || selectedPayment || 'Efectivo';
  const currentInstallments = currentPaymentMethod === 'Credito' ? Number(currentPaymentLine.installments || installments || 1) : 1;
  const currentCashInputValue = getEditableCashInputValue(rawCurrentPaymentLine);
  const paymentTotals = getPaymentBreakdownTotals(paymentLinesForDisplay);
  const assignedBaseTotal = paymentLinesForDisplay.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const remainingBaseAmount = Math.round((subtotal - assignedBaseTotal) * 100) / 100;
  const hasOverassignedPayments = remainingBaseAmount < 0;
  const total = paymentTotals.chargedTotal;
  const cashReceivedAmount = paymentTotals.cashReceivedTotal;
  const cashChangeAmount = paymentTotals.cashChangeTotal;
  const cashMissingAmount = paymentTotals.cashMissingTotal;
  const paymentSummary = getPaymentSummary(paymentLinesForDisplay);
  const hasTypedCashAmount = currentPaymentMethod === 'Efectivo' && currentCashInputValue !== '';
  const splitSecondaryDisabled = Number(splitSecondaryLine.amount || 0) <= 0.009;
  const pointsToEarn = Math.floor(Math.max(0, total) / 500);
  const pointsToSpend = cart.reduce((acc, item) => acc + (item.isReward ? Number(item.pointsCost || 0) : 0), 0);
  const netPointsDelta = pointsToEarn - pointsToSpend;
  const discountBaseTotal = getDiscountBaseTotal();
  const isGuestSelectedClient = Boolean(selectedClient && (selectedClient.id === 'guest' || selectedClient.id === 0));
  const hasVisibleSelectedClient = Boolean(selectedClient);
  const pointsHeaderTone = !hasVisibleSelectedClient
    ? ''
    : isGuestSelectedClient
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : netPointsDelta >= 0
        ? 'border-green-200 bg-green-50 text-green-700'
        : 'border-rose-200 bg-rose-50 text-rose-700';
  const pointsHeaderText = !hasVisibleSelectedClient
    ? ''
    : isGuestSelectedClient
      ? `Se pierden ${pointsToEarn} Puntos`
      : netPointsDelta >= 0
        ? `Puntos ganados: ${netPointsDelta}`
        : `Puntos canjeados: ${Math.abs(netPointsDelta)}`;

  const buildTwoPaymentLines = useCallback((primaryInput = {}, secondaryInput = {}) => {
    const safeSubtotal = Math.max(0, roundPaymentValue(subtotal));
    const primaryMethod = primaryInput.method || selectedPayment || 'Efectivo';
    const secondaryMethod = secondaryInput.method || getDefaultSplitSecondaryMethod(primaryMethod);
    const primaryAmount = Math.min(Math.max(0, roundPaymentValue(primaryInput.amount)), safeSubtotal);
    const secondaryAmount = Math.max(0, roundPaymentValue(safeSubtotal - primaryAmount));

    return [
      createPaymentLine({
        id: primaryInput.id || 'split_primary',
        method: primaryMethod,
        amount: primaryAmount,
        installments: primaryMethod === 'Credito' ? Number(primaryInput.installments || 1) : 1,
        cashReceived: '',
      }),
      createPaymentLine({
        id: secondaryInput.id || 'split_secondary',
        method: secondaryMethod,
        amount: secondaryAmount,
        installments: secondaryMethod === 'Credito' ? Number(secondaryInput.installments || 1) : 1,
        cashReceived: '',
      }),
    ];
  }, [selectedPayment, subtotal]);

  const handleToggleSplitPaymentMode = () => {
    if (cart.length === 0 || subtotal <= 0) return;

    if (isSplitPaymentMode) {
      const primaryLine = paymentLines[0] || createPaymentLine({ method: selectedPayment || 'Efectivo', amount: subtotal, installments: installments || 1, cashReceived: '' });
      const nextInstallments = primaryLine.method === 'Credito' ? Number(primaryLine.installments || 1) : 1;
      setPaymentLines([
        createPaymentLine({
          method: primaryLine.method || 'Efectivo',
          amount: subtotal,
          installments: nextInstallments,
          cashReceived: primaryLine.method === 'Efectivo' ? getEditableCashInputValue(primaryLine) : '',
        }),
      ]);
      setSelectedPayment?.(primaryLine.method || 'Efectivo');
      setInstallments?.(nextInstallments);
      setActiveSplitLineIndex(0);
      setIsSplitPaymentMode(false);
      return;
    }

    const primaryLine = paymentLines[0] || createPaymentLine({ method: selectedPayment || 'Efectivo', amount: subtotal, installments: installments || 1, cashReceived: '' });
    const secondarySeed = createPaymentLine({
      id: 'split_secondary',
      method: getDefaultSplitSecondaryMethod(primaryLine.method),
      amount: 0,
    });
    const nextLines = buildTwoPaymentLines(
      { ...primaryLine, id: 'split_primary', amount: subtotal },
      secondarySeed,
    );

    setPaymentLines(nextLines);
    setActiveSplitLineIndex(0);
    setIsSplitPaymentMode(true);
  };

  const handleSelectPaymentMethod = (methodId) => {
    if (isSplitPaymentMode) {
      handleSplitMethodChange(activeSplitLineIndex, methodId);
      return;
    }
    const nextInstallments = methodId === 'Credito' ? Number(installments || 1) : 1;
    setSelectedPayment?.(methodId);
    if (methodId !== 'Credito') {
      setInstallments?.(1);
    }
    setPaymentLines([
      createPaymentLine({
        method: methodId,
        amount: subtotal,
        installments: nextInstallments,
        cashReceived: methodId === 'Efectivo' ? '' : '',
      }),
    ]);
  };

  const handleInstallmentsChange = (value) => {
    const nextInstallments = Number(value) || 1;
    setInstallments?.(nextInstallments);
    setPaymentLines((prev) => {
      const currentLine = prev[0] || createPaymentLine({ method: 'Credito', amount: subtotal });
      return [{ ...currentLine, method: 'Credito', amount: subtotal, installments: nextInstallments }];
    });
  };

  const handleCashReceivedChange = (value) => {
    const nextValue = normalizePaymentInputValue(value);
    setPaymentLines((prev) => {
      const currentLine = prev[0] || createPaymentLine({ method: 'Efectivo', amount: subtotal, cashReceived: '' });
      return [{ ...currentLine, method: 'Efectivo', amount: subtotal, cashReceived: nextValue }];
    });
  };

  const handleSplitMethodChange = (lineIndex, methodId) => {
    setPaymentLines((prev) => {
      const currentPrimary = prev[0] || createPaymentLine({ id: 'split_primary', method: selectedPayment || 'Efectivo', amount: subtotal, installments: installments || 1, cashReceived: '' });
      const currentSecondary = prev[1] || createPaymentLine({ id: 'split_secondary', method: getDefaultSplitSecondaryMethod(currentPrimary.method), amount: 0, cashReceived: '' });
      const nextPrimary = lineIndex === 0 ? { ...currentPrimary, method: methodId, installments: methodId === 'Credito' ? Number(currentPrimary.installments || 1) : 1, cashReceived: methodId === 'Efectivo' ? (currentPrimary.cashReceived ?? '') : '' } : currentPrimary;
      const nextSecondary = lineIndex === 1 ? { ...currentSecondary, method: methodId, installments: methodId === 'Credito' ? Number(currentSecondary.installments || 1) : 1, cashReceived: methodId === 'Efectivo' ? (currentSecondary.cashReceived ?? '') : '' } : currentSecondary;
      setActiveSplitLineIndex(lineIndex);
      if (lineIndex === 0) {
        setSelectedPayment?.(methodId);
        setInstallments?.(methodId === 'Credito' ? Number(nextPrimary.installments || 1) : 1);
      }
      return buildTwoPaymentLines(nextPrimary, nextSecondary);
    });
  };

  const handleSplitPrimaryAmountChange = (value) => {
    setPaymentLines((prev) => {
      const currentPrimary = prev[0] || createPaymentLine({ id: 'split_primary', method: selectedPayment || 'Efectivo', amount: subtotal, installments: installments || 1, cashReceived: '' });
      const currentSecondary = prev[1] || createPaymentLine({ id: 'split_secondary', method: getDefaultSplitSecondaryMethod(currentPrimary.method), amount: 0, cashReceived: '' });
      return buildTwoPaymentLines({ ...currentPrimary, amount: value === '' ? 0 : value }, currentSecondary);
    });
  };

  const handleSplitInstallmentsChange = (lineIndex, value) => {
    const nextInstallments = Number(value) || 1;
    setPaymentLines((prev) => {
      const currentPrimary = prev[0] || createPaymentLine({ id: 'split_primary', method: selectedPayment || 'Efectivo', amount: subtotal, installments: installments || 1, cashReceived: '' });
      const currentSecondary = prev[1] || createPaymentLine({ id: 'split_secondary', method: getDefaultSplitSecondaryMethod(currentPrimary.method), amount: 0, cashReceived: '' });
      const nextPrimary = lineIndex === 0 ? { ...currentPrimary, installments: nextInstallments } : currentPrimary;
      const nextSecondary = lineIndex === 1 ? { ...currentSecondary, installments: nextInstallments } : currentSecondary;
      if (lineIndex === 0) {
        setInstallments?.(nextPrimary.method === 'Credito' ? nextInstallments : 1);
      }
      return buildTwoPaymentLines(nextPrimary, nextSecondary);
    });
  };

  const filteredProducts = useMemo(() => {
    const searchString = (posSearch || '').toLowerCase().trim();
    const searchWords = searchString ? searchString.split(/\s+/) : [];

    return (inventory || []).filter((product) => {
      if (!getProductActiveState(product)) return false;
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

  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      switch (sortBy) {
        case 'recent': {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        }
        case 'price-desc':
          return (Number(b.price) || 0) - (Number(a.price) || 0);
        case 'price-asc':
          return (Number(a.price) || 0) - (Number(b.price) || 0);
        case 'stock-desc':
          return (Number(b.stock) || 0) - (Number(a.stock) || 0);
        case 'stock-asc':
          return (Number(a.stock) || 0) - (Number(b.stock) || 0);
        case 'title-asc':
        default:
          return (a.title || '').localeCompare(b.title || '');
      }
    });
  }, [filteredProducts, sortBy]);

  const sortOptions = [
    { value: 'title-asc', label: 'A-Z (Alfabetico)' },
    { value: 'recent', label: 'Mas Recientes' },
    { value: 'price-desc', label: 'Mayor Precio' },
    { value: 'price-asc', label: 'Menor Precio' },
    { value: 'stock-desc', label: 'Mayor Stock' },
    { value: 'stock-asc', label: 'Menos Stock' },
  ];
  const selectedSortOption = sortOptions.find((option) => option.value === sortBy) || sortOptions[0];
  const visibleSortOptions = sortOptions.filter((option) =>
    option.label.toLowerCase().includes(sortFilterSearch.trim().toLowerCase())
  );
  const visibleCategoryOptions = (categories || []).filter((category) =>
    String(category || '').toLowerCase().includes(categoryFilterSearch.trim().toLowerCase())
  );

  const handleScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 400) {
      if (visibleCount < sortedProducts.length) {
        setVisibleCount((prev) => prev + POS_BATCH_SIZE);
      }
    }
  };

  const displayedProducts = useMemo(
    () => sortedProducts.slice(0, visibleCount),
    [sortedProducts, visibleCount]
  );
  const productsByCategory = useMemo(
    () =>
      (categories || []).reduce((acc, categoryName) => {
        acc[categoryName] = (inventory || []).filter((product) =>
          getProductActiveState(product) &&
          (Array.isArray(product.categories)
            ? product.categories.includes(categoryName)
            : product.category === categoryName)
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

  useEffect(() => {
    setPaymentLines((prev) => {
      if (cart.length === 0) return prev;

      const serializeLines = (items) => JSON.stringify(
        items.map((line) => ({
          id: line.id,
          method: line.method,
          amount: roundPaymentValue(line.amount || 0),
          installments: Number(line.installments || 1),
          cashReceived: line.cashReceived ?? '',
        })),
      );

      if (isSplitPaymentMode) {
        const nextLines = buildTwoPaymentLines(
          prev[0] || createPaymentLine({ id: 'split_primary', method: selectedPayment || 'Efectivo', amount: subtotal, installments: installments || 1, cashReceived: '' }),
          prev[1] || createPaymentLine({ id: 'split_secondary', method: getDefaultSplitSecondaryMethod(selectedPayment || 'Efectivo'), amount: 0, cashReceived: '' }),
        );
        return serializeLines(prev.slice(0, 2)) === serializeLines(nextLines) ? prev : nextLines;
      }

      const currentLine = prev[0] || createPaymentLine({ method: selectedPayment || 'Efectivo', amount: subtotal, installments: installments || 1, cashReceived: '' });
      const nextLine = createPaymentLine({
        id: currentLine.id,
        method: currentLine.method || selectedPayment || 'Efectivo',
        amount: subtotal,
        installments: currentLine.method === 'Credito' ? Number(currentLine.installments || installments || 1) : 1,
        cashReceived: currentLine.method === 'Efectivo' ? getEditableCashInputValue(currentLine) : '',
      });

      return serializeLines([currentLine]) === serializeLines([nextLine]) ? prev : [nextLine];
    });
  }, [buildTwoPaymentLines, cart.length, isSplitPaymentMode, subtotal, selectedPayment, installments]);

  return (
    <div className="pos-view flex h-full overflow-hidden bg-slate-100 relative">
      
      {/* COLUMNA IZQUIERDA: CATÁLOGO */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        
        {/* Header POS */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 bg-white border-b p-2 min-[1920px]:gap-3 min-[1920px]:p-3 shrink-0 z-30 relative">
          
          {/* BOTÓN DE OFERTAS */}
          <div className="grid min-w-0 grid-cols-[max-content_220px_176px_218px] min-[1536px]:grid-cols-[max-content_240px_190px_230px] min-[1920px]:grid-cols-[max-content_280px_220px_250px] items-center gap-1.5 min-[1920px]:gap-2">
          <div className="flex min-w-0 items-center gap-1.5 shrink-0">
            {selectableOffers.length > 0 && (
              <button 
                onClick={() => setIsOffersDrawerOpen(true)}
                className="flex h-8 min-[1920px]:h-9 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 text-[11px] font-black uppercase tracking-wide text-violet-700 shadow-sm transition-colors hover:bg-violet-100 min-[1920px]:text-xs"
                title="Ver Combos y Ofertas"
              >
                <TicketPercent size={15} />
                <span className="hidden min-[1440px]:inline">Combos</span>
              </button>
            )}
            <button
              onClick={() => setIsDiscountDrawerOpen(true)}
              disabled={discountBaseTotal <= 0}
              className={`flex h-8 min-[1920px]:h-9 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-black uppercase tracking-wide shadow-sm transition-colors min-[1920px]:text-xs ${
                discountBaseTotal > 0
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
              }`}
              title={discountBaseTotal > 0 ? 'Aplicar descuento manual' : 'Agrega productos para habilitar descuentos'}
            >
              <TicketPercent size={15} />
              <span className="hidden min-[1440px]:inline">Descuentos</span>
            </button>
          </div>

          <div className="relative min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Buscar producto..."
              className="h-8 min-[1920px]:h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-9 text-xs min-[1920px]:text-sm font-semibold text-slate-700 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
              value={posSearch}
              onChange={(e) => setPosSearch(e.target.value)}
              onKeyDown={handlePosSearchKeyDown}
              autoFocus
            />
            {posSearch.trim() !== '' && (
              <button
                type="button"
                onClick={() => setPosSearch('')}
                className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                title="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => setShowCategoryMenu((prev) => !prev)}
              className={`flex h-8 min-[1920px]:h-9 w-full items-center gap-1.5 rounded-lg border px-2 text-left text-xs font-semibold transition-all min-[1920px]:text-sm ${
                showCategoryMenu || selectedCategory !== 'Todas'
                  ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
              }`}
              title="Filtrar por categoria"
            >
              <Filter size={14} className={selectedCategory !== 'Todas' ? 'text-fuchsia-500' : 'text-slate-400'} />
              <span className="min-w-0 flex-1 truncate">{selectedCategory}</span>
              <ChevronDown size={13} className={`shrink-0 text-slate-400 transition-transform ${showCategoryMenu ? 'rotate-180' : ''}`} />
            </button>
            {showCategoryMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowCategoryMenu(false)} />
                <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  <div className="relative mb-2">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={categoryFilterSearch}
                      onChange={(event) => setCategoryFilterSearch(event.target.value)}
                      placeholder="Buscar filtro..."
                      className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-fuchsia-300 focus:bg-white focus:ring-2 focus:ring-fuchsia-100"
                      autoFocus
                    />
                  </div>
                  <div className="custom-scrollbar max-h-64 overflow-y-auto pr-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory('Todas');
                        setShowCategoryMenu(false);
                        setCategoryFilterSearch('');
                      }}
                      className={`mb-1 flex h-8 w-full items-center rounded-lg px-2 text-left text-xs font-bold transition ${
                        selectedCategory === 'Todas'
                          ? 'bg-fuchsia-50 text-fuchsia-700'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Todas
                    </button>
                    {visibleCategoryOptions.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(cat);
                          setShowCategoryMenu(false);
                          setCategoryFilterSearch('');
                        }}
                        className={`flex h-8 w-full items-center rounded-lg px-2 text-left text-xs font-bold transition ${
                          selectedCategory === cat
                            ? 'bg-fuchsia-50 text-fuchsia-700'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                        title={cat}
                      >
                        <span className="truncate">{cat}</span>
                      </button>
                    ))}
                    {visibleCategoryOptions.length === 0 && (
                      <p className="px-2 py-3 text-center text-xs font-semibold text-slate-400">Sin filtros</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => setShowSortMenu((prev) => !prev)}
              className={`flex h-8 min-[1920px]:h-9 w-full items-center gap-1.5 rounded-lg border px-2 text-left text-xs font-semibold transition-all min-[1920px]:text-sm ${
                showSortMenu || sortBy !== 'title-asc'
                  ? 'border-sky-200 bg-sky-50 text-sky-700 shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
              }`}
              title="Organizar productos"
            >
              <ArrowDownUp size={14} className={sortBy !== 'title-asc' ? 'text-sky-500' : 'text-slate-400'} />
              <span className="min-w-0 flex-1 truncate">{selectedSortOption.label}</span>
              <ChevronDown size={13} className={`shrink-0 text-slate-400 transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  <div className="relative mb-2">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={sortFilterSearch}
                      onChange={(event) => setSortFilterSearch(event.target.value)}
                      placeholder="Buscar orden..."
                      className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100"
                      autoFocus
                    />
                  </div>
                  <div className="custom-scrollbar max-h-64 overflow-y-auto pr-1">
                    {visibleSortOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setSortBy(option.value);
                          setShowSortMenu(false);
                          setSortFilterSearch('');
                        }}
                        className={`flex h-8 w-full items-center rounded-lg px-2 text-left text-xs font-bold transition ${
                          sortBy === option.value
                            ? 'bg-sky-50 text-sky-700'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                        title={option.label}
                      >
                        <span className="truncate">{option.label}</span>
                      </button>
                    ))}
                    {visibleSortOptions.length === 0 && (
                      <p className="px-2 py-3 text-center text-xs font-semibold text-slate-400">Sin opciones</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="hidden">
            <select className="w-full px-3 py-2.5 border rounded-xl bg-slate-50 font-medium text-sm outline-none focus:ring-2 focus:ring-fuchsia-500 appearance-none cursor-pointer" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              <option value="Todas">Categorías</option>
              {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">?</div>
          </div>
          </div>
          <div className="flex items-center gap-1.5 min-[1920px]:gap-2">
            {posViewMode === 'grid' && (
              <div className="relative">
                <button onClick={() => setShowGridMenu(!showGridMenu)} className={`flex h-8 min-[1920px]:h-9 w-9 items-center justify-center rounded-lg border transition-all ${showGridMenu ? 'bg-slate-100 ring-2 ring-slate-200' : 'bg-white hover:bg-slate-50'}`}><SlidersHorizontal size={17} className="text-slate-600" /></button>
                {showGridMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowGridMenu(false)}></div>
                    <div className="absolute top-full right-0 mt-2 w-60 bg-white rounded-xl shadow-2xl border border-slate-200 p-5 z-50 animate-in fade-in zoom-in-95">
                      <div className="flex justify-between items-center mb-4"><span className="text-xs font-bold text-slate-500 uppercase">Tamaño</span><span className="text-xs font-bold text-fuchsia-600 bg-fuchsia-50 px-2 py-1 rounded-md border border-fuchsia-100">{Math.min(gridColumns, maxGridColumns)}x</span></div>
                      <div className="relative h-6 flex items-center"><input type="range" min="4" max={maxGridColumns} step="1" value={Math.min(gridColumns, maxGridColumns)} onChange={(e) => setGridColumns(Number(e.target.value))} className="custom-range w-full" /></div>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="flex h-8 min-[1920px]:h-9 items-center rounded-lg border bg-slate-100 p-0.5">
              <button onClick={() => setPosViewMode('grid')} className={`flex h-full items-center rounded-md px-2 transition-all ${posViewMode === 'grid' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={17} /></button>
              <button onClick={() => setPosViewMode('list')} className={`flex h-full items-center rounded-md px-2 transition-all ${posViewMode === 'list' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><List size={17} /></button>
              <button onClick={() => setPosViewMode('compact')} className={`flex h-full items-center rounded-md px-2 transition-all ${posViewMode === 'compact' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Vista Mostrador"><ScanBarcode size={17} /></button>
            </div>
          </div>
        </div>

        {/* Grid / Lista de Productos con onScroll */}
        <div className="flex-1 overflow-y-auto p-2.5 min-[1920px]:p-3 custom-scrollbar bg-slate-100/50" onScroll={handleScroll}>
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
            <div className="grid gap-2 transition-all duration-300 min-[1920px]:gap-2.5" style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}>
              
              {/* TARJETA: ARTÍCULO PERSONALIZADO (GRILLA) */}
              <button
                onClick={() => setIsCustomModalOpen(true)}
                className="group flex min-h-[104px] flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-fuchsia-300 bg-fuchsia-50 text-center shadow-sm transition-all hover:border-fuchsia-400 hover:bg-fuchsia-100 hover:shadow-md active:scale-[0.98] min-[1920px]:min-h-[124px]"
              >
                <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-white text-fuchsia-500 shadow-sm transition-transform group-hover:scale-110 min-[1920px]:mb-2 min-[1920px]:h-10 min-[1920px]:w-10">
                  <Wand2 size={18} />
                </div>
                <span className={`font-bold text-fuchsia-700 leading-snug px-2 ${gridColumns > 6 ? 'text-[10px]' : 'text-xs min-[1920px]:text-sm'}`}>Articulo Libre</span>
                <span className={`text-fuchsia-500 mt-1 ${gridColumns > 6 ? 'text-[9px]' : 'text-[10px]'}`}>Precio manual</span>
              </button>

              {displayedProducts.map((product) => {
                const effectiveStock = getEffectiveStock(product.id, product.stock);
                const isOutOfStock = effectiveStock <= 0;
                const isWeight = product.product_type === 'weight';
                let stockBadgeClass = effectiveStock > (isWeight ? 500 : 10) ? 'bg-green-100 text-green-700' : effectiveStock > (isWeight ? 100 : 5) ? 'bg-amber-100 text-amber-700' : effectiveStock > 0 ? 'bg-red-100 text-red-700' : 'border border-slate-500 bg-slate-900 text-white';
                
                const expired = isProductExpired(product.expiration_date);
                const productImage = getProductImageUrl(product);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      if (!isOutOfStock) handleProductClick(product);
                    }}
                    onMouseEnter={(event) => updateProductHoverPreview(event, product, productImage)}
                    onMouseMove={(event) => updateProductHoverPreview(event, product, productImage)}
                    onMouseLeave={clearProductHoverPreview}
                    onBlur={clearProductHoverPreview}
                    aria-disabled={isOutOfStock}
                    className={`group relative flex flex-col overflow-hidden rounded-lg border text-left shadow-sm transition-all hover:shadow-md ${isOutOfStock ? 'cursor-not-allowed border-slate-300 bg-slate-100 ring-1 ring-inset ring-slate-200' : 'bg-white hover:border-fuchsia-300 active:scale-[0.98]'}`}
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-slate-50 relative">
                      {productImage ? (<img src={productImage} alt={product.title} loading="lazy" decoding="async" fetchpriority="low" className={`w-full h-full object-cover transition-transform group-hover:scale-105 duration-500 ${isOutOfStock ? 'opacity-75 saturate-50' : ''}`} />) : (<div className="flex h-full w-full flex-col items-center justify-center bg-slate-200/50 p-2 text-center transition-colors group-hover:bg-slate-200"><span className={`line-clamp-3 font-bold uppercase leading-tight text-slate-500 ${gridColumns > 6 ? 'text-[9px]' : 'text-[11px] min-[1920px]:text-xs'}`}>{product.title}</span></div>)}
                      
                      {expired && !isOutOfStock && (
                        <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center z-10 pointer-events-none backdrop-blur-[0.5px]">
                           <span className="bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded shadow-md border border-red-800 flex items-center gap-1">
                             <AlertTriangle size={10} /> VENCIDO
                           </span>
                        </div>
                      )}

                      <div className={`absolute right-1.5 top-1.5 z-20 rounded px-1.5 py-0.5 text-[9px] font-bold shadow-sm backdrop-blur-sm min-[1920px]:right-2 min-[1920px]:top-2 min-[1920px]:px-2 min-[1920px]:text-[10px] ${stockBadgeClass}`}>
                        {isOutOfStock ? 'SIN STOCK' : (isWeight ? formatWeight(effectiveStock) : `${effectiveStock} u.`)}
                      </div>
                      
                      {isWeight && !isOutOfStock && (
                        <div className="absolute left-1.5 top-1.5 z-20 flex items-center gap-0.5 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm min-[1920px]:left-2 min-[1920px]:top-2">
                          <Scale size={8} /> PESO
                        </div>
                      )}
                    </div>
                    <div className={`z-20 flex w-full flex-1 flex-col ${isOutOfStock ? 'bg-slate-100' : 'bg-white'} ${gridColumns > 6 ? 'p-1.5' : 'p-2 min-[1920px]:p-2.5'}`}>
                      <h3 className={`mb-0.5 line-clamp-2 font-bold leading-snug ${gridColumns > 6 ? 'text-[10px]' : 'text-[12px] min-[1920px]:text-[13px]'} ${expired ? 'text-red-700' : isOutOfStock ? 'text-slate-600' : 'text-slate-800'}`} title={product.title}>
                        {product.title}
                      </h3>
                      <div className="mt-auto flex items-end justify-between pt-1">
                        <span className={`font-bold text-fuchsia-600 ${gridColumns > 6 ? 'text-[12px]' : 'text-sm min-[1920px]:text-base'}`}>
                          {isWeight ? (
                            <><FancyPrice amount={product.price * 1000} /><span className="text-[10px] font-medium text-fuchsia-400">/kg</span></>
                          ) : (
                            <><FancyPrice amount={product.price} /></>
                          )}
                        </span>
                        <div className={`h-4 w-4 rounded-full ${isWeight ? 'bg-amber-500' : 'bg-slate-900'} items-center justify-center text-white shadow-lg transition-colors min-[1920px]:h-5 min-[1920px]:w-5 ${gridColumns > 8 || isOutOfStock ? 'hidden' : 'flex'}`}>
                          {isWeight ? <Scale size={10} /> : <Plus size={12} />}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : posViewMode === 'compact' ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="sticky top-0 z-10 grid grid-cols-[112px_minmax(0,1.7fr)_104px_96px_42px] items-center gap-2 border-b border-slate-200 bg-slate-100/95 px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 backdrop-blur min-[1920px]:grid-cols-[136px_minmax(0,2.1fr)_128px_116px_48px]">
                <span className="truncate">Codigo</span>
                <span className="truncate">Producto</span>
                <span className="text-right">Stock</span>
                <span className="text-right">Precio</span>
                <span className="sr-only">Sumar</span>
              </div>

              <button
                onClick={() => setIsCustomModalOpen(true)}
                className="grid w-full grid-cols-[112px_minmax(0,1.7fr)_104px_96px_42px] items-center gap-2 border-b border-l-4 border-dashed border-b-fuchsia-100 border-l-fuchsia-400 bg-fuchsia-50/70 px-3 py-2 text-left transition hover:bg-fuchsia-50 active:scale-[0.995] min-[1920px]:grid-cols-[136px_minmax(0,2.1fr)_128px_116px_48px]"
              >
                <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-[11px] font-black uppercase tracking-[0.08em] text-fuchsia-500">
                  <Wand2 size={12} />
                  Libre
                </span>
                <span className="min-w-0 truncate text-[13px] font-black text-fuchsia-800">Articulo personalizado</span>
                <span className="truncate text-right text-[11px] font-bold text-fuchsia-500">Manual</span>
                <span className="truncate text-right text-[12px] font-black text-fuchsia-700">Precio</span>
                <span className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-white text-fuchsia-600 shadow-sm">
                  <Plus size={14} />
                </span>
              </button>

              {displayedProducts.map((product) => {
                const effectiveStock = getEffectiveStock(product.id, product.stock);
                const isOutOfStock = effectiveStock <= 0;
                const isWeight = product.product_type === 'weight';
                const expired = isProductExpired(product.expiration_date);
                const productImage = getProductImageUrl(product);
                const stockTone = isOutOfStock
                  ? 'border-l-slate-500 bg-slate-100 text-slate-500'
                  : expired
                    ? 'border-l-red-500 bg-red-50/50'
                    : effectiveStock <= (isWeight ? 200 : 5)
                      ? 'border-l-amber-400 bg-amber-50/45'
                      : 'border-l-emerald-400 bg-white';
                const stockText = isOutOfStock
                  ? 'Agotado'
                  : isWeight
                    ? formatWeight(effectiveStock)
                    : `${effectiveStock} u.`;

                return (
                  <button
                    key={product.id}
                    onClick={() => {
                      if (!isOutOfStock) handleProductClick(product);
                    }}
                    onMouseEnter={(event) => updateProductHoverPreview(event, product, productImage)}
                    onMouseMove={(event) => updateProductHoverPreview(event, product, productImage)}
                    onMouseLeave={clearProductHoverPreview}
                    onBlur={clearProductHoverPreview}
                    aria-disabled={isOutOfStock}
                    className={`grid w-full grid-cols-[112px_minmax(0,1.7fr)_104px_96px_42px] items-center gap-2 border-b border-l-4 border-b-slate-100 px-3 py-1.5 text-left transition last:border-b-0 hover:bg-fuchsia-50/40 active:scale-[0.995] min-[1920px]:grid-cols-[136px_minmax(0,2.1fr)_128px_116px_48px] ${stockTone} ${isOutOfStock ? 'cursor-not-allowed shadow-[inset_0_0_0_1px_rgba(148,163,184,0.25)]' : 'hover:border-l-fuchsia-400'}`}
                  >
                    <span className="min-w-0 truncate text-[11px] font-semibold leading-tight text-slate-400" title={product.barcode || 'Sin codigo'}>
                      <ScanBarcode size={11} className="mr-1 inline text-slate-300" />
                      {product.barcode || '-'}
                    </span>
                    <span className="min-w-0">
                      <span className={`block truncate text-[13px] font-black leading-tight ${expired ? 'text-red-700' : isOutOfStock ? 'text-slate-600' : 'text-slate-800'}`} title={product.title}>
                        {product.title}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] font-bold text-slate-400">
                        {isWeight && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700">
                            <Scale size={9} /> Peso
                          </span>
                        )}
                        {expired && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-red-700">
                            <AlertTriangle size={9} /> Vencido
                          </span>
                        )}
                        {!isWeight && !expired && (
                          <span className="truncate">{Array.isArray(product.categories) ? product.categories[0] : product.category || 'General'}</span>
                        )}
                      </span>
                    </span>
                    <span className={`truncate text-right text-[12px] font-black leading-tight ${isOutOfStock ? 'text-slate-400' : effectiveStock <= (isWeight ? 200 : 5) ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {stockText}
                    </span>
                    <span className="truncate text-right text-[13px] font-black leading-tight text-slate-900">
                      <FancyPrice amount={isWeight ? product.price * 1000 : product.price} />
                      {isWeight && <span className="text-[10px] font-medium text-slate-400">/kg</span>}
                    </span>
                    {!isOutOfStock ? (
                      <span className={`ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-sm transition ${isWeight ? 'bg-amber-500' : 'bg-slate-900'}`}>
                        {isWeight ? <Scale size={13} /> : <Plus size={14} />}
                      </span>
                    ) : (
                      <span className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-300">
                        <X size={13} />
                      </span>
                    )}
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
                const productImage = getProductImageUrl(product);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      if (!isOutOfStock) handleProductClick(product);
                    }}
                    onMouseEnter={(event) => updateProductHoverPreview(event, product, productImage)}
                    onMouseMove={(event) => updateProductHoverPreview(event, product, productImage)}
                    onMouseLeave={clearProductHoverPreview}
                    onBlur={clearProductHoverPreview}
                    aria-disabled={isOutOfStock}
                    className={`flex items-center gap-2.5 p-2.5 border rounded-xl shadow-sm hover:shadow-md transition-all text-left group ${isOutOfStock ? 'cursor-not-allowed border-slate-300 bg-slate-100 ring-1 ring-inset ring-slate-200' : 'bg-white hover:border-fuchsia-300 active:scale-[0.99]'}`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 border relative">
                      {productImage ? (<img src={productImage} alt="" loading="lazy" decoding="async" fetchpriority="low" className={`w-full h-full object-cover ${isOutOfStock ? 'opacity-75 saturate-50' : ''}`} />) : (<div className="w-full h-full flex items-center justify-center bg-slate-200 text-[8px] font-bold text-slate-500 p-1 text-center leading-none">{product.title.slice(0, 8)}..</div>)}
                      {isWeight && <div className="absolute bottom-0 right-0 bg-amber-500 rounded-tl px-1 py-0.5 z-20"><Scale size={8} className="text-white" /></div>}
                      
                      {expired && !isOutOfStock && (
                        <div className="absolute inset-0 bg-red-600/20 flex items-center justify-center backdrop-blur-[1px] z-10 pointer-events-none">
                          <AlertTriangle size={16} className="text-red-600 drop-shadow-md" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-bold text-sm truncate ${expired ? 'text-red-700' : isOutOfStock ? 'text-slate-600' : 'text-slate-800'}`}>
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

      <div
        onMouseDown={startCartResize}
        className="relative z-30 hidden w-2 shrink-0 cursor-col-resize bg-transparent md:block"
        title="Mover ancho de pedido actual"
      >
        <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-slate-200 transition-colors hover:bg-fuchsia-300" />
      </div>

      {/* COLUMNA DERECHA: CARRITO */}
      <div
        style={{ width: `${cartPanelWidth}px` }}
        className="bg-white border-l flex flex-col min-h-0 shadow-2xl z-20 shrink-0"
      >
        
        <div className="border-b bg-white px-3 py-2 min-[1920px]:py-2.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="inline-flex h-5 min-w-0 items-center gap-1.5 text-[14px] font-bold leading-none text-slate-800 min-[1920px]:h-6 min-[1920px]:text-[15px]">
              <ShoppingCart size={16} className="shrink-0 text-fuchsia-600 min-[1920px]:h-[18px] min-[1920px]:w-[18px]" /> Pedido Actual
            </h2>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {pointsHeaderText && (
                <span className={`inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 text-[9px] font-bold leading-none min-[1920px]:h-6 min-[1920px]:px-2 min-[1920px]:text-[10px] ${pointsHeaderTone}`}>
                  {pointsHeaderText}
                </span>
              )}
              <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-fuchsia-100 px-1.5 text-[10px] font-bold leading-none text-fuchsia-700 min-[1920px]:h-6 min-[1920px]:text-[11px]">
                {cart.reduce((acc, item) => acc + (item.product_type === 'weight' ? 1 : item.quantity), 0)} items
              </span>
            </div>
          </div>
          <div className="min-w-0">
            {hasVisibleSelectedClient ? (
              isGuestSelectedClient ? (
                <div className="mt-1 flex items-center gap-1.5 min-[1920px]:mt-1.5">
                  <div className="inline-flex h-5 items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-1.5 text-[9px] font-bold text-slate-600 shadow-sm min-[1920px]:h-6 min-[1920px]:py-1 min-[1920px]:text-[10px]">
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
                <div className="mt-1 rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 px-2 py-1 shadow-sm transition-colors min-[1920px]:py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div>
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-fuchsia-500 shadow-sm">
                              <User size={11} />
                            </span>
                  <span className="truncate text-[12px] font-bold text-slate-800 min-[1920px]:text-[13px]">
                              {selectedClient.name}
                              {selectedClient.memberNumber ? ` #${selectedClient.memberNumber}` : ''}
                            </span>
                          </div>
                          <div className="ml-auto flex shrink-0 items-center justify-end">
                            <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-600 min-[1920px]:text-[10px]">
                              {selectedClient.points} Puntos
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        onClick={openMemberRedeemPanel}
                        className="rounded-md border border-fuchsia-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-fuchsia-600 transition-colors hover:bg-fuchsia-50 min-[1920px]:text-[10px]"
                      >
                        Canjear
                      </button>
                      <button
                        onClick={() => setSelectedClient && setSelectedClient(null)}
                        className="rounded-md border border-slate-200 bg-white p-1 text-slate-400 transition-colors hover:text-red-500"
                        title="Quitar socio"
                      >
                        <UserMinus size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="mt-1 min-[1920px]:mt-1.5">
                <button
                  onClick={openMemberSelectPanel}
                  className="inline-flex h-5 items-center gap-1 rounded-md border border-fuchsia-200 bg-fuchsia-50 px-1.5 text-[9px] font-bold text-fuchsia-600 transition-colors hover:bg-fuchsia-100 hover:text-fuchsia-700 min-[1920px]:h-6 min-[1920px]:py-1 min-[1920px]:text-[10px]"
                >
                  <User size={11} /> Asignar socio
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 p-2 min-[1920px]:space-y-2 min-[1920px]:p-2.5">
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

              const cartItemImage = getProductImageUrl(item);
              const comboIncludedItems = isCombo && Array.isArray(item.productsIncluded)
                ? item.productsIncluded.map((includedItem) => {
                    const baseQuantity = Number(
                      includedItem.quantity ??
                      includedItem.qty ??
                      (includedItem.product_type === 'weight' ? 1000 : 1)
                    ) || (includedItem.product_type === 'weight' ? 1000 : 1);
                    return {
                      ...includedItem,
                      appliedQuantity: baseQuantity * Number(item.quantity || 1),
                    };
                  })
                : [];

              return (
                <div key={`${item.id}-${item.isReward ? 'r' : 'p'}`} className={`group flex gap-1.5 rounded-lg border p-1.5 shadow-sm transition-colors min-[1920px]:gap-2 min-[1920px]:p-2 ${item.isReward ? 'bg-fuchsia-50 border-fuchsia-100' : isWeight ? 'bg-amber-50/30 border-amber-100' : isDiscount ? 'bg-emerald-50/50 border-emerald-200' : isCustom ? 'bg-indigo-50/40 border-indigo-100' : isCombo ? 'bg-violet-50/50 border-violet-200' : 'bg-white hover:border-fuchsia-200'}`}>
                  <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border min-[1920px]:h-10 min-[1920px]:w-10 ${item.isReward ? 'bg-fuchsia-100' : isCombo ? 'bg-violet-100' : isDiscount ? 'bg-emerald-100' : 'bg-slate-50'}`}>
                    {cartItemImage ? (
                      <img src={cartItemImage} alt="" loading="lazy" decoding="async" fetchpriority="low" className="w-full h-full object-cover" />
                    ) : (
                      item.isReward ? (
                         <Gift size={17} className="text-fuchsia-500" />
                      ) : isDiscount ? (
                         <TicketPercent size={16} className="text-emerald-500" />
                      ) : isCustom ? (
                         <Wand2 size={16} className="text-indigo-400" />
                      ) : isCombo ? (
                         <TicketPercent size={16} className="text-violet-500" />
                      ) : (
                         <div className="flex h-full w-full items-center justify-center bg-slate-100 p-1 text-center text-[8px] font-bold leading-none text-slate-400 min-[1920px]:text-[9px]">{item.title.slice(0,12)}..</div>
                      )
                    )}
                    {isWeight && <div className="absolute bottom-0 right-0 bg-amber-500 rounded-tl px-0.5 py-0.5"><Scale size={7} className="text-white" /></div>}
                  </div>
                  
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className={`line-clamp-2 text-[11px] font-bold leading-tight min-[1920px]:text-[12px] ${item.isReward ? 'text-fuchsia-700' : isDiscount ? 'text-emerald-700' : isCustom ? 'text-indigo-800' : isCombo ? 'text-violet-800' : expired ? 'text-red-700' : 'text-slate-800'}`}>
                        {item.isReward && <Gift size={11} className="inline mr-1 text-fuchsia-500" />}
                        {item.title}
                        {expired && <AlertTriangle size={12} className="inline ml-1 text-red-500" title="¡Producto Vencido!" />}
                      </h4>
                      <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                    </div>

                    {comboIncludedItems.length > 0 && (
                      <div className="mt-1.5 rounded-lg border border-violet-100 bg-white/70 px-2 py-1">
                        <p className="mb-1 text-[8.5px] font-black uppercase tracking-[0.14em] text-violet-400">Incluye</p>
                        <div className="space-y-0.5">
                          {comboIncludedItems.slice(0, 3).map((includedItem, includedIndex) => {
                            const unitPrice = getComboIncludedUnitPrice(includedItem);
                            return (
                              <div key={`${item.id}-${includedItem.id || includedIndex}`} className="flex items-center justify-between gap-1.5 text-[9px] leading-tight text-violet-700">
                                <span className="min-w-0 truncate font-bold">{includedItem.title}</span>
                                <span className="shrink-0 rounded bg-violet-50 px-1 py-0.5 font-black">
                                  {formatComboIncludedQty(includedItem.appliedQuantity, includedItem.product_type)}
                                </span>
                                {unitPrice !== null && (
                                  <span className="shrink-0 font-bold text-violet-500">
                                    <FancyPrice amount={unitPrice} />{includedItem.product_type === 'weight' ? '/kg' : ' c/u'}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {comboIncludedItems.length > 3 && (
                            <p className="text-[9px] font-bold text-violet-400">+{comboIncludedItems.length - 3} productos mas</p>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-between items-end">
                      {isWeight ? (
                        <div className="flex items-center gap-1">
                          {isEditingWeight ? (
                            <div className="flex items-center gap-1">
                              <input type="number" min="1" autoFocus className="w-14 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[11px] font-bold text-center outline-none focus:ring-1 focus:ring-amber-500" value={editingWeightValue} onChange={(e) => setEditingWeightValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveWeightEdit(item.id); if (e.key === 'Escape') setEditingWeightItemId(null); }} onBlur={() => handleSaveWeightEdit(item.id)} />
                              <span className="text-[10px] text-amber-600 font-bold">g</span>
                            </div>
                          ) : (
                            <button onClick={() => { setEditingWeightItemId(item.id); setEditingWeightValue(String(item.quantity)); }} className="flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 transition-colors hover:bg-amber-200 min-[1920px]:rounded-lg min-[1920px]:text-[11px]" title="Click para editar gramos">
                              <Scale size={9} />
                              {formatWeight(item.quantity)}
                              <Edit2 size={8} className="ml-0.5 opacity-50" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 rounded-md border bg-slate-50 p-[2px]">
                          <button onClick={() => updateCartItemQty(item.id, item.quantity - 1)} className="flex h-4 w-4 items-center justify-center rounded bg-white shadow-sm hover:text-red-500 disabled:opacity-50 min-[1920px]:h-5 min-[1920px]:w-5" disabled={item.quantity <= 1 || item.isReward || isDiscount}><Minus size={10} /></button>
                          <input
                            type="number"
                            min="1"
                            max={Math.max(1, Number(item.stock) || 1)}
                            value={item.quantity}
                            onChange={(e) => {
                              if (e.target.value === '') return;
                              updateCartItemQty(item.id, e.target.value);
                            }}
                            className="h-4 w-9 rounded bg-white px-1 text-center text-[10px] font-bold text-slate-700 outline-none [appearance:textfield] min-[1920px]:h-5 min-[1920px]:w-11 min-[1920px]:text-[11px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            disabled={item.isReward || isCombo || isDiscount}
                          />
                          <button onClick={() => updateCartItemQty(item.id, item.quantity + 1)} className="flex h-4 w-4 items-center justify-center rounded bg-white shadow-sm hover:text-green-500 disabled:opacity-50 min-[1920px]:h-5 min-[1920px]:w-5" disabled={item.isReward || isCombo || isDiscount}><Plus size={10} /></button>
                        </div>
                      )}
                      <p className={`text-[12px] font-bold min-[1920px]:text-[13px] ${item.isReward ? 'text-fuchsia-600' : isDiscount ? 'text-emerald-600' : isCombo ? 'text-violet-700' : 'text-slate-800'}`}>
                        {item.isReward ? (
                          <span className="font-black text-fuchsia-600">-<FancyPrice amount={Math.abs(item.price * item.quantity)} /></span>
                        ) : isDiscount ? (
                          <span className="text-emerald-600 font-black">-<FancyPrice amount={Math.abs(item.price * item.quantity)} /></span>
                        ) : <FancyPrice amount={item.price * item.quantity} />}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="space-y-1 border-t bg-slate-50/95 p-1.5 min-[1920px]:space-y-1.5 min-[1920px]:p-2">
          <div className="grid grid-cols-5 gap-1">
            {PAYMENT_METHODS.map((method) => {
              const activeMethod = isSplitPaymentMode ? (activeSplitLineIndex === 1 ? rawSplitSecondaryLine.method : rawSplitPrimaryLine.method) : currentPaymentMethod;
              const isSelected = activeMethod === method.id;
              return (
                <button
                  key={method.id}
                  onClick={() => handleSelectPaymentMethod(method.id)}
                  className={`flex h-9 flex-col items-center justify-center rounded-lg border px-1 py-0.5 text-[9px] font-bold transition-all min-[1920px]:h-11 min-[1920px]:text-[10px] ${isSelected ? 'scale-[1.03] border-slate-800 bg-slate-800 text-white shadow-md' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-100'}`}
                >
                  {method.id === 'Efectivo' && <Banknote size={12} className="mb-0.5 min-[1920px]:h-[14px] min-[1920px]:w-[14px]" />}
                  {method.id === 'MercadoPago' && <Smartphone size={12} className="mb-0.5 min-[1920px]:h-[14px] min-[1920px]:w-[14px]" />}
                  {(method.id === 'Debito' || method.id === 'Credito') && <CreditCard size={12} className="mb-0.5 min-[1920px]:h-[14px] min-[1920px]:w-[14px]" />}
                  <span className="text-center leading-tight">{method.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={handleToggleSplitPaymentMode}
              className={`flex h-9 flex-col items-center justify-center rounded-lg border px-1 py-0.5 text-[9px] font-bold transition-all min-[1920px]:h-11 min-[1920px]:text-[10px] ${isSplitPaymentMode ? 'scale-[1.03] border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 shadow-md' : 'border-slate-200 bg-white text-slate-500 hover:border-fuchsia-200 hover:bg-fuchsia-50/50'}`}
            >
              <SlidersHorizontal size={12} className="mb-0.5 min-[1920px]:h-[14px] min-[1920px]:w-[14px]" />
              <span className="text-center leading-tight">Agregar otro pago</span>
            </button>
          </div>

          {isSplitPaymentMode ? (
            <div className="grid grid-cols-2 gap-1 animate-in fade-in slide-in-from-bottom-2">
              {[
                { key: 'primary', line: rawSplitPrimaryLine, normalizedLine: splitPrimaryLine, index: 0, amountEditable: true },
                { key: 'secondary', line: rawSplitSecondaryLine, normalizedLine: splitSecondaryLine, index: 1, amountEditable: false },
              ].map(({ key, line, normalizedLine, index, amountEditable }) => {
                const isCredit = line.method === 'Credito';
                const lineAmount = roundPaymentValue(normalizedLine.amount || line.amount || 0);
                const lineDisabled = !amountEditable && splitSecondaryDisabled;
                return (
                  <div key={key} onClick={() => setActiveSplitLineIndex(index)} className={`rounded-xl border px-2 py-1.5 transition-all ${activeSplitLineIndex === index ? 'border-fuchsia-300 bg-fuchsia-50/30 shadow-sm ring-1 ring-fuchsia-200' : lineDisabled ? 'border-slate-200 bg-slate-100/80' : 'border-slate-200 bg-slate-50/90'}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{getPaymentMethodLabel(line.method)}</span>
                      <HintIcon
                        hint={index === 1 ? "Hace click en este bloque y despues elegi el metodo desde los botones de arriba. Este pago completa automaticamente el dinero restante del total." : "Hace click en este bloque y despues elegi el metodo desde los botones de arriba."}
                        size={13}
                        side="left"
                        className="ml-auto shrink-0 rounded-full border border-slate-200 bg-white p-[1px] shadow-sm"
                      />
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={lineAmount}
                      placeholder="Monto"
                      onChange={amountEditable ? (e) => handleSplitPrimaryAmountChange(e.target.value) : undefined}
                      readOnly={!amountEditable}
                      disabled={!amountEditable}
                      className={`mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px] font-black shadow-sm outline-none placeholder:text-[11px] placeholder:font-bold placeholder:text-slate-400 [appearance:textfield] focus:border-fuchsia-300 focus:ring-2 focus:ring-fuchsia-100 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${amountEditable ? 'text-slate-800' : 'cursor-not-allowed text-slate-500'}`}
                    />
                    {isCredit && (
                      <select
                        className="mt-1 w-full rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 outline-none focus:ring-2 focus:ring-amber-300"
                        value={Number(line.installments || 1)}
                        onChange={(e) => handleSplitInstallmentsChange(index, e.target.value)}
                      >
                        <option value={1}>1 pago</option>
                        <option value={3}>3 cuotas</option>
                        <option value={6}>6 cuotas</option>
                        <option value={12}>12 cuotas</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {currentPaymentMethod === 'Credito' && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 animate-in fade-in slide-in-from-bottom-2">
                  <span className="whitespace-nowrap text-xs font-bold text-amber-700">Cuotas:</span>
                  <select
                    className="flex-1 rounded border border-amber-200 bg-white p-1 text-xs font-bold text-slate-700 outline-none"
                    value={currentInstallments}
                    onChange={(e) => handleInstallmentsChange(e.target.value)}
                  >
                    <option value={1}>1 pago</option>
                    <option value={3}>3 cuotas</option>
                    <option value={6}>6 cuotas</option>
                    <option value={12}>12 cuotas</option>
                  </select>
                </div>
              )}

              {currentPaymentMethod === 'Efectivo' && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white/90 px-2.5 py-1.5 shadow-sm transition-all focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-200 min-[1920px]:px-3 min-[1920px]:py-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={currentCashInputValue}
                      onChange={(e) => handleCashReceivedChange(e.target.value)}
                      placeholder="Ingresar el total en efectivo"
                      className="w-full appearance-none bg-transparent text-[13px] font-black text-slate-800 outline-none placeholder:text-slate-400 min-[1920px]:text-[15px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <HintIcon
                      hint="Ingresa el monto total de efectivo recibido para calcular el cambio del pedido."
                      size={13}
                      side="center-left"
                      tooltipClassName="w-[220px]"
                      className="shrink-0 rounded-full border border-emerald-200 bg-white/90 p-[1px] shadow-sm"
                    />
                  </div>

                  {hasTypedCashAmount && cashMissingAmount > 0 && (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-600">
                      Faltan <FancyPrice amount={cashMissingAmount} /> para completar el pago.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <div className="space-y-1 border-t border-slate-200 pt-1.5 min-[1920px]:space-y-1.5 min-[1920px]:pt-2">
            <div className="flex justify-between text-[11px] text-slate-500 min-[1920px]:text-xs"><span>Subtotal</span><span><FancyPrice amount={displaySubtotal} /></span></div>
            {cartDiscountTotal > 0 && (
              <div className="flex justify-between text-[11px] font-bold text-fuchsia-600 min-[1920px]:text-xs">
                <span>Descuentos</span>
                <span>-<FancyPrice amount={cartDiscountTotal} /></span>
              </div>
            )}
            <div className="flex justify-between text-[11px] text-slate-500 min-[1920px]:text-xs"><span>Pago</span><span>{paymentSummary}</span></div>
            {paymentTotals.surchargeTotal > 0 && (<div className="flex justify-between text-[11px] font-bold text-amber-600 min-[1920px]:text-xs"><span>Recargo credito</span><span>+<FancyPrice amount={paymentTotals.surchargeTotal} /></span></div>)}
            {!isSplitPaymentMode && cashReceivedAmount > 0 && <div className="flex justify-between text-[11px] text-slate-500 min-[1920px]:text-xs"><span>Efectivo recibido</span><span><FancyPrice amount={cashReceivedAmount} /></span></div>}
            {!isSplitPaymentMode && cashChangeAmount > 0 && <div className="flex justify-between text-[11px] font-bold text-emerald-600 min-[1920px]:text-xs"><span>Devolucion</span><span><FancyPrice amount={cashChangeAmount} /></span></div>}
            <div className="flex justify-between items-end pt-1.5 min-[1920px]:pt-2">
              <span className="text-[13px] font-bold text-slate-800 uppercase min-[1920px]:text-sm">Total a Pagar</span>
              <span className="text-[22px] font-black text-slate-900 min-[1920px]:text-[24px]"><FancyPrice amount={total} /></span>
            </div>
          </div>

          <AsyncActionButton onAction={() => runAction('checkout:pos', handlePreCheckout)} pending={isPending('checkout:pos')} loadingLabel="Cobrando..." disabled={cart.length === 0 || Math.abs(remainingBaseAmount) > 0.009 || hasOverassignedPayments || cashMissingAmount > 0} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 py-2.5 text-[14px] font-bold text-white shadow-lg transition-all hover:from-black hover:to-slate-900 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 min-[1920px]:py-3 min-[1920px]:text-[15px]">
            <CheckCircle className="group-hover:scale-110 transition-transform" />
            {cart.length === 0 ? 'CARRITO VACIO' : 'COBRAR'}
          </AsyncActionButton>
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
          inventory={inventory}
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
                              <p className="text-[10px] font-black text-slate-600">
                                {formatComboIncludedQty(line.requiredQty, line.product_type)}
                              </p>
                              <p className={`text-[10px] font-bold ${line.hasStock ? 'text-slate-400' : 'text-red-500'}`}>
                                Stock: {line.product_type === 'weight' ? formatWeight(line.remainingStock) : line.remainingStock}
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
                          if (!result.ok) showOfferApplyError(result, offer);
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

      {productHoverPreview && (
        <div
          className="pointer-events-none fixed z-[90] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: productHoverPreview.x,
            top: productHoverPreview.y,
            width: productHoverPreview.size,
          }}
        >
          <div
            className="bg-slate-100"
            style={{ width: productHoverPreview.size, height: productHoverPreview.size }}
          >
            <img
              src={productHoverPreview.src}
              alt={productHoverPreview.title}
              className="h-full w-full object-cover"
              decoding="async"
            />
          </div>
          <div className="border-t border-slate-100 bg-white px-2.5 py-2">
            <p className="truncate text-[11px] font-black leading-tight text-slate-800">
              {productHoverPreview.title}
            </p>
          </div>
        </div>
      )}

    </div>
  );
}










