export const getProductImageUrl = (product = {}, { preferOriginal = false } = {}) => {
  if (!product) return '';

  const thumb = product.imageThumb || product.image_thumb || product.thumb || product.thumbnail || '';
  const original = product.image || product.image_url || product.imageUrl || '';

  return String(preferOriginal ? original || thumb : thumb || original).trim();
};

export const hasProductImage = (product = {}) => Boolean(getProductImageUrl(product));
