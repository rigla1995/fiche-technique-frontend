import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { MANUEL_COMPTA } from './manuelCompta';

// ── Coquille de LabFlow Compta (SPEC-SOCLE D11, étape S1) ─────────────────────────────────────────────────────────
// Ses propres routes, chargées à la demande : la connexion, l'activation et le mot de passe oublié reprennent les
// pages de LabFlow (habillées « LabFlow Compta » par AuthShell) ; l'accueil liste les comptabilités de la personne.
// Pages connectées : mise en page de LabFlow (LayoutCompta : barre du haut, menu de gauche), demande du client du 06/10.
// Ni notifications ni assistant ici. Les textes de LabFlow Compta sont en vocabulaire comptable fixe, jamais traduits
// par le domaine du compte (src/compta/** hors du moteur de vocabulaire).
const ComptaLoginPage = lazy(() => import('./pages/ComptaLoginPage'));
const ComptaAccueil = lazy(() => import('./pages/ComptaAccueil'));
const ComptaErreur = lazy(() => import('./pages/ComptaErreur'));
const LayoutCompta = lazy(() => import('./LayoutCompta'));
// Le manuel de LabFlow Compta s'affiche dans la page du manuel de LabFlow (même présentation), réglée sur le produit.
const GuidePage = lazy(() => import('../components/client/GuidePage'));
const InvitePage = lazy(() => import('../components/auth/InvitePage'));
const ForgotPasswordPage = lazy(() => import('../components/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../components/auth/ResetPasswordPage'));

export const Chargement = () => (
  <div style={{ minHeight: '100vh', background: '#04050B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: 34, height: 34, border: '3px solid rgba(165,180,252,0.25)', borderTopColor: '#A5B4FC', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
  </div>
);

export default function ComptaApp() {
  useEffect(() => {
    document.title = 'LabFlow Compta';
    document.documentElement.lang = 'fr';
  }, []);
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Chargement />}>
          <Routes>
            <Route path="/login" element={<ComptaLoginPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
            <Route path="/error/:code" element={<ComptaErreur />} />
            <Route element={<LayoutCompta />}>
              <Route path="/" element={<ComptaAccueil />} />
              <Route path="/manuel" element={<GuidePage manuel={MANUEL_COMPTA} />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
