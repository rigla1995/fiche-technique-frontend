import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, ActiviteIngredient } from '../../types';

type ActiviteForm = { nom: string; franchiseName: string; adresse: string; telephone: string; email: string };
const emptyForm = (): ActiviteForm => ({ nom: '', franchiseName: '', adresse: '', telephone: '', email: '' });

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

  const openAdd = () => {
    setEditingId(null);
    setIsDuplicate(false);
    setForm(emptyForm());
    setMemeActivite(null);
    setNombreActivites('1');
    setError('');
    setShowForm(true);
  };

  const openEdit = (act: Activite) => {
    setEditingId(act.id);
    setIsDuplicate(false);
    setForm({ nom: act.nom, franchiseName: '', adresse: act.adresse || '', telephone: act.telephone || '', email: act.email || '' });
    setMemeActivite(null);
    setNombreActivites('1');
    setError('');
    setShowForm(true);
  };

  const openDuplicate = (act: Activite) => {
    setEditingId(null);
    setIsDuplicate(true);
    setForm({ nom: act.nom, franchiseName: '', adresse: '', telephone: '', email: '' });
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isFranchise && !editingId && !isDuplicate) {
      // Franchise batch creation: franchiseName + count
      if (!form.franchiseName.trim()) { setError(t('validation.name_required')); return; }
      if (form.telephone && !TUNISIAN_PHONE.test(form.telephone.replace(/\s/g, ''))) {
        setError(t('validation.phone_invalid'));
        return;
      }
      setSaving(true);
      setError('');
      try {
        const isFirst = activites.length === 0;
        await api.post('/api/entreprise/activites', {
          franchiseName: form.franchiseName.trim(),
          nombreActivites,
          memeActivite: true,
          email: form.email || undefined,
          telephone: form.telephone || undefined,
          adresse: form.adresse || undefined,
        });
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
      return;
    }

    // Single form path (edit, duplicate, or distinct)
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

      {/* Add / Edit form modal */}
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
              {/* Franchise/Distinct question — shown when adding (not editing, not duplicating) */}
              {!editingId && !isDuplicate && (
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

              {/* Franchise creation: name + count */}
              {isFranchise && !editingId && !isDuplicate && (
                <>
                  <div className="form-field" style={{ marginBottom: 12 }}>
                    <label>{t('client.entreprise.franchise_name')} *</label>
                    <input
                      type="text"
                      placeholder={t('client.entreprise.franchise_name_placeholder')}
                      value={form.franchiseName}
                      onChange={(e) => setForm((f) => ({ ...f, franchiseName: e.target.value }))}
                    />
                  </div>
                  <div className="form-field" style={{ marginBottom: 12 }}>
                    <label>{t('client.entreprise.franchise_count')}</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={nombreActivites}
                      onChange={(e) => setNombreActivites(e.target.value)}
                      style={{ width: 80 }}
                    />
                  </div>
                </>
              )}

              {/* Distinct or edit: single name field */}
              {(!isFranchise || editingId || isDuplicate) && (memeActivite !== null || editingId || isDuplicate) && (
                <div className="form-field" style={{ marginBottom: 12 }}>
                  <label>{t('client.entreprise.activity_nom')} *</label>
                  <input
                    type="text"
                    value={form.nom}
                    onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                  />
                </div>
              )}

              {/* Shared contact fields */}
              {(memeActivite !== null || editingId || isDuplicate) && (
                <>
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
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || memeActivite === null && !editingId && !isDuplicate}
                >
                  {saving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ingredient assignment modal */}
      {ingredientsActivite && (
        <div className="modal-overlay" onClick={closeIngredients}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
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
