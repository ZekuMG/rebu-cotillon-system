import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Building2,
  Edit2,
  FileText,
  Globe,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  Search,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import AsyncActionButton from '../components/AsyncActionButton';
import usePendingAction from '../hooks/usePendingAction';
import { hasPermission } from '../utils/userPermissions';
import useIncrementalFeed from '../hooks/useIncrementalFeed';

const DEFAULT_FORM = {
  name: '',
  contactType: 'supplier',
  phone: '',
  email: '',
  address: '',
  website: '',
  taxId: '',
  contactPerson: '',
  notes: '',
  isActive: true,
};

const CONTACT_TYPE_META = {
  supplier: {
    label: 'Proveedor',
    tone: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  wholesaler: {
    label: 'Mayorista',
    tone: 'border-violet-200 bg-violet-50 text-violet-700',
  },
};

const STATUS_META = {
  active: {
    label: 'Activo',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  inactive: {
    label: 'Inactivo',
    tone: 'border-slate-200 bg-slate-100 text-slate-500',
  },
};

const formatDateShort = (value) => {
  if (!value) return '--/--/--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--/--/--';
  return parsed.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function ContactTypeBadge({ type = 'supplier' }) {
  const meta = CONTACT_TYPE_META[type] || CONTACT_TYPE_META.supplier;
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${meta.tone}`}>
      {meta.label}
    </span>
  );
}

function ContactStatusBadge({ isActive = true }) {
  const meta = isActive ? STATUS_META.active : STATUS_META.inactive;
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${meta.tone}`}>
      {meta.label}
    </span>
  );
}

function AgendaFormModal({
  isOpen,
  mode = 'create',
  formData,
  setFormData,
  onClose,
  onSubmit,
  submitPending = false,
  isOfflineReadOnly = false,
}) {
  if (!isOpen) return null;

  const isEdit = mode === 'edit';

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 backdrop-blur-[2px]" style={{ backgroundColor: 'rgba(15, 23, 42, 0.3)' }}>
      <div className="w-full max-w-3xl max-h-[90vh] rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.16)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 shrink-0">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              {isEdit ? 'Editar contacto' : 'Nuevo contacto'}
            </p>
            <h3 className="mt-1 text-xl font-black text-slate-900">
              {isEdit ? formData.name || 'Contacto' : 'Alta en agenda'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
          <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3 md:col-span-2">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Nombre / empresa
            </span>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
              className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
            />
          </label>

          <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Tipo
            </span>
            <select
              value={formData.contactType}
              onChange={(event) => setFormData((prev) => ({ ...prev, contactType: event.target.value }))}
              className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
            >
              <option value="supplier">Proveedor</option>
              <option value="wholesaler">Mayorista</option>
            </select>
          </label>

          <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Persona de contacto
            </span>
            <input
              type="text"
              value={formData.contactPerson}
              onChange={(event) => setFormData((prev) => ({ ...prev, contactPerson: event.target.value }))}
              className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
            />
          </label>

          <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Teléfono
            </span>
            <input
              type="text"
              value={formData.phone}
              onChange={(event) => setFormData((prev) => ({ ...prev, phone: event.target.value }))}
              className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
            />
          </label>

          <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Email
            </span>
            <input
              type="email"
              value={formData.email}
              onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
              className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
            />
          </label>

          <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Web
            </span>
            <input
              type="text"
              value={formData.website}
              onChange={(event) => setFormData((prev) => ({ ...prev, website: event.target.value }))}
              className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
            />
          </label>

          <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              CUIT / dato fiscal
            </span>
            <input
              type="text"
              value={formData.taxId}
              onChange={(event) => setFormData((prev) => ({ ...prev, taxId: event.target.value }))}
              className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
            />
          </label>

          <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3 md:col-span-2">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Dirección
            </span>
            <input
              type="text"
              value={formData.address}
              onChange={(event) => setFormData((prev) => ({ ...prev, address: event.target.value }))}
              className="mt-2 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
            />
          </label>

          <label className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-3 md:col-span-2">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Notas
            </span>
            <textarea
              rows={3}
              value={formData.notes}
              onChange={(event) => setFormData((prev) => ({ ...prev, notes: event.target.value }))}
              className="mt-2 w-full resize-none rounded-[14px] border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
            />
          </label>
        </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 shrink-0 bg-white">
          <p className="text-xs font-semibold text-slate-500">
            {isOfflineReadOnly ? 'Modo solo lectura activo.' : 'Los cambios impactan en Supabase y en el snapshot offline.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[14px] border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
            <AsyncActionButton
              type="button"
              onAction={onSubmit}
              pending={submitPending}
              disabled={isOfflineReadOnly}
              loadingLabel={isEdit ? 'Guardando...' : 'Creando...'}
              className="inline-flex items-center gap-2 rounded-[14px] border border-emerald-200 bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={14} />
              {isEdit ? 'Guardar cambios' : 'Crear contacto'}
            </AsyncActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgendaView({
  contacts = [],
  currentUser,
  isOfflineReadOnly = false,
  onCreateContact,
  onUpdateContact,
  onDeleteContact,
}) {
  const { isPending, runAction } = usePendingAction();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [statusFilter, setStatusFilter] = useState('Activos');
  const [sortBy, setSortBy] = useState('name_asc');
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [formData, setFormData] = useState(DEFAULT_FORM);

  const canCreateAgenda = hasPermission(currentUser, 'agenda.create') && !isOfflineReadOnly;
  const canEditAgenda = hasPermission(currentUser, 'agenda.edit') && !isOfflineReadOnly;
  const canDeleteAgenda = hasPermission(currentUser, 'agenda.delete') && !isOfflineReadOnly;

  const sortedContacts = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);

    const filtered = (Array.isArray(contacts) ? contacts : []).filter((contact) => {
      if (!contact) return false;

      const matchesSearch =
        !normalizedSearch ||
        [
          contact.name,
          contact.phone,
          contact.email,
          contact.taxId,
          contact.contactPerson,
          contact.website,
          contact.address,
        ].some((value) => normalizeText(value).includes(normalizedSearch));

      const matchesType =
        typeFilter === 'Todos' ||
        (typeFilter === 'Proveedor' && contact.contactType === 'supplier') ||
        (typeFilter === 'Mayorista' && contact.contactType === 'wholesaler');

      const matchesStatus =
        statusFilter === 'Todos' ||
        (statusFilter === 'Activos' && contact.isActive !== false) ||
        (statusFilter === 'Inactivos' && contact.isActive === false);

      return matchesSearch && matchesType && matchesStatus;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'name_desc') return String(b.name || '').localeCompare(String(a.name || ''));
      if (sortBy === 'created_desc') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      if (sortBy === 'created_asc') return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    return filtered;
  }, [contacts, searchTerm, sortBy, statusFilter, typeFilter]);

  const selectedContact = useMemo(
    () =>
      sortedContacts.find((contact) => String(contact.id) === String(selectedContactId)) ||
      (Array.isArray(contacts) ? contacts : []).find((contact) => String(contact.id) === String(selectedContactId)) ||
      null,
    [contacts, selectedContactId, sortedContacts],
  );

  const hudStats = useMemo(() => {
    const allContacts = Array.isArray(contacts) ? contacts.filter(Boolean) : [];
    const visibleContacts = sortedContacts;

    return {
      total: allContacts.length,
      visible: visibleContacts.length,
      active: visibleContacts.filter((contact) => contact.isActive !== false).length,
      inactive: visibleContacts.filter((contact) => contact.isActive === false).length,
      suppliers: visibleContacts.filter((contact) => contact.contactType === 'supplier').length,
      wholesalers: visibleContacts.filter((contact) => contact.contactType === 'wholesaler').length,
    };
  }, [contacts, sortedContacts]);
  const visibleContactsFeed = useIncrementalFeed(sortedContacts, {
    resetKey: `${searchTerm}|${typeFilter}|${statusFilter}|${sortBy}|${sortedContacts.length}`,
  });

  const openCreateModal = () => {
    setModalMode('create');
    setFormData(DEFAULT_FORM);
    setIsModalOpen(true);
  };

  const openEditModal = (contact) => {
    setModalMode('edit');
    setFormData({
      name: contact.name || '',
      contactType: contact.contactType || 'supplier',
      phone: contact.phone || '',
      email: contact.email || '',
      address: contact.address || '',
      website: contact.website || '',
      taxId: contact.taxId || '',
      contactPerson: contact.contactPerson || '',
      notes: contact.notes || '',
      isActive: contact.isActive !== false,
    });
    setSelectedContactId(contact.id);
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;

    if (modalMode === 'create') {
      const created = await onCreateContact?.(formData);
      if (created?.id) {
        setSelectedContactId(created.id);
        setIsModalOpen(false);
      }
      return;
    }

    if (!selectedContact?.id) return;
    const updated = await onUpdateContact?.(selectedContact.id, formData);
    if (updated?.id || updated === true) {
      setIsModalOpen(false);
    }
  };

  const handleDelete = async (contact) => {
    if (!contact?.id) return;
    const confirmed = window.confirm(`¿Desactivar a ${contact.name}?`);
    if (!confirmed) return;

    const result = await onDeleteContact?.(contact.id);
    if (result) {
      setSelectedContactId(contact.id);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 gap-4">
      <section className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-slate-200 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Agenda comercial
                </p>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  {hudStats.total} registros totales
                </span>
              </div>
              <h2 className="mt-1 text-lg font-black leading-tight text-slate-900">Proveedores y mayoristas</h2>
              <p className="mt-1 max-w-3xl text-xs font-medium text-slate-500">
                Directorio operativo para compras, reposición y seguimiento comercial con filtros rápidos y detalle inmediato.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="grid gap-2 grid-cols-2">
                <div className="h-9 rounded-[12px] border border-sky-200 bg-sky-50 px-3 py-2 flex items-center justify-center">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.12em] text-sky-600 leading-none">Proveedores</p>
                    <p className="text-xs font-black text-sky-800 leading-none">{hudStats.suppliers}</p>
                  </div>
                </div>
                <div className="h-9 rounded-[12px] border border-violet-200 bg-violet-50 px-3 py-2 flex items-center justify-center">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.12em] text-violet-600 leading-none">Mayoristas</p>
                    <p className="text-xs font-black text-violet-800 leading-none">{hudStats.wholesalers}</p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={openCreateModal}
                disabled={!canCreateAgenda}
                className="inline-flex h-9 items-center gap-2 rounded-[12px] border border-emerald-200 bg-emerald-600 px-4 text-xs font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
              >
                <Plus size={14} />
                Nuevo contacto
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr]">
            <label className="flex items-center gap-2 rounded-[12px] border border-slate-400 bg-white px-3 py-2 hover:border-slate-500 transition">
              <Search size={15} className="text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar nombre, teléfono, email, CUIT o contacto..."
                className="w-full bg-transparent text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-[12px] border border-slate-400 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none hover:border-slate-500 transition"
            >
              <option>Todos</option>
              <option>Proveedor</option>
              <option>Mayorista</option>
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-[12px] border border-slate-400 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none hover:border-slate-500 transition"
            >
              <option>Activos</option>
              <option>Inactivos</option>
              <option>Todos</option>
            </select>

            <div className="relative">
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="w-full rounded-[12px] border border-slate-400 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none hover:border-slate-500 transition appearance-none pr-8"
              >
                <option value="name_asc">Nombre A-Z</option>
                <option value="name_desc">Nombre Z-A</option>
                <option value="created_desc">Más recientes</option>
                <option value="created_asc">Más antiguos</option>
              </select>
              <ArrowUpDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-auto px-3 py-3" onScroll={visibleContactsFeed.handleScroll}>
          <table className="w-full min-w-[940px] overflow-hidden rounded-[22px] border border-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Nombre / empresa</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Datos fiscales</th>
                <th className="px-4 py-3">Canal principal</th>
                <th className="px-4 py-3">Alta</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {visibleContactsFeed.visibleItems.map((contact) => {
                const isSelected = String(contact.id) === String(selectedContactId);
                const primaryChannel = contact.phone || contact.email || contact.website || '--';

                return (
                  <tr
                    key={contact.id}
                    onClick={() => setSelectedContactId(contact.id)}
                    className={`cursor-pointer transition ${isSelected ? 'bg-fuchsia-50/60' : 'hover:bg-slate-50/80'}`}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-2">
                        <ContactTypeBadge type={contact.contactType} />
                        <ContactStatusBadge isActive={contact.isActive !== false} />
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-sm font-black text-slate-900">{contact.name}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-400">
                        {contact.contactPerson || 'Sin responsable asignado'}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-700">{contact.phone || '--'}</p>
                        <p className="text-xs font-medium text-slate-400">{contact.email || 'Sin email'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-sm font-semibold text-slate-700">{contact.taxId || '--'}</p>
                      <p className="mt-1 text-xs font-medium text-slate-400 line-clamp-1">
                        {contact.address || 'Sin dirección'}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="text-sm font-semibold text-slate-700 line-clamp-1">{primaryChannel}</p>
                      <p className="mt-1 text-xs font-medium text-slate-400">
                        {contact.website ? 'Web disponible' : contact.email ? 'Canal digital' : 'Canal directo'}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top text-sm font-semibold text-slate-500">
                      {formatDateShort(contact.createdAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end gap-2">
                        {canEditAgenda && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditModal(contact);
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                          >
                            <Edit2 size={15} />
                          </button>
                        )}
                        {canDeleteAgenda && contact.isActive !== false && (
                          <AsyncActionButton
                            type="button"
                            onAction={(event) => {
                              event?.stopPropagation?.();
                              return runAction(`agenda-delete:${contact.id}`, () => handleDelete(contact));
                            }}
                            pending={isPending(`agenda-delete:${contact.id}`)}
                            loadingContent={<Trash2 size={15} className="animate-pulse" />}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </AsyncActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedContacts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400">
                        <Building2 size={22} />
                      </div>
                      <p className="text-base font-black text-slate-800">No hay contactos para mostrar</p>
                      <p className="mt-1 text-sm font-medium text-slate-500">
                        Ajustá filtros o cargá un nuevo proveedor / mayorista.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {sortedContacts.length > 0 && (
          <div className="border-t border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold text-slate-500">
            Mostrando <span className="font-black text-slate-700">{visibleContactsFeed.visibleCount}</span> de <span className="font-black text-slate-700">{sortedContacts.length}</span> contactos
          </div>
        )}
      </section>

      <aside className="flex min-h-0 w-[360px] shrink-0 flex-col rounded-[28px] border border-slate-200 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        {selectedContact ? (
          <>
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Ficha del contacto</p>
                  <h3 className="mt-1 text-xl font-black text-slate-900">{selectedContact.name}</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ContactTypeBadge type={selectedContact.contactType} />
                    <ContactStatusBadge isActive={selectedContact.isActive !== false} />
                  </div>
                </div>
                {canEditAgenda && (
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedContact)}
                    className="inline-flex items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50"
                  >
                    <Edit2 size={14} />
                    Editar
                  </button>
                )}
              </div>
            </div>

            <div className="custom-scrollbar flex-1 space-y-3 overflow-auto px-5 py-4">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50/90 p-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <UserRound size={16} className="mt-0.5 text-slate-400" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Contacto</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">{selectedContact.contactPerson || 'Sin responsable asignado'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone size={16} className="mt-0.5 text-slate-400" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Teléfono</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">{selectedContact.phone || '--'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail size={16} className="mt-0.5 text-slate-400" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Email</p>
                      <p className="mt-1 break-all text-sm font-semibold text-slate-700">{selectedContact.email || '--'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Globe size={16} className="mt-0.5 text-slate-400" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Web</p>
                      <p className="mt-1 break-all text-sm font-semibold text-slate-700">{selectedContact.website || '--'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50/90 p-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Building2 size={16} className="mt-0.5 text-slate-400" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Tipo de cuenta</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {(CONTACT_TYPE_META[selectedContact.contactType] || CONTACT_TYPE_META.supplier).label}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <FileText size={16} className="mt-0.5 text-slate-400" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">CUIT / fiscal</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">{selectedContact.taxId || '--'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin size={16} className="mt-0.5 text-slate-400" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Dirección</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">{selectedContact.address || 'Sin dirección cargada'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50/90 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Notas</p>
                <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-600">
                  {selectedContact.notes || 'Sin observaciones registradas.'}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400">
              <Building2 size={24} />
            </div>
            <p className="text-lg font-black text-slate-800">Seleccioná un contacto</p>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Vas a poder ver teléfono, email, CUIT, dirección y notas en un mismo panel.
            </p>
          </div>
        )}
      </aside>

      <AgendaFormModal
        isOpen={isModalOpen}
        mode={modalMode}
        formData={formData}
        setFormData={setFormData}
        onClose={() => setIsModalOpen(false)}
        onSubmit={() => runAction(`agenda-form:${modalMode}:${selectedContact?.id || 'create'}`, handleSubmit)}
        submitPending={isPending(`agenda-form:${modalMode}:${selectedContact?.id || 'create'}`)}
        isOfflineReadOnly={isOfflineReadOnly}
      />
    </div>
  );
}
