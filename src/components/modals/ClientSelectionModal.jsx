// src/components/modals/ClientSelectionModal.jsx
// ♻️ REFACTOR: Extraído de AppModals.jsx — Modal de selección de socio (flujo multi-paso)

import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  CheckCircle,
  UserPlus,
  UserCheck,
  Users,
  ArrowRight,
} from 'lucide-react';

export const ClientSelectionModal = ({ isOpen, onClose, onSelectClient, clients = [], addClient, onCancelFlow }) => {
  if (!isOpen) return null;

  // Pasos del flujo: 'check-is-member' -> 'search' | 'check-want-join' -> 'create'
  const [step, setStep] = useState('check-is-member');
  const [searchTerm, setSearchTerm] = useState('');
  const [newMemberData, setNewMemberData] = useState({ name: '', dni: '', phone: '', email: '', extraInfo: '' });

  // Reset al cerrar o abrir
  useEffect(() => {
    if (isOpen) {
      setStep('check-is-member');
      setSearchTerm('');
      setNewMemberData({ name: '', dni: '', phone: '', email: '', extraInfo: '' });
    }
  }, [isOpen]);

  // Lógica de visualización de miembros:
  // Si hay búsqueda, filtra. Si NO hay búsqueda, muestra los primeros 5 (lista por defecto).
  const displayedMembers = searchTerm 
    ? clients.filter(m => {
        const term = searchTerm.toLowerCase();
        return (
          m.name.toLowerCase().includes(term) ||
          String(m.memberNumber).includes(term) ||
          (m.dni && m.dni.includes(term)) ||
          (m.phone && m.phone.includes(term)) ||
          (m.email && m.email.toLowerCase().includes(term))
        );
      }).slice(0, 5)
    : clients.slice(0, 5);

  const handleCreate = (e) => {
    e.preventDefault();
    if (newMemberData.name) {
      const newMember = addClient(newMemberData);
      if (newMember) {
        onSelectClient(newMember, 'earn');
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* HEADER */}
        <div className="p-4 border-b flex justify-between items-center bg-slate-50 shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Users size={20} className="text-blue-600" />
            {step === 'check-is-member' && 'Identificación de Socio'}
            {step === 'search' && 'Buscar Socio'}
            {step === 'check-want-join' && 'Nuevo Cliente'}
            {step === 'create' && 'Registrar Socio'}
          </h3>
          <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
        </div>

        <div className="p-6 overflow-y-auto">
          
          {/* PASO 1: ¿ES SOCIO? */}
          {step === 'check-is-member' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserCheck size={32} className="text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">¿El cliente es Socio?</h2>
              <p className="text-sm text-slate-500 mb-8">Verifica si el cliente ya está registrado para sumar puntos.</p>
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setStep('search')}
                  className="py-4 rounded-xl border-2 border-blue-600 bg-blue-600 text-white font-bold text-lg hover:bg-blue-700 transition-colors shadow-lg"
                >
                  SÍ
                </button>
                <button 
                  onClick={() => setStep('check-want-join')}
                  className="py-4 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-lg hover:border-slate-300 hover:bg-slate-50 transition-colors"
                >
                  NO
                </button>
              </div>
            </div>
          )}

          {/* PASO 2: BUSCADOR (Si es socio) */}
          {step === 'search' && (
            <div>
              <p className="text-sm text-slate-500 mb-3">Buscar por Nombre, DNI, Teléfono o N° Socio:</p>
              <div className="relative mb-4">
                <input 
                  autoFocus
                  type="text" 
                  className="w-full px-4 py-3 pl-10 border-2 border-slate-200 rounded-lg outline-none focus:border-blue-500 text-lg"
                  placeholder="Escriba para buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              </div>

              {/* Lista de Resultados */}
              <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                {displayedMembers.length === 0 ? (
                  <div className="text-center py-4 text-slate-400 bg-slate-50 rounded-lg border border-dashed">
                    {searchTerm ? 'No se encontraron socios.' : 'No hay socios registrados.'}
                  </div>
                ) : (
                  displayedMembers.map(member => (
                    <button
                      key={member.id}
                      onClick={() => {
                        onSelectClient(member, 'earn');
                        onClose();
                      }}
                      className="w-full text-left p-3 border rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all flex justify-between items-center group"
                    >
                      <div>
                        <p className="font-bold text-slate-800">{member.name}</p>
                        <p className="text-xs text-slate-500">
                          #{String(member.memberNumber).padStart(4,'0')} • {member.dni || member.phone || 'Sin datos'}
                        </p>
                      </div>
                      <div className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded">
                        {member.points} pts
                      </div>
                    </button>
                  ))
                )}
              </div>
              
              <button onClick={() => setStep('check-is-member')} className="text-xs text-slate-400 hover:text-slate-600 underline w-full text-center">Volver atrás</button>
            </div>
          )}

          {/* PASO 3: ¿QUIERE SER SOCIO? (Si no es socio) */}
          {step === 'check-want-join' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-fuchsia-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserPlus size={32} className="text-fuchsia-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">¿Quiere ser Socio?</h2>
              <p className="text-sm text-slate-500 mb-8">Registrarlo permite sumar puntos y acceder a beneficios.</p>
              
              <div className="space-y-3">
                <button 
                  onClick={() => setStep('create')}
                  className="w-full py-3 rounded-xl bg-fuchsia-600 text-white font-bold text-lg hover:bg-fuchsia-700 transition-colors shadow-md flex items-center justify-center gap-2"
                >
                  <CheckCircle size={20} /> Sí, Registrar Ahora
                </button>
                <button 
                  onClick={() => {
                    if (onCancelFlow) onCancelFlow();
                    onClose();
                  }}
                  className="w-full py-3 rounded-xl border border-slate-200 text-slate-500 font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                >
                  No, continuar compra <ArrowRight size={16} />
                </button>
              </div>
              <button onClick={() => setStep('check-is-member')} className="mt-6 text-xs text-slate-400 hover:text-slate-600 underline">Volver al inicio</button>
            </div>
          )}

          {/* PASO 4: FORMULARIO DE ALTA */}
          {step === 'create' && (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nombre Completo *</label>
                <input 
                  required 
                  type="text" 
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                  value={newMemberData.name} 
                  onChange={(e) => setNewMemberData({...newMemberData, name: e.target.value})} 
                  placeholder="Ej: Juan Pérez" 
                  autoFocus 
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">DNI (Opcional)</label>
                  <input 
                    type="text" 
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" 
                    value={newMemberData.dni} 
                    onChange={(e) => setNewMemberData({...newMemberData, dni: e.target.value})} 
                    placeholder="Solo números" 
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Teléfono (Opcional)</label>
                  <input 
                    type="text" 
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" 
                    value={newMemberData.phone} 
                    onChange={(e) => setNewMemberData({...newMemberData, phone: e.target.value})} 
                    placeholder="Cod + Num" 
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Email (Opcional)</label>
                <input 
                  type="email" 
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" 
                  value={newMemberData.email} 
                  onChange={(e) => setNewMemberData({...newMemberData, email: e.target.value})} 
                  placeholder="cliente@ejemplo.com" 
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setStep('check-want-join')} className="flex-1 py-3 border rounded-lg font-bold text-slate-500 hover:bg-slate-50">Volver</button>
                <button type="submit" className="flex-1 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-md">Guardar y Seleccionar</button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
