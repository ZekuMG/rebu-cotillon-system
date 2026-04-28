import React, { useState, useEffect, useMemo } from 'react';
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
  ClipboardCheck,
  CalendarDays, 
  Clock, 
  ArrowUpDown 
} from 'lucide-react';
import { formatNumber, isTestRecord } from '../utils/helpers'; // ✨ Importado isTestRecord
import AsyncActionButton from '../components/AsyncActionButton';
import { FancyPrice } from '../components/FancyPrice';
import { hasPermission } from '../utils/userPermissions';
import useIncrementalFeed from '../hooks/useIncrementalFeed';
import usePendingAction from '../hooks/usePendingAction';

const sanitizeOptionalMemberField = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const sanitizeMemberFormData = (data = {}) => ({
  ...data,
  name: String(data.name || '').trim(),
  dni: sanitizeOptionalMemberField(data.dni),
  phone: sanitizeOptionalMemberField(data.phone),
  email: sanitizeOptionalMemberField(data.email),
  extraInfo: sanitizeOptionalMemberField(data.extraInfo),
  points: Number(data.points) || 0,
});

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
  checkExpirations 
}) {
  
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date_added_desc'); 

  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedTx, setSelectedTx] = useState(null);
  const canCreateClients = hasPermission(currentUser, 'clients.create');
  const canEditClients = hasPermission(currentUser, 'clients.edit');
  const canDeleteClients = hasPermission(currentUser, 'clients.delete');
  const canAuditClients = canEditClients;
  const canEditSales = hasPermission(currentUser, 'history.editSale');
  const canVoidSales = hasPermission(currentUser, 'history.voidSale');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [formData, setFormData] = useState({ id: null, name: '', dni: '', phone: '', email: '', extraInfo: '', points: 0 });

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState(null);

  const [isDrawerEditMode, setIsDrawerEditMode] = useState(false);
  const [drawerFormData, setDrawerFormData] = useState({});
  const { isPending, runAction } = usePendingAction();

  const formatShortDate = (isoString) => {
    if (!isoString) return '--/--/----';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch {
      return '--/--/----';
    }
  };

  const getLastPurchaseDate = (member) => {
    if (!member || !transactions || transactions.length === 0) return null;
    
    const memberTx = transactions.filter(tx => 
      tx.status !== 'voided' && 
      tx.client && 
      (String(tx.client.id) === String(member.id) || String(tx.client.memberNumber) === String(member.memberNumber))
    );

    if (memberTx.length === 0) return null;

    memberTx.sort((a, b) => {
       const parseDate = (dStr) => {
         if (!dStr) return 0;
         if (dStr.includes('/')) {
           const [day, month, year] = dStr.split('/');
           return new Date(`${year}-${month}-${day}`).getTime();
         }
         return new Date(dStr).getTime();
       };
       return parseDate(b.date) - parseDate(a.date);
    });

    return memberTx[0].date;
  };

  const extractCouponCodeFromItem = (item) => {
    const title = String(item?.title || '');
    const description = String(item?.description || '');
    const couponMatch =
      title.match(/cup[oó]n\s+([a-z0-9_-]+)/i) ||
      description.match(/cup[oó]n\s+([a-z0-9_-]+)/i);

    return couponMatch ? String(couponMatch[1]).trim().toUpperCase() : '';
  };

  const getMemberCoupons = (member) => {
    if (!member) return [];

    return transactions
      .filter((tx) =>
        tx.status !== 'voided' &&
        tx.client &&
        (String(tx.client.id) === String(member.id) || String(tx.client.memberNumber) === String(member.memberNumber))
      )
      .flatMap((tx) =>
        (tx.items || [])
          .map((item) => {
            const code = extractCouponCodeFromItem(item);
            if (!code) return null;

            return {
              id: `${tx.id}-${code}`,
              code,
              date: tx.date || '--/--/--',
              time: tx.time || tx.timestamp || '--:--',
              orderId: tx.id,
              amount: Math.abs(Number(item.price || 0) * Number(item.qty || item.quantity || 1)),
              title: item.title || 'Cupón',
            };
          })
          .filter(Boolean)
      )
      .sort((a, b) => {
        const parseDateTime = (dStr, tStr) => {
          if (!dStr || dStr === '--/--/--') return 0;
          if (dStr.includes('/')) {
            const [day, month, year] = dStr.split('/');
            const fullYear = year.length === 2 ? `20${year}` : year;
            const timePart = tStr ? tStr.split(' ')[0] : '00:00:00';
            return new Date(`${fullYear}-${month}-${day}T${timePart}`).getTime();
          }
          return new Date(dStr).getTime();
        };
        return parseDateTime(b.date, b.time) - parseDateTime(a.date, a.time);
      });
  };

  const getMemberHistory = (member) => {
    if (!member) return [];

    const parseDateTime = (dStr, tStr) => {
      if (!dStr || dStr === '--/--/--') return 0;
      if (dStr.includes('/')) {
        const [day, month, year] = dStr.split('/');
        const fullYear = year.length === 2 ? `20${year}` : year;
        const timePart = tStr ? tStr.split(' ')[0] : '00:00:00';
        return new Date(`${fullYear}-${month}-${day}T${timePart}`).getTime();
      }
      return new Date(dStr).getTime();
    };

    const memberSales = transactions.filter(tx => {
      if (!tx.client) return false;
      if (tx.status === 'voided' || tx.status === 'deleted') return false;
      return String(tx.client.id) === String(member.id) || 
             String(tx.client.memberNumber) === String(member.memberNumber);
    });

    const normalizedHistory = memberSales
      .map((tx) => {
        const earnedPoints = Number(tx.pointsEarned || 0);
        const spentPoints = Number(tx.pointsSpent || 0);
        const signedDiff = earnedPoints - spentPoints;
        const isRedemption = spentPoints > 0;

        return {
          id: tx.id,
          orderId: tx.id,
          date: tx.date || '--/--/--',
          time: tx.time || tx.timestamp || '--:--',
          type: isRedemption ? 'redeemed' : 'earned',
          concept: isRedemption ? 'Canje en Compra' : 'Compra Regular',
          totalSale: tx.total,
          points: isRedemption ? spentPoints : earnedPoints,
          signedDiff,
        };
      })
      .sort((a, b) => parseDateTime(a.date, a.time) - parseDateTime(b.date, b.time));

    const startingPoints =
      Number(member.points || 0) -
      normalizedHistory.reduce((acc, movement) => acc + movement.signedDiff, 0);

    let runningPoints = startingPoints;

    const historyWithTotals = normalizedHistory.map((movement) => {
      const prevPoints = runningPoints;
      const newPoints = prevPoints + movement.signedDiff;
      runningPoints = newPoints;

      return {
        ...movement,
        prevPoints,
        newPoints,
      };
    });

    return historyWithTotals.sort((a, b) => parseDateTime(b.date, b.time) - parseDateTime(a.date, a.time));
  };

  useEffect(() => {
    if (selectedMember) {
      setIsDrawerEditMode(false);
      setDrawerFormData({});
    }
  }, [selectedMember]);

  const sortedMembers = useMemo(() => {
    // ✨ 1. Evaluamos si el usuario busca test explícitamente
    const isSearchTest = searchTerm.toLowerCase().includes('test');

    let result = (Array.isArray(members) ? members : []).filter((m) => {
      if (!m) return false;
      
      // ✨ LIMPIEZA DE TEST: Si el socio tiene palabra "test" y no lo buscan, no aparece
      const isTest = isTestRecord(m);
      if (isTest && !isSearchTest) return false;

      const term = searchTerm.toLowerCase();
      const name = m.name ? String(m.name).toLowerCase() : '';
      const number = m.memberNumber ? String(m.memberNumber) : '';
      const dni = m.dni ? String(m.dni) : '';
      const phone = m.phone ? String(m.phone) : '';
      const email = m.email ? String(m.email).toLowerCase() : '';

      return name.includes(term) || number.includes(term) || dni.includes(term) || phone.includes(term) || email.includes(term);
    });

    const getMs = (dateStr) => {
      if (!dateStr || dateStr === '--/--/----' || dateStr === '--/--/--') return 0;
      if (dateStr.includes('T')) return new Date(dateStr).getTime();
      if (dateStr.includes('/')) {
          const [day, month, year] = dateStr.split('/');
          const fullYear = year.length === 2 ? `20${year}` : year;
          return new Date(`${fullYear}-${month}-${day}`).getTime();
      }
      return new Date(dateStr).getTime() || 0;
    };

    result.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc': return (a.name || '').localeCompare(b.name || '');
        case 'id_desc': return Number(b.memberNumber || 0) - Number(a.memberNumber || 0);
        case 'id_asc': return Number(a.memberNumber || 0) - Number(b.memberNumber || 0);
        case 'points_desc': return Number(b.points || 0) - Number(a.points || 0);
        case 'points_asc': return Number(a.points || 0) - Number(b.points || 0);
        case 'date_added_desc': return getMs(b.created_at || b.createdAt) - getMs(a.created_at || a.createdAt);
        case 'date_added_asc': return getMs(a.created_at || a.createdAt) - getMs(b.created_at || b.createdAt);
        case 'last_purchase_desc': return getMs(getLastPurchaseDate(b)) - getMs(getLastPurchaseDate(a));
        default: return 0;
      }
    });

    return result;
  }, [members, searchTerm, sortBy, transactions]);

  const visibleMembersCount = useMemo(() => {
    const isSearchTest = searchTerm.toLowerCase().includes('test');
    return (Array.isArray(members) ? members : []).filter((member) => {
      if (!member) return false;
      const isTest = isTestRecord(member);
      if (isTest && !isSearchTest) return false;
      return true;
    }).length;
  }, [members, searchTerm]);
  const visibleMembersFeed = useIncrementalFeed(sortedMembers, {
    resetKey: `${searchTerm}|${sortBy}|${sortedMembers.length}`,
  });

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    await runAction(`member-form:${modalMode}`, async () => {
      const cleanData = sanitizeMemberFormData(formData);
      if (!cleanData.name) return;

      if (modalMode === 'create') {
        await addMember(cleanData);
      } else {
        await updateMember(formData.id, cleanData);
        if (selectedMember && selectedMember.id === formData.id) {
           setSelectedMember({ ...selectedMember, ...cleanData });
        }
      }
      setIsModalOpen(false);
    });
  };

  const handleDrawerEditSubmit = async (e) => {
    e.preventDefault();
    // 🔧 Convertir points a número antes de enviar
    await runAction(`member-drawer:${selectedMember?.id || 'unknown'}`, async () => {
      const cleanData = sanitizeMemberFormData(drawerFormData);
      await updateMember(selectedMember.id, cleanData);
      setSelectedMember({ ...selectedMember, ...cleanData });
      setIsDrawerEditMode(false);
    });
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

  const confirmDelete = async () => {
    if (memberToDelete) {
      await runAction(`delete-member:${memberToDelete.id}`, async () => {
        await deleteMember(memberToDelete.id);
        setIsDeleteModalOpen(false);
        setMemberToDelete(null);
        if (selectedMember?.id === memberToDelete.id) {
          setSelectedMember(null);
        }
      });
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

  const handleRunAudit = async () => {
    if (window.confirm("🛡️ AUDITORÍA RETROACTIVA\n\nSe buscarán puntos con más de 6 meses de antigüedad en todo el historial y se eliminarán del saldo actual.\n\n¿Confirmar limpieza?")) {
      if (checkExpirations) {
        await runAction('clients-audit', async () => {
          await checkExpirations();
        }); 
        alert("✅ Auditoría completada. Los saldos han sido actualizados.");
      }
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col relative overflow-hidden bg-slate-50 p-4">
      
      {/* HEADER COMPACTO */}
      <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 mb-3 flex flex-wrap items-center justify-between gap-2 shrink-0 z-10">
        
        <div className="flex items-center flex-1 min-w-0 gap-2">
          
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por Nombre, N° Socio, DNI, Email..."
              className="w-full rounded-md border border-slate-200 pl-9 pr-3 py-1.5 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm font-bold transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="inline-flex h-[34px] items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 shadow-sm shrink-0">
            <span className="text-xs font-black uppercase tracking-[0.06em] leading-none text-slate-500">Socios</span>
            <span className="text-sm font-black leading-none text-slate-700">
              {sortedMembers.length}
              {sortedMembers.length !== visibleMembersCount && (
                <span className="font-semibold text-slate-400"> / {visibleMembersCount}</span>
              )}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          
          <div className="relative">
            <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-white text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 cursor-pointer appearance-none shadow-sm transition-all"
            >
              <optgroup label="Fechas">
                <option value="date_added_desc">Más Nuevos</option>
                <option value="date_added_asc">Más Antiguos</option>
                <option value="last_purchase_desc">Última Compra</option>
              </optgroup>
              <optgroup label="Puntos">
                <option value="points_desc">Mayor Saldo Puntos</option>
                <option value="points_asc">Menor Saldo Puntos</option>
              </optgroup>
              <optgroup label="Identificación">
                <option value="name_asc">Nombre (A-Z)</option>
                <option value="id_asc">N° Socio (Ascendente)</option>
                <option value="id_desc">N° Socio (Descendente)</option>
              </optgroup>
            </select>
          </div>

          {checkExpirations && canAuditClients && (
            <AsyncActionButton
              onAction={handleRunAudit}
              pending={isPending('clients-audit')}
              loadingLabel="Auditando..."
              className="py-1.5 px-3 text-slate-600 bg-white border border-slate-200 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              title="Auditoría Retroactiva (Limpiar puntos > 6 meses)"
            >
              <ClipboardCheck size={16} />
              <span className="hidden md:inline text-xs font-bold">Auditoría</span>
            </AsyncActionButton>
          )}

          {canCreateClients && <button
            onClick={openCreateModal}
            className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 rounded-lg flex items-center gap-1.5 font-bold shadow-md transition-all active:scale-95 text-xs uppercase tracking-wide"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Nuevo Socio</span>
          </button>}
        </div>
      </div>

      
      {/* TABLA DE SOCIOS */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex-1 min-h-0 overflow-y-auto" onScroll={visibleMembersFeed.handleScroll}>
        <table className="w-full text-left">
          <thead className="bg-gray-50/50 border-b border-gray-100 sticky top-0 z-10 backdrop-blur-sm">
            <tr>
                <th className="px-4 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider text-center">N° Socio</th>
                <th className="px-4 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider">Contacto</th>
                <th className="px-4 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider hidden lg:table-cell">Actividad</th>
                <th className="px-4 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider text-center">Puntos</th>
                <th className="px-4 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedMembers.length > 0 ? (
              visibleMembersFeed.visibleItems.map((member) => {
                const lastPurchase = getLastPurchaseDate(member);

                return (
                  <tr key={member.id} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="px-4 py-3 text-center">
                          <span className="font-mono text-sm font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                            #{String(member.memberNumber || '0').padStart(4, '0')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 flex items-center justify-center font-bold shadow-sm text-sm border border-white shrink-0">
                              {(member.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 truncate">{member.name || 'Sin Nombre'}</p>
                              {member.extraInfo && <p className="text-xs text-gray-400 truncate max-w-[200px]">{member.extraInfo}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
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
                        
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-xs text-slate-500" title="Fecha de Adición">
                              <CalendarDays size={13} className="text-slate-400" />
                              <span>Socio desde: <span className="font-medium text-slate-700">{formatShortDate(member.created_at || member.createdAt)}</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500" title="Última Compra">
                          <Clock size={13} className="text-slate-400" />
                          {lastPurchase ? (
                            <span>Últ. Compra: <span className="font-medium text-slate-700">{lastPurchase}</span></span>
                          ) : (
                            <span className="font-medium text-slate-400 italic">No registra compras</span>
                          )}
                        </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                            <Trophy size={12} />
                            {formatNumber(member.points || 0)} pts
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setSelectedMember(member)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Ver Detalles e Historial"><History size={16} /></button>
                            {canEditClients && <button onClick={() => openEditModal(member)} className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Editar Socio"><Edit2 size={16} /></button>}
                            {canDeleteClients && <button onClick={() => handleDeleteRequest(member)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar Socio"><Trash2 size={16} /></button>}
                          </div>
                        </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="6" className="p-16 text-center text-gray-400">
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
        {sortedMembers.length > 0 && (
          <div className="border-t border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold text-slate-500">
            Mostrando <span className="font-black text-slate-700">{visibleMembersFeed.visibleCount}</span> de <span className="font-black text-slate-700">{sortedMembers.length}</span> socios
          </div>
        )}
      </div>

      {/* --- PANEL LATERAL (DRAWER) DE DETALLES --- */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm" onClick={() => setSelectedMember(null)}>
          <div 
            className="w-full max-w-lg h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300" 
            onClick={(e) => e.stopPropagation()}
          >
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
                      {(selectedMember.created_at || selectedMember.createdAt) && <p className="text-xs mt-1 text-slate-400">Socio desde: {formatShortDate(selectedMember.created_at || selectedMember.createdAt)}</p>}
                    </div>
                  </>
                ) : (
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Edit2 size={20} /> Editando Socio</h2>
                )}
              </div>
              
              <div className="flex gap-2">
                {!isDrawerEditMode && canEditClients && (
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

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              
              {isDrawerEditMode ? (
                <form onSubmit={handleDrawerEditSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre Completo</label>
                    <input className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100" value={drawerFormData.name} onChange={e => setDrawerFormData({...drawerFormData, name: e.target.value})} required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">DNI</label><input className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100" value={drawerFormData.dni} onChange={e => setDrawerFormData({...drawerFormData, dni: e.target.value})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Teléfono</label><input className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100" value={drawerFormData.phone} onChange={e => setDrawerFormData({...drawerFormData, phone: e.target.value})} /></div>
                  </div>
                  <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Puntos (Ajuste Manual)</label><input type="number" className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100 font-bold text-blue-600" value={drawerFormData.points} onChange={e => setDrawerFormData({...drawerFormData, points: Number(e.target.value) || 0})} /></div>
                  <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label><input className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100" value={drawerFormData.email} onChange={e => setDrawerFormData({...drawerFormData, email: e.target.value})} /></div>
                  <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notas</label><textarea rows="3" className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100 resize-none" value={drawerFormData.extraInfo} onChange={e => setDrawerFormData({...drawerFormData, extraInfo: e.target.value})} /></div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setIsDrawerEditMode(false)} className="flex-1 py-2.5 border rounded-lg font-bold text-gray-600 hover:bg-white">Cancelar</button>
                    <AsyncActionButton type="submit" pending={isPending(`member-drawer:${selectedMember?.id || 'unknown'}`)} loadingLabel="Guardando..." className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md disabled:opacity-60 disabled:cursor-wait">Guardar Cambios</AsyncActionButton>
                  </div>
                </form>
              ) : (
                <>
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg mb-4 relative overflow-hidden">
                    <div className="relative z-10">
                      <p className="text-blue-100 text-sm font-medium mb-1 uppercase tracking-wide">Saldo de Puntos</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black tracking-tight">{formatNumber(selectedMember.points || 0)}</span>
                        <span className="text-lg font-medium opacity-80">Puntos.</span>
                      </div>
                    </div>
                    <div className="absolute right-0 top-0 opacity-10 transform translate-x-4 -translate-y-4"><User size={120} /></div>
                  </div>

                  <button
                    onClick={handlePrintPoints}
                    className="w-full mb-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition shadow-lg flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Printer size={20} /> Imprimir Ticket de Puntos
                  </button>

                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                    <FileText size={16} className="text-emerald-600" />
                    Códigos y Cupones Usados
                  </h3>

                  <div className="space-y-3 mb-6">
                    {getMemberCoupons(selectedMember).length > 0 ? (
                      getMemberCoupons(selectedMember).map((coupon) => (
                        <div key={coupon.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-emerald-700 truncate">{coupon.code}</p>
                              <p className="mt-1 text-xs font-medium text-slate-500 truncate">{coupon.title}</p>
                              <p className="mt-1 text-xs text-gray-400">
                                {coupon.date} • {String(coupon.time).replace(/hs/ig, '').trim().slice(0, 5)} hs
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Descuento aplicado</p>
                              <p className="mt-1 text-sm font-black text-emerald-600"><FancyPrice amount={coupon.amount} /></p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleViewOrderDetails(coupon.orderId)}
                            className="mt-3 w-full py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded flex items-center justify-center gap-2 transition-colors"
                          >
                            <FileText size={12} /> Ver venta donde se usó
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                        <p className="text-sm">No registra códigos o cupones utilizados</p>
                      </div>
                    )}
                  </div>

                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                    <History size={16} className="text-blue-600" />
                    Historial de Movimientos
                  </h3>

                  <div className="space-y-4">
                    {getMemberHistory(selectedMember).length > 0 ? (
                        getMemberHistory(selectedMember).map((mov) => (
                        <div key={mov.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all">
                          <div className="flex justify-between items-start mb-3 border-b border-gray-50 pb-2">
                            <div>
                              <p className={`text-sm font-bold ${mov.type === 'earned' ? 'text-green-600' : mov.type === 'redeemed' ? 'text-orange-600' : 'text-red-600'}`}>
                                {mov.type === 'earned' ? (mov.concept || 'Compra Realizada') : mov.type === 'redeemed' ? (mov.concept || 'Canje de Puntos') : (mov.concept || 'Vencimiento')}
                              </p>
                              <p className="text-xs text-gray-400 font-medium mt-0.5">
                                {mov.date} • {mov.time.replace(/hs/ig, '').trim().slice(0, 5)} hs
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
                                  <span className="flex items-center gap-1">Monto: <span className="font-bold text-gray-900"><FancyPrice amount={mov.totalSale} /></span></span>
                                </div>
                              ) : (
                                <div className="text-xs italic text-gray-400">
                                  {mov.type === 'expired' ? 'Caducidad automática' : 'Ajuste Manual'}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
                              <span className="text-gray-400 font-mono">{formatNumber(mov.prevPoints || 0)}</span>
                              <span className="text-gray-300">→</span>
                              <span className={`font-bold ${mov.type === 'earned' ? 'text-green-600' : 'text-red-600'}`}>
                                {mov.type === 'earned' ? '+' : '-'}{formatNumber(mov.points)}
                              </span>
                              <span className="text-gray-300">→</span>
                              <span className="font-bold text-gray-700 font-mono">{formatNumber(mov.newPoints)}</span>
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

      {/* --- MODAL DETALLES TRANSACCIÓN --- */}
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
                    <FancyPrice amount={selectedTx.total} />
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
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          {formatNumber(item.qty || item.quantity, item.qty % 1 !== 0 ? 2 : 0)} x <FancyPrice amount={item.price} />
                        </p>
                      </div>
                      <p className="font-bold text-sm">
                        <FancyPrice amount={(item.qty || item.quantity) * item.price} />
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50 flex gap-2 justify-end">
                <button
                  onClick={() => {
                     if (onViewTicket) onViewTicket(selectedTx);
                  }}
                  className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border hover:bg-slate-50 rounded-lg transition flex items-center gap-2"
                >
                  <FileText size={14} /> Ticket
                </button>

                {canEditSales && selectedTx.status !== 'voided' && (
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

                {canVoidSales && selectedTx.status !== 'voided' && (
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

      {/* --- MODAL CREAR / EDITAR SOCIO --- */}
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
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">DNI <span className="text-[9px] font-normal lowercase">(Opcional)</span></label>
                  <input type="text" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono text-sm" placeholder="Sin puntos" value={formData.dni} onChange={(e) => setFormData({...formData, dni: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Teléfono <span className="text-[9px] font-normal lowercase">(Opcional)</span></label>
                  <input type="text" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono text-sm" placeholder="Cod. Área + Num" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                </div>
              </div>    
                        
              <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Puntos (Ajuste Manual)</label><input type="number" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-bold text-blue-600" placeholder="0" value={formData.points} onChange={(e) => setFormData({...formData, points: e.target.value})} /></div>

              <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Correo Electrónico</label><input type="email" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm" placeholder="ejemplo@email.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} /></div>
              <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notas / Extra</label><textarea rows="2" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm resize-none" placeholder="Información adicional..." value={formData.extraInfo} onChange={(e) => setFormData({...formData, extraInfo: e.target.value})}></textarea></div>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-bold transition-colors">Cancelar</button>
                <AsyncActionButton type="submit" pending={isPending(`member-form:${modalMode}`)} loadingLabel="Guardando..." className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-bold shadow-md transition-colors flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-wait"><Save size={18} />{modalMode === 'create' ? 'Registrar Socio' : 'Guardar Cambios'}</AsyncActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL CONFIRMAR ELIMINACIÓN --- */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle size={32} className="text-red-600" /></div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar Socio?</h3>
              <p className="text-gray-500 text-sm mb-6">Estás a punto de eliminar a <span className="font-bold text-gray-800">{memberToDelete?.name}</span>. <br/>Esta acción no se puede deshacer y se perderán sus puntos e historial.</p>
              <div className="flex gap-3">
                <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg font-bold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
                <AsyncActionButton onAction={confirmDelete} pending={isPending(`delete-member:${memberToDelete?.id || 'unknown'}`)} loadingLabel="Eliminando..." className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-md transition-colors disabled:opacity-60 disabled:cursor-wait">Sí, Eliminar</AsyncActionButton>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
