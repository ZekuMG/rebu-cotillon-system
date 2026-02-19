import React, { useState, useEffect, useMemo } from 'react';
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
import { uploadProductImage, deleteProductImage } from './utils/storage';
import { formatDateAR, formatTimeAR, formatTimeFullAR } from './utils/helpers';

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
  // ClientSelectionModal
} from './components/AppModals';

// Modales Nuevos
import { ExpenseModal } from './components/modals/ExpenseModal';
import { RedemptionModal } from './components/modals/RedemptionModal';
import { TicketPrintLayout } from './components/TicketPrintLayout';
import { ClientSelectionModal } from './components/modals/ClientSelectionModal';

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
  const [registerOpenedAt, setRegisterOpenedAt] = useState(null);


  // ==========================================
  // 1.5 CONEXIÓN SUPABASE (Fetch Inicial + Auto-Healing)
  // ==========================================
const fetchCloudData = async (showSpinner = true) => {
    try {
      if (showSpinner) setIsCloudLoading(true);
      
      const [
        prodResult,
        clientResult,
        salesResult,
        logsResult,
        expResult,
        closureResult,
        catResult,
        rewardsResult,
        registerResult
      ] = await Promise.allSettled([
        supabase.from('products').select('*').eq('is_active', true).order('title'),
        supabase.from('clients').select('*').eq('is_active', true).order('name'),
        supabase.from('sales').select(`*, sale_items(*), clients(name, member_number)`).order('created_at', { ascending: false }).limit(100),
        supabase.from('logs').select('*').order('created_at', { ascending: false }),
        supabase.from('expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('cash_closures').select('*').order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('name'),
        supabase.from('rewards').select('*').order('points_cost', { ascending: true }),
        supabase.from('register_state').select('*').eq('id', 1).maybeSingle() 
      ]);

      const safeData = (result, tableName) => {
        if (result.status === 'fulfilled' && !result.value.error) {
          return result.value.data || [];
        }
        console.error(`Error en tabla [${tableName}]:`, result.status === 'rejected' ? result.reason : result.value.error);
        return null;
      };

      const prodData = safeData(prodResult, 'productos');
      if (prodData) {
        setInventory(prodData.map(p => ({
          ...p,
          // FIX MULTI-CATEGORÍA: Convertimos el string separado por comas en un Array real
          categories: p.category ? p.category.split(',').map(c => c.trim()).filter(Boolean) : [],
          purchasePrice: p.purchasePrice || 0
        })));
      }

      const clientData = safeData(clientResult, 'clientes');
      if (clientData) {
        setMembers(clientData.map(c => ({
          ...c,
          memberNumber: c.member_number
        })));
      }

      const salesData = safeData(salesResult, 'ventas');
      if (salesData) {
        setTransactions(salesData.map(sale => ({
          id: sale.id,
          date: formatDateAR(new Date(sale.created_at)),
          time: formatTimeFullAR(new Date(sale.created_at)),
          total: sale.total,
          payment: sale.payment_method,
          installments: sale.installments,
          items: (sale.sale_items || []).map(i => ({
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
        })));
      }

      const logsData = safeData(logsResult, 'logs');
      if (logsData) {
        setDailyLogs(logsData.map(log => ({
          id: log.id,
          action: log.action,
          details: log.details,
          user: log.user,
          reason: log.reason,
          date: formatDateAR(new Date(log.created_at)),
          timestamp: formatTimeFullAR(new Date(log.created_at))
        })));
      }

      const expData = safeData(expResult, 'gastos');
      if (expData) {
        setExpenses(expData.map(e => ({
          id: e.id,
          description: e.description,
          amount: e.amount,
          category: e.category,
          paymentMethod: e.payment_method,
          date: formatDateAR(new Date(e.created_at)),
          time: formatTimeFullAR(new Date(e.created_at)),
          user: e.user_name || 'Sistema'
        })));
      }

      const closureData = safeData(closureResult, 'reportes');
      if (closureData) {
        setPastClosures(closureData.map(c => ({
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
        })));
      }

      const catData = safeData(catResult, 'categorias');
      if (catData) setCategories(catData.map(c => c.name));

      const rewardsData = safeData(rewardsResult, 'premios');
      if (rewardsData) {
        setRewards(rewardsData.map(r => ({
          id: r.id,
          title: r.title,
          description: r.description,
          pointsCost: r.points_cost,
          type: r.type,
          discountAmount: r.discount_amount,
          stock: r.stock
        })));
      }

      // I. ESTADO DE CAJA 
      let registerState = null;
      if (registerResult.status === 'fulfilled' && !registerResult.value.error) {
        registerState = registerResult.value.data;
      }

      if (!registerState) {
        console.warn("⚠️ Estado de caja no encontrado o inaccesible, intentando upsert...");
        const { data: newState, error: upsertErr } = await supabase
          .from('register_state')
          .upsert([{ id: 1, is_open: false, opening_balance: 0, closing_time: '21:00' }], { onConflict: 'id' })
          .select()
          .maybeSingle();
        
        if (!upsertErr && newState) registerState = newState;
        else if (upsertErr) console.error("Error crítico en register_state:", upsertErr);
      }

      if (registerState) {
        setIsRegisterClosed(!registerState.is_open);
        setOpeningBalance(Number(registerState.opening_balance));
        setClosingTime(registerState.closing_time || '21:00');
        setRegisterOpenedAt(registerState.opened_at || null);
      }

      const failed = [
        !prodData && 'Productos', !clientData && 'Clientes', !salesData && 'Ventas',
        !logsData && 'Logs', !expData && 'Gastos', !closureData && 'Reportes',
        !catData && 'Categorías', !rewardsData && 'Premios'
      ].filter(Boolean);

      if (failed.length > 0) {
        Swal.fire('Carga Parcial', `Revisa los permisos de Supabase (RLS). Fallaron: ${failed.join(', ')}`, 'warning');
      }

    } catch (error) {
      console.error('Error general de conexión:', error);
      Swal.fire('Error de Conexión', 'Fallo total de red o configuración.', 'error');
    } finally {
      setIsCloudLoading(false);
    }
  };

  
useEffect(() => {
  fetchCloudData(true);

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
          setRegisterOpenedAt(newState.opened_at || null);
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


let lastFetchTime = Date.now();
  const MIN_RESYNC_INTERVAL = 15000; 

  const handleReSync = () => {
    if (document.visibilityState !== 'visible') return;

    const elapsed = Date.now() - lastFetchTime;
    if (elapsed < MIN_RESYNC_INTERVAL) {
      return;
    }

    lastFetchTime = Date.now();
    fetchCloudData(false); 
  };

  window.addEventListener('visibilitychange', handleReSync);

  return () => {
    supabase.removeChannel(channel);
    window.removeEventListener('visibilitychange', handleReSync);
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
  const [isUploadingImage, setIsUploadingImage] = useState(false);


  const [editingTransaction, setEditingTransaction] = useState(null);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [transactionToRefund, setTransactionToRefund] = useState(null);
  const [refundReason, setRefundReason] = useState('');

  const [barcodeNotFoundModal, setBarcodeNotFoundModal] = useState({ isOpen: false, code: '' });
  const [barcodeDuplicateModal, setBarcodeDuplicateModal] = useState({ isOpen: false, existingProduct: null, newBarcode: '' });
  const [pendingBarcodeForNewProduct, setPendingBarcodeForNewProduct] = useState('');

  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [posSelectedClient, setPosSelectedClient] = useState(null);
  const [isRedemptionModalOpen, setIsRedemptionModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

const [newItem, setNewItem] = useState({
  title: '', brand: '', price: '', purchasePrice: '', stock: '',
  categories: [], image: '', barcode: '',
  product_type: 'quantity'  
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
    const now = new Date();
    const newLog = {
      id: Date.now(),
      timestamp: formatTimeFullAR(now),
      date: formatDateAR(now),
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
    const dbUpdates = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.dni !== undefined) dbUpdates.dni = updates.dni;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.points !== undefined) dbUpdates.points = updates.points;
    if (updates.memberNumber !== undefined) dbUpdates.member_number = updates.memberNumber;

    const { error } = await supabase.from('clients').update(dbUpdates).eq('id', id);
    if (error) throw error;

    setMembers(members.map(m => m.id === id ? { ...m, ...updates } : m));
    addLog('Edición de Socio', { id, updates });
  } catch (e) {
    console.error('Error actualizando socio:', e);
    showNotification('error', 'Error', `Fallo al actualizar socio: ${e.message || 'Error desconocido'}`);
  }
};

const handleDeleteMemberWithLog = async (id) => {
  try {
    const memberToDelete = members.find(m => m.id === id);

    const { error } = await supabase.from('clients').delete().eq('id', id);

    if (error) {
      if (error.message?.includes('foreign key') || error.code === '23503') {
        const { error: softErr } = await supabase
          .from('clients')
          .update({ is_active: false })
          .eq('id', id);
        if (softErr) throw softErr;
      } else {
        throw error;
      }
    }

    setMembers(members.filter(m => m.id !== id));
    addLog('Baja de Socio', { id, name: memberToDelete?.name || 'Desconocido' });
    showNotification('success', 'Socio Eliminado', 'Se quitó correctamente.');
  } catch (e) {
    console.error('Error eliminando socio:', e);
    showNotification('error', 'Error al Eliminar', `No se pudo borrar: ${e.message}`);
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

    // ✅ Helpers para parsear fechas de transacciones y gastos locales
  const parseTxDate = (tx) => {
    try {
      if (tx.date && tx.time) {
        const [day, month, year] = tx.date.split('/');
        let fullYear = parseInt(year, 10);
        if (fullYear < 100) fullYear += 2000;
        const timeClean = tx.time.split(' ')[0]; // Limpiar posible AM/PM residual
        return new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10),
          ...timeClean.split(':').map(Number));
      }
      return null;
    } catch { return null; }
  };

  const parseExpDate = (exp) => {
    try {
      if (exp.date && exp.time) {
        const [day, month, year] = exp.date.split('/');
        let fullYear = parseInt(year, 10);
        if (fullYear < 100) fullYear += 2000;
        const timeClean = exp.time.split(' ')[0];
        return new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10),
          ...timeClean.split(':').map(Number));
      }
      return null;
    } catch { return null; }
  };



  // ✅ FIX: Cálculos filtrados por ciclo de caja (desde apertura)
  const cycleTransactions = useMemo(() => {
    if (!registerOpenedAt) return validTransactions;
    const cycleStart = new Date(registerOpenedAt);
    return validTransactions.filter(tx => {
      const txDate = parseTxDate(tx);
      return txDate && txDate >= cycleStart;
    });
  }, [validTransactions, registerOpenedAt]);

  const cycleExpenses = useMemo(() => {
    if (!registerOpenedAt) return expenses;
    const cycleStart = new Date(registerOpenedAt);
    return expenses.filter(exp => {
      const expDate = parseExpDate(exp);
      return expDate && expDate >= cycleStart;
    });
  }, [expenses, registerOpenedAt]);

  const cycleTotalSales = cycleTransactions.reduce(
    (acc, tx) => acc + (Number(tx.total) || 0), 0
  );
  const cycleSalesCount = cycleTransactions.length;
  const cycleTotalExpenses = cycleExpenses.reduce(
    (acc, exp) => acc + (Number(exp.amount) || 0), 0
  );
  const cycleCashExpenses = cycleExpenses
    .filter(e => e.paymentMethod === 'Efectivo')
    .reduce((acc, exp) => acc + (Number(exp.amount) || 0), 0);
  const cycleCashSales = cycleTransactions
    .filter(t => t.payment === 'Efectivo')
    .reduce((acc, t) => acc + (Number(t.total) || 0), 0);


  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
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
      const safeDescription = expenseData.description || expenseData.concept || expenseData.notes || 'Gasto General';
      const safeAmount = Number(expenseData.amount) || 0;

      const payload = {
        description: safeDescription,
        amount: safeAmount,
        category: expenseData.category || 'Varios',
        payment_method: expenseData.paymentMethod || 'Efectivo',
        user_name: currentUser?.name || 'Sistema'
      };

      const { data, error } = await supabase.from('expenses').insert([payload]).select().single();
      if (error) throw error;

      const newExpense = {
        id: data.id,
        description: data.description,
        amount: data.amount,
        category: data.category,
        paymentMethod: data.payment_method,
        date: formatDateAR(new Date(data.created_at)),
        time: formatTimeFullAR(new Date(data.created_at)),
        user: data.user_name
      };

      setExpenses([newExpense, ...expenses]);
      addLog('Nuevo Gasto', { description: newExpense.description, amount: newExpense.amount, category: newExpense.category, paymentMethod: newExpense.paymentMethod }, 'Salida de dinero');
      showNotification('success', 'Gasto Registrado', 'Se guardó correctamente en la nube.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo guardar el gasto. Verifique los datos.');
    }
  };
  
const addToCart = (item, grams = null) => {
  if (item.stock === 0) return;
  
  // ✅ PRODUCTO POR PESO
  if (item.product_type === 'weight' && grams) {
    const existing = cart.find((c) => c.id === item.id && !c.isReward);
    if (existing) {
      const newTotal = existing.quantity + grams;
      if (newTotal > item.stock) {
        showNotification('error', 'Stock Insuficiente', `Solo quedan ${item.stock}g disponibles.`);
        return;
      }
      setCart(cart.map((c) => (c.id === item.id && !c.isReward ? { ...c, quantity: newTotal } : c)));
    } else {
      if (grams > item.stock) {
        showNotification('error', 'Stock Insuficiente', `Solo quedan ${item.stock}g disponibles.`);
        return;
      }
      setCart([...cart, { ...item, quantity: grams }]);
    }
    return;
  }
  
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
    title: '', brand: '', price: '', purchasePrice: '', stock: '',
    categories: [], image: '', barcode: barcode,
    product_type: 'quantity'  
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
    addLog('Login', { role, name: USERS[role]?.name || role });
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

const handleImageUpload = async (e, isEditing = false) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showNotification('error', 'Imagen muy pesada', 'El máximo permitido es 5MB.');
    return;
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!validTypes.includes(file.type)) {
    showNotification('error', 'Formato no válido', 'Solo JPG, PNG, WebP o GIF.');
    return;
  }

  e.target.value = '';

  try {
    setIsUploadingImage(true);

    const publicUrl = await uploadProductImage(file);

    if (isEditing) {
      setEditingProduct((prev) => prev ? { ...prev, image: publicUrl } : prev);
    } else {
      setNewItem((prev) => ({ ...prev, image: publicUrl }));
    }

    showNotification('success', 'Imagen subida', 'Se cargó correctamente a la nube.');
  } catch (err) {
    console.error('Error subiendo imagen:', err);
    showNotification('error', 'Error al subir', 'No se pudo subir la imagen. Intentá de nuevo.');
  } finally {
    setIsUploadingImage(false);
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

const executeRegisterClose = async (isAuto = false) => {
    const closeDate = new Date();
    
    // ✅ FIX: Filtrar SOLO ventas y gastos del ciclo actual (desde apertura)
    const cycleStart = registerOpenedAt ? new Date(registerOpenedAt) : null;
    
    const cycleTransactions = cycleStart
      ? safeTransactions.filter(tx => {
          if (!tx || tx.status === 'voided') return false;
          // Buscar la venta en la data cruda por ID para comparar created_at
          // Como las transacciones locales tienen date/time en formato AR, 
          // usamos el ID (que viene de Supabase) para comparar
          // Las ventas creadas en esta sesión tienen timestamp posterior a cycleStart
          const txDate = parseTxDate(tx);
          return txDate && txDate >= cycleStart;
        })
      : validTransactions;

    const cycleExpenses = cycleStart
      ? expenses.filter(exp => {
          const expDate = parseExpDate(exp);
          return expDate && expDate >= cycleStart;
        })
      : expenses;

    // Usar cycleTransactions y cycleExpenses en vez de validTransactions y expenses
    const cycleTotalSales = cycleTransactions.reduce((acc, tx) => acc + (Number(tx.total) || 0), 0);
    const cycleSalesCount = cycleTransactions.length;

    const itemsSoldMap = {};
    let totalCost = 0; 
    cycleTransactions.forEach(tx => {
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
    cycleTransactions.forEach(tx => {
      const method = tx.payment || 'Otros';
      if (!paymentMethodsSummary[method]) paymentMethodsSummary[method] = 0;
      paymentMethodsSummary[method] += Number(tx.total);
    });

    const totalExpenses = cycleExpenses.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const cashExpenses = cycleExpenses.filter(e => e.paymentMethod === 'Efectivo').reduce((acc, curr) => acc + Number(curr.amount), 0);
    const averageTicket = cycleSalesCount > 0 ? (cycleTotalSales / cycleSalesCount) : 0;
    const netProfit = cycleTotalSales - totalCost - totalExpenses;
    const cashSales = cycleTransactions.filter(t => t.payment === 'Efectivo').reduce((acc, t) => acc + Number(t.total), 0);
    const finalPhysicalBalance = openingBalance + cashSales - cashExpenses;

    // Nuevos clientes: filtrar los logs del ciclo actual
    const cycleNewClients = cycleStart
      ? dailyLogs.filter(l => {
          if (l.action !== 'Nuevo Socio') return false;
          const logDate = l.created_at ? new Date(l.created_at) : null;
          return logDate && logDate >= cycleStart;
        }).map(l => ({ name: l.details?.name, number: l.details?.number, time: l.timestamp || l.time }))
      : (() => {
          const todayStr = closeDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
          return dailyLogs.filter(l => l.date === todayStr && l.action === 'Nuevo Socio').map(l => ({ name: l.details?.name, number: l.details?.number, time: l.timestamp || l.time }));
        })();

    try {
        const openTime = registerOpenedAt 
          ? formatTimeFullAR(new Date(registerOpenedAt))
          : (dailyLogs.find(l => l.action === 'Apertura de Caja')?.timestamp || '--:--');
        const closeTime = formatTimeFullAR(closeDate);
        const user = currentUser?.name || 'Automático';
        const type = isAuto ? 'Automático' : 'Manual';

        const payload = {
            date: formatDateAR(closeDate),
            open_time: openTime,
            close_time: closeTime,
            user_name: user,
            type: type,
            opening_balance: openingBalance,
            total_sales: cycleTotalSales,
            final_balance: finalPhysicalBalance,
            total_cost: totalCost,
            total_expenses: totalExpenses,
            net_profit: netProfit,
            sales_count: cycleSalesCount,
            average_ticket: averageTicket,
            payment_methods_summary: paymentMethodsSummary,
            items_sold_list: itemsSoldList,
            new_clients_list: cycleNewClients,
            expenses_snapshot: cycleExpenses,
            transactions_snapshot: cycleTransactions
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
        
        await supabase.from('register_state').update({
            is_open: false,
            opening_balance: 0,
            opened_at: null,
            last_updated_by: currentUser?.name || 'Sistema'
        }).eq('id', 1);

        setIsRegisterClosed(true);
        setRegisterOpenedAt(null);
        addLog('Cierre de Caja', { totalSales: cycleTotalSales, salesCount: cycleSalesCount, reportId: savedReport.id }, isAuto ? 'Automático' : 'Manual');
        setTransactions([]);
        setExpenses([]); 
        setIsClosingCashModalOpen(false);
        if (isAuto) setIsAutoCloseAlertOpen(true);
        
        showNotification('success', 'Reporte Generado', 'Se ha guardado el reporte del día en la nube.');

    } catch (e) {
        console.error("Error guardando cierre:", e);
        showNotification('error', 'Error al Cerrar', 'No se pudo guardar el reporte en la nube.');
        setIsRegisterClosed(true);
        setIsClosingCashModalOpen(false);
    }
  };

  const handleConfirmCloseCash = () => executeRegisterClose(false);

  const handleSaveOpeningBalance = async () => {
    const value = Number(tempOpeningBalance);
    if (!isNaN(value) && value >= 0 && tempClosingTime) {
      
      const now = new Date().toISOString();
      setOpeningBalance(value);
      setClosingTime(tempClosingTime);
      setIsRegisterClosed(false);
      setIsOpeningBalanceModalOpen(false);
      setRegisterOpenedAt(now);

      try {
          await supabase.from('register_state').update({
              is_open: true,
              opening_balance: value,
              closing_time: tempClosingTime,
              opened_at: now,
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
    
    try {
        await supabase.from('register_state').update({ closing_time: closingTime }).eq('id', 1);
        showNotification('success', 'Horario Guardado', 'La hora de cierre se ha actualizado.');
    } catch(e) {
        console.error(e);
    }
  };

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

  // ✅ NUEVO FIX: Handler para editar el nombre de la categoría masivamente
  const handleEditCategory = async (oldName, newName) => {
    try {
      const { error: catError } = await supabase
        .from('categories')
        .update({ name: newName })
        .eq('name', oldName);
      if (catError) throw catError;

      const productsToUpdate = inventory.filter(p => p.categories.includes(oldName));
      
      const promises = productsToUpdate.map(p => {
        const newCats = p.categories.map(c => c === oldName ? newName : c);
        return supabase.from('products').update({ category: newCats.join(', ') }).eq('id', p.id);
      });
      await Promise.all(promises);

      setCategories(categories.map(c => c === oldName ? newName : c));
      setInventory(inventory.map(p => {
        if (p.categories.includes(oldName)) {
          const updatedCats = p.categories.map(c => c === oldName ? newName : c);
          return { ...p, category: updatedCats.join(', '), categories: updatedCats };
        }
        return p;
      }));
      
      addLog('Editar Categoría', { old: oldName, new: newName });
      showNotification('success', 'Categoría Actualizada', 'Nombre y productos actualizados.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo renombrar la categoría.');
    }
  };

  // ✅ NUEVO FIX: Handler para mover productos en masa desde el Gestor
  const handleBatchUpdateProductCategory = async (changes) => {
    try {
      const promises = changes.map(async (change) => {
        const { productId, categoryName, action } = change;
        const product = inventory.find(p => p.id === productId);
        if (!product) return null;

        let newCats = [...(product.categories || [])];
        if (action === 'add' && !newCats.includes(categoryName)) newCats.push(categoryName);
        if (action === 'remove') newCats = newCats.filter(c => c !== categoryName);
        
        const newCategoryString = newCats.join(', ');

        const { error } = await supabase.from('products').update({ category: newCategoryString }).eq('id', productId);
        if (error) throw error;
        return { productId, newCats, newCategoryString };
      });

      const results = (await Promise.all(promises)).filter(Boolean);

      setInventory(prevInventory => prevInventory.map(p => {
        const update = results.find(r => r.productId === p.id);
        if (update) {
          return { 
            ...p, 
            category: update.newCategoryString, 
            categories: update.newCats
          };
        }
        return p;
      }));

      addLog('Actualización Masiva', { count: changes.length, category: changes[0]?.categoryName }, 'Gestor de Categorías');
      showNotification('success', 'Productos Actualizados', `${changes.length} productos modificados.`);

    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'Falló la actualización masiva.');
    }
  };


  // --- MODIFICADO: Add Item ahora maneja Múltiples Categorías (join por comas) ---
const handleAddItem = async (e, overrideData = null) => {
  e.preventDefault();
  const itemData = overrideData || newItem;
  
  if (itemData.categories.length === 0) {
    showNotification('warning', 'Faltan datos', 'Por favor selecciona al menos una categoría.');
    return;
  }
  
  try {
    const payload = {
      title: itemData.title,
      brand: itemData.brand,
      price: Number(itemData.price) || 0,
      purchasePrice: Number(itemData.purchasePrice) || 0,
      stock: Number(itemData.stock) || 0,
      // FIX MULTI-CATEGORÍA: Guardamos el array como string separado por comas
      category: itemData.categories.join(', '), 
      barcode: itemData.barcode || null,
      image: itemData.image || '',
      product_type: itemData.product_type || 'quantity'
    };
    
    const { data, error } = await supabase.from('products').insert([payload]).select().single();
    if (error) throw error;
    
    const itemFormatted = { 
        ...data, 
        categories: data.category ? data.category.split(',').map(c => c.trim()).filter(Boolean) : [] 
    };
    setInventory([...inventory, itemFormatted]);
    
    const logDetails = {
      id: data.id, title: data.title, price: data.price,
      stock: data.stock, category: data.category,
      product_type: data.product_type,
      hasImage: !!data.image
    };
    addLog('Alta de Producto', logDetails, 'Producto Nuevo');
    
    setNewItem({
      title: '', brand: '', price: '', purchasePrice: '', stock: '',
      categories: [], image: '', barcode: '',
      product_type: 'quantity'  
    });
    setIsModalOpen(false);
    setPendingBarcodeForNewProduct('');
    showNotification('success', 'Producto Agregado', 'Guardado en la nube.');
  } catch (err) {
    console.error('Error agregando producto:', err);
    showNotification('error', 'Error', 'No se pudo guardar el producto.');
  }
};



// --- MODIFICADO: Edit Product ahora maneja Múltiples Categorías ---
const saveEditProduct = async (e, overrideData = null) => {
  e.preventDefault();
  const productData = overrideData || editingProduct;
  if (!productData) return;
  
  try {
    const originalProduct = inventory.find(p => p.id === productData.id);
    if (originalProduct && originalProduct.image !== productData.image) {
      await deleteProductImage(originalProduct.image).catch(() => {});
    }

    const payload = {
      title: productData.title,
      price: Number(productData.price),
      purchasePrice: Number(productData.purchasePrice) || 0,
      stock: Number(productData.stock),
      // FIX MULTI-CATEGORÍA
      category: Array.isArray(productData.categories) ? productData.categories.join(', ') : productData.category,
      barcode: productData.barcode || null,
      image: productData.image || '',
      product_type: productData.product_type || 'quantity' 
    };

    const { error } = await supabase.from('products').update(payload).eq('id', productData.id);
    if (error) throw error;
    setInventory(inventory.map(p => p.id === productData.id ? { ...productData } : p));
    addLog('Edición Producto', {
      id: productData.id, product: productData.title,
      price: productData.price, stock: productData.stock,
      category: productData.categories?.[0] || '',
      product_type: productData.product_type,
      imageChanged: originalProduct?.image !== productData.image ? 'Sí' : 'No'
    }, editReason);
    
    setEditingProduct(null);
    setEditReason('');
    showNotification('success', 'Producto Editado', 'Cambios guardados en la nube.');
  } catch (err) {
    console.error('Error editando producto:', err);
    showNotification('error', 'Error', 'Fallo al guardar los cambios.');
  }
};

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
      const { error } = await supabase
        .from('products')
        .update({ is_active: false })
        .eq('id', productToDelete.id);
      if (error) throw error;

      if (productToDelete.image) {
        await deleteProductImage(productToDelete.image).catch(() => {});
      }

      setInventory(inventory.filter((x) => x.id !== productToDelete.id));
      addLog('Baja Producto', { id: productToDelete.id, title: productToDelete.title }, deleteProductReason || 'Sin motivo');
      setIsDeleteProductModalOpen(false);
      setProductToDelete(null);
      showNotification('success', 'Producto Eliminado', 'Se quitó del inventario.');
    } catch (err) {
      console.error('Error eliminando producto:', err);
      showNotification('error', 'Error al Eliminar', `No se pudo borrar: ${err.message}`);
    }
  }
};

const handleDuplicateProduct = async (originalProduct) => {
  try {
    // Construir payload del duplicado
    const payload = {
      title: `${originalProduct.title} (copia)`,
      brand: originalProduct.brand || '',
      price: Number(originalProduct.price) || 0,
      purchasePrice: Number(originalProduct.purchasePrice) || 0,
      stock: Number(originalProduct.stock) || 0,
      category: Array.isArray(originalProduct.categories) 
        ? originalProduct.categories.join(', ') 
        : originalProduct.category || '',
      barcode: null,       // Sin código de barras
      image: '',           // Sin imagen
      product_type: originalProduct.product_type || 'quantity'
    };

    const { data, error } = await supabase.from('products').insert([payload]).select().single();
    if (error) throw error;

    const newProduct = {
      ...data,
      categories: data.category ? data.category.split(',').map(c => c.trim()).filter(Boolean) : [],
      purchasePrice: data.purchasePrice || 0
    };

    // Agregar al inventario local
    setInventory(prev => [...prev, newProduct]);

    // Log
    addLog('Producto Duplicado', {
      originalId: originalProduct.id,
      originalTitle: originalProduct.title,
      newId: data.id,
      newTitle: data.title
    }, 'Duplicado desde editor');

    // Cerrar modal actual y abrir con el producto nuevo
    setEditingProduct(newProduct);
    setEditReason('');

    showNotification('success', 'Producto Duplicado', `Se creó "${data.title}" como copia.`);
  } catch (err) {
    console.error('Error duplicando producto:', err);
    showNotification('error', 'Error al Duplicar', 'No se pudo crear la copia del producto.');
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

      const { data: sale, error: saleErr } = await supabase.from('sales').insert({
          total, payment_method: selectedPayment, installments, client_id: clientId,
          points_earned: clientId ? pointsEarned : 0, points_spent: pointsSpent,
          user_name: currentUser.name 
       }).select().single();
       if (saleErr) throw saleErr;

      const itemsPayload = cart.map(i => ({
          sale_id: sale.id, product_id: i.id, product_title: i.title, quantity: i.quantity, price: i.price, is_reward: !!i.isReward
       }));
       await supabase.from('sale_items').insert(itemsPayload);

      for (const item of cart) {
          if (!item.isReward) {
             const prod = inventory.find(p => p.id === item.id);
             if (prod) await supabase.from('products').update({ stock: prod.stock - item.quantity }).eq('id', item.id);
          }
      }

      if (clientId) {
          const newPoints = posSelectedClient.points - pointsSpent + pointsEarned;
          await supabase.from('clients').update({ points: newPoints }).eq('id', clientId);
          setMembers(members.map(m => m.id === clientId ? { ...m, points: newPoints } : m));
      }

      setInventory(inventory.map(p => {
        const c = cart.find(x => x.id === p.id && !x.isReward);
        return c ? { ...p, stock: p.stock - c.quantity } : p;
      }));

      const tx = {
        id: sale.id,
        date: formatDateAR(new Date()),
        time: formatTimeFullAR(new Date()),
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

      const logItems = cart.map(item => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        isReward: item.isReward || false
      }));

      addLog('Venta Realizada', { transactionId: tx.id, total: total, items: logItems }, 'Venta regular');

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
    
    setTransactions(
      transactions.map((t) => (t.id === editingTransaction.id ? editingTransaction : t))
    );
    addLog('Modificación Pedido', { transactionId: editingTransaction.id }, editReason);
    setEditingTransaction(null);
    setEditReason('');
    showNotification('success', 'Pedido Actualizado', 'La transacción fue modificada con éxito.');
  };

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
      addLog('Nuevo Premio', { title: newReward.title, description: newReward.description, pointsCost: newReward.pointsCost, type: newReward.type, stock: newReward.stock }, 'Gestión Catálogo');
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
      addLog('Editar Premio', { title: updatedData.title, pointsCost: updatedData.pointsCost, type: updatedData.type, stock: updatedData.stock });
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

      const deletedReward = rewards.find(r => r.id === id);
      setRewards(rewards.filter(r => r.id !== id));
      addLog('Eliminar Premio', { id, title: deletedReward?.title || 'Premio eliminado' });
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
            {{ pos: 'Punto de Venta', dashboard: 'Control de Caja', inventory: 'Inventario', clients: 'Socios', history: 'Historial de Ventas', rewards: 'Premios', reports: 'Reportes de Caja', logs: 'Registro de Acciones', categories: 'Categorías' }[activeTab] || activeTab}          </h2>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span>Supabase ON</span>
                <span className="text-slate-300">|</span>
                <span>{formatDateAR(currentTime)} {formatTimeAR(currentTime)}hrs</span>              </div>
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
          {activeTab === 'logs' && currentUser.role === 'admin' && (<LogsView dailyLogs={dailyLogs} />)}
          
          {/* ✅ FIX: Añadidas las funciones de guardado al componente hijo */}
          {activeTab === 'categories' && currentUser.role === 'admin' && (
            <CategoryManagerView 
              categories={categories} 
              inventory={inventory} 
              onAddCategory={handleAddCategoryFromView} 
              onDeleteCategory={handleDeleteCategoryFromView} 
              onEditCategory={handleEditCategory}
              onBatchUpdateProductCategory={handleBatchUpdateProductCategory}
            />
          )}
        </main>
      </div>

      {/* --- MODALES --- */}
      <div className="hidden"><TicketPrintLayout transaction={ticketToView || saleSuccessModal} /></div>
      <NotificationModal isOpen={notification.isOpen} onClose={closeNotification} type={notification.type} title={notification.title} message={notification.message} />
      <OpeningBalanceModal isOpen={isOpeningBalanceModalOpen} onClose={() => setIsOpeningBalanceModalOpen(false)} tempOpeningBalance={tempOpeningBalance} setTempOpeningBalance={setTempOpeningBalance} tempClosingTime={tempClosingTime} setTempClosingTime={setTempClosingTime} onSave={handleSaveOpeningBalance} />
      <ClosingTimeModal isOpen={isClosingTimeModalOpen} onClose={() => setIsClosingTimeModalOpen(false)} closingTime={closingTime} setClosingTime={setClosingTime} onSave={handleSaveClosingTime} />
      <AddProductModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setPendingBarcodeForNewProduct(''); }} newItem={newItem} setNewItem={setNewItem} categories={categories} onImageUpload={handleImageUpload} onAdd={handleAddItem} inventory={inventory} onDuplicateBarcode={handleDuplicateBarcodeDetected} isUploadingImage={isUploadingImage} />
      <EditProductModal product={editingProduct} onClose={() => setEditingProduct(null)} setEditingProduct={setEditingProduct} categories={categories} onImageUpload={handleImageUpload} editReason={editReason} setEditReason={setEditReason} onSave={saveEditProduct} inventory={inventory} onDuplicateBarcode={handleDuplicateBarcodeDetected} isUploadingImage={isUploadingImage} onDuplicate={handleDuplicateProduct} currentUser={currentUser} />
      <EditTransactionModal transaction={editingTransaction} onClose={() => setEditingTransaction(null)} inventory={inventory} setEditingTransaction={setEditingTransaction} transactionSearch={transactionSearch} setTransactionSearch={setTransactionSearch} addTxItem={addTxItem} removeTxItem={removeTxItem} setTxItemQty={setTxItemQty} handlePaymentChange={handleEditTxPaymentChange} editReason={editReason} setEditReason={setEditReason} onSave={handleSaveEditedTransaction} />
      <ImageModal isOpen={isImageModalOpen} image={selectedImage} onClose={() => setIsImageModalOpen(false)} />
      <RefundModal transaction={transactionToRefund} onClose={() => setIsRefundModalOpen(false)} refundReason={refundReason} setRefundReason={setRefundReason} onConfirm={handleConfirmRefund} />
      <CloseCashModal isOpen={isClosingCashModalOpen} onClose={() => setIsClosingCashModalOpen(false)} salesCount={cycleSalesCount} totalSales={cycleTotalSales} totalExpenses={cycleTotalExpenses} cashExpenses={cycleCashExpenses} cashSales={cycleCashSales} openingBalance={openingBalance} onConfirm={handleConfirmCloseCash} />
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