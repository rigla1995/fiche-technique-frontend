import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Fichiers de la reconnaissance de caractères (tesseract.js) servis par l'application elle-même sous /ocr/ : rien
// n'est demandé à un tiers. Pris dans node_modules (versions figées par package-lock.json) : servis tels quels en
// développement, copiés dans dist/ocr/ à la construction. Lus seulement par la lecture de la patente (espace admin,
// chargée à la demande — lot 3, étape 7).
const FICHIERS_OCR: Record<string, string> = {
  'ocr/worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  'ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'ocr/core/tesseract-core-simd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'ocr/core/tesseract-core-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
  'ocr/lang/fra.traineddata.gz': 'node_modules/@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz',
}

function ocrAutoHeberge(): Plugin {
  const racine = fileURLToPath(new URL('.', import.meta.url))
  const source = (cle: string) => path.resolve(racine, FICHIERS_OCR[cle])
  return {
    name: 'ocr-auto-heberge',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const cle = (req.url ?? '').split('?')[0].replace(/^\//, '')
        if (!(cle in FICHIERS_OCR)) return next()
        res.setHeader('Content-Type', cle.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
        fs.createReadStream(source(cle)).pipe(res)
      })
    },
    generateBundle() {
      for (const cle of Object.keys(FICHIERS_OCR)) {
        this.emitFile({ type: 'asset', fileName: cle, source: fs.readFileSync(source(cle)) })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ocrAutoHeberge()],
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
