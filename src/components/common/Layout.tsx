import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import ReadOnlyBanner from './ReadOnlyBanner';
import { useAuth } from '../../context/AuthContext';
import { SelectionProvider } from '../../context/SelectionContext';

interface LayoutProps {
  requireRole?: 'super_admin' | 'client' | 'gerant' | 'acheteur';
}

// Espace « maison » de chaque rôle (cible de redirection quand l'accès est refusé).
const homeOf = (role: string) =>
  role === 'super_admin' || role === 'boss' ? '/admin' : role === 'acheteur' ? '/portail' : '/client';

export default function Layout({ requireRole }: LayoutProps) {
  const { user, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return <div className="page-loading"><div className="spinner" /></div>;
  }

  if (!user) return <Navigate to="/login" replace />;
  // Le Boss hérite de l'accès super_admin ; un gérant partage l'espace client.
  const roleOk = requireRole
    ? user.role === requireRole
      || (requireRole === 'client' && user.role === 'gerant')
      || (requireRole === 'super_admin' && user.role === 'boss')
    : true;
  if (!roleOk) {
    return <Navigate to={homeOf(user.role)} replace />;
  }

  return (
    <SelectionProvider>
    <div className="app-layout">
      <Header />
      <ReadOnlyBanner />
      <div className="layout-body">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
    </SelectionProvider>
  );
}
