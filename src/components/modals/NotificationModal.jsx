// src/components/modals/NotificationModal.jsx
// ♻️ REFACTOR: Extraído de AppModals.jsx — Modal genérico de notificación

import React from 'react';
import {
  X,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';

const NOTIFICATION_STYLES = {
  info: {
    icon: <Info size={32} className="text-blue-500" />,
    bgHeader: 'bg-blue-500',
    borderClass: 'border-blue-100',
    btnClass: 'bg-blue-600 hover:bg-blue-700',
  },
  success: {
    icon: <CheckCircle size={32} className="text-green-500" />,
    bgHeader: 'bg-gradient-to-r from-green-500 to-emerald-600',
    borderClass: 'border-green-100',
    btnClass: 'bg-green-600 hover:bg-green-700',
  },
  error: {
    icon: <XCircle size={32} className="text-red-500" />,
    bgHeader: 'bg-gradient-to-r from-red-500 to-red-600',
    borderClass: 'border-red-100',
    btnClass: 'bg-red-600 hover:bg-red-700',
  },
  warning: {
    icon: <AlertTriangle size={32} className="text-amber-500" />,
    bgHeader: 'bg-gradient-to-r from-amber-400 to-orange-500',
    borderClass: 'border-amber-100',
    btnClass: 'bg-amber-500 hover:bg-amber-600',
  },
};

export const NotificationModal = ({ isOpen, onClose, type, title, message }) => {
  if (!isOpen) return null;

  // ♻️ REFACTOR: Lookup por objeto en vez de cadena if-else
  const style = NOTIFICATION_STYLES[type] || NOTIFICATION_STYLES.info;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden scale-100 transform transition-all">
        <div className={`h-2 w-full ${style.bgHeader}`}></div>
        
        <div className="p-6 flex flex-col items-center text-center">
          <div className={`w-16 h-16 rounded-full bg-slate-50 border-4 ${style.borderClass} flex items-center justify-center mb-4 shadow-sm`}>
            {style.icon}
          </div>
          
          <h3 className="text-lg font-bold text-slate-800 mb-2 leading-tight">
            {title}
          </h3>
          
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            {message}
          </p>

          <button 
            onClick={onClose}
            className={`w-full py-2.5 rounded-lg text-white font-bold text-sm shadow-md transition-all active:scale-95 ${style.btnClass}`}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
