import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, 
  History, 
  X, 
  Plus, 
  Save, 
  User, 
  Trash2, 
  Edit2, 
  CreditCard, 
  Phone, 
  Mail,
  Instagram,
  FileText,
  AlertTriangle,
  Trophy,
  XCircle,
  Printer,
  ClipboardCheck,
  CalendarDays, 
  Clock, 
  ArrowUpDown,
  ChevronDown
} from 'lucide-react';
import { formatNumber, isTestRecord } from '../utils/helpers'; // ✨ Importado isTestRecord
import AsyncActionButton from '../components/AsyncActionButton';
import { FancyPrice } from '../components/FancyPrice';
import { hasPermission } from '../utils/userPermissions';
import { TransactionDetailModal } from '../components/modals/HistoryModals';
import useIncrementalFeed from '../hooks/useIncrementalFeed';
import usePendingAction from '../hooks/usePendingAction';
import { buildPointExpirationReport, normalizeMemberName } from '../utils/memberPointsExpiration';
import { getClientSearchTerms, memberMatchesSearchTerms, normalizeClientSearchValue } from '../utils/clientSearch';
import {
  buildSocialConnectionsWithCouponUsageOverrides,
  buildSocialConnectionsWithInstagram,
  formatInstagramHandle,
  getCouponUsageOverrides,
  getInstagramConnection,
  getInstagramFormValues,
  getSocialConnections,
  hasInstagramConnection,
  normalizeInstagramHandle,
} from '../utils/socialConnections';

const SHOW_LEGACY_CLIENT_TRANSACTION_MODAL = false;

const sanitizeOptionalMemberField = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const sanitizeMemberFormData = (data = {}) => ({
  ...data,
  name: String(data.name || '').trim(),
  dni: sanitizeOptionalMemberField(data.dni),
  phone: sanitizeOptionalMemberField(data.phone),
  email: sanitizeOptionalMemberField(data.email),
  extraInfo: sanitizeOptionalMemberField(data.extraInfo),
  instagramHandle: normalizeInstagramHandle(data.instagramHandle),
  instagramConnected: Boolean(data.instagramConnected),
  instagramNotes: sanitizeOptionalMemberField(data.instagramNotes),
  points: Number(data.points) || 0,
});

const createEmptyMemberFormData = () => ({
  id: null,
  name: '',
  dni: '',
  phone: '',
  email: '',
  extraInfo: '',
  points: 0,
  instagramHandle: '',
  instagramConnected: false,
  instagramNotes: '',
});

const buildMemberFormData = (member = {}) => ({
  ...createEmptyMemberFormData(),
  id: member.id ?? null,
  name: member.name || '',
  dni: member.dni || '',
  phone: member.phone || '',
  email: member.email || '',
  extraInfo: member.extraInfo || '',
  points: member.points || 0,
  ...getInstagramFormValues(member),
});

const mergeMemberFormData = (member = {}, cleanData = {}) => ({
  ...member,
  ...cleanData,
  socialConnections: buildSocialConnectionsWithInstagram(
    getSocialConnections(member),
    {
      handle: cleanData.instagramHandle,
      isConnected: cleanData.instagramConnected,
      notes: cleanData.instagramNotes,
      source: 'manual',
    },
  ),
});

const mergeMemberCouponUsageOverrides = (member = {}, reenabledCodes = []) => ({
  ...member,
  socialConnections: buildSocialConnectionsWithCouponUsageOverrides(
    getSocialConnections(member),
    { reenabledCodes },
  ),
  couponUsageReenabledCodes: reenabledCodes,
});

const AUDIT_RANGE_OPTIONS = [
  { label: '1 mes', days: 30 },
  { label: '3 meses', days: 90 },
  { label: '6 meses', days: 180 },
];

const parseClientMovementDateTime = (dateValue, timeValue) => {
  if (!dateValue || dateValue === '--/--/--') return 0;
  const rawDate = String(dateValue);
  if (rawDate.includes('/')) {
    const [day, month, year] = rawDate.split('/');
    const fullYear = year && year.length === 2 ? `20${year}` : year;
    const timePart = timeValue ? String(timeValue).split(' ')[0] : '00:00:00';
    return new Date(`${fullYear}-${month}-${day}T${timePart}`).getTime();
  }
  return new Date(rawDate).getTime();
};

const getPointMovementDelta = (movement = {}) => {
  const explicitDelta = Number(movement.signedDiff);
  if (Number.isFinite(explicitDelta) && explicitDelta !== 0) return explicitDelta;
  const points = Number(movement.points || 0);
  return movement.type === 'earned' ? points : -points;
};

const getPointMovementLabel = (movement = {}) => {
  if (movement.concept) return movement.concept;
  if (movement.type === 'earned') return 'Puntos por compra';
  if (movement.type === 'redeemed') return 'Canje de puntos';
  if (movement.type === 'expired') return 'Vencimiento de puntos';
  return 'Ajuste manual';
};

const getPointMovementTextClass = (movement = {}) => {
  const delta = getPointMovementDelta(movement);
  if (movement.type === 'expired') return 'text-red-600';
  if (delta > 0) return 'text-green-600';
  if (movement.type === 'redeemed') return 'text-orange-600';
  return 'text-red-600';
};

