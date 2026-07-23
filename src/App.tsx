import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ConfirmProvider } from './components/common/ConfirmDialog';
import Layout from './components/common/Layout';
import VenteGuard from './components/client/VenteGuard';
import AcheteursGuard from './components/client/AcheteursGuard';
import FormuleGuard from './components/client/FormuleGuard';
import './i18n';
import './index.css';

// ── Code-splitting par route ──────────────────────────────────────────────────
// Chaque page est un chunk chargé À LA DEMANDE (React.lazy) : le bundle initial
// ne contient plus que le shell (providers + Layout + guards). Les vendors lourds
// (recharts, jspdf…) suivent automatiquement leurs pages dans des chunks async.
const LoginPage = lazy(() => import('./components/auth/LoginPage'));
const InvitePage = lazy(() => import('./components/auth/InvitePage'));
const ForgotPasswordPage = lazy(() => import('./components/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./components/auth/ResetPasswordPage'));
const ClientsManagement = lazy(() => import('./components/admin/ClientsManagement'));
const ProductList = lazy(() => import('./components/client/ProductList'));
const ClientDashboard = lazy(() => import('./components/client/ClientDashboard'));
const ProductForm = lazy(() => import('./components/client/ProductForm'));
const ProductCategoriesPage = lazy(() => import('./components/client/ProductCategoriesPage'));
const ValorisesPage = lazy(() => import('./components/client/ValorisesPage'));
const ReferentielUnitesPage = lazy(() => import('./components/client/ReferentielUnitesPage'));
const ReferentielFamillesPage = lazy(() => import('./components/client/ReferentielFamillesPage'));
const ReferentielCategoriesPage = lazy(() => import('./components/client/ReferentielCategoriesPage'));
const ReferentielArticlesPage = lazy(() => import('./components/client/ReferentielArticlesPage'));
const ReferentielImportPage = lazy(() => import('./components/client/ReferentielImportPage'));
const Profile = lazy(() => import('./components/client/Profile'));
const ActivitesPage = lazy(() => import('./components/client/ActivitesPage'));
const StockPage = lazy(() => import('./components/client/StockPage'));
const HistoriqueApproPage = lazy(() => import('./components/client/HistoriqueApproPage'));
const HistoriquepertesPage = lazy(() => import('./components/client/HistoriquepertesPage'));
const StockLaboPage = lazy(() => import('./components/client/StockLaboPage'));
const TransferPage = lazy(() => import('./components/client/TransferPage'));
const TransferHistoriquePage = lazy(() => import('./components/client/TransferHistoriquePage'));
const FournisseursPage = lazy(() => import('./components/client/FournisseursPage'));
const FournisseursLaboPage = lazy(() => import('./components/client/FournisseursLaboPage'));
const LaboHistoriqueApproPage = lazy(() => import('./components/client/LaboHistoriqueApproPage'));
const LaboHistoriquepertesPage = lazy(() => import('./components/client/LaboHistoriquepertesPage'));
const FacturesApproPage = lazy(() => import('./components/client/FacturesApproPage'));
const LaboFacturesApproPage = lazy(() => import('./components/client/LaboFacturesApproPage'));
const InventairePage = lazy(() => import('./components/client/InventairePage'));
const HistoriqueInventairePage = lazy(() => import('./components/client/HistoriqueInventairePage'));
const ErrorPage = lazy(() => import('./components/common/ErrorPage'));
const AbonnementsManagement = lazy(() => import('./components/admin/AbonnementsManagement'));
const HistoriquePaiementsAdmin = lazy(() => import('./components/admin/HistoriquePaiementsAdmin'));
const HistoriquePromotionsAdmin = lazy(() => import('./components/admin/HistoriquePromotionsAdmin'));
const TarifsConfig = lazy(() => import('./components/admin/TarifsConfig'));
const DemandesManagement = lazy(() => import('./components/admin/DemandesManagement'));
const AdminRapportsPage = lazy(() => import('./components/admin/AdminRapportsPage'));
const AdminKnowledgeBasePage = lazy(() => import('./components/admin/AdminKnowledgeBasePage'));
const AdminManuelPage = lazy(() => import('./components/admin/AdminManuelPage'));
const AdminDashboardPage = lazy(() => import('./components/admin/AdminDashboardPage'));
const AdminDomainesPage = lazy(() => import('./components/admin/AdminDomainesPage'));
const AdminSupportPage = lazy(() => import('./components/admin/AdminSupportPage'));
const AdminDemandesAccesPage = lazy(() => import('./components/admin/AdminDemandesAccesPage'));
const AdminPartenairesSitePage = lazy(() => import('./components/admin/AdminPartenairesSitePage'));
const BossAdminsPage = lazy(() => import('./components/admin/BossAdminsPage'));
const BossAnnuairePage = lazy(() => import('./components/admin/BossAnnuairePage'));
const ActiveAgentsPage = lazy(() => import('./components/admin/ActiveAgentsPage'));
const MonAbonnementPage = lazy(() => import('./components/client/MonAbonnementPage'));
const HistoriquePaiementPage = lazy(() => import('./components/client/HistoriquePaiementPage'));
const GerantsPage = lazy(() => import('./components/client/GerantsPage'));
const SupportPage = lazy(() => import('./components/client/SupportPage'));
const GuidePage = lazy(() => import('./components/client/GuidePage'));
const AIAssistantPage = lazy(() => import('./components/client/AIAssistantPage'));
const VentesPage = lazy(() => import('./components/client/VentesPage'));
const LaboVentesPage = lazy(() => import('./components/client/LaboVentesPage'));
const AbonnementGerantPage = lazy(() => import('./components/client/AbonnementGerantPage'));
const ConfigurationVentePage = lazy(() => import('./components/client/ConfigurationVentePage'));
const ConfigPrestatairesPage = lazy(() => import('./components/client/ConfigPrestatairesPage'));
const ConfigChargesPage = lazy(() => import('./components/client/ConfigChargesPage'));
const AcheteursPage = lazy(() => import('./components/client/AcheteursPage'));
const AcheteursImportPage = lazy(() => import('./components/client/AcheteursImportPage'));
const TarifsAcheteursPage = lazy(() => import('./components/client/TarifsAcheteursPage'));
const VenteAcheteurPage = lazy(() => import('./components/client/VenteAcheteurPage'));
const CommandesAcheteursPage = lazy(() => import('./components/client/CommandesAcheteursPage'));
const PortailAcheteurPage = lazy(() => import('./components/portail/PortailAcheteurPage'));
const PortailCommandesPage = lazy(() => import('./components/portail/PortailCommandesPage'));
const PrestatairesManagement = lazy(() => import('./components/admin/PrestatairesManagement'));

