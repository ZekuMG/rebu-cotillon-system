import React, { useState } from 'react';
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
  UserCheck // Icono para indicar cliente asignado
} from 'lucide-react';
import { PAYMENT_METHODS } from '../data';
import { formatPrice } from '../utils/helpers';

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
  handleCheckout, // Esto abre el modal de pago final
  posSearch,
  setPosSearch,
  // --- PROPS PERSISTENTES ---
  selectedCategory,
  setSelectedCategory,
  posViewMode,
  setPosViewMode,
  gridColumns,
  setGridColumns,
  // --- PROPS FIDELIZACIÓN ---
  selectedClient,
  setSelectedClient,
  onOpenClientModal,
  onOpenRedemptionModal
}) {
  const [showGridMenu, setShowGridMenu] = useState(false);
  const [showClientCheckModal, setShowClientCheckModal] = useState(false);

  // Helper Stock
  const getEffectiveStock = (productId, originalStock) => {
    const itemInCart = cart.find(item => item.id === productId && !item.isReward);
    const qtyInCart = itemInCart ? itemInCart.quantity : 0;
    return originalStock - qtyInCart;
  };

  // 1. Lógica del botón "COBRAR" principal
  const handlePreCheckout = () => {
    // Si hay carrito y NO hay cliente seleccionado (ni real ni genérico)
    if (cart.length > 0 && !selectedClient) {
      setShowClientCheckModal(true); // Preguntar si quiere socio
    } else {
      handleCheckout(); // Si ya hay cliente (o es consumidor final), ir al pago
    }
  };

  // 2. Lógica: "No quiero buscar socio" -> Asignar Consumidor Final y quedarse en POS
  const confirmCheckoutWithoutClient = () => {
    setShowClientCheckModal(false);
    
    // Asignamos cliente genérico
    setSelectedClient({
      id: 0, // ID 0 indica que no es un socio real de la DB
      name: 'Consumidor Final',
      memberNumber: '---',
      points: 0
    });

    // IMPORTANTE: Quitamos handleCheckout() de aquí.
    // El usuario se queda en la pantalla viendo que ahora el cliente es "Consumidor Final".
    // Para cobrar, tendrá que volver a apretar el botón "COBRAR" abajo a la derecha.
  };

  const handleOpenClientModalFromCheck = () => {
    setShowClientCheckModal(false);
    onOpenClientModal();
  };

  // Filtrado
  const filteredProducts = inventory.filter((product) => {
    const matchesSearch =
      product.title.toLowerCase().includes(posSearch.toLowerCase()) ||
      String(product.id).includes(posSearch) ||
      (product.barcode && product.barcode.includes(posSearch));
    const matchesCategory =
      selectedCategory === 'Todas' ||
      (Array.isArray(product.categories)
        ? product.categories.includes(selectedCategory)
        : product.category === selectedCategory);
    return matchesSearch && matchesCategory;
  });

  const subtotal = cart.reduce((t, i) => t + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
  const total = calculateTotal();
  const pointsToEarn = Math.floor(Math.max(0, total) / 150);

  return (
    <div className="flex h-full overflow-hidden bg-slate-100 relative">
      
      {/* ========================================== */}
      {/* COLUMNA IZQUIERDA: CATÁLOGO                */}
      {/* ========================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Header POS */}
        <div className="p-4 bg-white border-b shrink-0 flex gap-3 items-center z-30 relative">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Buscar producto o escanear..."
              className="w-full pl-10 pr-4 py-3 border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-fuchsia-500 outline-none transition-all font-medium"
              value={posSearch}
              onChange={(e) => setPosSearch(e.target.value)}
              autoFocus
            />
          </div>
          
          <div className="w-40 relative hidden sm:block">
            <select
              className="w-full px-3 py-3 border rounded-xl bg-slate-50 font-medium outline-none focus:ring-2 focus:ring-fuchsia-500 appearance-none cursor-pointer"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="Todas">Categorías</option>
              {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">▼</div>
          </div>

          <div className="flex items-center gap-2">
            {posViewMode === 'grid' && (
              <div className="relative">
                <button onClick={() => setShowGridMenu(!showGridMenu)} className={`p-3 rounded-xl border transition-all ${showGridMenu ? 'bg-slate-100 ring-2 ring-slate-200' : 'bg-white hover:bg-slate-50'}`}><SlidersHorizontal size={20} className="text-slate-600" /></button>
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
            <div className="flex bg-slate-100 p-1 rounded-xl border h-[46px] items-center">
              <button onClick={() => setPosViewMode('grid')} className={`p-2 rounded-lg transition-all h-full flex items-center ${posViewMode === 'grid' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={20} /></button>
              <button onClick={() => setPosViewMode('list')} className={`p-2 rounded-lg transition-all h-full flex items-center ${posViewMode === 'list' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><List size={20} /></button>
            </div>
          </div>
        </div>

        {/* Grid Productos */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-100/50">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 mt-10"><Package size={48} className="mb-3 opacity-50" /><p>No se encontraron productos</p></div>
          ) : (
            <>
              {posViewMode === 'grid' ? (
                <div className="grid gap-3 transition-all duration-300" style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}>
                  {filteredProducts.map((product) => {
                    const effectiveStock = getEffectiveStock(product.id, product.stock);
                    const isOutOfStock = effectiveStock <= 0;
                    let stockBadgeClass = effectiveStock > 10 ? 'bg-green-100 text-green-700' : effectiveStock > 5 ? 'bg-amber-100 text-amber-700' : effectiveStock > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-500';
                    return (
                      <button key={product.id} onClick={() => addToCart(product)} disabled={isOutOfStock} className={`group bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all text-left flex flex-col relative ${isOutOfStock ? 'opacity-60 grayscale cursor-not-allowed' : 'hover:border-fuchsia-300 active:scale-[0.98]'}`}>
                        <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden w-full">
                          {product.image ? (<img src={product.image} alt={product.title} className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500" />) : (<div className="w-full h-full flex flex-col items-center justify-center bg-slate-200/50 p-2 text-center group-hover:bg-slate-200 transition-colors"><span className={`font-bold text-slate-500 uppercase leading-tight ${gridColumns > 6 ? 'text-[10px]' : 'text-xs'}`}>{product.title}</span></div>)}
                          <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm backdrop-blur-sm ${stockBadgeClass}`}>{isOutOfStock ? 'SIN STOCK' : `${effectiveStock} u.`}</div>
                        </div>
                        <div className={`flex flex-col flex-1 w-full ${gridColumns > 6 ? 'p-2' : 'p-3'}`}>
                          <h3 className={`font-bold text-slate-800 leading-snug mb-1 line-clamp-2 ${gridColumns > 6 ? 'text-[11px]' : 'text-sm'}`}>{product.title}</h3>
                          <div className="mt-auto pt-2 flex items-end justify-between"><span className={`font-bold text-fuchsia-600 ${gridColumns > 6 ? 'text-sm' : 'text-lg'}`}>${formatPrice(product.price)}</span><div className={`w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-lg group-hover:bg-fuchsia-600 transition-colors ${gridColumns > 8 || isOutOfStock ? 'hidden' : 'flex'}`}><Plus size={12} /></div></div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredProducts.map((product) => {
                    const effectiveStock = getEffectiveStock(product.id, product.stock);
                    const isOutOfStock = effectiveStock <= 0;
                    return (
                      <button key={product.id} onClick={() => addToCart(product)} disabled={isOutOfStock} className={`flex items-center gap-3 p-3 bg-white border rounded-xl shadow-sm hover:shadow-md transition-all text-left group ${isOutOfStock ? 'opacity-60 grayscale cursor-not-allowed bg-slate-50' : 'hover:border-fuchsia-300 active:scale-[0.99]'}`}>
                        <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 border relative">
                          {product.image ? (<img src={product.image} alt="" className="w-full h-full object-cover" />) : (<div className="w-full h-full flex items-center justify-center bg-slate-200 text-[8px] font-bold text-slate-500 p-1 text-center leading-none">{product.title.slice(0, 8)}..</div>)}
                        </div>
                        <div className="flex-1 min-w-0"><h4 className="font-bold text-slate-800 text-sm truncate">{product.title}</h4></div>
                        <div className="text-right flex items-center gap-4"><div className="w-20 text-right"><p className="font-bold text-lg text-fuchsia-600">${formatPrice(product.price)}</p></div>{!isOutOfStock && (<div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-colors"><Plus size={16} /></div>)}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ========================================== */}
      {/* COLUMNA DERECHA: CARRITO                   */}
      {/* ========================================== */}
      <div className="w-[380px] bg-white border-l flex flex-col shadow-2xl z-20 shrink-0">
        
        {/* Header Carrito */}
        <div className="p-5 border-b bg-white flex justify-between items-center">
          <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <ShoppingCart size={20} className="text-fuchsia-600" /> Pedido Actual
          </h2>
          <span className="bg-fuchsia-100 text-fuchsia-700 text-xs font-bold px-2 py-1 rounded-full">
            {cart.reduce((acc, item) => acc + item.quantity, 0)} items
          </span>
        </div>

        {/* Lista de Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300">
              <ShoppingCart size={64} className="mb-4 opacity-50" />
              <p className="font-medium text-slate-400">Carrito vacío</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className={`flex gap-3 p-3 rounded-xl border shadow-sm transition-colors group ${item.isReward ? 'bg-fuchsia-50 border-fuchsia-100' : 'bg-white hover:border-fuchsia-200'}`}>
                {/* Imagen mini */}
                <div className="w-14 h-14 bg-slate-50 rounded-lg overflow-hidden shrink-0 border">
                  {item.image ? (<img src={item.image} alt="" className="w-full h-full object-cover" />) : (<div className="w-full h-full flex items-center justify-center bg-slate-100 text-[9px] font-bold text-slate-400 text-center p-1 leading-none">{item.title.slice(0,12)}..</div>)}
                </div>
                
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div className="flex justify-between items-start gap-2">
                    <h4 className={`font-bold text-sm line-clamp-1 leading-tight ${item.isReward ? 'text-fuchsia-700' : 'text-slate-800'}`}>
                      {item.isReward && <Gift size={12} className="inline mr-1 text-fuchsia-500" />}
                      {item.title}
                    </h4>
                    <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                  </div>
                  
                  <div className="flex justify-between items-end">
                    <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-0.5 border">
                      <button onClick={() => updateCartItemQty(item.id, item.quantity - 1)} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm hover:text-red-500 disabled:opacity-50" disabled={item.quantity <= 1 || item.isReward}><Minus size={12} /></button>
                      <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                      <button onClick={() => updateCartItemQty(item.id, item.quantity + 1)} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm hover:text-green-500 disabled:opacity-50" disabled={item.isReward}><Plus size={12} /></button>
                    </div>
                    <p className={`font-bold ${item.isReward ? 'text-fuchsia-600' : 'text-slate-800'}`}>
                      {item.isReward ? 'GRATIS' : `$${formatPrice(item.price * item.quantity)}`}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Totales y Pago */}
        <div className="p-5 bg-slate-50 border-t space-y-4">
          
          {/* --- SECCIÓN CLIENTE --- */}
          <div className={`bg-white border rounded-xl p-3 shadow-sm transition-colors ${selectedClient ? (selectedClient.id === 0 ? 'border-slate-300' : 'border-fuchsia-200 bg-fuchsia-50/30') : 'border-slate-200'}`}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                {selectedClient ? <UserCheck size={12} /> : <User size={12} />} Socio
              </span>
              {selectedClient && (
                <div className="flex gap-2">
                  {/* Ocultar Canje si es Consumidor Final (ID 0) */}
                  {selectedClient.id !== 0 && (
                    <button 
                      onClick={onOpenRedemptionModal}
                      className="text-[10px] bg-white border border-fuchsia-200 text-fuchsia-600 px-2 py-0.5 rounded-md font-bold hover:bg-fuchsia-50 transition-colors flex items-center gap-1"
                    >
                      <Gift size={10} /> Canjear Puntos
                    </button>
                  )}
                  
                  <button 
                    onClick={() => setSelectedClient && setSelectedClient(null)}
                    className="text-[10px] text-red-400 font-bold hover:text-red-600 transition-colors"
                    title="Quitar"
                  >
                     <UserMinus size={14} />
                  </button>
                </div>
              )}
            </div>

            {selectedClient ? (
              <div>
                <div className="flex justify-between items-center">
                   <span className="font-bold text-slate-800 text-sm">
                     {selectedClient.id === 0 
                       ? 'Consumidor Final' 
                       : `#${selectedClient.memberNumber} - ${selectedClient.name}`
                     }
                   </span>
                   {/* Solo mostrar puntos si no es Consumidor Final */}
                   {selectedClient.id !== 0 && (
                      <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded font-bold">{selectedClient.points} pts</span>
                   )}
                </div>
                {/* Info puntos a ganar - Ocultar si es consumidor final */}
                {selectedClient.id !== 0 && (
                  <div className="mt-1 text-[10px] text-green-600 font-bold flex items-center gap-1">
                    <span>+{pointsToEarn} pts por esta compra</span>
                  </div>
                )}
              </div>
            ) : (
              <button 
                onClick={onOpenClientModal}
                className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-400 text-xs font-bold hover:border-fuchsia-400 hover:text-fuchsia-500 hover:bg-fuchsia-50 transition-all flex items-center justify-center gap-2"
              >
                <User size={14} /> Asignar Socio / Puntos
              </button>
            )}
          </div>

          {/* Selector de Pago */}
          <div className="grid grid-cols-4 gap-2">
            {PAYMENT_METHODS.map((method) => {
              const isSelected = selectedPayment === method.id;
              return (
                <button
                  key={method.id}
                  onClick={() => setSelectedPayment(method.id)}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all text-[10px] font-bold h-16 ${
                    isSelected
                      ? 'bg-slate-800 text-white border-slate-800 shadow-md transform scale-105'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {method.id === 'Efectivo' && <Banknote size={18} className="mb-1" />}
                  {method.id === 'MercadoPago' && <Smartphone size={18} className="mb-1" />}
                  {(method.id === 'Debito' || method.id === 'Credito') && <CreditCard size={18} className="mb-1" />}
                  <span className="text-center leading-tight">{method.label}</span>
                </button>
              );
            })}
          </div>

          {/* Cuotas */}
          {selectedPayment === 'Credito' && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 p-2 rounded-lg animate-in fade-in slide-in-from-bottom-2">
              <span className="text-xs font-bold text-amber-700 whitespace-nowrap">Cuotas:</span>
              <select
                className="flex-1 bg-white border border-amber-200 text-xs rounded p-1 outline-none font-bold text-slate-700"
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
              >
                <option value={1}>1 pago (10%)</option>
                <option value={3}>3 cuotas</option>
                <option value={6}>6 cuotas</option>
                <option value={12}>12 cuotas</option>
              </select>
            </div>
          )}

          {/* Totales */}
          <div className="space-y-1 pt-2 border-t border-slate-200">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Subtotal</span>
              <span>${formatPrice(subtotal)}</span>
            </div>
            {selectedPayment === 'Credito' && (
              <div className="flex justify-between text-xs text-amber-600 font-bold">
                <span>Recargo (10%)</span>
                <span>+${formatPrice(subtotal * 0.1)}</span>
              </div>
            )}
            <div className="flex justify-between items-end pt-2">
              <span className="text-sm font-bold text-slate-800 uppercase">Total a Pagar</span>
              <span className="text-3xl font-black text-slate-900">${formatPrice(total)}</span>
            </div>
          </div>

          <button onClick={handlePreCheckout} disabled={cart.length === 0} className="w-full py-4 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-black hover:to-slate-900 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group">
            <CheckCircle className="group-hover:scale-110 transition-transform" />
            {cart.length === 0 ? 'CARRITO VACÍO' : 'COBRAR'}
          </button>
        </div>
      </div>

      {/* MODAL CHECK SOCIO */}
      {showClientCheckModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center transform scale-100 transition-all border border-slate-200">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"><User size={32} strokeWidth={2.5} /></div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">¿Asignar Socio?</h3>
            <p className="text-slate-500 text-sm mb-6">Esta venta no tiene un socio asignado. ¿Deseas sumar puntos a un cliente?</p>
            <div className="space-y-3">
              <button onClick={handleOpenClientModalFromCheck} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-md shadow-blue-200"><User size={18} />Sí, buscar socio</button>
              {/* Modificación: Botón NO ahora asigna genérico y cierra */}
              <button onClick={confirmCheckoutWithoutClient} className="w-full py-3 bg-white border-2 border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl font-bold transition-colors">
                No, asignar Consumidor Final
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}