import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Building2,
  ClipboardList,
  FileBarChart,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  MessageCircle,
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
import { whatsappOperator } from '../utils/whatsappOperator';
import UserAvatar from './UserAvatar';
import logoRebuImg from '../assets/logo-rebu.jpg';

const SIDEBAR_LAYOUT_STORAGE_PREFIX = 'rebu_sidebar_layout_v1';
const WHATSAPP_SOUND_MUTED_KEY = 'rebu_whatsapp_sound_muted_v1';

const playAttentionTone = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.24);
    oscillator.addEventListener('ended', () => void context.close(), { once: true });
  } catch {
    // El badge sigue funcionando aunque el navegador bloquee audio sin gesto previo.
  }
};

const getSidebarLayoutStorageKey = (user) =>
  `${SIDEBAR_LAYOUT_STORAGE_PREFIX}:${String(user?.id || user?.name || user?.displayName || 'guest')}`;

const readSidebarLayout = (user) => {
  try {
    const raw = window.localStorage.getItem(getSidebarLayoutStorageKey(user));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.top) || !Array.isArray(parsed.bottom)) return null;
    return {
      top: parsed.top.map(String),
      bottom: parsed.bottom.map(String),
    };
  } catch {
    return null;
  }
};

const saveSidebarLayout = (user, layout) => {
  try {
    window.localStorage.setItem(getSidebarLayoutStorageKey(user), JSON.stringify(layout));
  } catch {
    // No interrumpir la navegación si el almacenamiento local falla.
  }
};
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

