import React, { useState, useEffect } from 'react';
import {
  PartyPopper,
  Plus,
  Save,
  X,
  Lock,
  LogOut,
  DollarSign,
  Clock,
  ChevronRight,
  Users,
  Upload,
  Image as ImageIcon,
  Minus,
  Trash2,
  Search,
  ArrowLeft,
  FileText,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  ShoppingBag,
  Tag,
} from 'lucide-react';

import {
  USERS,
  INITIAL_CATEGORIES,
  INITIAL_INVENTORY,
  INITIAL_TRANSACTIONS,
  INITIAL_LOGS,
  PAYMENT_METHODS,
  getInitialState,
} from './data';
import Sidebar from './components/Sidebar';

import DashboardView from './views/DashboardView';
import InventoryView from './views/InventoryView';
import POSView from './views/POSView';
import HistoryView from './views/HistoryView';
import LogsView from './views/LogsView';
import CategoryManagerView from './views/CategoryManagerView';

// --- COMPONENTE INTERNO: SELECTOR MULTIPLE DE CATEGORIAS ---
const CategoryMultiSelect = ({
  allCategories,
  selectedCategories,
  onChange,
}) => {
  // Asegurar que selectedCategories sea un array
  const safeSelected = Array.isArray(selectedCategories)
    ? selectedCategories
    : [];

  const handleAdd = (e) => {
    const val = e.target.value;
    if (val && !safeSelected.includes(val)) {
      onChange([...safeSelected, val]);
    }
    // Resetear el select visualmente
    e.target.value = '';
  };

  const handleRemove = (catToRemove) => {
    onChange(safeSelected.filter((c) => c !== catToRemove));
  };

  // Filtrar categorías disponibles para agregar (las que no están seleccionadas)
  const availableToAdd = allCategories.filter((c) => !safeSelected.includes(c));

  return (
    <div className="w-full">
      <div className="min-h-[42px] px-3 py-2 border rounded-lg bg-white focus-within:ring-2 focus-within:ring-fuchsia-500 focus-within:border-fuchsia-500">
        <div className="flex flex-wrap gap-2 mb-1">
          {safeSelected.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 bg-fuchsia-100 text-fuchsia-700 text-xs font-bold px-2 py-1 rounded-md"
            >
              {cat}
              <button
                type="button"
                onClick={() => handleRemove(cat)}
                className="hover:text-fuchsia-900 focus:outline-none"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <select
          className="w-full text-xs bg-transparent outline-none text-slate-500 cursor-pointer"
          onChange={handleAdd}
          value=""
        >
          <option value="" disabled>
            {safeSelected.length === 0
              ? 'Seleccionar categorías...'
              : '+ Agregar otra categoría'}
          </option>
          {availableToAdd.map((c) => (
            <option key={c} value={c} className="text-slate-800">
              {c}
            </option>
          ))}
        </select>
      </div>
      {safeSelected.length === 0 && (
        <p className="text-[10px] text-red-400 mt-1 ml-1">
          * Debe seleccionar al menos una
        </p>
      )}
    </div>
  );
};

export default function PartySupplyApp() {
  // --- ESTADOS ---
  const [inventory, setInventory] = useState(() => {
    // Migración segura: asegurar que todos los items tengan 'categories' (array)
    const data = getInitialState('party_inventory', INITIAL_INVENTORY);
    return data.map((item) => ({
      ...item,
      categories:
        Array.isArray(item.categories) && item.categories.length > 0
          ? item.categories
          : item.category
          ? [item.category]
          : [],
    }));
  });

  const [categories, setCategories] = useState(() =>
    getInitialState('party_categories', INITIAL_CATEGORIES)
  );
  const [transactions, setTransactions] = useState(() =>
    getInitialState('party_transactions', INITIAL_TRANSACTIONS)
  );
  const [dailyLogs, setDailyLogs] = useState(() =>
    getInitialState('party_logs', INITIAL_LOGS)
  );
  const [openingBalance, setOpeningBalance] = useState(() =>
    getInitialState('party_openingBalance', 25000)
  );
  const [isRegisterClosed, setIsRegisterClosed] = useState(() =>
    getInitialState('party_isRegisterClosed', false)
  );
  const [closingTime, setClosingTime] = useState(() =>
    getInitialState('party_closingTime', '21:00')
  );

  // Reloj en tiempo real
  const [currentTime, setCurrentTime] = useState(new Date());

  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('pos');
  const [cart, setCart] = useState([]);

  // Login
  const [loginStep, setLoginStep] = useState('select');
  const [selectedRoleForLogin, setSelectedRoleForLogin] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOpeningBalanceModalOpen, setIsOpeningBalanceModalOpen] =
    useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isClosingTimeModalOpen, setIsClosingTimeModalOpen] = useState(false);
  const [isClosingCashModalOpen, setIsClosingCashModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  const [saleSuccessModal, setSaleSuccessModal] = useState(null); // Para modal de venta exitosa

  // Edición
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [editReason, setEditReason] = useState('');

  // Devolución
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [transactionToRefund, setTransactionToRefund] = useState(null);
  const [refundReason, setRefundReason] = useState('');

  // Inputs
  const [newItem, setNewItem] = useState({
    title: '',
    brand: '',
    price: '',
    purchasePrice: '',
    stock: '',
    categories: [], // Array vacío para inicio
    image: '',
  });
  const [tempOpeningBalance, setTempOpeningBalance] = useState('');
  const [tempClosingTime, setTempClosingTime] = useState('21:00');

  // POS
  const [selectedPayment, setSelectedPayment] = useState('Efectivo');
  const [installments, setInstallments] = useState(1);
  const [inventoryViewMode, setInventoryViewMode] = useState('grid');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] =
    useState('Todas');
  const [inventorySearch, setInventorySearch] = useState('');
  const [posSearch, setPosSearch] = useState('');

  // Cálculos Protegidos
  const calculateTotal = () => {
    const subtotal = cart.reduce(
      (t, i) => t + (Number(i.price) || 0) * (Number(i.quantity) || 0),
      0
    );
    if (selectedPayment === 'Credito') {
      return subtotal * 1.1;
    }
    return subtotal;
  };

  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const validTransactions = safeTransactions.filter(
    (t) => t && t.status !== 'voided'
  );

  const totalSales = validTransactions.reduce(
    (acc, tx) => acc + (Number(tx.total) || 0),
    0
  );
  const salesCount = validTransactions.length;

  // Efectos
  useEffect(() => {
    window.localStorage.setItem('party_inventory', JSON.stringify(inventory));
  }, [inventory]);
  useEffect(() => {
    window.localStorage.setItem('party_categories', JSON.stringify(categories));
  }, [categories]);
  useEffect(() => {
    window.localStorage.setItem(
      'party_transactions',
      JSON.stringify(transactions)
    );
  }, [transactions]);
  useEffect(() => {
    window.localStorage.setItem('party_logs', JSON.stringify(dailyLogs));
  }, [dailyLogs]);
  useEffect(() => {
    window.localStorage.setItem(
      'party_openingBalance',
      JSON.stringify(openingBalance)
    );
  }, [openingBalance]);
  useEffect(() => {
    window.localStorage.setItem(
      'party_isRegisterClosed',
      JSON.stringify(isRegisterClosed)
    );
  }, [isRegisterClosed]);
  useEffect(() => {
    window.localStorage.setItem(
      'party_closingTime',
      JSON.stringify(closingTime)
    );
  }, [closingTime]);

  // Actualizar reloj cada minuto
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Actualizar cada minuto
    return () => clearInterval(timer);
  }, []);

  // Lógica
  const addLog = (action, details, reason = '') => {
    const newLog = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      date: new Date().toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      action,
      user: currentUser?.name || 'Sistema',
      details,
      reason,
    };
    setDailyLogs((prev) => [newLog, ...prev]);
  };

  const handleLogin = (role) => {
    setCurrentUser(USERS[role]);
    setActiveTab(role === 'admin' ? 'dashboard' : 'pos');
    if (dailyLogs.length === 0) {
      addLog('Sistema Iniciado', 'Carga de datos desde memoria');
    }
  };

  const handleSelectRole = (role) => {
    setSelectedRoleForLogin(role);
    setLoginStep('password');
    setPasswordInput('');
    setLoginError('');
  };

  const handleSubmitLogin = (e) => {
    e.preventDefault();
    const user = USERS[selectedRoleForLogin];
    if (user && passwordInput === user.password) {
      setCurrentUser(user);
      setActiveTab(user.role === 'admin' ? 'dashboard' : 'pos');
      setLoginStep('select');
      setPasswordInput('');
      setLoginError('');
    } else {
      setLoginError('Contraseña incorrecta');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCart([]);
  };

  const handleImageUpload = (e, isEditing = false) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 500 * 1024) {
        alert('Imagen muy pesada (>500KB).');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (isEditing) {
          setEditingProduct({ ...editingProduct, image: reader.result });
        } else {
          setNewItem({ ...newItem, image: reader.result });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // --- CAJA: ABRIR / CERRAR (LOG MEJORADO) ---
  const toggleRegisterStatus = () => {
    if (isRegisterClosed) {
      // ABRIR CAJA - Mostrar modal
      setTempOpeningBalance('');
      setTempClosingTime('21:00');
      setIsOpeningBalanceModalOpen(true);
    } else {
      // CERRAR CAJA - Mostrar modal de confirmación
      setIsClosingCashModalOpen(true);
    }
  };

  const handleConfirmCloseCash = () => {
    setIsRegisterClosed(true);
    // GUARDAMOS ESTADÍSTICAS EN EL LOG AL CERRAR
    addLog(
      'Cierre de Caja',
      {
        salesCount: salesCount,
        totalSales: totalSales,
        openingBalance: openingBalance,
        finalBalance: openingBalance + totalSales,
        closingTime: new Date().toLocaleTimeString('es-AR'),
        scheduledClosingTime: closingTime,
      },
      'Cierre de jornada'
    );
    // REINICIAR TRANSACCIONES DEL DÍA
    setTransactions([]);
    setIsClosingCashModalOpen(false);
  };

  const handleSaveOpeningBalance = () => {
    const value = Number(tempOpeningBalance);
    if (!isNaN(value) && value >= 0 && tempClosingTime) {
      setOpeningBalance(value);
      setClosingTime(tempClosingTime);
      setIsRegisterClosed(false);
      addLog(
        'Apertura de Caja',
        {
          amount: value,
          scheduledClosingTime: tempClosingTime,
        },
        'Inicio de operaciones'
      );
      setIsOpeningBalanceModalOpen(false);
    }
  };

  const handleSaveClosingTime = () => {
    addLog(
      'Horario Modificado',
      `Nueva hora de cierre: ${closingTime}`,
      'Ajuste de horario'
    );
    setIsClosingTimeModalOpen(false);
  };

  // Categorías
  const handleAddCategoryFromView = (name) => {
    if (name && !categories.includes(name)) {
      setCategories([...categories, name]);
      addLog('Categoría', { name, type: 'create' });
    } else {
      alert('La categoría ya existe o es inválida.');
    }
  };

  const handleDeleteCategoryFromView = (name) => {
    // Verificar si algún producto tiene esta categoría en su array
    const inUse = inventory.some((p) =>
      Array.isArray(p.categories)
        ? p.categories.includes(name)
        : p.category === name
    );

    if (inUse) {
      alert('No se puede eliminar: Hay productos en esta categoría.');
      return;
    }
    if (window.confirm(`¿Eliminar categoría "${name}"?`)) {
      setCategories(categories.filter((c) => c !== name));
      addLog('Categoría', { name, type: 'delete' });
    }
  };

  // CRUD Productos
  const handleAddItem = (e) => {
    e.preventDefault();
    if (newItem.categories.length === 0) {
      alert('Por favor selecciona al menos una categoría.');
      return;
    }
    const item = {
      id: Date.now(),
      title: newItem.title,
      brand: newItem.brand,
      price: Number(newItem.price) || 0,
      purchasePrice: Number(newItem.purchasePrice) || 0,
      stock: Number(newItem.stock) || 0,
      // Usar la primera del array como principal para fallback
      category: newItem.categories[0],
      categories: newItem.categories,
      image: newItem.image || '',
    };
    setInventory([...inventory, item]);
    // Log Completo del Objeto
    addLog('Alta de Producto', item, 'Producto Nuevo');
    setNewItem({
      title: '',
      brand: '',
      price: '',
      purchasePrice: '',
      stock: '',
      categories: [],
      image: '',
    });
    setIsModalOpen(false);
  };

  const saveEditProduct = (e) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (
      !editingProduct.categories ||
      (Array.isArray(editingProduct.categories) &&
        editingProduct.categories.length === 0)
    ) {
      alert('El producto debe tener al menos una categoría.');
      return;
    }

    const oldProduct = inventory.find((p) => p.id === editingProduct.id);
    const changes = {};

    if (oldProduct.title !== editingProduct.title)
      changes.title = { old: oldProduct.title, new: editingProduct.title };
    if (oldProduct.price !== Number(editingProduct.price))
      changes.price = {
        old: oldProduct.price,
        new: Number(editingProduct.price),
      };
    if (oldProduct.stock !== Number(editingProduct.stock))
      changes.stock = {
        old: oldProduct.stock,
        new: Number(editingProduct.stock),
      };
    if (oldProduct.purchasePrice !== Number(editingProduct.purchasePrice))
      changes.purchasePrice = {
        old: oldProduct.purchasePrice,
        new: Number(editingProduct.purchasePrice),
      };

    // Detectar cambios en categorías (comparar arrays)
    const oldCats = Array.isArray(oldProduct.categories)
      ? oldProduct.categories
      : oldProduct.category
      ? [oldProduct.category]
      : [];
    const newCats = editingProduct.categories;
    const isCatsDifferent =
      JSON.stringify(oldCats.sort()) !== JSON.stringify(newCats.sort());

    if (isCatsDifferent) {
      changes.categories = {
        old: oldCats.join(', '),
        new: newCats.join(', '),
      };
    }

    setInventory(
      inventory.map((p) =>
        p.id === editingProduct.id
          ? {
              ...editingProduct,
              price: Number(editingProduct.price) || 0,
              purchasePrice: Number(editingProduct.purchasePrice) || 0,
              stock: Number(editingProduct.stock) || 0,
              // Asegurar que category (principal) tenga un valor válido del array
              category: newCats[0],
            }
          : p
      )
    );
    if (Object.keys(changes).length > 0) {
      addLog(
        'Edición Producto',
        {
          productId: editingProduct.id,
          product: editingProduct.title,
          changes,
        },
        editReason
      );
    }
    setEditingProduct(null);
    setEditReason('');
  };

  const handleDeleteProduct = (id) => {
    const p = inventory.find((x) => x.id === id);
    const reason = window.prompt(
      `¿Eliminar "${p?.title}"? Escribe el motivo (Opcional):`
    );
    if (reason !== null) {
      setInventory(inventory.filter((x) => x.id !== id));
      addLog('Baja Producto', p, reason || 'Sin motivo');
    }
  };

  // Ventas
  const addToCart = (item) => {
    if (item.stock === 0) return;
    const existing = cart.find((c) => c.id === item.id);
    if (existing) {
      if (existing.quantity >= item.stock) {
        window.alert(`Stock insuficiente.`);
        return;
      }
      setCart(
        cart.map((c) =>
          c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      );
    } else {
      setCart([...cart, { ...item, quantity: 1 }]);
    }
  };
  const updateCartItemQty = (id, newQty) => {
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty < 1) return;
    const itemInStock = inventory.find((i) => i.id === id);
    if (qty > itemInStock.stock) {
      window.alert(`No hay suficiente stock. Máximo: ${itemInStock.stock}`);
      return;
    }
    setCart(cart.map((c) => (c.id === id ? { ...c, quantity: qty } : c)));
  };
  const removeFromCart = (id) => setCart(cart.filter((c) => c.id !== id));

  const handleCheckout = () => {
    const total = calculateTotal();
    const subtotal = cart.reduce(
      (t, i) => t + (Number(i.price) || 0) * (Number(i.quantity) || 0),
      0
    );
    const stockIssues = cart.filter((cartItem) => {
      const invItem = inventory.find((i) => i.id === cartItem.id);
      return !invItem || invItem.stock < cartItem.quantity;
    });
    if (stockIssues.length > 0) {
      alert('Error de stock.');
      return;
    }
    setInventory(
      inventory.map((p) => {
        const c = cart.find((x) => x.id === p.id);
        return c ? { ...p, stock: p.stock - c.quantity } : p;
      })
    );
    // Generar ID numérico secuencial (rango 1001-9999)
    const validIds = transactions
      .map((t) => {
        if (typeof t.id === 'number') return t.id;
        const num = parseInt(String(t.id).replace(/\D/g, ''), 10);
        return !isNaN(num) && num >= 1001 && num <= 9999 ? num : null;
      })
      .filter((id) => id !== null);

    const maxId = validIds.length > 0 ? Math.max(...validIds) : 1000;
    const tx = {
      id: maxId + 1,
      date: new Date().toLocaleString(),
      time: new Date().toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      user: currentUser.name,
      total,
      subtotal,
      payment: selectedPayment,
      installments: selectedPayment === 'Credito' ? installments : 0,
      items: cart.map((i) => ({
        ...i,
        price: Number(i.price) || 0,
        qty: Number(i.quantity) || 0,
      })),
      status: 'completed',
    };
    setTransactions([tx, ...transactions]);
    addLog(
      'Venta Realizada',
      {
        transactionId: tx.id,
        total: total,
        payment: selectedPayment,
        items: tx.items,
      },
      'Venta regular'
    );

    // Mostrar modal de venta exitosa
    setSaleSuccessModal(tx);

    setCart([]);
    setInstallments(1);
    setPosSearch('');
  };

  // Gestión Transacciones
  const handleDeleteTransaction = (tx) => {
    setTransactionToRefund(tx);
    setRefundReason('');
    setIsRefundModalOpen(true);
  };

  const handleConfirmRefund = (e) => {
    e.preventDefault();
    const tx = transactionToRefund;
    if (!tx) return;
    if (tx.status === 'voided') {
      setTransactions(transactions.filter((t) => t.id !== tx.id));
      addLog('Borrado Permanente', `Transacción: ${tx.id}`, refundReason);
    } else {
      const newInventory = inventory.map((prod) => {
        const itemInTx = tx.items.find((i) => i.id === prod.id);
        if (itemInTx) {
          return { ...prod, stock: prod.stock + (Number(itemInTx.qty) || 0) };
        }
        return prod;
      });
      setInventory(newInventory);
      setTransactions(
        transactions.map((t) =>
          t.id === tx.id ? { ...t, status: 'voided' } : t
        )
      );
      addLog(
        'Venta Anulada',
        { transactionId: tx.id, total: tx.total, items: tx.items },
        refundReason
      );
    }
    setIsRefundModalOpen(false);
    setTransactionToRefund(null);
  };

  const addTxItem = (product) => {
    if (!editingTransaction) return;
    // Buscar por productId o title para verificar si ya existe
    const existingItemIndex = editingTransaction.items.findIndex(
      (i) => i.productId === product.id || (i.id === product.id && !i.productId)
    );
    let updatedItems;
    if (existingItemIndex !== -1) {
      updatedItems = editingTransaction.items.map((i, idx) =>
        idx === existingItemIndex ? { ...i, qty: (Number(i.qty) || 0) + 1 } : i
      );
    } else {
      // Generar un uniqueId para el nuevo item
      const maxUniqueId = Math.max(
        0,
        ...editingTransaction.items.map((i) => i.uniqueId || 0)
      );
      updatedItems = [
        ...editingTransaction.items,
        {
          uniqueId: maxUniqueId + 1,
          productId: product.id,
          id: product.id,
          title: product.title,
          price: Number(product.price) || 0,
          qty: 1,
        },
      ];
    }
    const subtotal = updatedItems.reduce(
      (acc, item) => acc + (Number(item.price) || 0) * (Number(item.qty) || 0),
      0
    );
    const newTotal =
      editingTransaction.payment === 'Credito' ? subtotal * 1.1 : subtotal;
    setEditingTransaction({
      ...editingTransaction,
      items: updatedItems,
      total: newTotal,
    });
    setTransactionSearch('');
  };
  const updateTxItemQty = (itemIndex, delta) => {
    if (!editingTransaction) return;
    const updatedItems = editingTransaction.items.map((item, idx) => {
      if (idx === itemIndex) {
        const newQty = (Number(item.qty) || 0) + delta;
        return newQty > 0 ? { ...item, qty: newQty } : item;
      }
      return item;
    });
    const subtotal = updatedItems.reduce(
      (acc, item) => acc + (Number(item.price) || 0) * (Number(item.qty) || 0),
      0
    );
    const newTotal =
      editingTransaction.payment === 'Credito' ? subtotal * 1.1 : subtotal;
    setEditingTransaction({
      ...editingTransaction,
      items: updatedItems,
      total: newTotal,
    });
  };
  const setTxItemQty = (itemIndex, val) => {
    if (!editingTransaction) return;
    const qty = parseInt(val);
    if (isNaN(qty) || qty < 1) return;
    const updatedItems = editingTransaction.items.map((item, idx) => {
      if (idx === itemIndex) {
        return { ...item, qty: qty };
      }
      return item;
    });
    const subtotal = updatedItems.reduce(
      (acc, item) => acc + (Number(item.price) || 0) * (Number(item.qty) || 0),
      0
    );
    const newTotal =
      editingTransaction.payment === 'Credito' ? subtotal * 1.1 : subtotal;
    setEditingTransaction({
      ...editingTransaction,
      items: updatedItems,
      total: newTotal,
    });
  };
  const removeTxItem = (itemIndex) => {
    if (!editingTransaction) return;
    const updatedItems = editingTransaction.items.filter(
      (item, idx) => idx !== itemIndex
    );
    if (updatedItems.length === 0) {
      alert('No puedes dejar la orden vacía.');
      return;
    }
    const subtotal = updatedItems.reduce(
      (acc, item) => acc + (Number(item.price) || 0) * (Number(item.qty) || 0),
      0
    );
    const newTotal =
      editingTransaction.payment === 'Credito' ? subtotal * 1.1 : subtotal;
    setEditingTransaction({
      ...editingTransaction,
      items: updatedItems,
      total: newTotal,
    });
  };
  const handleEditTxPaymentChange = (newPayment) => {
    if (!editingTransaction) return;
    const subtotal = editingTransaction.items.reduce(
      (acc, item) => acc + (Number(item.price) || 0) * (Number(item.qty) || 0),
      0
    );
    const newTotal = newPayment === 'Credito' ? subtotal * 1.1 : subtotal;
    setEditingTransaction({
      ...editingTransaction,
      payment: newPayment,
      total: newTotal,
      installments: newPayment === 'Credito' ? 1 : 0,
    });
  };
  const handleSaveEditedTransaction = (e) => {
    e.preventDefault();
    if (!editingTransaction) return;
    const originalTx = transactions.find((t) => t.id === editingTransaction.id);
    if (!originalTx) return;

    // Logica Stock
    let tempInventory = [...inventory];
    tempInventory = tempInventory.map((prod) => {
      const originalItem = originalTx.items.find((i) => i.id === prod.id);
      return originalItem
        ? { ...prod, stock: prod.stock + (Number(originalItem.qty) || 0) }
        : prod;
    });
    const stockErrors = [];
    editingTransaction.items.forEach((newItem) => {
      const prod = tempInventory.find((p) => p.id === newItem.id);
      if (!prod || prod.stock < (Number(newItem.qty) || 0)) {
        stockErrors.push(newItem.title);
      }
    });
    if (stockErrors.length > 0) {
      alert(`Error de stock: \n- ${stockErrors.join('\n- ')}`);
      return;
    }
    tempInventory = tempInventory.map((prod) => {
      const newItem = editingTransaction.items.find((i) => i.id === prod.id);
      return newItem
        ? { ...prod, stock: prod.stock - (Number(newItem.qty) || 0) }
        : prod;
    });

    setInventory(tempInventory);
    setTransactions(
      transactions.map((t) =>
        t.id === editingTransaction.id ? editingTransaction : t
      )
    );

    // CALCULAR DIFERENCIAS DE PRODUCTOS
    const productChanges = [];
    const allIds = new Set([
      ...originalTx.items.map((i) => i.id),
      ...editingTransaction.items.map((i) => i.id),
    ]);

    allIds.forEach((id) => {
      const oldItem = originalTx.items.find((i) => i.id === id);
      const newItem = editingTransaction.items.find((i) => i.id === id);

      const oldQty = oldItem ? Number(oldItem.qty) : 0;
      const newQty = newItem ? Number(newItem.qty) : 0;
      const title = newItem ? newItem.title : oldItem.title;

      if (oldQty !== newQty) {
        productChanges.push({
          title,
          oldQty,
          newQty,
          diff: newQty - oldQty,
        });
      }
    });

    const changes = {};
    if (originalTx.total !== editingTransaction.total)
      changes.total = { old: originalTx.total, new: editingTransaction.total };
    if (originalTx.payment !== editingTransaction.payment)
      changes.payment = {
        old: originalTx.payment,
        new: editingTransaction.payment,
      };

    // GUARDAR LOG CON DIFERENCIAS
    addLog(
      'Modificación Pedido',
      {
        transactionId: editingTransaction.id,
        changes,
        productChanges,
        itemsSnapshot: editingTransaction.items,
      },
      editReason
    );
    setEditingTransaction(null);
    setEditReason('');
  };

  // --- RENDERIZADO LOGIN ---
  if (!currentUser) {
    if (loginStep === 'select') {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-100">
          <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-xs text-center border">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-fuchsia-600 rounded-xl shadow-lg">
                <PartyPopper className="text-white" size={32} />
              </div>
            </div>
            <h1 className="text-lg font-bold text-slate-800 mb-1">
              PartyManager
            </h1>
            <p className="text-slate-500 text-xs mb-6">Selecciona tu usuario</p>
            <div className="space-y-3">
              <button
                onClick={() => handleSelectRole('admin')}
                className="w-full flex items-center gap-3 p-3 border rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                  DU
                </div>
                <div className="text-left flex-1">
                  <p className="font-bold text-slate-800 text-sm">Dueño</p>
                </div>
                <ChevronRight
                  size={16}
                  className="text-slate-300 group-hover:text-slate-500"
                />
              </button>
              <button
                onClick={() => handleSelectRole('seller')}
                className="w-full flex items-center gap-3 p-3 border rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-xs">
                  VE
                </div>
                <div className="text-left flex-1">
                  <p className="font-bold text-slate-800 text-sm">Vendedor</p>
                </div>
                <ChevronRight
                  size={16}
                  className="text-slate-300 group-hover:text-slate-500"
                />
              </button>
            </div>
          </div>
        </div>
      );
    }
    if (loginStep === 'password') {
      const user = USERS[selectedRoleForLogin];
      return (
        <div className="flex h-screen items-center justify-center bg-slate-100">
          <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-xs text-center border">
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={() => setLoginStep('select')}
                className="text-slate-400 hover:text-slate-600"
              >
                <ArrowLeft size={20} />
              </button>
              <h1 className="text-lg font-bold text-slate-800">
                Iniciar Sesión
              </h1>
              <div className="w-5"></div>
            </div>
            <div className="mb-6 flex flex-col items-center">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm mb-2 ${
                  user.role === 'admin'
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-green-100 text-green-600'
                }`}
              >
                {user.avatar}
              </div>
              <p className="font-bold text-slate-700">{user.name}</p>
            </div>
            <form onSubmit={handleSubmitLogin} className="space-y-4">
              <div>
                <input
                  autoFocus
                  type="password"
                  placeholder="Contraseña"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-center text-lg tracking-widest focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none bg-white text-slate-800 placeholder:text-slate-400"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
                {loginError && (
                  <p className="text-xs text-red-500 mt-2">{loginError}</p>
                )}
              </div>
              <button
                type="submit"
                className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors"
              >
                Ingresar
              </button>
            </form>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-900 text-sm overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-white border-b h-14 flex items-center justify-between px-6 shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-800 uppercase tracking-wide">
                {activeTab === 'pos'
                  ? 'Punto de Venta'
                  : activeTab === 'dashboard'
                  ? 'Control de Caja'
                  : activeTab === 'history'
                  ? 'Historial de Transacciones'
                  : activeTab === 'logs'
                  ? 'Registro de Acciones'
                  : activeTab === 'categories'
                  ? 'Categorías'
                  : 'Gestión de Stock'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {currentTime.toLocaleDateString('es-AR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}{' '}
                •{' '}
                <span className="font-bold text-slate-500">
                  {currentTime.toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}{' '}
                  hs
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Estado de Caja - Solo Dueño puede cambiar */}
            <div className="flex items-center gap-2">
              <button
                onClick={
                  currentUser.role === 'admin'
                    ? toggleRegisterStatus
                    : undefined
                }
                className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors ${
                  isRegisterClosed
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-green-50 border-green-200 text-green-700'
                } ${
                  currentUser.role === 'admin'
                    ? 'hover:opacity-80 cursor-pointer'
                    : 'cursor-default'
                }`}
                title={
                  currentUser.role !== 'admin'
                    ? 'Solo el Dueño puede cambiar el estado de la caja'
                    : ''
                }
              >
                <Lock size={14} />
                <span className="text-xs font-bold">
                  {isRegisterClosed ? 'CAJA CERRADA' : 'CAJA ABIERTA'}
                </span>
              </button>
              {/* Horario de cierre - visible cuando caja está abierta */}
              {!isRegisterClosed && closingTime && (
                <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-700">
                  <Clock size={12} />
                  <span className="text-[10px] font-bold">
                    Cierre: {closingTime}
                  </span>
                </div>
              )}
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-700">
                {currentUser.name}
              </p>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                  currentUser.role === 'admin'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {currentUser.role === 'admin' ? 'DUEÑO' : 'VENDEDOR'}
              </span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 bg-slate-100">
          {activeTab === 'dashboard' && (
            <DashboardView
              openingBalance={openingBalance}
              totalSales={totalSales}
              salesCount={salesCount}
              currentUser={currentUser}
              setTempOpeningBalance={setTempOpeningBalance}
              setIsOpeningBalanceModalOpen={setIsOpeningBalanceModalOpen}
              transactions={validTransactions}
              dailyLogs={dailyLogs}
              inventory={inventory}
            />
          )}
          {activeTab === 'inventory' && (
            <InventoryView
              inventory={inventory}
              categories={categories}
              currentUser={currentUser}
              inventoryViewMode={inventoryViewMode}
              setInventoryViewMode={setInventoryViewMode}
              inventorySearch={inventorySearch}
              setInventorySearch={setInventorySearch}
              inventoryCategoryFilter={inventoryCategoryFilter}
              setInventoryCategoryFilter={setInventoryCategoryFilter}
              setIsModalOpen={setIsModalOpen}
              setEditingProduct={(prod) => {
                setEditingProduct(prod);
                setEditReason('');
              }}
              handleDeleteProduct={handleDeleteProduct}
              setSelectedImage={setSelectedImage}
              setIsImageModalOpen={setIsImageModalOpen}
            />
          )}
          {activeTab === 'pos' &&
            (isRegisterClosed ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <Lock size={64} className="mb-4 text-slate-300" />
                <h3 className="text-xl font-bold text-slate-600">
                  Caja Cerrada
                </h3>
                {currentUser.role === 'admin' ? (
                  <>
                    <p className="mb-6">
                      Debes abrir la caja para realizar ventas.
                    </p>
                    <button
                      onClick={toggleRegisterStatus}
                      className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700"
                    >
                      Abrir Caja
                    </button>
                  </>
                ) : (
                  <p className="mb-6 text-center">
                    El Dueño debe abrir la caja para realizar ventas.
                  </p>
                )}
              </div>
            ) : (
              <POSView
                inventory={inventory}
                categories={categories}
                addToCart={addToCart}
                cart={cart}
                removeFromCart={removeFromCart}
                updateCartItemQty={updateCartItemQty}
                selectedPayment={selectedPayment}
                setSelectedPayment={setSelectedPayment}
                installments={installments}
                setInstallments={setInstallments}
                calculateTotal={calculateTotal}
                handleCheckout={handleCheckout}
                posSearch={posSearch}
                setPosSearch={setPosSearch}
              />
            ))}
          {activeTab === 'history' && (
            <HistoryView
              transactions={transactions}
              dailyLogs={dailyLogs}
              inventory={inventory}
              currentUser={currentUser}
              onDeleteTransaction={handleDeleteTransaction}
              onEditTransaction={(tx) => {
                const safeTx = JSON.parse(JSON.stringify(tx));
                safeTx.items = safeTx.items.map((i) => ({
                  ...i,
                  qty: Number(i.qty) || 0,
                  price: Number(i.price) || 0,
                }));
                setEditingTransaction(safeTx);
                setTransactionSearch('');
                setEditReason('');
              }}
              setTransactions={setTransactions}
              setDailyLogs={setDailyLogs}
            />
          )}
          {activeTab === 'logs' && currentUser.role === 'admin' && (
            <LogsView
              dailyLogs={dailyLogs}
              setDailyLogs={setDailyLogs}
              inventory={inventory}
            />
          )}
          {activeTab === 'categories' && currentUser.role === 'admin' && (
            <CategoryManagerView
              categories={categories}
              inventory={inventory}
              onAddCategory={handleAddCategoryFromView}
              onDeleteCategory={handleDeleteCategoryFromView}
              onEditCategory={(oldName, newName) => {
                if (
                  newName &&
                  newName !== oldName &&
                  !categories.includes(newName)
                ) {
                  setCategories(
                    categories.map((c) => (c === oldName ? newName : c))
                  );
                  // Actualizar en todos los productos
                  setInventory(
                    inventory.map((p) => {
                      // Actualizar array categories
                      let updatedCats = p.categories
                        ? [...p.categories]
                        : p.category
                        ? [p.category]
                        : [];
                      if (updatedCats.includes(oldName)) {
                        updatedCats = updatedCats.map((c) =>
                          c === oldName ? newName : c
                        );
                      }
                      // Actualizar principal si coincide
                      const updatedCat =
                        p.category === oldName ? newName : p.category;

                      return {
                        ...p,
                        category: updatedCat,
                        categories: updatedCats,
                      };
                    })
                  );
                  addLog('Categoría', {
                    name: newName,
                    type: 'edit',
                    oldName: oldName,
                  });
                }
              }}
              // NUEVA PROP: Batch update para guardar cambios de CategoryManagerView en bloque
              onBatchUpdateProductCategory={(changes) => {
                if (!changes || changes.length === 0) return;

                let updatedInventory = [...inventory];
                const logDetails = [];

                changes.forEach(({ productId, categoryName, action }) => {
                  updatedInventory = updatedInventory.map((p) => {
                    if (p.id === productId) {
                      const currentCats = Array.isArray(p.categories)
                        ? [...p.categories]
                        : p.category
                        ? [p.category]
                        : [];
                      let newCats = [...currentCats];

                      if (action === 'add') {
                        if (!newCats.includes(categoryName))
                          newCats.push(categoryName);
                      } else if (action === 'remove') {
                        newCats = newCats.filter((c) => c !== categoryName);
                      }

                      return {
                        ...p,
                        categories: newCats,
                        category: newCats.length > 0 ? newCats[0] : '',
                      };
                    }
                    return p;
                  });
                  logDetails.push(
                    `${
                      action === 'add' ? 'Agregado a' : 'Quitado de'
                    } ${categoryName} (Prod: ${productId})`
                  );
                });

                setInventory(updatedInventory);
                addLog('Edición Masiva Categorías', {
                  count: changes.length,
                  details: logDetails,
                });
              }}
              // Mantengo la prop antigua por compatibilidad, pero ya no la usaremos directamente para updates inmediatos en la vista
              onUpdateProductCategory={() => {}}
            />
          )}
        </main>
      </div>

      {/* --- MODALES --- */}
      {isOpeningBalanceModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white">
              <h3 className="font-bold text-lg">Apertura de Caja</h3>
              <p className="text-green-100 text-xs">
                Configure los datos para iniciar la jornada
              </p>
            </div>
            <div className="p-6 space-y-5">
              {/* Monto Inicial */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-2">
                  Monto Inicial en Caja
                </label>
                <div className="relative">
                  <DollarSign
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={20}
                  />
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full pl-10 pr-4 py-3 text-xl font-bold border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    value={tempOpeningBalance}
                    onChange={(e) => setTempOpeningBalance(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              {/* Horario de Cierre */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-2">
                  Horario de Cierre Programado
                </label>
                <div className="relative">
                  <Clock
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    size={20}
                  />
                  <input
                    type="time"
                    className="w-full pl-10 pr-4 py-3 text-xl font-bold border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                    value={tempClosingTime}
                    onChange={(e) => setTempClosingTime(e.target.value)}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  La caja se deberá cerrar a esta hora
                </p>
              </div>

              {/* Resumen */}
              <div className="bg-slate-50 p-3 rounded-lg border">
                <p className="text-xs text-slate-500 mb-2">
                  Resumen de apertura:
                </p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Monto inicial:</span>
                  <span className="font-bold text-slate-800">
                    ${Number(tempOpeningBalance || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-600">Cierre programado:</span>
                  <span className="font-bold text-slate-800">
                    {tempClosingTime || '--:--'}
                  </span>
                </div>
              </div>

              {/* Botones */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpeningBalanceModalOpen(false)}
                  className="flex-1 py-3 rounded-lg font-bold border-2 border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveOpeningBalance}
                  disabled={!tempOpeningBalance || !tempClosingTime}
                  className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  Abrir Caja
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isClosingTimeModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs p-5 text-center">
            <h3 className="font-bold text-slate-800 mb-4">
              Configurar Hora de Cierre
            </h3>
            <input
              type="time"
              className="w-full text-center text-2xl font-bold p-2 border rounded mb-4"
              value={closingTime}
              onChange={(e) => setClosingTime(e.target.value)}
            />
            <button
              onClick={handleSaveClosingTime}
              className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold"
            >
              Guardar
            </button>
          </div>
        </div>
      )}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="font-bold text-slate-800">Nuevo Producto</h3>
              <button onClick={() => setIsModalOpen(false)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleAddItem} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                  Nombre
                </label>
                <input
                  required
                  type="text"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-fuchsia-500 outline-none"
                  value={newItem.title}
                  onChange={(e) =>
                    setNewItem({ ...newItem, title: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Costo ($)
                  </label>
                  <input
                    required
                    type="number"
                    className="w-full px-3 py-2 border rounded-lg"
                    value={newItem.purchasePrice}
                    onChange={(e) =>
                      setNewItem({ ...newItem, purchasePrice: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Precio ($)
                  </label>
                  <input
                    required
                    type="number"
                    className="w-full px-3 py-2 border rounded-lg font-bold text-slate-800"
                    value={newItem.price}
                    onChange={(e) =>
                      setNewItem({ ...newItem, price: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Stock
                  </label>
                  <input
                    required
                    type="number"
                    className="w-full px-3 py-2 border rounded-lg"
                    value={newItem.stock}
                    onChange={(e) =>
                      setNewItem({ ...newItem, stock: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Categoría(s)
                  </label>
                  {/* Reemplazo del select simple por el MultiSelect */}
                  <CategoryMultiSelect
                    allCategories={categories}
                    selectedCategories={newItem.categories}
                    onChange={(newCats) =>
                      setNewItem({ ...newItem, categories: newCats })
                    }
                  />
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                <label className="text-xs font-bold text-slate-500 uppercase block mb-2 flex items-center gap-1">
                  <ImageIcon size={12} /> Imagen del producto
                </label>
                <div className="mb-3">
                  <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-slate-50">
                    <div className="flex flex-col items-center justify-center pt-2 pb-2">
                      <Upload size={20} className="text-slate-400 mb-1" />
                      <p className="text-[10px] text-slate-500">
                        Click para subir imagen
                      </p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, false)}
                    />
                  </label>
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="O pega una URL aquí..."
                    className="w-full px-3 py-2 border rounded-lg text-xs"
                    value={newItem.image}
                    onChange={(e) =>
                      setNewItem({ ...newItem, image: e.target.value })
                    }
                  />
                </div>
                {newItem.image && (
                  <div className="mt-3 flex justify-center">
                    <img
                      src={newItem.image}
                      alt="Preview"
                      className="h-20 w-20 object-cover rounded border shadow-sm"
                    />
                  </div>
                )}
              </div>
              <button
                type="submit"
                className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800"
              >
                Agregar
              </button>
            </form>
          </div>
        </div>
      )}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="font-bold text-slate-800">Editar Producto</h3>
              <button onClick={() => setEditingProduct(null)}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <form onSubmit={saveEditProduct} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                  Nombre
                </label>
                <input
                  required
                  type="text"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={editingProduct.title}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      title: e.target.value,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Costo ($)
                  </label>
                  <input
                    required
                    type="number"
                    className="w-full px-3 py-2 border rounded-lg"
                    value={editingProduct.purchasePrice}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        purchasePrice: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Precio ($)
                  </label>
                  <input
                    required
                    type="number"
                    className="w-full px-3 py-2 border rounded-lg font-bold"
                    value={editingProduct.price}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        price: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Stock
                  </label>
                  <input
                    required
                    type="number"
                    className="w-full px-3 py-2 border rounded-lg"
                    value={editingProduct.stock}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        stock: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Categoría(s)
                  </label>
                  <CategoryMultiSelect
                    allCategories={categories}
                    selectedCategories={editingProduct.categories || []}
                    onChange={(newCats) =>
                      setEditingProduct({
                        ...editingProduct,
                        categories: newCats,
                      })
                    }
                  />
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                <label className="text-xs font-bold text-slate-500 uppercase block mb-2 flex items-center gap-1">
                  <ImageIcon size={12} /> Imagen del producto
                </label>
                <div className="mb-3">
                  <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-slate-50">
                    <div className="flex flex-col items-center justify-center pt-2 pb-2">
                      <Upload size={20} className="text-slate-400 mb-1" />
                      <p className="text-[10px] text-slate-500">
                        Click para cambiar imagen
                      </p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, true)}
                    />
                  </label>
                </div>
                <div>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-lg text-xs"
                    value={editingProduct.image}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        image: e.target.value,
                      })
                    }
                  />
                </div>
                {editingProduct.image && (
                  <div className="mt-3 flex justify-center">
                    <img
                      src={editingProduct.image}
                      alt="Preview"
                      className="h-20 w-20 object-cover rounded border shadow-sm"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-amber-600 uppercase block mb-1 flex items-center gap-1">
                  <FileText size={12} /> Motivo del cambio (Opcional)
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-amber-50 focus:ring-2 focus:ring-amber-500 outline-none"
                  rows="2"
                  placeholder="¿Por qué realizas este cambio?"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                ></textarea>
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700"
              >
                Guardar Cambios
              </button>
            </form>
          </div>
        </div>
      )}
      {/* ... (Resto de los modales y componentes igual que antes) ... */}
      {editingTransaction && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          {/* ... Mismo contenido del modal de transacción ... */}
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-4 pb-2 border-b">
              <div>
                <h3 className="font-bold text-slate-800">
                  Modificar Pedido #{editingTransaction.id}
                </h3>
                <p className="text-[10px] text-slate-400">
                  Cambiar cantidades recalcula stock y total
                </p>
              </div>
              <button onClick={() => setEditingTransaction(null)}>
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto mb-4">
              <div className="mb-3 relative">
                <div className="flex items-center border rounded-lg px-2 bg-slate-50">
                  <Search size={14} className="text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar producto para agregar..."
                    className="w-full p-2 bg-transparent text-xs outline-none"
                    value={transactionSearch}
                    onChange={(e) => setTransactionSearch(e.target.value)}
                  />
                </div>
                {transactionSearch && (
                  <div className="absolute top-full left-0 right-0 bg-white border shadow-lg rounded-b-lg max-h-40 overflow-y-auto z-10">
                    {inventory
                      .filter((p) =>
                        p.title
                          .toLowerCase()
                          .includes(transactionSearch.toLowerCase())
                      )
                      .map((p) => (
                        <button
                          key={p.id}
                          onClick={() => addTxItem(p)}
                          className="w-full text-left p-2 hover:bg-fuchsia-50 text-xs flex justify-between items-center border-b"
                        >
                          <span>{p.title}</span>
                          <span className="font-bold">${p.price}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {editingTransaction.items.map((item, itemIndex) => (
                  <div
                    key={`item-${itemIndex}-${item.title}`}
                    className="flex justify-between items-center bg-slate-50 p-2 rounded border"
                  >
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-700">
                        {item.title}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        ${(Number(item.price) || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 bg-white border rounded">
                        <input
                          type="number"
                          min="1"
                          className="w-12 p-1 text-xs border rounded text-center font-bold bg-white focus:ring-2 focus:ring-fuchsia-500 outline-none"
                          value={item.qty}
                          onChange={(e) =>
                            setTxItemQty(itemIndex, e.target.value)
                          }
                        />
                      </div>
                      <button
                        onClick={() => removeTxItem(itemIndex)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <form
              onSubmit={handleSaveEditedTransaction}
              className="space-y-4 border-t pt-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Método de Pago
                  </label>
                  <select
                    className="w-full px-2 py-2 border rounded-lg bg-white text-xs"
                    value={editingTransaction.payment}
                    onChange={(e) => handleEditTxPaymentChange(e.target.value)}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                    Total ($)
                  </label>
                  <input
                    readOnly
                    type="text"
                    className="w-full px-2 py-2 border rounded-lg font-bold text-slate-700 bg-slate-100 text-xs"
                    value={(
                      Number(editingTransaction.total) || 0
                    ).toLocaleString()}
                  />
                </div>
              </div>

              {/* Aviso y cuotas para Crédito */}
              {editingTransaction.payment === 'Credito' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-amber-50 text-amber-700 p-2 rounded border border-amber-200 text-xs">
                    <AlertCircle size={14} />
                    <span className="font-bold">
                      10% de recargo aplicado al total
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-slate-50 p-2 rounded border">
                    <span className="text-xs font-bold text-slate-600">
                      Cuotas
                    </span>
                    <select
                      className="text-xs p-1.5 rounded border bg-white"
                      value={editingTransaction.installments || 1}
                      onChange={(e) =>
                        setEditingTransaction({
                          ...editingTransaction,
                          installments: Number(e.target.value),
                        })
                      }
                    >
                      <option value={1}>1 pago</option>
                      <option value={3}>3 cuotas</option>
                      <option value={6}>6 cuotas</option>
                      <option value={12}>12 cuotas</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-amber-600 uppercase block mb-1 flex items-center gap-1">
                  <FileText size={12} /> Motivo del cambio (Opcional)
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-amber-50 focus:ring-2 focus:ring-amber-500 outline-none"
                  rows="2"
                  placeholder="¿Por qué modificas el pedido?"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                ></textarea>
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700"
              >
                Confirmar Cambios
              </button>
            </form>
          </div>
        </div>
      )}
      {isImageModalOpen && selectedImage && (
        <div
          className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setIsImageModalOpen(false)}
        >
          <img
            src={selectedImage}
            alt="Zoom"
            className="max-w-full max-h-full rounded-lg shadow-2xl"
          />
          <button className="absolute top-5 right-5 text-white/70 hover:text-white">
            <X size={32} />
          </button>
        </div>
      )}
      {isRefundModalOpen && transactionToRefund && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
              <h3 className="font-bold text-red-800 flex items-center gap-2">
                <AlertTriangle size={18} />{' '}
                {transactionToRefund.status === 'voided'
                  ? 'Eliminar Registro'
                  : 'Anular Venta'}
              </h3>
              <button onClick={() => setIsRefundModalOpen(false)}>
                <X size={18} className="text-red-400 hover:text-red-600" />
              </button>
            </div>
            <form onSubmit={handleConfirmRefund} className="p-5">
              <p className="text-sm text-slate-600 mb-4">
                {transactionToRefund.status === 'voided'
                  ? 'Esta acción borrará definitivamente el registro del historial. No se puede deshacer.'
                  : `Se marcará la venta #${transactionToRefund.id} como anulada y se devolverá el stock al inventario.`}
              </p>
              <div className="mb-4">
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                  Motivo (Opcional)
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none"
                  rows="3"
                  placeholder="Ej: Cliente devolvió los productos..."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  autoFocus
                ></textarea>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsRefundModalOpen(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                >
                  {transactionToRefund.status === 'voided'
                    ? 'Borrar Definitivamente'
                    : 'Confirmar Anulación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Cierre de Caja */}
      {isClosingCashModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-slate-800 to-slate-700 text-white">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Lock size={20} /> Cerrar Caja
              </h3>
              <p className="text-slate-300 text-sm">Resumen del día</p>
            </div>

            <div className="p-5 space-y-4">
              {/* Estadísticas */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <p className="text-[10px] font-bold text-blue-500 uppercase">
                    Ventas Realizadas
                  </p>
                  <p className="text-2xl font-bold text-blue-700">
                    {salesCount}
                  </p>
                </div>
                <div className="bg-fuchsia-50 p-3 rounded-lg border border-fuchsia-100">
                  <p className="text-[10px] font-bold text-fuchsia-500 uppercase">
                    Total Vendido
                  </p>
                  <p className="text-2xl font-bold text-fuchsia-700">
                    ${totalSales.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Caja Inicial</span>
                  <span className="font-bold text-slate-700">
                    ${openingBalance.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">+ Ventas del día</span>
                  <span className="font-bold text-fuchsia-600">
                    +${totalSales.toLocaleString()}
                  </span>
                </div>
                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="font-bold text-slate-700">
                    Total en Caja
                  </span>
                  <span className="text-xl font-bold text-green-600">
                    ${(openingBalance + totalSales).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                <p className="font-bold flex items-center gap-2">
                  <AlertTriangle size={16} /> Atención
                </p>
                <p className="text-xs mt-1">
                  Esta acción reiniciará las transacciones del día. Asegurate de
                  haber revisado el resumen.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t flex gap-3 justify-end">
              <button
                onClick={() => setIsClosingCashModalOpen(false)}
                className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmCloseCash}
                className="px-6 py-2 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition flex items-center gap-2"
              >
                <Lock size={14} /> Confirmar Cierre
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Venta Exitosa */}
      {saleSuccessModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
            {/* Header con check verde */}
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-6 text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
                <CheckCircle size={40} className="text-green-500" />
              </div>
              <h3 className="text-xl font-bold text-white">¡Venta Exitosa!</h3>
              <p className="text-green-100 text-sm">
                La transacción se ha registrado correctamente
              </p>
            </div>

            {/* Detalles de la venta */}
            <div className="p-5 space-y-4">
              {/* Número de pedido */}
              <div className="bg-slate-50 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-400 uppercase font-bold">
                  Número de Pedido
                </p>
                <p className="text-3xl font-bold text-slate-800">
                  #{saleSuccessModal.id}
                </p>
              </div>

              {/* Info en grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-[10px] font-bold text-blue-400 uppercase">
                    Vendedor
                  </p>
                  <p className="font-bold text-blue-700">
                    {saleSuccessModal.user}
                  </p>
                </div>
                <div className="bg-fuchsia-50 p-3 rounded-lg">
                  <p className="text-[10px] font-bold text-fuchsia-400 uppercase">
                    Método de Pago
                  </p>
                  <p className="font-bold text-fuchsia-700">
                    {saleSuccessModal.payment === 'MercadoPago'
                      ? 'Mercado Pago'
                      : saleSuccessModal.payment}
                    {saleSuccessModal.installments > 1 &&
                      ` (${saleSuccessModal.installments} cuotas)`}
                  </p>
                </div>
              </div>

              {/* Lista de productos */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                  <ShoppingBag size={12} /> Productos (
                  {saleSuccessModal.items?.length || 0})
                </p>
                <div className="bg-slate-50 rounded-lg divide-y max-h-32 overflow-y-auto">
                  {(saleSuccessModal.items || []).map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2 flex justify-between items-center text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-700 truncate">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {item.qty} x ${item.price?.toLocaleString()}
                        </p>
                      </div>
                      <span className="font-bold text-slate-800 shrink-0 ml-2">
                        $
                        {((item.qty || 0) * (item.price || 0)).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="border-t pt-3">
                {saleSuccessModal.payment === 'Credito' &&
                  saleSuccessModal.subtotal && (
                    <>
                      <div className="flex justify-between text-sm text-slate-500 mb-1">
                        <span>Subtotal</span>
                        <span>
                          ${saleSuccessModal.subtotal?.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm text-amber-600 mb-2">
                        <span>Recargo (10%)</span>
                        <span>
                          +$
                          {Math.round(
                            saleSuccessModal.subtotal * 0.1
                          ).toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}
                <div className="flex justify-between items-end">
                  <span className="font-bold text-slate-600">TOTAL</span>
                  <span className="text-2xl font-bold text-green-600">
                    ${saleSuccessModal.total?.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t">
              <button
                onClick={() => setSaleSuccessModal(null)}
                className="w-full bg-green-500 text-white py-3 rounded-lg font-bold hover:bg-green-600 transition flex items-center justify-center gap-2"
              >
                <CheckCircle size={18} /> Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