export default function ClientsView({ 
  members, 
  addMember, 
  updateMember, 
  deleteMember, 
  currentUser,
  onViewTicket,
  onEditTransaction,
  onDeleteTransaction,
  userCatalog,
  transactions = [],
  dailyLogs = [],
  checkExpirations 
}) {
  
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date_added_desc'); 

  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedTx, setSelectedTx] = useState(null);
  const canCreateClients = hasPermission(currentUser, 'clients.create');
  const canEditClients = hasPermission(currentUser, 'clients.edit');
  const canDeleteClients = hasPermission(currentUser, 'clients.delete');
  const canAuditClients = canEditClients;
  const canEditSales = hasPermission(currentUser, 'history.editSale');
  const canVoidSales = hasPermission(currentUser, 'history.voidSale');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [formData, setFormData] = useState(createEmptyMemberFormData);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState(null);

  const [isDrawerEditMode, setIsDrawerEditMode] = useState(false);
  const [drawerFormData, setDrawerFormData] = useState({});
  const [showExpirationDetails, setShowExpirationDetails] = useState(false);
  const [selectedExpirationGroup, setSelectedExpirationGroup] = useState(null);
  const [expirationGroupSortBy, setExpirationGroupSortBy] = useState('expiring_desc');
  const [expirationGroupSearch, setExpirationGroupSearch] = useState('');
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditReport, setAuditReport] = useState(null);
  const [auditRangeDays, setAuditRangeDays] = useState(90);
  const { isPending, runAction } = usePendingAction();

  const formatShortDate = (isoString) => {
    if (!isoString) return '--/--/----';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch {
      return '--/--/----';
    }
  };

  const getLastPurchaseDate = useCallback((member) => {
    if (!member || !transactions || transactions.length === 0) return null;
    
    const memberTx = transactions.filter(tx => 
      !['voided', 'deleted'].includes(tx.status) &&
      tx.client && 
      (String(tx.client.id) === String(member.id) || String(tx.client.memberNumber) === String(member.memberNumber))
    );

    if (memberTx.length === 0) return null;

    memberTx.sort((a, b) => {
       const parseDate = (dStr) => {
         if (!dStr) return 0;
         if (dStr.includes('/')) {
           const [day, month, year] = dStr.split('/');
           return new Date(`${year}-${month}-${day}`).getTime();
         }
         return new Date(dStr).getTime();
       };
       return parseDate(b.date) - parseDate(a.date);
    });

    return memberTx[0].date;
  }, [transactions]);

  const extractCouponCodeFromItem = (item) => {
    const explicitCode = String(item?.couponCode || item?.coupon_code || '').trim();
    if (explicitCode) return explicitCode.toUpperCase();

    const title = String(item?.title || '');
    const description = String(item?.description || '');
    const couponMatch =
      title.match(/cup[oó]n\s+([a-z0-9_-]+)/i) ||
      description.match(/cup[oó]n\s+([a-z0-9_-]+)/i);

    return couponMatch ? String(couponMatch[1]).trim().toUpperCase() : '';
  };

  const getMemberCoupons = (member) => {
    if (!member) return [];

    return transactions
      .filter((tx) =>
        !['voided', 'deleted'].includes(tx.status) &&
        tx.client &&
        (String(tx.client.id) === String(member.id) || String(tx.client.memberNumber) === String(member.memberNumber))
      )
      .flatMap((tx) =>
        (tx.items || [])
          .map((item) => {
            const code = extractCouponCodeFromItem(item);
            if (!code) return null;

            return {
              id: `${tx.id}-${code}`,
              code,
              date: tx.date || '--/--/--',
              time: tx.time || tx.timestamp || '--:--',
              orderId: tx.id,
              amount: Math.abs(Number(item.price || 0) * Number(item.qty || item.quantity || 1)),
              title: item.title || 'Cupón',
            };
          })
          .filter(Boolean)
      )
      .sort((a, b) => {
        const parseDateTime = (dStr, tStr) => {
          if (!dStr || dStr === '--/--/--') return 0;
          if (dStr.includes('/')) {
            const [day, month, year] = dStr.split('/');
            const fullYear = year.length === 2 ? `20${year}` : year;
            const timePart = tStr ? tStr.split(' ')[0] : '00:00:00';
            return new Date(`${fullYear}-${month}-${day}T${timePart}`).getTime();
          }
          return new Date(dStr).getTime();
        };
        return parseDateTime(b.date, b.time) - parseDateTime(a.date, a.time);
      });
  };

  const getMemberHistory = (member) => {
    if (!member) return [];

    const memberId = String(member.id || '');
    const memberNumber = String(member.memberNumber || member.member_number || '');

    const memberSales = transactions.filter(tx => {
      if (!tx.client) return false;
      if (tx.status === 'voided' || tx.status === 'deleted') return false;
      return String(tx.client.id) === String(member.id) || 
             String(tx.client.memberNumber) === String(member.memberNumber);
    });

    const saleMovements = memberSales
      .flatMap((tx) => {
        const earnedPoints = Number(tx.pointsEarned || 0);
        const spentPoints = Number(tx.pointsSpent || 0);
        const baseMovement = {
          orderId: tx.id,
          date: tx.date || '--/--/--',
          time: tx.time || tx.timestamp || '--:--',
          totalSale: tx.total,
        };

        return [
          spentPoints > 0
            ? {
                ...baseMovement,
                id: `${tx.id}:redeemed`,
                type: 'redeemed',
                concept: 'Canje en compra',
                points: spentPoints,
                signedDiff: -spentPoints,
                sequence: 0,
              }
            : null,
          earnedPoints > 0
            ? {
                ...baseMovement,
                id: `${tx.id}:earned`,
                type: 'earned',
                concept: 'Puntos por compra',
                points: earnedPoints,
                signedDiff: earnedPoints,
                sequence: 1,
              }
            : null,
        ].filter(Boolean);
      })
      .sort((a, b) =>
        parseClientMovementDateTime(a.date, a.time) - parseClientMovementDateTime(b.date, b.time) ||
        Number(a.sequence || 0) - Number(b.sequence || 0)
      );

    const logMovements = (Array.isArray(dailyLogs) ? dailyLogs : [])
      .flatMap((log) => {
        const details = log?.details && typeof log.details === 'object' ? log.details : {};
        const action = String(log?.action || '');

        const normalizedAction = action.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

        if (normalizedAction.includes('edici') && normalizedAction.includes('socio')) {
          const logMemberId = String(details.id || '');
          const logMemberNumber = String(details.number || details.memberNumber || '');
          const pointsDelta = Number(details.pointsDelta || 0);
          const matchesMember =
            (memberId && logMemberId && memberId === logMemberId) ||
            (memberNumber && logMemberNumber && memberNumber === logMemberNumber);

          if (!matchesMember || !Number.isFinite(pointsDelta) || pointsDelta === 0) return [];

          return [{
            id: `log:${log.id}:points-adjust`,
            orderId: '---',
            date: log.date || log.created_at || '--/--/--',
            time: log.timestamp || '--:--',
            type: pointsDelta > 0 ? 'earned' : 'adjusted',
            concept: 'Ajuste manual',
            totalSale: 0,
            points: Math.abs(pointsDelta),
            signedDiff: pointsDelta,
            sequence: 2,
          }];
        }

        if (action === 'Auditoria de Puntos') {
          const affectedMember = (Array.isArray(details.members) ? details.members : []).find((entry) => (
            (memberId && String(entry.id || entry.memberId || '') === memberId) ||
            (memberNumber && String(entry.memberNumber || '') === memberNumber)
          ));
          const expiredPoints = Number(affectedMember?.expiredPoints || 0);
          if (!affectedMember || expiredPoints <= 0) return [];

          return [{
            id: `log:${log.id}:points-expired:${memberId || memberNumber}`,
            orderId: '---',
            date: log.date || log.created_at || '--/--/--',
            time: log.timestamp || '--:--',
            type: 'expired',
            concept: 'Vencimiento de puntos',
            totalSale: 0,
            points: expiredPoints,
            signedDiff: -expiredPoints,
            sequence: 2,
          }];
        }

        return [];
      });

    const normalizedHistory = [...saleMovements, ...logMovements]
      .sort((a, b) =>
        parseClientMovementDateTime(a.date, a.time) - parseClientMovementDateTime(b.date, b.time) ||
        Number(a.sequence || 0) - Number(b.sequence || 0)
      );

    const startingPoints =
      Number(member.points || 0) -
      normalizedHistory.reduce((acc, movement) => acc + getPointMovementDelta(movement), 0);

    let runningPoints = startingPoints;

    const historyWithTotals = normalizedHistory.map((movement) => {
      const prevPoints = runningPoints;
      const newPoints = prevPoints + getPointMovementDelta(movement);
      runningPoints = newPoints;

      return {
        ...movement,
        prevPoints,
        newPoints,
      };
    });

    return historyWithTotals.sort((a, b) =>
      parseClientMovementDateTime(b.date, b.time) - parseClientMovementDateTime(a.date, a.time) ||
      Number(b.sequence || 0) - Number(a.sequence || 0)
    );
  };

  useEffect(() => {
    if (!selectedMember) {
      setIsDrawerEditMode(false);
      setDrawerFormData({});
    }
  }, [selectedMember]);

  const sortedMembers = useMemo(() => {
    // ✨ 1. Evaluamos si el usuario busca test explícitamente
    const normalizedSearch = normalizeClientSearchValue(searchTerm);
    const searchTerms = getClientSearchTerms(searchTerm);
    const isSearchTest = normalizedSearch.includes('test');

    let result = (Array.isArray(members) ? members : []).filter((m) => {
      if (!m) return false;
      
      // ✨ LIMPIEZA DE TEST: Si el socio tiene palabra "test" y no lo buscan, no aparece
      const isTest = isTestRecord(m);
      if (isTest && !isSearchTest) return false;

      return memberMatchesSearchTerms(m, searchTerms);
    });

    const getMs = (dateStr) => {
      if (!dateStr || dateStr === '--/--/----' || dateStr === '--/--/--') return 0;
      if (dateStr.includes('T')) return new Date(dateStr).getTime();
      if (dateStr.includes('/')) {
          const [day, month, year] = dateStr.split('/');
          const fullYear = year.length === 2 ? `20${year}` : year;
          return new Date(`${fullYear}-${month}-${day}`).getTime();
      }
      return new Date(dateStr).getTime() || 0;
    };

    result.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc': return (a.name || '').localeCompare(b.name || '');
        case 'id_desc': return Number(b.memberNumber || 0) - Number(a.memberNumber || 0);
        case 'id_asc': return Number(a.memberNumber || 0) - Number(b.memberNumber || 0);
        case 'points_desc': return Number(b.points || 0) - Number(a.points || 0);
        case 'points_asc': return Number(a.points || 0) - Number(b.points || 0);
        case 'date_added_desc': return getMs(b.created_at || b.createdAt) - getMs(a.created_at || a.createdAt);
        case 'date_added_asc': return getMs(a.created_at || a.createdAt) - getMs(b.created_at || b.createdAt);
        case 'last_purchase_desc': return getMs(getLastPurchaseDate(b)) - getMs(getLastPurchaseDate(a));
        default: return 0;
      }
    });

    return result;
  }, [getLastPurchaseDate, members, searchTerm, sortBy]);

  const visibleMembersCount = useMemo(() => {
    const isSearchTest = normalizeClientSearchValue(searchTerm).includes('test');
    return (Array.isArray(members) ? members : []).filter((member) => {
      if (!member) return false;
      const isTest = isTestRecord(member);
      if (isTest && !isSearchTest) return false;
      return true;
    }).length;
  }, [members, searchTerm]);
  const visibleMembersFeed = useIncrementalFeed(sortedMembers, {
    resetKey: `${searchTerm}|${sortBy}|${sortedMembers.length}`,
  });
  const pointsExpirationReport = useMemo(
    () => buildPointExpirationReport(members, transactions, { upcomingDays: 30 }),
    [members, transactions],
  );
  const auditFutureReport = useMemo(() => {
    if (!isAuditModalOpen) return pointsExpirationReport;
    return buildPointExpirationReport(members, transactions, { upcomingDays: auditRangeDays });
  }, [auditRangeDays, isAuditModalOpen, members, pointsExpirationReport, transactions]);
  const selectedAuditRange =
    AUDIT_RANGE_OPTIONS.find((option) => option.days === auditRangeDays) || AUDIT_RANGE_OPTIONS[1];
  const auditPreviewReport = auditReport || pointsExpirationReport;
  const auditExpiredMemberRows = useMemo(() => {
    if (Array.isArray(auditReport?.updatedMembers) && auditReport.updatedMembers.length > 0) {
      return auditReport.updatedMembers.map((member) => ({
        memberId: member.id,
        memberNumber: member.memberNumber,
        name: member.name || 'Socio sin nombre',
        currentPoints: Number(member.previousPoints || 0),
        expiredPoints: Number(member.expiredPoints || 0),
        newPoints: Number(member.newPoints || 0),
      }));
    }

    return (auditPreviewReport.expiredMembers || []).map((member) => {
      const currentPoints = Number(member.currentPoints || 0);
      const expiredPoints = Number(member.expiredPoints || 0);

      return {
        ...member,
        currentPoints,
        expiredPoints,
        newPoints: Math.max(0, currentPoints - expiredPoints),
      };
    });
  }, [auditReport, auditPreviewReport]);

  const filteredExpirationGroupMembers = useMemo(() => {
    if (!selectedExpirationGroup?.members) return [];
    let list = [...selectedExpirationGroup.members];

    if (expirationGroupSearch.trim()) {
      const q = normalizeClientSearchValue(expirationGroupSearch);
      list = list.filter((item) => {
        const nameMatch = normalizeClientSearchValue(item.name || '').includes(q);
        const numberMatch = String(item.memberNumber || '').includes(q);
        const phoneMatch = String(item.member?.phone || item.phone || '').includes(q);
        const dniMatch = String(item.member?.dni || item.dni || '').includes(q);
        return nameMatch || numberMatch || phoneMatch || dniMatch;
      });
    }

    list.sort((a, b) => {
      switch (expirationGroupSortBy) {
        case 'expiring_desc':
          return (Number(b.expiringPoints || 0) - Number(a.expiringPoints || 0)) || (a.name || '').localeCompare(b.name || '');
        case 'expiring_asc':
          return (Number(a.expiringPoints || 0) - Number(b.expiringPoints || 0)) || (a.name || '').localeCompare(b.name || '');
        case 'points_desc':
          return (Number(b.currentPoints || 0) - Number(a.currentPoints || 0));
        case 'points_asc':
          return (Number(a.currentPoints || 0) - Number(b.currentPoints || 0));
        case 'name_asc':
          return (a.name || '').localeCompare(b.name || '');
        case 'name_desc':
          return (b.name || '').localeCompare(a.name || '');
        case 'id_asc':
          return Number(a.memberNumber || 0) - Number(b.memberNumber || 0);
        case 'id_desc':
          return Number(b.memberNumber || 0) - Number(a.memberNumber || 0);
        default:
          return (Number(b.expiringPoints || 0) - Number(a.expiringPoints || 0));
      }
    });

    return list;
  }, [expirationGroupSearch, expirationGroupSortBy, selectedExpirationGroup]);
  const duplicateFormMember = useMemo(() => {
    const cleanName = normalizeMemberName(formData.name);
    const cleanDni = sanitizeOptionalMemberField(formData.dni);
    if (!cleanName || cleanDni) return null;

    return (Array.isArray(members) ? members : []).find((member) =>
      String(member?.id) !== String(formData.id || '') &&
      normalizeMemberName(member?.name) === cleanName
    ) || null;
  }, [formData, members]);
  const duplicateDrawerMember = useMemo(() => {
    const cleanName = normalizeMemberName(drawerFormData.name);
    const cleanDni = sanitizeOptionalMemberField(drawerFormData.dni);
    if (!cleanName || cleanDni || !selectedMember) return null;

    return (Array.isArray(members) ? members : []).find((member) =>
      String(member?.id) !== String(selectedMember.id) &&
      normalizeMemberName(member?.name) === cleanName
    ) || null;
  }, [drawerFormData, members, selectedMember]);

  const openCreateModal = () => {
    setModalMode('create');
    setFormData(createEmptyMemberFormData());
    setIsModalOpen(true);
  };

  const openDrawerEdit = (member) => {
    setSelectedMember(member);
    setDrawerFormData(buildMemberFormData(member));
    setIsDrawerEditMode(true);
  };

  const openDrawerDetails = (member) => {
    setIsDrawerEditMode(false);
    setDrawerFormData({});
    setSelectedMember(member);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await runAction(`member-form:${modalMode}`, async () => {
      const cleanData = sanitizeMemberFormData(formData);
      if (!cleanData.name) return;
      if (duplicateFormMember && !cleanData.dni) return;

      if (modalMode === 'create') {
        await addMember(cleanData);
      } else {
        await updateMember(formData.id, cleanData);
        if (selectedMember && selectedMember.id === formData.id) {
           setSelectedMember(mergeMemberFormData(selectedMember, cleanData));
        }
      }
      setIsModalOpen(false);
    });
  };

  const handleDrawerEditSubmit = async (e) => {
    e.preventDefault();
    // 🔧 Convertir points a número antes de enviar
    await runAction(`member-drawer:${selectedMember?.id || 'unknown'}`, async () => {
      const cleanData = sanitizeMemberFormData(drawerFormData);
      if (duplicateDrawerMember && !cleanData.dni) return;
      await updateMember(selectedMember.id, cleanData);
      setSelectedMember(mergeMemberFormData(selectedMember, cleanData));
      setIsDrawerEditMode(false);
    });
  };

  const handleToggleCouponAvailability = async (couponCode, shouldEnableAgain) => {
    if (!selectedMember || !couponCode) return;

    await runAction(`member-coupon:${selectedMember.id}:${couponCode}`, async () => {
      const currentCodes = getCouponUsageOverrides(selectedMember).reenabledCodes;
      const normalizedCode = String(couponCode || '').trim().toUpperCase();
      const nextCodes = shouldEnableAgain
        ? Array.from(new Set([...currentCodes, normalizedCode]))
        : currentCodes.filter((code) => code !== normalizedCode);

      const updatedMember = await updateMember(selectedMember.id, {
        couponUsageReenabledCodes: nextCodes,
        extraInfo: shouldEnableAgain
          ? `Cupón ${normalizedCode} habilitado manualmente para nuevo uso`
          : `Cupón ${normalizedCode} volvió a quedar bloqueado por uso histórico`,
      });

      setSelectedMember(
        updatedMember?.id
          ? updatedMember
          : mergeMemberCouponUsageOverrides(selectedMember, nextCodes),
      );
    });
  };

  const startDrawerEdit = () => {
    setDrawerFormData(buildMemberFormData(selectedMember));
    setIsDrawerEditMode(true);
  };

  const handleDeleteRequest = (member) => {
    setMemberToDelete(member);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (memberToDelete) {
      await runAction(`delete-member:${memberToDelete.id}`, async () => {
        await deleteMember(memberToDelete.id);
        setIsDeleteModalOpen(false);
        setMemberToDelete(null);
        if (selectedMember?.id === memberToDelete.id) {
          setSelectedMember(null);
        }
      });
    }
  };

  const handleViewOrderDetails = (orderId) => {
    const transaction = transactions.find(t => String(t.id) === String(orderId));
    if (transaction) {
      setSelectedTx(transaction);
    } else {
      alert('La transacción no se encuentra en el historial activo.');
    }
  };

  const handlePrintPoints = () => {
    if (!selectedMember) return;
    const pointHistory = getMemberHistory(selectedMember).slice(0, 10);
    
    const pointsTicketData = {
      isPointsTicket: true, 
      client: selectedMember,
      pointHistory,
      date: new Date().toLocaleDateString('es-AR'),
      time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      id: selectedMember.memberNumber 
    };

    if (onViewTicket) {
      onViewTicket(pointsTicketData);
    }
  };

  const openAuditModal = () => {
    setAuditReport(null);
    setIsAuditModalOpen(true);
  };

  const handleApplyAudit = async () => {
    if (!checkExpirations) return;

    await runAction('clients-audit', async () => {
      const result = await checkExpirations();
      if (result) setAuditReport(result);
    });
  };

  return (
    <div className="clients-view h-full min-h-0 flex flex-col relative overflow-hidden bg-slate-50 p-4">
      
      {/* HEADER COMPACTO */}
      <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 mb-3 flex flex-wrap items-center justify-between gap-2 shrink-0 z-10">
        
        <div className="flex items-center flex-1 min-w-0 gap-2">
          
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por Nombre, N° Socio, DNI, Email o Instagram..."
              className="w-full rounded-md border border-slate-200 pl-9 pr-3 py-1.5 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm font-bold transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="inline-flex h-[34px] items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 shadow-sm shrink-0">
            <span className="text-xs font-black uppercase tracking-[0.06em] leading-none text-slate-500">Socios</span>
            <span className="text-sm font-black leading-none text-slate-700">
              {sortedMembers.length}
              {sortedMembers.length !== visibleMembersCount && (
                <span className="font-semibold text-slate-400"> / {visibleMembersCount}</span>
              )}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          
          <div className="relative">
            <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-white text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 cursor-pointer appearance-none shadow-sm transition-all"
            >
              <optgroup label="Fechas">
                <option value="date_added_desc">Más Nuevos</option>
                <option value="date_added_asc">Más Antiguos</option>
                <option value="last_purchase_desc">Última Compra</option>
              </optgroup>
              <optgroup label="Puntos">
                <option value="points_desc">Mayor Saldo Puntos</option>
                <option value="points_asc">Menor Saldo Puntos</option>
              </optgroup>
              <optgroup label="Identificación">
                <option value="name_asc">Nombre (A-Z)</option>
                <option value="id_asc">N° Socio (Ascendente)</option>
                <option value="id_desc">N° Socio (Descendente)</option>
              </optgroup>
            </select>
          </div>

          {checkExpirations && canAuditClients && (
            <AsyncActionButton
              onAction={openAuditModal}
              pending={isPending('clients-audit')}
              loadingLabel="Auditando..."
              className="py-1.5 px-3 text-slate-600 bg-white border border-slate-200 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              title="Auditoría Retroactiva (Limpiar puntos > 6 meses)"
            >
              <ClipboardCheck size={16} />
              <span className="hidden md:inline text-xs font-bold">Auditoría</span>
            </AsyncActionButton>
          )}

          {canCreateClients && (
            <button
              onClick={openCreateModal}
              className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 rounded-lg flex items-center gap-1.5 font-bold shadow-md transition-all active:scale-95 text-xs uppercase tracking-wide"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Nuevo Socio</span>
            </button>
          )}
        </div>
      </div>

      {(pointsExpirationReport.totals.upcomingMembers > 0 || pointsExpirationReport.totals.expiredMembers > 0) && (
        <div className="mb-3 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-amber-600" />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.08em]">Vencimiento de puntos</p>
                <p className="text-xs font-semibold text-amber-800">
                  {pointsExpirationReport.totals.upcomingMembers > 0
                    ? `${pointsExpirationReport.totals.upcomingMembers} socios tienen ${formatNumber(pointsExpirationReport.totals.upcomingPoints)} pts a vencer en ${pointsExpirationReport.upcomingDays} dias.`
                    : 'No hay puntos a vencer en los proximos dias.'}
                  {pointsExpirationReport.totals.expiredMembers > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedExpirationGroup({
                          title: 'Socios con puntos vencidos',
                          isExpired: true,
                          displayDate: 'Puntos ya vencidos',
                          points: pointsExpirationReport.totals.expiredPoints,
                          memberCount: pointsExpirationReport.totals.expiredMembers,
                          members: pointsExpirationReport.expiredMembers.map((m) => ({
                            ...m,
                            expiringPoints: m.expiredPoints,
                          })),
                        });
                        setExpirationGroupSearch('');
                        setExpirationGroupSortBy('expiring_desc');
                      }}
                      className="ml-1 font-black text-red-700 underline hover:text-red-800 cursor-pointer transition-colors"
                      title="Ver lista de socios con puntos vencidos"
                    >
                      {pointsExpirationReport.totals.expiredMembers} socios ya tienen puntos vencidos. (Ver socios)
                    </button>
                  )}
                </p>
              </div>
            </div>
            {pointsExpirationReport.upcomingGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setShowExpirationDetails((prev) => !prev)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 text-xs font-black text-amber-800 transition hover:bg-amber-100 cursor-pointer shadow-xs"
              >
                Ver fechas ({pointsExpirationReport.upcomingGroups.length})
                <ChevronDown size={14} className={`transition-transform ${showExpirationDetails ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          {showExpirationDetails && pointsExpirationReport.upcomingGroups.length > 0 && (
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {pointsExpirationReport.upcomingGroups.map((group) => (
                <button
                  key={group.dateKey}
                  type="button"
                  onClick={() => {
                    setSelectedExpirationGroup(group);
                    setExpirationGroupSearch('');
                    setExpirationGroupSortBy('expiring_desc');
                  }}
                  className="group/card text-left cursor-pointer rounded-xl border border-amber-200 bg-white p-3 shadow-xs hover:border-amber-400 hover:shadow-md hover:bg-amber-50/50 transition-all active:scale-[0.98] flex flex-col justify-between"
                  title="Clic para ver los socios que perderán puntos en esta fecha"
                >
                  <div className="flex items-center justify-between gap-1 w-full">
                    <p className="text-[11px] font-black uppercase tracking-[0.08em] text-amber-700 flex items-center gap-1">
                      <CalendarDays size={13} className="text-amber-500 shrink-0" />
                      {group.displayDate}
                    </p>
                    <span className="text-[10px] font-bold text-amber-600 opacity-0 group-hover/card:opacity-100 transition-opacity">
                      Ver socios →
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-black text-slate-800">
                    {formatNumber(group.points)} pts
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    {group.memberCount} {group.memberCount === 1 ? 'socio afectado' : 'socios afectados'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      
      {/* TABLA DE SOCIOS */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex-1 min-h-0 overflow-y-auto" onScroll={visibleMembersFeed.handleScroll}>
        <table className="w-full text-left">
          <thead className="bg-gray-50/50 border-b border-gray-100 sticky top-0 z-10 backdrop-blur-sm">
            <tr>
                <th className="px-4 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider text-center">N° Socio</th>
                <th className="px-4 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider">Contacto</th>
                <th className="px-4 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider hidden lg:table-cell">Actividad</th>
                <th className="px-4 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider text-center">Puntos</th>
                <th className="px-4 py-3 font-bold text-gray-500 text-xs uppercase tracking-wider text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedMembers.length > 0 ? (
              visibleMembersFeed.visibleItems.map((member) => {
                const lastPurchase = getLastPurchaseDate(member);
                const instagram = getInstagramConnection(member);
                const instagramLabel = formatInstagramHandle(instagram.handle);
                const hasContactData = Boolean(member.dni || member.phone || member.email || instagramLabel);

                return (
                  <tr key={member.id} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="px-4 py-3 text-center">
                          <span className="font-mono text-sm font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                            #{String(member.memberNumber || '0').padStart(4, '0')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 flex items-center justify-center font-bold shadow-sm text-sm border border-white shrink-0">
                              {(member.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 truncate">{member.name || 'Sin Nombre'}</p>
                              {member.extraInfo && <p className="text-xs text-gray-400 truncate max-w-[200px]">{member.extraInfo}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            {member.dni && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-600" title="DNI">
                                <CreditCard size={12} className="text-gray-400" />
                                <span>{member.dni}</span>
                          </div>
                        )}
                        {member.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600" title="Teléfono">
                            <Phone size={12} className="text-gray-400" />
                            <span>{member.phone}</span>
                          </div>
                        )}
                        {member.email && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600" title="Email">
                            <Mail size={12} className="text-gray-400" />
                            <span className="truncate max-w-[150px]">{member.email}</span>
                          </div>
                        )}
                        {instagramLabel && (
                          <div
                            className={`flex items-center gap-1.5 text-xs ${instagram.isConnected ? 'text-fuchsia-700' : 'text-gray-500'}`}
                            title={instagram.isConnected ? 'Instagram confirmado' : 'Instagram sin confirmar'}
                          >
                            <Instagram size={12} className={instagram.isConnected ? 'text-fuchsia-500' : 'text-gray-400'} />
                            <span className="truncate max-w-[150px]">{instagramLabel}</span>
                            {instagram.isConnected && (
                              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-700">
                                OK
                              </span>
                            )}
                          </div>
                        )}
                        {!hasContactData && (
                          <span className="text-xs text-gray-300 italic">Sin datos</span>
                        )}
                          </div>
                        </td>
                        
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-xs text-slate-500" title="Fecha de Adición">
                              <CalendarDays size={13} className="text-slate-400" />
                              <span>Socio desde: <span className="font-medium text-slate-700">{formatShortDate(member.created_at || member.createdAt)}</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500" title="Última Compra">
                          <Clock size={13} className="text-slate-400" />
                          {lastPurchase ? (
                            <span>Últ. Compra: <span className="font-medium text-slate-700">{lastPurchase}</span></span>
                          ) : (
                            <span className="font-medium text-slate-400 italic">No registra compras</span>
                          )}
                        </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                            <Trophy size={12} />
                            {formatNumber(member.points || 0)} pts
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button onClick={(event) => { event.stopPropagation(); openDrawerDetails(member); }} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Ver Detalles e Historial"><History size={16} /></button>
                            {canEditClients && <button onClick={(event) => { event.stopPropagation(); openDrawerEdit(member); }} className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Editar Socio"><Edit2 size={16} /></button>}
                            {canDeleteClients && <button onClick={(event) => { event.stopPropagation(); handleDeleteRequest(member); }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar Socio"><Trash2 size={16} /></button>}
                          </div>
                        </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="6" className="p-16 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center"><Search size={32} className="text-slate-300" /></div>
                    <p className="font-medium">No se encontraron socios</p>
                    {searchTerm && <p className="text-sm">Prueba con otro término de búsqueda.</p>}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {sortedMembers.length > 0 && (
          <div className="border-t border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold text-slate-500">
            Mostrando <span className="font-black text-slate-700">{visibleMembersFeed.visibleCount}</span> de <span className="font-black text-slate-700">{sortedMembers.length}</span> socios
          </div>
        )}
      </div>

      {/* --- PANEL LATERAL (DRAWER) DE DETALLES --- */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm" onClick={() => setSelectedMember(null)}>
          <div 
            className="w-full max-w-lg h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-slate-50/50">
              <div>
                {!isDrawerEditMode ? (
                  <>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-2xl font-bold text-gray-900">{selectedMember.name || 'Sin Nombre'}</h2>
                      <span className="bg-slate-800 text-white text-xs font-mono py-0.5 px-2 rounded">
                        #{String(selectedMember.memberNumber || '0').padStart(4, '0')}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 space-y-0.5">
                      {selectedMember.dni && <p>DNI: {selectedMember.dni}</p>}
                      {selectedMember.phone && <p>Tel: {selectedMember.phone}</p>}
                      {selectedMember.email && <p>{selectedMember.email}</p>}
                      {formatInstagramHandle(getInstagramConnection(selectedMember).handle) && (
                        <p className="inline-flex items-center gap-1.5 text-fuchsia-700">
                          <Instagram size={13} />
                          {formatInstagramHandle(getInstagramConnection(selectedMember).handle)}
                          {hasInstagramConnection(selectedMember) ? ' confirmado' : ' sin confirmar'}
                        </p>
                      )}
                      {(selectedMember.created_at || selectedMember.createdAt) && <p className="text-xs mt-1 text-slate-400">Socio desde: {formatShortDate(selectedMember.created_at || selectedMember.createdAt)}</p>}
                    </div>
                  </>
                ) : (
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Edit2 size={20} /> Editando Socio</h2>
                )}
              </div>
              
              <div className="flex gap-2">
                {!isDrawerEditMode && canEditClients && (
                  <button 
                    onClick={startDrawerEdit}
                    className="p-2 bg-white border hover:bg-blue-50 hover:text-blue-600 rounded-full text-gray-500 transition-colors shadow-sm"
                    title="Editar Información"
                  >
                    <Edit2 size={18} />
                  </button>
                )}
                <button 
                  onClick={() => setSelectedMember(null)}
                  className="p-2 hover:bg-slate-200 rounded-full text-gray-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              
              {isDrawerEditMode ? (
                <form onSubmit={handleDrawerEditSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre Completo</label>
                    <input className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100" value={drawerFormData.name} onChange={e => setDrawerFormData({...drawerFormData, name: e.target.value})} required />
                  </div>
                  {duplicateDrawerMember && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                      Socio duplicado, elegir otro nombre o introducir DNI.
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">DNI</label><input className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100" value={drawerFormData.dni} onChange={e => setDrawerFormData({...drawerFormData, dni: e.target.value})} /></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Teléfono</label><input className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100" value={drawerFormData.phone} onChange={e => setDrawerFormData({...drawerFormData, phone: e.target.value})} /></div>
                  </div>
                  <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Puntos (Ajuste Manual)</label><input type="number" className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100 font-bold text-blue-600" value={drawerFormData.points} onChange={e => setDrawerFormData({...drawerFormData, points: Number(e.target.value) || 0})} /></div>
                  <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label><input className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100" value={drawerFormData.email} onChange={e => setDrawerFormData({...drawerFormData, email: e.target.value})} /></div>
                  <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/60 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="flex items-center gap-1.5 text-xs font-bold uppercase text-fuchsia-700">
                        <Instagram size={14} />
                        Instagram
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-black text-slate-600">
                        <input
                          type="checkbox"
                          checked={Boolean(drawerFormData.instagramConnected)}
                          onChange={e => setDrawerFormData({...drawerFormData, instagramConnected: e.target.checked})}
                          className="h-4 w-4 rounded border-fuchsia-200 text-fuchsia-600 focus:ring-fuchsia-200"
                        />
                        Confirmado
                      </label>
                    </div>
                    <input
                      className="w-full rounded-lg border border-fuchsia-100 bg-white p-2.5 text-sm outline-none focus:ring-2 focus:ring-fuchsia-100"
                      placeholder="@usuario"
                      value={drawerFormData.instagramHandle || ''}
                      onChange={e => setDrawerFormData({...drawerFormData, instagramHandle: e.target.value})}
                    />
                    <textarea
                      rows="2"
                      className="mt-2 w-full resize-none rounded-lg border border-fuchsia-100 bg-white p-2.5 text-xs outline-none focus:ring-2 focus:ring-fuchsia-100"
                      placeholder="Nota interna opcional"
                      value={drawerFormData.instagramNotes || ''}
                      onChange={e => setDrawerFormData({...drawerFormData, instagramNotes: e.target.value})}
                    />
                    <p className="mt-2 text-[11px] font-semibold text-fuchsia-700">
                      Instagram queda guardado en la ficha del socio. La confirmaciÃ³n permite validar promociones que lo requieran, como REBUINSTA.
                    </p>
                  </div>
                  <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notas</label><textarea rows="3" className="w-full rounded-lg border p-2.5 outline-none focus:ring-2 focus:ring-blue-100 resize-none" value={drawerFormData.extraInfo} onChange={e => setDrawerFormData({...drawerFormData, extraInfo: e.target.value})} /></div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setIsDrawerEditMode(false)} className="flex-1 py-2.5 border rounded-lg font-bold text-gray-600 hover:bg-white">Cancelar</button>
                    <AsyncActionButton type="submit" pending={isPending(`member-drawer:${selectedMember?.id || 'unknown'}`)} loadingLabel="Guardando..." className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md disabled:opacity-60 disabled:cursor-wait">Guardar Cambios</AsyncActionButton>
                  </div>
                </form>
              ) : (
                <>
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg mb-4 relative overflow-hidden">
                    <div className="relative z-10">
                      <p className="text-blue-100 text-sm font-medium mb-1 uppercase tracking-wide">Saldo de Puntos</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black tracking-tight">{formatNumber(selectedMember.points || 0)}</span>
                        <span className="text-lg font-medium opacity-80">Puntos.</span>
                      </div>
                    </div>
                    <div className="absolute right-0 top-0 opacity-10 transform translate-x-4 -translate-y-4"><User size={120} /></div>
                  </div>

                  <button
                    onClick={handlePrintPoints}
                    className="w-full mb-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition shadow-lg flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Printer size={20} /> Imprimir Ticket de Puntos
                  </button>

                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                    <FileText size={16} className="text-emerald-600" />
                    Códigos y Cupones Usados
                  </h3>

                  <div className="space-y-3 mb-6">
                    {getMemberCoupons(selectedMember).length > 0 ? (
                      getMemberCoupons(selectedMember).map((coupon) => {
                        const reenabledCodes = getCouponUsageOverrides(selectedMember).reenabledCodes;
                        const isReenabled = reenabledCodes.includes(coupon.code);
                        const actionKey = `member-coupon:${selectedMember.id}:${coupon.code}`;

                        return (
                        <div key={coupon.id} className={`bg-white p-4 rounded-xl border shadow-sm hover:shadow-md transition-all ${isReenabled ? 'border-amber-200 ring-1 ring-amber-100' : 'border-gray-200'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <p className="text-sm font-bold text-emerald-700 truncate">{coupon.code}</p>
                                {isReenabled && (
                                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-amber-700">
                                    Disponible otra vez
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs font-medium text-slate-500 truncate">{coupon.title}</p>
                              <p className="mt-1 text-xs text-gray-400">
                                {coupon.date} • {String(coupon.time).replace(/hs/ig, '').trim().slice(0, 5)} hs
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Descuento aplicado</p>
                              <p className="mt-1 text-sm font-black text-emerald-600"><FancyPrice amount={coupon.amount} /></p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleViewOrderDetails(coupon.orderId)}
                            className="mt-3 w-full py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded flex items-center justify-center gap-2 transition-colors"
                          >
                            <FileText size={12} /> Ver venta donde se usó
                          </button>
                          <AsyncActionButton
                            onAction={() => handleToggleCouponAvailability(coupon.code, !isReenabled)}
                            pending={isPending(actionKey)}
                            loadingLabel="Guardando..."
                            className={`mt-2 w-full py-1.5 text-xs font-bold rounded flex items-center justify-center gap-2 transition-colors ${
                              isReenabled
                                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                            }`}
                          >
                            {isReenabled ? 'Volver a bloquear' : 'Habilitar nuevo uso'}
                          </AsyncActionButton>
                        </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                        <p className="text-sm">No registra códigos o cupones utilizados</p>
                      </div>
                    )}
                  </div>

                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                    <History size={16} className="text-blue-600" />
                    Historial de Movimientos
                  </h3>

                  <div className="space-y-4">
                    {getMemberHistory(selectedMember).length > 0 ? (
                        getMemberHistory(selectedMember).map((mov) => {
                          const movementDelta = getPointMovementDelta(mov);
                          const movementSign = movementDelta >= 0 ? '+' : '-';

                          return (
                        <div key={mov.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all">
                          <div className="flex justify-between items-start mb-3 border-b border-gray-50 pb-2">
                            <div>
                              <p className={`text-sm font-bold ${getPointMovementTextClass(mov)}`}>
                                {getPointMovementLabel(mov)}
                              </p>
                              <p className="text-xs text-gray-400 font-medium mt-0.5">
                                {mov.date} • {mov.time.replace(/hs/ig, '').trim().slice(0, 5)} hs
                              </p>
                            </div>
                            {mov.orderId && mov.orderId !== '---' && (
                              <div className="text-right">
                                <span className="text-[10px] text-gray-400 uppercase font-bold">N° Pedido</span>
                                <p className="text-xs font-mono font-bold text-gray-700">#{String(mov.orderId).padStart(6,'0')}</p>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-sm">
                              {mov.totalSale > 0 ? (
                                <div className="flex items-center gap-1.5 text-gray-600">
                                  <CreditCard size={14} className="text-gray-400" />
                                  <span className="flex items-center gap-1">Monto: <span className="font-bold text-gray-900"><FancyPrice amount={mov.totalSale} /></span></span>
                                </div>
                              ) : (
                                <div className="text-xs italic text-gray-400">
                                  {mov.type === 'expired' ? 'Caducidad automática' : 'Ajuste Manual'}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
                              <span className="text-gray-400 font-mono">{formatNumber(mov.prevPoints || 0)}</span>
                              <span className="text-gray-300">→</span>
                              <span className={`font-bold ${getPointMovementTextClass(mov)}`}>
                                {movementSign}{formatNumber(Math.abs(movementDelta))}
                              </span>
                              <span className="text-gray-300">→</span>
                              <span className="font-bold text-gray-700 font-mono">{formatNumber(mov.newPoints)}</span>
                            </div>
                          </div>
                          {mov.orderId && mov.orderId !== '---' && (
                            <button 
                              onClick={() => handleViewOrderDetails(mov.orderId)}
                              className="mt-3 w-full py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded flex items-center justify-center gap-2 transition-colors"
                            >
                              <FileText size={12} /> Ver Detalles del Pedido
                            </button>
                          )}
                        </div>
                          );
                        })
                    ) : (
                      <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                        <p className="text-sm">Sin movimientos registrados</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DETALLES TRANSACCIÓN --- */}
      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        currentUser={currentUser}
        userCatalog={userCatalog}
        members={members}
        onEditTransaction={(transaction) => {
          setSelectedTx(null);
          if (onEditTransaction) onEditTransaction(transaction);
        }}
        onDeleteTransaction={(transaction) => {
          setSelectedTx(null);
          if (onDeleteTransaction) onDeleteTransaction(transaction);
        }}
        onViewTicket={onViewTicket}
      />

      {SHOW_LEGACY_CLIENT_TRANSACTION_MODAL && selectedTx && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
              <h4 className="font-bold text-slate-800">
                Venta #{String(selectedTx.id).padStart(6, '0')}
              </h4>
              <button
                onClick={() => setSelectedTx(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400 text-xs">Fecha</p>
                  <p className="font-bold">
                    {selectedTx.date} {selectedTx.timestamp || selectedTx.time}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Usuario</p>
                  <p className="font-bold">{selectedTx.user}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Pago</p>
                  <p className="font-bold">{selectedTx.payment}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Total</p>
                  <p className="font-bold text-fuchsia-600">
                    <FancyPrice amount={selectedTx.total} />
                  </p>
                </div>
              </div>

              <div>
                <p className="text-slate-400 text-xs mb-2">Productos</p>
                <div className="space-y-2">
                  {(selectedTx.items || []).map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center p-2 bg-slate-50 rounded"
                    >
                      <div>
                        <p className="font-medium text-sm">{item.title}</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          {formatNumber(item.qty || item.quantity, item.qty % 1 !== 0 ? 2 : 0)} x <FancyPrice amount={item.price} />
                        </p>
                      </div>
                      <p className="font-bold text-sm">
                        <FancyPrice amount={(item.qty || item.quantity) * item.price} />
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50 flex gap-2 justify-end">
                <button
                  onClick={() => {
                     if (onViewTicket) onViewTicket(selectedTx);
                  }}
                  className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border hover:bg-slate-50 rounded-lg transition flex items-center gap-2"
                >
                  <FileText size={14} /> Ticket
                </button>

                {canEditSales && selectedTx.status !== 'voided' && (
                  <button
                    onClick={() => {
                      setSelectedTx(null);
                      if (onEditTransaction) onEditTransaction(selectedTx);
                    }}
                    className="px-4 py-2 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition flex items-center gap-2"
                  >
                    <Edit2 size={14} /> Editar
                  </button>
                )}

                {canVoidSales && selectedTx.status !== 'voided' && (
                  <button
                    onClick={() => {
                      setSelectedTx(null);
                      if (onDeleteTransaction) onDeleteTransaction(selectedTx);
                    }}
                    className="px-4 py-2 text-sm font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition flex items-center gap-2"
                  >
                    <XCircle size={14} /> Anular
                  </button>
                )}

                <button
                  onClick={() => setSelectedTx(null)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition"
                >
                  Cerrar
                </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL CREAR / EDITAR SOCIO --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="max-h-[90vh] bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg text-gray-800">{modalMode === 'create' ? 'Nuevo Socio' : 'Editar Socio'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="max-h-[calc(90vh-76px)] overflow-y-auto p-6 space-y-4">
              <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre Completo *</label><input type="text" required className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-medium" placeholder="Ej: Juan Pérez" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} autoFocus /></div>
              {duplicateFormMember && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                  Socio duplicado, elegir otro nombre o introducir DNI.
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">DNI <span className="text-[9px] font-normal lowercase">(Opcional)</span></label>
                  <input type="text" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono text-sm" placeholder="Sin puntos" value={formData.dni} onChange={(e) => setFormData({...formData, dni: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Teléfono <span className="text-[9px] font-normal lowercase">(Opcional)</span></label>
                  <input type="text" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono text-sm" placeholder="Cod. Área + Num" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                </div>
              </div>    
                        
              <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Puntos (Ajuste Manual)</label><input type="number" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-bold text-blue-600" placeholder="0" value={formData.points} onChange={(e) => setFormData({...formData, points: e.target.value})} /></div>

              <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Correo Electrónico</label><input type="email" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm" placeholder="ejemplo@email.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} /></div>
              <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-1.5 text-xs font-bold uppercase text-fuchsia-700">
                    <Instagram size={14} />
                    Instagram
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-black text-slate-600">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.instagramConnected)}
                      onChange={(e) => setFormData({...formData, instagramConnected: e.target.checked})}
                      className="h-4 w-4 rounded border-fuchsia-200 text-fuchsia-600 focus:ring-fuchsia-200"
                    />
                    Confirmado
                  </label>
                </div>
                <input
                  className="w-full rounded-lg border border-fuchsia-100 bg-white p-2.5 text-sm outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100"
                  placeholder="@usuario"
                  value={formData.instagramHandle || ''}
                  onChange={(e) => setFormData({...formData, instagramHandle: e.target.value})}
                />
                <textarea
                  rows="2"
                  className="mt-2 w-full resize-none rounded-lg border border-fuchsia-100 bg-white p-2.5 text-xs outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-100"
                  placeholder="Nota interna opcional"
                  value={formData.instagramNotes || ''}
                  onChange={(e) => setFormData({...formData, instagramNotes: e.target.value})}
                />
                <p className="mt-2 text-[11px] font-semibold text-fuchsia-700">
                  Instagram queda guardado en la ficha del socio. La confirmaciÃ³n permite validar promociones que lo requieran, como REBUINSTA.
                </p>
              </div>
              <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notas / Extra</label><textarea rows="2" className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm resize-none" placeholder="Información adicional..." value={formData.extraInfo} onChange={(e) => setFormData({...formData, extraInfo: e.target.value})}></textarea></div>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-bold transition-colors">Cancelar</button>
                <AsyncActionButton type="submit" pending={isPending(`member-form:${modalMode}`)} loadingLabel="Guardando..." className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-bold shadow-md transition-colors flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-wait"><Save size={18} />{modalMode === 'create' ? 'Registrar Socio' : 'Guardar Cambios'}</AsyncActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL CONFIRMAR ELIMINACIÓN --- */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex h-[86vh] max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Auditoria de puntos</p>
                <h3 className="text-lg font-black text-slate-900">Puntos vencidos</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Se revisan puntos ganados hace mas de 6 meses y todavia disponibles.
                </p>
              </div>
              <button onClick={() => setIsAuditModalOpen(false)} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
              <div className="grid h-full min-h-0 gap-4 overflow-hidden lg:grid-cols-2">
                <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-red-100 bg-red-50/70">
                  <div className="border-b border-red-100 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-red-500">Vencidos ahora</p>
                    <h4 className="text-sm font-black text-slate-900">Puntos para auditar</h4>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      Solo esta columna se modifica al aplicar auditoria.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 px-3 py-3">
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="text-[10px] font-black uppercase text-red-400">Socios</p>
                      <p className="text-base font-black text-red-700">{formatNumber(auditPreviewReport.totals.expiredMembers)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="text-[10px] font-black uppercase text-red-400">Puntos</p>
                      <p className="text-base font-black text-red-700">{formatNumber(auditPreviewReport.totals.expiredPoints)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="text-[10px] font-black uppercase text-slate-400">Estado</p>
                      <p className="text-xs font-black text-slate-700">{auditReport?.applied ? 'Aplicada' : 'Vista previa'}</p>
                    </div>
                  </div>
                  <div className="scrollbar-visible min-h-0 flex-1 overflow-y-scroll overscroll-contain px-3 pb-3 pr-2">
                    {auditExpiredMemberRows.length > 0 ? (
                      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-red-100 bg-white">
                        <div className="bg-red-50/60 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-red-500">
                          Socios que pierden puntos
                        </div>
                        {auditExpiredMemberRows.slice(0, 80).map((member) => (
                          <div key={member.memberId} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-800">{member.name}</p>
                              <p className="text-[11px] font-semibold text-slate-400">
                                #{String(member.memberNumber || '---').padStart(4, '0')} - saldo {formatNumber(member.currentPoints)} &gt; {formatNumber(member.newPoints)} pts
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-black text-red-700">
                              Pierde {formatNumber(member.expiredPoints)} pts
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-red-100 bg-white px-4 py-8 text-center">
                        <ClipboardCheck className="mx-auto text-emerald-500" size={28} />
                        <p className="mt-2 text-sm font-black text-slate-700">No hay puntos vencidos</p>
                        <p className="mt-1 text-xs font-semibold text-slate-400">Los saldos actuales no requieren auditoria.</p>
                      </div>
                    )}
                  </div>
                </section>

                <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/70">
                  <div className="border-b border-blue-100 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-500">Consulta futura</p>
                        <h4 className="text-sm font-black text-slate-900">Puntos a vencer</h4>
                        <p className="mt-0.5 text-xs font-semibold text-slate-500">
                          Muestra puntos que venceran desde hoy hasta dentro de {selectedAuditRange.label}.
                        </p>
                      </div>
                      <div className="inline-flex shrink-0 rounded-lg border border-blue-100 bg-white p-1 shadow-sm">
                        {AUDIT_RANGE_OPTIONS.map((option) => (
                          <button
                            key={option.days}
                            type="button"
                            onClick={() => setAuditRangeDays(option.days)}
                            className={`h-8 rounded-md px-3 text-xs font-black transition ${
                              auditRangeDays === option.days
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 px-3 py-3">
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="text-[10px] font-black uppercase text-slate-400">Rango</p>
                      <p className="text-base font-black text-slate-800">{selectedAuditRange.label}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="text-[10px] font-black uppercase text-slate-400">Socios</p>
                      <p className="text-base font-black text-blue-700">{formatNumber(auditFutureReport.totals.upcomingMembers)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2">
                      <p className="text-[10px] font-black uppercase text-slate-400">Puntos</p>
                      <p className="text-base font-black text-blue-700">{formatNumber(auditFutureReport.totals.upcomingPoints)}</p>
                    </div>
                  </div>

                  <div className="scrollbar-visible min-h-0 flex-1 overflow-y-scroll overscroll-contain px-3 pb-3 pr-2">
                    <div className="overflow-hidden rounded-xl border border-blue-100 bg-white">
                      {auditFutureReport.upcomingMembers.length > 0 ? (
                        <div className="divide-y divide-slate-100">
                          <div className="bg-blue-50/60 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-blue-500">
                            Socios con puntos proximos a vencer
                          </div>
                          {auditFutureReport.upcomingMembers.slice(0, 60).map((member) => (
                            <div key={member.memberId} className="flex items-center justify-between gap-3 px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-800">{member.name}</p>
                                <p className="text-[11px] font-semibold text-slate-400">
                                  #{String(member.memberNumber || '---').padStart(4, '0')} - saldo {formatNumber(member.currentPoints)} pts
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-700">
                                Vence {formatNumber(member.upcomingPoints)} pts
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="px-4 py-8 text-center">
                          <p className="text-sm font-black text-slate-700">No hay puntos a vencer en este rango</p>
                          <p className="mt-1 text-xs font-semibold text-slate-400">Proba con un rango mas amplio.</p>
                        </div>
                      )}
                    </div>

                    {auditFutureReport.upcomingGroups.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Por fecha</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {auditFutureReport.upcomingGroups.slice(0, 12).map((group) => (
                            <button
                              key={group.dateKey}
                              type="button"
                              onClick={() => {
                                setSelectedExpirationGroup(group);
                                setExpirationGroupSearch('');
                                setExpirationGroupSortBy('expiring_desc');
                              }}
                              className="text-left cursor-pointer rounded-lg border border-blue-100 bg-white px-3 py-2 hover:border-blue-300 hover:bg-blue-50/60 transition-all shadow-xs"
                              title="Clic para ver los socios que perderán puntos en esta fecha"
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black uppercase text-blue-500">{group.displayDate}</p>
                                <span className="text-[10px] font-bold text-blue-500">Ver socios →</span>
                              </div>
                              <p className="mt-0.5 text-xs font-bold text-slate-700">
                                {formatNumber(group.points)} pts - {group.memberCount} socios
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
              >
                Cerrar
              </button>
              {auditPreviewReport.totals.expiredPoints > 0 && !auditReport?.applied && (
                <AsyncActionButton
                  onAction={handleApplyAudit}
                  pending={isPending('clients-audit')}
                  loadingLabel="Aplicando..."
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
                >
                  Aplicar auditoria
                </AsyncActionButton>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedExpirationGroup && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-label={`Socios con puntos a vencer el ${selectedExpirationGroup.displayDate}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedExpirationGroup(null);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-amber-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs shrink-0">
                  <CalendarDays size={22} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {selectedExpirationGroup.title || `Vencimiento de puntos · ${selectedExpirationGroup.displayDate}`}
                  </h3>
                  <p className="text-xs font-semibold text-slate-500">
                    Socios que perderán puntos en esta fecha ({selectedExpirationGroup.memberCount} socios en total)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExpirationGroup(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* KPIs & Filtros */}
            <div className="p-4 bg-slate-50/70 border-b border-slate-100 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total a perder</p>
                  <p className="text-lg font-black text-amber-700">{formatNumber(selectedExpirationGroup.points)} pts</p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Socios afectados</p>
                  <p className="text-lg font-black text-slate-800">{selectedExpirationGroup.memberCount} socios</p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Fecha límite</p>
                  <p className="text-lg font-black text-slate-800">{selectedExpirationGroup.displayDate}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
                {/* Search */}
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={expirationGroupSearch}
                    onChange={(e) => setExpirationGroupSearch(e.target.value)}
                    placeholder="Buscar socio por nombre, teléfono o N° socio..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                  {expirationGroupSearch && (
                    <button
                      type="button"
                      onClick={() => setExpirationGroupSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Sort dropdown */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-bold text-slate-500">Ordenar por:</span>
                  <select
                    value={expirationGroupSortBy}
                    onChange={(e) => setExpirationGroupSortBy(e.target.value)}
                    className="text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500 shadow-xs cursor-pointer"
                  >
                    <option value="expiring_desc">Puntos a perder (Mayor a menor)</option>
                    <option value="expiring_asc">Puntos a perder (Menor a mayor)</option>
                    <option value="points_desc">Saldo actual (Mayor a menor)</option>
                    <option value="points_asc">Saldo actual (Menor a mayor)</option>
                    <option value="name_asc">Nombre (A - Z)</option>
                    <option value="name_desc">Nombre (Z - A)</option>
                    <option value="id_asc">N° Socio (Ascendente)</option>
                    <option value="id_desc">N° Socio (Descendente)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* List / Table */}
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
              {filteredExpirationGroupMembers.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50/80 sticky top-0 z-10 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 backdrop-blur-xs">
                    <tr>
                      <th className="px-4 py-2.5 text-center">N° Socio</th>
                      <th className="px-4 py-2.5">Socio</th>
                      <th className="px-4 py-2.5">Contacto</th>
                      <th className="px-4 py-2.5 text-center">Saldo Actual</th>
                      <th className="px-4 py-2.5 text-center">Puntos a Perder</th>
                      <th className="px-4 py-2.5 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                    {filteredExpirationGroupMembers.map((item) => {
                      const fullMember = item.member || (Array.isArray(members) ? members : []).find((m) => String(m.id) === String(item.memberId));
                      const phoneStr = fullMember?.phone || item.phone;
                      return (
                        <tr key={item.memberId || item.memberNumber || item.name} className="hover:bg-amber-50/30 transition-colors">
                          <td className="px-4 py-3 text-center">
                            <span className="font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[11px]">
                              #{String(item.memberNumber || '0').padStart(4, '0')}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-black text-xs shrink-0">
                                {(item.name || '?').charAt(0).toUpperCase()}
                              </div>
                              <span className="font-bold text-slate-900 truncate max-w-[180px]">{item.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {phoneStr ? (
                              <span className="text-slate-600 font-mono text-[11px] flex items-center gap-1">
                                <Phone size={11} className="text-slate-400" />
                                {phoneStr}
                              </span>
                            ) : (
                              <span className="text-slate-300 italic text-[11px]">Sin teléfono</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-600">
                            {formatNumber(item.currentPoints)} pts
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-black text-xs border border-red-200">
                              Pierde {formatNumber(item.expiringPoints)} pts
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                if (fullMember) {
                                  setSelectedExpirationGroup(null);
                                  setIsAuditModalOpen(false);
                                  openDrawerDetails(fullMember);
                                }
                              }}
                              className="px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title="Ver ficha del socio"
                            >
                              Ver ficha
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-slate-400">
                  <User size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="font-bold text-sm text-slate-600">No se encontraron socios</p>
                  <p className="text-xs">Probá con otro término de búsqueda.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Mostrando {filteredExpirationGroupMembers.length} de {selectedExpirationGroup.memberCount} socios</span>
              <button
                type="button"
                onClick={() => setSelectedExpirationGroup(null)}
                className="px-4 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle size={32} className="text-red-600" /></div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar Socio?</h3>
              <p className="text-gray-500 text-sm mb-6">Estás a punto de eliminar a <span className="font-bold text-gray-800">{memberToDelete?.name}</span>. <br/>Esta acción no se puede deshacer y se perderán sus puntos e historial.</p>
              <div className="flex gap-3">
                <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg font-bold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
                <AsyncActionButton onAction={confirmDelete} pending={isPending(`delete-member:${memberToDelete?.id || 'unknown'}`)} loadingLabel="Eliminando..." className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-md transition-colors disabled:opacity-60 disabled:cursor-wait">Sí, Eliminar</AsyncActionButton>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
