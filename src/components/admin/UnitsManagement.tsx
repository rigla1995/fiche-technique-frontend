import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Unit } from '../../types';

export default function UnitsManagement() {
  const { t } = useTranslation();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchUnits = () => {
    setLoading(true);
    api.get('/units').then(({ data }) => setUnits(data)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchUnits(); }, []);

  const openAdd = () => { setName(''); setEditId(null); setShowModal(true); };
  const openEdit = (u: Unit) => { setName(u.name); setEditId(u.id); setShowModal(true); };
  const closeModal = () => setShowModal(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/units/${editId}`, { name });
      } else {
        await api.post('/units', { name });
      }
      closeModal();
      fetchUnits();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('admin.units.delete_confirm'))) return;
    await api.delete(`/units/${id}`);
    fetchUnits();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('admin.units.title')}</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ {t('admin.units.add')}</button>
      </div>

      {loading ? (
        <div className="loading-text">{t('common.loading')}</div>
      ) : (
        <div className="card">
          <div className="chips-grid">
            {units.map((u) => (
              <div key={u.id} className="chip">
                <span className="chip-label">{u.name}</span>
                <button className="chip-action" onClick={() => openEdit(u)}>✏️</button>
                <button className="chip-action chip-delete" onClick={() => handleDelete(u.id)}>🗑️</button>
              </div>
            ))}
            {units.length === 0 && <p className="empty-text">Aucune unité définie.</p>}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId ? t('admin.units.edit') : t('admin.units.add')}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label>{t('admin.units.name')}</label>
                <input
                  className="input"
                  required
                  value={name}
                  placeholder={t('admin.units.examples')}
                  onChange={(e) => setName(e.target.value)}
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
