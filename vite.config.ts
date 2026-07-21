import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Vendor stable entre déploiements : son hash ne bouge pas quand le code
        // applicatif change → les visiteurs récurrents gardent React en cache.
        // ⚠️ Ne PAS y mettre recharts/jspdf/exceljs : un manualChunk référencé par
        // l'entrée redevient chargé d'emblée — on les laisse aux imports dynamiques.
        manualChunks(id: string) {
          if (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'react-vendor';
          }
        },
      },
    },
  },
})
