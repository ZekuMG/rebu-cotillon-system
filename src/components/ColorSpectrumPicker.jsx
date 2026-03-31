import React from 'react';

export default function ColorSpectrumPicker({
  value = '#0f172a',
  onChange,
  label = 'Color del nombre',
  hint = 'Elegí cualquier tono del espectro.',
}) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            {label}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {hint}
          </p>
        </div>
        <div
          className="h-10 w-10 rounded-[14px] border border-white shadow-[0_8px_18px_rgba(15,23,42,0.12)]"
          style={{ backgroundColor: value }}
        />
      </div>

      <label
        className="block overflow-hidden rounded-[18px] border border-slate-200 bg-white px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
        style={{
          backgroundImage:
            'linear-gradient(90deg,#ff4d4d 0%,#ff9a3d 16%,#ffe44d 32%,#48d597 48%,#3bb2ff 64%,#6f6cff 80%,#d84dff 100%)',
        }}
      >
        <input
          type="color"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          className="h-11 w-full cursor-pointer appearance-none border-0 bg-transparent p-0 opacity-0"
        />
      </label>

      <div className="mt-3 flex items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-3 py-2">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
          Hex
        </span>
        <input
          type="text"
          value={value.toUpperCase()}
          onChange={(event) => {
            const nextValue = event.target.value.toUpperCase();
            if (/^#?[0-9A-F]{0,6}$/.test(nextValue)) {
              const normalized = nextValue.startsWith('#') ? nextValue : `#${nextValue}`;
              onChange?.(normalized.slice(0, 7));
            }
          }}
          className="w-full bg-transparent text-sm font-black tracking-[0.08em] text-slate-700 outline-none"
        />
      </div>
    </div>
  );
}
