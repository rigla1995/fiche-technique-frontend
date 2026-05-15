import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Unit } from '../../types';
import Pagination from '../common/Pagination';

const PER_PAGE = 10;

export default function UnitsManagement() {
  const { t } = useTranslation();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const fetchUnits = () => {
    setLoading(true);
    api.get('/units').then(({ data }) => setUnits(data)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchUnits(); }, []);

  const openAdd = () => { setName(''); setEditId(null); setError(''); setShowModal(true); };
  const openEdit = (u: Unit) => { setName(u.name); setEditId(u.id); setError(''); setShowModal(true); };
  const closeModal = () => setShowModal(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Le nom est obligatoire.'); return; }
    setSaving(true);
    setError('');
    try {
      if (editId) {
        await api.put(`/units/${editId}`, { name });
      } else {
        await api.post('/units', { name });
      }
      closeModal();
      fetchUnits();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('admin.units.delete_confirm'))) return;
    await api.delete(`/units/${id}`);
    fetchUnits();
  };

  const filtered = units.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #18181b 0%, #27272a 55%, #52525b 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(39,39,42,0.28)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📏</div>
        <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>{t('admin.units.title')}</h1>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={openAdd}>+ {t('admin.units.add')}</button>
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
          <span className="empty-icon">⚖️</span>
          <p>{units.length === 0 ? 'Aucune unité définie.' : 'Aucun résultat pour cette recherche.'}</p>
          {units.length === 0 && (
            <button className="btn btn-primary" onClick={openAdd}>Créer la première unité</button>
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
              {paginated.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{u.name}</span>
                    </div>
                  </td>
                  <td className="actions-cell" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>✏️ {t('common.edit')}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id)}>🗑️</button>
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
              <h2>{editId ? t('admin.units.edit') : t('admin.units.add')}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              {error && (
                <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>
                  {error}
                </div>
              )}
              <div className="form-group">
                <label>{t('admin.units.name')} *</label>
                <input
                  className="input"
                  autoFocus
                  value={name}
                  placeholder={t('admin.units.examples')}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
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
