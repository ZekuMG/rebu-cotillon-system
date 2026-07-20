import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const realtimeHeartbeatListeners = new Set()

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

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    detectSessionInUrl: false,
    persistSession: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined
  },
  realtime: {
    worker: true,
    heartbeatCallback: notifyRealtimeHeartbeat
  },
  global: {
    headers: {
      'x-client-info': 'electron-app'
    }
  }
})
