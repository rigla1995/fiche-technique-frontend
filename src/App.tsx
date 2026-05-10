import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/common/Layout';
import LoginPage from './components/auth/LoginPage';
import InvitePage from './components/auth/InvitePage';
import ClientsManagement from './components/admin/ClientsManagement';
import UnitsManagement from './components/admin/UnitsManagement';
import IngredientsManagement from './components/admin/IngredientsManagement';
import CategoriesManagement from './components/admin/CategoriesManagement';
import DomainesManagement from './components/admin/DomainesManagement';
import ClientDashboard from './components/client/ClientDashboard';
import ProductList from './components/client/ProductList';
import ProductForm from './components/client/ProductForm';
import ClientIngredientsCatalog from './components/client/ClientIngredientsCatalog';
import FranchiseCatalogPage from './components/client/FranchiseCatalogPage';
import DistinctCatalogPage from './components/client/DistinctCatalogPage';
import Profile from './components/client/Profile';
import ActivitesPage from './components/client/ActivitesPage';
import StockPage from './components/client/StockPage';
import HistoriqueApproPage from './components/client/HistoriqueApproPage';
import HistoriquepertesPage from './components/client/HistoriquepertesPage';
import StockLaboPage from './components/client/StockLaboPage';
import TransferPage from './components/client/TransferPage';
import TransferHistoriquePage from './components/client/TransferHistoriquePage';
import GlobalCataloguePage from './components/client/GlobalCataloguePage';
import FournisseursPage from './components/client/FournisseursPage';
import FournisseursLaboPage from './components/client/FournisseursLaboPage';
import LaboHistoriqueApproPage from './components/client/LaboHistoriqueApproPage';
import InventairePage from './components/client/InventairePage';
import HistoriqueInventairePage from './components/client/HistoriqueInventairePage';
import ErrorPage from './components/common/ErrorPage';
import AbonnementsManagement from './components/admin/AbonnementsManagement';
import HistoriquePaiementsAdmin from './components/admin/HistoriquePaiementsAdmin';
import HistoriquePromotionsAdmin from './components/admin/HistoriquePromotionsAdmin';
import TarifsConfig from './components/admin/TarifsConfig';
import DemandesManagement from './components/admin/DemandesManagement';
import AdminRapportsPage from './components/admin/AdminRapportsPage';
import AdminSupportPage from './components/admin/AdminSupportPage';
import MonAbonnementPage from './components/client/MonAbonnementPage';
import GerantsPage from './components/client/GerantsPage';
import SupportPage from './components/client/SupportPage';
import UpgradeWizard from './components/client/UpgradeWizard';
import RapportsPage from './components/client/RapportsPage';
import './i18n';
import './index.css';

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="page-loading"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'super_admin') return <Navigate to="/admin" replace />;
  if (user.role === 'gerant') return <Navigate to="/client" replace />;
  // Entreprise user with pending onboarding → send to profile to change password
  if (user.compteType === 'entreprise' && (user.onboardingStep ?? 0) === 50) {
    return <Navigate to="/client/upgrade-wizard" replace />;
  }
  if (user.compteType === 'entreprise' && (user.onboardingStep ?? 0) === 1) {
    return <Navigate to="/client/profile" replace />;
  }
  if (user.compteType === 'entreprise' && (user.onboardingStep ?? 0) === 2) {
    return <Navigate to="/client/activites" replace />;
  }
  return <Navigate to="/client" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/" element={<RootRedirect />} />

          {/* Super Admin routes */}
          <Route element={<Layout requireRole="super_admin" />}>
            <Route path="/admin" element={<Navigate to="/admin/rapports" replace />} />
            <Route path="/admin/clients" element={<ClientsManagement />} />
            <Route path="/admin/units" element={<UnitsManagement />} />
            <Route path="/admin/ingredients" element={<IngredientsManagement />} />
            <Route path="/admin/categories" element={<CategoriesManagement />} />
            <Route path="/admin/domaines" element={<DomainesManagement />} />
            <Route path="/admin/rapports" element={<AdminRapportsPage />} />
            <Route path="/admin/abonnements" element={<AbonnementsManagement />} />
            <Route path="/admin/abonnements/paiements"  element={<HistoriquePaiementsAdmin />} />
            <Route path="/admin/abonnements/promotions" element={<HistoriquePromotionsAdmin />} />
            <Route path="/admin/tarifs" element={<TarifsConfig />} />
            <Route path="/admin/demandes" element={<DemandesManagement />} />
            <Route path="/admin/support" element={<AdminSupportPage />} />
          </Route>

          {/* Client + Gérant routes */}
          <Route element={<Layout requireRole="client" />}>
            <Route path="/client" element={<ClientDashboard />} />
            <Route path="/client/products" element={<ProductList />} />
            <Route path="/client/products/new" element={<ProductForm />} />
            <Route path="/client/products/:id/edit" element={<ProductForm />} />
            <Route path="/client/catalogue-global" element={<GlobalCataloguePage />} />
            <Route path="/client/ingredients" element={<ClientIngredientsCatalog />} />
            <Route path="/client/catalogue-franchise" element={<FranchiseCatalogPage />} />
            <Route path="/client/catalogue-distinct" element={<DistinctCatalogPage />} />
            <Route path="/client/profile" element={<Profile />} />
            <Route path="/client/activites" element={<ActivitesPage />} />
            <Route path="/client/stock" element={<StockPage />} />
            <Route path="/client/stock/historique" element={<HistoriqueApproPage />} />
            <Route path="/client/stock/historique-pertes" element={<HistoriquepertesPage />} />
            <Route path="/client/labo/stock" element={<StockLaboPage />} />
            <Route path="/client/labo/transfer" element={<TransferPage />} />
            <Route path="/client/labo/historique-transferts" element={<TransferHistoriquePage />} />
            <Route path="/client/labo/historique-appro" element={<LaboHistoriqueApproPage />} />
            <Route path="/client/labo/inventaire" element={<InventairePage />} />
            <Route path="/client/inventaire" element={<InventairePage />} />
            <Route path="/client/labo/inventaire/historique" element={<HistoriqueInventairePage />} />
            <Route path="/client/inventaire/historique" element={<HistoriqueInventairePage />} />
            <Route path="/client/fournisseurs" element={<FournisseursPage />} />
            <Route path="/client/fournisseurs-labo" element={<FournisseursLaboPage />} />
            <Route path="/client/abonnement" element={<MonAbonnementPage />} />
            <Route path="/client/gerants" element={<GerantsPage />} />
            <Route path="/client/upgrade-wizard" element={<UpgradeWizard />} />
            <Route path="/client/rapports" element={<RapportsPage />} />
            <Route path="/client/support" element={<SupportPage />} />
          </Route>

          {/* Error pages */}
          <Route path="/error/:code" element={<ErrorPage />} />
          <Route path="*" element={<ErrorPage code={404} />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
