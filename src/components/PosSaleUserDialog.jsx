import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, User } from 'lucide-react';

export default function PosSaleUserDialog({ users, selectedUser, onChoose, onClose, pending }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      const shouldRestoreFocus = dialog.contains(document.activeElement) || document.activeElement === document.body;
      dialog.close();
      if (shouldRestoreFocus && previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="pos-sale-user-dialog"
      aria-labelledby="pos-sale-user-question"
      aria-describedby="pos-sale-user-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div className="pos-sale-user-dialog-content">
        <h2 id="pos-sale-user-question">¿Quién hizo la venta?</h2>
        <p id="pos-sale-user-description">Elegí al empleado que atendió para continuar con el cobro.</p>
        <div className="pos-sale-user-options" aria-busy={pending}>
          {users.length === 0 ? (
            <p role="status">No hay empleados activos disponibles para registrar la venta.</p>
          ) : users.map((user) => (
            <button
              key={user.id}
              type="button"
              disabled={pending}
              className={`pos-sale-user-option ${String(user.id) === String(selectedUser?.id) ? 'is-selected' : ''}`}
              onClick={() => onChoose(String(user.id))}
            >
              <User size={22} aria-hidden="true" />
              <span>{user.displayName}</span>
              {String(user.id) === String(selectedUser?.id) ? <CheckCircle size={18} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
        <button type="button" className="pos-sale-user-cancel" disabled={pending} onClick={onClose}>
          Volver al carrito
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
