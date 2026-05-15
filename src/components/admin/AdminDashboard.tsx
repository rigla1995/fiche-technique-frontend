import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Client } from '../../types';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/clients').then(({ data }) => setClients(data)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #18181b 0%, #27272a 55%, #52525b 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(39,39,42,0.28)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>⚙️</div>
        <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>{t('admin.title')}</h1>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{clients.length}</div>
          <div className="stat-label">{t('nav.clients')}</div>
          <Link to="/admin/clients" className="stat-link">{t('common.edit')} →</Link>
        </div>
      </div>
      {loading ? (
        <div className="loading-text">{t('common.loading')}</div>
      ) : (
        <div className="card">
          <div className="card-header">
            <h2>{t('admin.clients.title')}</h2>
            <Link to="/admin/clients" className="btn btn-primary btn-sm">{t('admin.clients.add')}</Link>
          </div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('common.email')}</th>
                  <th>{t('common.phone')}</th>
                </tr>
              </thead>
              <tbody>
                {clients.slice(0, 5).map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.email}</td>
                    <td>{c.phone || '—'}</td>
                  </tr>
                ))}
                {clients.length === 0 && (
                  <tr><td colSpan={3} className="empty-cell">Aucun client</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
