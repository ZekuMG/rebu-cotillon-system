import React from 'react';
import { getInitialsFromName } from '../utils/appUsers';
import { isImageAvatar } from '../utils/avatarUtils';

export default function UserAvatar({
  avatar,
  name = 'Usuario',
  color = '#334155',
  sizeClass = 'h-10 w-10',
  textClass = 'text-sm',
  className = '',
  alt,
}) {
  const safeAvatar = String(avatar || '').trim();
  const initials = String(safeAvatar || getInitialsFromName(name, 'US'))
    .trim()
    .slice(0, 4)
    .toUpperCase();

  const baseClass = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${sizeClass} ${className}`.trim();

  if (isImageAvatar(safeAvatar)) {
    return (
      <span className={`${baseClass} bg-slate-200 ring-1 ring-slate-200`}>
        <img
          src={safeAvatar}
          alt={alt || name}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={`${baseClass} font-black text-white ${textClass}`.trim()}
      style={{ backgroundColor: color }}
      title={name}
    >
      {initials}
    </span>
  );
}
