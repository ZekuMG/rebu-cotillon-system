import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Palette, Plus, Power, Search, Shield, SlidersHorizontal, UserRound } from 'lucide-react';
import { getInitialsFromName, getRoleLabel, isSystemUser } from '../utils/appUsers';
import {
  buildPermissionsOverride,
  canEditUserProfile,
  canManageUserPermissions,
  canToggleUserActiveState,
  getEffectivePermissions,
  hasPermission,
} from '../utils/userPermissions';
import UserDisplayBadge from '../components/UserDisplayBadge';
import UserAvatar from '../components/UserAvatar';
import ColorSpectrumPicker from '../components/ColorSpectrumPicker';
import UserPermissionsEditor from '../components/UserPermissionsEditor';

const DEFAULT_FORM = {
  displayName: '',
  role: 'owner',
  password: '',
  confirmPassword: '',
  avatar: '',
  nameColor: '#0f172a',
  theme: 'light',
};

function UserFormCard({ mode = 'create', value, onChange, onSubmit, onCancel, isSaving }) {
  const previewName = value.displayName.trim() || 'Nuevo usuario';
  const previewAvatar = String(value.avatar || getInitialsFromName(previewName, 'US')).trim();
  const passwordRequired = mode === 'create';

  const handleAvatarFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChange({ ...value, avatar: reader.result });
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/95 p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            {mode === 'create' ? 'Alta de usuario' : 'Editar usuario'}
          </p>
          <h3 className="mt-1 text-xl font-black text-slate-900">
            {mode === 'create' ? 'Nuevo subusuario' : 'Datos del usuario'}
          </h3>
        </div>
        <div className="rounded-[18px] border border-slate-200 bg-slate-50/90 px-3 py-2 text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Vista previa
          </p>
          <div className="mt-2 flex items-center gap-2">
            <UserAvatar
              avatar={previewAvatar}
              name={previewName}
              color={value.nameColor}
              sizeClass="h-8 w-8"
              textClass="text-[11px]"
            />
            <div className="text-left">
              <p className="text-sm font-black" style={{ color: value.nameColor }}>
                {previewName}
              </p>
              <p className="text-[10px] font-semibold text-slate-400">
                {getRoleLabel(value.role)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="grid gap-3">
          <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Nombre visible
            </span>
            <input
              type="text"
              value={value.displayName}
              onChange={(event) => onChange({ ...value, displayName: event.target.value })}
              className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                Rol
              </span>
              <select
                value={value.role}
                onChange={(event) => onChange({ ...value, role: event.target.value })}
                className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
              >
                <option value="owner">Dueño</option>
                <option value="seller">Caja</option>
              </select>
            </label>

            <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                Avatar / iniciales
              </span>
              <input
                type="text"
                maxLength={4}
                value={value.avatar}
                onChange={(event) => onChange({ ...value, avatar: event.target.value.toUpperCase() })}
                className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-black uppercase text-slate-700 outline-none"
              />
              <label className="mt-2 inline-flex cursor-pointer items-center justify-center rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50">
                Elegir imagen
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFileChange} />
              </label>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                {passwordRequired ? 'Contraseña' : 'Nueva contraseña'}
              </span>
              <input
                type="password"
                value={value.password}
                onChange={(event) => onChange({ ...value, password: event.target.value })}
                placeholder={passwordRequired ? '' : 'Dejar vacío para mantener'}
                className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
              />
            </label>

            <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                Confirmar
              </span>
              <input
                type="password"
                value={value.confirmPassword}
                onChange={(event) => onChange({ ...value, confirmPassword: event.target.value })}
                placeholder={passwordRequired ? '' : 'Sólo si cambiás la contraseña'}
                className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
              />
            </label>
          </div>
        </div>

        <div className="grid gap-3">
          <ColorSpectrumPicker
            value={value.nameColor}
            onChange={(nextColor) => onChange({ ...value, nameColor: nextColor })}
            hint="Elegí cualquier tono y mirá el resultado en la vista previa."
          />

          <div className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
            <div className="mb-3 flex items-center gap-2">
              <SlidersHorizontal size={15} className="text-slate-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                Tema
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-amber-700">
                Standby
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {['light', 'dark'].map((themeOption) => (
                <button
                  key={themeOption}
                  type="button"
                  onClick={() => onChange({ ...value, theme: themeOption })}
                  className={`rounded-[16px] border px-3 py-2 text-left transition ${
                    value.theme === themeOption
                      ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.12em]">
                    {themeOption === 'light' ? 'Blanco' : 'Oscuro'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[14px] border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-[14px] border border-fuchsia-200 bg-fuchsia-600 px-4 py-2 text-sm font-black text-white transition hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus size={14} />
          {isSaving ? 'Guardando...' : mode === 'create' ? 'Crear usuario' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

export default function UserManagementView({
  users = [],
  userCatalog,
  currentUser,
  isSharedUsersEnabled = false,
  onRetryEnableSharedUsers,
  onCreateUser,
  onUpdateUser,
  onToggleUserActive,
  onUpdatePermissions,
  showNotification,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('Todos');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [draft, setDraft] = useState(DEFAULT_FORM);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [editorTab, setEditorTab] = useState('data');
  const [permissionDraft, setPermissionDraft] = useState({});
  const [isSavingData, setIsSavingData] = useState(false);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  const canCreateUsers = hasPermission(currentUser, 'userManagement.createUsers');
  const isCurrentUserSystem = isSystemUser(currentUser);
  const visibleUsers = useMemo(() => {
    const baseUsers = Array.isArray(users) ? users : [];
    if (isCurrentUserSystem) return baseUsers;
    return baseUsers.filter((user) => user.role === 'seller');
  }, [isCurrentUserSystem, users]);

  const selectedUser = useMemo(
    () => visibleUsers.find((user) => String(user.id) === String(selectedUserId)) || null,
    [visibleUsers, selectedUserId],
  );

  const canEditDataForSelectedUser = Boolean(selectedUser && canEditUserProfile(currentUser, selectedUser));
  const canEditPermissionsForSelectedUser = Boolean(selectedUser && canManageUserPermissions(currentUser, selectedUser));

  useEffect(() => {
    if (!selectedUser) {
      setDraft(DEFAULT_FORM);
      setPermissionDraft({});
      return;
    }

    setDraft({
      displayName: selectedUser.displayName || selectedUser.name || '',
      role: selectedUser.role === 'system' ? 'owner' : selectedUser.role,
      password: '',
      confirmPassword: '',
      avatar: selectedUser.avatar || '',
      nameColor: selectedUser.nameColor || '#0f172a',
      theme: selectedUser.theme || 'light',
    });
    setPermissionDraft(getEffectivePermissions(selectedUser));
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedUser) return;
    if (editorTab === 'data' && !canEditDataForSelectedUser && canEditPermissionsForSelectedUser) {
      setEditorTab('permissions');
    }
  }, [selectedUser, editorTab, canEditDataForSelectedUser, canEditPermissionsForSelectedUser]);

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return visibleUsers.filter((user) => {
      if (roleFilter !== 'Todos' && user.role !== roleFilter) return false;
      if (statusFilter === 'Activos' && !user.isActive) return false;
      if (statusFilter === 'Inactivos' && user.isActive) return false;
      if (!query) return true;

      return [user.displayName, user.name, user.role, user.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [visibleUsers, searchTerm, roleFilter, statusFilter]);

  const resetEditor = () => {
    setSelectedUserId(null);
    setDraft(DEFAULT_FORM);
    setPermissionDraft({});
    setEditorTab('data');
    setShowCreateMenu(false);
  };

  const startCreateUser = (role = 'owner') => {
    if (!isSharedUsersEnabled) {
      showNotification?.('info', 'Gestión de usuarios no disponible', 'Primero ejecutá el schema app_users en Supabase para habilitar subusuarios reales.');
      return;
    }
    setSelectedUserId(null);
    setDraft({ ...DEFAULT_FORM, role });
    setEditorTab('data');
    setShowCreateMenu(false);
  };

  const openDataEditor = (user) => {
    setSelectedUserId(user.id);
    setEditorTab('data');
  };

  const openPermissionsEditor = (user) => {
    setSelectedUserId(user.id);
    setEditorTab('permissions');
  };

  const validateDraft = () => {
    const trimmedName = draft.displayName.trim();
    if (!trimmedName) {
      showNotification?.('error', 'Nombre inválido', 'El nombre visible no puede quedar vacío.');
      return false;
    }

    if (selectedUserId === null && !draft.password.trim()) {
      showNotification?.('error', 'Contraseña inválida', 'La contraseña es obligatoria para crear el usuario.');
      return false;
    }

    if ((draft.password || draft.confirmPassword) && draft.password !== draft.confirmPassword) {
      showNotification?.('error', 'Contraseña distinta', 'La confirmación no coincide.');
      return false;
    }

    if (!['owner', 'seller'].includes(draft.role)) {
      showNotification?.('error', 'Rol inválido', 'Sólo se pueden crear Dueños o Usuarios de Caja.');
      return false;
    }

    return true;
  };

  const handleSubmitData = async () => {
    if (!validateDraft()) return;

    setIsSavingData(true);
    try {
      const payload = {
        displayName: draft.displayName.trim(),
        role: draft.role,
        avatar: String(draft.avatar || getInitialsFromName(draft.displayName, 'US')).trim(),
        nameColor: draft.nameColor,
        theme: draft.theme,
        password: draft.password,
      };

      const result = selectedUser
        ? await onUpdateUser?.(selectedUser, payload)
        : await onCreateUser?.(payload);

      if (result) {
        resetEditor();
      }
    } catch (error) {
      showNotification?.(
        'error',
        selectedUser ? 'No se pudo guardar el usuario' : 'No se pudo crear el usuario',
        error?.message || 'Revisa la configuracion de usuarios compartidos e intentalo nuevamente.',
      );
    } finally {
      setIsSavingData(false);
    }
  };

  const handleSavePermissions = async (applyNow) => {
    if (!selectedUser || !canEditPermissionsForSelectedUser) return;

    setIsSavingPermissions(true);
    try {
      const permissionsOverride = buildPermissionsOverride(selectedUser.role, permissionDraft);
      await onUpdatePermissions?.(selectedUser, permissionsOverride, applyNow);
    } catch (error) {
      showNotification?.(
        'error',
        'No se pudieron guardar los permisos',
        error?.message || 'Revisa la configuracion de permisos e intentalo nuevamente.',
      );
    } finally {
      setIsSavingPermissions(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(248,250,252,0.98)_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_36px_rgba(15,23,42,0.06)]">
      <div className="mb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          {isCurrentUserSystem ? 'Sistema' : 'Dueño'}
        </p>
        <h2 className="mt-1 text-[28px] leading-none font-black text-slate-900">
          Gestión de usuarios
        </h2>
        <p className="mt-1.5 text-sm font-medium text-slate-500">
          {isCurrentUserSystem
            ? 'Creá, editá, activá y configurá permisos para Dueños y Usuarios de Caja.'
            : 'Administrá sólo los permisos de los usuarios de caja.'}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[22px] border border-slate-200 bg-white/90 p-3 shadow-sm">
        <div className="relative min-w-[240px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar usuario, rol o ID..."
            className="h-11 w-full rounded-[16px] border border-slate-200 bg-slate-50 px-10 text-sm font-medium text-slate-700 outline-none"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          className="h-11 rounded-[16px] border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none"
        >
          <option value="Todos">Todos los roles</option>
          {isCurrentUserSystem && <option value="system">Sistema</option>}
          <option value="owner">Dueños</option>
          <option value="seller">Usuarios de Caja</option>
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-11 rounded-[16px] border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none"
        >
          <option value="Todos">Todos los estados</option>
          <option value="Activos">Activos</option>
          <option value="Inactivos">Inactivos</option>
        </select>

        {canCreateUsers && (
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setShowCreateMenu((prev) => !prev)}
              disabled={!isSharedUsersEnabled}
              className="inline-flex h-11 items-center gap-2 rounded-[16px] border border-fuchsia-200 bg-fuchsia-600 px-4 text-sm font-black text-white transition hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={15} />
              Nuevo usuario
              <ChevronDown size={14} className={`transition ${showCreateMenu ? 'rotate-180' : ''}`} />
            </button>

            {showCreateMenu && (
              <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-[18px] border border-slate-200 bg-white p-2 shadow-xl">
                <button
                  type="button"
                  onClick={() => startCreateUser('owner')}
                  className="flex w-full items-center justify-between rounded-[14px] px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:bg-fuchsia-50 hover:text-fuchsia-700"
                >
                  <span>Crear Dueño</span>
                  <Shield size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => startCreateUser('seller')}
                  className="flex w-full items-center justify-between rounded-[14px] px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:bg-fuchsia-50 hover:text-fuchsia-700"
                >
                  <span>Crear Usuario de Caja</span>
                  <UserRound size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {!isSharedUsersEnabled && (
        <div className="mb-4 rounded-[20px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm font-semibold text-amber-800">
          La gestión real de subusuarios todavía no está habilitada en esta base.
          Ejecutá el schema <span className="font-black">app_users</span> en Supabase para crear, editar o activar usuarios.
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onRetryEnableSharedUsers?.()}
              className="inline-flex items-center gap-2 rounded-[14px] border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 transition hover:bg-amber-100"
            >
              Reintentar conexión
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="rounded-[24px] border border-slate-200 bg-white/90 shadow-sm">
          <div className="grid grid-cols-[1.35fr_0.7fr_0.6fr_0.8fr_1fr] gap-3 border-b border-slate-200 px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 shrink-0">
            <span>Usuario</span>
            <span>Rol</span>
            <span>Tema</span>
            <span>Estado</span>
            <span className="text-right">Acciones</span>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {filteredUsers.map((user) => {
              const isSystemRow = user.role === 'system';
              const canEditData = canEditUserProfile(currentUser, user);
              const canEditPermissions = canManageUserPermissions(currentUser, user);
              const canToggleActive = canToggleUserActiveState(currentUser, user);

              return (
                <div
                  key={user.id}
                  className={`grid grid-cols-[1.35fr_0.7fr_0.6fr_0.8fr_1fr] gap-3 border-b border-slate-100 px-4 py-3 ${
                    selectedUserId === user.id ? 'bg-fuchsia-50/70' : 'bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        avatar={user.avatar}
                        name={user.displayName || user.name}
                        color={user.nameColor}
                        sizeClass="h-8 w-8"
                        textClass="text-[10px]"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-800">{user.displayName}</p>
                        <p className="truncate text-[11px] font-semibold text-slate-400">{user.id}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <UserDisplayBadge user={user} userCatalog={userCatalog} size="sm" />
                  </div>

                  <div className="flex items-center text-sm font-semibold text-slate-600">
                    {user.theme === 'dark' ? 'Oscuro' : 'Blanco'}
                  </div>

                  <div className="flex items-center">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                        user.isActive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-100 text-slate-500'
                      }`}
                    >
                      {user.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {canEditData && (
                      <button
                        type="button"
                        onClick={() => openDataEditor(user)}
                        disabled={!isSharedUsersEnabled}
                        className="rounded-[12px] border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Editar
                      </button>
                    )}
                    {canEditPermissions && (
                      <button
                        type="button"
                        onClick={() => openPermissionsEditor(user)}
                        disabled={!isSharedUsersEnabled}
                        className="rounded-[12px] border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Permisos
                      </button>
                    )}
                    {!isSystemRow && canToggleActive && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await onToggleUserActive?.(user);
                          } catch {
                            // manejado arriba
                          }
                        }}
                        disabled={!isSharedUsersEnabled}
                        className={`inline-flex items-center gap-1 rounded-[12px] border px-3 py-1.5 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          user.isActive
                            ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        <Power size={12} />
                        {user.isActive ? 'Desactivar' : 'Reactivar'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredUsers.length === 0 && (
              <div className="px-4 py-16 text-center text-sm font-semibold text-slate-400">
                No hay usuarios para mostrar con este filtro.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {(selectedUser ? (
            <div className="rounded-[22px] border border-slate-200 bg-white/90 p-2 shadow-sm">
              <div className="flex items-center gap-2">
                {canEditDataForSelectedUser && (
                  <button
                    type="button"
                    onClick={() => setEditorTab('data')}
                    className={`rounded-[14px] px-3 py-2 text-sm font-black transition ${
                      editorTab === 'data'
                        ? 'bg-fuchsia-600 text-white'
                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    Datos
                  </button>
                )}
                {canEditPermissionsForSelectedUser && (
                  <button
                    type="button"
                    onClick={() => setEditorTab('permissions')}
                    className={`rounded-[14px] px-3 py-2 text-sm font-black transition ${
                      editorTab === 'permissions'
                        ? 'bg-fuchsia-600 text-white'
                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    Permisos
                  </button>
                )}
                <button
                  type="button"
                  onClick={resetEditor}
                  className="ml-auto rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : (
            canCreateUsers && (
              <div className="rounded-[22px] border border-slate-200 bg-white/90 p-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditorTab('data')}
                    className="rounded-[14px] bg-fuchsia-600 px-3 py-2 text-sm font-black text-white"
                  >
                    Datos
                  </button>
                </div>
              </div>
            )
          ))}

          {selectedUser && editorTab === 'permissions' && canEditPermissionsForSelectedUser ? (
            <UserPermissionsEditor
              user={selectedUser}
              permissions={permissionDraft}
              onChange={setPermissionDraft}
              onSave={handleSavePermissions}
              isSaving={isSavingPermissions}
              canEdit={isSharedUsersEnabled}
            />
          ) : (
            ((selectedUser && canEditDataForSelectedUser) || (!selectedUser && canCreateUsers)) && (
              <UserFormCard
                mode={selectedUser ? 'edit' : 'create'}
                value={draft}
                onChange={setDraft}
                onSubmit={handleSubmitData}
                onCancel={selectedUser ? resetEditor : undefined}
                isSaving={isSavingData}
              />
            )
          )}

          <div className="rounded-[22px] border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <UserRound size={15} className="text-slate-500" />
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                Reglas
              </p>
            </div>
            <ul className="space-y-2 text-sm font-medium text-slate-600">
              <li>El rol Sistema es único y no se puede desactivar.</li>
              <li>Sistema puede gestionar Dueños y Usuarios de Caja.</li>
              <li>Dueño sólo puede modificar permisos de Usuarios de Caja.</li>
              <li>Los permisos se pueden guardar para la próxima sesión o aplicar al instante.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
