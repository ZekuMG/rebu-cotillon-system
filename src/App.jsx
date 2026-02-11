import React, { useState, useEffect } from 'react';
import {
  PartyPopper,
  Lock,
  Clock,
  ChevronRight,
  ArrowLeft,
  RefreshCw, // Icono de carga
} from 'lucide-react';
import Swal from 'sweetalert2'; // Alertas bonitas

// --- CONEXIÓN A LA NUBE ---
import { supabase } from './supabase/client';

import {
  USERS,
  getInitialState,
} from './data';
import Sidebar from './components/Sidebar';

// Vistas
import DashboardView from './views/DashboardView';
import InventoryView from './views/InventoryView';
import POSView from './views/POSView';
import ClientsView from './views/ClientsView';
import HistoryView from './views/HistoryView';
import LogsView from './views/LogsView';
import CategoryManagerView from './views/CategoryManagerView';
import RewardsView from './views/RewardsView';
import ReportsHistoryView from './views/ReportsHistoryView';

// Modales
import {
  OpeningBalanceModal,
  ClosingTimeModal,
  AddProductModal,
  EditProductModal,
  EditTransactionModal,
  ImageModal,
  RefundModal,
  CloseCashModal,
  SaleSuccessModal,
  AutoCloseAlertModal,
  DeleteProductModal,
  NotificationModal,
  TicketModal,
  BarcodeNotFoundModal,
  BarcodeDuplicateModal,
  ClientSelectionModal
} from './components/AppModals';

// Modales Nuevos
import { ExpenseModal } from './components/modals/ExpenseModal';
import { RedemptionModal } from './components/modals/RedemptionModal';
import { TicketPrintLayout } from './components/TicketPrintLayout';

// Hooks
import { useBarcodeScanner } from './hooks/useBarcodeScanner';

