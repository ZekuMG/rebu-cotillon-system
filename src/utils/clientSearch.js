import { getInstagramConnection } from './socialConnections';

export const normalizeClientSearchValue = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const getClientSearchTerms = (value) =>
  normalizeClientSearchValue(value)
    .split(/\s+/)
    .filter(Boolean);

export const memberMatchesSearchTerms = (member, searchTerms) => {
  if (!searchTerms || searchTerms.length === 0) return true;

  const instagram = getInstagramConnection(member).handle;
  const searchableText = normalizeClientSearchValue([
    member?.name,
    member?.memberNumber,
    member?.member_number,
    member?.number,
    member?.dni,
    member?.phone,
    member?.email,
    instagram,
  ].filter(Boolean).join(' '));

  return searchTerms.every((term) => searchableText.includes(term));
};
