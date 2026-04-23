import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite } from '../../types';

type ActiviteForm = { nom: string; adresse: string; telephone: string; email: string };
const emptyForm = (): ActiviteForm => ({ nom: '', adresse: '', telephone: '', email: '' });

interface Props {
  onCreated?: () => void;
  minimal?: boolean;
}

const TUNISIAN_PHONE = /^(\+216[\s-]?)?[2579]\d{7}$/;

export default function ActivitesPage({ onCreated, minimal }: Props) {
  const { t } = useTranslation();
  const { user, advanceOnboarding } = useAuth();

  const [activites, setActivites] = useState<Activite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ActiviteForm>(emptyForm());
  const [memeActivite, setMemeActivite] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [isDuplicate, setIsDuplicate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/entreprise/activites');
      setActivites(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditingId(null);
    setIsDuplicate(false);
    setForm(emptyForm());
    setMemeActivite(null);
    setError('');
    setShowForm(true);
  };

  const openEdit = (act: Activite) => {
    setEditingId(act.id);
    setIsDuplicate(false);
    setForm({ nom: act.nom, adresse: act.adresse || '', telephone: act.telephone || '', email: act.email || '' });
    setMemeActivite(null);
    setError('');
    setShowForm(true);
  };

  const openDuplicate = (act: Activite) => {
    setEditingId(null);
    setIsDuplicate(true);
    // Pre-fill only the name, user must complete the rest
    setForm({ nom: act.nom, adresse: '', telephone: '', email: '' });
    setMemeActivite(null);
    setError('');
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setIsDuplicate(false); setError(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom.trim()) { setError(t('validation.name_required')); return; }
    if (form.telephone && !TUNISIAN_PHONE.test(form.telephone.replace(/\s/g, ''))) {
      setError(t('validation.phone_invalid'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.put(`/api/entreprise/activites/${editingId}`, form);
        setMsg(t('client.entreprise.activity_updated'));
      } else {
        const isFirst = activites.length === 0;
        const payload: Record<string, unknown> = { ...form };
        if (isFirst && memeActivite !== null) payload.memeActivite = memeActivite;
        await api.post('/api/entreprise/activites', payload);
        setMsg(t('client.entreprise.activity_created'));
        if (onCreated) onCreated();
        // Advance onboarding: step 2 (activites) → step 3 (catalogue)
        if (isFirst && user?.onboardingStep === 2) {
          await advanceOnboarding(3);
        }
      }
      setTimeout(() => setMsg(''), 3000);
      closeForm();
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || t('common.error'));
    }
    setSaving(false);
  };

  const deleteActivite = async (id: number) => {
    if (!window.confirm(t('client.entreprise.delete_activity_confirm'))) return;
    try {
      await api.delete(`/api/entreprise/activites/${id}`);
      load();
    } catch { /* ignore */ }
  };

  const isFirst = activites.length === 0 && !editingId && !isDuplicate;

  return (
    <div className={minimal ? '' : 'page-content'}>
      {!minimal && <h1 style={{ marginBottom: 24 }}>{t('nav.activites')}</h1>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          {!loading && `${activites.length} ${t('client.entreprise.activities_section').toLowerCase()}`}
        </span>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>
          + {t('client.entreprise.add_activity')}
        </button>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : activites.length === 0 ? (
        <p className="text-muted">{t('client.entreprise.no_activities')}</p>
      ) : (
        <div className="activites-grid">
          {activites.map((act) => (
            <div key={act.id} className="activite-card">
              <div className="activite-card-header">
                <span className="activite-nom">{act.nom}</span>
                <div className="activite-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(act)}>{t('common.edit')}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openDuplicate(act)} title={t('client.entreprise.duplicate_activity')}>⧉</button>
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => deleteActivite(act.id)}>{t('common.delete')}</button>
                </div>
              </div>
              <div className="activite-details">
                {act.email && <span>✉ {act.email}</span>}
                {act.telephone && <span>☎ {act.telephone}</span>}
                {act.adresse && <span>📍 {act.adresse}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {isDuplicate ? `${t('client.entreprise.duplicate_activity')} — ${t('client.entreprise.add_activity')}`
                  : editingId ? t('client.entreprise.edit_activity')
                  : t('client.entreprise.add_activity')}
              </h2>
              <button className="modal-close" onClick={closeForm}>✕</button>
            </div>
            <form onSubmit={submit} className="modal-body">
              {/* Franchise question only on very first activity */}
              {isFirst && (
                <div className="franchise-question" style={{ marginBottom: 16 }}>
                  <p style={{ fontWeight: 600, marginBottom: 8 }}>{t('client.entreprise.franchise_question')}</p>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <label className={`franchise-option ${memeActivite === true ? 'selected' : ''}`}>
                      <input type="radio" name="franchise" checked={memeActivite === true} onChange={() => setMemeActivite(true)} />
                      {t('client.entreprise.franchise_yes')}
                    </label>
                    <label className={`franchise-option ${memeActivite === false ? 'selected' : ''}`}>
                      <input type="radio" name="franchise" checked={memeActivite === false} onChange={() => setMemeActivite(false)} />
                      {t('client.entreprise.franchise_no')}
                    </label>
                  </div>
                </div>
              )}
              <div className="form-field" style={{ marginBottom: 12 }}>
                <label>{t('client.entreprise.activity_nom')} *</label>
                <input type="text" value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} required />
              </div>
              <div className="form-field" style={{ marginBottom: 12 }}>
                <label>{t('client.entreprise.activity_email')}</label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-field" style={{ marginBottom: 12 }}>
                <label>{t('client.entreprise.activity_telephone')}</label>
                <input type="text" value={form.telephone} onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))} />
              </div>
              <div className="form-field" style={{ marginBottom: 12 }}>
                <label>{t('client.entreprise.activity_adresse')}</label>
                <textarea value={form.adresse} onChange={(e) => setForm((f) => ({ ...f, adresse: e.target.value }))} rows={2} />
              </div>
              {error && <p className="form-error">{error}</p>}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>{t('common.cancel')}</button>
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
