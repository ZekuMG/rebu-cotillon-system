import { supabase } from '../supabase/client';

const readFunctionError = async (error) => {
  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      if (payload?.error) return String(payload.error);
    } catch {
      // El mensaje genérico de Supabase sigue siendo útil si el cuerpo no es JSON.
    }
  }
  return String(error?.message || 'No se pudo generar la imagen.');
};

export const invokeAiImageStudio = async (payload) => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session?.access_token) {
    throw new Error('La sesión segura de Supabase no está disponible. Volvé a iniciar sesión.');
  }

  const { data, error } = await supabase.functions.invoke('ai-image-studio', {
    body: payload,
  });

  if (error) {
    throw new Error(await readFunctionError(error));
  }
  if (!data?.imageDataUrl) {
    throw new Error('Cloudflare no devolvió una imagen válida.');
  }

  return data;
};
