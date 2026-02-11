import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './', // <--- AGREGA ESTA LÍNEA
  plugins: [react()],
  build: {
    target: 'es2015', // <--- Importante para tablets viejas (Chrome < 60, Safari < 11)
  }
})