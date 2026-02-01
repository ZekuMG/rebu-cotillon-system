import React, { useState, useMemo } from 'react';
import {
  Search,
  ShoppingCart,
  Trash2,
  CreditCard,
  AlertCircle,
  Grid,
  List,
  Tag,
  Maximize,
  Minimize,
  Monitor,
} from 'lucide-react';
import ProductImage from '../components/ProductImage';
import { PAYMENT_METHODS } from '../data';

export default function POSView({
  inventory,
  categories,
  addToCart,
  cart,
  removeFromCart,
  updateCartItemQty,
  selectedPayment,
  setSelectedPayment,
  installments,
  setInstallments,
  calculateTotal,
  handleCheckout,
  posSearch,
  setPosSearch,
}) {
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [gridSize, setGridSize] = useState('medium'); // 'small' | 'medium' | 'large'
  const [categoryFilter, setCategoryFilter] = useState('');

  const subtotal = cart.reduce(
    (t, i) => t + (Number(i.price) || 0) * (Number(i.quantity) || 0),
    0
  );
  const isCredit = selectedPayment === 'Credito';
  const surcharge = isCredit ? subtotal * 0.1 : 0;

  // Calcular stock disponible (stock real - cantidad en carrito)
  const getAvailableStock = (productId) => {
    const product = (inventory || []).find((p) => p.id === productId);
    if (!product) return 0;
    const cartItem = cart.find((c) => c.id === productId);
    const inCart = cartItem ? cartItem.quantity : 0;
    return Math.max(0, product.stock - inCart);
  };

  // Obtener cantidad en carrito para cada producto
  const getCartQty = (productId) => {
    const item = cart.find((c) => c.id === productId);
    return item ? item.quantity : 0;
  };

  // Filtrar por búsqueda y categoría, con stock ajustado
  const filteredInventory = useMemo(() => {
    return (inventory || [])
      .filter((item) => {
        const matchesSearch =
          item.title.toLowerCase().includes((posSearch || '').toLowerCase()) ||
          (item.brand &&
            item.brand.toLowerCase().includes((posSearch || '').toLowerCase()));

        // Soportar array de categorías
        const itemCategories =
          Array.isArray(item.categories) && item.categories.length > 0
            ? item.categories
            : item.category
            ? [item.category]
            : [];

        const matchesCategory =
          !categoryFilter || itemCategories.includes(categoryFilter);

        return matchesSearch && matchesCategory;
      })
      .map((item) => ({
        ...item,
        availableStock: getAvailableStock(item.id),
      }));
  }, [inventory, posSearch, categoryFilter, cart]);

  // --- LÓGICA DE GRILLA DINÁMICA ---
  const getGridClasses = () => {
    switch (gridSize) {
      case 'small': // 8 columnas aprox
        return 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2';
      case 'medium': // 6 columnas aprox
        return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3';
      case 'large': // 4 columnas aprox
        return 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
      default:
        return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
      {/* Listado de Productos */}
      <div className="lg:col-span-2 flex flex-col gap-3 h-full overflow-hidden">
        {/* Barra de búsqueda y filtros */}
        <div className="flex flex-wrap gap-2 shrink-0 bg-white p-2 border rounded-lg shadow-sm items-center">
          <div className="relative flex-1 min-w-[150px]">
            <Search
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
              size={14}
            />
            <input
              type="text"
              placeholder="Buscar producto..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
              value={posSearch}
              onChange={(e) => setPosSearch(e.target.value)}
            />
          </div>

          {/* Selector de categoría */}
          <div className="relative min-w-[120px]">
            <select
              className="w-full pl-2 pr-6 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none cursor-pointer appearance-none"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">Categorias</option>
              {(categories || []).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <Tag
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              size={12}
            />
          </div>

          <div className="h-6 w-px bg-slate-200 mx-1"></div>

          {/* Selector de Tamaño (Solo visible en modo Grid) */}
          {viewMode === 'grid' && (
            <div className="flex bg-slate-100 rounded p-0.5 border border-slate-200">
              <button
                onClick={() => setGridSize('small')}
                className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
                  gridSize === 'small'
                    ? 'bg-white shadow text-fuchsia-700'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                title="Chico (8 columnas)"
              >
                Chico
              </button>
              <button
                onClick={() => setGridSize('medium')}
                className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
                  gridSize === 'medium'
                    ? 'bg-white shadow text-fuchsia-700'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                title="Mediano (6 columnas)"
              >
                Mediano
              </button>
              <button
                onClick={() => setGridSize('large')}
                className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
                  gridSize === 'large'
                    ? 'bg-white shadow text-fuchsia-700'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                title="Grande (4 columnas)"
              >
                Grande
              </button>
            </div>
          )}

          {/* Botones de vista */}
          <div className="flex bg-slate-100 rounded p-0.5 border border-slate-200 ml-auto">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition ${
                viewMode === 'grid'
                  ? 'bg-white shadow text-fuchsia-700'
                  : 'text-slate-400'
              }`}
              title="Vista grilla"
            >
              <Grid size={14} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition ${
                viewMode === 'list'
                  ? 'bg-white shadow text-fuchsia-700'
                  : 'text-slate-400'
              }`}
              title="Vista lista"
            >
              <List size={14} />
            </button>
          </div>
        </div>

        {/* Contenedor de productos */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border p-3 overflow-y-auto">
          {viewMode === 'grid' ? (
            /* VISTA GRILLA DINÁMICA */
            <div className={`grid ${getGridClasses()}`}>
              {filteredInventory.map((item) => {
                const cartQty = getCartQty(item.id);
                const availableStock = item.availableStock;
                const isOutOfStock = availableStock <= 0;

                return (
                  <button
                    key={item.id}
                    onClick={() => !isOutOfStock && addToCart(item)}
                    disabled={isOutOfStock}
                    className={`p-2 rounded-lg border text-left transition-all hover:shadow-md flex flex-col h-full relative group ${
                      isOutOfStock
                        ? 'bg-slate-50 opacity-60 grayscale cursor-not-allowed'
                        : cartQty > 0
                        ? 'bg-fuchsia-50 border-fuchsia-400 ring-1 ring-fuchsia-200'
                        : 'bg-white hover:border-fuchsia-400'
                    }`}
                  >
                    {/* Badge de cantidad en carrito */}
                    {cartQty > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-fuchsia-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-lg z-10">
                        {cartQty}
                      </span>
                    )}

                    <div className="aspect-square rounded overflow-hidden mb-2 relative bg-slate-100">
                      <ProductImage
                        item={item}
                        className="w-full h-full object-contain"
                      />
                      {isOutOfStock && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[8px] font-bold text-white">
                          AGOTADO
                        </span>
                      )}
                    </div>

                    {/* Título y precio condicional al tamaño */}
                    <div className="mt-auto">
                      <h4
                        className={`font-bold text-slate-800 leading-tight mb-1 line-clamp-2 ${
                          gridSize === 'small' ? 'text-[9px]' : 'text-[11px]'
                        }`}
                      >
                        {item.title}
                      </h4>
                      <div className="flex justify-between items-end">
                        <span
                          className={`font-bold text-fuchsia-700 ${
                            gridSize === 'small' ? 'text-xs' : 'text-sm'
                          }`}
                        >
                          ${item.price.toLocaleString()}
                        </span>
                        {gridSize !== 'small' && (
                          <span
                            className={`text-[9px] px-1 py-0.5 rounded font-bold ${
                              availableStock <= 0
                                ? 'bg-slate-200 text-slate-500'
                                : availableStock < 5
                                ? 'bg-red-100 text-red-700'
                                : availableStock < 10
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {availableStock}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* VISTA LISTA COMPACTA */
            <div className="space-y-1">
              {filteredInventory.map((item) => {
                const cartQty = getCartQty(item.id);
                const availableStock = item.availableStock;
                const isOutOfStock = availableStock <= 0;

                return (
                  <button
                    key={item.id}
                    onClick={() => !isOutOfStock && addToCart(item)}
                    disabled={isOutOfStock}
                    className={`w-full p-2 rounded border text-left hover:bg-slate-50 flex items-center gap-3 ${
                      isOutOfStock ? 'opacity-60' : ''
                    } ${
                      cartQty > 0
                        ? 'border-fuchsia-300 bg-fuchsia-50'
                        : 'bg-white'
                    }`}
                  >
                    <div className="w-8 h-8 rounded bg-slate-200 shrink-0 overflow-hidden">
                      <ProductImage item={item} className="w-full h-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between">
                        <span className="text-xs font-bold text-slate-700 truncate">
                          {item.title}
                        </span>
                        <span className="text-xs font-bold text-fuchsia-700">
                          ${item.price.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>
                          {Array.isArray(item.categories)
                            ? item.categories.join(', ')
                            : item.category}
                        </span>
                        <span>Stock: {availableStock}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {filteredInventory.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-xs">
              <Search size={24} className="mb-2 opacity-50" />
              <p>Sin resultados.</p>
            </div>
          )}
        </div>
      </div>

      {/* Carrito */}
      <div className="bg-white rounded-xl shadow-lg border flex flex-col h-full overflow-hidden">
        <div className="p-3 border-b bg-slate-50 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
            <ShoppingCart size={16} /> Pedido Actual
          </h3>
          <span className="bg-fuchsia-100 text-fuchsia-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
            {cart.reduce((sum, item) => sum + item.quantity, 0)} items
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
              <ShoppingCart size={32} opacity={0.2} />
              <p className="text-xs">Carrito vacío</p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center p-2 bg-slate-50 border rounded group"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <p className="font-bold text-slate-800 text-xs truncate">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      min="1"
                      className="w-10 p-0.5 text-xs border rounded text-center font-bold focus:ring-1 focus:ring-fuchsia-500 outline-none"
                      value={item.quantity}
                      onChange={(e) =>
                        updateCartItemQty(item.id, e.target.value)
                      }
                    />
                    <span className="text-slate-500 text-[10px]">
                      x ${item.price.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-900">
                    ${(item.price * item.quantity).toLocaleString()}
                  </span>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-slate-300 hover:text-red-500 p-1"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-3 bg-slate-50 border-t space-y-2 shrink-0">
          <div>
            <div className="grid grid-cols-4 gap-1">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedPayment(m.id)}
                  className={`text-[9px] py-1 px-1 rounded border font-medium transition-colors truncate ${
                    selectedPayment === m.id
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                  title={m.label}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {isCredit && (
            <div className="flex items-center justify-between bg-white p-1.5 rounded border">
              <span className="text-[10px] font-bold text-slate-600 ml-1">
                Cuotas (+10%)
              </span>
              <select
                className="text-[10px] p-1 rounded border bg-slate-50 outline-none"
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
              >
                <option value={1}>1 pago</option>
                <option value={3}>3 cuotas</option>
                <option value={6}>6 cuotas</option>
                <option value={12}>12 cuotas</option>
              </select>
            </div>
          )}

          <div className="pt-2 border-t space-y-0.5">
            <div className="flex justify-between items-end text-[10px] text-slate-400">
              <span>Subtotal</span>
              <span>${subtotal.toLocaleString()}</span>
            </div>
            {isCredit && (
              <div className="flex justify-between items-end text-[10px] text-amber-600 font-bold">
                <span>Recargo</span>
                <span>+${surcharge.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between items-end">
              <span className="text-slate-500 text-xs font-bold">TOTAL</span>
              <span className="text-xl font-bold text-slate-900">
                ${calculateTotal().toLocaleString()}
              </span>
            </div>
          </div>

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0}
            className="w-full bg-fuchsia-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-fuchsia-700 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-md transition-all flex justify-center items-center gap-2"
          >
            <CreditCard size={14} /> COBRAR
          </button>
        </div>
      </div>
    </div>
  );
}
