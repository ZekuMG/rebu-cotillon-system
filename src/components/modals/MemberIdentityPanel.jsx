import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  X,
  Users,
  Search,
  User,
  UserPlus,
  Gift,
  Package,
  Tag,
} from 'lucide-react';
import { formatNumber } from '../../utils/helpers';
import { FancyPrice } from '../FancyPrice';

const INITIAL_MEMBER_FORM = { name: '', dni: '', phone: '', email: '', extraInfo: '' };
const MEMBER_RESULT_LIMIT = 6;

const isRealMember = (client) => Boolean(client && client.id !== 'guest' && client.id !== 0);

const formatMemberNumber = (memberNumber) => String(memberNumber || '').padStart(4, '0');

export const MemberIdentityPanel = ({
  isOpen,
  onClose,
  initialMode = 'member',
  initialFocus = 'select',
  selectedClient = null,
  clients = [],
  rewards = [],
  onSelectClient,
  onCreateClient,
  onRedeem,
  onChooseGuest,
}) => {
  const [mode, setMode] = useState('member');
  const [panelView, setPanelView] = useState('select');
  const [memberSearch, setMemberSearch] = useState('');
  const [rewardSearch, setRewardSearch] = useState('');
  const [newMemberData, setNewMemberData] = useState(INITIAL_MEMBER_FORM);
  const [activeMember, setActiveMember] = useState(null);
  const [loadedCount, setLoadedCount] = useState(10);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const currentMember = isRealMember(selectedClient) ? selectedClient : null;
    const nextMode = initialMode === 'guest' ? 'guest' : 'member';

    setMode(nextMode);
    setActiveMember(currentMember);
    setMemberSearch('');
    setRewardSearch('');
    setNewMemberData(INITIAL_MEMBER_FORM);
    setLoadedCount(10);

    if (nextMode === 'guest') {
      setPanelView('guest-options');
      return;
    }

    if (currentMember && initialFocus === 'redeem') {
      setPanelView('redeem');
      return;
    }

    setPanelView('select');
  }, [initialFocus, initialMode, isOpen, selectedClient]);

  useEffect(() => {
    setLoadedCount(10);
  }, [memberSearch]);

  const filteredMembersAll = useMemo(() => {
    const safeClients = Array.isArray(clients) ? clients : [];
    const search = memberSearch.trim().toLowerCase();

    if (!search) return safeClients;

    return safeClients.filter((member) => {
      const name = String(member?.name || '').toLowerCase();
      const memberNumber = String(member?.memberNumber || '').toLowerCase();
      const dni = String(member?.dni || '').toLowerCase();
      const phone = String(member?.phone || '').toLowerCase();
      const email = String(member?.email || '').toLowerCase();

      return (
        name.includes(search) ||
        memberNumber.includes(search) ||
        dni.includes(search) ||
        phone.includes(search) ||
        email.includes(search)
      );
    });
  }, [clients, memberSearch]);

  const displayedMembers = useMemo(() => {
    return filteredMembersAll.slice(0, loadedCount);
  }, [filteredMembersAll, loadedCount]);

  const totalFilteredMembers = filteredMembersAll.length;

  const filteredRewards = useMemo(() => {
    const safeRewards = Array.isArray(rewards) ? rewards : [];
    const search = rewardSearch.trim().toLowerCase();
    if (!search) return safeRewards;

    return safeRewards.filter((reward) => {
      const title = String(reward?.title || '').toLowerCase();
      const description = String(reward?.description || '').toLowerCase();
      return title.includes(search) || description.includes(search);
    });
  }, [rewardSearch, rewards]);

  if (!isOpen) return null;

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setPanelView(nextMode === 'member' ? (activeMember ? 'redeem' : 'select') : 'guest-options');
  };

  const handleMemberSelect = (member) => {
    const resolvedMember = onSelectClient?.(member) || member;
    setActiveMember(resolvedMember);
    setMode('member');
    setPanelView('select');
  };

  const handleScrollMembers = (event) => {
    const element = event.currentTarget;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;

    if (distanceToBottom < 100 && loadedCount < totalFilteredMembers) {
      setLoadedCount((prev) => Math.min(prev + 10, totalFilteredMembers));
    }
  };

  const handleCreateMember = async (event) => {
    event.preventDefault();
    if (!newMemberData.name.trim()) return;

    const createdMember = await onCreateClient?.(newMemberData);
    if (!createdMember?.id) return;

    setActiveMember(createdMember);
    setMode('member');
    setPanelView('redeem');
    setNewMemberData(INITIAL_MEMBER_FORM);
  };

  const handleChooseGuest = () => {
    onChooseGuest?.();
    onClose?.();
  };

  const handleRedeemReward = (reward) => {
    onRedeem?.(reward);
    onClose?.();
  };

  const renderLeftSummary = () => {
    if (mode === 'member' && activeMember) {
      return (
        <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/70 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-fuchsia-600">Socio activo</p>
            <button
              type="button"
              onClick={() => setPanelView('select')}
              className="rounded-lg bg-fuchsia-600 px-1.5 py-0.5 text-[8px] font-black text-white transition-colors hover:bg-fuchsia-700"
            >
              Seleccionar otro
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-fuchsia-600 text-sm font-black text-white">
              {String(activeMember.name || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">{activeMember.name}</p>
              <p className="text-[11px] font-bold text-slate-500">#{formatMemberNumber(activeMember.memberNumber)}</p>
            </div>
          </div>
          {(activeMember?.phone || activeMember?.email || activeMember?.dni) && (
            <div className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-[10px] space-y-1 leading-snug">
              <p className="text-slate-700 truncate">
                <span className="font-bold text-slate-600">T:</span> {activeMember?.phone || '—'} {activeMember?.dni && `| DNI: ${activeMember.dni}`}
              </p>
              {activeMember?.email && (
                <p className="text-slate-700 truncate"><span className="font-bold text-slate-600">E:</span> {activeMember.email}</p>
              )}
            </div>
          )}
          <div className="mt-3 rounded-xl border border-white/80 bg-white px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Puntos</p>
            <p className="mt-1 text-xl font-black text-fuchsia-600">{formatNumber(activeMember.points || 0)}</p>
          </div>
          <button
            type="button"
            onClick={() => setPanelView('redeem')}
            className="mt-3 w-full rounded-xl border border-fuchsia-300 bg-fuchsia-600 px-3 py-2.5 text-[11px] font-black text-white transition-colors hover:bg-fuchsia-700"
          >
            Ir a canjes
          </button>
        </div>
      );
    }

    if (mode === 'guest') {
      return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Venta sin socio</p>
          <p className="mt-2 text-sm font-bold text-slate-800">Elegi como continuar la compra.</p>
          <p className="mt-2 text-[12px] text-slate-500">
            Podes seguir como consumidor final o registrar un socio nuevo sin salir del POS.
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600">Identificacion</p>
        <p className="mt-2 text-sm font-bold text-slate-800">Busca y selecciona un socio.</p>
        <p className="mt-2 text-[12px] text-slate-500">
          Una vez elegido, este mismo panel te deja revisar los premios disponibles para canje.
        </p>
      </div>
    );
  };

  const renderMemberSelection = () => (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-slate-200 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600">Paso 1</p>
            <h3 className="mt-1 text-xl font-black text-slate-900">Seleccionar socio</h3>
            <p className="mt-1 text-sm text-slate-500">Busca por nombre, DNI, telefono, email o numero de socio.</p>
          </div>
        </div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            autoFocus
            type="text"
            value={memberSearch}
            onChange={(event) => setMemberSearch(event.target.value)}
            placeholder="Buscar socio..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div 
        ref={scrollContainerRef}
        className="mt-4 flex-1 overflow-y-auto space-y-1 pr-1"
        onScroll={handleScrollMembers}
      >
        {displayedMembers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-medium text-slate-400">
            No se encontraron socios.
          </div>
        ) : (
          displayedMembers.map((member) => {
            const isCurrent = activeMember && String(activeMember.id) === String(member.id);

            return (
              <button
                key={member.id}
                type="button"
                onClick={() => handleMemberSelect(member)}
                className={`w-full rounded-2xl border p-3 text-left shadow-sm transition-all ${
                  isCurrent
                    ? 'border-fuchsia-300 bg-fuchsia-50'
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 text-xs font-bold ${isCurrent ? 'bg-fuchsia-200 text-fuchsia-700' : 'bg-blue-100 text-blue-600'}`}>
                      {String(member.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black text-slate-900">{member.name}</p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500 font-medium">
                        #{formatMemberNumber(member.memberNumber)} {member.phone && `· ${member.phone}`} {member.dni && `· DNI: ${member.dni}`}
                      </p>
                      {member.email && <p className="truncate text-[9px] text-slate-400">{member.email}</p>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${isCurrent ? 'bg-fuchsia-200 text-fuchsia-700' : 'bg-blue-100 text-blue-700'}`}>
                      {formatNumber(member.points || 0)} pts
                    </p>
                    {isCurrent && <p className="mt-0.5 text-[9px] font-black text-fuchsia-600">✓</p>}
                  </div>
                </div>
              </button>
            );
          })
        )}
        {displayedMembers.length > 0 && loadedCount < totalFilteredMembers && (
          <div className="flex justify-center py-3 text-xs text-slate-500">
            <span className="animate-pulse">Scroll para cargar más...</span>
          </div>
        )}
      </div>
    </div>
  );

  const renderRewardGrid = () => {
    if (!activeMember) return null;

    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-slate-200 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-fuchsia-600">Paso 2</p>
              <h3 className="mt-1 text-xl font-black text-slate-900">Canje de premios</h3>
              <p className="mt-1 text-sm text-slate-500">Selecciona un premio para agregarlo al carrito.</p>
            </div>
            <button
              type="button"
              onClick={() => setPanelView('select')}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-600 transition-colors hover:bg-slate-50"
            >
              Seleccionar Socio
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-fuchsia-200 bg-fuchsia-50/70 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-base font-black text-slate-900">{activeMember.name}</p>
                <p className="mt-1 text-[11px] font-medium text-slate-500">Socio #{formatMemberNumber(activeMember.memberNumber)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Puntos disponibles</p>
                <p className="mt-1 text-2xl font-black text-fuchsia-600">{formatNumber(activeMember.points || 0)}</p>
              </div>
            </div>
          </div>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={rewardSearch}
              onChange={(event) => setRewardSearch(event.target.value)}
              placeholder="Buscar premio..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition-all focus:border-fuchsia-400 focus:bg-white focus:ring-2 focus:ring-fuchsia-100"
            />
          </div>
        </div>

        <div className="mt-4 grid flex-1 grid-cols-1 gap-3 overflow-y-auto pr-1 xl:grid-cols-2">
          {filteredRewards.length === 0 ? (
            <div className="col-span-full flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-medium text-slate-400">
              <Gift size={42} className="mb-3 opacity-40" />
              No se encontraron premios.
            </div>
          ) : (
            filteredRewards.map((reward) => {
              const pointsCost = Number(reward.pointsCost) || 0;
              const canAfford = Number(activeMember.points || 0) >= pointsCost;
              const hasStock = reward.type === 'product' ? Number(reward.stock || 0) > 0 : true;
              const isDisabled = !canAfford || !hasStock;

              return (
                <div
                  key={reward.id}
                  className={`rounded-2xl border p-4 shadow-sm transition-all ${
                    isDisabled ? 'border-slate-200 bg-slate-50/70 opacity-70' : 'border-white bg-white hover:border-fuchsia-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{reward.title}</p>
                      {reward.description && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{reward.description}</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                        reward.type === 'product' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {reward.type === 'product' ? 'Producto' : 'Descuento'}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${reward.type === 'product' ? 'bg-blue-50 text-blue-500' : 'bg-emerald-50 text-emerald-500'}`}>
                        {reward.type === 'product' ? <Package size={18} /> : <Tag size={18} />}
                      </div>
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{formatNumber(pointsCost)} pts</p>
                        {reward.type === 'product' ? (
                          <p className="mt-1 text-[11px] font-medium text-slate-500">
                            Stock: {formatNumber(reward.stock || 0)}
                          </p>
                        ) : (
                          <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-slate-500">
                            <span>Valor:</span>
                            <FancyPrice amount={reward.discountAmount || 0} />
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => !isDisabled && handleRedeemReward(reward)}
                      disabled={isDisabled}
                      className={`rounded-xl px-3 py-2 text-[11px] font-black transition-all ${
                        isDisabled
                          ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                          : 'bg-slate-900 text-white hover:bg-fuchsia-600'
                      }`}
                    >
                      {!canAfford ? `Faltan ${formatNumber(pointsCost - Number(activeMember.points || 0))} pts` : !hasStock ? 'Sin stock' : 'Canjear'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const renderGuestOptions = () => (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-slate-200 pb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">No socio</p>
        <h3 className="mt-1 text-xl font-black text-slate-900">Como queres continuar</h3>
        <p className="mt-1 text-sm text-slate-500">
          Elegi si la venta va como consumidor final o si queres registrar un socio nuevo.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <button
          type="button"
          onClick={handleChooseGuest}
          className="flex flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <User size={16} />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">Consumidor Final</p>
            <p className="mt-1 text-[10px] text-slate-500">Sin puntos ni beneficios.</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setPanelView('create')}
          className="flex flex-col items-start justify-between rounded-2xl border border-fuchsia-200 bg-fuchsia-50/70 p-3.5 text-left shadow-sm transition-all hover:border-fuchsia-300 hover:bg-fuchsia-100"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-fuchsia-600">
            <UserPlus size={16} />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">Agregar</p>
            <p className="mt-1 text-[10px] text-slate-500">Registrar socio nuevo.</p>
          </div>
        </button>
      </div>
    </div>
  );

  const renderCreateMember = () => (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-slate-200 pb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-fuchsia-600">Alta rapida</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-slate-900">Registrar socio</h3>
            <p className="mt-1 text-sm text-slate-500">Completa los datos basicos y el socio quedara seleccionado.</p>
          </div>
          <button
            type="button"
            onClick={() => setPanelView('guest-options')}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-600 transition-colors hover:bg-slate-50"
          >
            Volver
          </button>
        </div>
      </div>

      <form onSubmit={handleCreateMember} className="mt-4 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Nombre completo *</label>
            <input
              autoFocus
              required
              type="text"
              value={newMemberData.name}
              onChange={(event) => setNewMemberData((prev) => ({ ...prev, name: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700 outline-none transition-all focus:border-fuchsia-400 focus:bg-white focus:ring-2 focus:ring-fuchsia-100"
              placeholder="Ej: Juan Perez"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">DNI</label>
            <input
              type="text"
              value={newMemberData.dni}
              onChange={(event) => setNewMemberData((prev) => ({ ...prev, dni: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700 outline-none transition-all focus:border-fuchsia-400 focus:bg-white focus:ring-2 focus:ring-fuchsia-100"
              placeholder="Solo numeros"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Telefono</label>
            <input
              type="text"
              value={newMemberData.phone}
              onChange={(event) => setNewMemberData((prev) => ({ ...prev, phone: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700 outline-none transition-all focus:border-fuchsia-400 focus:bg-white focus:ring-2 focus:ring-fuchsia-100"
              placeholder="Cod + numero"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Email</label>
            <input
              type="email"
              value={newMemberData.email}
              onChange={(event) => setNewMemberData((prev) => ({ ...prev, email: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700 outline-none transition-all focus:border-fuchsia-400 focus:bg-white focus:ring-2 focus:ring-fuchsia-100"
              placeholder="cliente@ejemplo.com"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => setPanelView('guest-options')}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 transition-colors hover:bg-slate-50"
          >
            Volver
          </button>
          <button
            type="submit"
            className="rounded-xl bg-fuchsia-600 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-fuchsia-700"
          >
            Guardar y seleccionar
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="relative flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl md:flex-row" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
          <X size={20} />
        </button>
        <aside className="w-full shrink-0 border-b border-slate-200 bg-slate-50/90 p-5 md:w-[340px] md:border-b-0 md:border-r">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">POS</p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-black text-slate-900">
              <Users size={18} className="text-blue-600" />
              Identificacion de socio
            </h2>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => handleModeChange('member')}
              className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition-all ${
                mode === 'member' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Socio
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('guest')}
              className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition-all ${
                mode === 'guest' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              No socio
            </button>
          </div>

          <div className="mt-5">{renderLeftSummary()}</div>
        </aside>

        <section className="min-h-0 flex-1 p-5 md:p-6">
          {mode === 'member' && panelView === 'select' && renderMemberSelection()}
          {mode === 'member' && panelView === 'redeem' && activeMember && renderRewardGrid()}
          {mode === 'guest' && panelView === 'guest-options' && renderGuestOptions()}
          {mode === 'guest' && panelView === 'create' && renderCreateMember()}
        </section>
      </div>
    </div>
  );
};
