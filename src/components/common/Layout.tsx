import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import ReadOnlyBanner from './ReadOnlyBanner';
import { useAuth } from '../../context/AuthContext';
import { SelectionProvider } from '../../context/SelectionContext';

interface LayoutProps {
  requireRole?: 'super_admin' | 'client' | 'gerant';
}

export default function Layout({ requireRole }: LayoutProps) {
  const { user, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return <div className="page-loading"><div className="spinner" /></div>;
  }

  if (!user) return <Navigate to="/login" replace />;
  if (requireRole && user.role !== requireRole && !(requireRole === 'client' && user.role === 'gerant')) {
    return <Navigate to={user.role === 'super_admin' ? '/admin' : '/client'} replace />;
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
