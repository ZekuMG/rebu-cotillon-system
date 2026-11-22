import { useEffect } from 'react';

export default function useDialogFocus(dialogRef, onClose, busyRef) {
  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const notificationButton = document.querySelector('[data-rebu-notification] button');
    if (notificationButton) notificationButton.focus();
    else if (window.matchMedia('(min-width: 641px)').matches) {
      dialog?.querySelector('[data-dialog-initial-focus], input, button')?.focus();
    } else dialog?.focus();
    const handleKey = (event) => {
      if (event.defaultPrevented) return;
      const notification = document.querySelector('[data-rebu-notification]');
      if (notification?.getClientRects().length) {
        const acknowledge = notification.querySelector('button');
        if (event.key === 'Tab') { event.preventDefault(); acknowledge?.focus(); }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          acknowledge?.click();
          requestAnimationFrame(() => dialog?.querySelector('input:not(:disabled), button:not(:disabled)')?.focus());
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button, input, textarea, select, [tabindex="0"]')]
        .filter((element) => !element.matches(':disabled') && element.getClientRects().length > 0);
      if (!controls.length) { event.preventDefault(); dialog.focus(); return; }
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      const topNoticeButton = document.querySelector('[data-rebu-notification] button');
      if (topNoticeButton) topNoticeButton.focus();
      else if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [dialogRef, onClose, busyRef]);
}
