import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Entreprise, Activite } from '../../types';
import { useEmailCheck } from '../../hooks/useEmailCheck';

type ActiviteForm = { nom: string; adresse: string; telephone: string; email: string };
const emptyForm = (): ActiviteForm => ({ nom: '', adresse: '', telephone: '', email: '' });

export default function EntrepriseProfile() {
  const { t } = useTranslation();

  // Company profile state
  const [profile, setProfile] = useState<Entreprise | null>(null);
  const [profileForm, setProfileForm] = useState({ nom: '', email: '', telephone: '', adresse: '' });
  const { emailExists: profileEmailExists, emailChecking: profileEmailChecking } = useEmailCheck(profileForm.email, profile?.id);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Activities state
  const [activites, setActivites] = useState<Activite[]>([]);
  const [activitesLoading, setActivitesLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ActiviteForm>(emptyForm());
  const [memeActivite, setMemeActivite] = useState<boolean | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [actMsg, setActMsg] = useState('');

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const { data } = await api.get('/api/entreprise');
      setProfile(data);
      if (data) setProfileForm({ nom: data.nom || '', email: data.email || '', telephone: data.telephone || '', adresse: data.adresse || '' });
    } catch { /* ignore */ }
    setProfileLoading(false);
  }, []);

  const loadActivites = useCallback(async () => {
    setActivitesLoading(true);
    try {
      const { data } = await api.get('/api/entreprise/activites');
      setActivites(data);
    } catch { /* ignore */ }
    setActivitesLoading(false);
  }, []);

  useEffect(() => { loadProfile(); loadActivites(); }, [loadProfile, loadActivites]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg('');
    try {
      const { data } = await api.put('/api/entreprise', profileForm);
      setProfile(data);
      setProfileMsg(t('client.entreprise.profile_saved'));
      setTimeout(() => setProfileMsg(''), 3000);
    } catch { setProfileMsg(t('common.error')); }
    setProfileSaving(false);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setMemeActivite(null);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (act: Activite) => {
    setEditingId(act.id);
    setForm({ nom: act.nom, adresse: act.adresse || '', telephone: act.telephone || '', email: act.email || '' });
    setMemeActivite(null);
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setFormError(''); };

  const handleDuplicateLast = () => {
    const last = activites[activites.length - 1];
    if (last) setForm({ nom: last.nom, adresse: last.adresse || '', telephone: last.telephone || '', email: last.email || '' });
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom.trim()) { setFormError(t('validation.name_required')); return; }
    setFormSaving(true);
    setFormError('');
    try {
      if (editingId) {
        await api.put(`/api/entreprise/activites/${editingId}`, form);
      } else {
        const payload: Record<string, unknown> = { ...form };
        if (activites.length === 0 && memeActivite !== null) payload.memeActivite = memeActivite;
        await api.post('/api/entreprise/activites', payload);
      }
      setActMsg(editingId ? t('client.entreprise.activity_updated') : t('client.entreprise.activity_created'));
      setTimeout(() => setActMsg(''), 3000);
      closeForm();
      loadActivites();
      loadProfile();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setFormError(msg || t('common.error'));
    }
    setFormSaving(false);
  };

  const deleteActivite = async (id: number) => {
    if (!window.confirm(t('client.entreprise.delete_activity_confirm'))) return;
    try {
      await api.delete(`/api/entreprise/activites/${id}`);
      setActMsg(t('client.entreprise.activity_deleted'));
      setTimeout(() => setActMsg(''), 3000);
      loadActivites();
    } catch { /* ignore */ }
  };

  const duplicateActivite = async (id: number) => {
    try {
      await api.post(`/api/entreprise/activites/${id}/duplicate`);
      loadActivites();
    } catch { /* ignore */ }
  };

  const isFirst = activites.length === 0 && !editingId;
  const isFranchise = profile?.memeActivite === true;

  return (
    <div className="page-content">
      <div style={{
        background: 'linear-gradient(135deg, #164e63 0%, #0e7490 55%, #06b6d4 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(14,116,144,0.28)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏢</div>
        <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>{t('client.entreprise.title')}</h1>
      </div>

      {/* Company Profile */}
      <section className="card" style={{ marginTop: 24, marginBottom: 24 }}>
        <h2 style={{ marginBottom: 16 }}>{t('client.entreprise.profile_section')}</h2>
        {profileLoading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : (
          <form onSubmit={saveProfile} className="form-grid">
            <div className="form-field">
              <label>{t('client.entreprise.nom')} *</label>
              <input
                type="text"
                value={profileForm.nom}
                onChange={(e) => setProfileForm((p) => ({ ...p, nom: e.target.value }))}
                required
              />
            </div>
            <div className="form-field">
              <label>{t('client.entreprise.email')} *</label>
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                required
                style={profileEmailExists ? { borderColor: '#fca5a5', background: '#fff5f5' } : undefined}
              />
              {profileEmailChecking && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Vérification…</div>}
              {!profileEmailChecking && profileEmailExists && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>Cet email est déjà utilisé.</div>}
            </div>
            <div className="form-field">
              <label>{t('client.entreprise.telephone')}</label>
              <input
                type="text"
                value={profileForm.telephone}
                onChange={(e) => setProfileForm((p) => ({ ...p, telephone: e.target.value }))}
              />
            </div>
            <div className="form-field form-field-full">
              <label>{t('client.entreprise.adresse')}</label>
              <textarea
                value={profileForm.adresse}
                onChange={(e) => setProfileForm((p) => ({ ...p, adresse: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="form-field form-field-full" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={profileSaving}>
                {profileSaving ? t('common.loading') : t('client.entreprise.save_profile')}
              </button>
              {profileMsg && <span className="text-success">{profileMsg}</span>}
            </div>
          </form>
        )}
      </section>

      {/* Activities */}
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2>{t('client.entreprise.activities_section')} {!activitesLoading && `(${activites.length})`}</h2>
          {profile && (
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              + {t('client.entreprise.add_activity')}
            </button>
          )}
        </div>
        {!profile && (
          <p className="text-muted">{t('client.entreprise.profile_section')} — {t('validation.name_required').toLowerCase()}</p>
        )}
        {actMsg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{actMsg}</div>}
        {activitesLoading ? (
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
                    <button className="btn btn-ghost btn-sm" onClick={() => duplicateActivite(act.id)} title={t('client.entreprise.duplicate_activity')}>⧉</button>
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
      </section>

      {/* Activity Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>{editingId ? t('client.entreprise.edit_activity') : t('client.entreprise.add_activity')}</h2>
              <button className="modal-close" onClick={closeForm}>✕</button>
            </div>
            <form onSubmit={submitForm} className="modal-body">
              {/* Franchise question for first activity */}
              {isFirst && (
                <div className="franchise-question">
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
              {/* Offer to duplicate from last if franchise */}
              {!editingId && !isFirst && isFranchise && (
                <div style={{ marginBottom: 16 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleDuplicateLast}>
                    ⧉ {t('client.entreprise.duplicate_from_last')}
                  </button>
                </div>
              )}
              <div className="form-field">
                <label>{t('client.entreprise.activity_nom')} *</label>
                <input type="text" value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} required />
              </div>
              <div className="form-field">
                <label>{t('client.entreprise.activity_email')}</label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>{t('client.entreprise.activity_telephone')}</label>
                <input type="text" value={form.telephone} onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>{t('client.entreprise.activity_adresse')}</label>
                <textarea value={form.adresse} onChange={(e) => setForm((f) => ({ ...f, adresse: e.target.value }))} rows={2} />
              </div>
              {formError && <p className="form-error">{formError}</p>}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={formSaving}>
                  {formSaving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
