import React, { useState, useRef, useEffect } from 'react';
import {
  PartyPopper,
  LayoutDashboard,
  Package,
  ShoppingCart,
  History,
  LogOut,
  FileText,
  Tag,
} from 'lucide-react';

const SidebarButton = ({ onClick, isActive, icon: Icon, label }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <div className="relative group flex justify-center">
      <button
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all ${
          isActive
            ? 'bg-fuchsia-600 text-white shadow-md'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <Icon size={20} />
      </button>
      {showTooltip && (
        <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50 shadow-lg pointer-events-none">
          {label}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
        </div>
      )}
    </div>
  );
};

export default function Sidebar({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
}) {
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowAdminMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="w-16 bg-slate-900 flex flex-col items-center py-4 gap-4 z-40 shadow-xl relative">
      <div className="mb-2">
        <PartyPopper className="text-fuchsia-500" size={24} />
      </div>
      <nav className="flex-1 space-y-2 w-full flex flex-col items-center">
        <SidebarButton
          onClick={() => setActiveTab('dashboard')}
          isActive={activeTab === 'dashboard'}
          icon={LayoutDashboard}
          label="Caja"
        />
        <SidebarButton
          onClick={() => setActiveTab('inventory')}
          isActive={activeTab === 'inventory'}
          icon={Package}
          label="Stock"
        />
        <SidebarButton
          onClick={() => setActiveTab('pos')}
          isActive={activeTab === 'pos'}
          icon={ShoppingCart}
          label="Venta"
        />
        <SidebarButton
          onClick={() => setActiveTab('history')}
          isActive={activeTab === 'history'}
          icon={History}
          label="Historial"
        />
      </nav>

      <div
        className="pt-4 border-t border-slate-800 w-full flex flex-col items-center gap-3 relative"
        ref={menuRef}
      >
        {/* AVATAR COMO BOTÓN DE MENÚ */}
        <button
          onClick={() => {
            if (currentUser.role === 'admin') {
              setShowAdminMenu(!showAdminMenu);
            }
          }}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[10px] transition-transform hover:scale-110 ${
            currentUser.role === 'admin'
              ? 'bg-blue-600 cursor-pointer ring-2 ring-transparent hover:ring-blue-400'
              : 'bg-green-600 cursor-default'
          }`}
          title={currentUser.role === 'admin' ? 'Menú de Dueño' : 'Vendedor'}
        >
          {currentUser.avatar}
        </button>

        {/* MENÚ FLOTANTE DEL DUEÑO */}
        {showAdminMenu && currentUser.role === 'admin' && (
          <div className="absolute left-14 bottom-0 w-48 bg-white rounded-lg shadow-xl border border-slate-200 py-1 overflow-hidden z-50">
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-bold text-slate-700">Menú de Dueño</p>
            </div>
            <button
              onClick={() => {
                setActiveTab('logs');
                setShowAdminMenu(false);
              }}
              className="w-full text-left px-4 py-2.5 text-xs text-slate-600 hover:bg-fuchsia-50 hover:text-fuchsia-700 flex items-center gap-2"
            >
              <FileText size={14} /> Registro de Acciones
            </button>
            <button
              onClick={() => {
                setActiveTab('categories');
                setShowAdminMenu(false);
              }}
              className="w-full text-left px-4 py-2.5 text-xs text-slate-600 hover:bg-fuchsia-50 hover:text-fuchsia-700 flex items-center gap-2"
            >
              <Tag size={14} /> Gestión de Categorías
            </button>
          </div>
        )}

        <button
          onClick={onLogout}
          className="text-red-400 hover:text-red-300 p-2"
          title="Cerrar Sesión"
        >
          <LogOut size={20} />
        </button>
      </div>
    </div>
  );
}