const SidebarButton = ({
  onClick,
  isActive,
  icon: Icon,
  label,
  accentColor = '#c026d3',
  draggable = false,
  isDragging = false,
  isDropTarget = false,
  suppressTooltip = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  badge = 0,
  tooltipDetail = null,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const activeTextColor = getReadableTextColor(accentColor);
  const activeStyle = isActive
    ? {
        backgroundColor: accentColor,
        color: activeTextColor,
        borderColor: hexToRgba(accentColor, 0.56) || 'rgba(217,70,239,0.42)',
        boxShadow: [
          `0 0 0 1px ${hexToRgba(accentColor, 0.72) || 'rgba(217,70,239,0.72)'}`,
          `0 0 12px ${hexToRgba(accentColor, 0.72) || 'rgba(217,70,239,0.72)'}`,
          `0 0 26px ${hexToRgba(accentColor, 0.44) || 'rgba(217,70,239,0.44)'}`,
          `0 10px 22px ${hexToRgba(accentColor, 0.3) || 'rgba(0,0,0,0.18)'}`,
        ].join(', '),
      }
    : undefined;
  const activeGlowStyle = isActive
    ? {
        background: `radial-gradient(circle, ${hexToRgba(accentColor, 0.5) || 'rgba(217,70,239,0.5)'} 0%, ${hexToRgba(accentColor, 0.24) || 'rgba(217,70,239,0.24)'} 42%, transparent 72%)`,
      }
    : undefined;
  const activeIconGlowStyle = isActive
    ? {
        filter: `drop-shadow(0 0 5px ${hexToRgba(accentColor, 0.95) || 'rgba(217,70,239,0.95)'}) drop-shadow(0 0 12px ${hexToRgba(accentColor, 0.58) || 'rgba(217,70,239,0.58)'})`,
      }
    : undefined;

  return (
    <div className="relative group flex shrink-0 justify-center">
      {isActive && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-90 blur-lg"
          style={activeGlowStyle}
        />
      )}
      <button
        onClick={onClick}
        draggable={draggable}
        onDragStart={(event) => {
          setShowTooltip(false);
          onDragStart?.(event);
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={(event) => {
          setShowTooltip(false);
          onDragEnd?.(event);
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        aria-label={badge > 0 ? `${label}, ${badge} conversaciones por atender` : label}
        title={draggable ? undefined : label}
        className={`app-sidebar-button-control relative flex h-9 w-9 min-[1920px]:h-10 min-[1920px]:w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
          isActive ? 'border' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        } ${draggable ? 'cursor-pointer active:cursor-grabbing' : ''} ${isDragging ? 'scale-90 opacity-45' : ''} ${isDropTarget ? 'ring-2 ring-sky-300 ring-offset-2 ring-offset-slate-900' : ''}`}
        style={activeStyle}
      >
        <span className="relative z-10 flex items-center justify-center" style={activeIconGlowStyle}>
          <Icon size={18} />
        </span>
        <span
          aria-hidden={badge <= 0}
          className={`absolute -right-1.5 -top-1.5 z-20 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-slate-900 bg-rose-500 px-1 text-[9px] font-black leading-none text-white tabular-nums transition-[opacity,transform] duration-150 ease-out ${
            badge > 0 ? 'scale-100 opacity-100' : 'pointer-events-none scale-75 opacity-0'
          }`}
        >
          {badge > 99 ? '99+' : Math.max(badge, 0)}
        </span>
      </button>

      {showTooltip && !suppressTooltip && (
        <div className="app-sidebar-tooltip pointer-events-none absolute left-12 min-[1920px]:left-14 top-1/2 z-50 min-w-max -translate-y-1/2 whitespace-nowrap rounded bg-slate-800 px-2.5 py-2 text-xs text-white shadow-lg">
          <strong className="block">{label}</strong>
          {tooltipDetail && (
            <span className="mt-1 grid gap-0.5 text-[10px] font-medium text-slate-300">
              <span>{tooltipDetail.conversations || 0} conversaciones por atender</span>
              <span>{tooltipDetail.unread_messages || 0} mensajes sin leer</span>
              {(tooltipDetail.handoffs || 0) > 0 && <span>{tooltipDetail.handoffs} necesitan respuesta</span>}
              {(tooltipDetail.failed_sends || 0) > 0 && <span>{tooltipDetail.failed_sends} no se enviaron</span>}
              {(tooltipDetail.pending_budgets || 0) > 0 && <span>{tooltipDetail.pending_budgets} presupuestos</span>}
            </span>
          )}
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
  const [sidebarLayout, setSidebarLayout] = useState(() => readSidebarLayout(currentUser));
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [whatsappSummary, setWhatsAppSummary] = useState(null);
  const [whatsappSoundMuted, setWhatsAppSoundMuted] = useState(() => {
    try {
      return window.localStorage.getItem(WHATSAPP_SOUND_MUTED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const previousAttentionRef = useRef(null);
  const previousAttentionKeysRef = useRef(null);
  const menuRef = useRef(null);
  const didDragRef = useRef(false);
  const currentUserPresentation = resolveUserPresentation(currentUser);
  const isDarkTheme = currentTheme === 'dark';
  const canUseAdminArea = hasOwnerAccess(currentUser);
  const canViewDashboard = canAccessTab(currentUser, 'dashboard');
  const canViewInventory = canAccessTab(currentUser, 'inventory');
  const canViewPos = canAccessTab(currentUser, 'pos');
  const canViewWhatsApp = canAccessTab(currentUser, 'whatsapp');
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
  const sidebarLayoutStorageKey = getSidebarLayoutStorageKey(currentUser);
  const sidebarItems = useMemo(() => ([
    { id: 'dashboard', tab: 'dashboard', section: 'top', canView: canViewDashboard, icon: LayoutDashboard, label: 'Control de Caja' },
    { id: 'inventory', tab: 'inventory', section: 'top', canView: canViewInventory, icon: Package, label: 'Inventario' },
    { id: 'pos', tab: 'pos', section: 'top', canView: canViewPos, icon: ShoppingCart, label: 'Punto de Venta' },
    {
      id: 'whatsapp',
      tab: 'whatsapp',
      section: 'top',
      canView: canViewWhatsApp,
      icon: MessageCircle,
      label: 'WhatsApp',
      badge: Number(whatsappSummary?.conversations || 0),
      tooltipDetail: whatsappSummary,
    },
    { id: 'clients', tab: 'clients', section: 'top', canView: canViewClients, icon: Users, label: 'Socios' },
    { id: 'agenda', tab: 'agenda', section: 'top', canView: canViewAgenda, icon: Building2, label: 'Agenda' },
    { id: 'orders', tab: 'orders', section: 'top', canView: canViewOrders, icon: ClipboardList, label: 'Pedidos' },
    { id: 'metrics', tab: 'metrics', section: 'top', canView: canViewMetrics, icon: BarChart3, label: 'Métricas' },
    { id: 'bulk-editor', tab: 'bulk-editor', section: 'top', canView: canViewBulkEditor, icon: Percent, label: 'Productos (Avanzado)' },
    { id: 'ticket-test', tab: 'ticket-test', section: 'top', canView: Boolean(currentUser), icon: FileText, label: 'Prueba Tickets' },
    { id: 'reports', tab: 'reports', section: 'bottom', canView: canViewReports, icon: FileBarChart, label: 'Reportes de Caja' },
    { id: 'history', tab: 'history', section: 'bottom', canView: canAccessTab(currentUser, 'history'), icon: History, label: 'Historial de Ventas' },
  ]), [
    canViewAgenda,
    canViewBulkEditor,
    canViewClients,
    canViewDashboard,
    canViewInventory,
    canViewMetrics,
    canViewOrders,
    canViewPos,
    canViewReports,
    canViewWhatsApp,
    currentUser,
    whatsappSummary,
  ]);

  useEffect(() => {
    if (!canViewWhatsApp || !currentUser) {
      setWhatsAppSummary(null);
      previousAttentionRef.current = null;
      previousAttentionKeysRef.current = null;
      return undefined;
    }
    let cancelled = false;
    let timer = null;
    let loading = false;
    const applySummary = (value) => {
      const next = value?.attention || value || null;
      if (!next || cancelled) return;
      const count = Number(next.conversations || 0);
      const keys = Array.isArray(value?.attentionKeys)
        ? new Set(value.attentionKeys.map((entry) => String(entry)))
        : null;
      const hasNewConversation = keys && previousAttentionKeysRef.current
        ? [...keys].some((key) => !previousAttentionKeysRef.current.has(key))
        : previousAttentionRef.current !== null && count > previousAttentionRef.current;
      if (hasNewConversation && !whatsappSoundMuted) {
        playAttentionTone();
      }
      previousAttentionRef.current = count;
      if (keys) previousAttentionKeysRef.current = keys;
      setWhatsAppSummary(next);
    };
    const load = async () => {
      if (cancelled || loading) return;
      loading = true;
      try {
        applySummary(await whatsappOperator.summary());
      } catch {
        // La navegación no se bloquea si el proceso local del bot está reiniciando.
      } finally {
        loading = false;
        if (!cancelled) timer = window.setTimeout(() => void load(), 15000);
      }
    };
    const onSummary = (event) => applySummary(event.detail);
    const onSoundSetting = (event) => {
      const muted = Boolean(event.detail?.muted);
      setWhatsAppSoundMuted(muted);
    };
    void load();
    window.addEventListener('rebu:whatsapp-summary', onSummary);
    window.addEventListener('rebu:whatsapp-sound-setting', onSoundSetting);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('rebu:whatsapp-summary', onSummary);
      window.removeEventListener('rebu:whatsapp-sound-setting', onSoundSetting);
    };
  }, [canViewWhatsApp, currentUser, whatsappSoundMuted]);

  const visibleSidebarItems = useMemo(
    () => sidebarItems.filter((item) => item.canView),
    [sidebarItems],
  );

  const orderedSidebarSections = useMemo(() => {
    const visibleIds = new Set(visibleSidebarItems.map((item) => item.id));
    const savedTop = Array.isArray(sidebarLayout?.top) ? sidebarLayout.top.filter((id) => visibleIds.has(id)) : [];
    const savedBottom = Array.isArray(sidebarLayout?.bottom) ? sidebarLayout.bottom.filter((id) => visibleIds.has(id)) : [];
    const savedIds = new Set([...savedTop, ...savedBottom]);
    const top = [
      ...savedTop,
      ...visibleSidebarItems.filter((item) => item.section === 'top' && !savedIds.has(item.id)).map((item) => item.id),
    ];
    const bottom = [
      ...savedBottom,
      ...visibleSidebarItems.filter((item) => item.section === 'bottom' && !savedIds.has(item.id)).map((item) => item.id),
    ];
    const byId = Object.fromEntries(visibleSidebarItems.map((item) => [item.id, item]));
    return {
      top: top.map((id) => byId[id]).filter(Boolean),
      bottom: bottom.map((id) => byId[id]).filter(Boolean),
    };
  }, [sidebarLayout, visibleSidebarItems]);

  useEffect(() => {
    setSidebarLayout(readSidebarLayout(currentUser));
    setDraggedItemId(null);
    setDropTarget(null);
    didDragRef.current = false;
  }, [currentUser, sidebarLayoutStorageKey]);

  const persistSidebarSections = (nextSections) => {
    const layout = {
      top: nextSections.top.map((item) => item.id),
      bottom: nextSections.bottom.map((item) => item.id),
    };
    setSidebarLayout(layout);
    saveSidebarLayout(currentUser, layout);
  };

  const moveSidebarItem = (targetSection, beforeId = null) => {
    if (!draggedItemId) return;
    if (beforeId && beforeId === draggedItemId) return;
    const currentSections = {
      top: orderedSidebarSections.top.filter((item) => item.id !== draggedItemId),
      bottom: orderedSidebarSections.bottom.filter((item) => item.id !== draggedItemId),
    };
    const draggedItem = visibleSidebarItems.find((item) => item.id === draggedItemId);
    if (!draggedItem) return;

    const targetItems = [...currentSections[targetSection]];
    const targetIndex = beforeId ? targetItems.findIndex((item) => item.id === beforeId) : targetItems.length;
    targetItems.splice(targetIndex < 0 ? targetItems.length : targetIndex, 0, draggedItem);
    persistSidebarSections({
      ...currentSections,
      [targetSection]: targetItems,
    });
  };

  const getSidebarDropBeforeId = (event, item, sectionItems) => {
    const currentIndex = sectionItems.findIndex((sectionItem) => sectionItem.id === item.id);
    const rect = event.currentTarget.getBoundingClientRect();
    const isAfterCurrentItem = event.clientY > rect.top + rect.height / 2;
    if (!isAfterCurrentItem) return item.id;
    return sectionItems[currentIndex + 1]?.id || null;
  };

  const renderSidebarItem = (item, section, sectionItems) => (
    <SidebarButton
      key={item.id}
      onClick={(event) => {
        if (didDragRef.current) {
          event.preventDefault();
          event.stopPropagation();
          didDragRef.current = false;
          return;
        }
        setActiveTab(item.tab);
      }}
      isActive={activeTab === item.tab}
      icon={item.icon}
      label={item.label}
      accentColor={navAccentColor}
      draggable
      isDragging={draggedItemId === item.id}
      isDropTarget={dropTarget?.section === section && dropTarget?.beforeId === item.id}
      suppressTooltip={Boolean(draggedItemId)}
      onDragStart={(event) => {
        didDragRef.current = true;
        setDraggedItemId(item.id);
        const transparentDragImage = document.createElement('span');
        transparentDragImage.style.width = '1px';
        transparentDragImage.style.height = '1px';
        transparentDragImage.style.opacity = '0';
        transparentDragImage.style.position = 'fixed';
        transparentDragImage.style.pointerEvents = 'none';
        document.body.appendChild(transparentDragImage);
        event.dataTransfer.setDragImage(transparentDragImage, 0, 0);
        window.setTimeout(() => {
          transparentDragImage.remove();
        }, 0);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', item.id);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        setDropTarget({ section, beforeId: getSidebarDropBeforeId(event, item, sectionItems) });
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        moveSidebarItem(section, getSidebarDropBeforeId(event, item, sectionItems));
        setDraggedItemId(null);
        setDropTarget(null);
      }}
      onDragEnd={() => {
        setDraggedItemId(null);
        setDropTarget(null);
        window.setTimeout(() => {
          didDragRef.current = false;
        }, 150);
      }}
      badge={item.badge || 0}
      tooltipDetail={item.tooltipDetail || null}
    />
  );

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
          className="app-sidebar-logo h-9 w-9 min-[1920px]:h-10 min-[1920px]:w-10 shrink-0 rounded-xl object-contain drop-shadow-[0_4px_12px_rgba(236,72,153,0.35)]"
        />
      </div>

      <nav
        className={`flex min-h-0 w-full flex-1 flex-col items-center space-y-1.5 min-[1920px]:space-y-2 overflow-y-auto overflow-x-visible pb-3 pt-4 overscroll-contain scrollbar-hide transition-all duration-200 ${dropTarget?.section === 'top' && !dropTarget?.beforeId ? 'rounded-xl bg-slate-800/60' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDropTarget({ section: 'top', beforeId: null });
        }}
        onDrop={(event) => {
          event.preventDefault();
          moveSidebarItem('top');
          setDraggedItemId(null);
          setDropTarget(null);
        }}
      >
        {orderedSidebarSections.top.map((item) => renderSidebarItem(item, 'top', orderedSidebarSections.top))}
      </nav>

      <div
        className={`flex w-full shrink-0 flex-col items-center gap-2 rounded-xl pb-2 pt-2 transition-all duration-200 ${dropTarget?.section === 'bottom' && !dropTarget?.beforeId ? 'bg-slate-800/60' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDropTarget({ section: 'bottom', beforeId: null });
        }}
        onDrop={(event) => {
          event.preventDefault();
          moveSidebarItem('bottom');
          setDraggedItemId(null);
          setDropTarget(null);
        }}
      >
        {orderedSidebarSections.bottom.map((item) => renderSidebarItem(item, 'bottom', orderedSidebarSections.bottom))}
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

