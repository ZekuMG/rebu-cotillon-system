import React, { useMemo } from 'react';
import { RefreshCcw, Shield, Sparkles } from 'lucide-react';
import {
  APP_PERMISSION_GROUPS,
  APP_PERMISSION_KEYS,
  getPermissionSummary,
  getRolePresetPermissions,
  sanitizePermissionSet,
} from '../utils/userPermissions';

function PermissionToggle({ checked, onChange, label, description }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-3 rounded-[14px] border px-3 py-2 text-left transition ${
        checked
          ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-black">{label}</p>
        {description && <p className="mt-0.5 text-xs font-medium text-slate-400">{description}</p>}
      </div>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
          checked ? 'border-fuchsia-300 bg-fuchsia-500' : 'border-slate-200 bg-slate-200'
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-1'}`}
        />
      </span>
    </button>
  );
}

export default function UserPermissionsEditor({
  user,
  permissions,
  onChange,
  onSave,
  isSaving = false,
  canEdit = false,
}) {
  const permissionSummary = useMemo(() => getPermissionSummary(permissions), [permissions]);

  if (!user) {
    return (
      <div className="rounded-[22px] border border-slate-200 bg-white/90 p-5 text-sm font-semibold text-slate-500 shadow-sm">
        Seleccioná un usuario para editar sus permisos.
      </div>
    );
  }

  const setAllPermissions = (nextValue) => {
    const nextPermissions = sanitizePermissionSet(
      Object.fromEntries(APP_PERMISSION_KEYS.map((key) => [key, nextValue])),
    );
    onChange?.(nextPermissions);
  };

  const resetToPreset = () => {
    onChange?.(sanitizePermissionSet(getRolePresetPermissions(user.role)));
  };

  const handleGroupToggle = (group, nextValue) => {
    const nextPermissions = sanitizePermissionSet({
      ...permissions,
      [group.viewKey]: nextValue,
    });
    group.actions.forEach((action) => {
      nextPermissions[action.key] = nextValue;
    });
    onChange?.(sanitizePermissionSet(nextPermissions));
  };

  const handlePermissionToggle = (permissionKey, nextValue) => {
    onChange?.(sanitizePermissionSet({
      ...permissions,
      [permissionKey]: nextValue,
    }));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-slate-200 bg-white/95 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              Permisos
            </p>
            <h3 className="mt-1 text-xl font-black text-slate-900">
              Permisos de {user.displayName || user.name}
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Ajustá módulos y acciones sensibles del sistema.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetToPreset}
              disabled={!canEdit || isSaving}
              className="inline-flex items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCcw size={13} />
              Usar preset del rol
            </button>
            <button
              type="button"
              onClick={() => setAllPermissions(true)}
              disabled={!canEdit || isSaving}
              className="inline-flex items-center gap-2 rounded-[14px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={13} />
              Habilitar todo
            </button>
            <button
              type="button"
              onClick={() => setAllPermissions(false)}
              disabled={!canEdit || isSaving}
              className="inline-flex items-center gap-2 rounded-[14px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Shield size={13} />
              Quitar todo
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white/95 p-4 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
          Vista previa
        </p>
        <div className="mt-3 grid gap-4 xl:grid-cols-2">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Pantallas visibles</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {permissionSummary.visibleTabs.length > 0 ? (
                permissionSummary.visibleTabs.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-sky-700"
                  >
                    {label}
                  </span>
                ))
              ) : (
                <span className="text-sm font-semibold text-slate-400">Sin pantallas operativas visibles.</span>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Acciones habilitadas</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {permissionSummary.enabledActions.length > 0 ? (
                permissionSummary.enabledActions.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-violet-700"
                  >
                    {label}
                  </span>
                ))
              ) : (
                <span className="text-sm font-semibold text-slate-400">Sin acciones sensibles habilitadas.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {APP_PERMISSION_GROUPS.map((group) => (
            <div key={group.id} className="rounded-[22px] border border-slate-200 bg-white/95 p-4 shadow-sm">
              <PermissionToggle
                checked={Boolean(permissions[group.viewKey])}
                onChange={(nextValue) => handleGroupToggle(group, nextValue)}
                label={group.label}
                description="Mostrar u ocultar este módulo en la app."
              />

              {group.actions.length > 0 && (
                <div className="mt-3 space-y-2 pl-2">
                  {group.actions.map((action) => (
                    <PermissionToggle
                      key={action.key}
                      checked={Boolean(permissions[action.key])}
                      onChange={(nextValue) => handlePermissionToggle(action.key, nextValue)}
                      label={action.label}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onSave?.(false)}
            disabled={isSaving}
            className="rounded-[14px] border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Guardando...' : 'Guardar próxima sesión'}
          </button>
          <button
            type="button"
            onClick={() => onSave?.(true)}
            disabled={isSaving}
            className="rounded-[14px] border border-fuchsia-200 bg-fuchsia-600 px-4 py-2 text-sm font-black text-white transition hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Aplicando...' : 'Guardar y aplicar ahora'}
          </button>
        </div>
      )}
    </div>
  );
}
