// src/utils/storage.js
// ✅ Módulo de utilidades para Supabase Storage (bucket: product-images)

import { supabase } from '../supabase/client';

const BUCKET = 'product-images';

/**
 * Sube una imagen al bucket de Supabase Storage.
 * @param {File} file - El archivo de imagen a subir.
 * @returns {Promise<string>} - La URL pública de la imagen subida.
 */
export const uploadProductImage = async (file) => {
  // Generar nombre único: products/1234567890_abc123.jpg
  const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
  const random = Math.random().toString(36).substring(2, 8);
  const fileName = `products/${Date.now()}_${random}.${ext}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Error subiendo imagen:', error);
    throw new Error(error.message || 'Error al subir la imagen');
  }

  // Obtener URL pública
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
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