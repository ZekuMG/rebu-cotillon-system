import { createClient } from '@supabase/supabase-js'

import { recordDiagnosticError } from '../utils/diagnosticsLog'
import { crearFetchAutoreparable } from './sessionSelfHeal'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const enableAuthSession = import.meta.env.VITE_REBU_WHATSAPP_AUTH_SESSION === '1'
const persistAuthenticatedSession =
  enableAuthSession && import.meta.env.VITE_REBU_PERSIST_AUTH_SESSION === '1'
const realtimeHeartbeatListeners = new Set()
const memoryAuthStorageValues = new Map()

const memoryAuthStorage = {
  getItem: (key) => memoryAuthStorageValues.get(key) ?? null,
  setItem: (key, value) => memoryAuthStorageValues.set(key, value),
  removeItem: (key) => memoryAuthStorageValues.delete(key)
}

export const subscribeToRealtimeHeartbeat = (listener) => {
  if (typeof listener !== 'function') return () => {}
  realtimeHeartbeatListeners.add(listener)
  return () => realtimeHeartbeatListeners.delete(listener)
}

const notifyRealtimeHeartbeat = (status, latency) => {
  realtimeHeartbeatListeners.forEach((listener) => {
    try {
      listener({ status, latency: Number(latency) || null, observedAt: Date.now() })
    } catch (error) {
      console.warn('No se pudo procesar el heartbeat de Realtime:', error)
    }
  })
}

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el entorno.')
}

// No reutilizar JWT persistidos por versiones anteriores cuando la sesion segura
// se mantiene solo en memoria. La clave se limita al proyecto actual.
if (!persistAuthenticatedSession && typeof window !== 'undefined') {
  try {
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
    const authStorageKey = `sb-${projectRef}-auth-token`
    Object.keys(window.localStorage).forEach((key) => {
      if (key === authStorageKey || key.startsWith(`${authStorageKey}.`) || key.startsWith(`${authStorageKey}-`)) {
        window.localStorage.removeItem(key)
      }
    })
  } catch (error) {
    console.warn('No se pudo limpiar la sesion JWT local de contingencia:', error)
  }
}

// Red de seguridad ante un token de sesion rechazado. La logica vive en
// `sessionSelfHeal.js` para poder probarla de verdad, no por su texto fuente.
let clienteSupabase = null

const fetchConSesionAutoreparable = crearFetchAutoreparable({
  fetchOriginal: (entrada, init) => fetch(entrada, init),
  anonKey: supabaseKey,
  // Se resuelve tarde a proposito: el cliente todavia no existe cuando se
  // construye este envoltorio.
  descartarSesion: async () => {
    if (!clienteSupabase) throw new Error('cliente Supabase todavia no construido')
    await clienteSupabase.auth.signOut({ scope: 'local' })
  },
  registrarDiagnostico: (detalle) => recordDiagnosticError('supabase:401', detalle, detalle),
  avisar: (detalle) => console.warn(
    '[REBU][auth] Supabase rechazo el token de la sesion; se descarta',
    detalle,
  ),
})

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: enableAuthSession,
    detectSessionInUrl: false,
    persistSession: persistAuthenticatedSession,
    storage: persistAuthenticatedSession && typeof window !== 'undefined'
      ? window.localStorage
      : memoryAuthStorage
  },
  realtime: {
    worker: true,
    heartbeatCallback: notifyRealtimeHeartbeat
  },
  global: {
    fetch: fetchConSesionAutoreparable,
    headers: {
      'x-client-info': 'electron-app'
    }
  }
})

clienteSupabase = supabase
