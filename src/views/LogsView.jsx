import React, { useState, useMemo } from 'react';
import { useLogsFilter } from '../hooks/useLogsFilter';

// Componentes modulares
import LogsControls from '../components/ActionLogs/LogsControls';
import LogsTable from '../components/ActionLogs/LogsTable';
import LogDetailModal from '../components/ActionLogs/LogDetailModal';
import { GeneratorModal, DeleteHistoryModal } from '../components/ActionLogs/LogAuxModals';

export default function LogsView({ dailyLogs, setDailyLogs, inventory }) {
  
  // ===========================================================================
  // 1. ADAPTADOR DE DATOS (CRÍTICO)
  // Convierte los datos de la nube (texto) en objetos útiles para tu UI
  // ===========================================================================
  const processedLogs = useMemo(() => {
    if (!dailyLogs) return [];

    return dailyLogs.map(log => {
      let finalDetails = log.details;

      // Si Supabase devuelve un string JSON, lo parseamos a Objeto.
      // Esto es vital para que LogsTable pinte las etiquetas de colores.
      if (typeof finalDetails === 'string') {
        try {
          finalDetails = JSON.parse(finalDetails);
        } catch (e) {
          // Si no es JSON válido, lo dejamos como está
        }
      }

      return {
        ...log,
        // IMPORTANTE: Devolvemos el OBJETO, no un string resumen.
        details: finalDetails, 
      };
    });
  }, [dailyLogs]);

  // ===========================================================================
  // 2. HOOK DE LÓGICA (Usando los datos procesados)
  // ===========================================================================
  const {
    sortedLogs,
    uniqueActions,
    hasActiveFilters,
    filterDateStart, setFilterDateStart,
    filterDateEnd, setFilterDateEnd,
    filterUser, setFilterUser,
    filterAction, setFilterAction,
    filterSearch, setFilterSearch,
    sortColumn,
    sortDirection,
    handleSort,
    clearAllFilters
  } = useLogsFilter(processedLogs);

  // 3. Estados UI Locales
  const [selectedLog, setSelectedLog] = useState(null);
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // ===========================================================================
  // 3. LÓGICA DEL GENERADOR DE DATOS (RESTAURADA COMPLETA)
  // ===========================================================================
  const handleGenerateLogs = (config) => {
    const {
      count,
      dateStart,
      dateEnd,
      includeVentas,
      includeCaja,
      includeProductos,
      includeCategorias,
    } = config;

    // Datos base para simulación realista
    const products = inventory || [];
    const payments = ['Efectivo', 'MercadoPago', 'Debito', 'Credito'];
    const users = ['Dueño', 'Vendedor'];
    const categories = ['Globos', 'Descartables', 'Disfraces', 'Decoración', 'Luminoso'];

    // Fechas
    const end = dateEnd ? new Date(dateEnd + 'T23:59:59') : new Date();
    const start = dateStart
      ? new Date(dateStart + 'T00:00:00')
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const newLogs = [];
    const actionTypes = [];

    if (includeVentas) actionTypes.push('venta', 'venta_anulada');
    if (includeCaja) actionTypes.push('apertura', 'cierre');
    if (includeProductos && products.length > 0) actionTypes.push('edicion_producto', 'alta_producto');
    if (includeCategorias) actionTypes.push('categoria');

    if (actionTypes.length === 0) {
      // Usar alert simple si no hay notificaciones configuradas en esta vista
      alert('Selecciona al menos un tipo de acción');
      return;
    }

    // Bucle de generación
    for (let i = 0; i < count; i++) {
      const randomTime = start.getTime() + Math.random() * (end.getTime() - start.getTime());
      const randomDate = new Date(randomTime);
      
      // Simular horas comerciales
      let randomHour = 9 + Math.floor(Math.random() * 12);
      if (randomHour >= 14 && randomHour < 16) randomHour = 16;
      const randomMinute = Math.floor(Math.random() * 60);

      const day = randomDate.getDate().toString().padStart(2, '0');
      const month = (randomDate.getMonth() + 1).toString().padStart(2, '0');
      const year = randomDate.getFullYear();
      const dateStr = `${day}/${month}/${year}`;
      const timeStr = `${randomHour.toString().padStart(2, '0')}:${randomMinute.toString().padStart(2, '0')}`;

      const actionType = actionTypes[Math.floor(Math.random() * actionTypes.length)];
      const user = users[Math.floor(Math.random() * users.length)];

      let log = {
        id: Date.now() + i + Math.random(),
        timestamp: timeStr,
        date: dateStr,
        user: user,
        created_at: randomDate.toISOString() // Para Supabase
      };

      // --- LOGICA DE DETALLES COMPLEJOS PARA ETIQUETAS ---
      switch (actionType) {
        case 'venta': {
            const numProducts = 1 + Math.floor(Math.random() * 4);
            const selectedProducts = [];
            
            if (products.length > 0) {
              for (let j = 0; j < numProducts; j++) {
                const product = products[Math.floor(Math.random() * products.length)];
                selectedProducts.push({
                  title: product.title,
                  price: product.price,
                  qty: 1 + Math.floor(Math.random() * 3),
                });
              }
            } else {
               selectedProducts.push({ title: 'Producto Genérico', price: 1500, qty: 1 });
            }

            const total = selectedProducts.reduce((sum, p) => sum + p.price * p.qty, 0);
            
            log.action = 'Venta Realizada';
            log.details = { 
                transactionId: 1000 + Math.floor(Math.random() * 9000), 
                items: selectedProducts, 
                total: total, 
                payment: payments[Math.floor(Math.random() * payments.length)] 
            };
            break;
        }
        case 'venta_anulada': 
            log.action = 'Venta Anulada'; 
            log.details = { 
                transactionId: 1000 + Math.floor(Math.random() * 9000), 
                originalTotal: 5000 + Math.floor(Math.random() * 50000) 
            }; 
            log.reason = 'Cliente solicitó anulación'; 
            break;
        case 'apertura': 
            log.action = 'Apertura de Caja'; 
            log.user = 'Dueño'; 
            log.details = { 
                amount: 10000 + Math.floor(Math.random() * 40000), 
                scheduledClosingTime: '21:00' 
            }; 
            break;
        case 'cierre': 
            log.action = 'Cierre de Caja'; 
            log.user = 'Dueño'; 
            log.details = { 
                salesCount: 5 + Math.floor(Math.random() * 30), 
                totalSales: 20000 + Math.floor(Math.random() * 200000), 
                finalBalance: 30000 + Math.floor(Math.random() * 250000), 
                closingTime: timeStr 
            }; 
            break;
        case 'edicion_producto': { 
            if (products.length > 0) {
               const product = products[Math.floor(Math.random() * products.length)]; 
               log.action = 'Edición Producto'; 
               log.details = { 
                   product: product.title, 
                   productId: product.id, 
                   changes: { price: { from: product.price - 500, to: product.price } } 
               }; 
            } else {
               log.action = 'Edición Producto';
               log.details = { product: 'Producto Test', changes: { stock: { from: 10, to: 5 } } };
            }
            break; 
        }
        case 'alta_producto': 
            log.action = 'Alta de Producto'; 
            log.details = { 
                title: 'Producto de Prueba ' + Math.floor(Math.random() * 100), 
                price: 1000 + Math.floor(Math.random() * 10000), 
                stock: 10 + Math.floor(Math.random() * 50), 
                category: categories[Math.floor(Math.random() * categories.length)] 
            }; 
            break;
        case 'categoria': 
            log.action = 'Categoría'; 
            log.details = { 
                type: Math.random() > 0.5 ? 'create' : 'delete', 
                name: categories[Math.floor(Math.random() * categories.length)] 
            }; 
            break;
        default: break;
      }
      newLogs.push(log);
    }

    if (setDailyLogs) setDailyLogs((prev) => [...newLogs, ...(prev || [])]);
    setShowGeneratorModal(false);
    
    // Feedback visual
    const notification = document.createElement('div');
    notification.textContent = `✅ Se generaron ${newLogs.length} acciones exitosamente`;
    notification.style.cssText = "position: fixed; bottom: 20px; right: 20px; background: #22c55e; color: white; padding: 12px 24px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 9999; animation: fadeIn 0.3s ease-out;";
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  };

  const handleClearLogs = () => {
    if (setDailyLogs) setDailyLogs([]);
    setShowDeleteModal(false);
    // Feedback visual
    const notification = document.createElement('div');
    notification.textContent = `✅ Historial eliminado`;
    notification.style.cssText = "position: fixed; bottom: 20px; right: 20px; background: #ef4444; color: white; padding: 12px 24px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 9999; animation: fadeIn 0.3s ease-out;";
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col">
      {/* 1. CONTROLES Y FILTROS */}
      <LogsControls
        totalLogs={sortedLogs.length}
        uniqueActions={uniqueActions}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearAllFilters}
        onShowGenerator={() => setShowGeneratorModal(true)}
        onShowDelete={() => setShowDeleteModal(true)}
        filterDateStart={filterDateStart} setFilterDateStart={setFilterDateStart}
        filterDateEnd={filterDateEnd} setFilterDateEnd={setFilterDateEnd}
        filterUser={filterUser} setFilterUser={setFilterUser}
        filterAction={filterAction} setFilterAction={setFilterAction}
        filterSearch={filterSearch} setFilterSearch={setFilterSearch}
        canEdit={!!setDailyLogs}
      />

      {/* 2. TABLA DE REGISTROS */}
      <LogsTable
        sortedLogs={sortedLogs}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
        onViewDetails={(log) => setSelectedLog(log)} // Pasamos el objeto completo
      />

      {/* 3. MODAL DE DETALLE */}
      <LogDetailModal
        selectedLog={selectedLog}
        onClose={() => setSelectedLog(null)}
      />

      {/* 4. MODALES AUXILIARES */}
      <GeneratorModal
        isOpen={showGeneratorModal}
        onClose={() => setShowGeneratorModal(false)}
        onGenerate={handleGenerateLogs}
      />

      <DeleteHistoryModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleClearLogs}
        count={dailyLogs ? dailyLogs.length : 0}
      />
    </div>
  );
}