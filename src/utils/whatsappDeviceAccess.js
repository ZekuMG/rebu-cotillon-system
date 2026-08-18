import { supabase } from '../supabase/client';

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

const normalizeRole = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

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

  async ensureCentral(currentUser) {
    let device = null;
    try {
      device = await localDevice();
    } catch {
      device = { supported: false };
    }
    if (device?.centralMachineActive === true) {
      return { status: 'approved', approved: true, device };
    }
    if (!device?.supported) {
      return { status: 'unsupported', approved: false, device };
    }
    const role = normalizeRole(currentUser?.role);
    try {
      let result = await statusFor(device);
      if (result?.approved || result?.status === 'approved') {
        return { ...result, status: 'approved', approved: true, device };
      }

      if (['system', 'sistema'].includes(role)) {
        const requested = await requestAccess(device);
        if (requested?.id) {
          const approved = await rpc('review_whatsapp_device_access', {
            p_request_id: requested.id,
            p_decision: 'approved',
          });
          return { ...approved, status: 'approved', approved: true, device };
        }
      }
      return result;
    } catch (err) {
      console.warn('ensureCentral check notice:', err);
      if (device?.centralMachineActive === true) {
        return { status: 'approved', approved: true, device };
      }
      return { status: 'unsupported', approved: false, device };
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
