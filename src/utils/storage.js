// src/utils/storage.js
// ✅ Módulo de utilidades para Supabase Storage (bucket: product-images)

import { supabase } from '../supabase/client';
import {
  buildUserAvatarStoragePaths,
  getUserAvatarStoragePaths,
  USER_AVATAR_STORAGE_BUCKET,
} from './userAvatarStorage';

const BUCKET = 'product-images';
const THUMB_SIZE = 320;
const PRODUCT_IMAGE_CACHE_CONTROL = '31536000';
const USER_AVATAR_SIZE = 320;
const USER_AVATAR_MAX_BYTES = 6 * 1024 * 1024;

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });

const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo preparar la imagen.'));
    image.src = src;
  });

const readSourceAsDataUrl = async (source) => {
  if (!source) throw new Error('No se recibió imagen para generar miniatura.');
  if (source instanceof File) {
    return readFileAsDataUrl(source);
  }
  if (typeof source === 'string' && source.startsWith('data:image/')) {
    return source;
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error('No se pudo descargar la imagen original.');
  }

  const blob = await response.blob();
  return readFileAsDataUrl(new File([blob], 'product-image', { type: blob.type || 'image/jpeg' }));
};

const readSourceAsImageFile = async (source) => {
  if (source instanceof File) return source;
  if (typeof source !== 'string' || !source.startsWith('data:image/')) {
    throw new Error('El avatar seleccionado no es una imagen valida.');
  }

  const response = await fetch(source);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('El avatar seleccionado no es una imagen valida.');
  }
  return new File([blob], 'avatar-original', { type: blob.type });
};

const buildProductThumbFile = async (file, { size = THUMB_SIZE, quality = 0.82 } = {}) => {
  const source = await readSourceAsDataUrl(file);
  const image = await loadImageElement(source);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo preparar la miniatura.');
  }

  const scale = Math.max(size / image.width, size / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const x = (size - drawWidth) / 2;
  const y = (size - drawHeight) / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(image, x, y, drawWidth, drawHeight);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error('No se pudo exportar la miniatura.'));
      },
      'image/webp',
      quality
    );
  });

  const baseName = (file.name || 'product-image').replace(/\.[^.]+$/, '') || 'product-image';
  return new File([blob], `${baseName}-thumb.webp`, { type: 'image/webp' });
};

