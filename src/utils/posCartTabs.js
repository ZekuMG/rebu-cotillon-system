let posCartIdSequence = 0;

export const createPosCartId = () => {
  posCartIdSequence += 1;
  return `pos-cart-${Date.now()}-${posCartIdSequence}`;
};

export const createPosCartTab = ({
  id = createPosCartId(),
  sequence = 1,
  cart = [],
  selectedClient = null,
  selectedPayment = 'Efectivo',
  installments = 1,
} = {}) => ({
  id: String(id),
  sequence: Math.max(1, Number(sequence) || 1),
  cart: Array.isArray(cart) ? cart : [],
  selectedClient: selectedClient || null,
  selectedPayment: selectedPayment || 'Efectivo',
  installments: Math.max(1, Number(installments) || 1),
});

export const createPosCartWorkspace = ({ id = createPosCartId() } = {}) => ({
  tabs: [createPosCartTab({ id, sequence: 1 })],
  activeId: String(id),
  nextSequence: 2,
});

export const getActivePosCart = (workspace) => {
  const tabs = Array.isArray(workspace?.tabs) ? workspace.tabs : [];
  return tabs.find((tab) => String(tab.id) === String(workspace?.activeId)) || tabs[0] || null;
};

export const normalizePosCartWorkspace = (snapshot = {}) => {
  const rawTabs = Array.isArray(snapshot.posCarts)
    ? snapshot.posCarts
    : Array.isArray(snapshot.posCartWorkspace?.tabs)
      ? snapshot.posCartWorkspace.tabs
      : null;

  if (!rawTabs || rawTabs.length === 0) {
    const legacyTab = createPosCartTab({
      sequence: 1,
      cart: snapshot.cart,
      selectedClient: snapshot.selectedClient,
      selectedPayment: snapshot.selectedPayment,
      installments: snapshot.installments,
    });
    return { tabs: [legacyTab], activeId: legacyTab.id, nextSequence: 2 };
  }

  const usedIds = new Set();
  const tabs = rawTabs.map((tab, index) => {
    let id = String(tab?.id || createPosCartId());
    if (usedIds.has(id)) id = createPosCartId();
    usedIds.add(id);
    return createPosCartTab({ ...tab, id, sequence: tab?.sequence || index + 1 });
  });
  const requestedActiveId = String(
    snapshot.activePosCartId || snapshot.posCartWorkspace?.activeId || '',
  );
  const activeId = tabs.some((tab) => tab.id === requestedActiveId)
    ? requestedActiveId
    : tabs[0].id;
  const maxSequence = tabs.reduce((max, tab) => Math.max(max, Number(tab.sequence) || 0), 0);

  return {
    tabs,
    activeId,
    nextSequence: Math.max(
      maxSequence + 1,
      Number(snapshot.posCartWorkspace?.nextSequence) || 0,
    ),
  };
};

export const updatePosCartTab = (workspace, tabId, updater) => {
  const tabs = Array.isArray(workspace?.tabs) ? workspace.tabs : [];
  let changed = false;
  const nextTabs = tabs.map((tab) => {
    if (String(tab.id) !== String(tabId)) return tab;
    const nextTab = typeof updater === 'function' ? updater(tab) : updater;
    if (!nextTab || nextTab === tab) return tab;
    changed = true;
    return createPosCartTab({ ...tab, ...nextTab, id: tab.id, sequence: tab.sequence });
  });
  return changed ? { ...workspace, tabs: nextTabs } : workspace;
};

export const updateActivePosCartField = (workspace, field, valueOrUpdater) => {
  const activeTab = getActivePosCart(workspace);
  if (!activeTab) return workspace;
  const currentValue = activeTab[field];
  const nextValue = typeof valueOrUpdater === 'function'
    ? valueOrUpdater(currentValue)
    : valueOrUpdater;
  if (Object.is(currentValue, nextValue)) return workspace;
  return updatePosCartTab(workspace, activeTab.id, { [field]: nextValue });
};

export const addPosCartTab = (workspace, { id = createPosCartId() } = {}) => {
  const sequence = Math.max(1, Number(workspace?.nextSequence) || 1);
  const nextTab = createPosCartTab({ id, sequence });
  return {
    tabs: [...(workspace?.tabs || []), nextTab],
    activeId: nextTab.id,
    nextSequence: sequence + 1,
  };
};

export const selectPosCartTab = (workspace, tabId) => (
  (workspace?.tabs || []).some((tab) => String(tab.id) === String(tabId))
    ? { ...workspace, activeId: String(tabId) }
    : workspace
);

export const closePosCartTab = (workspace, tabId, { replacementId = createPosCartId() } = {}) => {
  const tabs = Array.isArray(workspace?.tabs) ? workspace.tabs : [];
  const closingIndex = tabs.findIndex((tab) => String(tab.id) === String(tabId));
  if (closingIndex < 0) return workspace;

  const remainingTabs = tabs.filter((tab) => String(tab.id) !== String(tabId));
  if (remainingTabs.length === 0) {
    const sequence = Math.max(1, Number(workspace?.nextSequence) || 1);
    const replacement = createPosCartTab({ id: replacementId, sequence });
    return {
      tabs: [replacement],
      activeId: replacement.id,
      nextSequence: sequence + 1,
    };
  }

  const wasActive = String(workspace?.activeId) === String(tabId);
  const nextActive = remainingTabs[Math.min(closingIndex, remainingTabs.length - 1)];
  return {
    ...workspace,
    tabs: remainingTabs,
    activeId: wasActive ? nextActive.id : workspace.activeId,
  };
};

export const getPosCartItemCount = (tab) => (
  (tab?.cart || []).reduce(
    (total, item) => total + (item?.product_type === 'weight' ? 1 : Number(item?.quantity) || 0),
    0,
  )
);
