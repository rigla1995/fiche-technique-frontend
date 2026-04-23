import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/common/Layout';
import LoginPage from './components/auth/LoginPage';
import AdminDashboard from './components/admin/AdminDashboard';
import ClientsManagement from './components/admin/ClientsManagement';
import UnitsManagement from './components/admin/UnitsManagement';
import IngredientsManagement from './components/admin/IngredientsManagement';
import CategoriesManagement from './components/admin/CategoriesManagement';
import ClientDashboard from './components/client/ClientDashboard';
import ProductList from './components/client/ProductList';
import ProductForm from './components/client/ProductForm';
import ClientIngredientsCatalog from './components/client/ClientIngredientsCatalog';
import Profile from './components/client/Profile';
import EntrepriseProfile from './components/client/EntrepriseProfile';
import StockPage from './components/client/StockPage';
import './i18n';
import './index.css';

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="page-loading"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'super_admin' ? '/admin' : '/client'} replace />;
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
          </Route>

          {/* Client routes */}
          <Route element={<Layout requireRole="client" />}>
            <Route path="/client" element={<ClientDashboard />} />
            <Route path="/client/products" element={<ProductList />} />
            <Route path="/client/products/new" element={<ProductForm />} />
            <Route path="/client/products/:id/edit" element={<ProductForm />} />
            <Route path="/client/ingredients" element={<ClientIngredientsCatalog />} />
            <Route path="/client/profile" element={<Profile />} />
            <Route path="/client/entreprise" element={<EntrepriseProfile />} />
            <Route path="/client/stock" element={<StockPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
