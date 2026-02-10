// src/components/AppModals.jsx
// ♻️ REFACTOR: Barrel de re-exports — Modales divididos en módulos temáticos
// Mantiene compatibilidad con todos los imports existentes en App.jsx
//
// Estructura:
//   modals/NotificationModal.jsx    → NotificationModal
//   modals/BarcodeModals.jsx        → BarcodeNotFoundModal, BarcodeDuplicateModal
//   modals/ClientSelectionModal.jsx → ClientSelectionModal
//   modals/CashModals.jsx           → OpeningBalanceModal, ClosingTimeModal, CloseCashModal, AutoCloseAlertModal
//   modals/ProductModals.jsx        → CategoryMultiSelect, AddProductModal, EditProductModal, DeleteProductModal
//   modals/TransactionModals.jsx    → EditTransactionModal, RefundModal
//   modals/SaleModals.jsx           → ImageModal, SaleSuccessModal, TicketModal

export { NotificationModal } from './modals/NotificationModal';
export { BarcodeNotFoundModal, BarcodeDuplicateModal } from './modals/BarcodeModals';
export { ClientSelectionModal } from './modals/ClientSelectionModal';
export { OpeningBalanceModal, ClosingTimeModal, CloseCashModal, AutoCloseAlertModal } from './modals/CashModals';
export { CategoryMultiSelect, AddProductModal, EditProductModal, DeleteProductModal } from './modals/ProductModals';
export { EditTransactionModal, RefundModal } from './modals/TransactionModals';
export { ImageModal, SaleSuccessModal, TicketModal } from './modals/SaleModals';
