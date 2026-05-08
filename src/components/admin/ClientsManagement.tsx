import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Client, DomaineActivite } from '../../types';

type CompteType = 'independant' | 'entreprise';

const TUNISIAN_PHONE = /^(\+216[\s-]?)?[2579]\d{7}$/;

interface IndependantForm {
  nomActivite: string;
  domaineId: string;
  email: string;
  telephone: string;
  adresse: string;
}

interface EntrepriseForm {
  nomEntreprise: string;
  email: string;
  telephone: string;
  adresse: string;
}

const emptyIndependant = (): IndependantForm => ({ nomActivite: '', domaineId: '', email: '', telephone: '', adresse: '' });
const emptyEntreprise = (): EntrepriseForm => ({ nomEntreprise: '', email: '', telephone: '', adresse: '' });

export default function ClientsManagement() {
  const { t } = useTranslation();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [domaines, setDomaines] = useState<DomaineActivite[]>([]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<'type' | 'form'>('type');
  const [selectedType, setSelectedType] = useState<CompteType | null>(null);
  const [indForm, setIndForm] = useState<IndependantForm>(emptyIndependant());
  const [entForm, setEntForm] = useState<EntrepriseForm>(emptyEntreprise());
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [inviteSent, setInviteSent] = useState<{ nom: string; email: string } | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const fetchClients = () => {
    setLoading(true);
    api.get('/admin/clients').then(({ data }) => setClients(data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchClients();
    api.get('/api/domaines').then(({ data }) => setDomaines(data)).catch(() => {});
  }, []);

  const openAdd = () => {
    setEditId(null);
    setSelectedType(null);
    setModalStep('type');
    setIndForm(emptyIndependant());
    setEntForm(emptyEntreprise());
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (c: Client) => {
    setEditId(c.id);
    setSelectedType(c.compteType === 'entreprise' ? 'entreprise' : 'independant');
    setModalStep('form');
    setIndForm({ nomActivite: c.name, domaineId: '', email: c.email, telephone: c.phone || '', adresse: '' });
    setEntForm({ nomEntreprise: c.name, email: c.email, telephone: c.phone || '', adresse: '' });
    setFormErrors({});
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setFormErrors({}); };

  const selectType = (type: CompteType) => {
    setSelectedType(type);
    setModalStep('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};

    if (selectedType === 'independant') {
      if (!indForm.nomActivite.trim()) errs.nom = t('validation.name_required');
      if (!indForm.email.trim()) errs.email = t('validation.email_required');
      if (indForm.telephone && !TUNISIAN_PHONE.test(indForm.telephone.replace(/\s/g, ''))) errs.telephone = t('validation.phone_invalid');
    } else {
      if (!entForm.nomEntreprise.trim()) errs.nom = t('validation.name_required');
      if (!entForm.email.trim()) errs.email = t('validation.email_required');
      if (entForm.telephone && !TUNISIAN_PHONE.test(entForm.telephone.replace(/\s/g, ''))) errs.telephone = t('validation.phone_invalid');
    }

    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      if (editId) {
        const payload = selectedType === 'independant'
          ? { name: indForm.nomActivite, email: indForm.email, phone: indForm.telephone, compteType: 'independant' }
          : { name: entForm.nomEntreprise, email: entForm.email, phone: entForm.telephone, compteType: 'entreprise' };
        await api.put(`/admin/clients/${editId}`, payload);
        closeModal();
        fetchClients();
      } else {
        const payload = selectedType === 'independant'
          ? {
              name: indForm.nomActivite,
              email: indForm.email,
              telephone: indForm.telephone,
              adresse: indForm.adresse,
              domaineId: indForm.domaineId ? parseInt(indForm.domaineId) : undefined,
              compteType: 'independant',
            }
          : {
              name: entForm.nomEntreprise,
              email: entForm.email,
              telephone: entForm.telephone,
              adresse: entForm.adresse,
              compteType: 'entreprise',
            };
        const { data } = await api.post('/admin/clients', payload);
        setInviteSent({ nom: data.name, email: data.email });
        closeModal();
        fetchClients();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || t('common.error');
      if (msg.toLowerCase().includes('email')) {
        setFormErrors({ email: msg });
      } else {
        setFormErrors({ global: msg });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('admin.clients.delete_confirm'))) return;
    await api.delete(`/admin/clients/${id}`);
    fetchClients();
  };

  const handleResendInvite = async (id: number, email: string) => {
    setResendingId(id);
    try {
      await api.post(`/auth/invite/resend/${id}`);
      alert(`Invitation renvoyée à ${email}`);
    } catch {
      alert('Erreur lors de l\'envoi');
    } finally {
      setResendingId(null);
    }
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

      <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
        <input
          type="text"
          placeholder={t('common.search') + '…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
          style={{ maxWidth: 360 }}
        />
      </div>

      {loading ? (
        <div className="loading-text">{t('common.loading')}</div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead style={{ background: '#eff6ff' }}>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.email')}</th>
                <th>{t('common.phone')}</th>
                <th>{t('admin.clients.compte_type')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.phone || '—'}</td>
                  <td>
                    {c.compteType === 'entreprise' ? (
                      <span style={{ background: '#fef9c3', color: '#854d0e', padding: '2px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>🏢 Entreprise</span>
                    ) : (
                      <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>👤 Indépendant</span>
                    )}
                  </td>
                  <td className="actions-cell">
                    {!c.activatedAt && (
                      <span style={{ background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, marginRight: 6 }}>⏳ En attente</span>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>{t('common.edit')}</button>
                    {!c.activatedAt && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: '#4338ca', borderColor: '#4338ca' }}
                        disabled={resendingId === c.id}
                        onClick={() => handleResendInvite(c.id, c.email)}
                      >
                        {resendingId === c.id ? '…' : '✉️ Renvoyer'}
                      </button>
                    )}
                    {c.compteType === 'entreprise' && (c.onboardingStep ?? 0) > 0 && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--warning, #b45309)', borderColor: 'var(--warning, #b45309)' }}
                        title="Réinitialiser l'onboarding (débloquer le compte)"
                        onClick={async () => {
                          if (!window.confirm(`Réinitialiser l'onboarding de ${c.name} et débloquer son compte ?`)) return;
                          await api.put(`/admin/clients/${c.id}`, { onboardingStep: 0 });
                          setClients((prev) => prev.map((x) => x.id === c.id ? { ...x, onboardingStep: 0 } : x));
                        }}
                      >
                        🔓 Reset
                      </button>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>{t('common.delete')}</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="empty-cell">{t('common.no_result')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite sent banner */}
      {inviteSent && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: '#15803d', fontWeight: 600 }}>
            ✉️ Invitation envoyée à <strong>{inviteSent.nom}</strong> ({inviteSent.email}) — le compte sera activé dès qu'il cliquera sur le lien.
          </span>
          <button onClick={() => setInviteSent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15803d', fontSize: '1rem' }}>✕</button>
        </div>
      )}

      {/* Create/Edit modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>{editId ? t('admin.clients.edit') : t('admin.clients.add')}</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>

            {/* Step 1: type selection */}
            {modalStep === 'type' && (
              <div className="modal-body">
                <p style={{ marginBottom: 20, color: 'var(--text-muted)' }}>
                  Choisissez le type de compte à créer :
                </p>
                <div style={{ display: 'flex', gap: 16 }}>
                  <button
                    type="button"
                    className="compte-type-card"
                    onClick={() => selectType('independant')}
                  >
                    <span style={{ fontSize: '2rem' }}>👤</span>
                    <strong>Indépendant</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Gérant unique d'une activité
                    </span>
                  </button>
                  <button
                    type="button"
                    className="compte-type-card"
                    onClick={() => selectType('entreprise')}
                  >
                    <span style={{ fontSize: '2rem' }}>🏢</span>
                    <strong>Entreprise</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Plusieurs activités / restaurants
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: form */}
            {modalStep === 'form' && (
              <form onSubmit={handleSubmit} className="modal-body">
                {formErrors.global && (
                  <div style={{ background: '#fff0f0', color: '#c00', border: '1px solid #fbb', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
                    {formErrors.global}
                  </div>
                )}

                {/* Type switcher — visible in edit mode */}
                {editId && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {(['independant', 'entreprise'] as CompteType[]).map((t) => (
                      <button key={t} type="button"
                        onClick={() => setSelectedType(t)}
                        style={{
                          flex: 1, padding: '8px 12px', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', border: '2px solid',
                          borderColor: selectedType === t ? 'var(--primary)' : 'var(--border)',
                          background: selectedType === t ? 'var(--primary-light, #eef2ff)' : 'var(--surface)',
                          color: selectedType === t ? 'var(--primary)' : 'var(--text-muted)',
                        }}>
                        {t === 'independant' ? '👤 Indépendant' : '🏢 Entreprise'}
                      </button>
                    ))}
                  </div>
                )}

                {selectedType === 'independant' && (
                  <>
                    <div className="form-group">
                      <label>Nom de l'activité *</label>
                      <input
                        className={`input${formErrors.nom ? ' input-error' : ''}`}
                        value={indForm.nomActivite}
                        onChange={(e) => setIndForm((f) => ({ ...f, nomActivite: e.target.value }))}
                      />
                      {formErrors.nom && <span className="field-error">{formErrors.nom}</span>}
                    </div>
                    <div className="form-group">
                      <label>Domaine d'activité</label>
                      <select
                        className="input"
                        value={indForm.domaineId}
                        onChange={(e) => setIndForm((f) => ({ ...f, domaineId: e.target.value }))}
                      >
                        <option value="">— Choisir un domaine —</option>
                        {domaines.map((d) => (
                          <option key={d.id} value={d.id}>{d.nom}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>{t('common.email')} *</label>
                      <input
                        className={`input${formErrors.email ? ' input-error' : ''}`}
                        type="email"
                        value={indForm.email}
                        onChange={(e) => setIndForm((f) => ({ ...f, email: e.target.value }))}
                      />
                      {formErrors.email && <span className="field-error">{formErrors.email}</span>}
                    </div>
                    <div className="form-group">
                      <label>{t('common.phone')} <span style={{ fontSize: '0.8em', color: '#888' }}>{t('validation.phone_hint')}</span></label>
                      <input
                        className={`input${formErrors.telephone ? ' input-error' : ''}`}
                        placeholder={t('validation.phone_placeholder')}
                        value={indForm.telephone}
                        onChange={(e) => setIndForm((f) => ({ ...f, telephone: e.target.value }))}
                      />
                      {formErrors.telephone && <span className="field-error">{formErrors.telephone}</span>}
                    </div>
                    <div className="form-group">
                      <label>Adresse</label>
                      <textarea
                        className="input"
                        rows={2}
                        value={indForm.adresse}
                        onChange={(e) => setIndForm((f) => ({ ...f, adresse: e.target.value }))}
                      />
                    </div>
                  </>
                )}

                {selectedType === 'entreprise' && (
                  <>
                    <div className="form-group">
                      <label>Nom de l'entreprise *</label>
                      <input
                        className={`input${formErrors.nom ? ' input-error' : ''}`}
                        value={entForm.nomEntreprise}
                        onChange={(e) => setEntForm((f) => ({ ...f, nomEntreprise: e.target.value }))}
                      />
                      {formErrors.nom && <span className="field-error">{formErrors.nom}</span>}
                    </div>
                    <div className="form-group">
                      <label>{t('common.email')} *</label>
                      <input
                        className={`input${formErrors.email ? ' input-error' : ''}`}
                        type="email"
                        value={entForm.email}
                        onChange={(e) => setEntForm((f) => ({ ...f, email: e.target.value }))}
                      />
                      {formErrors.email && <span className="field-error">{formErrors.email}</span>}
                    </div>
                    <div className="form-group">
                      <label>{t('common.phone')} <span style={{ fontSize: '0.8em', color: '#888' }}>{t('validation.phone_hint')}</span></label>
                      <input
                        className={`input${formErrors.telephone ? ' input-error' : ''}`}
                        placeholder={t('validation.phone_placeholder')}
                        value={entForm.telephone}
                        onChange={(e) => setEntForm((f) => ({ ...f, telephone: e.target.value }))}
                      />
                      {formErrors.telephone && <span className="field-error">{formErrors.telephone}</span>}
                    </div>
                    <div className="form-group">
                      <label>Adresse</label>
                      <textarea
                        className="input"
                        rows={2}
                        value={entForm.adresse}
                        onChange={(e) => setEntForm((f) => ({ ...f, adresse: e.target.value }))}
                      />
                    </div>
                  </>
                )}

                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                  🔑 Un mot de passe temporaire sera généré automatiquement.
                </p>

                <div className="modal-footer">
                  {!editId && (
                    <button type="button" className="btn btn-secondary" onClick={() => setModalStep('type')}>
                      ← Retour
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={closeModal}>{t('common.cancel')}</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? t('common.loading') : t('common.save')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
