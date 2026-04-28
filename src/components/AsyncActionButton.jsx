import React from 'react';
import { RefreshCw } from 'lucide-react';

export default function AsyncActionButton({
  pending = false,
  disabled = false,
  loadingLabel = 'Procesando...',
  loadingContent = null,
  children,
  className = '',
  type = 'button',
  onAction,
  onClick,
  ...props
}) {
  const handleClick = async (event) => {
    if (pending || disabled) {
      event.preventDefault();
      return;
    }

    if (type === 'submit') {
      onClick?.(event);
      return;
    }

    if (onAction) {
      await onAction(event);
      return;
    }

    await onClick?.(event);
  };

  return (
    <button
      type={type}
      disabled={disabled || pending}
      onClick={handleClick}
      className={className}
      {...props}
    >
      {pending
        ? loadingContent || (
            <>
              <RefreshCw size={14} className="animate-spin" />
              {loadingLabel}
            </>
          )
        : children}
    </button>
  );
}
