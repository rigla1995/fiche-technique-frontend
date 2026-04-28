import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/common/Layout';
import LoginPage from './components/auth/LoginPage';
import AdminDashboard from './components/admin/AdminDashboard';
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
import StockLaboPage from './components/client/StockLaboPage';
import TransferPage from './components/client/TransferPage';
import TransferHistoriquePage from './components/client/TransferHistoriquePage';
import GlobalCataloguePage from './components/client/GlobalCataloguePage';
import './i18n';
import './index.css';

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="page-loading"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'super_admin') return <Navigate to="/admin" replace />;
  // Entreprise user with pending onboarding → send to profile to change password
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
          <Route path="/" element={<RootRedirect />} />

          {/* Super Admin routes */}
          <Route element={<Layout requireRole="super_admin" />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/clients" element={<ClientsManagement />} />
            <Route path="/admin/units" element={<UnitsManagement />} />
            <Route path="/admin/ingredients" element={<IngredientsManagement />} />
            <Route path="/admin/categories" element={<CategoriesManagement />} />
            <Route path="/admin/domaines" element={<DomainesManagement />} />
          </Route>

          {/* Client routes */}
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
            <Route path="/client/labo/stock" element={<StockLaboPage />} />
            <Route path="/client/labo/transfer" element={<TransferPage />} />
            <Route path="/client/labo/historique-transferts" element={<TransferHistoriquePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
