import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  PartyPopper,
  Lock,
  Clock,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import Swal from 'sweetalert2';

// --- CONEXIÓN A LA NUBE ---
import { supabase } from './supabase/client';
import { uploadProductImage, deleteProductImage } from './utils/storage';
import { formatDateAR, formatTimeAR, formatTimeFullAR, isTestRecord } from './utils/helpers';
import {
  mapBudgetRecords,
  mapCashClosureRecord,
  mapCashClosureRecords,
  mapCategoryRecords,
  mapExpenseRecords,
  mapInventoryRecords,
  mapLogRecords,
  mapMemberRecords,
  mapOfferRecords,
  mapOrderRecords,
  mapRegisterState,
  mapRewardRecords,
  mapSaleRecords,
  safeCloudData,
} from './utils/cloudMappers';
import { buildBudgetExportConfig, buildExportItemsFromSnapshot, deriveOrderStatus } from './utils/budgetHelpers';

import { USERS } from './data';
import Sidebar from './components/Sidebar';

// Vistas
import DashboardView from './views/DashboardView';
import InventoryView from './views/InventoryView';
import POSView from './views/POSView';
import ClientsView from './views/ClientsView';
import HistoryView from './views/HistoryView';
import LogsView from './views/LogsView';
import ExtrasView from './views/ExtrasView';
import ReportsHistoryView from './views/ReportsHistoryView';
import BulkEditorView from './views/BulkEditorView';
import OrdersView from './views/OrdersView';

// Modales y Componentes de Impresión
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
} from './components/AppModals';

import { ExpenseModal } from './components/modals/ExpenseModal';
import { RedemptionModal } from './components/modals/RedemptionModal';
import { TicketPrintLayout } from './components/TicketPrintLayout';
import { ClientSelectionModal } from './components/modals/ClientSelectionModal';
import { TransactionDetailModal } from './components/modals/HistoryModals'; 
import { ExportPdfLayout } from './components/ExportPdfLayout';

// Código de barras
import { useBarcodeScanner } from './hooks/useBarcodeScanner';

function PersistentTabPanel({ tab, activeTab, className = '', children }) {
  const cachedChildrenRef = useRef(children);

  if (activeTab === tab) {
    cachedChildrenRef.current = children;
  }

  return (
    <div className={`${activeTab === tab ? 'block' : 'hidden'} ${className}`.trim()}>
      {cachedChildrenRef.current}
    </div>
  );
}

