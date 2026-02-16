import { createClient } from '@supabase/supabase-js'

// Usamos tus credenciales reales directamente para evitar problemas con Vite y el .env
const supabaseUrl = "https://rwqqjthrvweubksrlqzy.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3cXFqdGhydndldWJrc3JscXp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2Nzc1MzAsImV4cCI6MjA4NjI1MzUzMH0.u5PADiaHJUOsLHgrBQw5YVcbefnmymW2Mi3Amvrw3Js"

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    detectSessionInUrl: false, 
    persistSession: true,
    storage: window.localStorage
  },
  global: {
    headers: {
      'x-client-info': 'electron-app'
    },
    // 👇 ESTA ES LA FUNCIÓN CORREGIDA 👇
    fetch: (url, options = {}) => {
      // Usamos la clase Headers nativa para no perder la API Key
      const newHeaders = new Headers(options.headers);
      
      // Forzamos el origen para que Supabase no bloquee a Electron
      newHeaders.set('Origin', 'http://localhost');
      
      return fetch(url, {
        ...options,
        headers: newHeaders
      });
    }
  }
})