const PageLoader = () => <div className="page-loading"><div className="spinner" /></div>;

// Portail acheteur : plein écran (pas de Layout client), réservé au rôle acheteur.
function RequireAcheteur({ children }: { children: React.ReactElement }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'acheteur') return <Navigate to="/" replace />;
  return children;
}

// Destination par défaut d'un gérant : pas de tableau de bord — sa première
// section de sidebar est le Référentiel.
const GERANT_HOME = '/client/referentiel/unites';

// Le tableau de bord est réservé au compte client propriétaire.
function DashboardRoute() {
  const { user } = useAuth();
  if (user?.role === 'gerant') return <Navigate to={GERANT_HOME} replace />;
  return <ClientDashboard />;
}

function ClientDefaultRedirect() {
  const { user } = useAuth();
  if (user?.role === 'gerant') return <Navigate to={GERANT_HOME} replace />;
  // Compteurs pas encore connus (session en cache d'avant le login enrichi,
  // /auth/me en cours) : attendre plutôt que de supposer 0 et rediriger à tort.
  if (user?.role === 'client' && user.activitesCount === undefined && user.labosCount === undefined) {
    return <PageLoader />;
  }
  // Compte dépôt (labo sans activité) : le dashboard reste la maison
  if ((user?.activitesCount ?? 0) === 0 && (user?.labosCount ?? 0) === 0) return <Navigate to="/client/activites" replace />;
  return <Navigate to="/client/dashboard" replace />;
}

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'super_admin' || user.role === 'boss') return <Navigate to="/admin" replace />;
  // Acheteur : son portail dédié
  if (user.role === 'acheteur') return <Navigate to="/portail" replace />;
  // Gérant : pas de tableau de bord — direction le Référentiel
  if (user.role === 'gerant') return <Navigate to={GERANT_HOME} replace />;
  // Onboarding steps
  if ((user.onboardingStep ?? 0) === 1) return <Navigate to="/client/profile" replace />;
  if ((user.onboardingStep ?? 0) === 2) return <Navigate to="/client/activites" replace />;
  // Compteurs pas encore connus (session en cache, /auth/me en cours) :
  // attendre plutôt que de supposer 0 et envoyer vers Mes Activités à tort.
  if (user.activitesCount === undefined && user.labosCount === undefined) {
    return <PageLoader />;
  }
  // Client post-onboarding : sans activité NI labo → mes activités, sinon → tableau de bord
  // (un compte dépôt = labo + acheteurs sans activité atterrit sur le dashboard)
  if ((user.activitesCount ?? 0) === 0 && (user.labosCount ?? 0) === 0) return <Navigate to="/client/activites" replace />;
  return <Navigate to="/client/dashboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
        <ConfirmProvider>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
          <Route path="/" element={<RootRedirect />} />

          {/* Portail acheteur (plein écran, rôle acheteur) */}
          <Route path="/portail" element={<RequireAcheteur><PortailAcheteurPage /></RequireAcheteur>} />
          <Route path="/portail/commandes" element={<RequireAcheteur><PortailCommandesPage /></RequireAcheteur>} />

          {/* Super Admin routes */}
          <Route element={<Layout requireRole="super_admin" />}>
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/clients" element={<ClientsManagement />} />
            <Route path="/admin/rapports" element={<AdminRapportsPage />} />
            <Route path="/admin/domaines" element={<AdminDomainesPage />} />
            <Route path="/admin/abonnements" element={<AbonnementsManagement />} />
            <Route path="/admin/abonnements/paiements"  element={<HistoriquePaiementsAdmin />} />
            <Route path="/admin/abonnements/promotions" element={<HistoriquePromotionsAdmin />} />
            <Route path="/admin/tarifs" element={<TarifsConfig />} />
            <Route path="/admin/demandes" element={<DemandesManagement />} />
            <Route path="/admin/support" element={<AdminSupportPage />} />
            <Route path="/admin/site/demandes" element={<AdminDemandesAccesPage />} />
            <Route path="/admin/site/partenaires" element={<AdminPartenairesSitePage />} />
            <Route path="/admin/boss/admins" element={<BossAdminsPage />} />
            <Route path="/admin/boss/annuaire" element={<BossAnnuairePage />} />
            <Route path="/admin/active-agents" element={<ActiveAgentsPage />} />
            <Route path="/admin/prestataires" element={<PrestatairesManagement />} />
            <Route path="/admin/knowledge-base" element={<AdminKnowledgeBasePage />} />
            <Route path="/admin/manuel" element={<AdminManuelPage />} />
          </Route>

          {/* Client + Gérant routes */}
          <Route element={<Layout requireRole="client" />}>
            <Route path="/client" element={<ClientDefaultRedirect />} />
            <Route path="/client/dashboard" element={<DashboardRoute />} />
            {/* Espace Produit réservé à la formule Activité Premium.
                Catégories Produits et Articles Valorisés restent accessibles en
                formule Basique (configuration des articles valorisés vendus). */}
            <Route element={<FormuleGuard />}>
              <Route path="/client/products" element={<ProductList />} />
              <Route path="/client/products/new" element={<ProductForm />} />
              <Route path="/client/products/:id/edit" element={<ProductForm />} />
            </Route>
            <Route path="/client/products/categories" element={<ProductCategoriesPage />} />
            <Route path="/client/products/valorises" element={<ValorisesPage />} />
            {/* Ancienne page « Catalogue Global » supprimée — les affectations se gèrent
                depuis la fiche de chaque article (Référentiel → Articles). */}
            <Route path="/client/catalogue-global" element={<Navigate to="/client/referentiel/articles" replace />} />
            <Route path="/client/referentiel/unites" element={<ReferentielUnitesPage />} />
            <Route path="/client/referentiel/familles" element={<ReferentielFamillesPage />} />
            <Route path="/client/referentiel/categories" element={<ReferentielCategoriesPage />} />
            <Route path="/client/referentiel/articles" element={<ReferentielArticlesPage />} />
            <Route path="/client/referentiel/import" element={<ReferentielImportPage />} />
            <Route path="/client/profile" element={<Profile />} />
            <Route path="/client/activites" element={<ActivitesPage />} />
            <Route path="/client/stock" element={<StockPage />} />
            <Route path="/client/stock/historique" element={<HistoriqueApproPage />} />
            <Route path="/client/stock/factures" element={<FacturesApproPage />} />
            <Route path="/client/stock/historique-pertes" element={<HistoriquepertesPage />} />
            <Route path="/client/labo/stock" element={<StockLaboPage />} />
            <Route path="/client/labo/transfer" element={<TransferPage />} />
            <Route path="/client/labo/historique-transferts" element={<TransferHistoriquePage />} />
            <Route path="/client/labo/historique-appro" element={<LaboHistoriqueApproPage />} />
            <Route path="/client/labo/factures" element={<LaboFacturesApproPage />} />
            <Route path="/client/labo/historique-pertes" element={<LaboHistoriquepertesPage />} />
            <Route path="/client/labo/inventaire" element={<InventairePage />} />
            <Route path="/client/inventaire" element={<InventairePage />} />
            <Route path="/client/labo/inventaire/historique" element={<HistoriqueInventairePage />} />
            <Route path="/client/inventaire/historique" element={<HistoriqueInventairePage />} />
            <Route path="/client/fournisseurs" element={<FournisseursPage />} />
            <Route path="/client/fournisseurs-labo" element={<FournisseursLaboPage />} />
            <Route path="/client/abonnement" element={<MonAbonnementPage />} />
            <Route path="/client/historique-paiement" element={<HistoriquePaiementPage />} />
            <Route path="/client/gerants" element={<GerantsPage />} />
            {/* Anciennes pages Rapports : intégrées au Tableau de bord (onglets) */}
            <Route path="/client/rapports" element={<Navigate to="/client/dashboard?tab=achats" replace />} />
            <Route path="/client/rapports/labo" element={<Navigate to="/client/dashboard?tab=labo" replace />} />
            <Route path="/client/support" element={<SupportPage />} />
            <Route path="/client/guide" element={<GuidePage />} />
            <Route path="/client/gerant-dashboard" element={<Navigate to="/client/dashboard" replace />} />
            <Route path="/client/gerant-abonnement" element={<AbonnementGerantPage />} />
            <Route path="/client/ai-assistant" element={<AIAssistantPage />} />
            <Route element={<VenteGuard />}>
              <Route path="/client/ventes" element={<VentesPage />} />
              <Route path="/client/ventes/configuration" element={<ConfigurationVentePage />} />
              <Route path="/client/ventes/prestataires" element={<ConfigPrestatairesPage />} />
              <Route path="/client/ventes/charges" element={<ConfigChargesPage />} />
              <Route path="/client/ventes/rapport" element={<Navigate to="/client/dashboard?tab=ventes" replace />} />
              <Route path="/client/labo/ventes" element={<LaboVentesPage />} />
            </Route>
            <Route element={<AcheteursGuard />}>
              <Route path="/client/acheteurs" element={<AcheteursPage />} />
              <Route path="/client/acheteurs/import" element={<AcheteursImportPage />} />
              <Route path="/client/acheteurs/tarifs" element={<TarifsAcheteursPage />} />
              <Route path="/client/acheteurs/vente" element={<VenteAcheteurPage />} />
              <Route path="/client/acheteurs/commandes" element={<CommandesAcheteursPage />} />
            </Route>
          </Route>

          {/* Error pages */}
          <Route path="/error/:code" element={<ErrorPage />} />
          <Route path="*" element={<ErrorPage code={404} />} />
        </Routes>
        </Suspense>
        </ConfirmProvider>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
