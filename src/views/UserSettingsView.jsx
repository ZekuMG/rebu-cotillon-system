import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Palette, Save, Shield, UserRound, Printer } from 'lucide-react';
import {
  getInitialsFromName,
  getRoleLabel,
  normalizeMetricsViewMode,
} from '../utils/appUsers';
import UserAvatar from '../components/UserAvatar';
import ColorSpectrumPicker from '../components/ColorSpectrumPicker';
import AsyncActionButton from '../components/AsyncActionButton';

const METRICS_VIEW_MODE_STORAGE_KEY = 'rebu_metrics_view_mode_v1';

const getLocalMetricsViewMode = () => {
  try {
    return normalizeMetricsViewMode(window.localStorage.getItem(METRICS_VIEW_MODE_STORAGE_KEY));
  } catch {
    return 'modern';
  }
};

export default function UserSettingsView({
  currentUser,
  onSaveSettings,
  showNotification,
}) {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nameColor, setNameColor] = useState('#0f172a');
  const [theme, setTheme] = useState('light');
  const [metricsViewMode, setMetricsViewMode] = useState('modern');
  const [thermalPrinterWidthMm, setThermalPrinterWidthMm] = useState(80);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setName(currentUser?.displayName || currentUser?.name || '');
    setAvatar(currentUser?.avatar || '');
    setPassword('');
    setConfirmPassword('');
    setNameColor(currentUser?.nameColor || '#0f172a');
    setTheme(currentUser?.theme || 'light');
    setMetricsViewMode(normalizeMetricsViewMode(currentUser?.metricsViewMode || getLocalMetricsViewMode()));
    
    try {
      const saved = window.localStorage.getItem('rebu_thermal_printer_width_mm');
      setThermalPrinterWidthMm(saved ? Number(saved) : 80);
    } catch {
      setThermalPrinterWidthMm(80);
    }
  }, [currentUser]);

  const previewRole = useMemo(
    () => getRoleLabel(currentUser?.role),
    [currentUser?.role],
  );

  const previewAvatar = useMemo(
    () => String(avatar || getInitialsFromName(name || currentUser?.name || 'Usuario', 'US')).trim(),
    [avatar, name, currentUser?.name],
  );

  const handleAvatarFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showNotification?.('error', 'Nombre inválido', 'El nombre no puede quedar vacío.');
      return;
    }

    if ((password || confirmPassword) && password !== confirmPassword) {
      showNotification?.('error', 'Contraseña distinta', 'La confirmación no coincide.');
      return;
    }

    setIsSaving(true);
    try {
      await onSaveSettings?.({
        name: trimmedName,
        displayName: trimmedName,
        avatar: previewAvatar,
        password: password.trim(),
        nameColor,
        theme,
        metricsViewMode,
      });

      try {
        window.localStorage.setItem('rebu_thermal_printer_width_mm', String(thermalPrinterWidthMm));
      } catch {
        // localStorage no disponible
      }

      setPassword('');
      setConfirmPassword('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="user-settings-view h-full overflow-y-auto rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(248,250,252,0.98)_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_36px_rgba(15,23,42,0.06)]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Ajustes
          </p>
          <h3 className="mt-1 text-[28px] leading-none font-black text-slate-900">
            Perfil de usuario
          </h3>
          <p className="mt-1.5 text-sm font-medium text-slate-500">
            Modificá tu nombre, contraseña, avatar, color visible y preferencias de pantalla.
          </p>
        </div>

        <AsyncActionButton
          type="button"
          onAction={handleSave}
          pending={isSaving}
          disabled={isSaving}
          loadingLabel="Guardando..."
          className="inline-flex items-center gap-2 rounded-[16px] border border-fuchsia-200 bg-fuchsia-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={15} />
          Guardar cambios
        </AsyncActionButton>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <UserRound size={16} className="text-slate-500" />
            <h4 className="text-sm font-black uppercase tracking-[0.12em] text-slate-600">
              Datos personales
            </h4>
          </div>

          <div className="grid gap-3">
            <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                Nombre
              </span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Avatar / iniciales
                </span>
                <input
                  type="text"
                  maxLength={4}
                  value={avatar}
                  onChange={(event) => setAvatar(event.target.value.toUpperCase())}
                  className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-black uppercase text-slate-700 outline-none"
                />
                <label className="mt-2 inline-flex cursor-pointer items-center justify-center rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50">
                  Elegir imagen
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFileChange} />
                </label>
              </label>

              <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Rol
                </span>
                <div className="mt-2 rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700">
                  {previewRole}
                </div>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Nueva contraseña
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Dejar vacía para mantener"
                  className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
                />
              </label>

              <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Confirmar
                </span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Sólo si cambias la contraseña"
                  className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Palette size={16} className="text-slate-500" />
              <h4 className="text-sm font-black uppercase tracking-[0.12em] text-slate-600">
                Color del nombre
              </h4>
            </div>

            <div className="mb-4 rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(241,245,249,0.95)_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                Vista previa
              </p>
              <div className="mt-2 flex items-center gap-3">
                <UserAvatar
                  avatar={previewAvatar}
                  name={name || currentUser?.displayName || currentUser?.name || 'Usuario'}
                  color={nameColor}
                  sizeClass="h-10 w-10"
                  textClass="text-sm"
                />
                <div>
                  <p className="text-xl font-black" style={{ color: nameColor }}>
                    {name || currentUser?.displayName || currentUser?.name || 'Usuario'}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{previewRole}</p>
                </div>
              </div>
            </div>

            <ColorSpectrumPicker
              value={nameColor}
              onChange={setNameColor}
              hint="Mové por todo el espectro y elegí el tono que más te guste."
            />
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Shield size={16} className="text-slate-500" />
              <h4 className="text-sm font-black uppercase tracking-[0.12em] text-slate-600">
                Tema
              </h4>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`rounded-[18px] border px-4 py-3 text-left transition ${
                  theme === 'light'
                    ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.12em]">Blanco</p>
                <p className="mt-1 text-sm font-semibold">Interfaz clara y luminosa.</p>
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`rounded-[18px] border px-4 py-3 text-left transition ${
                  theme === 'dark'
                    ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.12em]">Oscuro</p>
                <p className="mt-1 text-sm font-semibold">Azulado nocturno para baja luz.</p>
              </button>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-slate-500" />
              <h4 className="text-sm font-black uppercase tracking-[0.12em] text-slate-600">
                Métricas
              </h4>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMetricsViewMode('modern')}
                className={`rounded-[18px] border px-4 py-3 text-left transition ${
                  metricsViewMode === 'modern'
                    ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.12em]">Nueva</p>
                <p className="mt-1 text-sm font-semibold">Tablero operativo compacto.</p>
              </button>

              <button
                type="button"
                onClick={() => setMetricsViewMode('legacy')}
                className={`rounded-[18px] border px-4 py-3 text-left transition ${
                  metricsViewMode === 'legacy'
                    ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.12em]">Legacy</p>
                <p className="mt-1 text-sm font-semibold">Vista completa anterior.</p>
              </button>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Printer size={16} className="text-slate-500" />
              <h4 className="text-sm font-black uppercase tracking-[0.12em] text-slate-600">
                Impresora térmica
              </h4>
            </div>

            <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                Ancho de papel (mm)
              </span>
              <p className="mt-1 text-xs text-slate-600 mb-2">
                Xprinter XP-58: 58mm | Estándar: 80mm | Grande: 100mm
              </p>
              <div className="flex gap-2 mb-2">
                {[58, 80, 100].map((width) => (
                  <button
                    key={width}
                    type="button"
                    onClick={() => setThermalPrinterWidthMm(width)}
                    className={`flex-1 rounded-[12px] border px-3 py-2 text-sm font-bold transition ${
                      thermalPrinterWidthMm === width
                        ? 'border-fuchsia-500 bg-fuchsia-100 text-fuchsia-700'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-fuchsia-300'
                    }`}
                  >
                    {width}mm
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="30"
                max="200"
                step="1"
                value={thermalPrinterWidthMm}
                onChange={(e) => setThermalPrinterWidthMm(Number(e.target.value) || 80)}
                className="w-full rounded-[12px] border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-fuchsia-400"
                placeholder="Personalizado"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
