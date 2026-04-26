import { useState, useEffect, useCallback } from 'react';
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

  const franchiseCount = Math.max(0, parseInt(nombreActivites) || 0);
  const franchiseUnlocked = isFranchise && !editingId && !isDuplicate && franchiseName.trim().length > 0 && franchiseCount > 1;

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
    setSaving(true);
    setError('');
    try {
      const isFirst = activites.length === 0;
      const fn = franchiseName.trim();
      for (let i = 0; i < franchiseForms.length; i++) {
        const f = franchiseForms[i];
        await api.post('/api/entreprise/activites', {
          nom: `${fn} ${i + 1}`,
          franchiseName: fn,
          memeActivite: true,
          telephone: f.telephone,
          email: f.email || undefined,
          adresse: f.adresse,
        });
      }
      setMsg(t('client.entreprise.activity_created'));
      if (onCreated) onCreated();
      if (isFirst && user?.onboardingStep === 2) await advanceOnboarding(3);
      setTimeout(() => setMsg(''), 3000);
      closeForm();
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
        setMsg(t('client.entreprise.activity_created'));
        if (onCreated) onCreated();
        if (isFirst && user?.onboardingStep === 2) await advanceOnboarding(3);
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

  const franchiseActivities = activites.filter((a) => a.type === 'franchise');
  const distinctActivities = activites.filter((a) => a.type !== 'franchise');
  const franchiseGroupNames = Array.from(new Set(franchiseActivities.map((a) => a.franchiseGroup || a.nom))).sort();
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

      {!loading && (
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          {activites.length} {t('client.entreprise.activities_section').toLowerCase()}
        </p>
      )}

      {msg && <div className="alert alert-success">{msg}</div>}

      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : activites.length === 0 ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <button className="btn btn-primary" onClick={() => openAdd('franchise')}>
            + {t('client.entreprise.franchise_yes')}
          </button>
          <button className="btn btn-secondary" onClick={() => openAdd('distincte')}>
            + {t('client.entreprise.franchise_no')}
          </button>
        </div>
      ) : (
        <>
          {/* Franchise section */}
          {franchiseActivities.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', margin: 0 }}>
                  {t('nav.espace_franchise')} <span style={{ fontWeight: 400 }}>({franchiseActivities.length})</span>
                </h2>
                <button className="btn btn-primary btn-sm" onClick={() => openAdd('franchise')}>
                  + {t('client.entreprise.add_activity')}
                </button>
              </div>

              {/* Franchise filters */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {franchiseGroupNames.length > 1 && (
                  <select
                    className="input"
                    style={{ maxWidth: 200 }}
                    value={filterFranchiseGroup}
                    onChange={(e) => setFilterFranchiseGroup(e.target.value)}
                  >
                    <option value="">{t('client.entreprise.all_groups')}</option>
                    {franchiseGroupNames.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                )}
                <input
                  type="text"
                  className="input"
                  style={{ minWidth: 140, flex: '1 1 auto', maxWidth: 220 }}
                  placeholder={t('common.search') + '…'}
                  value={filterFranchiseName}
                  onChange={(e) => setFilterFranchiseName(e.target.value)}
                />
              </div>

              {filteredFranchise.length === 0 ? (
                <p className="text-muted">{t('common.no_result')}</p>
              ) : (
                Object.entries(franchiseGrouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, acts]) => (
                  <div key={group} style={{ marginBottom: 20 }}>
                    {franchiseGroupNames.length > 0 && (
                      <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 8 }}>
                        {group} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({acts.length})</span>
                      </h3>
                    )}
                    <div className="activites-grid">
                      {acts.map((act) => (
                        <div key={act.id} className="activite-card">
                          <div className="activite-card-header">
                            <span className="activite-nom">{act.nom}</span>
                            <div className="activite-actions">
                              <button className="btn btn-ghost btn-sm" onClick={() => openIngredients(act)}>{t('client.entreprise.manage_ingredients')}</button>
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
                  </div>
                ))
              )}
            </div>
          )}

          {/* Distinct section — always visible when any activities exist so user can add a distinct activity */}
          {(distinctActivities.length > 0 || franchiseActivities.length > 0) && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', margin: 0 }}>
                  {t('nav.espace_distinct')} <span style={{ fontWeight: 400 }}>({distinctActivities.length})</span>
                </h2>
                <button className="btn btn-secondary btn-sm" onClick={() => openAdd('distincte')}>
                  + {t('client.entreprise.add_activity')}
                </button>
              </div>

              {distinctActivities.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>{t('nav.no_distinct_activity')}</p>
              ) : (
                <>
                  {/* Distinct filter */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="input"
                      style={{ minWidth: 140, flex: '1 1 auto', maxWidth: 220 }}
                      placeholder={t('common.search') + '…'}
                      value={filterDistinctName}
                      onChange={(e) => setFilterDistinctName(e.target.value)}
                    />
                  </div>

                  {filteredDistinct.length === 0 ? (
                    <p className="text-muted">{t('common.no_result')}</p>
                  ) : (
                    <div className="activites-grid">
                      {filteredDistinct.map((act) => (
                        <div key={act.id} className="activite-card">
                          <div className="activite-card-header">
                            <span className="activite-nom">{act.nom}</span>
                            <div className="activite-actions">
                              <button className="btn btn-ghost btn-sm" onClick={() => openIngredients(act)}>{t('client.entreprise.manage_ingredients')}</button>
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
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Add / Edit form modal */}
      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
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
                    />
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

                  {/* Per-activity step form — unlocked when franchiseName + count > 1 */}
                  {franchiseUnlocked && (
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
                    />
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
                      <button type="button" className="btn btn-primary" onClick={franchiseUnlocked ? handleFranchiseSave : undefined} disabled={saving || !franchiseUnlocked}>
                        {saving ? t('common.loading') : t('common.save')}
                      </button>
                    )}
                  </>
                ) : (
                  <button type="submit" className="btn btn-primary" disabled={saving || (memeActivite === null && !editingId && !isDuplicate)}>
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
        <div className="modal-overlay" onClick={closeIngredients}>
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
