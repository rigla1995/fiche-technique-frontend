import { useState } from 'react';
import { Outlet, Navigate, useLocation, Link } from 'react-router-dom';
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
  const location = useLocation();
  const showGuideBtn = !location.pathname.startsWith('/client/guide');

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
      <Header onMenuToggle={() => setSidebarOpen((v) => !v)} />
      <ReadOnlyBanner />
      <div className="layout-body">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
      {showGuideBtn && (
        <Link
          to="/client/guide"
          title="Manuel d'utilisation"
          style={{
            position: 'fixed',
            bottom: 20,
            left: 20,
            zIndex: 1050,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'linear-gradient(135deg,#1e40af,#2563eb)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
            textDecoration: 'none',
            fontSize: '1.1rem',
            fontWeight: 800,
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,99,235,0.5)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(37,99,235,0.4)'; }}
        >
          ?
        </Link>
      )}
    </div>
    </SelectionProvider>
  );
}
