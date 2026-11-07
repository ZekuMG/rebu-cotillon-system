import React, { useEffect, useRef } from 'react';
import { ChevronDown, User } from 'lucide-react';

export default function PosSaleUserPicker({ users, selectedUser, onSelect, cartId, disabled }) {
  const pickerRef = useRef(null);
  const closeFrameRef = useRef(null);
  const closePicker = () => {
    // Let the label finish activating its radio before hiding or refocusing it.
    // Closing synchronously can cancel the change or crash Chromium/Electron.
    cancelAnimationFrame(closeFrameRef.current);
    closeFrameRef.current = requestAnimationFrame(() => {
      const picker = pickerRef.current;
      if (!picker) return;
      const restoreFocus = picker.contains(document.activeElement) || document.activeElement === document.body;
      picker.open = false;
      if (restoreFocus) picker.querySelector('summary')?.focus();
    });
  };

  useEffect(() => {
    const closeOutside = (event) => {
      const picker = pickerRef.current;
      if (picker && !picker.contains(event.target)) picker.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      cancelAnimationFrame(closeFrameRef.current);
    };
  }, []);

  return (
    <div className="pos-sale-user my-2 min-w-0">
      <span id="pos-sale-user-label" className="sr-only">Empleado que atiende</span>
      <details
        ref={pickerRef}
        className="pos-sale-user-picker relative"
        onBlur={(event) => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closePicker();
        }}
      >
        <summary
          aria-labelledby="pos-sale-user-label pos-sale-user-value"
          aria-describedby="pos-sale-user-hint"
          title="Elegí al empleado que atiende. Obligatorio para cobrar."
          onClick={(event) => { if (disabled) event.preventDefault(); }}
          aria-disabled={disabled}
          className="flex h-[34px] cursor-pointer list-none items-center gap-2 rounded-[5px] border px-2.5 text-xs font-semibold"
        >
          <User size={14} aria-hidden="true" />
          <span className="pos-sale-user-caption text-[11px] font-medium">Atiende</span>
          <span id="pos-sale-user-value" className="min-w-0 flex-1 truncate">
            {selectedUser?.displayName || 'Elegir usuario de caja…'}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className="pos-sale-user-menu absolute inset-x-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-[5px] border p-1" role="radiogroup" aria-label="Empleado que atiende" aria-required="true">
          {users.length === 0 ? (
            <p className="px-2 py-2 text-xs">No hay empleados activos disponibles.</p>
          ) : users.map((user) => (
            <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs">
              <input
                type="radio"
                name={`pos-sale-user-${cartId}`}
                value={String(user.id)}
                checked={String(user.id) === String(selectedUser?.id)}
                disabled={disabled}
                onChange={() => {
                  onSelect(String(user.id));
                  closePicker();
                }}
                onClick={() => {
                  if (String(user.id) === String(selectedUser?.id)) closePicker();
                }}
              />
              <span className="min-w-0 flex-1 truncate">{user.displayName}</span>
            </label>
          ))}
        </div>
      </details>
      <p id="pos-sale-user-hint" className="sr-only" aria-live="polite">
        {selectedUser ? 'Responsable de esta venta.' : 'Elegí al empleado que atiende para poder cobrar.'}
      </p>
    </div>
  );
}
