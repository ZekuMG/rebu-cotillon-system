import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Building2,
  ClipboardList,
  FileBarChart,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Package,
  Percent,
  Settings2,
  ShoppingCart,
  SlidersHorizontal,
  Sun,
  Users,
} from 'lucide-react';
import {
  getRoleLabel,
  hasOwnerAccess,
} from '../utils/appUsers';
import { canAccessTab } from '../utils/userPermissions';
import { hexToRgba, resolveUserPresentation } from '../utils/userPresentation';
import UserAvatar from './UserAvatar';
import logoRebuImg from '../assets/logo-rebu.jpg';

const getReadableTextColor = (hexColor) => {
  const hex = String(hexColor || '').replace('#', '').trim();
  const normalized = hex.length === 3
    ? hex.split('').map((part) => `${part}${part}`).join('')
    : hex;

  if (!/^[0-9a-f]{6}$/i.test(normalized)) return '#ffffff';

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const luminance = [r, g, b]
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);

  return luminance > 0.52 ? '#102033' : '#ffffff';
};

const SidebarButton = ({ onClick, isActive, icon: Icon, label, accentColor = '#c026d3' }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const activeTextColor = getReadableTextColor(accentColor);
  const activeStyle = isActive
    ? {
        backgroundColor: accentColor,
        color: activeTextColor,
        borderColor: hexToRgba(accentColor, 0.56) || 'rgba(217,70,239,0.42)',
        boxShadow: `0 10px 20px ${hexToRgba(accentColor, 0.28) || 'rgba(0,0,0,0.18)'}`,
      }
    : undefined;

  return (
    <div className="relative group flex shrink-0 justify-center">
      <button
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={label}
        className={`flex h-9 w-9 min-[1920px]:h-10 min-[1920px]:w-10 shrink-0 items-center justify-center rounded-lg transition-all ${
          isActive ? 'border' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
        style={activeStyle}
      >
        <Icon size={18} />
      </button>

      {showTooltip && (
        <div className="app-sidebar-tooltip pointer-events-none absolute left-12 min-[1920px]:left-14 top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white shadow-lg">
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
  currentTheme = 'light',
  isThemeSaving = false,
  onToggleTheme,
  onLogout,
}) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);
  const currentUserPresentation = resolveUserPresentation(currentUser);
  const isDarkTheme = currentTheme === 'dark';
  const canUseAdminArea = hasOwnerAccess(currentUser);
  const canViewDashboard = canAccessTab(currentUser, 'dashboard');
  const canViewInventory = canAccessTab(currentUser, 'inventory');
  const canViewPos = canAccessTab(currentUser, 'pos');
  const canViewClients = canAccessTab(currentUser, 'clients');
  const canViewAgenda = canAccessTab(currentUser, 'agenda');
  const canViewOrders = canAccessTab(currentUser, 'orders');
  const canViewExtras = canAccessTab(currentUser, 'extras');
  const canViewReports = canAccessTab(currentUser, 'reports');
  const canViewMetrics = canAccessTab(currentUser, 'metrics');
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
    <div className="app-sidebar relative z-40 flex h-full min-h-0 w-14 min-w-[3.5rem] min-[1920px]:w-16 min-[1920px]:min-w-[4rem] shrink-0 flex-col items-center gap-2.5 min-[1920px]:gap-3 overflow-visible bg-slate-900 py-3 min-[1920px]:py-4 shadow-xl">
      <div className="mb-1 shrink-0">
        <img
          src={logoRebuImg}
          alt="Rebu"
          className="h-9 w-9 min-[1920px]:h-10 min-[1920px]:w-10 shrink-0 rounded-xl object-contain drop-shadow-[0_4px_12px_rgba(236,72,153,0.35)]"
        />
      </div>

      <nav className="flex min-h-0 w-full flex-1 flex-col items-center space-y-1.5 min-[1920px]:space-y-2 overflow-y-auto overflow-x-visible py-1 overscroll-contain scrollbar-hide">
        {canViewDashboard && <SidebarButton onClick={() => setActiveTab('dashboard')} isActive={activeTab === 'dashboard'} icon={LayoutDashboard} label="Control de Caja" accentColor={navAccentColor} />}
        {canViewInventory && <SidebarButton onClick={() => setActiveTab('inventory')} isActive={activeTab === 'inventory'} icon={Package} label="Inventario" accentColor={navAccentColor} />}
        {canViewBulkEditor && <SidebarButton onClick={() => setActiveTab('bulk-editor')} isActive={activeTab === 'bulk-editor'} icon={Percent} label="Productos (Avanzado)" accentColor={navAccentColor} />}
        {canViewPos && <SidebarButton onClick={() => setActiveTab('pos')} isActive={activeTab === 'pos'} icon={ShoppingCart} label="Punto de Venta" accentColor={navAccentColor} />}
        {canViewClients && <SidebarButton onClick={() => setActiveTab('clients')} isActive={activeTab === 'clients'} icon={Users} label="Socios" accentColor={navAccentColor} />}
        {canViewAgenda && <SidebarButton onClick={() => setActiveTab('agenda')} isActive={activeTab === 'agenda'} icon={Building2} label="Agenda" accentColor={navAccentColor} />}
        {canViewOrders && <SidebarButton onClick={() => setActiveTab('orders')} isActive={activeTab === 'orders'} icon={ClipboardList} label="Pedidos" accentColor={navAccentColor} />}
        {canViewMetrics && <SidebarButton onClick={() => setActiveTab('metrics')} isActive={activeTab === 'metrics'} icon={BarChart3} label="Métricas" accentColor={navAccentColor} />}
      </nav>

      <div className="flex w-full shrink-0 flex-col items-center gap-2 pb-1">
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

      <div className="relative flex w-full shrink-0 flex-col items-center gap-2.5 min-[1920px]:gap-3 border-t border-slate-800 pt-3 min-[1920px]:pt-4" ref={menuRef}>
        <button
          onClick={() => setShowUserMenu((prev) => !prev)}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white transition-transform hover:scale-110 ${
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
          <div className="app-user-menu absolute bottom-0 left-12 min-[1920px]:left-14 z-50 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
            <div className="relative border-b border-slate-100 bg-slate-50 px-3 py-2 pr-16">
              <button
                type="button"
                onClick={onToggleTheme}
                disabled={isThemeSaving}
                aria-label={isDarkTheme ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
                aria-pressed={isDarkTheme}
                aria-busy={isThemeSaving}
                title={isThemeSaving ? 'Guardando tema...' : isDarkTheme ? 'Tema oscuro' : 'Tema claro'}
                className={`absolute right-3 top-2 h-7 w-12 rounded-full border p-0.5 transition-colors ${
                  isDarkTheme
                    ? 'border-slate-700 bg-slate-950'
                    : 'border-slate-200 bg-slate-200'
                } ${isThemeSaving ? 'cursor-wait opacity-70' : 'hover:brightness-105'}`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full shadow-sm transition-transform ${
                    isDarkTheme ? 'translate-x-5 text-amber-200' : 'translate-x-0 text-amber-500'
                  }`}
                  style={{ backgroundColor: isDarkTheme ? '#1e293b' : '#ffffff' }}
                >
                  {isDarkTheme ? <Moon size={12} /> : <Sun size={12} />}
                </span>
              </button>
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

            {canViewExtras && (
              <button
                onClick={() => {
                  setActiveTab('extras');
                  setShowUserMenu(false);
                }}
                className="flex w-full items-center gap-2 border-b border-slate-50 px-4 py-2.5 text-left text-xs text-slate-600 transition-colors hover:bg-fuchsia-50 hover:text-fuchsia-700"
              >
                <Settings2 size={14} /> Gestion de Extras
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
          </div>
        )}

        <button onClick={onLogout} className="shrink-0 p-2 text-red-400 hover:text-red-300" title="Cerrar sesión">
          <LogOut size={20} />
        </button>
      </div>
    </div>
  );
}

