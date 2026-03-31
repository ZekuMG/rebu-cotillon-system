export const isImageAvatar = (value) => {
  const avatar = String(value || '').trim();
  return /^(data:image\/|https?:\/\/|\/)/i.test(avatar);
};
