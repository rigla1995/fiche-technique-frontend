import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Client } from '../../types';

interface ClientForm {
  name: string;
  email: string;
  phone: string;
  password: string;
}

const emptyForm: ClientForm = { name: '', email: '', phone: '', password: '' };

const TUNISIAN_PHONE = /^(\+216[\s-]?)?[2579]\d{7}$/;
const PASSWORD_RULES = [
  { test: (v: string) => v.length >= 8, label: '8 caractères minimum' },
  { test: (v: string) => /[A-Z]/.test(v), label: 'Majuscule requise' },
  { test: (v: string) => /[a-z]/.test(v), label: 'Minuscule requise' },
  { test: (v: string) => /[0-9]/.test(v), label: 'Chiffre requis' },
  { test: (v: string) => /[@$!%*?&_\-#]/.test(v), label: 'Caractère spécial requis (@$!%*?&)' },
];

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
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const fetchClients = () => {
    setLoading(true);
    api.get('/admin/clients').then(({ data }) => setClients(data)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchClients(); }, []);

  const openAdd = () => { setForm(emptyForm); setEditId(null); setFormErrors({}); setShowModal(true); };
  const openEdit = (c: Client) => {
    setForm({ name: c.name, email: c.email, phone: c.phone || '', password: '' });
    setEditId(c.id);
    setFormErrors({});
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setFormErrors({}); };

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Nom requis';
    if (!form.email.trim()) errs.email = 'Email requis';
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Format email invalide';
    if (form.phone && !TUNISIAN_PHONE.test(form.phone.replace(/\s/g, ''))) {
      errs.phone = 'Numéro tunisien invalide (ex: +216 XX XXX XXX)';
    }
    if (form.password) {
      for (const rule of PASSWORD_RULES) {
        if (!rule.test(form.password)) { errs.password = rule.label; break; }
      }
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const payload: Record<string, string> = { name: form.name, email: form.email, phone: form.phone };
      if (form.password) payload.password = form.password;

      if (editId) {
        await api.put(`/admin/clients/${editId}`, payload);
      } else {
        const { data } = await api.post('/admin/clients', payload);
        if (data?.temporaryPassword) {
          setTempPassword(data.temporaryPassword);
        }
      }
      closeModal();
      fetchClients();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.errors?.[0]?.msg || 'Erreur';
      setFormErrors({ global: msg });
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
              {formErrors.global && (
                <div style={{ background: '#fff0f0', color: '#c00', border: '1px solid #fbb', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
                  {formErrors.global}
                </div>
              )}
              <div className="form-group">
                <label>{t('common.name')} *</label>
                <input
                  className={`input${formErrors.name ? ' input-error' : ''}`}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                {formErrors.name && <span className="field-error">{formErrors.name}</span>}
              </div>
              <div className="form-group">
                <label>{t('common.email')} *</label>
                <input
                  className={`input${formErrors.email ? ' input-error' : ''}`}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
                {formErrors.email && <span className="field-error">{formErrors.email}</span>}
              </div>
              <div className="form-group">
                <label>{t('common.phone')} <span style={{ fontSize: '0.8em', color: '#888' }}>(ex: +216 XX XXX XXX)</span></label>
                <input
                  className={`input${formErrors.phone ? ' input-error' : ''}`}
                  value={form.phone}
                  placeholder="+216 XX XXX XXX"
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
                {formErrors.phone && <span className="field-error">{formErrors.phone}</span>}
              </div>
              <div className="form-group">
                <label>Mot de passe {editId ? '(laisser vide pour ne pas modifier)' : ''}</label>
                <input
                  className={`input${formErrors.password ? ' input-error' : ''}`}
                  type="password"
                  value={form.password}
                  placeholder={editId ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe (optionnel — généré si vide)'}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
                {form.password && (
                  <ul style={{ margin: '4px 0 0 4px', padding: 0, listStyle: 'none', fontSize: '0.78rem' }}>
                    {PASSWORD_RULES.map((r) => (
                      <li key={r.label} style={{ color: r.test(form.password) ? '#1a7a40' : '#c00' }}>
                        {r.test(form.password) ? '✓' : '✗'} {r.label}
                      </li>
                    ))}
                  </ul>
                )}
                {formErrors.password && <span className="field-error">{formErrors.password}</span>}
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
