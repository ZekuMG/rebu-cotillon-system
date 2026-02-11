// src/views/ClientsView.jsx
import React, { useState, useEffect } from 'react';
import { 
  Search, 
  History, 
  X, 
  Plus, 
  Save, 
  User, 
  Trash2, 
  Edit2, 
  CreditCard, 
  Phone, 
  Mail,
  FileText,
  AlertTriangle,
  Trophy,
  XCircle,
  Printer,
  ClipboardCheck // Auditoría (6 meses)
} from 'lucide-react';

export default function ClientsView({ 
  members, 
  addMember, 
  updateMember, 
  deleteMember, 
  currentUser,
  onViewTicket,
  onEditTransaction,
  onDeleteTransaction,
  transactions = [],
  checkExpirations // Prop recibida de App.jsx
}) {
  
  // Estados de Interfaz
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedTx, setSelectedTx] = useState(null);
  
  // Estados de Modal (Crear/Editar Socio)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [formData, setFormData] = useState({
    id: null,
    name: '',
    dni: '',
    phone: '',
    email: '',
    extraInfo: '',
    points: 0 
  });

  // Estado de Eliminación
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState(null);

  // --- MODO EDICIÓN EN DRAWER ---
  const [isDrawerEditMode, setIsDrawerEditMode] = useState(false);
  const [drawerFormData, setDrawerFormData] = useState({});

  useEffect(() => {
    if (selectedMember) {
      setIsDrawerEditMode(false);
      setDrawerFormData({});
    }
  }, [selectedMember]);

  // --- FILTRADO SEGURO (CORRECCIÓN PANTALLA BLANCA) ---
  const filteredMembers = (Array.isArray(members) ? members : []).filter((m) => {
    if (!m) return false;
    const term = searchTerm.toLowerCase();
    
    // Protección contra valores nulos (null/undefined)
    const name = m.name ? String(m.name).toLowerCase() : '';
    const number = m.memberNumber ? String(m.memberNumber) : '';
    const dni = m.dni ? String(m.dni) : '';
    const phone = m.phone ? String(m.phone) : '';
    const email = m.email ? String(m.email).toLowerCase() : '';

    return (
      name.includes(term) ||
      number.includes(term) ||
      dni.includes(term) ||
      phone.includes(term) ||
      email.includes(term)
    );
  });

  // --- HANDLERS ---
  const openCreateModal = () => {
    setModalMode('create');
    setFormData({ id: null, name: '', dni: '', phone: '', email: '', extraInfo: '', points: 0 });
    setIsModalOpen(true);
  };

  const openEditModal = (member) => {
    setModalMode('edit');
    setFormData({
      id: member.id,
      name: member.name || '',
      dni: member.dni || '',
      phone: member.phone || '',
      email: member.email || '',
      extraInfo: member.extraInfo || '',
      points: member.points || 0
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (modalMode === 'create') {
      addMember(formData);
    } else {
      updateMember(formData.id, formData);
      if (selectedMember && selectedMember.id === formData.id) {
         setSelectedMember({ ...selectedMember, ...formData });
      }
    }
    setIsModalOpen(false);
  };

  const handleDrawerEditSubmit = (e) => {
    e.preventDefault();
    updateMember(selectedMember.id, drawerFormData);
    setSelectedMember({ ...selectedMember, ...drawerFormData });
    setIsDrawerEditMode(false);
  };

  const startDrawerEdit = () => {
    setDrawerFormData({
      name: selectedMember.name || '',
      dni: selectedMember.dni || '',
      phone: selectedMember.phone || '',
      email: selectedMember.email || '',
      extraInfo: selectedMember.extraInfo || '',
      points: selectedMember.points || 0 
    });
    setIsDrawerEditMode(true);
  };

  const handleDeleteRequest = (member) => {
    setMemberToDelete(member);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (memberToDelete) {
      deleteMember(memberToDelete.id);
      setIsDeleteModalOpen(false);
      setMemberToDelete(null);
      if (selectedMember?.id === memberToDelete.id) {
        setSelectedMember(null);
      }
    }
  };

  const handleViewOrderDetails = (orderId) => {
    const transaction = transactions.find(t => String(t.id) === String(orderId));
    if (transaction) {
      setSelectedTx(transaction);
    } else {
      alert('La transacción no se encuentra en el historial activo.');
    }
  };

  const handlePrintPoints = () => {
    if (!selectedMember) return;
    
    const pointsTicketData = {
      isPointsTicket: true, 
      client: selectedMember,
      date: new Date().toLocaleDateString('es-AR'),
      time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      id: selectedMember.memberNumber 
    };

    if (onViewTicket) {
      onViewTicket(pointsTicketData);
    }
  };

  // --- AUDITORÍA: Forzar Vencimiento Real (6 Meses) ---
  const handleRunAudit = () => {
    if (window.confirm("🛡️ AUDITORÍA RETROACTIVA\n\nSe buscarán puntos con más de 6 meses de antigüedad en todo el historial y se eliminarán del saldo actual.\n\n¿Confirmar limpieza?")) {
      if (checkExpirations) {
        // Al llamar sin argumentos, usa el valor por defecto (6 meses)
        checkExpirations(); 
        alert("✅ Auditoría completada. Los saldos han sido actualizados.");
      }
    }
  };

  // --- FORMATTERS ---
  const formatMoney = (amount) => {
    return amount ? `$${Number(amount).toLocaleString('es-AR')}` : '-';
  };

  const formatTime24 = (isoDate) => {
    if (!isoDate) return '--:--';
    return new Date(isoDate).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }) + ' hs';
  };

  return (
    <div className="h-full flex flex-col relative bg-slate-50 p-6">
      
      {/* HEADER */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
           <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
             <User className="text-blue-600" /> Gestión de Socios
           </h1>
           <p className="text-sm text-gray-500 mt-1">Administra la base de datos de fidelización y puntos.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          
          {/* BOTONES DE CONTROL DE PUNTOS (Solo Admin) */}
          {checkExpirations && currentUser?.role === 'admin' && (
            <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                <button
                  onClick={handleRunAudit}
                  className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Auditoría Retroactiva (Limpiar puntos > 6 meses)"
                >
                  <ClipboardCheck size={20} />
                </button>
            </div>
          )}

          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por Nombre, N° Socio, DNI, Email..."
              className="w-full rounded-xl border border-gray-200 pl-10 p-2.5 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none shadow-sm transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={openCreateModal}
            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg transition-all active:scale-95"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Nuevo Socio</span>
          </button>
        </div>
      </div>

      {/* TABLA DE SOCIOS */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex-1 overflow-y-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50/50 border-b border-gray-100 sticky top-0 z-10 backdrop-blur-sm">
            <tr>
              <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider text-center">N° Socio</th>
              <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider">Nombre</th>
              <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider">Contacto</th>
              <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider text-center">Puntos</th>
              <th className="p-4 font-bold text-gray-500 text-xs uppercase tracking-wider text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredMembers.length > 0 ? (
              filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="p-4 text-center">
                    <span className="font-mono text-sm font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                      #{String(member.memberNumber || '0').padStart(4, '0')}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 flex items-center justify-center font-bold shadow-sm text-sm border border-white shrink-0">
                        {/* Renderizado Seguro: Evita crash si name es null */}
                        {(member.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate">{member.name || 'Sin Nombre'}</p>
                        {member.extraInfo && <p className="text-xs text-gray-400 truncate max-w-[200px]">{member.extraInfo}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="space-y-1">
                      {member.dni && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600" title="DNI">
                          <CreditCard size={12} className="text-gray-400" />
                          <span>{member.dni}</span>
                        </div>
                      )}
                      {member.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600" title="Teléfono">
                          <Phone size={12} className="text-gray-400" />
                          <span>{member.phone}</span>
                        </div>
                      )}
                      {member.email && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600" title="Email">
                          <Mail size={12} className="text-gray-400" />
                          <span className="truncate max-w-[150px]">{member.email}</span>
                        </div>
                      )}
                      {!member.dni && !member.phone && !member.email && (
                        <span className="text-xs text-gray-300 italic">Sin datos</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                      <Trophy size={12} />
                      {member.points || 0} pts
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setSelectedMember(member)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Ver Detalles e Historial"><History size={18} /></button>
                      <button onClick={() => openEditModal(member)} className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Editar Socio"><Edit2 size={18} /></button>
                      <button onClick={() => handleDeleteRequest(member)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar Socio"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="p-16 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center"><Search size={32} className="text-slate-300" /></div>
                    <p className="font-medium">No se encontraron socios</p>
                    {searchTerm && <p className="text-sm">Prueba con otro término de búsqueda.</p>}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- PANEL LATERAL (DRAWER) DE DETALLES --- */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm" onClick={() => setSelectedMember(null)}>
          <div 
            className="w-full max-w-lg h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-slate-50/50">
              <div>
                {!isDrawerEditMode ? (
                  <>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-2xl font-bold text-gray-900">{selectedMember.name || 'Sin Nombre'}</h2>
                      <span className="bg-slate-800 text-white text-xs font-mono py-0.5 px-2 rounded">
                        #{String(selectedMember.memberNumber || '0').padStart(4, '0')}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 space-y-0.5">
                      {selectedMember.dni && <p>DNI: {selectedMember.dni}</p>}
                      {selectedMember.phone && <p>Tel: {selectedMember.phone}</p>}
                      {selectedMember.email && <p>{selectedMember.email}</p>}
                    </div>
                  </>
                ) : (
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Edit2 size={20} /> Editando Socio</h2>
                )}
              </div>
              
              <div className="flex gap-2">
                {!isDrawerEditMode && (
                  <button 
                    onClick={startDrawerEdit}
                    className="p-2 bg-white border hover:bg-blue-50 hover:text-blue-600 rounded-full text-gray-500 transition-colors shadow-sm"
                    title="Editar Información"
                  >
                    <Edit2 size={18} />
                  </button>
                )}
                <button 
                  onClick={() => setSelectedMember(null)}
                  className="p-2 hover:bg-slate-200 rounded-full text-gray-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              
              {isDrawerEditMode ? (
                /* MODO EDICIÓN EN DRAWER */
                <form onSubmit={handleDrawerEditSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre Completo</label>
                    <input className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100" value={drawerFormData.name} onChange={e => setDrawerFormData({...drawerFormData, name: e.target.value})} required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">DNI</label><input className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100" value={drawerFormData.dni} onChange={e => setDrawerFormData({...drawerFormData, dni: e.target.value})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Teléfono</label><input className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100" value={drawerFormData.phone} onChange={e => setDrawerFormData({...drawerFormData, phone: e.target.value})} /></div>
                  </div>
                  <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Puntos (Ajuste Manual)</label><input type="number" className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100 font-bold text-blue-600" value={drawerFormData.points} onChange={e => setDrawerFormData({...drawerFormData, points: e.target.value})} /></div>
                  <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label><input className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100" value={drawerFormData.email} onChange={e => setDrawerFormData({...drawerFormData, email: e.target.value})} /></div>
                  <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notas</label><textarea rows="3" className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100 resize-none" value={drawerFormData.extraInfo} onChange={e => setDrawerFormData({...drawerFormData, extraInfo: e.target.value})} /></div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setIsDrawerEditMode(false)} className="flex-1 py-2.5 border rounded-lg font-bold text-gray-600 hover:bg-white">Cancelar</button>
                    <button type="submit" className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md">Guardar Cambios</button>
                  </div>
                </form>
              ) : (
                /* MODO VISTA */
                <>
                  {/* Tarjeta de Saldo */}
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg mb-4 relative overflow-hidden">
                    <div className="relative z-10">
                      <p className="text-blue-100 text-sm font-medium mb-1 uppercase tracking-wide">Saldo de Puntos</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black tracking-tight">{selectedMember.points || 0}</span>
                        <span className="text-lg font-medium opacity-80">Puntos.</span>
                      </div>
                    </div>
                    <div className="absolute right-0 top-0 opacity-10 transform translate-x-4 -translate-y-4"><User size={120} /></div>
                  </div>

                  {/* Botón Imprimir Ticket Puntos (NUEVO) */}
                  <button
                    onClick={handlePrintPoints}
                    className="w-full mb-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition shadow-lg flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Printer size={20} /> Imprimir Ticket de Puntos
                  </button>

                  {/* Historial Timeline */}
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                    <History size={16} className="text-blue-600" />
                    Historial de Movimientos
                  </h3>

                  <div className="space-y-4">
                    {selectedMember.history && selectedMember.history.length > 0 ? (
                      selectedMember.history.map((mov) => (
                        <div key={mov.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all">
                          <div className="flex justify-between items-start mb-3 border-b border-gray-50 pb-2">
                            <div>
                              <p className={`text-sm font-bold ${mov.type === 'earned' ? 'text-green-600' : mov.type === 'redeemed' ? 'text-orange-600' : 'text-red-600'}`}>
                                {mov.type === 'earned' ? (mov.concept || 'Compra Realizada') : mov.type === 'redeemed' ? (mov.concept || 'Canje de Puntos') : (mov.concept || 'Vencimiento')}
                              </p>
                              <p className="text-xs text-gray-400 font-medium">
                                {new Date(mov.date).toLocaleDateString()} • {formatTime24(mov.date)}
                              </p>
                            </div>
                            {mov.orderId && mov.orderId !== '---' && (
                              <div className="text-right">
                                <span className="text-[10px] text-gray-400 uppercase font-bold">N° Pedido</span>
                                <p className="text-xs font-mono font-bold text-gray-700">#{String(mov.orderId).padStart(6,'0')}</p>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-sm">
                              {mov.totalSale > 0 ? (
                                <div className="flex items-center gap-1.5 text-gray-600">
                                  <CreditCard size={14} className="text-gray-400" />
                                  <span>Monto: <span className="font-bold text-gray-900">{formatMoney(mov.totalSale)}</span></span>
                                </div>
                              ) : (
                                <div className="text-xs italic text-gray-400">
                                  {mov.type === 'expired' ? 'Caducidad automática' : 'Ajuste Manual'}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
                              <span className="text-gray-400 font-mono">{mov.prevPoints || 0}</span>
                              <span className="text-gray-300">→</span>
                              <span className={`font-bold ${mov.type === 'earned' ? 'text-green-600' : 'text-red-600'}`}>
                                {mov.type === 'earned' ? '+' : '-'}{mov.points}
                              </span>
                              <span className="text-gray-300">→</span>
                              <span className="font-bold text-gray-700 font-mono">{mov.newPoints}</span>
                            </div>
                          </div>
                          {mov.orderId && mov.orderId !== '---' && (
                            <button 
                              onClick={() => handleViewOrderDetails(mov.orderId)}
                              className="mt-3 w-full py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded flex items-center justify-center gap-2 transition-colors"
                            >
                              <FileText size={12} /> Ver Detalles del Pedido
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                        <p className="text-sm">Sin movimientos registrados</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DETALLES TRANSACCIÓN (COMPLETO) --- */}
      {selectedTx && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
              <h4 className="font-bold text-slate-800">
                Venta #{String(selectedTx.id).padStart(6, '0')}
              </h4>
              <button
                onClick={() => setSelectedTx(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400 text-xs">Fecha</p>
                  <p className="font-bold">
                    {selectedTx.date} {selectedTx.timestamp || selectedTx.time}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Usuario</p>
                  <p className="font-bold">{selectedTx.user}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Pago</p>
                  <p className="font-bold">{selectedTx.payment}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Total</p>
                  <p className="font-bold text-fuchsia-600">
                    ${selectedTx.total?.toLocaleString()}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-slate-400 text-xs mb-2">Productos</p>
                <div className="space-y-2">
                  {(selectedTx.items || []).map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center p-2 bg-slate-50 rounded"
                    >
                      <div>
                        <p className="font-medium text-sm">{item.title}</p>
                        <p className="text-xs text-slate-400">
                          {item.qty || item.quantity} x $
                          {item.price?.toLocaleString()}
                        </p>
                      </div>
                      <p className="font-bold text-sm">
                        $
                        {(
                          (item.qty || item.quantity) * item.price
                        ).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Acciones Modal */}
            <div className="p-4 border-t bg-slate-50 flex gap-2 justify-end">
                <button
                  onClick={() => {
                     if (onViewTicket) onViewTicket(selectedTx);
                  }}
                  className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border hover:bg-slate-50 rounded-lg transition flex items-center gap-2"
                >
                  <FileText size={14} /> Ticket
                </button>

                {currentUser?.role === 'admin' && selectedTx.status !== 'voided' && (
                  <button
                    onClick={() => {
                      setSelectedTx(null);
                      if (onEditTransaction) onEditTransaction(selectedTx);
                    }}
                    className="px-4 py-2 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition flex items-center gap-2"
                  >
                    <Edit2 size={14} /> Editar
                  </button>
                )}

                {currentUser?.role === 'admin' && selectedTx.status !== 'voided' && (
                  <button
                    onClick={() => {
                      setSelectedTx(null);
                      if (onDeleteTransaction) onDeleteTransaction(selectedTx);
                    }}
                    className="px-4 py-2 text-sm font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition flex items-center gap-2"
                  >
                    <XCircle size={14} /> Anular
                  </button>
                )}

                <button
                  onClick={() => setSelectedTx(null)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition"
                >
                  Cerrar
                </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL CREAR / EDITAR SOCIO (EXTERNO) --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg text-gray-800">{modalMode === 'create' ? 'Nuevo Socio' : 'Editar Socio'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre Completo *</label><input type="text" required className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-medium" placeholder="Ej: Juan Pérez" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} autoFocus /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">DNI</label><input type="text" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono text-sm" placeholder="Sin puntos" value={formData.dni} onChange={(e) => setFormData({...formData, dni: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Teléfono</label><input type="text" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono text-sm" placeholder="Cod. Área + Num" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} /></div>
              </div>
              
              {/* CAMPO PUNTOS (SOLO EDITAR O CREAR) */}
              <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Puntos (Ajuste Manual)</label><input type="number" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-bold text-blue-600" placeholder="0" value={formData.points} onChange={(e) => setFormData({...formData, points: e.target.value})} /></div>

              <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Correo Electrónico</label><input type="email" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm" placeholder="ejemplo@email.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} /></div>
              <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notas / Extra</label><textarea rows="2" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm resize-none" placeholder="Información adicional..." value={formData.extraInfo} onChange={(e) => setFormData({...formData, extraInfo: e.target.value})}></textarea></div>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-bold transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-bold shadow-md transition-colors flex justify-center items-center gap-2"><Save size={18} />{modalMode === 'create' ? 'Registrar Socio' : 'Guardar Cambios'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL CONFIRMAR ELIMINACIÓN --- */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle size={32} className="text-red-600" /></div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar Socio?</h3>
              <p className="text-gray-500 text-sm mb-6">Estás a punto de eliminar a <span className="font-bold text-gray-800">{memberToDelete?.name}</span>. <br/>Esta acción no se puede deshacer y se perderán sus puntos e historial.</p>
              <div className="flex gap-3">
                <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg font-bold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
                <button onClick={confirmDelete} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-md transition-colors">Sí, Eliminar</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}