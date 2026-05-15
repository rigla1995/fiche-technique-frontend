import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { DomaineActivite } from '../../types';
import Pagination from '../common/Pagination';

const PER_PAGE = 10;

export default function DomainesManagement() {
  const { t } = useTranslation();
  const [domaines, setDomaines] = useState<DomaineActivite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [nom, setNom] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const fetchDomaines = () => {
    setLoading(true);
    api.get('/api/domaines').then(({ data }) => setDomaines(data)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchDomaines(); }, []);

  const openAdd = () => { setNom(''); setEditId(null); setError(''); setShowModal(true); };
  const openEdit = (d: DomaineActivite) => { setNom(d.nom); setEditId(d.id); setError(''); setShowModal(true); };
  const closeModal = () => setShowModal(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim()) { setError(t('validation.name_required')); return; }
    setSaving(true);
    setError('');
    try {
      if (editId) {
        await api.put(`/api/domaines/${editId}`, { nom });
      } else {
        await api.post('/api/domaines', { nom });
      }
      closeModal();
      fetchDomaines();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('admin.domaines.delete_confirm'))) return;
    await api.delete(`/api/domaines/${id}`);
    fetchDomaines();
  };

  const filtered = domaines.filter((d) => d.nom.toLowerCase().includes(search.toLowerCase()));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #18181b 0%, #27272a 55%, #52525b 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(39,39,42,0.28)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🗂️</div>
        <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>{t('admin.domaines.title')}</h1>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={openAdd}>+ {t('admin.domaines.add')}</button>
      </div>

      {/* Filter bar */}
      <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recherche</span>
          <input
            type="text"
            placeholder="Filtrer par nom…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input"
          />
        </div>
        {search && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')} style={{ marginBottom: 1 }}>
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading-text">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🌐</span>
          <p>{domaines.length === 0 ? 'Aucun domaine défini.' : 'Aucun résultat pour cette recherche.'}</p>
          {domaines.length === 0 && (
            <button className="btn btn-primary" onClick={openAdd}>Créer le premier domaine</button>
          )}
        </div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '60%' }}>{t('common.name')}</th>
                <th style={{ width: '40%', textAlign: 'right' }}>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{d.nom}</span>
                    </div>
                  </td>
                  <td className="actions-cell" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)}>✏️ {t('common.edit')}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d.id)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination total={filtered.length} page={page} perPage={PER_PAGE} onChange={setPage} />
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>{editId ? t('admin.domaines.edit') : t('admin.domaines.add')}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              {error && (
                <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>
                  {error}
                </div>
              )}
              <div className="form-group">
                <label>{t('admin.domaines.name')} *</label>
                <input
                  className="input"
                  autoFocus
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder={t('admin.domaines.examples')}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !nom.trim()}>
                  {saving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