export default function PartySupplyApp() {
  
  // Estado de carga inicial de la Nube
  const [isCloudLoading, setIsCloudLoading] = useState(true);

  // ==========================================
  // 1. ESTADOS DE DATOS (Persistentes en Nube)
  // ==========================================
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dailyLogs, setDailyLogs] = useState([]);
  const [members, setMembers] = useState([]);
  const [pastClosures, setPastClosures] = useState([]);
  const [expenses, setExpenses] = useState([]);

  // Estados de CAJA (Sincronizados)
  const [openingBalance, setOpeningBalance] = useState(0);
  const [isRegisterClosed, setIsRegisterClosed] = useState(true); 
  const [closingTime, setClosingTime] = useState('21:00');

  // ==========================================
  // 1.5 CONEXIÓN SUPABASE (Fetch Inicial + Auto-Healing)
  // ==========================================
  const fetchCloudData = async () => {
    try {
      setIsCloudLoading(true);

      // A. PRODUCTOS
      const { data: prodData, error: prodErr } = await supabase.from('products').select('*').order('title');
      if (prodErr) throw prodErr;
      const adaptedInventory = (prodData || []).map(p => ({
         ...p,
         categories: p.category ? [p.category] : [], 
         purchasePrice: p.purchasePrice || 0
      }));

      // B. CLIENTES
      const { data: clientData, error: clientErr } = await supabase.from('clients').select('*').order('name');
      if (clientErr) throw clientErr;
      const adaptedClients = (clientData || []).map(c => ({
         ...c,
         memberNumber: c.member_number 
      }));

      // C. VENTAS
      const { data: salesData, error: salesErr } = await supabase
        .from('sales')
        .select(`*, sale_items(*), clients(name, member_number)`)
        .order('created_at', { ascending: false })
        .limit(100);
      if (salesErr) throw salesErr;

      const adaptedSales = (salesData || []).map(sale => ({
         id: sale.id,
         date: new Date(sale.created_at).toLocaleDateString('es-AR'),
         time: new Date(sale.created_at).toLocaleTimeString('es-AR'),
         total: sale.total,
         payment: sale.payment_method,
         installments: sale.installments,
         items: sale.sale_items.map(i => ({
            id: i.product_id,
            title: i.product_title,
            qty: i.quantity,
            price: i.price,
            isReward: i.is_reward,
            productId: i.product_id 
         })),
         client: sale.clients ? { name: sale.clients.name, memberNumber: sale.clients.member_number } : null,
         pointsEarned: sale.points_earned,
         pointsSpent: sale.points_spent,
         user: sale.user_name || 'Desconocido',
         status: 'completed'
      }));

      // D. LOGS
      const { data: logsData } = await supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(50);
      const adaptedLogs = (logsData || []).map(log => ({
         id: log.id,
         action: log.action,
         details: log.details,
         user: log.user,
         reason: log.reason,
         date: new Date(log.created_at).toLocaleDateString('es-AR'),
         timestamp: new Date(log.created_at).toLocaleTimeString('es-AR')
      }));

      // E. GASTOS
      const { data: expData, error: expErr } = await supabase.from('expenses').select('*').order('created_at', { ascending: false });
      if (expErr) throw expErr;
      const adaptedExpenses = (expData || []).map(e => ({
         id: e.id,
         description: e.description,
         amount: e.amount,
         category: e.category,
         paymentMethod: e.payment_method,
         date: new Date(e.created_at).toLocaleDateString('es-AR'),
         time: new Date(e.created_at).toLocaleTimeString('es-AR'),
         user: e.user_name || 'Sistema'
      }));

      // F. REPORTES (Cierres)
      const { data: closureData, error: closureErr } = await supabase.from('cash_closures').select('*').order('created_at', { ascending: false });
      if (closureErr) throw closureErr;
      const adaptedClosures = (closureData || []).map(c => ({
         id: c.id, 
         date: c.date,
         openTime: c.open_time,
         closeTime: c.close_time,
         user: c.user_name,
         type: c.type,
         openingBalance: Number(c.opening_balance),
         totalSales: Number(c.total_sales),
         finalBalance: Number(c.final_balance),
         totalCost: Number(c.total_cost),
         totalExpenses: Number(c.total_expenses),
         netProfit: Number(c.net_profit),
         salesCount: c.sales_count,
         averageTicket: Number(c.average_ticket),
         paymentMethods: c.payment_methods_summary, 
         itemsSold: c.items_sold_list,             
         newClients: c.new_clients_list,           
         expensesSnapshot: c.expenses_snapshot,    
         transactionsSnapshot: c.transactions_snapshot 
      }));

      // G. OTROS
      const { data: catData } = await supabase.from('categories').select('*').order('name');
      const categoryNames = (catData || []).map(c => c.name);

      const { data: rewardsData } = await supabase.from('rewards').select('*').order('points_cost', { ascending: true });
      const adaptedRewards = (rewardsData || []).map(r => ({
         id: r.id,
         title: r.title,
         description: r.description,
         pointsCost: r.points_cost,
         type: r.type,
         discountAmount: r.discount_amount,
         stock: r.stock
      }));

      // ✅ AUTO-HEALING: Obtener Estado Caja, y si no existe, CREARLO
      let { data: registerState, error: regErr } = await supabase.from('register_state').select('*').eq('id', 1).single();
      
      if (!registerState || regErr) {
          console.warn("⚠️ Estado de caja no encontrado, inicializando DB...");
          const { data: newState, error: createErr } = await supabase
              .from('register_state')
              .insert([{ id: 1, is_open: false, opening_balance: 0, closing_time: '21:00' }])
              .select()
              .single();
              
          if (!createErr && newState) {
              registerState = newState;
          } else {
             console.error("Error crítico creando estado de caja:", createErr);
          }
      }

      // Aplicar estado de caja si se recuperó/creó con éxito
      if (registerState) {
          setIsRegisterClosed(!registerState.is_open);
          setOpeningBalance(Number(registerState.opening_balance));
          setClosingTime(registerState.closing_time || '21:00');
      }

      // Actualizar todos los estados
      setInventory(adaptedInventory);
      setMembers(adaptedClients);
      setTransactions(adaptedSales);
      setDailyLogs(adaptedLogs);
      setExpenses(adaptedExpenses); 
      setCategories(categoryNames); 
      setRewards(adaptedRewards);
      setPastClosures(adaptedClosures);

    } catch (error) {
      console.error('Error cargando nube:', error);
      Swal.fire('Error de Conexión', 'No se pudieron cargar los datos. Revisa tu internet.', 'error');
    } finally {
      setIsCloudLoading(false);
    }
  };

  useEffect(() => {
    // 1. Carga inicial
    fetchCloudData();

    // 2. Suscripción Realtime ROBUSTA (Caja y Reportes)
    const channel = supabase
      .channel('app_realtime_updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'register_state', filter: 'id=eq.1' },
        (payload) => {
          const newState = payload.new;
          if (newState) {
            setIsRegisterClosed(!newState.is_open);
            setOpeningBalance(Number(newState.opening_balance));
            setClosingTime(newState.closing_time);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cash_closures' },
        (payload) => {
          const c = payload.new;
          if (c) {
             const newReport = {
                 id: c.id, 
                 date: c.date,
                 openTime: c.open_time,
                 closeTime: c.close_time,
                 user: c.user_name,
                 type: c.type,
                 openingBalance: Number(c.opening_balance || 0),
                 totalSales: Number(c.total_sales || 0),
                 finalBalance: Number(c.final_balance || 0),
                 totalCost: Number(c.total_cost || 0),
                 totalExpenses: Number(c.total_expenses || 0),
                 netProfit: Number(c.net_profit || 0),
                 salesCount: c.sales_count || 0,
                 averageTicket: Number(c.average_ticket || 0),
                 paymentMethods: c.payment_methods_summary || {}, 
                 itemsSold: c.items_sold_list || [],             
                 newClients: c.new_clients_list || [],           
                 expensesSnapshot: c.expenses_snapshot || [],    
                 transactionsSnapshot: c.transactions_snapshot || []
             };
             setPastClosures((prev) => [newReport, ...prev]);
          }
        }
      )
      .subscribe();

    // 3. Auto-actualización al volver a la app (para móviles/tablets)
    const handleReSync = () => {
      if (document.visibilityState === 'visible') {
        console.log('App activa: Sincronizando datos...');
        fetchCloudData();
      }
    };

    window.addEventListener('visibilitychange', handleReSync);
    window.addEventListener('focus', handleReSync);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('visibilitychange', handleReSync);
      window.removeEventListener('focus', handleReSync);
    };
  }, []);

  // ==========================================
  // 2. ESTADOS DE SESIÓN Y UI
  // ==========================================
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('pos');
  const [cart, setCart] = useState([]);

  // Login
  const [loginStep, setLoginStep] = useState('select');
  const [selectedRoleForLogin, setSelectedRoleForLogin] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // ==========================================
  // 3. ESTADOS PARA MODALES
  // ==========================================
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOpeningBalanceModalOpen, setIsOpeningBalanceModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isClosingTimeModalOpen, setIsClosingTimeModalOpen] = useState(false);
  const [isClosingCashModalOpen, setIsClosingCashModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  const [saleSuccessModal, setSaleSuccessModal] = useState(null);
  const [isAutoCloseAlertOpen, setIsAutoCloseAlertOpen] = useState(false);
  
  const [ticketToView, setTicketToView] = useState(null);

  const [isDeleteProductModalOpen, setIsDeleteProductModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [deleteProductReason, setDeleteProductReason] = useState('');

  const [editingProduct, setEditingProduct] = useState(null);
  const [editReason, setEditReason] = useState('');

  const [editingTransaction, setEditingTransaction] = useState(null);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [transactionToRefund, setTransactionToRefund] = useState(null);
  const [refundReason, setRefundReason] = useState('');

  const [barcodeNotFoundModal, setBarcodeNotFoundModal] = useState({ isOpen: false, code: '' });
  const [barcodeDuplicateModal, setBarcodeDuplicateModal] = useState({ isOpen: false, existingProduct: null, newBarcode: '' });
  const [pendingBarcodeForNewProduct, setPendingBarcodeForNewProduct] = useState('');

  // Estados nuevos
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [posSelectedClient, setPosSelectedClient] = useState(null);
  const [isRedemptionModalOpen, setIsRedemptionModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  // Inputs temporales
  const [newItem, setNewItem] = useState({
    title: '',
    brand: '',
    price: '',
    purchasePrice: '',
    stock: '',
    categories: [],
    image: '',
    barcode: ''
  });
  const [tempOpeningBalance, setTempOpeningBalance] = useState('');
  const [tempClosingTime, setTempClosingTime] = useState('21:00');

  // Filtros POS e Inventario
  const [selectedPayment, setSelectedPayment] = useState('Efectivo');
  const [installments, setInstallments] = useState(1);
  const [inventoryViewMode, setInventoryViewMode] = useState('grid');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('Todas');
  const [inventorySearch, setInventorySearch] = useState('');
  const [posSearch, setPosSearch] = useState('');
  
  const [posSelectedCategory, setPosSelectedCategory] = useState('Todas');
  const [posViewMode, setPosViewMode] = useState('grid');
  const [posGridColumns, setPosGridColumns] = useState(4);
  const [inventoryGridColumns, setInventoryGridColumns] = useState(5);

  // ==========================================
  // 4. SISTEMA DE NOTIFICACIONES
  // ==========================================
  const [notification, setNotification] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });

  const showNotification = (type, title, message) => {
    setNotification({ isOpen: true, type, title, message });
  };

  const closeNotification = () => {
    setNotification(prev => ({ ...prev, isOpen: false }));
  };

  // --- LOGGING CENTRALIZADO ---
  const addLog = async (action, details, reason = '') => {
    const newLog = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString('es-AR'),
      date: new Date().toLocaleDateString('es-AR'),
      action,
      user: currentUser?.name || 'Sistema',
      details,
      reason,
      created_at: new Date().toISOString()
    };
    setDailyLogs((prev) => [newLog, ...prev]);

    try {
      await supabase.from('logs').insert([{
         action,
         details,
         user: currentUser?.name || 'Sistema',
         reason,
         created_at: new Date().toISOString()
      }]);
    } catch (e) {
      console.error("Error guardando log en nube", e);
    }
  };

  // ==========================================
  // CLIENTES
  // ==========================================
  const handleAddMemberWithLog = async (data) => {
    try {
       const memberNum = Math.floor(10000 + Math.random() * 90000);
       const { data: newClient, error } = await supabase.from('clients').insert([{
          name: data.name, dni: data.dni, phone: data.phone, email: data.email, points: data.points || 0, member_number: memberNum
       }]).select().single();
       if (error) throw error;

       const clientFormatted = { ...newClient, memberNumber: newClient.member_number };
       setMembers([...members, clientFormatted]);
       
       addLog('Nuevo Socio', { name: clientFormatted.name, number: clientFormatted.memberNumber }, 'Registro manual');
       showNotification('success', 'Socio Creado', `#${memberNum}`);
       return clientFormatted;
    } catch (e) { 
       console.error(e);
       showNotification('error', 'Error', 'No se pudo crear socio'); 
    }
  };

  const handleUpdateMemberWithLog = async (id, updates) => {
    try {
      await supabase.from('clients').update(updates).eq('id', id);
      setMembers(members.map(m => m.id === id ? { ...m, ...updates } : m));
      addLog('Edición de Socio', { id, updates });
    } catch (e) {
      showNotification('error', 'Error', 'Fallo al actualizar socio');
    }
  };

  const handleDeleteMemberWithLog = async (id) => {
    try {
      await supabase.from('clients').delete().eq('id', id);
      setMembers(members.filter(m => m.id !== id));
      addLog('Baja de Socio', { id });
    } catch (e) {
      showNotification('error', 'Error', 'Fallo al eliminar socio');
    }
  };
  
  const checkExpirations = () => { /* Lógica futura */ };

  // ==========================================
  // 5. FUNCIÓN DE SONIDO BEEP
  // ==========================================
  const playBeep = (success = true) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = success ? 1200 : 400;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
      console.log('Audio not supported');
    }
  };

  // ==========================================
  // 6. CÁLCULOS Y EFECTOS
  // ==========================================
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

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); 
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isRegisterClosed && closingTime) {
      const nowStr = currentTime.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      if (nowStr === closingTime) {
        executeRegisterClose(true);
      }
    }
  }, [currentTime, closingTime, isRegisterClosed]);

  // ==========================================
  // 7. LÓGICA DE NEGOCIO
  // ==========================================

  const handleAddExpense = async (expenseData) => {
    try {
      const payload = {
        description: expenseData.description,
        amount: Number(expenseData.amount),
        category: expenseData.category,
        payment_method: expenseData.paymentMethod,
        user_name: currentUser.name
      };

      const { data, error } = await supabase.from('expenses').insert([payload]).select().single();
      if (error) throw error;

      const newExpense = {
        id: data.id,
        description: data.description,
        amount: data.amount,
        category: data.category,
        paymentMethod: data.payment_method,
        date: new Date(data.created_at).toLocaleDateString('es-AR'),
        time: new Date(data.created_at).toLocaleTimeString('es-AR'),
        user: data.user_name
      };

      setExpenses([newExpense, ...expenses]);
      addLog('Gasto', { description: newExpense.description, amount: newExpense.amount }, 'Salida de dinero');
      showNotification('success', 'Gasto Registrado', 'Se guardó correctamente en la nube.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo guardar el gasto.');
    }
  };

  const addToCart = (item) => {
    if (item.stock === 0) return;
    const existing = cart.find((c) => c.id === item.id && !c.isReward);
    if (existing) {
      if (existing.quantity >= item.stock) {
        showNotification('error', 'Stock Insuficiente', 'No quedan más unidades de este producto.');
        return;
      }
      setCart(cart.map((c) => (c.id === item.id && !c.isReward ? { ...c, quantity: c.quantity + 1 } : c)));
    } else {
      setCart([...cart, { ...item, quantity: 1 }]);
    }
  };

  const handleBarcodeScan = (scannedCode, wasInInput) => {
    const product = inventory.find(
      (p) => String(p.barcode) === scannedCode
    );

    if (activeTab === 'pos' && !isRegisterClosed) {
      if (product) {
        if (product.stock === 0) {
          playBeep(false);
          showNotification('error', 'Sin Stock', `"${product.title}" está agotado.`);
          return;
        }
        const inCart = cart.find(c => c.id === product.id);
        if (inCart && inCart.quantity >= product.stock) {
          playBeep(false);
          showNotification('error', 'Stock Insuficiente', `No quedan más unidades de "${product.title}".`);
          return;
        }
        playBeep(true);
        addToCart(product);
        showNotification('success', 'Producto Escaneado', `${product.title} agregado al carrito.`);
      } else {
        playBeep(false);
        if (currentUser.role !== 'admin') {
          showNotification('error', 'Producto No Habilitado', 'Contactarse con el dueño.');
          return; 
        }
        setBarcodeNotFoundModal({ isOpen: true, code: scannedCode });
      }
    } else if (activeTab === 'inventory') {
      playBeep(true);
      setInventorySearch(scannedCode);
      if (!product) {
        setTimeout(() => {
          if (currentUser.role !== 'admin') {
             showNotification('error', 'Producto No Habilitado', 'Contactarse con el dueño.');
             return; 
          }
          setBarcodeNotFoundModal({ isOpen: true, code: scannedCode });
        }, 300);
      }
    }
  };

  const handleInputScan = (scannedCode) => {
    if (activeTab === 'pos') {
      setPosSearch(''); 
    }
  };

  useBarcodeScanner({
    isEnabled: (activeTab === 'pos' && !isRegisterClosed) || activeTab === 'inventory',
    onScan: handleBarcodeScan,
    onInputScan: handleInputScan
  });

  const handleAddProductFromBarcode = (barcode) => {
    setBarcodeNotFoundModal({ isOpen: false, code: '' });
    setPendingBarcodeForNewProduct(barcode);
    setNewItem({
      title: '',
      brand: '',
      price: '',
      purchasePrice: '',
      stock: '',
      categories: [],
      image: '',
      barcode: barcode
    });
    setIsModalOpen(true);
  };

  const handleDuplicateBarcodeDetected = (existingProduct, newBarcode) => {
    setBarcodeDuplicateModal({
      isOpen: true,
      existingProduct,
      newBarcode
    });
  };

  const handleReplaceDuplicateBarcode = () => {
    const { existingProduct } = barcodeDuplicateModal;
    setInventory(inventory.map(p => 
      p.id === existingProduct.id ? { ...p, barcode: '' } : p
    ));
    setBarcodeDuplicateModal({ isOpen: false, existingProduct: null, newBarcode: '' });
    showNotification('info', 'Código Reemplazado', `Se quitó el código de "${existingProduct.title}".`);
  };

  const handleLogin = (role) => {
    setCurrentUser(USERS[role]);
    setActiveTab(role === 'admin' ? 'dashboard' : 'pos');
    addLog('Login', { role });
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
    setPosSelectedClient(null);
  };

  const handleImageUpload = (e, isEditing = false) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 500 * 1024) {
        showNotification('error', 'Error de Imagen', 'La imagen es muy pesada (>500KB).');
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

  const handleEditTransactionRequest = (tx) => {
    const safeTx = JSON.parse(JSON.stringify(tx));
    safeTx.items = safeTx.items.map((i) => ({
      ...i,
      qty: Number(i.qty) || 0,
      price: Number(i.price) || 0,
    }));
    setEditingTransaction(safeTx);
    setTransactionSearch('');
    setEditReason('');
  };

  const handleViewTicket = (tx) => {
    setTicketToView(tx);
  };

  const handlePrintTicket = () => {
    if (window.electronAPI && window.electronAPI.printSilent) {
      window.electronAPI.printSilent();
      showNotification('success', 'Imprimiendo...', 'El ticket se envió a la impresora.');
    } else {
      window.print();
    }
  };

  // --- CAJA ---
  const toggleRegisterStatus = () => {
    if (currentUser.role !== 'admin') {
      showNotification('error', 'Acceso Denegado', 'Solo el dueño puede gestionar la caja.');
      return;
    }

    if (isRegisterClosed) {
      setTempOpeningBalance('');
      setTempClosingTime('21:00');
      setIsOpeningBalanceModalOpen(true);
    } else {
      setIsClosingCashModalOpen(true);
    }
  };

  // --- LÓGICA DE CIERRE COMPLETA (MODIFICADO PARA SUPABASE + SYNC) ---
  const executeRegisterClose = async (isAuto = false) => {
    const closeDate = new Date();
    
    // ... Cálculos (sin cambios) ...
    const itemsSoldMap = {};
    let totalCost = 0; 
    validTransactions.forEach(tx => {
      tx.items.forEach(item => {
        const inventoryItem = inventory.find(p => p.id === (item.productId || item.id));
        const cost = Number(inventoryItem?.purchasePrice || 0);
        if (!itemsSoldMap[item.id]) itemsSoldMap[item.id] = { id: item.id, title: item.title, qty: 0, revenue: 0, cost: 0 };
        const qty = Number(item.qty || item.quantity || 0);
        const price = Number(item.price || 0);
        itemsSoldMap[item.id].qty += qty;
        itemsSoldMap[item.id].revenue += (price * qty); 
        itemsSoldMap[item.id].cost += (cost * qty);
        totalCost += (cost * qty);
      });
    });
    const itemsSoldList = Object.values(itemsSoldMap);
    const paymentMethodsSummary = {};
    validTransactions.forEach(tx => {
      const method = tx.payment || 'Otros';
      if (!paymentMethodsSummary[method]) paymentMethodsSummary[method] = 0;
      paymentMethodsSummary[method] += Number(tx.total);
    });
    const totalExpenses = expenses.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const cashExpenses = expenses.filter(e => e.paymentMethod === 'Efectivo').reduce((acc, curr) => acc + Number(curr.amount), 0);
    const averageTicket = salesCount > 0 ? (totalSales / salesCount) : 0;
    const netProfit = totalSales - totalCost - totalExpenses;
    const cashSales = validTransactions.filter(t => t.payment === 'Efectivo').reduce((acc, t) => acc + Number(t.total), 0);
    const finalPhysicalBalance = openingBalance + cashSales - cashExpenses;
    const todayStr = closeDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const newClientsList = dailyLogs.filter(l => l.date === todayStr && l.action === 'Nuevo Socio').map(l => ({ name: l.details.name, number: l.details.number, time: l.timestamp || l.time }));

    try {
        const openTime = dailyLogs.find(l => l.action === 'Apertura de Caja')?.timestamp || '--:--';
        const closeTime = closeDate.toLocaleTimeString('es-AR');
        const user = currentUser?.name || 'Automático';
        const type = isAuto ? 'Automático' : 'Manual';

        const payload = {
            date: closeDate.toLocaleDateString('es-AR'),
            open_time: openTime,
            close_time: closeTime,
            user_name: user,
            type: type,
            opening_balance: openingBalance,
            total_sales: totalSales,
            final_balance: finalPhysicalBalance,
            total_cost: totalCost,
            total_expenses: totalExpenses,
            net_profit: netProfit,
            sales_count: salesCount,
            average_ticket: averageTicket,
            payment_methods_summary: paymentMethodsSummary,
            items_sold_list: itemsSoldList,
            new_clients_list: newClientsList,
            expenses_snapshot: expenses,
            transactions_snapshot: validTransactions
        };

        const { data: savedReport, error } = await supabase.from('cash_closures').insert([payload]).select().single();
        if (error) throw error;

        const adaptedReport = {
            id: savedReport.id,
            date: savedReport.date,
            openTime: savedReport.open_time,
            closeTime: savedReport.close_time,
            user: savedReport.user_name,
            type: savedReport.type,
            openingBalance: Number(savedReport.opening_balance),
            totalSales: Number(savedReport.total_sales),
            finalBalance: Number(savedReport.final_balance),
            totalCost: Number(savedReport.total_cost),
            totalExpenses: Number(savedReport.total_expenses),
            netProfit: Number(savedReport.net_profit),
            salesCount: savedReport.sales_count,
            averageTicket: Number(savedReport.average_ticket),
            paymentMethods: savedReport.payment_methods_summary,
            itemsSold: savedReport.items_sold_list,
            newClients: savedReport.new_clients_list,
            expensesSnapshot: savedReport.expenses_snapshot,
            transactionsSnapshot: savedReport.transactions_snapshot
        };

        setPastClosures([adaptedReport, ...pastClosures]);
        
        // ✅ CAMBIO SYNC 4/4: Actualizar estado Global en DB (Cerrada)
        await supabase.from('register_state').update({
            is_open: false,
            opening_balance: 0,
            last_updated_by: currentUser?.name || 'Sistema'
        }).eq('id', 1);

        setIsRegisterClosed(true);
        addLog('Cierre de Caja', { totalSales, reportId: savedReport.id }, isAuto ? 'Automático' : 'Manual');
        setTransactions([]);
        setExpenses([]); 
        setIsClosingCashModalOpen(false);
        if (isAuto) setIsAutoCloseAlertOpen(true);
        
        showNotification('success', 'Reporte Generado', 'Se ha guardado el reporte del día en la nube.');

    } catch (e) {
        console.error("Error guardando cierre:", e);
        showNotification('error', 'Error al Cerrar', 'No se pudo guardar el reporte en la nube.');
        // Fallback local
        setIsRegisterClosed(true);
        setIsClosingCashModalOpen(false);
    }
  };

  const handleConfirmCloseCash = () => executeRegisterClose(false);

  // ✅ CAMBIO SYNC 4/4: Apertura de Caja -> DB
  const handleSaveOpeningBalance = async () => {
    const value = Number(tempOpeningBalance);
    if (!isNaN(value) && value >= 0 && tempClosingTime) {
      
      // Actualización optimista
      setOpeningBalance(value);
      setClosingTime(tempClosingTime);
      setIsRegisterClosed(false);
      setIsOpeningBalanceModalOpen(false);

      // Actualización DB
      try {
          await supabase.from('register_state').update({
              is_open: true,
              opening_balance: value,
              closing_time: tempClosingTime,
              last_updated_by: currentUser?.name
          }).eq('id', 1);

          addLog('Apertura de Caja', { amount: value, scheduledClosingTime: tempClosingTime }, 'Inicio de operaciones');
      } catch(e) {
          console.error("Error abriendo caja en nube:", e);
          showNotification('error', 'Error de Sincronización', 'La caja se abrió localmente pero falló la nube.');
      }
    }
  };

  const handleSaveClosingTime = async () => {
    addLog('Horario Modificado', `Nueva hora de cierre: ${closingTime}`, 'Ajuste de horario');
    setIsClosingTimeModalOpen(false);
    
    // Actualizar DB
    try {
        await supabase.from('register_state').update({ closing_time: closingTime }).eq('id', 1);
        showNotification('success', 'Horario Guardado', 'La hora de cierre se ha actualizado.');
    } catch(e) {
        console.error(e);
    }
  };

  // ✅ CAMBIO CATEGORÍAS 4/5: Ahora inserta en Supabase al crear categoría
  const handleAddCategoryFromView = async (name) => {
    if (name && !categories.includes(name)) {
      try {
        const { error } = await supabase.from('categories').insert([{ name }]);
        if (error) throw error;
        setCategories([...categories, name]);
        addLog('Categoría', { name, type: 'create' });
        showNotification('success', 'Categoría Creada', `Se agregó "${name}" correctamente.`);
      } catch (e) {
        console.error(e);
        showNotification('error', 'Error', 'No se pudo crear la categoría en la nube.');
      }
    } else {
      showNotification('warning', 'Atención', 'La categoría ya existe o es inválida.');
    }
  };

  // ✅ CAMBIO CATEGORÍAS 5/5: Ahora elimina de Supabase al borrar categoría
  const handleDeleteCategoryFromView = async (name) => {
    const inUse = inventory.some((p) =>
      Array.isArray(p.categories) ? p.categories.includes(name) : p.category === name
    );

    if (inUse) {
      showNotification('error', 'No se puede eliminar', 'Hay productos que utilizan esta categoría.');
      return;
    }
    if (window.confirm(`¿Eliminar categoría "${name}"?`)) {
      try {
        await supabase.from('categories').delete().eq('name', name);
        setCategories(categories.filter((c) => c !== name));
        addLog('Categoría', { name, type: 'delete' });
      } catch (e) {
        console.error(e);
        showNotification('error', 'Error', 'No se pudo eliminar de la nube.');
      }
    }
  };

  // --- MODIFICADO: Add Item ahora va a SUPABASE ---
  const handleAddItem = async (e) => {
    e.preventDefault();
    if (newItem.categories.length === 0) {
      showNotification('warning', 'Faltan datos', 'Por favor selecciona al menos una categoría.');
      return;
    }
    
    try {
      const payload = {
        title: newItem.title,
        brand: newItem.brand,
        price: Number(newItem.price) || 0,
        purchasePrice: Number(newItem.purchasePrice) || 0,
        stock: Number(newItem.stock) || 0,
        category: newItem.categories[0],
        barcode: newItem.barcode || null,
        image: newItem.image
      };
      
      const { data, error } = await supabase.from('products').insert([payload]).select().single();
      if (error) throw error;

      const itemFormatted = { ...data, categories: [data.category] };
      setInventory([...inventory, itemFormatted]);
      
      addLog('Alta de Producto', itemFormatted, 'Producto Nuevo');
      setNewItem({
        title: '', brand: '', price: '', purchasePrice: '', stock: '', categories: [], image: '', barcode: '',
      });
      setIsModalOpen(false);
      setPendingBarcodeForNewProduct('');
      showNotification('success', 'Producto Agregado', 'Guardado en la nube.');
    } catch (err) {
      showNotification('error', 'Error', 'No se pudo guardar el producto.');
    }
  };

  // --- MODIFICADO: Edit Product ahora va a SUPABASE ---
  const saveEditProduct = async (e) => {
    e.preventDefault();
    if (!editingProduct) return;
    
    try {
      const payload = {
         title: editingProduct.title,
         price: Number(editingProduct.price),
         stock: Number(editingProduct.stock),
         category: editingProduct.categories[0]
      };
      const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id);
      if (error) throw error;

      setInventory(inventory.map(p => p.id === editingProduct.id ? editingProduct : p));
      addLog('Edición Producto', { id: editingProduct.id }, editReason);
      setEditingProduct(null);
      setEditReason('');
      showNotification('success', 'Producto Editado', 'Cambios guardados.');
    } catch (err) {
      showNotification('error', 'Error', 'Fallo al editar.');
    }
  };

  // --- MODIFICADO: Delete Product ahora va a SUPABASE ---
  const handleDeleteProductRequest = (id) => {
    const product = inventory.find(p => p.id === id);
    if (product) {
      setProductToDelete(product);
      setDeleteProductReason('');
      setIsDeleteProductModalOpen(true);
    }
  };

  const confirmDeleteProduct = async (e) => {
    e.preventDefault();
    if (productToDelete) {
      try {
         await supabase.from('products').delete().eq('id', productToDelete.id);
         setInventory(inventory.filter((x) => x.id !== productToDelete.id));
         addLog('Baja Producto', productToDelete, deleteProductReason || 'Sin motivo');
         setIsDeleteProductModalOpen(false);
         setProductToDelete(null);
         showNotification('success', 'Producto Eliminado', 'Se quitó de la nube.');
      } catch (err) {
         showNotification('error', 'Error', 'No se puede borrar (posiblemente tenga ventas).');
      }
    }
  };

  const updateCartItemQty = (id, newQty) => {
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty < 1) return;
    const itemInStock = inventory.find((i) => i.id === id);
    if (qty > itemInStock.stock) {
      showNotification('error', 'Stock Insuficiente', `Máximo disponible: ${itemInStock.stock}`);
      return;
    }
    setCart(cart.map((c) => (c.id === id ? { ...c, quantity: qty } : c)));
  };
  const removeFromCart = (id) => setCart(cart.filter((c) => c.id !== id));

  const handleRedeemReward = (reward) => {
    if (!posSelectedClient) {
      showNotification('error', 'Error', 'No hay cliente seleccionado para el canje.');
      return;
    }
    const rewardItem = {
      id: reward.id, 
      title: `CANJE: ${reward.title}`,
      price: -Number(reward.discountAmount), 
      quantity: 1,
      isReward: true, 
      pointsCost: Number(reward.pointsCost), 
      image: 'reward' 
    };
    setCart([...cart, rewardItem]);
    setIsRedemptionModalOpen(false);
    showNotification('success', 'Premio Aplicado', 'El descuento se ha agregado al carrito.');
  };

  // --- MODIFICADO: Checkout ahora va a SUPABASE ---
  const handleCheckout = async () => {
    const total = calculateTotal();
    const stockIssues = cart.filter(c => !c.isReward).filter(c => {
      const i = inventory.find(x => x.id === c.id);
      return !i || i.stock < c.quantity;
    });

    if (stockIssues.length > 0) { showNotification('error', 'Error Stock', 'Revise el stock disponible.'); return; }

    try {
      Swal.fire({ title: 'Procesando...', didOpen: () => Swal.showLoading() });

      const pointsEarned = Math.floor(total / 150);
      const pointsSpent = cart.reduce((acc, i) => acc + (i.isReward ? i.pointsCost : 0), 0);
      const clientId = posSelectedClient?.id && posSelectedClient.id !== 'guest' ? posSelectedClient.id : null;

      // 1. Insertar Venta
      const { data: sale, error: saleErr } = await supabase.from('sales').insert({
          total, payment_method: selectedPayment, installments, client_id: clientId,
          points_earned: clientId ? pointsEarned : 0, points_spent: pointsSpent,
          user_name: currentUser.name // ✅ CAMBIO USUARIO: Guardar quién vendió
       }).select().single();
       if (saleErr) throw saleErr;

      // 2. Insertar Items
      const itemsPayload = cart.map(i => ({
          sale_id: sale.id, product_id: i.id, product_title: i.title, quantity: i.quantity, price: i.price, is_reward: !!i.isReward
       }));
       await supabase.from('sale_items').insert(itemsPayload);

      // 3. Update Stock DB
      for (const item of cart) {
          if (!item.isReward) {
             const prod = inventory.find(p => p.id === item.id);
             if (prod) await supabase.from('products').update({ stock: prod.stock - item.quantity }).eq('id', item.id);
          }
      }

      // 4. Update Client DB
      if (clientId) {
          const newPoints = posSelectedClient.points - pointsSpent + pointsEarned;
          await supabase.from('clients').update({ points: newPoints }).eq('id', clientId);
          setMembers(members.map(m => m.id === clientId ? { ...m, points: newPoints } : m));
      }

      // 5. Update Local State
      setInventory(inventory.map(p => {
        const c = cart.find(x => x.id === p.id && !x.isReward);
        return c ? { ...p, stock: p.stock - c.quantity } : p;
      }));

      const tx = {
        id: sale.id,
        date: new Date().toLocaleDateString('es-AR'),
        time: new Date().toLocaleTimeString('es-AR'),
        user: currentUser.name,
        total,
        payment: selectedPayment,
        installments: selectedPayment === 'Credito' ? installments : 0,
        items: cart,
        status: 'completed',
        client: posSelectedClient,
        pointsEarned: pointsEarned,
        pointsSpent: pointsSpent,
      };

      setTransactions([tx, ...transactions]);
      addLog('Venta Realizada', { transactionId: tx.id, total: total }, 'Venta regular');
      setSaleSuccessModal(tx);
      setCart([]); setInstallments(1); setPosSearch(''); setPosSelectedClient(null);
      Swal.close();

    } catch (e) {
      console.error(e);
      Swal.fire('Error', 'Fallo al guardar la venta', 'error');
    }
  };

  const handleDeleteTransaction = (tx) => {
    setTransactionToRefund(tx);
    setRefundReason('');
    setIsRefundModalOpen(true);
  };

  const handleConfirmRefund = (e) => {
    e.preventDefault();
    const tx = transactionToRefund;
    if (!tx) return;
    
    // Simplificación: Solo logueamos y borramos visualmente.
    // Devolver stock en DB requeriría más lógica, lo dejamos como "anulada" en logs.
    addLog('Venta Anulada', { id: tx.id }, refundReason);
    setTransactions(transactions.filter((t) => t.id !== tx.id));
    
    setIsRefundModalOpen(false);
    setTransactionToRefund(null);
    showNotification('success', 'Registro Borrado', 'La transacción fue eliminada del historial.');
  };

  const addTxItem = (product) => {
    if (!editingTransaction) return;
    const existingItemIndex = editingTransaction.items.findIndex(
      (i) => i.productId === product.id || (i.id === product.id && !i.productId)
    );
    let updatedItems;
    if (existingItemIndex !== -1) {
      updatedItems = editingTransaction.items.map((i, idx) =>
        idx === existingItemIndex ? { ...i, qty: (Number(i.qty) || 0) + 1 } : i
      );
    } else {
      const maxUniqueId = Math.max(0, ...editingTransaction.items.map((i) => i.uniqueId || 0));
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
    const newTotal = editingTransaction.payment === 'Credito' ? subtotal * 1.1 : subtotal;
    setEditingTransaction({ ...editingTransaction, items: updatedItems, total: newTotal });
    setTransactionSearch('');
  };

  const removeTxItem = (itemIndex) => {
    if (!editingTransaction) return;
    const updatedItems = editingTransaction.items.filter((item, idx) => idx !== itemIndex);
    if (updatedItems.length === 0) {
      showNotification('warning', 'Operación Inválida', 'No puedes dejar la orden vacía.');
      return;
    }
    const subtotal = updatedItems.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
    const newTotal = editingTransaction.payment === 'Credito' ? subtotal * 1.1 : subtotal;
    setEditingTransaction({ ...editingTransaction, items: updatedItems, total: newTotal });
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
    const subtotal = updatedItems.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
    const newTotal = editingTransaction.payment === 'Credito' ? subtotal * 1.1 : subtotal;
    setEditingTransaction({ ...editingTransaction, items: updatedItems, total: newTotal });
  };

  const handleEditTxPaymentChange = (newPayment) => {
    if (!editingTransaction) return;
    const subtotal = editingTransaction.items.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
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
    
    // Simplificación: Solo actualizamos estado local y log.
    // La edición retroactiva en DB es compleja y riesgosa para los logs de caja.
    setTransactions(
      transactions.map((t) => (t.id === editingTransaction.id ? editingTransaction : t))
    );
    addLog('Modificación Pedido', { transactionId: editingTransaction.id }, editReason);
    setEditingTransaction(null);
    setEditReason('');
    showNotification('success', 'Pedido Actualizado', 'La transacción fue modificada con éxito.');
  };

  // ✅ CAMBIO PREMIOS 4/4: Handlers CRUD conectados a Supabase
  const handleAddReward = async (rewardData) => {
    try {
      const payload = {
        title: rewardData.title,
        description: rewardData.description,
        points_cost: Number(rewardData.pointsCost),
        type: rewardData.type,
        discount_amount: Number(rewardData.discountAmount) || 0,
        stock: Number(rewardData.stock) || 0
      };

      const { data, error } = await supabase.from('rewards').insert([payload]).select().single();
      if (error) throw error;

      const newReward = {
        id: data.id,
        title: data.title,
        description: data.description,
        pointsCost: data.points_cost,
        type: data.type,
        discountAmount: data.discount_amount,
        stock: data.stock
      };

      setRewards([...rewards, newReward]);
      addLog('Nuevo Premio', { title: newReward.title }, 'Gestión Catálogo');
      showNotification('success', 'Premio Creado', 'Se ha añadido al catálogo.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo crear el premio.');
    }
  };

  const handleUpdateReward = async (id, updatedData) => {
    try {
      const payload = {
        title: updatedData.title,
        description: updatedData.description,
        points_cost: Number(updatedData.pointsCost),
        type: updatedData.type,
        discount_amount: Number(updatedData.discountAmount) || 0,
        stock: Number(updatedData.stock) || 0
      };

      const { error } = await supabase.from('rewards').update(payload).eq('id', id);
      if (error) throw error;

      setRewards(rewards.map(r => r.id === id ? { ...r, ...updatedData } : r));
      addLog('Editar Premio', { title: updatedData.title });
      showNotification('success', 'Premio Actualizado', 'Cambios guardados.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo actualizar el premio.');
    }
  };

  const handleDeleteReward = async (id) => {
    try {
      const { error } = await supabase.from('rewards').delete().eq('id', id);
      if (error) throw error;

      setRewards(rewards.filter(r => r.id !== id));
      addLog('Eliminar Premio', { id });
      showNotification('success', 'Premio Eliminado', 'Se quitó del catálogo.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo eliminar el premio.');
    }
  };

  // --- RENDERIZADO LOGIN ---
  if (isCloudLoading) return <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-100"><RefreshCw className="animate-spin text-fuchsia-600 mb-4" size={48} /><h2 className="text-xl font-bold">Cargando Nube...</h2></div>;

  if (!currentUser) {
    if (loginStep === 'select') {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-100">
          <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-xs text-center border">
            <div className="flex justify-center mb-4"><div className="p-3 bg-fuchsia-600 rounded-xl shadow-lg"><PartyPopper className="text-white" size={32} /></div></div>
            <h1 className="text-lg font-bold text-slate-800 mb-1">PartyManager</h1>
            <p className="text-slate-500 text-xs mb-6">Selecciona tu usuario</p>
            <div className="space-y-3">
              <button onClick={() => handleSelectRole('admin')} className="w-full flex items-center gap-3 p-3 border rounded-xl hover:bg-slate-50 transition-colors group"><div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">DU</div><div className="text-left flex-1"><p className="font-bold text-slate-800 text-sm">Dueño</p></div><ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500" /></button>
              <button onClick={() => handleSelectRole('seller')} className="w-full flex items-center gap-3 p-3 border rounded-xl hover:bg-slate-50 transition-colors group"><div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-xs">VE</div><div className="text-left flex-1"><p className="font-bold text-slate-800 text-sm">Vendedor</p></div><ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500" /></button>
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
              <button onClick={() => setLoginStep('select')} className="text-slate-400 hover:text-slate-600"><ArrowLeft size={20} /></button>
              <h1 className="text-lg font-bold text-slate-800">Iniciar Sesión</h1>
              <div className="w-5"></div>
            </div>
            <div className="mb-6 flex flex-col items-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm mb-2 ${user.role === 'admin' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>{user.avatar}</div>
              <p className="font-bold text-slate-700">{user.name}</p>
            </div>
            <form onSubmit={handleSubmitLogin} className="space-y-4">
              <div>
                <input autoFocus type="password" placeholder="Contraseña" className="w-full px-4 py-3 border border-slate-300 rounded-xl text-center text-lg tracking-widest focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none bg-white text-slate-800 placeholder:text-slate-400" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} />
                {loginError && (<p className="text-xs text-red-500 mt-2">{loginError}</p>)}
              </div>
              <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors">Ingresar</button>
            </form>
          </div>
        </div>
      );
    }
  }

  // --- MAIN LAYOUT ---
  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-900 text-sm overflow-hidden">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={handleLogout} />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-white border-b h-14 flex items-center justify-between px-6 shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-800 uppercase tracking-wide">
                {activeTab === 'pos' ? 'Punto de Venta' : activeTab === 'dashboard' ? 'Control de Caja' : activeTab}
              </h2>
              <div className="flex items-center gap-2 text-[10px] text-slate-400"><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span><span>Supabase ON</span></div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button onClick={currentUser.role === 'admin' ? toggleRegisterStatus : undefined} className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors ${isRegisterClosed ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'} ${currentUser.role === 'admin' ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`} title={currentUser.role !== 'admin' ? 'Solo el Dueño puede cambiar el estado de la caja' : ''}><Lock size={14} /><span className="text-xs font-bold">{isRegisterClosed ? 'CAJA CERRADA' : 'CAJA ABIERTA'}</span></button>
              {!isRegisterClosed && closingTime && (<div className="flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-700"><Clock size={12} /><span className="text-[10px] font-bold">Cierre: {closingTime}</span></div>)}
            </div>
            <div className="text-right hidden sm:block"><p className="text-xs font-bold text-slate-700">{currentUser.name}</p><span className={`text-[10px] px-2 py-0.5 rounded font-bold ${currentUser.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{currentUser.role === 'admin' ? 'DUEÑO' : 'VENDEDOR'}</span></div>
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
              expenses={expenses}
              onOpenExpenseModal={() => setIsExpenseModalOpen(true)}
            />
          )}
          {activeTab === 'inventory' && (<InventoryView inventory={inventory} categories={categories} currentUser={currentUser} inventoryViewMode={inventoryViewMode} setInventoryViewMode={setInventoryViewMode} gridColumns={inventoryGridColumns} setGridColumns={setInventoryGridColumns} inventorySearch={inventorySearch} setInventorySearch={setInventorySearch} inventoryCategoryFilter={inventoryCategoryFilter} setInventoryCategoryFilter={setInventoryCategoryFilter} setIsModalOpen={setIsModalOpen} setEditingProduct={(prod) => { setEditingProduct(prod); setEditReason(''); }} handleDeleteProduct={handleDeleteProductRequest} setSelectedImage={setSelectedImage} setIsImageModalOpen={setIsImageModalOpen} />)}
          {activeTab === 'pos' && (isRegisterClosed ? (<div className="h-full flex flex-col items-center justify-center text-slate-400"><Lock size={64} className="mb-4 text-slate-300" /><h3 className="text-xl font-bold text-slate-600">Caja Cerrada</h3>{currentUser.role === 'admin' ? (<><p className="mb-6">Debes abrir la caja para realizar ventas.</p><button onClick={toggleRegisterStatus} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700">Abrir Caja</button></>) : (<p className="mb-6 text-center">El Dueño debe abrir la caja para realizar ventas.</p>)}</div>) : (<POSView inventory={inventory} categories={categories} addToCart={addToCart} cart={cart} removeFromCart={removeFromCart} updateCartItemQty={updateCartItemQty} selectedPayment={selectedPayment} setSelectedPayment={setSelectedPayment} installments={installments} setInstallments={setInstallments} calculateTotal={calculateTotal} handleCheckout={handleCheckout} posSearch={posSearch} setPosSearch={setPosSearch} selectedCategory={posSelectedCategory} setSelectedCategory={setPosSelectedCategory} posViewMode={posViewMode} setPosViewMode={setPosViewMode} gridColumns={posGridColumns} setGridColumns={setPosGridColumns} selectedClient={posSelectedClient} setSelectedClient={setPosSelectedClient} onOpenClientModal={() => setIsClientModalOpen(true)} onOpenRedemptionModal={() => setIsRedemptionModalOpen(true)} />))}
          
          {activeTab === 'clients' && (
            <ClientsView 
              members={members} 
              addMember={handleAddMemberWithLog} 
              updateMember={handleUpdateMemberWithLog} 
              deleteMember={handleDeleteMemberWithLog} 
              currentUser={currentUser} 
              onViewTicket={handleViewTicket} 
              onEditTransaction={handleEditTransactionRequest} 
              onDeleteTransaction={handleDeleteTransaction} 
              transactions={transactions}
              checkExpirations={() => {}} 
            />
          )}
          
          {activeTab === 'history' && (<HistoryView transactions={transactions} dailyLogs={dailyLogs} inventory={inventory} currentUser={currentUser} showNotification={showNotification} onViewTicket={handleViewTicket} onDeleteTransaction={handleDeleteTransaction} onEditTransaction={handleEditTransactionRequest} setTransactions={setTransactions} setDailyLogs={setDailyLogs} />)}
          {activeTab === 'rewards' && (<RewardsView rewards={rewards} onAddReward={handleAddReward} onUpdateReward={handleUpdateReward} onDeleteReward={handleDeleteReward} />)}
          {activeTab === 'reports' && currentUser.role === 'admin' && (<ReportsHistoryView pastClosures={pastClosures} members={members}/>)}
          {activeTab === 'logs' && currentUser.role === 'admin' && (<LogsView dailyLogs={dailyLogs} setDailyLogs={setDailyLogs} inventory={inventory} />)}
          {activeTab === 'categories' && currentUser.role === 'admin' && (<CategoryManagerView categories={categories} inventory={inventory} onAddCategory={handleAddCategoryFromView} onDeleteCategory={handleDeleteCategoryFromView} />)}
        </main>
      </div>

      {/* --- MODALES --- */}
      <div className="hidden"><TicketPrintLayout transaction={ticketToView || saleSuccessModal} /></div>
      <NotificationModal isOpen={notification.isOpen} onClose={closeNotification} type={notification.type} title={notification.title} message={notification.message} />
      <OpeningBalanceModal isOpen={isOpeningBalanceModalOpen} onClose={() => setIsOpeningBalanceModalOpen(false)} tempOpeningBalance={tempOpeningBalance} setTempOpeningBalance={setTempOpeningBalance} tempClosingTime={tempClosingTime} setTempClosingTime={setTempClosingTime} onSave={handleSaveOpeningBalance} />
      <ClosingTimeModal isOpen={isClosingTimeModalOpen} onClose={() => setIsClosingTimeModalOpen(false)} closingTime={closingTime} setClosingTime={setClosingTime} onSave={handleSaveClosingTime} />
      <AddProductModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setPendingBarcodeForNewProduct(''); }} newItem={newItem} setNewItem={setNewItem} categories={categories} onImageUpload={handleImageUpload} onAdd={handleAddItem} inventory={inventory} onDuplicateBarcode={handleDuplicateBarcodeDetected} />
      <EditProductModal product={editingProduct} onClose={() => setEditingProduct(null)} setEditingProduct={setEditingProduct} categories={categories} onImageUpload={handleImageUpload} editReason={editReason} setEditReason={setEditReason} onSave={saveEditProduct} inventory={inventory} onDuplicateBarcode={handleDuplicateBarcodeDetected} />
      <EditTransactionModal transaction={editingTransaction} onClose={() => setEditingTransaction(null)} inventory={inventory} setEditingTransaction={setEditingTransaction} transactionSearch={transactionSearch} setTransactionSearch={setTransactionSearch} addTxItem={addTxItem} removeTxItem={removeTxItem} setTxItemQty={setTxItemQty} handlePaymentChange={handleEditTxPaymentChange} editReason={editReason} setEditReason={setEditReason} onSave={handleSaveEditedTransaction} />
      <ImageModal isOpen={isImageModalOpen} image={selectedImage} onClose={() => setIsImageModalOpen(false)} />
      <RefundModal transaction={transactionToRefund} onClose={() => setIsRefundModalOpen(false)} refundReason={refundReason} setRefundReason={setRefundReason} onConfirm={handleConfirmRefund} />
      <CloseCashModal isOpen={isClosingCashModalOpen} onClose={() => setIsClosingCashModalOpen(false)} salesCount={salesCount} totalSales={totalSales} openingBalance={openingBalance} onConfirm={handleConfirmCloseCash} />
      <SaleSuccessModal transaction={saleSuccessModal} onClose={() => setSaleSuccessModal(null)} onViewTicket={() => { const tx = saleSuccessModal; setSaleSuccessModal(null); setTicketToView(tx); }} />
      <TicketModal transaction={ticketToView} onClose={() => setTicketToView(null)} onPrint={handlePrintTicket} />
      <AutoCloseAlertModal isOpen={isAutoCloseAlertOpen} onClose={() => setIsAutoCloseAlertOpen(false)} closingTime={closingTime} />
      <DeleteProductModal product={productToDelete} onClose={() => setIsDeleteProductModalOpen(false)} reason={deleteProductReason} setReason={setDeleteProductReason} onConfirm={confirmDeleteProduct} />
      <BarcodeNotFoundModal isOpen={barcodeNotFoundModal.isOpen} scannedCode={barcodeNotFoundModal.code} onClose={() => setBarcodeNotFoundModal({ isOpen: false, code: '' })} onAddProduct={handleAddProductFromBarcode} />
      <BarcodeDuplicateModal isOpen={barcodeDuplicateModal.isOpen} existingProduct={barcodeDuplicateModal.existingProduct} onClose={() => setBarcodeDuplicateModal({ isOpen: false, existingProduct: null, newBarcode: '' })} onKeepExisting={() => setBarcodeDuplicateModal({ isOpen: false, existingProduct: null, newBarcode: '' })} onReplaceBarcode={handleReplaceDuplicateBarcode} />
      <ClientSelectionModal isOpen={isClientModalOpen} onClose={() => setIsClientModalOpen(false)} clients={members} addClient={handleAddMemberWithLog} onSelectClient={(client) => setPosSelectedClient(client)} onCancelFlow={() => { setPosSelectedClient({ id: 'guest', name: 'No asociado', memberNumber: '---', points: 0 }); setIsClientModalOpen(false); }} />
      <RedemptionModal isOpen={isRedemptionModalOpen} onClose={() => setIsRedemptionModalOpen(false)} client={posSelectedClient} rewards={rewards} onRedeem={handleRedeemReward} />
      <ExpenseModal isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} onSave={handleAddExpense} />
    </div>
  );
}