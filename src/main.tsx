import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import ErrorBoundary from './components/common/ErrorBoundary'
import { PRODUIT } from './compta/produit'

// LabFlow Compta (SPEC-SOCLE D11) : sur compta.labflow-tn.com, la coquille Compta, chargée à la demande ; sinon LabFlow.
const ComptaApp = lazy(() => import('./compta/ComptaApp'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {PRODUIT === 'compta' ? <Suspense fallback={null}><ComptaApp /></Suspense> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
