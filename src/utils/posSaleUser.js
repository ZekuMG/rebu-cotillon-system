// These accounts retain their web access but are not checkout operators.
// Match their IDs so renaming them cannot make them appear in the POS again.
const WEB_ACCESS_ONLY_USER_IDS = new Set([
  'ef8bbf90-6b1a-4724-839a-ea3d8c6aa7ab', // Ramiro (web)
  '9b45990c-1dde-46bf-8af9-d0426814c5ac', // Rebu (web)
]);

export const getPosSaleUsers = (userCatalog) => (
  (userCatalog?.all || []).filter((user) => (
    user.id && user.isActive === true && !WEB_ACCESS_ONLY_USER_IDS.has(String(user.id))
  ))
);

export const resolvePosSaleUser = (userCatalog, selectedUserId) => (
  selectedUserId
    ? getPosSaleUsers(userCatalog).find((user) => String(user.id) === String(selectedUserId)) || null
    : null
);
