import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Client } from '../../types';

interface ClientForm {
  name: string;
  email: string;
  phone: string;
}

const emptyForm: ClientForm = { name: '', email: '', phone: '' };

export default function ClientsManagement() {
  const { t } = useTranslation();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const fetchClients = () => {
    setLoading(true);
    api.get('/admin/clients').then(({ data }) => setClients(data)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchClients(); }, []);

  const openAdd = () => { setForm(emptyForm); setEditId(null); setShowModal(true); };
  const openEdit = (c: Client) => { setForm({ name: c.name, email: c.email, phone: c.phone || '' }); setEditId(c.id); setShowModal(true); };
  const closeModal = () => setShowModal(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/admin/clients/${editId}`, form);
      } else {
        const { data } = await api.post('/admin/clients', form);
        if (data?.temporaryPassword) {
          setTempPassword(data.temporaryPassword);
        }
      }
      closeModal();
      fetchClients();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('admin.clients.delete_confirm'))) return;
    await api.delete(`/admin/clients/${id}`);
    fetchClients();
  };

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('admin.clients.title')}</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ {t('admin.clients.add')}</button>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder={t('common.search') + '...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
        />
      </div>

      {loading ? (
        <div className="loading-text">{t('common.loading')}</div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.email')}</th>
                <th>{t('common.phone')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.phone || '—'}</td>
                  <td className="actions-cell">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>{t('common.edit')}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>{t('common.delete')}</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="empty-cell">Aucun résultat</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tempPassword && (
        <div className="modal-overlay" onClick={() => setTempPassword(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('admin.clients.temp_password_title')}</h2>
              <button className="modal-close" onClick={() => setTempPassword(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>{t('admin.clients.temp_password_message')}</p>
              <div style={{ background: '#f5f5f5', borderRadius: '6px', padding: '12px 16px', margin: '12px 0', fontFamily: 'monospace', fontSize: '1.2rem', letterSpacing: '0.05em', textAlign: 'center', userSelect: 'all' }}>
                {tempPassword}
              </div>
              <p style={{ fontSize: '0.875rem', color: '#666' }}>{t('admin.clients.temp_password_note')}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setTempPassword(null)}>{t('common.yes')}</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId ? t('admin.clients.edit') : t('admin.clients.add')}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label>{t('common.name')}</label>
                <input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('common.email')}</label>
                <input className="input" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>{t('common.phone')}</label>
                <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
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
