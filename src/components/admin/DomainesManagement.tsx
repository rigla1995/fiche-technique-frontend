import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { DomaineActivite } from '../../types';

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

  const fetch = () => {
    setLoading(true);
    api.get('/api/domaines').then(({ data }) => setDomaines(data)).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

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
      fetch();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || t('common.error');
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('admin.domaines.delete_confirm'))) return;
    await api.delete(`/api/domaines/${id}`);
    fetch();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('admin.domaines.title')}</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ {t('admin.domaines.add')}</button>
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
        <input
          type="text"
          placeholder={t('common.search') + '…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
          style={{ maxWidth: 320 }}
        />
      </div>

      {loading ? (
        <div className="loading-text">{t('common.loading')}</div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead style={{ background: '#fff7ed' }}>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {domaines.filter((d) => d.nom.toLowerCase().includes(search.toLowerCase())).map((d) => (
                <tr key={d.id}>
                  <td>{d.nom}</td>
                  <td className="actions-cell">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)}>{t('common.edit')}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d.id)}>{t('common.delete')}</button>
                  </td>
                </tr>
              ))}
              {domaines.length === 0 && (
                <tr><td colSpan={2} className="empty-cell">{t('common.no_result')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>{editId ? t('admin.domaines.edit') : t('admin.domaines.add')}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              {error && (
                <div style={{ background: '#fff0f0', color: '#c00', border: '1px solid #fbb', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
                  {error}
                </div>
              )}
              <div className="form-group">
                <label>{t('admin.domaines.name')}</label>
                <input
                  className="input"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder={t('admin.domaines.examples')}
                  autoFocus
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
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
