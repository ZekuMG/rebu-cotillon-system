const CANONICAL_OFFER_OPTIONS = [
  {
    value: 'free',
    label: 'Gratis',
    description: 'Promos del estilo 2x1, 3x2 o 4x3 con una unidad bonificada.',
  },
  {
    value: 'fixed_price',
    label: 'Precio Fijo',
    description: 'Boton manual con un precio final definido para una seleccion puntual.',
  },
  {
    value: 'discount',
    label: 'Descuento',
    description: 'Descuento por unidad o sobre el total del conjunto.',
  },
  {
    value: 'coupon',
    label: 'Cupon',
    description: 'Codigo manual para aplicar descuentos sobre el total desde la caja.',
  },
  {
    value: 'wholesale',
    label: 'Mayorista',
    description: 'Requiere una cantidad minima y redefine el precio unitario.',
  },
  {
    value: 'combo',
    label: 'Combo',
    description: 'Armado fijo para el POS con productos concretos y precio final.',
  },
];

const CANONICAL_FILTER_OPTIONS = ['all', ...CANONICAL_OFFER_OPTIONS.map((option) => option.value)];

const LEGACY_FREE_TYPES = ['2x1', '3x2', '4x3'];
const LEGACY_COMBO_TYPES = ['Combo', 'Kit', 'Pack'];
const LEGACY_PERCENTAGE_PREFIX = 'PERCENTAGE:';