export const uploadProductThumbFromSource = async (source) => {
  const random = Math.random().toString(36).substring(2, 8);
  const baseName = `${Date.now()}_${random}`;
  const thumbFile = await buildProductThumbFile(source);
  const thumbFileName = `products/thumbs/${baseName}.webp`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(thumbFileName, thumbFile, {
      cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
      upsert: false,
    });

  if (error) {
    console.error('Error subiendo miniatura:', error);
    throw new Error(error.message || 'Error al subir la miniatura');
  }

  const { data: thumbUrlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(data.path);

  return thumbUrlData.publicUrl;
};

/**
 * Sube una imagen al bucket de Supabase Storage.
 * @param {File} file - El archivo de imagen a subir.
 * @returns {Promise<{ image: string, imageThumb: string }>} - URLs pública original y miniatura.
 */
export const uploadProductImage = async (file) => {
  const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
  const random = Math.random().toString(36).substring(2, 8);
  const baseName = `${Date.now()}_${random}`;
  const fileName = `products/${baseName}.${ext}`;
  const thumbFile = await buildProductThumbFile(file);
  const thumbFileName = `products/thumbs/${baseName}.webp`;

  const [{ data, error }, { data: thumbData, error: thumbError }] = await Promise.all([
    supabase.storage
      .from(BUCKET)
      .upload(fileName, file, {
        cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
        upsert: false,
      }),
    supabase.storage
      .from(BUCKET)
      .upload(thumbFileName, thumbFile, {
        cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
        upsert: false,
      }),
  ]);

  if (error) {
    console.error('Error subiendo imagen:', error);
    throw new Error(error.message || 'Error al subir la imagen');
  }

  if (thumbError) {
    console.error('Error subiendo miniatura:', thumbError);
    throw new Error(thumbError.message || 'Error al subir la miniatura');
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(data.path);
  const { data: thumbUrlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(thumbData.path);

  return {
    image: urlData.publicUrl,
    imageThumb: thumbUrlData.publicUrl,
  };
};

export const uploadUserAvatar = async (source, { userId = 'unassigned' } = {}) => {
  const originalFile = await readSourceAsImageFile(source);
  if (originalFile.size > USER_AVATAR_MAX_BYTES) {
    throw new Error('La foto de usuario supera el limite de 6 MB.');
  }

  const thumbnailFile = await buildProductThumbFile(originalFile, {
    size: USER_AVATAR_SIZE,
    quality: 0.84,
  });
  const { originalPath, thumbnailPath } = buildUserAvatarStoragePaths({ userId });
  const [{ data: originalData, error: originalError }, { data: thumbnailData, error: thumbnailError }] =
    await Promise.all([
      supabase.storage
        .from(USER_AVATAR_STORAGE_BUCKET)
        .upload(originalPath, originalFile, {
          cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
          contentType: originalFile.type || 'image/jpeg',
          upsert: false,
        }),
      supabase.storage
        .from(USER_AVATAR_STORAGE_BUCKET)
        .upload(thumbnailPath, thumbnailFile, {
          cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
          contentType: 'image/webp',
          upsert: false,
        }),
    ]);

  if (originalError || thumbnailError) {
    const uploadedPaths = [
      originalData?.path || null,
      thumbnailData?.path || null,
    ].filter(Boolean);
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(USER_AVATAR_STORAGE_BUCKET).remove(uploadedPaths).catch(() => {});
    }
    const error = originalError || thumbnailError;
    throw new Error(error?.message || 'No se pudo subir la foto de usuario.');
  }

  const { data: originalUrlData } = supabase.storage
    .from(USER_AVATAR_STORAGE_BUCKET)
    .getPublicUrl(originalData.path);
  const { data: thumbnailUrlData } = supabase.storage
    .from(USER_AVATAR_STORAGE_BUCKET)
    .getPublicUrl(thumbnailData.path);

  return {
    avatar: thumbnailUrlData.publicUrl,
    original: originalUrlData.publicUrl,
  };
};

export const deleteUserAvatar = async (avatarUrl) => {
  const paths = getUserAvatarStoragePaths(avatarUrl);
  if (paths.length === 0) return false;

  const { error } = await supabase.storage
    .from(USER_AVATAR_STORAGE_BUCKET)
    .remove(paths);
  if (error) {
    console.warn('No se pudo eliminar la foto anterior del usuario:', error);
    return false;
  }
  return true;
};

/**
 * Elimina una imagen del bucket de Supabase Storage.
 * Solo intenta borrar si la URL pertenece a nuestro bucket.
 * @param {string} imageUrl - La URL pública de la imagen.
 * @returns {Promise<boolean>} - true si se eliminó, false si no era de storage.
 */
export const deleteProductImage = async (imageUrl) => {
  if (!imageUrl) return false;

  // Extraer el path del archivo desde la URL
  // URL típica: https://xxxxx.supabase.co/storage/v1/object/public/product-images/products/123_abc.jpg
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = imageUrl.indexOf(marker);

  if (idx === -1) {
    // No es una URL de nuestro bucket (puede ser una URL externa o base64 viejo)
    console.log('Imagen no es de Storage, no se elimina del bucket.');
    return false;
  }

  const filePath = imageUrl.substring(idx + marker.length);

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([filePath]);

  if (error) {
    console.error('Error eliminando imagen:', error);
    return false;
  }

  console.log('Imagen eliminada de Storage:', filePath);
  return true;
};

/**
 * Verifica si una URL es de Supabase Storage.
 * @param {string} url 
 * @returns {boolean}
 */
export const isStorageUrl = (url) => {
  if (!url) return false;
  return url.includes(`/storage/v1/object/public/${BUCKET}/`);
};

/**
 * Verifica si una string es base64 (imagen vieja).
 * @param {string} str 
 * @returns {boolean}
 */
export const isBase64Image = (str) => {
  if (!str) return false;
  return str.startsWith('data:image/');
};
