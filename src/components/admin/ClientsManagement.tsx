import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Client, DomaineActivite } from '../../types';

type CompteType = 'independant' | 'entreprise';

const TUNISIAN_PHONE = /^(\+216[\s-]?)?[2579]\d{7}$/;

interface IndependantForm {
  nomActivite: string;
  domaineIds: number[];
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

const emptyIndependant = (): IndependantForm => ({ nomActivite: '', domaineIds: [], email: '', telephone: '', adresse: '' });
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
  const [filterType, setFilterType] = useState<'' | 'independant' | 'entreprise'>('');
  const [filterStatus, setFilterStatus] = useState<'' | 'active' | 'pending'>('');

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
    setIndForm({ nomActivite: c.name, domaineIds: c.domaineIds || [], email: c.email, telephone: c.phone || '', adresse: '' });
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
          ? { name: indForm.nomActivite, email: indForm.email, phone: indForm.telephone, compteType: 'independant', domaineIds: indForm.domaineIds }
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
              domaineIds: indForm.domaineIds,
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

  const totalIndep = clients.filter((c) => c.compteType !== 'entreprise').length;
  const totalEntreprise = clients.filter((c) => c.compteType === 'entreprise').length;
  const totalPending = clients.filter((c) => !c.activatedAt).length;

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q);
    const matchType =
      filterType === '' ||
      (filterType === 'independant' && c.compteType !== 'entreprise') ||
      (filterType === 'entreprise' && c.compteType === 'entreprise');
    const matchStatus =
      filterStatus === '' ||
      (filterStatus === 'active' && !!c.activatedAt) ||
      (filterStatus === 'pending' && !c.activatedAt);
    return matchSearch && matchType && matchStatus;
  });

  const Badge = ({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) => (
    <span style={{ background: bg, color, fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
      {children}
    </span>
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>👥 {t('admin.clients.title')}</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ {t('admin.clients.add')}</button>
      </div>

      {/* Stats KPI bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total', value: clients.length, icon: '👥', bg: '#eff6ff', color: '#1d4ed8' },
          { label: 'Indépendants', value: totalIndep, icon: '👤', bg: '#f0fdf4', color: '#15803d' },
          { label: 'Entreprises', value: totalEntreprise, icon: '🏢', bg: '#fef9c3', color: '#854d0e' },
          { label: 'En attente', value: totalPending, icon: '⏳', bg: totalPending > 0 ? '#fee2e2' : '#f8fafc', color: totalPending > 0 ? '#991b1b' : '#64748b' },
        ].map(({ label, value, icon, bg, color }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${color}22`, borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color }}>{icon} {value}</div>
            <div style={{ fontSize: '0.78rem', color, opacity: 0.8 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter row */}
      <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Rechercher par nom, email, téléphone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
          style={{ minWidth: 220, flex: 1 }}
        />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Type :</span>
          {([
            { value: '', label: 'Tous', count: clients.length },
            { value: 'independant', label: '👤 Indép', count: totalIndep },
            { value: 'entreprise', label: '🏢 Entreprise', count: totalEntreprise },
          ] as const).map(({ value, label, count }) => (
            <button
              key={value}
              className={`btn btn-sm ${filterType === value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterType(value)}
            >
              {label} <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>({count})</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Statut :</span>
          {([
            { value: '', label: 'Tous' },
            { value: 'active', label: '✅ Activés' },
            { value: 'pending', label: '⏳ En attente', alert: totalPending > 0 },
          ] as const).map(({ value, label, alert }) => (
            <button
              key={value}
              className={`btn btn-sm ${filterStatus === value ? 'btn-primary' : 'btn-ghost'}`}
              style={alert && filterStatus !== value ? { borderColor: '#dc2626', color: '#dc2626' } : {}}
              onClick={() => setFilterStatus(value)}
            >
              {label}
              {value === 'pending' && totalPending > 0 && (
                <span style={{ background: '#dc2626', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: '0.65rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
                  {totalPending}
                </span>
              )}
            </button>
          ))}
        </div>
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
                <th>Type</th>
                <th>Domaines</th>
                <th>Statut</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={!c.activatedAt ? { background: '#fffbeb' } : {}}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{c.email}</td>
                  <td>{c.phone || '—'}</td>
                  <td>
                    {c.compteType === 'entreprise' ? (
                      <Badge bg="#fef9c3" color="#854d0e">🏢 Entreprise</Badge>
                    ) : (
                      <Badge bg="#eff6ff" color="#1d4ed8">👤 Indépendant</Badge>
                    )}
                  </td>
                  <td>
                    {c.compteType === 'entreprise' ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>par activité</span>
                    ) : (c.domaineIds || []).length === 0 ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {(c.domaineIds || []).map((did) => {
                          const d = domaines.find((dom) => dom.id === did);
                          return (
                            <span key={did} style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '0.7rem', fontWeight: 600, padding: '1px 7px', borderRadius: 12, border: '1px solid #bfdbfe' }}>
                              {d ? d.nom : `#${did}`}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td>
                    {c.activatedAt ? (
                      <Badge bg="#dcfce7" color="#15803d">✅ Activé</Badge>
                    ) : (
                      <Badge bg="#fee2e2" color="#991b1b">⏳ En attente</Badge>
                    )}
                  </td>
                  <td className="actions-cell">
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
                <tr><td colSpan={7} className="empty-cell">{t('common.no_result')}</td></tr>
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
                      <label>
                        Domaines d'activité
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 6 }}>
                          (détermine les ingrédients visibles dans le catalogue)
                        </span>
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                        {domaines.map((d) => {
                          const checked = indForm.domaineIds.includes(d.id);
                          return (
                            <label
                              key={d.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                                padding: '5px 12px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600,
                                border: `1.5px solid ${checked ? '#1d4ed8' : 'var(--border)'}`,
                                background: checked ? '#dbeafe' : '#f8fafc',
                                color: checked ? '#1d4ed8' : 'var(--text-muted)',
                                userSelect: 'none',
                              }}
                            >
                              <input
                                type="checkbox"
                                style={{ display: 'none' }}
                                checked={checked}
                                onChange={() => setIndForm((f) => ({
                                  ...f,
                                  domaineIds: checked
                                    ? f.domaineIds.filter((id) => id !== d.id)
                                    : [...f.domaineIds, d.id],
                                }))}
                              />
                              {checked ? '✓ ' : ''}{d.nom}
                            </label>
                          );
                        })}
                        {domaines.length === 0 && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Aucun domaine configuré</span>
                        )}
                      </div>
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
                  ✉️ Un email d'invitation sera envoyé automatiquement pour activer le compte.
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