function parseLegacyPercentageValue(rawValue) {
  if (typeof rawValue !== 'string') return null;
  if (!rawValue.startsWith(LEGACY_PERCENTAGE_PREFIX)) return null;

  const parsedValue = Number(rawValue.slice(LEGACY_PERCENTAGE_PREFIX.length));
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

export const defaultCanonicalOfferForm = {
  name: '',
  benefitType: 'free',
  freeMode: '2x1',
  discountMode: 'unit',
  couponCode: '',
  scopeMode: 'products',
  categoryName: '',
  productsIncluded: [],
  itemsCount: '',
  discountValue: '',
  offerPrice: '',
  profitMargin: '',
};

export function getCanonicalOfferOptions() {
  return CANONICAL_OFFER_OPTIONS;
}

export function getCanonicalOfferFilterOptions() {
  return CANONICAL_FILTER_OPTIONS;
}

export function getCanonicalOfferTypeLabel(benefitType) {
  return (
    {
      free: 'Gratis',
      fixed_price: 'Precio Fijo',
      discount: 'Descuento',
      coupon: 'Cupon',
      wholesale: 'Mayorista',
      combo: 'Combo',
    }[benefitType] || 'Oferta'
  );
}

export function getCanonicalOfferSubtypeLabel(offerLike) {
  if (!offerLike) return '';

  if (offerLike.benefitType === 'free') return offerLike.freeMode || '2x1';
  if (offerLike.benefitType === 'coupon') return offerLike.couponCode || 'Sin codigo';
  if (offerLike.benefitType === 'discount') {
    if (offerLike.discountMode === 'total') return 'Total';
    if (offerLike.discountMode === 'percentage') return 'Porcentaje';
    return 'Por unidad';
  }

  return '';
}

export function getCanonicalOfferModeLabel(offerLike) {
  if (!offerLike) return 'Automatica';
  return offerLike.benefitType === 'combo' || offerLike.benefitType === 'fixed_price' || offerLike.benefitType === 'coupon'
    ? 'POS manual'
    : 'Automatica';
}

export function getCanonicalOfferAccent(benefitType) {
  switch (benefitType) {
    case 'combo':
    case 'fixed_price':
      return {
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'wholesale':
      return {
        badge: 'bg-emerald-200 text-emerald-900 border-emerald-300',
        chip: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };
    case 'discount':
      return {
        badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        chip: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };
    case 'coupon':
      return {
        badge: 'bg-emerald-200 text-emerald-900 border-emerald-300',
        chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'free':
    default:
      return {
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
  }
}

export function getOfferWizardGuide(offerLike) {
  if (!offerLike) {
    return 'Configura una regla y define los productos que van a participar.';
  }

  switch (offerLike.benefitType) {
    case 'free':
      return `Se activa cuando el cliente cumple la combinacion ${offerLike.freeMode || '2x1'} y bonifica una unidad.`;
    case 'fixed_price':
      return 'Funciona como un boton manual del POS con un precio final fijo para una seleccion puntual.';
    case 'discount':
      if (offerLike.discountMode === 'total') {
        return 'Resta un monto fijo sobre el total del conjunto elegido.';
      }
      if (offerLike.discountMode === 'percentage') {
        return 'Convierte un porcentaje en descuento compatible con el motor legacy actual.';
      }
      return 'Resta un monto fijo por cada unidad aplicable.';
    case 'coupon':
      return 'Genera un codigo manual para aplicar un descuento en el carrito del POS.';
    case 'wholesale':
      return 'Requiere una cantidad minima y redefine el precio unitario para compras por volumen.';
    case 'combo':
      return 'Arma un boton manual del POS con un conjunto fijo de productos y precio final.';
    default:
      return 'Configura una regla y define los productos que van a participar.';
  }
}

export function inferOfferScope(offer = {}, productsByCategory = {}, inventory = []) {
  const productIds = new Set((offer.productsIncluded || []).map((product) => String(product.id)));
  if (productIds.size === 0) {
    return { scopeMode: 'products', categoryName: '' };
  }

  const inventoryIds = new Set((inventory || []).map((product) => String(product.id)));
  if (inventoryIds.size > 0 && inventoryIds.size === productIds.size) {
    let matchesAllInventory = true;
    for (const productId of productIds) {
      if (!inventoryIds.has(productId)) {
        matchesAllInventory = false;
        break;
      }
    }
    if (matchesAllInventory) {
      return { scopeMode: 'all_products', categoryName: '' };
    }
  }

  for (const [categoryName, products] of Object.entries(productsByCategory)) {
    const categoryIds = new Set((products || []).map((product) => String(product.id)));
    if (categoryIds.size === 0 || categoryIds.size !== productIds.size) continue;

    let isExactMatch = true;
    for (const productId of productIds) {
      if (!categoryIds.has(productId)) {
        isExactMatch = false;
        break;
      }
    }

    if (isExactMatch) {
      return { scopeMode: 'category', categoryName };
    }
  }

  return { scopeMode: 'products', categoryName: '' };
}

export function normalizeLegacyOffer(offer = {}, productsByCategory = {}, inventory = []) {
  const base = {
    ...defaultCanonicalOfferForm,
    name: offer.name || '',
    productsIncluded: Array.isArray(offer.productsIncluded) ? offer.productsIncluded : [],
    itemsCount: offer.itemsCount || '',
    discountValue: offer.discountValue || '',
    offerPrice: offer.offerPrice || '',
    profitMargin: offer.profitMargin || '',
    couponCode: '',
  };

  const scope = inferOfferScope(offer, productsByCategory, inventory);
  base.scopeMode = scope.scopeMode;
  base.categoryName = scope.categoryName;

  if (LEGACY_FREE_TYPES.includes(offer.type)) {
    return {
      ...base,
      benefitType: 'free',
      freeMode: offer.type,
      itemsCount: Number(String(offer.type).charAt(0)) || 2,
    };
  }

  if (LEGACY_COMBO_TYPES.includes(offer.type)) {
    return {
      ...base,
      benefitType: 'combo',
      scopeMode: 'products',
      categoryName: '',
    };
  }

  if (offer.type === 'Mayorista') {
    return {
      ...base,
      benefitType: 'wholesale',
      scopeMode: scope.scopeMode,
    };
  }

  if (offer.type === 'Descuento Unidad' || offer.type === 'Descuento Total') {
    const storedPercentage = parseLegacyPercentageValue(offer.profitMargin);
    return {
      ...base,
      benefitType: 'discount',
      discountMode: storedPercentage !== null ? 'percentage' : offer.type === 'Descuento Total' ? 'total' : 'unit',
      discountValue: storedPercentage !== null ? storedPercentage : base.discountValue,
    };
  }

  if (offer.type === 'Cupon' || String(offer.applyTo || '').startsWith('Cupon:')) {
    return {
      ...base,
      benefitType: 'coupon',
      scopeMode: 'all_products',
      categoryName: '',
      productsIncluded: [],
      couponCode: String(offer.applyTo || '').startsWith('Cupon:')
        ? String(offer.applyTo).slice('Cupon:'.length)
        : '',
      discountMode: Number(offer.itemsCount) === 2 ? 'percentage' : 'total',
    };
  }

  return base;
}

export function buildLegacyOfferPayload(offerForm, productsByCategory = {}, inventory = []) {
  const selectedProducts =
    offerForm.scopeMode === 'all_products'
      ? inventory || []
      : offerForm.scopeMode === 'category' && offerForm.categoryName
      ? productsByCategory[offerForm.categoryName] || []
      : offerForm.productsIncluded || [];

  const productsIncluded = selectedProducts.map((product) => ({
    id: product.id,
    title: product.title,
    price: product.price,
    image: product.image,
  }));

  const payload = {
    name: offerForm.name.trim(),
    applyTo: 'Items',
    productsIncluded,
    itemsCount: Number(offerForm.itemsCount) || 0,
    discountValue: Number(offerForm.discountValue) || 0,
    offerPrice: Number(offerForm.offerPrice) || 0,
    profitMargin: offerForm.profitMargin || '',
  };

  switch (offerForm.benefitType) {
    case 'free':
      payload.type = offerForm.freeMode || '2x1';
      payload.itemsCount = Number(String(payload.type).charAt(0)) || payload.itemsCount || 2;
      break;
    case 'fixed_price':
      payload.type = 'Combo';
      payload.applyTo = 'Seleccion';
      break;
    case 'discount':
      if (offerForm.discountMode === 'percentage') {
        const percentage = Number(offerForm.discountValue) || 0;
        payload.type =
          offerForm.scopeMode === 'products' && selectedProducts.length <= 1
            ? 'Descuento Unidad'
            : 'Descuento Total';
        payload.discountValue = percentage;
        payload.profitMargin = `${LEGACY_PERCENTAGE_PREFIX}${percentage}`;
      } else {
        payload.type = offerForm.discountMode === 'total' ? 'Descuento Total' : 'Descuento Unidad';
        payload.profitMargin = '';
      }
      break;
    case 'coupon':
      payload.type = 'Cupon';
      payload.applyTo = `Cupon:${String(offerForm.couponCode || '').trim().toUpperCase()}`;
      payload.productsIncluded = [];
      payload.itemsCount = offerForm.discountMode === 'percentage' ? 2 : 1;
      break;
    case 'wholesale':
      payload.type = 'Mayorista';
      break;
    case 'combo':
    default:
      payload.type = 'Combo';
      payload.applyTo = 'Seleccion';
      break;
  }

  return payload;
}

export function validateOfferWizardForm(offerForm, productsByCategory = {}, inventory = []) {
  if (!offerForm.name.trim()) return 'Debe ingresar un nombre para la oferta.';

  if (offerForm.benefitType === 'coupon') {
    if (!String(offerForm.couponCode || '').trim()) return 'Debe indicar el codigo del cupon.';
    if (!Number(offerForm.discountValue)) {
      return offerForm.discountMode === 'percentage'
        ? 'Debe indicar el porcentaje del cupon.'
        : 'Debe indicar el monto del cupon.';
    }
    if (offerForm.discountMode === 'percentage' && Number(offerForm.discountValue) > 100) {
      return 'El porcentaje del cupon no puede superar 100.';
    }
    return null;
  }

  if (offerForm.scopeMode === 'all_products') {
    if ((inventory || []).length === 0) return 'No hay productos cargados en inventario.';
  } else if (offerForm.scopeMode === 'category') {
    if (!offerForm.categoryName) return 'Debe seleccionar una categoria.';
    const categoryProducts = productsByCategory[offerForm.categoryName] || [];
    if (categoryProducts.length === 0) {
      return 'La categoria elegida no tiene productos cargados.';
    }
  } else if ((offerForm.productsIncluded || []).length === 0) {
    return 'Debe incluir al menos un producto.';
  }

  if (offerForm.benefitType === 'combo' && offerForm.scopeMode !== 'products') {
    return 'Combo solo puede trabajar con productos seleccionados.';
  }

  if (offerForm.benefitType === 'fixed_price' && !Number(offerForm.offerPrice)) {
    return 'Debe indicar el precio final.';
  }

  if (offerForm.benefitType === 'discount') {
    if (!Number(offerForm.discountValue)) {
      return offerForm.discountMode === 'percentage'
        ? 'Debe indicar el porcentaje de descuento.'
        : 'Debe indicar el monto del descuento.';
    }
    if (offerForm.discountMode === 'percentage' && Number(offerForm.discountValue) > 100) {
      return 'El porcentaje no puede superar 100.';
    }
  }

  if (offerForm.benefitType === 'wholesale') {
    if (!Number(offerForm.itemsCount)) return 'Debe indicar la cantidad minima.';
    if (!Number(offerForm.offerPrice)) return 'Debe indicar el precio unitario mayorista.';
  }

  if (offerForm.benefitType === 'combo' && !Number(offerForm.offerPrice)) {
    return 'Debe indicar el precio final del combo.';
  }

  return null;
}
