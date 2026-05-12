import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Category } from '../../types';
import Pagination from '../common/Pagination';

const PER_PAGE = 10;

export default function CategoriesManagement() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const fetchCategories = () => {
    setLoading(true);
    api.get('/categories').then(({ data }) => setCategories(data)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchCategories(); }, []);

  const openAdd = () => { setName(''); setEditId(null); setError(''); setShowModal(true); };
  const openEdit = (c: Category) => { setName(c.name); setEditId(c.id); setError(''); setShowModal(true); };
  const closeModal = () => setShowModal(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Le nom est obligatoire.'); return; }
    setSaving(true);
    setError('');
    try {
      if (editId) {
        await api.put(`/categories/${editId}`, { name });
      } else {
        await api.post('/categories', { name });
      }
      closeModal();
      fetchCategories();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('admin.categories.delete_confirm'))) return;
    await api.delete(`/categories/${id}`);
    fetchCategories();
  };

  const filtered = categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('admin.categories.title')}</h1>
          <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {categories.length} catégorie{categories.length !== 1 ? 's' : ''} dans le référentiel
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ {t('admin.categories.add')}</button>
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
          <span className="empty-icon">🏷️</span>
          <p>{categories.length === 0 ? 'Aucune catégorie définie.' : 'Aucun résultat pour cette recherche.'}</p>
          {categories.length === 0 && (
            <button className="btn btn-primary" onClick={openAdd}>Créer la première catégorie</button>
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
              {paginated.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{c.name}</span>
                    </div>
                  </td>
                  <td className="actions-cell" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✏️ {t('common.edit')}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>🗑️</button>
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
              <h2>{editId ? t('admin.categories.edit') : t('admin.categories.add')}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              {error && (
                <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>
                  {error}
                </div>
              )}
              <div className="form-group">
                <label>{t('admin.categories.name')} *</label>
                <input
                  className="input"
                  autoFocus
                  value={name}
                  placeholder={t('admin.categories.examples')}
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
