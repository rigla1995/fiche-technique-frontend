import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, ActiviteIngredient } from '../../types';

type ActiviteForm = { nom: string; adresse: string; telephone: string; email: string };
const emptyForm = (): ActiviteForm => ({ nom: '', adresse: '', telephone: '', email: '' });
type FranchiseStepForm = { telephone: string; email: string; adresse: string };
const emptyFranchiseStep = (): FranchiseStepForm => ({ telephone: '', email: '', adresse: '' });

interface Props {
  onCreated?: () => void;
  minimal?: boolean;
}

const TUNISIAN_PHONE = /^(\+216[\s-]?)?[2579]\d{7}$/;

export default function ActivitesPage({ onCreated, minimal }: Props) {
  const { t } = useTranslation();
  const { user, advanceOnboarding } = useAuth();
  const navigate = useNavigate();

  const [activites, setActivites] = useState<Activite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ActiviteForm>(emptyForm());
  const [memeActivite, setMemeActivite] = useState<boolean | null>(null);
  const [nombreActivites, setNombreActivites] = useState('1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [isDuplicate, setIsDuplicate] = useState(false);
  // Franchise wizard state
  const [franchiseName, setFranchiseName] = useState('');
  const [franchiseStep, setFranchiseStep] = useState(0);
  const [franchiseForms, setFranchiseForms] = useState<FranchiseStepForm[]>([]);
  // Labo wizard state
  const [hasLabo, setHasLabo] = useState<boolean | null>(null);
  const [laboNom, setLaboNom] = useState('');
  const [laboTel, setLaboTel] = useState('');
  const [laboAdresse, setLaboAdresse] = useState('');
  const [laboWizardStep, setLaboWizardStep] = useState<'choice' | 'labo-form' | 'activities'>('choice');
  // List filters
  const [filterFranchiseGroup, setFilterFranchiseGroup] = useState('');
  const [filterFranchiseName, setFilterFranchiseName] = useState('');
  const [filterDistinctName, setFilterDistinctName] = useState('');
  // Ingredient assignment modal
  const [ingredientsActivite, setIngredientsActivite] = useState<Activite | null>(null);
  const [ingredients, setIngredients] = useState<ActiviteIngredient[]>([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/entreprise/activites');
      setActivites(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const isFranchise = memeActivite === true;

  const openAdd = (preType?: 'franchise' | 'distincte') => {
    setEditingId(null);
    setIsDuplicate(false);
    setForm(emptyForm());
    setMemeActivite(preType === 'franchise' ? true : preType === 'distincte' ? false : null);
    setNombreActivites('2');
    setFranchiseName('');
    setFranchiseStep(0);
    setFranchiseForms([emptyFranchiseStep(), emptyFranchiseStep()]);
    setHasLabo(null);
    setLaboNom('');
    setLaboTel('');
    setLaboAdresse('');
    setLaboWizardStep('choice');
    setError('');
    setShowForm(true);
  };

  const openEdit = (act: Activite) => {
    setEditingId(act.id);
    setIsDuplicate(false);
    setForm({ nom: act.nom, adresse: act.adresse || '', telephone: act.telephone || '', email: act.email || '' });
    setMemeActivite(null);
    setNombreActivites('1');
    setError('');
    setShowForm(true);
  };

  const openDuplicate = (act: Activite) => {
    setEditingId(null);
    setIsDuplicate(true);
    setForm({ nom: act.nom, adresse: '', telephone: '', email: '' });
    setMemeActivite(null);
    setNombreActivites('1');
    setError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setIsDuplicate(false);
    setError('');
  };

  // Derived from activites — needed before franchiseUnlocked to avoid TDZ
  const franchiseActivitiesEarly = activites.filter((a) => a.type === 'franchise');
  const distinctActivitiesEarly = activites.filter((a) => a.type !== 'franchise');
  const franchiseGroupNamesEarly = Array.from(new Set(franchiseActivitiesEarly.map((a) => a.franchiseGroup || a.nom))).sort();
  const distinctNamesEarly = Array.from(new Set(distinctActivitiesEarly.map((a) => a.nom.toLowerCase())));

  const franchiseNameConflict = !editingId && franchiseName.trim()
    ? franchiseGroupNamesEarly.some((g) => g.toLowerCase() === franchiseName.trim().toLowerCase())
    : false;
  const distinctNameConflict = !editingId && !isDuplicate && form.nom.trim()
    ? distinctNamesEarly.includes(form.nom.trim().toLowerCase())
    : false;

  const franchiseCount = Math.max(0, parseInt(nombreActivites) || 0);
  const franchiseUnlocked = isFranchise && !editingId && !isDuplicate && franchiseName.trim().length > 0 && franchiseCount > 1 && !franchiseNameConflict;

  const handleNombreActivitesChange = (val: string) => {
    setNombreActivites(val);
    const n = Math.max(0, parseInt(val) || 0);
    setFranchiseForms((prev) => {
      if (n <= prev.length) return prev.slice(0, n);
      return [...prev, ...Array.from({ length: n - prev.length }, emptyFranchiseStep)];
    });
    setFranchiseStep((s) => Math.min(s, Math.max(0, n - 1)));
  };

  const updateFranchiseForm = (field: keyof FranchiseStepForm, value: string) => {
    setFranchiseForms((prev) => prev.map((f, i) => i === franchiseStep ? { ...f, [field]: value } : f));
  };

  const validateFranchiseStep = (f: FranchiseStepForm | undefined): string | null => {
    if (!f) return t('common.error');
    if (!f.telephone.trim()) return t('validation.phone_required');
    if (!TUNISIAN_PHONE.test(f.telephone.replace(/\s/g, ''))) return t('validation.phone_invalid');
    if (!f.adresse.trim()) return t('validation.address_required');
    return null;
  };

  const handleFranchiseNext = () => {
    const err = validateFranchiseStep(franchiseForms[franchiseStep]);
    if (err) { setError(err); return; }
    setError('');
    setFranchiseStep((s) => s + 1);
  };

  const handleFranchiseSave = async () => {
    const err = validateFranchiseStep(franchiseForms[franchiseStep]);
    if (err) { setError(err); return; }
    if (!franchiseName.trim()) { setError(t('validation.name_required')); return; }
    const fn = franchiseName.trim();
    const autoLaboNom = `Labo_${fn}`;
    if (hasLabo && !laboTel.trim()) {
      setError(t('client.labo.labo_fields_required')); return;
    }
    setSaving(true);
    setError('');
    try {
      const isFirst = activites.length === 0;

      // Create labo first if needed
      let laboId: number | null = null;
      if (hasLabo) {
        const { data: labo } = await api.post('/api/labo', {
          franchiseGroup: fn,
          nom: autoLaboNom,
          referentTel: laboTel.trim(),
          adresse: laboAdresse.trim() || undefined,
        });
        laboId = labo.id;
      }

      for (let i = 0; i < franchiseForms.length; i++) {
        const f = franchiseForms[i];
        await api.post('/api/entreprise/activites', {
          nom: `${fn} ${i + 1}`,
          franchiseName: fn,
          memeActivite: true,
          telephone: f.telephone,
          email: f.email || undefined,
          adresse: f.adresse,
          ...(laboId ? { laboId } : {}),
        });
      }
      if (onCreated) onCreated();
      if (isFirst && user?.onboardingStep === 2) await advanceOnboarding(3);
      closeForm();
      if (isFirst) {
        navigate('/client/catalogue-franchise?created=1');
        return;
      }
      setMsg(t('client.entreprise.activity_created'));
      setTimeout(() => setMsg(''), 3000);
      load();
    } catch (err: unknown) {
      const errMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(errMsg || t('common.error'));
    }
    setSaving(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Only handles edit, duplicate, and distinct creation (franchise uses handleFranchiseSave)
    if (!form.nom.trim()) { setError(t('validation.name_required')); return; }
    if (form.telephone && !TUNISIAN_PHONE.test(form.telephone.replace(/\s/g, ''))) {
      setError(t('validation.phone_invalid'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api.put(`/api/entreprise/activites/${editingId}`, { nom: form.nom, adresse: form.adresse, telephone: form.telephone, email: form.email });
        setMsg(t('client.entreprise.activity_updated'));
      } else {
        const isFirst = activites.length === 0;
        const payload: Record<string, unknown> = { nom: form.nom, adresse: form.adresse, telephone: form.telephone, email: form.email };
        if (memeActivite !== null) payload.memeActivite = memeActivite;
        await api.post('/api/entreprise/activites', payload);
        if (onCreated) onCreated();
        if (isFirst && user?.onboardingStep === 2) await advanceOnboarding(3);
        closeForm();
        if (isFirst) {
          navigate('/client/catalogue-distinct?created=1');
          return;
        }
        setMsg(t('client.entreprise.activity_created'));
        setTimeout(() => setMsg(''), 3000);
        load();
        return;
      }
      setTimeout(() => setMsg(''), 3000);
      closeForm();
      load();
    } catch (err: unknown) {
      const errMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(errMsg || t('common.error'));
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

  const openIngredients = async (act: Activite) => {
    setIngredientsActivite(act);
    setIngredientsLoading(true);
    setIngredients([]);
    try {
      const { data } = await api.get(`/api/entreprise/activites/${act.id}/ingredients`);
      setIngredients(data);
    } catch { /* ignore */ }
    setIngredientsLoading(false);
  };

  const closeIngredients = () => { setIngredientsActivite(null); setIngredients([]); };

  const toggleIngredient = async (ingredientId: number) => {
    if (!ingredientsActivite) return;
    try {
      const { data } = await api.post(`/api/entreprise/activites/${ingredientsActivite.id}/ingredients/${ingredientId}/select`);
      setIngredients((prev) => prev.map((i) => i.id === ingredientId ? { ...i, selected: data.selected } : i));
    } catch { /* ignore */ }
  };

  const ingredientGroups: Record<string, ActiviteIngredient[]> = {};
  for (const ing of ingredients) {
    const cat = ing.categorie || t('client.ingredients_catalog.no_category');
    if (!ingredientGroups[cat]) ingredientGroups[cat] = [];
    ingredientGroups[cat].push(ing);
  }

  const franchiseActivities = franchiseActivitiesEarly;
  const distinctActivities = distinctActivitiesEarly;
  const franchiseGroupNames = franchiseGroupNamesEarly;
  const filteredFranchise = franchiseActivities.filter((a) => {
    const g = a.franchiseGroup || a.nom;
    return (!filterFranchiseGroup || g === filterFranchiseGroup) &&
      (!filterFranchiseName || a.nom.toLowerCase().includes(filterFranchiseName.toLowerCase()));
  });
  const franchiseGrouped: Record<string, Activite[]> = {};
  for (const a of filteredFranchise) {
    const g = a.franchiseGroup || a.nom;
    if (!franchiseGrouped[g]) franchiseGrouped[g] = [];
    franchiseGrouped[g].push(a);
  }
  const filteredDistinct = distinctActivities.filter((a) =>
    !filterDistinctName || a.nom.toLowerCase().includes(filterDistinctName.toLowerCase())
  );

  return (
    <div className={minimal ? '' : 'page-content'}>
      {!minimal && <h1 style={{ marginBottom: 24 }}>{t('nav.activites')}</h1>}

      {!loading && activites.length > 0 && (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 20 }}>
          {activites.length} {t('client.entreprise.activities_section').toLowerCase()}
        </p>
      )}

      {msg && <div className="alert alert-success">{msg}</div>}

      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : activites.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🏢</span>
          <p style={{ marginBottom: 16 }}>{t('client.entreprise.no_activities')}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => openAdd('franchise')}>
              🔗 {t('client.entreprise.franchise_yes')}
            </button>
            <button className="btn btn-secondary" onClick={() => openAdd('distincte')}>
              📍 {t('client.entreprise.franchise_no')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Franchise section — always visible so user can add a franchise activity */}
          <div style={{ marginBottom: 36 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 4, height: 22, borderRadius: 4, background: 'linear-gradient(180deg, #2563eb 0%, #0ea5e9 100%)', display: 'inline-block', flexShrink: 0 }} />
                  <h2 style={{ fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text)', margin: 0 }}>
                    {t('nav.espace_franchise')}
                  </h2>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', border: '1px solid #bfdbfe', borderRadius: 20, padding: '2px 10px' }}>{franchiseActivities.length}</span>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => openAdd('franchise')}>
                  + {t('client.entreprise.add_activity')}
                </button>
              </div>

              {franchiseActivities.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>{t('nav.no_franchise_activity')}</p>
              ) : (
                <>
                  {/* Franchise filters — always visible */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('client.entreprise.group_label', 'Groupe')}</span>
                      <select
                        className="input"
                        style={{ maxWidth: 200 }}
                        value={filterFranchiseGroup}
                        onChange={(e) => setFilterFranchiseGroup(e.target.value)}
                      >
                        <option value="">{t('client.entreprise.all_groups')}</option>
                        {franchiseGroupNames.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 auto', maxWidth: 260 }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('common.search')}</span>
                      <input
                        type="text"
                        className="input"
                        style={{ minWidth: 140 }}
                        placeholder={t('common.search') + '…'}
                        value={filterFranchiseName}
                        onChange={(e) => setFilterFranchiseName(e.target.value)}
                      />
                    </div>
                  </div>

                  {filteredFranchise.length === 0 ? (
                    <p className="text-muted">{t('common.no_result')}</p>
                  ) : (
                    Object.entries(franchiseGrouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, acts]) => {
                      const groupLabo = acts.find((a) => a.laboNom)?.laboNom ?? null;
                      return (
                        <div key={group} style={{ marginBottom: 24 }}>
                          <h3 style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            🏢 {group} <span style={{ fontWeight: 400, fontSize: '0.72rem', opacity: 0.7 }}>({acts.length})</span>
                            {groupLabo && (
                              <span style={{ fontWeight: 600, fontSize: '0.72rem', color: '#7c3aed', background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 20, padding: '2px 10px', textTransform: 'none', letterSpacing: 0 }}>
                                🏭 {groupLabo}
                              </span>
                            )}
                          </h3>
                          <div className="table-responsive card" style={{ marginBottom: 0 }}>
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>{t('common.name')}</th>
                                  <th style={{ width: 120 }}>{t('client.entreprise.activity_telephone')}</th>
                                  <th style={{ width: 170 }}>{t('client.entreprise.activity_email')}</th>
                                  <th>{t('client.entreprise.activity_adresse')}</th>
                                  {acts.some((a) => a.laboId) && (
                                    <th style={{ width: 130 }}>{t('client.entreprise.labo', 'Labo')}</th>
                                  )}
                                  <th style={{ width: 140, textAlign: 'right' }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {acts.map((act) => (
                                  <tr key={act.id}>
                                    <td style={{ fontWeight: 700 }}>{act.nom}</td>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{act.telephone || '—'}</td>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{act.email || '—'}</td>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{act.adresse || '—'}</td>
                                    {acts.some((a) => a.laboId) && (
                                      <td>
                                        {act.laboNom ? (
                                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#7c3aed', background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 20, padding: '2px 8px' }}>
                                            🏭 {act.laboNom}
                                          </span>
                                        ) : (
                                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                                        )}
                                      </td>
                                    )}
                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                      <button className="btn btn-ghost btn-sm" title={t('client.entreprise.manage_ingredients')} onClick={() => openIngredients(act)}>🧂</button>
                                      <button className="btn btn-ghost btn-sm" title={t('common.edit')} onClick={() => openEdit(act)}>✏️</button>
                                      <button className="btn btn-ghost btn-sm" title={t('client.entreprise.duplicate_activity')} onClick={() => openDuplicate(act)}>⧉</button>
                                      <button className="btn btn-danger-ghost btn-sm" title={t('common.delete')} onClick={() => deleteActivite(act.id)}>🗑</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>

          {/* Distinct section — always visible when any activities exist so user can add a distinct activity */}
          {(distinctActivities.length > 0 || franchiseActivities.length > 0) && (
            <div style={{ marginBottom: 36 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 4, height: 22, borderRadius: 4, background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)', display: 'inline-block', flexShrink: 0 }} />
                  <h2 style={{ fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text)', margin: 0 }}>
                    {t('nav.espace_distinct')}
                  </h2>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '2px 10px' }}>{distinctActivities.length}</span>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => openAdd('distincte')}>
                  + {t('client.entreprise.add_activity')}
                </button>
              </div>

              {distinctActivities.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>{t('nav.no_distinct_activity')}</p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 auto', maxWidth: 260 }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('common.search')}</span>
                      <input
                        type="text"
                        className="input"
                        style={{ minWidth: 140 }}
                        placeholder={t('common.search') + '…'}
                        value={filterDistinctName}
                        onChange={(e) => setFilterDistinctName(e.target.value)}
                      />
                    </div>
                  </div>

                  {filteredDistinct.length === 0 ? (
                    <p className="text-muted">{t('common.no_result')}</p>
                  ) : (
                    <div className="table-responsive card" style={{ marginBottom: 0 }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t('common.name')}</th>
                            <th style={{ width: 150 }}>{t('client.entreprise.activity_telephone')}</th>
                            <th style={{ width: 190 }}>{t('client.entreprise.activity_email')}</th>
                            <th>{t('client.entreprise.activity_adresse')}</th>
                            <th style={{ width: 140, textAlign: 'right' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDistinct.map((act) => (
                            <tr key={act.id}>
                              <td style={{ fontWeight: 700 }}>{act.nom}</td>
                              <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{act.telephone || '—'}</td>
                              <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{act.email || '—'}</td>
                              <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{act.adresse || '—'}</td>
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <button className="btn btn-ghost btn-sm" title={t('client.entreprise.manage_ingredients')} onClick={() => openIngredients(act)}>🧂</button>
                                <button className="btn btn-ghost btn-sm" title={t('common.edit')} onClick={() => openEdit(act)}>✏️</button>
                                <button className="btn btn-ghost btn-sm" title={t('client.entreprise.duplicate_activity')} onClick={() => openDuplicate(act)}>⧉</button>
                                <button className="btn btn-danger-ghost btn-sm" title={t('common.delete')} onClick={() => deleteActivite(act.id)}>🗑</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Add / Edit form modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>
                {isDuplicate ? `${t('client.entreprise.duplicate_activity')} — ${t('client.entreprise.add_activity')}`
                  : editingId ? t('client.entreprise.edit_activity')
                  : t('client.entreprise.add_activity')}
              </h2>
              <button className="modal-close" onClick={closeForm}>✕</button>
            </div>
            <form onSubmit={submit} className="modal-body">
              {/* Franchise/Distinct question — only when type isn't already determined */}
              {!editingId && !isDuplicate && memeActivite === null && (
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

              {/* Franchise creation wizard */}
              {isFranchise && !editingId && !isDuplicate && (
                <>
                  {/* Step 1: name + count — always visible once franchise selected */}
                  <div className="form-field" style={{ marginBottom: 12 }}>
                    <label>{t('client.entreprise.franchise_name')} *</label>
                    <input
                      type="text"
                      placeholder={t('client.entreprise.franchise_name_placeholder')}
                      value={franchiseName}
                      onChange={(e) => setFranchiseName(e.target.value)}
                      style={franchiseNameConflict ? { borderColor: 'var(--danger, #ef4444)' } : undefined}
                    />
                    {franchiseNameConflict && (
                      <p style={{ color: 'var(--danger, #ef4444)', fontSize: '0.8rem', marginTop: 4 }}>
                        {t('client.entreprise.franchise_name_exists', { name: franchiseName.trim() })}
                      </p>
                    )}
                  </div>
                  <div className="form-field" style={{ marginBottom: 16 }}>
                    <label>{t('client.entreprise.franchise_count')} * <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8rem' }}>(min. 2)</span></label>
                    <input
                      type="number"
                      min="2"
                      max="20"
                      value={nombreActivites}
                      onChange={(e) => handleNombreActivitesChange(e.target.value)}
                      style={{ width: 80 }}
                    />
                  </div>

                  {/* Labo choice — shown once name + count are set */}
                  {franchiseUnlocked && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
                      <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {t('client.labo.labo_choice_label')}
                      </p>
                      <div style={{ display: 'flex', gap: 10, marginBottom: hasLabo === false ? 0 : 14 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: `2px solid ${hasLabo === true ? 'var(--primary)' : 'var(--border)'}`, background: hasLabo === true ? 'var(--primary-light, #eef2ff)' : 'var(--surface)', cursor: 'pointer', flex: 1, fontWeight: 600, fontSize: '0.9rem' }}>
                          <input type="radio" name="hasLabo" checked={hasLabo === true} onChange={() => setHasLabo(true)} style={{ accentColor: 'var(--primary)' }} />
                          🏭 {t('client.labo.avec_labo')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: `2px solid ${hasLabo === false ? 'var(--primary)' : 'var(--border)'}`, background: hasLabo === false ? 'var(--primary-light, #eef2ff)' : 'var(--surface)', cursor: 'pointer', flex: 1, fontWeight: 600, fontSize: '0.9rem' }}>
                          <input type="radio" name="hasLabo" checked={hasLabo === false} onChange={() => setHasLabo(false)} style={{ accentColor: 'var(--primary)' }} />
                          📋 {t('client.labo.gestion_separee')}
                        </label>
                      </div>

                      {/* Labo details form */}
                      {hasLabo === true && (
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            🏭 {t('client.labo.labo_info')}
                          </p>
                          <div className="form-field" style={{ marginBottom: 10 }}>
                            <label>{t('client.labo.labo_nom')}</label>
                            <input
                              type="text"
                              value={franchiseName.trim() ? `Labo_${franchiseName.trim()}` : ''}
                              readOnly
                              style={{ background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'not-allowed' }}
                            />
                          </div>
                          <div className="form-field" style={{ marginBottom: 10 }}>
                            <label>{t('client.labo.labo_tel')} * <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('validation.phone_hint')}</span></label>
                            <input type="text" value={laboTel} onChange={(e) => setLaboTel(e.target.value)} placeholder={t('validation.phone_placeholder')} />
                          </div>
                          <div className="form-field" style={{ marginBottom: 0 }}>
                            <label>{t('client.labo.labo_adresse')}</label>
                            <textarea value={laboAdresse} onChange={(e) => setLaboAdresse(e.target.value)} rows={2} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Per-activity step form — unlocked when franchiseName + count > 1 */}
                  {franchiseUnlocked && hasLabo !== null && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
                      <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)', marginBottom: 12 }}>
                        {t('client.entreprise.step_indicator', { current: franchiseStep + 1, total: franchiseCount })}
                      </p>
                      <div className="form-field" style={{ marginBottom: 12 }}>
                        <label>{t('client.entreprise.activity_nom')}</label>
                        <input
                          type="text"
                          value={`${franchiseName.trim()} ${franchiseStep + 1}`}
                          disabled
                          style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}
                        />
                      </div>
                      <div className="form-field" style={{ marginBottom: 12 }}>
                        <label>{t('client.entreprise.activity_telephone')} * <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('validation.phone_hint')}</span></label>
                        <input
                          type="text"
                          placeholder={t('validation.phone_placeholder')}
                          value={franchiseForms[franchiseStep]?.telephone ?? ''}
                          onChange={(e) => updateFranchiseForm('telephone', e.target.value)}
                        />
                      </div>
                      <div className="form-field" style={{ marginBottom: 12 }}>
                        <label>{t('client.entreprise.activity_email')}</label>
                        <input
                          type="email"
                          value={franchiseForms[franchiseStep]?.email ?? ''}
                          onChange={(e) => updateFranchiseForm('email', e.target.value)}
                        />
                      </div>
                      <div className="form-field" style={{ marginBottom: 12 }}>
                        <label>{t('client.entreprise.activity_adresse')} *</label>
                        <textarea
                          value={franchiseForms[franchiseStep]?.adresse ?? ''}
                          onChange={(e) => updateFranchiseForm('adresse', e.target.value)}
                          rows={2}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Distinct or edit: single name + contact fields */}
              {(!isFranchise || editingId || isDuplicate) && (memeActivite !== null || editingId || isDuplicate) && (
                <>
                  <div className="form-field" style={{ marginBottom: 12 }}>
                    <label>{t('client.entreprise.activity_nom')} *</label>
                    <input
                      type="text"
                      value={form.nom}
                      onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                      style={distinctNameConflict ? { borderColor: 'var(--danger, #ef4444)' } : undefined}
                    />
                    {distinctNameConflict && (
                      <p style={{ color: 'var(--danger, #ef4444)', fontSize: '0.8rem', marginTop: 4 }}>
                        {t('client.entreprise.activity_name_exists', { name: form.nom.trim() })}
                      </p>
                    )}
                  </div>
                  <div className="form-field" style={{ marginBottom: 12 }}>
                    <label>{t('client.entreprise.activity_email')}</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div className="form-field" style={{ marginBottom: 12 }}>
                    <label>{t('client.entreprise.activity_telephone')}</label>
                    <input
                      type="text"
                      value={form.telephone}
                      onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
                    />
                  </div>
                  <div className="form-field" style={{ marginBottom: 12 }}>
                    <label>{t('client.entreprise.activity_adresse')}</label>
                    <textarea
                      value={form.adresse}
                      onChange={(e) => setForm((f) => ({ ...f, adresse: e.target.value }))}
                      rows={2}
                    />
                  </div>
                </>
              )}

              {error && <p className="form-error">{error}</p>}

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>{t('common.cancel')}</button>

                {/* Franchise wizard navigation */}
                {isFranchise && !editingId && !isDuplicate ? (
                  <>
                    {franchiseUnlocked && franchiseStep > 0 && (
                      <button type="button" className="btn btn-secondary" onClick={() => { setFranchiseStep((s) => s - 1); setError(''); }}>
                        {t('client.entreprise.previous')}
                      </button>
                    )}
                    {franchiseUnlocked && franchiseStep < franchiseCount - 1 ? (
                      <button type="button" className="btn btn-primary" onClick={handleFranchiseNext} disabled={saving}>
                        {t('client.entreprise.next')}
                      </button>
                    ) : (
                      <button type="button" className="btn btn-primary" onClick={franchiseUnlocked && hasLabo !== null ? handleFranchiseSave : undefined} disabled={saving || !franchiseUnlocked || hasLabo === null}>
                        {saving ? t('common.loading') : t('common.save')}
                      </button>
                    )}
                  </>
                ) : (
                  <button type="submit" className="btn btn-primary" disabled={saving || (memeActivite === null && !editingId && !isDuplicate) || distinctNameConflict}>
                    {saving ? t('common.loading') : t('common.save')}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ingredient assignment modal */}
      {ingredientsActivite && (
        <div className="modal-overlay">
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--info">
              <h2>{t('client.entreprise.manage_ingredients')} — {ingredientsActivite.nom}</h2>
              <button className="modal-close" onClick={closeIngredients}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {ingredientsLoading ? (
                <p className="text-muted">{t('common.loading')}</p>
              ) : ingredients.length === 0 ? (
                <p className="text-muted">{t('client.stock.empty_stock')}</p>
              ) : (
                Object.entries(ingredientGroups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
                  <div key={cat} style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 8 }}>
                      🏷️ {cat} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.75rem' }}>({items.length})</span>
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {items.map((ing) => (
                        <label key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: ing.selected ? 'var(--primary-light, #eef2ff)' : 'transparent' }}>
                          <input
                            type="checkbox"
                            checked={ing.selected}
                            onChange={() => toggleIngredient(ing.id)}
                          />
                          <span style={{ flex: 1 }}>{ing.nom}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ing.unite}</span>
                          {ing.prix !== null && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ing.prix.toFixed(3)} {t('currency')}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={closeIngredients}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