const extractSchemaMissingColumn = (error) => {
  const errorText = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column ["`]?([a-z0-9_]+)["`]? does not exist/i,
    /record ["`]?[^"'`]+["`]? has no field ["`]?([a-z0-9_]+)["`]?/i,
  ];

  for (const pattern of patterns) {
    const match = errorText.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
};

const getCloudErrorMessage = (error, fallback = 'Error de sincronizacion con la nube.') => {
  const errorText = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');

  if (/Could not find the table 'public\.budgets' in the schema cache/i.test(errorText)) {
    return 'Falta crear la tabla budgets en Supabase. Ejecuta el schema de pedidos y presupuestos.';
  }

  if (/Could not find the table 'public\.orders' in the schema cache/i.test(errorText)) {
    return 'Falta crear la tabla orders en Supabase. Ejecuta el schema de pedidos y presupuestos.';
  }

  return error?.message || error?.details || error?.hint || fallback;
};

const insertWithSchemaFallback = async (table, payload) => {
  let safePayload = { ...payload };

  while (true) {
    const { data, error } = await supabase.from(table).insert([safePayload]).select().single();
    if (!error) return { data, payload: safePayload };

    const missingColumn = extractSchemaMissingColumn(error);
    if (!missingColumn || !(missingColumn in safePayload)) {
      throw error;
    }

    const nextPayload = { ...safePayload };
    delete nextPayload[missingColumn];
    safePayload = nextPayload;
  }
};

const updateWithSchemaFallback = async (table, id, payload) => {
  let safePayload = { ...payload };

  while (true) {
    const { data, error } = await supabase.from(table).update(safePayload).eq('id', id).select().single();
    if (!error) return { data, payload: safePayload };

    const missingColumn = extractSchemaMissingColumn(error);
    if (!missingColumn || !(missingColumn in safePayload)) {
      throw error;
    }

    const nextPayload = { ...safePayload };
    delete nextPayload[missingColumn];
    safePayload = nextPayload;
  }
};

export default function PartySupplyApp() {
  
  const [isCloudLoading, setIsCloudLoading] = useState(true);

  // ==========================================
  // 1. ESTADOS DE DATOS
  // ==========================================
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dailyLogs, setDailyLogs] = useState([]);
  const [members, setMembers] = useState([]);
  const [pastClosures, setPastClosures] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [orders, setOrders] = useState([]);
  const [offers, setOffers] = useState([]); // ✨ NUEVO ESTADO: Ofertas

  const [openingBalance, setOpeningBalance] = useState(0);
  const [isRegisterClosed, setIsRegisterClosed] = useState(true); 
  const [closingTime, setClosingTime] = useState('21:00');
  const [registerOpenedAt, setRegisterOpenedAt] = useState(null);

  const isAutoClosing = useRef(false);

  const syncRegisterState = (registerState) => {
    const mappedRegisterState = mapRegisterState(registerState);
    if (!mappedRegisterState) return;

    setIsRegisterClosed(mappedRegisterState.isRegisterClosed);
    setOpeningBalance(mappedRegisterState.openingBalance);
    setClosingTime(mappedRegisterState.closingTime);
    setRegisterOpenedAt(mappedRegisterState.registerOpenedAt);
  };

  // ==========================================
  // 1.5 CONEXIÓN SUPABASE
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
        registerResult,
        budgetsResult,
        ordersResult,
        offersResult // ✨ NUEVA QUERY
      ] = await Promise.allSettled([
        supabase.from('products').select('*').eq('is_active', true).order('title').limit(10000),
        supabase.from('clients').select('*').eq('is_active', true).order('name').limit(10000),
        supabase.from('sales').select(`*, sale_items(*), clients(name, member_number)`).order('created_at', { ascending: false }).limit(10000),        
        supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(10000),
        supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(10000),
        supabase.from('cash_closures').select('*').order('created_at', { ascending: false }).limit(10000),
        supabase.from('categories').select('*').order('name').limit(5000),
        supabase.from('rewards').select('*').order('points_cost', { ascending: true }).limit(5000),
        supabase.from('register_state').select('*').eq('id', 1).maybeSingle(),
        supabase.from('budgets').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(10000),
        supabase.from('orders').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(10000),
        supabase.from('offers').select('*').eq('is_active', true).order('created_at', { ascending: false }) // ✨ Cargar Ofertas
      ]);

      const prodData = safeCloudData(prodResult, 'productos');
      if (prodData) setInventory(mapInventoryRecords(prodData));

      const clientData = safeCloudData(clientResult, 'clientes');
      if (clientData) setMembers(mapMemberRecords(clientData));

      const logsData = safeCloudData(logsResult, 'logs');
      let parsedLogs = [];
      if (logsData) {
        parsedLogs = mapLogRecords(logsData);
        setDailyLogs(parsedLogs);
      }

      const salesData = safeCloudData(salesResult, 'ventas');
      if (salesData) setTransactions(mapSaleRecords(salesData, parsedLogs));

      const expData = safeCloudData(expResult, 'gastos');
      if (expData) setExpenses(mapExpenseRecords(expData));

      const closureData = safeCloudData(closureResult, 'reportes');
      if (closureData) setPastClosures(mapCashClosureRecords(closureData));

      const catData = safeCloudData(catResult, 'categorias');
      if (catData) setCategories(mapCategoryRecords(catData));

      const rewardsData = safeCloudData(rewardsResult, 'premios');
      if (rewardsData) setRewards(mapRewardRecords(rewardsData));
      const budgetsData = safeCloudData(budgetsResult, 'presupuestos');
      if (budgetsData) setBudgets(mapBudgetRecords(budgetsData));
      const ordersData = safeCloudData(ordersResult, 'pedidos');
      if (ordersData) setOrders(mapOrderRecords(ordersData));

      // ✨ Procesar Ofertas
      const offersData = safeCloudData(offersResult, 'ofertas');
      if (offersData) setOffers(mapOfferRecords(offersData));

      let registerState = null;
      if (registerResult.status === 'fulfilled' && !registerResult.value.error) {
        registerState = registerResult.value.data;
      }

      if (!registerState) {
        const { data: newState, error: upsertErr } = await supabase
          .from('register_state')
          .upsert([{ id: 1, is_open: false, opening_balance: 0, closing_time: '21:00' }], { onConflict: 'id' })
          .select()
          .maybeSingle();
        
        if (!upsertErr && newState) registerState = newState;
      }

      syncRegisterState(registerState);

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
          syncRegisterState(newState);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cash_closures' },
        (payload) => {
          const c = payload.new;
          if (c) {
             const newReport = mapCashClosureRecord(c);
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
      if (elapsed < MIN_RESYNC_INTERVAL) return;

      lastFetchTime = Date.now();
      fetchCloudData(false); 
    };

    window.addEventListener('visibilitychange', handleReSync);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('visibilitychange', handleReSync);
    };
  }, []);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('pos');

  useEffect(() => {
    if (activeTab === 'rewards') {
      setActiveTab('extras');
    }
  }, [activeTab]);
  const [cart, setCart] = useState([]);

  const [loginStep, setLoginStep] = useState('select');
  const [selectedRoleForLogin, setSelectedRoleForLogin] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOpeningBalanceModalOpen, setIsOpeningBalanceModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isClosingTimeModalOpen, setIsClosingTimeModalOpen] = useState(false);
  const [isClosingCashModalOpen, setIsClosingCashModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  const [saleSuccessModal, setSaleSuccessModal] = useState(null);
  const [isAutoCloseAlertOpen, setIsAutoCloseAlertOpen] = useState(false);
  
  const [ticketToView, setTicketToView] = useState(null);
  const [exportPdfData, setExportPdfData] = useState(null);

  // ✨ ESTADOS PARA PERSISTENCIA DE PRESUPUESTO EN BULK EDITOR
  const [bulkExportItems, setBulkExportItems] = useState([]);
  const [bulkExportConfig, setBulkExportConfig] = useState({
    isForClient: true,
    documentTitle: '', 
    clientName: '',
    clientPhone: '',
    clientEvent: '',
    columns: { cost: false, price: true, newPrice: false, stock: false },
    clientColumns: { showQty: true, showUnitPrice: true, showSubtotal: false, showTotal: true }
  });

  const [productToDelete, setProductToDelete] = useState(null);
  const [deleteProductReason, setDeleteProductReason] = useState('');

  const [editingProduct, setEditingProduct] = useState(null);
  const [editReason, setEditReason] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [editingTransaction, setEditingTransaction] = useState(null);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [transactionToRefund, setTransactionToRefund] = useState(null);
  const [refundReason, setRefundReason] = useState('');

  const [barcodeNotFoundModal, setBarcodeNotFoundModal] = useState({ isOpen: false, code: '' });
  const [barcodeDuplicateModal, setBarcodeDuplicateModal] = useState({ isOpen: false, existingProduct: null, newBarcode: '' });
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [posSelectedClient, setPosSelectedClient] = useState(null);
  const [isRedemptionModalOpen, setIsRedemptionModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  const [detailsModalTx, setDetailsModalTx] = useState(null);

  const [newItem, setNewItem] = useState({
    title: '', brand: '', price: '', purchasePrice: '', stock: '',
    categories: [], image: '', barcode: '',
    product_type: 'quantity',
    expiration_date: '' 
  });

  const [tempOpeningBalance, setTempOpeningBalance] = useState('');
  const [tempClosingTime, setTempClosingTime] = useState('21:00');

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

  const [notification, setNotification] = useState({ isOpen: false, type: 'info', title: '', message: '' });

  const showNotification = (type, title, message) => {
    setNotification({ isOpen: true, type, title, message });
  };

  const closeNotification = () => {
    setNotification(prev => ({ ...prev, isOpen: false }));
  };

  const isTestActive = useMemo(() => {
    return isTestRecord(cart) || 
           isTestRecord(posSelectedClient) || 
           isTestRecord(posSearch) ||
           isTestRecord(newItem) ||
           isTestRecord(editingProduct) ||
           isTestRecord(editingTransaction) ||
           isTestRecord(transactionSearch);
  }, [cart, posSelectedClient, posSearch, newItem, editingProduct, editingTransaction, transactionSearch]);

  const addLog = async (action, details, defaultReason = '') => {
    const now = new Date();
    
    let finalReason = defaultReason;
    if (details && typeof details === 'object') {
        const userNote = details.description || details.note || details.extraInfo;
        if (userNote && userNote.trim() !== '' && userNote !== details.category) {
            finalReason = userNote.trim();
        }
    }

    const newLog = {
      id: Date.now(),
      timestamp: formatTimeFullAR(now),
      date: formatDateAR(now),
      action,
      user: currentUser?.name || 'Sistema',
      details,
      reason: finalReason, 
      created_at: new Date().toISOString()
    };
    
    newLog.isTest = isTestRecord({ action, details, reason: finalReason });
    setDailyLogs((prev) => [newLog, ...prev]);

    try {
      await supabase.from('logs').insert([{
         action,
         details,
         user: currentUser?.name || 'Sistema',
         reason: finalReason, 
         created_at: new Date().toISOString()
      }]);
    } catch (e) {
      console.error("Error guardando log en nube", e);
    }
  };

  const handleUpdateLogNote = async (logId, newNote) => {
    try {
      const { error } = await supabase.from('logs').update({ reason: newNote }).eq('id', logId);
      if (error) throw error;
      
      setDailyLogs(prev => prev.map(log => {
        if (log.id === logId) {
            const updatedLog = { ...log, reason: newNote };
            updatedLog.isTest = isTestRecord({ action: updatedLog.action, details: updatedLog.details, reason: updatedLog.reason });
            return updatedLog;
        }
        return log;
      }));
      
      showNotification('success', 'Nota Actualizada', 'La nota ha sido guardada correctamente.');
    } catch (err) {
      console.error("Error actualizando nota del log:", err);
      showNotification('error', 'Error', 'No se pudo actualizar la nota en la nube.');
    }
  };

  const handleExportProducts = (config, items) => {
    const dateStr = formatDateAR(new Date());
    const dataToExport = { config, items, date: dateStr };
    
    setExportPdfData(dataToExport);

    const logDetails = {
      type: config.isForClient ? 'Presupuesto' : 'Reporte Interno',
      clientName: config.clientName || null,
      itemCount: items.length,
      snapshot: dataToExport
    };

    addLog('Exportación PDF', logDetails, 'Exportación de catálogo');

    const defaultTitle = config.documentTitle 
      ? `${config.documentTitle} - ${config.clientName || 'Cliente'}` 
      : 'Reporte Interno';

    const safeName = defaultTitle.replace(/[^a-zA-Z0-9 _-]/g, '');

    setTimeout(async () => {
      try {
        // Obtenemos Electron evadiendo bloqueos de Vite
        const electronReq = window.require || window['require'];
        
        if (electronReq) {
          const ipc = electronReq('electron').ipcRenderer;
          const result = await ipc.invoke('save-as-pdf', `${safeName}.pdf`);
          
          if (result.success) {
            showNotification('success', 'PDF Guardado', `Guardado en: ${result.filePath}`);
          } else if (!result.canceled) {
            Swal.fire('Error', 'No se pudo guardar el PDF: ' + result.error, 'error');
          }
        } else {
          // SI NO DETECTA ELECTRON, NO IMPRIME NADA PARA PROTEGER LA TICKETERA
          Swal.fire('Atención', 'No se detectó el motor de escritorio (Electron). Guardado de PDF deshabilitado en navegador web para proteger la ticketera térmica.', 'warning');
        }
      } catch (e) {
        console.error('Error IPC:', e);
        Swal.fire('Error de Comunicación', 'Falló la conexión con Windows: ' + e.message, 'error');
      }
      
      setTimeout(() => setExportPdfData(null), 500);
    }, 500);
  };
  
  const handleReprintPdf = (logDetails) => {
    if (!logDetails || !logDetails.snapshot) {
      showNotification('error', 'Error', 'No hay datos guardados para recrear este PDF.');
      return;
    }
    
    setExportPdfData(logDetails.snapshot);
    const config = logDetails.snapshot.config || {};
    const defaultTitle = config.documentTitle 
      ? `${config.documentTitle} - ${config.clientName || 'Cliente'} (Copia)` 
      : 'Reporte_Historico';
    const safeName = defaultTitle.replace(/[^a-zA-Z0-9 _-]/g, '');

    setTimeout(async () => {
      try {
        const electronReq = window.require || window['require'];
        
        if (electronReq) {
          const ipc = electronReq('electron').ipcRenderer;
          const result = await ipc.invoke('save-as-pdf', `${safeName}.pdf`);
          
          if (result.success) {
            showNotification('success', 'PDF Guardado', `Guardado en: ${result.filePath}`);
          } else if (!result.canceled) {
            Swal.fire('Error', 'No se pudo guardar el PDF: ' + result.error, 'error');
          }
        } else {
          Swal.fire('Atención', 'No se detectó el motor de escritorio (Electron). Guardado de PDF deshabilitado en navegador web para proteger la ticketera térmica.', 'warning');
        }
      } catch (e) {
        console.error('Error IPC:', e);
        Swal.fire('Error de Comunicación', 'Falló la conexión con Windows: ' + e.message, 'error');
      }
      
      setTimeout(() => setExportPdfData(null), 500);
    }, 500);
  };
  

    // ✨ NUEVO: HANDLER PARA FIJAR PRODUCTO PERSONALIZADO DESDE EL PRESUPUESTO
  const handleCreateFixedProduct = async (title, price) => {
    try {
      const payload = {
        title: title,
        brand: '',
        price: Number(price) || 0,
        purchasePrice: 0,
        stock: 0,
        category: 'Depósito', 
        barcode: null,
        image: '',
        product_type: 'quantity',
        expiration_date: null
      };
      
      const { data, error } = await supabase.from('products').insert([payload]).select().single();
      if (error) throw error;
      
      const itemFormatted = { 
          ...data, 
          categories: ['Depósito'] 
      };
      setInventory(prev => [...prev, itemFormatted]);
      
      addLog('Alta de Producto', { id: data.id, title: data.title, price: data.price, category: data.category }, 'Fijado desde Presupuesto');
      showNotification('success', 'Producto Fijado', `Se guardó en Depósito con stock 0.`);
      
      return itemFormatted;
    } catch (err) {
      console.error('Error fijando producto:', err);
      showNotification('error', 'Error', 'No se pudo fijar el producto.');
      return null;
    }
  };

  const handleCreateBudget = async (budgetData) => {
    try {
      const payload = {
        member_id: budgetData.memberId || null,
        customer_name: budgetData.customerName || '',
        customer_phone: budgetData.customerPhone || '',
        customer_note: budgetData.customerNote || '',
        document_title: budgetData.documentTitle || 'PRESUPUESTO',
        event_label: budgetData.eventLabel || '',
        items_snapshot: budgetData.itemsSnapshot || [],
        total_amount: Number(budgetData.totalAmount || 0),
        is_active: true,
      };

      const { data } = await insertWithSchemaFallback('budgets', payload);

      const newBudget = mapBudgetRecords([data])[0];
      setBudgets((prev) => [newBudget, ...prev]);
      addLog(
        'Presupuesto Creado',
        {
          id: newBudget.id,
          customerName: newBudget.customerName,
          memberId: newBudget.memberId,
          totalAmount: newBudget.totalAmount,
          itemCount: newBudget.itemsSnapshot.length,
        },
        newBudget.eventLabel || 'Gestión de pedidos'
      );
      showNotification('success', 'Presupuesto Creado', 'Se guardó correctamente en Pedidos.');
      return newBudget;
    } catch (error) {
      console.error('Error creando presupuesto:', error);
      showNotification('error', 'Error', `No se pudo guardar el presupuesto. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleUpdateBudget = async (id, budgetData) => {
    try {
      const payload = {
        member_id: budgetData.memberId || null,
        customer_name: budgetData.customerName || '',
        customer_phone: budgetData.customerPhone || '',
        customer_note: budgetData.customerNote || '',
        document_title: budgetData.documentTitle || 'PRESUPUESTO',
        event_label: budgetData.eventLabel || '',
        items_snapshot: budgetData.itemsSnapshot || [],
        total_amount: Number(budgetData.totalAmount || 0),
      };

      const { data } = await updateWithSchemaFallback('budgets', id, payload);

      setBudgets((prev) =>
        prev.map((budget) => (budget.id === id ? mapBudgetRecords([data])[0] : budget))
      );

      addLog(
        'Presupuesto Editado',
        {
          id,
          customerName: budgetData.customerName,
          totalAmount: Number(budgetData.totalAmount || 0),
          itemCount: (budgetData.itemsSnapshot || []).length,
        },
        budgetData.eventLabel || 'Gestión de pedidos'
      );
      showNotification('success', 'Presupuesto Actualizado', 'Los cambios se guardaron.');
    } catch (error) {
      console.error('Error actualizando presupuesto:', error);
      showNotification('error', 'Error', `No se pudo actualizar el presupuesto. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleDeleteBudget = async (budgetRecord) => {
    try {
      const { data } = await updateWithSchemaFallback('budgets', budgetRecord.id, {
        is_active: false,
      });

      const deletedBudget = mapBudgetRecords([data])[0];
      setBudgets((prev) => prev.filter((budget) => budget.id !== budgetRecord.id));

      addLog(
        'Presupuesto Eliminado',
        {
          id: budgetRecord.id,
          customerName: deletedBudget?.customerName || budgetRecord.customerName,
          memberId: deletedBudget?.memberId ?? budgetRecord.memberId ?? null,
          totalAmount: Number(deletedBudget?.totalAmount ?? budgetRecord.totalAmount ?? 0),
          itemCount: (deletedBudget?.itemsSnapshot || budgetRecord.itemsSnapshot || []).length,
        },
        deletedBudget?.eventLabel || budgetRecord.eventLabel || 'Gestión de pedidos'
      );
      showNotification('success', 'Presupuesto Eliminado', 'El presupuesto fue eliminado de Pedidos.');
    } catch (error) {
      console.error('Error eliminando presupuesto:', error);
      showNotification('error', 'Error', `No se pudo eliminar el presupuesto. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleConvertBudgetToOrder = async (budgetRecord, { pickupDate, depositAmount }) => {
    try {
      const existingLinkedOrder = orders.find(
        (order) => String(order.budgetId) === String(budgetRecord.id) && order.isActive !== false
      );
      if (existingLinkedOrder) {
        showNotification('warning', 'Pedido Existente', 'Ese presupuesto ya tiene un pedido vinculado.');
        return existingLinkedOrder;
      }

      const totalAmount = Number(budgetRecord.totalAmount || 0);
      const initialPayment = Math.min(Math.max(Number(depositAmount || 0), 0), totalAmount);
      const remainingAmount = Math.max(totalAmount - initialPayment, 0);
      const status = deriveOrderStatus({ paidTotal: initialPayment, totalAmount });

      const payload = {
        budget_id: budgetRecord.id,
        member_id: budgetRecord.memberId || null,
        customer_name: budgetRecord.customerName || '',
        customer_phone: budgetRecord.customerPhone || '',
        customer_note: budgetRecord.customerNote || '',
        document_title: budgetRecord.documentTitle || 'PEDIDO',
        event_label: budgetRecord.eventLabel || '',
        items_snapshot: budgetRecord.itemsSnapshot || [],
        total_amount: totalAmount,
        deposit_amount: initialPayment,
        paid_total: initialPayment,
        remaining_amount: remainingAmount,
        pickup_date: pickupDate,
        status,
        is_active: true,
      };

      const { data } = await insertWithSchemaFallback('orders', payload);

      const newOrder = mapOrderRecords([data])[0];
      setOrders((prev) => [newOrder, ...prev]);
      addLog(
        'Pedido Creado',
        {
          id: newOrder.id,
          budgetId: budgetRecord.id,
          customerName: newOrder.customerName,
          totalAmount: newOrder.totalAmount,
          depositAmount: newOrder.depositAmount,
          pickupDate: newOrder.pickupDate,
        },
        budgetRecord.eventLabel || 'Conversión desde presupuesto'
      );
      showNotification('success', 'Pedido Creado', 'El presupuesto se convirtió en pedido.');
      return newOrder;
    } catch (error) {
      console.error('Error convirtiendo presupuesto:', error);
      showNotification('error', 'Error', `No se pudo convertir el presupuesto en pedido. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleRegisterOrderPayment = async (orderRecord, paymentAmount) => {
    try {
      const nextPaidTotal = Math.min(
        Number(orderRecord.totalAmount || 0),
        Number(orderRecord.paidTotal || 0) + Number(paymentAmount || 0)
      );
      const nextRemaining = Math.max(Number(orderRecord.totalAmount || 0) - nextPaidTotal, 0);
      const status = deriveOrderStatus({
        paidTotal: nextPaidTotal,
        totalAmount: Number(orderRecord.totalAmount || 0),
        currentStatus: orderRecord.status,
      });

      const payload = {
        paid_total: nextPaidTotal,
        remaining_amount: nextRemaining,
        status,
      };

      const { data } = await updateWithSchemaFallback('orders', orderRecord.id, payload);

      setOrders((prev) =>
        prev.map((order) => (order.id === orderRecord.id ? mapOrderRecords([data])[0] : order))
      );

      addLog(
        'Pago Pedido',
        {
          id: orderRecord.id,
          customerName: orderRecord.customerName,
          amount: Number(paymentAmount || 0),
          paidTotal: nextPaidTotal,
          remainingAmount: nextRemaining,
        },
        'Cobro manual en Pedidos'
      );
      showNotification('success', 'Pago Registrado', 'El pedido fue actualizado.');
    } catch (error) {
      console.error('Error registrando pago de pedido:', error);
      showNotification('error', 'Error', `No se pudo registrar el pago. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleMarkOrderRetired = async (orderRecord) => {
    try {
      const { data } = await updateWithSchemaFallback('orders', orderRecord.id, { status: 'Retirado' });

      setOrders((prev) =>
        prev.map((order) => (order.id === orderRecord.id ? mapOrderRecords([data])[0] : order))
      );

      addLog(
        'Pedido Retirado',
        {
          id: orderRecord.id,
          customerName: orderRecord.customerName,
          totalAmount: orderRecord.totalAmount,
        },
        'Entrega finalizada'
      );
      showNotification('success', 'Pedido Retirado', 'El pedido quedó marcado como entregado.');
    } catch (error) {
      console.error('Error marcando pedido retirado:', error);
      showNotification('error', 'Error', `No se pudo marcar el pedido como retirado. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleCancelOrder = async (orderRecord, { keepDeposit }) => {
    try {
      const currentDeposit = Number(orderRecord.depositAmount || 0);
      const currentPaid = Number(orderRecord.paidTotal || 0);
      const retainedDeposit = keepDeposit ? Math.min(currentDeposit, currentPaid || currentDeposit) : 0;
      const refundedAmount = Math.max(currentPaid - retainedDeposit, 0);

      const { data } = await updateWithSchemaFallback('orders', orderRecord.id, {
        status: 'Cancelado',
        deposit_amount: retainedDeposit,
        paid_total: retainedDeposit,
        remaining_amount: 0,
      });

      setOrders((prev) =>
        prev.map((order) => (order.id === orderRecord.id ? mapOrderRecords([data])[0] : order))
      );

      addLog(
        'Pedido Cancelado',
        {
          id: orderRecord.id,
          customerName: orderRecord.customerName,
          keepDeposit: Boolean(keepDeposit),
          retainedDeposit,
          refundedAmount,
          totalAmount: Number(orderRecord.totalAmount || 0),
        },
        keepDeposit ? 'Se retuvo la seña' : 'Se devolvió la seña'
      );
      showNotification(
        'success',
        'Pedido Cancelado',
        keepDeposit ? 'El pedido fue cancelado y la seña quedó retenida.' : 'El pedido fue cancelado y la seña fue devuelta.'
      );
    } catch (error) {
      console.error('Error cancelando pedido:', error);
      showNotification('error', 'Error', `No se pudo cancelar el pedido. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handlePrintOrderRecord = (record) => {
    handleExportProducts(
      buildBudgetExportConfig(record),
      buildExportItemsFromSnapshot(record.itemsSnapshot || [])
    );
  };

  // ==========================================
  // ✨ HANDLERS DE OFERTAS
  // ==========================================
  const handleAddOffer = async (offerData) => {
    try {
      const payload = {
        name: offerData.name,
        type: offerData.type,
        apply_to: offerData.applyTo,
        products_included: offerData.productsIncluded || [],
        items_count: Number(offerData.itemsCount) || 0,
        discount_value: Number(offerData.discountValue) || 0,
        offer_price: Number(offerData.offerPrice) || 0,
        profit_margin: Number(offerData.profitMargin) || 0,
        created_by: currentUser?.name || 'Sistema'
      };

      const { data, error } = await supabase.from('offers').insert([payload]).select().single();
      if (error) throw error;

      const newOffer = {
        id: data.id,
        name: data.name,
        type: data.type,
        applyTo: data.apply_to,
        productsIncluded: data.products_included,
        itemsCount: data.items_count,
        discountValue: data.discount_value,
        offerPrice: data.offer_price,
        profitMargin: data.profit_margin,
        createdBy: data.created_by
      };

      setOffers([newOffer, ...offers]);
      
      addLog('Oferta Creada', {
        name: newOffer.name,
        type: newOffer.type,
        applyTo: newOffer.applyTo,
        productsIncluded: newOffer.productsIncluded.map(p => p.title),
        itemsCount: newOffer.itemsCount,
        discountValue: newOffer.discountValue,
        offerPrice: newOffer.offerPrice,
        profitMargin: newOffer.profitMargin
      });
      
      showNotification('success', 'Oferta Creada', 'La oferta se guardó en el catálogo.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo crear la oferta en la nube.');
    }
  };

  const handleUpdateOffer = async (id, updatedData) => {
    try {
      const oldOffer = offers.find(o => o.id === id);

      const payload = {
        name: updatedData.name,
        type: updatedData.type,
        apply_to: updatedData.applyTo,
        products_included: updatedData.productsIncluded || [],
        items_count: Number(updatedData.itemsCount) || 0,
        discount_value: Number(updatedData.discountValue) || 0,
        offer_price: Number(updatedData.offerPrice) || 0,
        profit_margin: Number(updatedData.profitMargin) || 0
      };

      const { error } = await supabase.from('offers').update(payload).eq('id', id);
      if (error) throw error;

      setOffers(offers.map(o => o.id === id ? { ...o, ...updatedData } : o));
      
      addLog('Oferta Editada', {
        id,
        name: updatedData.name,
        type: updatedData.type,
        applyTo: updatedData.applyTo,
        productsIncluded: updatedData.productsIncluded.map(p => p.title),
        itemsCount: updatedData.itemsCount,
        discountValue: updatedData.discountValue,
        offerPrice: updatedData.offerPrice,
        profitMargin: updatedData.profitMargin,
        // Comparativas para el Log
        changedCount: updatedData.productsIncluded.length !== oldOffer.productsIncluded.length,
        oldPrice: oldOffer.offerPrice,
        newPrice: updatedData.offerPrice
      });

      showNotification('success', 'Oferta Actualizada', 'Los cambios se guardaron.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo actualizar la oferta.');
    }
  };

  const handleDeleteOffer = async (id) => {
    try {
      const offerToDelete = offers.find(o => o.id === id);
      if (!offerToDelete) return;

      const { error } = await supabase.from('offers').update({ is_active: false }).eq('id', id);
      if (error) throw error;

      // 1. Quitar la oferta del estado de React
      setOffers(offers.filter(o => o.id !== id));

      // 2. Eliminar la oferta de los productos en el inventario (Para cuando el POS las busque por producto)
      // (Esta lógica se disparará localmente, luego se sincronizará con la nube si es necesario).
      const affectedProducts = inventory.filter(p => p.activeOffers && p.activeOffers.includes(id));
      if (affectedProducts.length > 0) {
          const promises = affectedProducts.map(p => {
              const newActiveOffers = p.activeOffers.filter(oid => oid !== id);
              return supabase.from('products').update({ active_offers: newActiveOffers }).eq('id', p.id);
          });
          await Promise.allSettled(promises);
          
          setInventory(inventory.map(p => {
              if (p.activeOffers && p.activeOffers.includes(id)) {
                  return { ...p, activeOffers: p.activeOffers.filter(oid => oid !== id) };
              }
              return p;
          }));
      }

      addLog('Oferta Eliminada', {
        id,
        name: offerToDelete.name,
        type: offerToDelete.type,
        applyTo: offerToDelete.applyTo,
        itemsCount: offerToDelete.itemsCount,
        offerPrice: offerToDelete.offerPrice,
        affectedProductsCount: affectedProducts.length
      }, 'Eliminación permanente');

      showNotification('success', 'Oferta Eliminada', 'Se retiró del sistema y de los productos aplicados.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error al Eliminar', 'No se pudo eliminar la oferta.');
    }
  };


  const handleAddExpense = async (expenseData) => {
    try {
      const userTypedNote = expenseData.note || ''; 
      const safeDescription = userTypedNote || expenseData.description || 'Gasto General';
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

      newExpense.isTest = isTestRecord(newExpense);
      setExpenses([newExpense, ...expenses]);
      
      addLog(
        'Nuevo Gasto', 
        { description: newExpense.description, amount: newExpense.amount, category: newExpense.category, paymentMethod: newExpense.paymentMethod }, 
        userTypedNote || 'Salida de dinero'
      );
      
      showNotification('success', 'Gasto Registrado', 'Se guardó correctamente en la nube.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo guardar el gasto. Verifique los datos.');
    }
  };

  const handleAddMemberWithLog = async (data) => {
    try {
       const memberNum = Math.floor(10000 + Math.random() * 90000);
       
       const payload = { 
         name: data.name, 
         dni: data.dni?.trim() || null, 
         phone: data.phone?.trim() || null, 
         email: data.email?.trim() || null, 
         points: Number(data.points) || 0, 
         member_number: memberNum 
       };

       const { data: newClient, error } = await supabase.from('clients').insert([payload]).select().single();
       if (error) throw error;
       
       const clientFormatted = { ...newClient, memberNumber: newClient.member_number };
       setMembers([...members, clientFormatted]);
       
       addLog('Nuevo Socio', { name: clientFormatted.name, number: clientFormatted.memberNumber }, data.extraInfo || 'Registro manual');
       
       showNotification('success', 'Socio Creado', `#${memberNum}`);
       return clientFormatted;
    } catch (e) { 
       console.error(e);
       if (e.message?.includes('clients_dni_key') || e.code === '23505') {
         showNotification('error', 'DNI Duplicado', 'Ese DNI ya pertenece a otro socio.');
       } else {
         showNotification('error', 'Error', 'No se pudo crear el socio.'); 
       }
    }
  };

  const handleUpdateMemberWithLog = async (id, updates) => {
    try {
      const dbUpdates = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      
      if (updates.dni !== undefined) dbUpdates.dni = updates.dni?.trim() || null;
      if (updates.phone !== undefined) dbUpdates.phone = updates.phone?.trim() || null;
      if (updates.email !== undefined) dbUpdates.email = updates.email?.trim() || null;
      
      if (updates.points !== undefined) dbUpdates.points = Number(updates.points) || 0;
      if (updates.memberNumber !== undefined) dbUpdates.member_number = updates.memberNumber;
      
      const { error } = await supabase.from('clients').update(dbUpdates).eq('id', id);
      if (error) throw error;
      
      setMembers(members.map(m => m.id === id ? { ...m, ...updates } : m));
      
      addLog('Edición de Socio', { id, updates }, updates.extraInfo || 'Actualización de datos');
      
      showNotification('success', 'Socio Actualizado', 'Cambios guardados.');
    } catch (e) { 
      console.error(e);
      if (e.message?.includes('clients_dni_key') || e.code === '23505') {
        showNotification('error', 'DNI Duplicado', 'Ese DNI ya pertenece a otro socio.');
      } else {
        showNotification('error', 'Error', 'Fallo al actualizar el socio.'); 
      }
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
    } catch {
      console.log('Audio not supported');
    }
  };

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
    (t) => t && t.status !== 'voided' && !t.isTest
  );

  const totalSales = validTransactions.reduce(
    (acc, tx) => acc + (Number(tx.total) || 0),
    0
  );
  const salesCount = validTransactions.length;

  const parseTxDate = (tx) => {
    try {
      if (tx.date && tx.time) {
        const [day, month, year] = tx.date.split('/');
        let fullYear = parseInt(year, 10);
        if (fullYear < 100) fullYear += 2000;
        const timeClean = tx.time.split(' ')[0];
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

  const cycleTransactions = useMemo(() => {
    if (!registerOpenedAt) return validTransactions;
    const cycleStart = new Date(registerOpenedAt);
    return validTransactions.filter(tx => {
      const txDate = parseTxDate(tx);
      return txDate && txDate >= cycleStart;
    });
  }, [validTransactions, registerOpenedAt]);

  const cycleExpenses = useMemo(() => {
    const realExpenses = expenses.filter(e => !e.isTest);
    if (!registerOpenedAt) return realExpenses;
    const cycleStart = new Date(registerOpenedAt);
    return realExpenses.filter(exp => {
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
      if (nowStr === closingTime && !isAutoClosing.current) {
        isAutoClosing.current = true;
        executeRegisterClose(true).finally(() => {
          setTimeout(() => { isAutoClosing.current = false; }, 65000);
        });
      }
    }
  }, [currentTime, closingTime, isRegisterClosed]);

  const handleDashboardAlertClick = (alertType) => {
    setActiveTab('inventory'); 
    if (alertType === 'out_of_stock') {
      setInventorySearch('AGOTADOS'); 
    } else if (alertType === 'expirations') {
      setInventorySearch('VENCIMIENTOS'); 
    }
  };

  const addToCart = (item, initialQty = null) => {
    // Definimos la cantidad inicial a agregar (por defecto 1, o los gramos/cantidad pasada)
    const qtyToAdd = Number(initialQty) || 1;

    // Si es un producto regular y su stock es 0, bloqueamos
    if (item.stock === 0 && !item.isCustom && !item.isCombo && !item.isDiscount) return;
    
    if (item.product_type === 'weight' && initialQty && !item.isCustom) {
      const existing = cart.find((c) => c.id === item.id && !c.isReward);
      if (existing) {
        const newTotal = existing.quantity + qtyToAdd;
        if (newTotal > item.stock) {
          showNotification('error', 'Stock Insuficiente', `Solo quedan ${item.stock}g disponibles.`);
          return;
        }
        setCart(cart.map((c) => (c.id === item.id && !c.isReward ? { ...c, quantity: newTotal } : c)));
      } else {
        if (qtyToAdd > item.stock) {
          showNotification('error', 'Stock Insuficiente', `Solo quedan ${item.stock}g disponibles.`);
          return;
        }
        setCart([...cart, { ...item, quantity: qtyToAdd }]);
      }
      return;
    }
    
    const existing = cart.find((c) => c.id === item.id && !c.isReward);
    if (existing) {
      // Validamos stock solo si NO es un item especial
      if (!item.isCustom && !item.isCombo && !item.isDiscount && existing.quantity + qtyToAdd > item.stock) {
        showNotification('error', 'Stock Insuficiente', 'No quedan más unidades de este producto.');
        return;
      }
      setCart(cart.map((c) => (c.id === item.id && !c.isReward ? { ...c, quantity: c.quantity + qtyToAdd } : c)));
    } else {
      setCart([...cart, { ...item, quantity: qtyToAdd }]); // Añadimos la cantidad exacta que nos pasan
    }
  };

  const updateCartItemQty = (id, newQty) => {
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty < 1) return;
    
    const itemInCart = cart.find(c => c.id === id);
    if (!itemInCart) return;

    // Si es libre (Custom), Combo o Descuento, no validamos contra el inventario
    if (itemInCart.isCustom || itemInCart.isCombo || itemInCart.isDiscount || itemInCart.isReward) {
      setCart(cart.map((c) => (c.id === id ? { ...c, quantity: qty } : c)));
      return;
    }

    const itemInStock = inventory.find((i) => i.id === id);
    if (!itemInStock) return;

    if (qty > itemInStock.stock) {
      showNotification('error', 'Stock Insuficiente', `Máximo disponible: ${itemInStock.stock}`);
      return;
    }
    
    setCart(cart.map((c) => (c.id === id ? { ...c, quantity: qty } : c)));
  };
  
  const removeFromCart = (id) => setCart(cart.filter((c) => c.id !== id));

  const handleBarcodeScan = (scannedCode) => {
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

  const handleInputScan = () => {
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
    setNewItem({
      title: '', brand: '', price: '', purchasePrice: '', stock: '',
      categories: [], image: '', barcode: barcode,
      product_type: 'quantity',
      expiration_date: ''
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
      qty: Number(i.qty || i.quantity) || 0,
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

  const toggleRegisterStatus = async () => {
    if (currentUser.role !== 'admin') {
      showNotification('error', 'Acceso Denegado', 'Solo el dueño puede gestionar la caja.');
      return;
    }

    if (isRegisterClosed) {
      setTempOpeningBalance('');
      setTempClosingTime('21:00');
      setIsOpeningBalanceModalOpen(true);
    } else {
      Swal.fire({ 
        title: 'Sincronizando Caja...', 
        text: 'Obteniendo ventas y modificaciones del vendedor...', 
        allowOutsideClick: false, 
        didOpen: () => Swal.showLoading() 
      });
      
      await fetchCloudData(false);
      Swal.close();
      
      setIsClosingCashModalOpen(true);
    }
  };

  const executeRegisterClose = async (isAuto = false) => {
    const closeDate = new Date();
    const cycleStart = registerOpenedAt ? new Date(registerOpenedAt) : null;
    
    const cycleTransactions = cycleStart
      ? safeTransactions.filter(tx => {
          if (!tx || tx.status === 'voided') return false;
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

    const cycleTotalSales = cycleTransactions.reduce((acc, tx) => acc + (Number(tx.total) || 0), 0);
    const cycleSalesCount = cycleTransactions.length;

    const itemsSoldMap = {};
    let totalCost = 0; 
    cycleTransactions.forEach(tx => {
      tx.items.forEach(item => {
        const inventoryItem = inventory.find(p => String(p.id) === String(item.productId || item.id));
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

    let shouldSaveReport = true;
    
    if (!isAuto) {
        setIsClosingCashModalOpen(false);
        const result = await Swal.fire({
            title: '¿Generar informe de caja?',
            text: 'Si estás haciendo pruebas, podés elegir "Solo cerrar caja" para vaciarla sin guardar el reporte en tu historial.',
            icon: 'question',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonColor: '#10b981', 
            denyButtonColor: '#64748b',   
            cancelButtonColor: '#ef4444',  
            confirmButtonText: 'Sí, generar reporte',
            denyButtonText: 'No, solo cerrar caja',
            cancelButtonText: 'Cancelar cierre'
        });

        if (result.isDismissed) {
            return;
        }
        if (result.isDenied) {
            shouldSaveReport = false;
        }

        Swal.fire({ title: 'Procesando cierre...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    }

    try {
        const { data: lockData, error: lockError } = await supabase
            .from('register_state')
            .update({
                is_open: false,
                opening_balance: 0,
                opened_at: null,
                last_updated_by: currentUser?.name || 'Sistema (Auto)'
            })
            .eq('id', 1)
            .eq('is_open', true)
            .select();

        if (lockError) throw lockError;

        if (!lockData || lockData.length === 0) {
            console.log("Cierre cancelado: OTRO dispositivo ya ejecutó el cierre exitosamente.");
            setIsRegisterClosed(true);
            setRegisterOpenedAt(null);
            setIsClosingCashModalOpen(false);
            setTransactions([]);
            setExpenses([]);
            if (isAuto) setIsAutoCloseAlertOpen(true);
            return;
        }

        const openTime = registerOpenedAt 
          ? formatTimeFullAR(new Date(registerOpenedAt))
          : (dailyLogs.find(l => l.action === 'Apertura de Caja')?.timestamp || '--:--');
        const closeTime = formatTimeFullAR(closeDate);
        const user = currentUser?.name || 'Automático';
        const type = isAuto ? 'Automático' : 'Manual';

        const closurePayload = {
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

        const closureLogDetails = {
          date: closurePayload.date,
          openTime,
          closeTime,
          user,
          type,
          openingBalance,
          totalSales: cycleTotalSales,
          finalBalance: finalPhysicalBalance,
          totalCost,
          totalExpenses,
          netProfit,
          salesCount: cycleSalesCount,
          averageTicket,
          paymentMethods: paymentMethodsSummary,
          itemsSold: itemsSoldList,
          newClients: cycleNewClients,
          expensesSnapshot: cycleExpenses,
          transactionsSnapshot: cycleTransactions,
          isTestMode: !shouldSaveReport
        };

        if (shouldSaveReport) {
            const { data: savedReport, error } = await supabase.from('cash_closures').insert([closurePayload]).select().single();
            if (error) throw error;

            const adaptedReport = mapCashClosureRecord(savedReport);
            setPastClosures([adaptedReport, ...pastClosures]);
            closureLogDetails.id = savedReport.id;
        }
        
        setIsRegisterClosed(true);
        setRegisterOpenedAt(null);
        
        const logMsg = isAuto ? 'Cierre Automático' : 'Cierre de Caja';
        addLog(logMsg, closureLogDetails, isAuto ? 'Automático' : 'Manual');
        
        setTransactions([]);
        setExpenses([]); 
        
        if (isAuto) setIsAutoCloseAlertOpen(true);
        Swal.close();
        
        if (shouldSaveReport) {
            showNotification('success', 'Reporte Generado', 'Se ha guardado el reporte del día en la nube.');
        } else {
            showNotification('info', 'Caja Vaciada', 'Se cerró la caja sin dejar reportes (Modo prueba).');
        }

    } catch (e) {
        console.error("Error guardando cierre:", e);
        showNotification('error', 'Error al Cerrar', 'Ocurrió un problema en la nube.');
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
        category: itemData.categories.join(', '), 
        barcode: itemData.barcode || null,
        image: itemData.image || '',
        product_type: itemData.product_type || 'quantity',
        expiration_date: itemData.expiration_date || null
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
        product_type: 'quantity', expiration_date: '' 
      });
      setIsModalOpen(false);
      showNotification('success', 'Producto Agregado', 'Guardado en la nube.');
    } catch (err) {
      console.error('Error agregando producto:', err);
      showNotification('error', 'Error', 'No se pudo guardar el producto.');
    }
  };

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
        category: Array.isArray(productData.categories) ? productData.categories.join(', ') : productData.category,
        barcode: productData.barcode || null,
        image: productData.image || '',
        product_type: productData.product_type || 'quantity',
        expiration_date: productData.expiration_date || null
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
    }
  };

  const handleBulkSaveSingle = async (product, editData) => {
    try {
      const isWeight = product.product_type === 'weight';
      const finalPrice = isWeight ? Number(editData.price) / 1000 : Number(editData.price);
      const finalCost = isWeight ? Number(editData.purchasePrice) / 1000 : Number(editData.purchasePrice);
      const finalStock = isWeight ? Number(editData.stock) : Number(editData.stock);

      const payload = { price: finalPrice, purchasePrice: finalCost, stock: finalStock };

      const { error } = await supabase.from('products').update(payload).eq('id', product.id);
      if (error) throw error;

      setInventory(inventory.map(p => p.id === product.id ? { ...p, price: finalPrice, purchasePrice: finalCost, stock: finalStock } : p));
      
      addLog('Edición Rápida', { id: product.id, title: product.title, changes: payload }, 'Editor Masivo');
      showNotification('success', 'Guardado', 'Producto actualizado.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo actualizar el producto.');
    }
  };

  const handleBulkSaveMasive = async (bulkData) => {
    try {
      Swal.fire({ title: 'Guardando masivamente...', text: `Actualizando ${bulkData.length} productos. Por favor espera.`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      
      const promises = bulkData.map(item => {
        const { product, edits } = item;
        const isWeight = product.product_type === 'weight';
        const finalPrice = isWeight ? Number(edits.price) / 1000 : Number(edits.price);
        const finalCost = isWeight ? Number(edits.purchasePrice) / 1000 : Number(edits.purchasePrice);
        const finalStock = isWeight ? Number(edits.stock) : Number(edits.stock);

        return supabase.from('products').update({ price: finalPrice, purchasePrice: finalCost, stock: finalStock })
          .eq('id', product.id)
          .then(({error}) => {
             if(error) throw error;
             return { id: product.id, finalPrice, finalCost, finalStock };
          });
      });

      const results = await Promise.all(promises);

      setInventory(prev => prev.map(p => {
        const updated = results.find(r => r.id === p.id);
        if (updated) {
          return { ...p, price: updated.finalPrice, purchasePrice: updated.finalCost, stock: updated.finalStock };
        }
        return p;
      }));

      addLog('Edición Masiva', { count: bulkData.length, items: bulkData.map(b => b.product.title) }, 'Editor Masivo');
      
      Swal.close();
      showNotification('success', 'Actualización Masiva', `Se actualizaron ${bulkData.length} productos correctamente.`);
    } catch (e) {
      console.error(e);
      Swal.fire('Error', 'Fallo la actualización masiva. Revisa tu conexión.', 'error');
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
      const payload = {
        title: `${originalProduct.title} (copia)`,
        brand: originalProduct.brand || '',
        price: Number(originalProduct.price) || 0,
        purchasePrice: Number(originalProduct.purchasePrice) || 0,
        stock: Number(originalProduct.stock) || 0,
        category: Array.isArray(originalProduct.categories) 
          ? originalProduct.categories.join(', ') 
          : originalProduct.category || '',
        barcode: null,       
        image: '',           
        product_type: originalProduct.product_type || 'quantity'
      };

      const { data, error } = await supabase.from('products').insert([payload]).select().single();
      if (error) throw error;

      const newProduct = {
        ...data,
        categories: data.category ? data.category.split(',').map(c => c.trim()).filter(Boolean) : [],
        purchasePrice: data.purchasePrice || 0
      };

      setInventory(prev => [...prev, newProduct]);

      addLog('Producto Duplicado', {
        originalId: originalProduct.id,
        originalTitle: originalProduct.title,
        newId: data.id,
        newTitle: data.title
      }, 'Duplicado desde editor');

      setEditingProduct(newProduct);
      setEditReason('');

      showNotification('success', 'Producto Duplicado', `Se creó "${data.title}" como copia.`);
    } catch (err) {
      console.error('Error duplicando producto:', err);
      showNotification('error', 'Error al Duplicar', 'No se pudo crear la copia del producto.');
    }
  };

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
    
    // ✨ MAGIA: Agrupamos todo el stock requerido (productos sueltos + los que están adentro de combos)
    const requiredStock = {};
    cart.forEach(c => {
      if (c.isReward || c.isCustom || c.isDiscount) return; // IGNORAMOS REWARDS, CUSTOM Y DESCUENTOS PUROS
      
      if (c.isCombo && c.productsIncluded) {
        c.productsIncluded.forEach(includedItem => {
          requiredStock[includedItem.id] = (requiredStock[includedItem.id] || 0) + c.quantity;
        });
      } else if (!c.isCombo) {
        requiredStock[c.id] = (requiredStock[c.id] || 0) + c.quantity;
      }
    });

    const stockIssues = [];
    Object.keys(requiredStock).forEach(id => {
      // Ignoramos IDs generados manualmente que se hayan colado
      if (String(id).startsWith('custom_') || String(id).startsWith('desc_') || String(id).startsWith('combo_')) return;
      
      // CAST A STRING PARA EVITAR ERROR DE TIPADO AL BUSCAR EN INVENTORY
      const p = inventory.find(x => String(x.id) === String(id));
      if (!p || p.stock < requiredStock[id]) {
        stockIssues.push(p ? p.title : 'Desconocido');
      }
    });

    if (stockIssues.length > 0) { 
      showNotification('error', 'Falta Stock', `Revisar: ${stockIssues.join(', ')}`); 
      return; 
    }

    try {
      Swal.fire({ title: 'Procesando...', didOpen: () => Swal.showLoading() });

      const pointsEarned = Math.floor(total / 500)
      const pointsSpent = cart.reduce((acc, i) => acc + (i.isReward ? i.pointsCost : 0), 0);
      const clientId = posSelectedClient?.id && posSelectedClient.id !== 'guest' ? posSelectedClient.id : null;

      const { data: sale, error: saleErr } = await supabase.from('sales').insert({
          total, payment_method: selectedPayment, installments, client_id: clientId,
          points_earned: clientId ? pointsEarned : 0, points_spent: pointsSpent,
          user_name: currentUser.name 
        }).select().single();
        if (saleErr) throw saleErr;

      const itemsPayload = cart.map(i => ({
          sale_id: sale.id, 
          // 🔥 Evitamos error FK: Si es combo o personalizado, no pasamos el ID como UUID de producto
          product_id: (i.isCustom || i.isCombo) ? null : i.id, 
          product_title: i.title, 
          quantity: i.quantity, 
          price: i.price, 
          is_reward: !!i.isReward
        }));
        await supabase.from('sale_items').insert(itemsPayload);

      // ✨ Descontamos stock usando el mapa que agrupamos al principio
      for (const [id, qtyToDeduct] of Object.entries(requiredStock)) {
         // CAST A STRING PARA EVITAR ERROR DE TIPADO
         const prod = inventory.find(p => String(p.id) === String(id));
         if (prod) {
             await supabase.from('products').update({ stock: prod.stock - qtyToDeduct }).eq('id', id);
         }
      }

      let updatedClientForTicket = null;
      let pointsChange = null; 
      if (clientId) {
          const previousPoints = posSelectedClient.points;
          const newPoints = previousPoints - pointsSpent + pointsEarned;
          pointsChange = { previous: previousPoints, new: newPoints, diff: newPoints - previousPoints };

          await supabase.from('clients').update({ points: newPoints }).eq('id', clientId);
          
          updatedClientForTicket = { ...posSelectedClient, points: newPoints, currentPoints: newPoints };
          setMembers(members.map(m => m.id === clientId ? updatedClientForTicket : m));
      }

      // ✨ Actualizamos el inventario local en React
      setInventory(inventory.map(p => {
        const qtyToDeduct = requiredStock[p.id];
        return qtyToDeduct ? { ...p, stock: p.stock - qtyToDeduct } : p;
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
        client: updatedClientForTicket || posSelectedClient, 
        pointsEarned: clientId ? pointsEarned : 0,
        pointsSpent: pointsSpent,
      };

      tx.isTest = isTestRecord(tx);
      setTransactions([tx, ...transactions]);

      const logItems = cart.map(item => ({
        id: item.id, title: item.title, quantity: item.quantity, price: item.price,
        isReward: item.isReward || false, product_type: item.product_type || 'quantity',
        isCustom: item.isCustom || false, isCombo: item.isCombo || false // ✨ Guardamos flag en log
      }));

      const isGuest = !posSelectedClient || posSelectedClient.id === 'guest';
      
      addLog('Venta Realizada', { 
        transactionId: tx.id, total: total, items: logItems,
        payment: selectedPayment, 
        installments: selectedPayment === 'Credito' ? installments : 0,
        client: isGuest ? null : posSelectedClient.name,
        memberNumber: isGuest ? null : posSelectedClient.memberNumber,
        pointsEarned: clientId ? pointsEarned : 0,
        pointsSpent: pointsSpent,
        pointsChange: pointsChange 
      }, 'Venta regular');
      
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
  };
  
  const handleConfirmRefund = async (e) => {
    e.preventDefault();
    const tx = transactionToRefund;
    if (!tx) return;
    
    try {
      // ==========================================
      // 1. FLUJO DE BORRADO PERMANENTE (PURGA)
      // ==========================================
      if (tx.status === 'voided') {
        Swal.fire({ title: 'Borrando...', text: 'Eliminando registro permanentemente...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        // 🎯 EL FRANCOTIRADOR: Identificamos la Venta Realizada original (y sus restauraciones).
        const logsToDelete = dailyLogs.filter(l => 
          ['Venta Realizada', 'Venta Restaurada', 'Modificación Pedido', 'Venta Modificada'].includes(l.action) &&
          (String(l.details?.transactionId) === String(tx.id) || String(l.details?.id) === String(tx.id) || String(l.details?.oldTransactionId) === String(tx.id))
        ).map(l => l.id);

        // Disparamos a la base de datos para borrar SOLO los registros de origen
        if (logsToDelete.length > 0) {
          const { error: delLogsErr } = await supabase.from('logs').delete().in('id', logsToDelete);
          if (delLogsErr) console.warn("Error borrando logs antiguos:", delLogsErr);
        }

        // Limpiamos nuestra vista local en tiempo real para que desaparezca el "fantasma"
        setTransactions(prev => prev.filter(t => String(t.id) !== String(tx.id)));
        setDailyLogs(prev => prev.filter(l => !logsToDelete.includes(l.id)));
        
        const clientName = tx.client?.name || (typeof tx.client === 'string' ? tx.client : null);
        const clientNum = tx.client?.memberNumber || tx.memberNumber || null;

        // 🌟 CREAMOS EL LOG DE "VENTA ELIMINADA" (Antes llamado Borrado Permanente)
        addLog('Venta Eliminada', {
            transactionId: tx.id,
            total: tx.total,
            payment: tx.payment,
            installments: tx.installments || 0,
            isTest: tx.isTest || false,
            testMarker: tx.isTest ? 'test' : 'normal',
            items: tx.items || [],
            client: clientName === 'No asociado' ? null : clientName,
            memberNumber: clientNum,
            pointsEarned: tx.pointsEarned || 0,
            pointsSpent: tx.pointsSpent || 0
        }, refundReason || 'Eliminación permanente');

        setTransactionToRefund(null);
        setRefundReason('');
        Swal.close();
        showNotification('success', 'Registro Borrado', 'La transacción original fue purgada con éxito.');
        return; 
      }

      // ==========================================
      // 2. FLUJO DE ANULACIÓN NORMAL
      // ==========================================
      Swal.fire({ title: 'Anulando...', text: 'Paso 1: Devolviendo stock...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const updatedInventory = [...inventory];
      for (const item of tx.items) {
        if (!item.isReward && !item.isCustom) { 
          const prodIndex = updatedInventory.findIndex(p => 
               (item.productId && String(p.id) === String(item.productId)) || 
               (item.id && String(p.id) === String(item.id)) ||
               p.title === item.title
          );
          if (prodIndex !== -1) {
            const prodId = updatedInventory[prodIndex].id;
            const qtyToReturn = Number(item.quantity || item.qty || 0);
            const newStock = updatedInventory[prodIndex].stock + qtyToReturn;
            updatedInventory[prodIndex] = { ...updatedInventory[prodIndex], stock: newStock };
            
            const { error: stockErr } = await supabase.from('products').update({ stock: newStock }).eq('id', prodId);
            if (stockErr) throw new Error(`Fallo actualizando stock: ${stockErr.message}`);
          }
        }
      }
      setInventory(updatedInventory);

      Swal.fire({ title: 'Anulando...', text: 'Paso 2: Ajustando puntos del socio...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const clientMemberNumber = tx.client?.memberNumber || tx.client?.number || tx.memberNumber;
      let updatedMembers = [...members];
      let pointsChange = null; 
      
      if (clientMemberNumber && clientMemberNumber !== '---') {
        const clientIndex = updatedMembers.findIndex(m => String(m.memberNumber) === String(clientMemberNumber));
        if (clientIndex !== -1) {
          const dbClient = updatedMembers[clientIndex];
          const previousPoints = dbClient.points;
          const newPoints = Math.max(0, dbClient.points - (tx.pointsEarned || 0) + (tx.pointsSpent || 0));
          
          updatedMembers[clientIndex] = { ...dbClient, points: newPoints };
          pointsChange = { previous: previousPoints, new: newPoints, diff: newPoints - previousPoints };
          
          const { error: clientErr } = await supabase.from('clients').update({ points: newPoints }).eq('id', dbClient.id);
          if (clientErr) throw new Error(`Fallo actualizando puntos: ${clientErr.message}`);
        }
      }
      setMembers(updatedMembers);

      Swal.fire({ title: 'Anulando...', text: 'Paso 3: Borrando la venta de la nube...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      
      const { error: itemsErr } = await supabase.from('sale_items').delete().eq('sale_id', tx.id);
      if (itemsErr) throw new Error(`Fallo borrando items de la venta: ${itemsErr.message}`);

      const { error: saleErr } = await supabase.from('sales').delete().eq('id', tx.id);
      if (saleErr) throw new Error(`Fallo borrando la venta: ${saleErr.message}`);

      Swal.fire({ title: 'Anulando...', text: 'Paso 4: Creando el registro final...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      
      let clientName = null;
      if (tx.client && typeof tx.client === 'object') clientName = tx.client.name;
      else if (typeof tx.client === 'string') clientName = tx.client;
      else if (tx.memberName) clientName = tx.memberName;

      const logDetails = {
        id: tx.id,
        total: tx.total,
        payment: tx.payment,
        installments: tx.installments || 0,
        client: clientName === 'No asociado' ? null : clientName,
        memberNumber: clientMemberNumber,
        pointsEarned: tx.pointsEarned || 0,
        pointsSpent: tx.pointsSpent || 0,
        pointsChange: pointsChange,
        itemsReturned: tx.items.map(i => ({
          title: i.title,
          quantity: i.quantity || i.qty
        }))
      };
      
      addLog('Venta Anulada', logDetails, refundReason || 'Anulación manual');

      const exists = transactions.some(t => String(t.id) === String(tx.id));
      if (exists) {
        setTransactions(transactions.map((t) => String(t.id) === String(tx.id) ? { ...t, status: 'voided' } : t));
      } else {
        setTransactions([{ ...tx, status: 'voided' }, ...transactions]);
      }
      
      setTransactionToRefund(null);
      setRefundReason('');
      
      Swal.close();
      showNotification('success', 'Venta Anulada', 'El stock y los puntos han sido restaurados.');

    } catch (error) {
      console.error("❌ ERROR CRÍTICO EN ANULACIÓN:", error);
      Swal.fire({
        icon: 'error',
        title: 'Error de Anulación',
        text: error.message || 'Ocurrió un error desconocido. Revisa la consola (F12).',
        confirmButtonColor: '#d33',
        confirmButtonText: 'Entendido'
      });
    }
  };
  
  const handleRestoreTransaction = async (tx) => {
    const result = await Swal.fire({
      title: '¿Restaurar Venta?',
      text: 'Se volverá a registrar la venta en el sistema, ocupará su fecha original, se descontará el stock nuevamente y se le devolverán los puntos al socio. ¿Estás seguro?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, restaurar venta',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    const stockIssues = [];
    for (const item of tx.items) {
      if (!item.isReward && !item.isCustom) {
        const prod = inventory.find(p => 
           (item.productId && String(p.id) === String(item.productId)) || 
           (item.id && String(p.id) === String(item.id)) ||
           (item.title && p.title === item.title)
        );
        
        const qtyNeeded = Number(item.qty || item.quantity || 0);
        
        if (!prod) {
            stockIssues.push(`"${item.title}" (Producto ya no existe en inventario)`);
        } else {
            const currentStock = Number(prod.stock || 0);
            if (currentStock < qtyNeeded) {
                stockIssues.push(`"${item.title}" (Faltan ${qtyNeeded - currentStock})`);
            }
        }
      }
    }
    
    if (stockIssues.length > 0) {
      Swal.fire('Stock Insuficiente', `No hay stock suficiente actualmente para restaurar esta venta:\n\n${stockIssues.join('\n')}`, 'error');
      return;
    }

    Swal.fire({ title: 'Restaurando...', text: 'Ajustando base de datos...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
      let clientId = null;
      let clientDb = null;
      let pointsChange = null; 
      
      const clientNumForRestore = tx.client?.memberNumber || tx.memberNumber || null;
      if (clientNumForRestore && clientNumForRestore !== '---') {
          clientDb = members.find(m => String(m.memberNumber) === String(clientNumForRestore));
          if (clientDb) clientId = clientDb.id;
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      let origCreatedAt = undefined;
      try {
          const [day, month, year] = tx.date.split('/');
          let fullYear = parseInt(year, 10);
          if (fullYear < 100) fullYear += 2000;
          const timeParts = (tx.time || tx.timestamp || '00:00').split(':');
          const origDate = new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10), parseInt(timeParts[0], 10), parseInt(timeParts[1] || 0, 10), parseInt(timeParts[2] || 0, 10));
          origCreatedAt = origDate.toISOString();
      } catch(e) { console.error("Error parsing date", e); }

      const salePayload = {
          total: tx.total,
          payment_method: (tx.payment && tx.payment !== 'N/A') ? tx.payment : 'Efectivo',
          installments: tx.installments || 0,
          client_id: clientId,
          points_earned: tx.pointsEarned || 0,
          points_spent: tx.pointsSpent || 0,
          user_name: tx.user || currentUser.name
      };

      if (origCreatedAt) salePayload.created_at = origCreatedAt;
      if (uuidRegex.test(tx.id)) salePayload.id = tx.id;

      const { data: newSale, error: saleErr } = await supabase.from('sales').insert(salePayload).select().single();
      if (saleErr) throw saleErr;

      const itemsPayload = tx.items.map(i => {
          const prod = inventory.find(p => 
               (i.productId && String(p.id) === String(i.productId)) || 
               (i.id && String(p.id) === String(i.id)) ||
               p.title === i.title
          );
          
          let prodId = prod ? prod.id : (i.productId || i.id);
          if (!uuidRegex.test(prodId)) prodId = null; 
          
          return {
              sale_id: newSale.id, 
              product_id: prodId, 
              product_title: i.title, 
              quantity: i.qty || i.quantity, 
              price: i.price, 
              is_reward: !!i.isReward
          };
      });
      
      if (itemsPayload.length > 0) {
          const { error: itemsErr } = await supabase.from('sale_items').insert(itemsPayload);
          if (itemsErr) throw itemsErr;
      }

      const updatedInventory = [...inventory];
      for (const item of tx.items) {
         if (!item.isReward && !item.isCustom) {
            const prodIndex = updatedInventory.findIndex(p => 
               (item.productId && String(p.id) === String(item.productId)) || 
               (item.id && String(p.id) === String(item.id)) ||
               p.title === item.title
            );
            if (prodIndex !== -1) {
               const prodId = updatedInventory[prodIndex].id;
               const qtyToDeduct = Number(item.qty || item.quantity || 0);
               const newStock = updatedInventory[prodIndex].stock - qtyToDeduct;
               updatedInventory[prodIndex] = { ...updatedInventory[prodIndex], stock: newStock };
               await supabase.from('products').update({ stock: newStock }).eq('id', prodId);
            }
         }
      }
      setInventory(updatedInventory);

      if (clientDb) {
          const previousPoints = clientDb.points;
          const newPoints = clientDb.points + (tx.pointsEarned || 0) - (tx.pointsSpent || 0);
          
          pointsChange = { previous: previousPoints, new: newPoints, diff: newPoints - previousPoints };
          
          await supabase.from('clients').update({ points: newPoints }).eq('id', clientDb.id);
          setMembers(members.map(m => m.id === clientDb.id ? { ...m, points: newPoints } : m));
      }

      let clientName = null;
      if (tx.client && typeof tx.client === 'object') clientName = tx.client.name;
      else if (typeof tx.client === 'string') clientName = tx.client;
      else if (tx.memberName) clientName = tx.memberName;
      
      const clientNum = tx.client?.memberNumber || tx.memberNumber || null;

      const logDetails = {
         transactionId: newSale.id, 
         oldTransactionId: tx.id,
         total: tx.total, 
         payment: salePayload.payment_method,
         installments: salePayload.installments,
         client: clientName === 'No asociado' ? null : clientName,
         memberNumber: clientNum,
         pointsEarned: tx.pointsEarned || 0,
         pointsSpent: tx.pointsSpent || 0,
         pointsChange: pointsChange,
         itemsRestored: tx.items.map(i => ({ title: i.title, quantity: i.qty || i.quantity })),
         itemsSnapshot: tx.items.map(i => ({
           id: i.id,
           productId: i.productId || i.id,
           title: i.title,
           quantity: i.qty || i.quantity,
           price: i.price,
           isReward: !!i.isReward,
           product_type: i.product_type || 'quantity',
           isCustom: !!i.isCustom,
           isCombo: !!i.isCombo,
           category: i.category || null,
           categories: Array.isArray(i.categories) ? i.categories : null
         }))
      };
      
      addLog('Venta Restaurada', logDetails, 'Restauración manual desde el historial');

      const now = new Date();
      const restoredTx = {
         ...tx,
         id: newSale.id,
         status: 'completed',
         isHistoric: false,
         isRestored: true,
         payment: salePayload.payment_method,
         installments: salePayload.installments,
         restoredAt: `${formatDateAR(now)} ${formatTimeFullAR(now)}`
      };
      restoredTx.isTest = isTestRecord(restoredTx);
      
      setTransactions([restoredTx, ...transactions.filter(t => String(t.id) !== String(tx.id))]);
      
      Swal.close();
      showNotification('success', 'Venta Restaurada', 'La venta vuelve a estar activa con su fecha original.');

    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudo restaurar la venta. Verifique su conexión y la consola.', 'error');
    }
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

  const handleSaveEditedTransaction = async (e) => {
    e.preventDefault();
    if (!editingTransaction) return;

    const originalTx = transactions.find((t) => t.id === editingTransaction.id);
    if (!originalTx) return;

    try {
      Swal.fire({ title: 'Guardando cambios...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      // 1. Detección de cambios básicos
      const changes = {};
      if (originalTx.total !== editingTransaction.total) changes.total = { old: originalTx.total, new: editingTransaction.total };
      if (originalTx.payment !== editingTransaction.payment) changes.payment = { old: originalTx.payment, new: editingTransaction.payment };
      if (Number(originalTx.installments || 0) !== Number(editingTransaction.installments || 0)) {
        changes.installments = { old: Number(originalTx.installments || 0), new: Number(editingTransaction.installments || 0) };
      }

      // 2. Normalización absoluta de items
      const finalItems = editingTransaction.items.map(i => ({
          ...i,
          qty: Number(i.qty || i.quantity || 0),
          price: Number(i.price || 0),
          title: i.title || i.product_title || i.name || 'Producto'
      }));

      // [Cálculo de diferencias para stock]
      const productChanges = [];
      const oldMap = {};
      originalTx.items.forEach(i => { oldMap[i.id || i.productId] = Number(i.qty || i.quantity || 0); });
      
      const newMap = {};
      finalItems.forEach(i => { if (i.id || i.productId) newMap[i.id || i.productId] = i.qty; });

      const allIds = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
      allIds.forEach(id => {
         if (id && id !== 'null' && id !== 'undefined') {
             const oldQty = oldMap[id] || 0;
             const newQty = newMap[id] || 0;
             if (oldQty !== newQty) {
                const itemDef = finalItems.find(x => String(x.id || x.productId) === String(id)) || originalTx.items.find(x => String(x.id || x.productId) === String(id));
                productChanges.push({ id, title: itemDef?.title || 'Producto', oldQty, newQty, diff: newQty - oldQty });
             }
         }
      });

      // [Cálculo de puntos]
      let pointsChange = null;
      let clientObj = editingTransaction.client || originalTx.client;
      let cName = null; let cNum = null;

      if (clientObj && typeof clientObj === 'object' && clientObj.name !== 'No asociado') {
         cName = clientObj.name; cNum = clientObj.memberNumber;
         const oldPts = Number(originalTx.pointsEarned || 0);
         const newPts = Math.floor(editingTransaction.total / 500); 
         if (oldPts !== newPts) pointsChange = { previous: oldPts, new: newPts, diff: newPts - oldPts };
      } else if (typeof clientObj === 'string' && clientObj !== 'No asociado') {
         cName = clientObj;
      }

      // ==========================================
      // INICIO TRANSACCIÓN A LA NUBE (BLINDADA)
      // ==========================================
      
      // A. Actualizar Venta
      const { error: saleErr } = await supabase.from('sales').update({
        total: editingTransaction.total,
        payment_method: editingTransaction.payment,
        installments: editingTransaction.installments || 0,
        points_earned: pointsChange ? pointsChange.new : originalTx.pointsEarned
      }).eq('id', editingTransaction.id);
      
      if (saleErr) throw new Error("Fallo en totales: " + saleErr.message);

      // B. Borrar items viejos
      const { error: delErr } = await supabase.from('sale_items').delete().eq('sale_id', editingTransaction.id);
      if (delErr) throw new Error("Fallo limpiando base: " + delErr.message);
      
      // C. Insertar items nuevos con UUID Validator
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const newItemsPayload = finalItems.map(i => {
        let prodId = i.productId || i.id;
        if (!uuidRegex.test(prodId)) prodId = null; 

        return {
          sale_id: editingTransaction.id,
          product_id: prodId,
          product_title: i.title,
          quantity: i.qty,
          price: i.price,
          is_reward: !!i.isReward
        };
      });
      
      const { error: insertErr } = await supabase.from('sale_items').insert(newItemsPayload);
      if (insertErr) throw new Error("Supabase rechazó los productos: " + insertErr.message); 

      // D. Actualizar Stock
      for (const change of productChanges) {
        if (change.diff !== 0) {
          const prod = inventory.find(p => String(p.id) === String(change.id));
          if (prod) {
            await supabase.from('products').update({ stock: prod.stock - change.diff }).eq('id', change.id);
          }
        }
      }

      // E. Actualizar Puntos Cliente
      if (pointsChange && clientObj && clientObj.id) {
         const clientDb = members.find(m => m.id === clientObj.id);
         if (clientDb) {
            const finalPoints = clientDb.points + pointsChange.diff;
            await supabase.from('clients').update({ points: finalPoints }).eq('id', clientDb.id);
            setMembers(members.map(m => m.id === clientDb.id ? { ...m, points: finalPoints } : m));
         }
      }

      // F. Sincronizar UI Inmediatamente
      const finalTx = {
         ...editingTransaction,
         items: finalItems, 
         pointsEarned: pointsChange ? pointsChange.new : originalTx.pointsEarned
      };
      
      finalTx.isTest = isTestRecord(finalTx);
      
      setTransactions(transactions.map((t) => (t.id === editingTransaction.id ? finalTx : t)));

      setInventory(inventory.map(p => {
         const change = productChanges.find(c => String(c.id) === String(p.id));
         if (change) return { ...p, stock: p.stock - change.diff };
         return p;
      }));

      // G. Log
      const logDetails = {
         transactionId: editingTransaction.id, client: cName, memberNumber: cNum,
         payment: editingTransaction.payment,
         installments: editingTransaction.installments || 0,
         changes, productChanges, itemsSnapshot: finalItems, pointsChange
      };
      addLog('Modificación Pedido', logDetails, editReason || 'Ajuste manual');

      setEditingTransaction(null);
      setEditReason('');
      Swal.close();
      showNotification('success', 'Pedido Actualizado', 'Modificación exitosa.');

    } catch (error) {
      console.error("Error crítico al actualizar:", error);
      Swal.fire({
        icon: 'error',
        title: 'Error de Sincronización',
        text: error.message || 'Error desconocido guardando en la nube.',
        confirmButtonText: 'Entendido'
      });
    }
  };

  // ==========================================
  // ✨ HANDLERS DE PREMIOS (Restaurados)
  // ==========================================
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

  const tabsWithInternalScroll = new Set([
    'inventory',
    'pos',
    'clients',
    'orders',
    'history',
    'reports',
    'logs',
    'extras',
    'bulk-editor',
  ]);

  const mainContentClass = [
    'flex-1',
    'min-h-0',
    'p-4',
    'bg-slate-100',
    'relative',
    tabsWithInternalScroll.has(activeTab) ? 'overflow-hidden' : 'overflow-y-auto',
  ].join(' ');

  if (isCloudLoading) return <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-100"><RefreshCw className="animate-spin text-fuchsia-600 mb-4" size={48} /><h2 className="text-xl font-bold">Cargando Nube...</h2></div>;

  if (!currentUser) {
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

// --- MAIN LAYOUT ---
  return (
    <>
      <div className="print:hidden flex h-screen bg-slate-100 font-sans text-slate-900 text-sm overflow-hidden">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={handleLogout} />
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          
          {isTestActive && (
            <div className="bg-orange-500 text-white text-xs font-bold px-4 py-2.5 flex items-center justify-center gap-2 z-50 shadow-md w-full animate-in slide-in-from-top">
              <AlertTriangle size={16} />
              <span>⚠️ Estás usando la palabra "test". Esta acción NO se contabilizará en el sistema y será usada como prueba únicamente.</span>
            </div>
          )}

          <header className="bg-white border-b h-12 flex items-center justify-between px-5 shadow-sm z-10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="pl-1">
                <h2 className="text-base font-bold text-slate-800 uppercase tracking-wide">
                  {{ pos: 'Punto de Venta', dashboard: 'Control de Caja', inventory: 'Inventario', clients: 'Socios', orders: 'Pedidos', history: 'Historial de Ventas', reports: 'Reportes de Caja', logs: 'Registro de Acciones', extras: 'Gestion de Extras', 'bulk-editor': 'Productos' }[activeTab] || activeTab}
                </h2>
                <div className="-mt-0.5 flex items-center gap-2 text-[12px] font-bold text-slate-500">
                  <span>{formatDateAR(currentTime)} {formatTimeAR(currentTime)}hrs</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button onClick={currentUser?.role === 'admin' ? toggleRegisterStatus : undefined} className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors ${isRegisterClosed ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'} ${currentUser?.role === 'admin' ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`} title={currentUser?.role !== 'admin' ? 'Solo el Dueño puede cambiar el estado de la caja' : ''}><Lock size={14} /><span className="text-xs font-bold">{isRegisterClosed ? 'CAJA CERRADA' : 'CAJA ABIERTA'}</span></button>
                {!isRegisterClosed && closingTime && (<div className="flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-700"><Clock size={12} /><span className="text-[10px] font-bold">Cierre: {closingTime}</span></div>)}
              </div>
              <div className="text-right hidden sm:block"><p className="text-xs font-bold text-slate-700">{currentUser?.name}</p><span className={`text-[10px] px-2 py-0.5 rounded font-bold ${currentUser?.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{currentUser?.role === 'admin' ? 'DUEÑO' : 'VENDEDOR'}</span></div>
            </div>
          </header>
          
          <main className={mainContentClass}>
            <PersistentTabPanel tab="dashboard" activeTab={activeTab}>
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
                onAlertClick={handleDashboardAlertClick} 
                onNavigate={(tab) => setActiveTab(tab)}
                onViewTransaction={(tx) => setDetailsModalTx(tx)}
              />
            </PersistentTabPanel>
            <PersistentTabPanel tab="inventory" activeTab={activeTab} className="h-full min-h-0"><InventoryView inventory={inventory} categories={categories} currentUser={currentUser} inventoryViewMode={inventoryViewMode} setInventoryViewMode={setInventoryViewMode} gridColumns={inventoryGridColumns} setGridColumns={setInventoryGridColumns} inventorySearch={inventorySearch} setInventorySearch={setInventorySearch} inventoryCategoryFilter={inventoryCategoryFilter} setInventoryCategoryFilter={setInventoryCategoryFilter} setIsModalOpen={setIsModalOpen} setEditingProduct={(prod) => { setEditingProduct(prod); setEditReason(''); }} handleDeleteProduct={handleDeleteProductRequest} setSelectedImage={setSelectedImage} setIsImageModalOpen={setIsImageModalOpen} /></PersistentTabPanel>
            <PersistentTabPanel tab="pos" activeTab={activeTab} className="h-full min-h-0">{isRegisterClosed ? (<div className="h-full flex flex-col items-center justify-center text-slate-400"><Lock size={64} className="mb-4 text-slate-300" /><h3 className="text-xl font-bold text-slate-600">Caja Cerrada</h3>{currentUser?.role === 'admin' ? (<><p className="mb-6">Debes abrir la caja para realizar ventas.</p><button onClick={toggleRegisterStatus} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700">Abrir Caja</button></>) : (<p className="mb-6 text-center">El Dueño debe abrir la caja para realizar ventas.</p>)}</div>) : (<POSView inventory={inventory} categories={categories} addToCart={addToCart} cart={cart} removeFromCart={removeFromCart} updateCartItemQty={updateCartItemQty} selectedPayment={selectedPayment} setSelectedPayment={setSelectedPayment} installments={installments} setInstallments={setInstallments} calculateTotal={calculateTotal} handleCheckout={handleCheckout} posSearch={posSearch} setPosSearch={setPosSearch} selectedCategory={posSelectedCategory} setSelectedCategory={setPosSelectedCategory} posViewMode={posViewMode} setPosViewMode={setPosViewMode} gridColumns={posGridColumns} setGridColumns={setPosGridColumns} selectedClient={posSelectedClient} setSelectedClient={setPosSelectedClient} onOpenClientModal={() => setIsClientModalOpen(true)} onOpenRedemptionModal={() => setIsRedemptionModalOpen(true)} offers={offers} />)}</PersistentTabPanel>
            <PersistentTabPanel tab="clients" activeTab={activeTab} className="h-full min-h-0"><ClientsView members={members} addMember={handleAddMemberWithLog} updateMember={handleUpdateMemberWithLog} deleteMember={handleDeleteMemberWithLog} currentUser={currentUser} onViewTicket={handleViewTicket} onEditTransaction={handleEditTransactionRequest} onDeleteTransaction={handleDeleteTransaction} transactions={transactions} checkExpirations={() => {}} /></PersistentTabPanel>
            <PersistentTabPanel tab="orders" activeTab={activeTab} className="h-full min-h-0"><OrdersView budgets={budgets} orders={orders} members={members} inventory={inventory} categories={categories} onCreateBudget={handleCreateBudget} onUpdateBudget={handleUpdateBudget} onDeleteBudget={handleDeleteBudget} onConvertBudgetToOrder={handleConvertBudgetToOrder} onRegisterOrderPayment={handleRegisterOrderPayment} onCancelOrder={handleCancelOrder} onMarkOrderRetired={handleMarkOrderRetired} onPrintRecord={handlePrintOrderRecord} /></PersistentTabPanel>
            <PersistentTabPanel tab="history" activeTab={activeTab} className="h-full min-h-0"><HistoryView transactions={transactions} dailyLogs={dailyLogs} inventory={inventory} currentUser={currentUser} members={members} showNotification={showNotification} onViewTicket={handleViewTicket} onDeleteTransaction={handleDeleteTransaction} onEditTransaction={handleEditTransactionRequest} onRestoreTransaction={handleRestoreTransaction} setTransactions={setTransactions} setDailyLogs={setDailyLogs} /></PersistentTabPanel>
            {currentUser?.role === 'admin' && (<PersistentTabPanel tab="reports" activeTab={activeTab} className="h-full min-h-0"><ReportsHistoryView pastClosures={pastClosures} members={members}/></PersistentTabPanel>)}
            {currentUser?.role === 'admin' && (<PersistentTabPanel tab="logs" activeTab={activeTab} className="h-full min-h-0"><LogsView dailyLogs={dailyLogs} onUpdateLogNote={handleUpdateLogNote} onReprintPdf={handleReprintPdf} /></PersistentTabPanel>)}
            <PersistentTabPanel tab="extras" activeTab={activeTab} className="h-full min-h-0">
              <ExtrasView 
              categories={categories} 
              inventory={inventory} 
              offers={offers} 
              rewards={rewards}
              currentUser={currentUser}
              onAddCategory={handleAddCategoryFromView} 
              onDeleteCategory={handleDeleteCategoryFromView} 
              onEditCategory={handleEditCategory} 
              onBatchUpdateProductCategory={handleBatchUpdateProductCategory}
              onAddOffer={handleAddOffer} 
              onUpdateOffer={handleUpdateOffer}
              onDeleteOffer={handleDeleteOffer}
              onAddReward={handleAddReward}
              onUpdateReward={handleUpdateReward}
              onDeleteReward={handleDeleteReward}
              />
            </PersistentTabPanel>
            {currentUser?.role === 'admin' && (
              <PersistentTabPanel tab="bulk-editor" activeTab={activeTab} className="h-full min-h-0">
                <BulkEditorView 
                inventory={inventory} 
                categories={categories} 
                onSaveSingle={handleBulkSaveSingle} 
                onSaveBulk={handleBulkSaveMasive} 
                onExportProducts={handleExportProducts}
                // ✨ NUEVAS PROPS PARA PDF PERSISTENTE
                exportItems={bulkExportItems}
                setExportItems={setBulkExportItems}
                exportConfig={bulkExportConfig}
                setExportConfig={setBulkExportConfig}
                onCreateFixedProduct={handleCreateFixedProduct}
                />
              </PersistentTabPanel>
            )}
          </main>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ✨ ZONA DE IMPRESIÓN (SIN LÍMITES DE TAMAÑO, SOLO SE VE AL IMPRIMIR) */}
      {/* ========================================================================= */}
      <div className="hidden print:block w-full h-auto bg-white">
        {exportPdfData ? (
          <ExportPdfLayout data={exportPdfData} />
        ) : (
          <TicketPrintLayout transaction={ticketToView || saleSuccessModal} />
        )}
      </div>

      {/* --- MODALES NORMALES DE LA APP (NO SE IMPRIMEN) --- */}
      <div className="print:hidden">
        <NotificationModal isOpen={notification.isOpen} onClose={closeNotification} type={notification.type} title={notification.title} message={notification.message} />
        <OpeningBalanceModal isOpen={isOpeningBalanceModalOpen} onClose={() => setIsOpeningBalanceModalOpen(false)} tempOpeningBalance={tempOpeningBalance} setTempOpeningBalance={setTempOpeningBalance} tempClosingTime={tempClosingTime} setTempClosingTime={setTempClosingTime} onSave={handleSaveOpeningBalance} />
        <ClosingTimeModal isOpen={isClosingTimeModalOpen} onClose={() => setIsClosingTimeModalOpen(false)} closingTime={closingTime} setClosingTime={setClosingTime} onSave={handleSaveClosingTime} />
        <AddProductModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); }} newItem={newItem} setNewItem={setNewItem} categories={categories} onImageUpload={handleImageUpload} onAdd={handleAddItem} inventory={inventory} onDuplicateBarcode={handleDuplicateBarcodeDetected} isUploadingImage={isUploadingImage} />
        <EditProductModal product={editingProduct} onClose={() => setEditingProduct(null)} setEditingProduct={setEditingProduct} categories={categories} onImageUpload={handleImageUpload} editReason={editReason} setEditReason={setEditReason} onSave={saveEditProduct} inventory={inventory} onDuplicateBarcode={handleDuplicateBarcodeDetected} isUploadingImage={isUploadingImage} onDuplicate={handleDuplicateProduct} currentUser={currentUser} />
        <EditTransactionModal transaction={editingTransaction} onClose={() => setEditingTransaction(null)} inventory={inventory} setEditingTransaction={setEditingTransaction} transactionSearch={transactionSearch} setTransactionSearch={setTransactionSearch} addTxItem={addTxItem} removeTxItem={removeTxItem} setTxItemQty={setTxItemQty} handlePaymentChange={handleEditTxPaymentChange} editReason={editReason} setEditReason={setEditReason} onSave={handleSaveEditedTransaction} />
        <ImageModal isOpen={isImageModalOpen} image={selectedImage} onClose={() => setIsImageModalOpen(false)} />
        <RefundModal  transaction={transactionToRefund}  onClose={() => {   setTransactionToRefund(null);   setRefundReason('');  }}   refundReason={refundReason}  setRefundReason={setRefundReason} onConfirm={handleConfirmRefund} />
        <CloseCashModal isOpen={isClosingCashModalOpen} onClose={() => setIsClosingCashModalOpen(false)} salesCount={cycleSalesCount} totalSales={cycleTotalSales} totalExpenses={cycleTotalExpenses} cashExpenses={cycleCashExpenses} cashSales={cycleCashSales} openingBalance={openingBalance} onConfirm={handleConfirmCloseCash} />
        <SaleSuccessModal transaction={saleSuccessModal} onClose={() => setSaleSuccessModal(null)} onViewTicket={() => { const tx = saleSuccessModal; setSaleSuccessModal(null); setTicketToView(tx); }} />
        <TicketModal transaction={ticketToView} onClose={() => setTicketToView(null)} onPrint={handlePrintTicket} />
        <AutoCloseAlertModal isOpen={isAutoCloseAlertOpen} onClose={() => setIsAutoCloseAlertOpen(false)} closingTime={closingTime} />
        <DeleteProductModal product={productToDelete} onClose={() => { setProductToDelete(null); setDeleteProductReason(''); }} reason={deleteProductReason} setReason={setDeleteProductReason} onConfirm={confirmDeleteProduct} />
        <BarcodeNotFoundModal isOpen={barcodeNotFoundModal.isOpen} scannedCode={barcodeNotFoundModal.code} onClose={() => setBarcodeNotFoundModal({ isOpen: false, code: '' })} onAddProduct={handleAddProductFromBarcode} />
        <BarcodeDuplicateModal isOpen={barcodeDuplicateModal.isOpen} existingProduct={barcodeDuplicateModal.existingProduct} onClose={() => setBarcodeDuplicateModal({ isOpen: false, existingProduct: null, newBarcode: '' })} onKeepExisting={() => setBarcodeDuplicateModal({ isOpen: false, existingProduct: null, newBarcode: '' })} onReplaceBarcode={handleReplaceDuplicateBarcode} />
        <ClientSelectionModal isOpen={isClientModalOpen} onClose={() => setIsClientModalOpen(false)} clients={members} addClient={handleAddMemberWithLog} onSelectClient={(client) => setPosSelectedClient(client)} onCancelFlow={() => { setPosSelectedClient({ id: 'guest', name: 'No asociado', memberNumber: '---', points: 0 }); setIsClientModalOpen(false); }} />
        <RedemptionModal isOpen={isRedemptionModalOpen} onClose={() => setIsRedemptionModalOpen(false)} client={posSelectedClient} rewards={rewards} onRedeem={handleRedeemReward} />
        <ExpenseModal isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} onSave={handleAddExpense} />
        
        <TransactionDetailModal
          transaction={detailsModalTx}
          onClose={() => setDetailsModalTx(null)}
          currentUser={currentUser}
          members={members}
          onEditTransaction={(tx) => {
            setDetailsModalTx(null); 
            handleEditTransactionRequest(tx); 
          }}
          onDeleteTransaction={(tx) => {
            setDetailsModalTx(null);
            handleDeleteTransaction(tx);
          }}
          onViewTicket={handleViewTicket}
        />
      </div>
    </>
  );
}


