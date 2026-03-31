import React from 'react';
import { resolveUserPresentation } from '../utils/userPresentation';

const SIZE_CLASSES = {
  sm: 'px-[7px] py-[2px] text-[9px]',
  md: 'px-2 py-0.5 text-[10px]',
  lg: 'px-2.5 py-1 text-[11px]',
};

export function UserDisplayBadge({
  user,
  userCatalog,
  size = 'md',
  className = '',
  uppercase = true,
}) {
  const presentation = resolveUserPresentation(user, userCatalog);

  return (
    <span
      className={`inline-flex items-center rounded-[6px] border font-bold ${uppercase ? 'uppercase tracking-[0.08em]' : ''} ${SIZE_CLASSES[size] || SIZE_CLASSES.md} ${className}`}
      style={presentation.badgeStyle}
      title={presentation.displayName}
    >
      {presentation.displayName}
    </span>
  );
}

export default UserDisplayBadge;
