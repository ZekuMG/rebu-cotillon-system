import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  ClipboardList,
  FileBarChart,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Monitor,
  Package,
  Percent,
  Settings2,
  ShoppingCart,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import {
  getRoleLabel,
  hasOwnerAccess,
} from '../utils/appUsers';
import { canAccessTab } from '../utils/userPermissions';
import { hexToRgba, resolveUserPresentation } from '../utils/userPresentation';
import UserAvatar from './UserAvatar';

const SidebarButton = ({ onClick, isActive, icon: Icon, label, accentColor = '#c026d3' }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const activeStyle = isActive
    ? {
        backgroundColor: accentColor,
        color: '#ffffff',
        boxShadow: `0 10px 20px ${hexToRgba(accentColor, 0.28) || 'rgba(0,0,0,0.18)'}`,
      }
    : undefined;

  return (
    <div className="relative group flex justify-center">
      <button
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all ${
          isActive ? '' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
        style={activeStyle}
      >
        <Icon size={20} />
      </button>

      {showTooltip && (
        <div className="pointer-events-none absolute left-14 top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white shadow-lg">
          {label}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
        </div>
      )}
    </div>
  );
};

export default function Sidebar({ activeTab, setActiveTab, currentUser, onLogout }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);
  const currentUserPresentation = resolveUserPresentation(currentUser);
  const canUseAdminArea = hasOwnerAccess(currentUser);
  const canViewDashboard = canAccessTab(currentUser, 'dashboard');
  const canViewInventory = canAccessTab(currentUser, 'inventory');
  const canViewPos = canAccessTab(currentUser, 'pos');
  const canViewClients = canAccessTab(currentUser, 'clients');
  const canViewAgenda = canAccessTab(currentUser, 'agenda');
  const canViewOrders = canAccessTab(currentUser, 'orders');
  const canViewExtras = canAccessTab(currentUser, 'extras');
  const canViewReports = canAccessTab(currentUser, 'reports');
  const canViewLogs = canAccessTab(currentUser, 'logs');
  const canViewSessions = canAccessTab(currentUser, 'sessions');
  const canViewBulkEditor = canAccessTab(currentUser, 'bulk-editor');
  const canManageUsers = canAccessTab(currentUser, 'user-management');
  const navAccentColor = currentUserPresentation?.nameColor || '#c026d3';

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative z-40 flex w-16 flex-col items-center gap-4 bg-slate-900 py-4 shadow-xl">
      <div className="mb-2">
        <img
          src="/rebu-logo.png"
          alt="Rebu"
          className="h-10 w-10 rounded-xl object-contain drop-shadow-[0_4px_12px_rgba(236,72,153,0.35)]"
        />
      </div>

      <nav className="flex w-full flex-1 flex-col items-center space-y-2">
        {canViewDashboard && <SidebarButton onClick={() => setActiveTab('dashboard')} isActive={activeTab === 'dashboard'} icon={LayoutDashboard} label="Control de Caja" accentColor={navAccentColor} />}
        {canViewInventory && <SidebarButton onClick={() => setActiveTab('inventory')} isActive={activeTab === 'inventory'} icon={Package} label="Inventario" accentColor={navAccentColor} />}
        {canViewPos && <SidebarButton onClick={() => setActiveTab('pos')} isActive={activeTab === 'pos'} icon={ShoppingCart} label="Punto de Venta" accentColor={navAccentColor} />}
        {canViewClients && <SidebarButton onClick={() => setActiveTab('clients')} isActive={activeTab === 'clients'} icon={Users} label="Socios" accentColor={navAccentColor} />}
        {canViewAgenda && <SidebarButton onClick={() => setActiveTab('agenda')} isActive={activeTab === 'agenda'} icon={Building2} label="Agenda" accentColor={navAccentColor} />}
        {canViewOrders && <SidebarButton onClick={() => setActiveTab('orders')} isActive={activeTab === 'orders'} icon={ClipboardList} label="Pedidos" accentColor={navAccentColor} />}
        {canViewExtras && <SidebarButton onClick={() => setActiveTab('extras')} isActive={activeTab === 'extras'} icon={Settings2} label="Extras" accentColor={navAccentColor} />}
      </nav>

      <div className="flex w-full flex-col items-center gap-2 pb-1">
        {canViewReports && (
          <SidebarButton
            onClick={() => setActiveTab('reports')}
            isActive={activeTab === 'reports'}
            icon={FileBarChart}
            label="Reportes de Caja"
            accentColor={navAccentColor}
          />
        )}
        {canAccessTab(currentUser, 'history') && <SidebarButton
          onClick={() => setActiveTab('history')}
          isActive={activeTab === 'history'}
          icon={History}
          label="Historial de Ventas"
          accentColor={navAccentColor}
        />}
      </div>

      <div className="relative flex w-full flex-col items-center gap-3 border-t border-slate-800 pt-4" ref={menuRef}>
        <button
          onClick={() => setShowUserMenu((prev) => !prev)}
          className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white transition-transform hover:scale-110 ${
            canUseAdminArea
              ? 'bg-blue-600 ring-2 ring-transparent hover:ring-blue-400'
              : 'bg-green-600 ring-2 ring-transparent hover:ring-green-400'
          }`}
          title="Menú de usuario"
          style={{
            color: '#ffffff',
            backgroundColor: currentUserPresentation?.nameColor || (canUseAdminArea ? '#2563eb' : '#16a34a'),
          }}
        >
          <UserAvatar
            avatar={currentUserPresentation?.avatar || currentUser?.avatar}
            name={currentUserPresentation?.displayName || currentUser?.name}
            color={currentUserPresentation?.nameColor || (canUseAdminArea ? '#2563eb' : '#16a34a')}
            sizeClass="h-8 w-8"
            textClass="text-[10px]"
          />
        </button>

        {showUserMenu && (
          <div className="absolute bottom-0 left-14 z-50 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-xs font-bold text-slate-700">Menú de usuario</p>
              <div className="mt-1 flex items-center gap-2">
                <UserAvatar
                  avatar={currentUserPresentation?.avatar || currentUser?.avatar}
                  name={currentUserPresentation?.displayName || currentUser?.name}
                  color={currentUserPresentation?.nameColor || '#334155'}
                  sizeClass="h-6 w-6"
                  textClass="text-[9px]"
                />
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-black" style={currentUserPresentation?.textStyle}>
                    {currentUserPresentation?.displayName || currentUser?.name}
                  </p>
                  <p className="text-[10px] font-semibold text-slate-400">
                    {getRoleLabel(currentUser?.role)}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setActiveTab('settings');
                setShowUserMenu(false);
              }}
              className="flex w-full items-center gap-2 border-b border-slate-50 px-4 py-2.5 text-left text-xs text-slate-600 transition-colors hover:bg-fuchsia-50 hover:text-fuchsia-700"
            >
              <SlidersHorizontal size={14} /> Ajustes
            </button>

            {canManageUsers && (
              <button
                onClick={() => {
                  setActiveTab('user-management');
                  setShowUserMenu(false);
                }}
                className="flex w-full items-center gap-2 border-b border-slate-50 px-4 py-2.5 text-left text-xs text-slate-600 transition-colors hover:bg-fuchsia-50 hover:text-fuchsia-700"
              >
                <Users size={14} /> Gestión de usuarios
              </button>
            )}

            {canViewLogs && (
              <>
                <button
                  onClick={() => {
                    setActiveTab('logs');
                    setShowUserMenu(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-slate-600 transition-colors hover:bg-fuchsia-50 hover:text-fuchsia-700"
                >
                  <FileText size={14} /> Registro de Acciones
                </button>
              </>
            )}
            {canViewSessions && (
              <>
                <button
                  onClick={() => {
                    setActiveTab('sessions');
                    setShowUserMenu(false);
                  }}
                  className="flex w-full items-center gap-2 border-t border-slate-50 px-4 py-2.5 text-left text-xs text-slate-600 transition-colors hover:bg-fuchsia-50 hover:text-fuchsia-700"
                >
                  <Monitor size={14} /> Gestor de Sesiones
                </button>
              </>
            )}
            {canViewBulkEditor && (
              <>
                <button
                  onClick={() => {
                    setActiveTab('bulk-editor');
                    setShowUserMenu(false);
                  }}
                  className="flex w-full items-center gap-2 border-t border-slate-50 px-4 py-2.5 text-left text-xs text-slate-600 transition-colors hover:bg-fuchsia-50 hover:text-fuchsia-700"
                >
                  <Percent size={14} /> Productos (Avanzado)
                </button>
              </>
            )}
          </div>
        )}

        <button onClick={onLogout} className="p-2 text-red-400 hover:text-red-300" title="Cerrar sesión">
          <LogOut size={20} />
        </button>
      </div>
    </div>
  );
}
