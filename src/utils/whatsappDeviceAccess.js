import { supabase } from '../supabase/client';
import {
  APROBAR,
  NADA,
  REGISTRAR,
  primerPaso,
  resultadoDeAcceso,
  siguientePaso,
} from './whatsappDeviceAccessPlan';

const rpc = async (name, payload = {}) => {
  const { data, error } = await supabase.rpc(name, payload);
  if (error) throw error;
  return data;
};

const localDevice = async () => {
  if (typeof window.electronAPI?.getWhatsAppAccessDevice !== 'function') {
    return { supported: false };
  }
  return window.electronAPI.getWhatsAppAccessDevice();
};

const statusFor = async (device) => {
  if (!device?.supported || !device.deviceId || !device.tokenHash) {
    return { status: 'unsupported', approved: false, device };
  }
  const status = await rpc('get_my_whatsapp_device_access', {
    p_device_id: device.deviceId,
    p_token_hash: device.tokenHash,
  });
  return { ...status, device };
};

const requestAccess = async (device) => {
  if (!device?.supported || !device?.deviceId || !device?.tokenHash) {
    return { status: 'unsupported', approved: false, device };
  }
  const result = await rpc('request_whatsapp_device_access', {
    p_device_id: device.deviceId,
    p_token_hash: device.tokenHash,
    p_device_name: device.deviceName || 'Equipo desconocido',
    p_platform: device.platform || '',
  });
  return { ...result, device };
};

export const whatsappDeviceAccess = {
  localDevice,

  async status() {
    return statusFor(await localDevice());
  },

  async request(deviceInput = null) {
    const device = deviceInput || await localDevice();
    return requestAccess(device);
  },

  // El estado SIEMPRE sale de la base. Que esta PC se crea la central no la
  // habilita: el bot valida contra la base igual y contesta 403. Ver el detalle
  // del callejon sin salida en whatsappDeviceAccessPlan.js.
  async ensureCentral(currentUser) {
    let device = null;
    try {
      device = await localDevice();
    } catch {
      device = { supported: false };
    }
    if (primerPaso(device) === NADA) {
      return resultadoDeAcceso({ device, estado: null });
    }

    const rol = currentUser?.role;
    try {
      let estado = await statusFor(device);

      let paso = siguientePaso({ device, rol, estado });
      if (paso === REGISTRAR) {
        estado = await requestAccess(device);
        paso = siguientePaso({ device, rol, estado });
      }
      if (paso === APROBAR) {
        const pedido = estado?.id ? estado : await requestAccess(device);
        if (pedido?.id) {
          estado = await rpc('review_whatsapp_device_access', {
            p_request_id: pedido.id,
            p_decision: 'approved',
          });
        }
      }

      return resultadoDeAcceso({ device, estado });
    } catch (err) {
      // Nunca devolver "aprobado" desde acá: tapaba un 403 real detrás de una
      // pantalla que decía estar habilitada, y dejaba sin salida a la central.
      console.warn('ensureCentral check notice:', err);
      return resultadoDeAcceso({ device, estado: null, error: err });
    }
  },

  async list() {
    const result = await rpc('list_whatsapp_device_access_requests');
    return Array.isArray(result) ? result : [];
  },

  review(requestId, decision) {
    return rpc('review_whatsapp_device_access', {
      p_request_id: requestId,
      p_decision: decision,
    });
  },
};
