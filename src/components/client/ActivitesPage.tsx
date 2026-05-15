import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, ActiviteIngredient, Labo, AbonnementConfig } from '../../types';

const TUNISIAN_PHONE_RE = /^(\+216[\s-]?)?[2579]\d{7}$/;

type ActiviteForm = { nom: string; adresse: string; telephone: string };
const emptyForm = (): ActiviteForm => ({ nom: '', adresse: '', telephone: '' });

interface Props {
  onCreated?: () => void;
  minimal?: boolean;
}

const TUNISIAN_PHONE = TUNISIAN_PHONE_RE;


export default function ActivitesPage({ onCreated, minimal }: Props) {
  const { t } = useTranslation();
  const { user, advanceOnboarding } = useAuth();
  const navigate = useNavigate();

  const [activites, setActivites] = useState<Activite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ActiviteForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [isDuplicate, setIsDuplicate] = useState(false);
  // Labo wizard state
  const [hasLabo, setHasLabo] = useState<boolean | null>(null);
  const [selectedLaboId, setSelectedLaboId] = useState<number | ''>('');
  const [wizardStep, setWizardStep] = useState(1); // 1=main, 2=labo, 4=recap
  const [labos, setLabos] = useState<Labo[]>([]);
  const [abonnementConfig, setAbonnementConfig] = useState<AbonnementConfig | null>(null);
  // List filter
  const [filterName, setFilterName] = useState('');
  // Labo detail popup (click on labo badge in row)
  const [laboPopup, setLaboPopup] = useState<{ nom: string; tel: string | null; adresse: string | null } | null>(null);
  // Delete labo confirmation
  const [deleteLaboTarget, setDeleteLaboTarget] = useState<Labo | null>(null);
  const [deletingLabo, setDeletingLabo] = useState(false);

  // Standalone labo add/edit modal
  const [showLaboModal, setShowLaboModal] = useState(false);
  const [editingLaboId, setEditingLaboId] = useState<number | null>(null);
  const [laboFormData, setLaboFormData] = useState({ nom: '', refLabo: '', referentTel: '', adresse: '' });
  const [laboModalStep, setLaboModalStep] = useState<1 | 2 | 3>(1);
  const [laboSelectedActivities, setLaboSelectedActivities] = useState<number[]>([]);
  const [laboSaving, setLaboSaving] = useState(false);
  const [laboError, setLaboError] = useState('');

  // Delete confirmation modal
  type DeleteTarget = { kind: 'activite'; act: Activite };
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Ingredient assignment modal
  const [ingredientsActivite, setIngredientsActivite] = useState<Activite | null>(null);
  const [ingredients, setIngredients] = useState<ActiviteIngredient[]>([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);
  const [openIngCats, setOpenIngCats] = useState<Set<string>>(new Set());

  const toggleIngCat = (cat: string) =>
    setOpenIngCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [actRes, laboRes, aboRes] = await Promise.all([
        api.get('/api/entreprise/activites'),
        api.get('/api/labo'),
        api.get('/api/abonnements/mon-abonnement').catch(() => null),
      ]);
      setActivites(actRes.data);
      setLabos(laboRes.data);
      if (aboRes?.data?.config) setAbonnementConfig(aboRes.data.config);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const maxActivites = abonnementConfig?.nbActivites ?? null;
  const maxLabos = abonnementConfig?.nbLabos ?? null;
  const atActiviteLimit = maxActivites !== null && activites.length >= maxActivites;
  const atLaboLimit = maxLabos !== null && labos.length >= maxLabos;
  const configHasLabo = maxLabos !== null && maxLabos > 0;

  const openAdd = () => {
    setEditingId(null);
    setIsDuplicate(false);
    setForm(emptyForm());
    setHasLabo(configHasLabo ? null : false);
    setSelectedLaboId('');
    setError('');
    setWizardStep(1);
    setShowForm(true);
  };

  const openEdit = (act: Activite) => {
    setEditingId(act.id);
    setIsDuplicate(false);
    setForm({ nom: act.nom, adresse: act.adresse || '', telephone: act.telephone || '' });
    setError('');
    setWizardStep(1);
    setShowForm(true);
  };

  const openDuplicate = (act: Activite) => {
    setEditingId(null);
    setIsDuplicate(true);
    setForm({ nom: act.nom, adresse: '', telephone: '' });
    setError('');
    setWizardStep(1);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setIsDuplicate(false);
    setError('');
  };

  const nameConflict = !editingId && !isDuplicate && form.nom.trim()
    ? activites.some((a) => a.nom.toLowerCase() === form.nom.trim().toLowerCase())
    : false;

  const handleLaboStepNext = () => {
    if (hasLabo === null) { setError('Veuillez choisir une option'); return; }
    if (hasLabo === true && !selectedLaboId) { setError('Veuillez sélectionner un labo'); return; }
    setError('');
    setWizardStep(4);
  };

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
        await api.put(`/api/entreprise/activites/${editingId}`, { nom: form.nom, adresse: form.adresse, telephone: form.telephone });
        setMsg(t('client.entreprise.activity_updated'));
      } else {
        const isFirst = activites.length === 0;
        const laboId: number | null =
          hasLabo === true && selectedLaboId ? Number(selectedLaboId) : null;
        const payload: Record<string, unknown> = { nom: form.nom, adresse: form.adresse, telephone: form.telephone };
        if (laboId) payload.laboId = laboId;
        await api.post('/api/entreprise/activites', payload);
        if (onCreated) onCreated();
        if (isFirst && user?.onboardingStep === 2) await advanceOnboarding(3);
        closeForm();
        // Redirect to Catalogue Global only when all subscription slots are filled
        const newActCount = activites.length + 1;
        const allActsFilled = maxActivites !== null ? newActCount >= maxActivites : isFirst;
        const allLabosFilled = (maxLabos ?? 0) === 0 || labos.length >= (maxLabos ?? 0);
        if (allActsFilled && allLabosFilled) {
          navigate('/client/catalogue-global?created=1');
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

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/entreprise/activites/${deleteTarget.act.id}`);
      setDeleteTarget(null);
      load();
    } catch { /* ignore */ }
    setDeleting(false);
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

  const closeIngredients = () => { setIngredientsActivite(null); setIngredients([]); setOpenIngCats(new Set()); };

  // ── Standalone labo modal ────────────────────────────────────────────────────
  const openAddLabo = () => {
    setEditingLaboId(null);
    setLaboFormData({ nom: '', refLabo: '', referentTel: '', adresse: '' });
    setLaboModalStep(1);
    setLaboSelectedActivities([]);
    setLaboError('');
    setShowLaboModal(true);
  };

  const openEditLabo = (labo: Labo) => {
    setEditingLaboId(labo.id);
    setLaboFormData({ nom: labo.nom, refLabo: labo.refLabo || '', referentTel: labo.referentTel || '', adresse: labo.adresse || '' });
    setLaboModalStep(1);
    setLaboError('');
    setShowLaboModal(true);
  };

  const closeLaboModal = () => { setShowLaboModal(false); setEditingLaboId(null); setLaboError(''); };

  const confirmDeleteLabo = async () => {
    if (!deleteLaboTarget) return;
    setDeletingLabo(true);
    try {
      await api.delete(`/api/labo/${deleteLaboTarget.id}`);
      setDeleteLaboTarget(null);
      window.dispatchEvent(new Event('labos-changed'));
      load();
    } catch { /* ignore */ }
    setDeletingLabo(false);
  };

  const handleLaboNext = () => {
    if (!laboFormData.nom.trim()) { setLaboError('Nom du labo requis'); return; }
    if (!editingLaboId && !laboFormData.refLabo.trim()) { setLaboError('Référence (ref labo) requise'); return; }
    if (!laboFormData.referentTel.trim()) { setLaboError('Téléphone requis'); return; }
    if (!TUNISIAN_PHONE.test(laboFormData.referentTel.replace(/\s/g, ''))) { setLaboError(t('validation.phone_invalid')); return; }
    setLaboError('');
    // Edit: skip activities step, go straight to recap; Add: show activities step
    setLaboModalStep(editingLaboId ? 3 : 2);
  };

  const saveLabo = async () => {
    setLaboSaving(true);
    setLaboError('');
    try {
      if (editingLaboId) {
        await api.put(`/api/labo/${editingLaboId}`, {
          nom: laboFormData.nom.trim(),
          referentTel: laboFormData.referentTel.trim(),
          adresse: laboFormData.adresse.trim() || undefined,
        });
      } else {
        await api.post('/api/labo', {
          nom: laboFormData.nom.trim(),
          refLabo: laboFormData.refLabo.trim(),
          referentTel: laboFormData.referentTel.trim(),
          adresse: laboFormData.adresse.trim() || undefined,
          ...(laboSelectedActivities.length > 0 ? { activityIds: laboSelectedActivities } : {}),
        });
        window.dispatchEvent(new Event('labos-changed'));
      }
      closeLaboModal();
      load();
    } catch (err: unknown) {
      const errMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setLaboError(errMsg || t('common.error'));
    }
    setLaboSaving(false);
  };

  // ── Recap step for activité modal ────────────────────────────────────────────
  const handleGoToRecap = () => {
    if (!form.nom.trim()) { setError(t('validation.name_required')); return; }
    if (form.telephone && !TUNISIAN_PHONE.test(form.telephone.replace(/\s/g, ''))) {
      setError(t('validation.phone_invalid')); return;
    }
    setError('');
    // New activité with labo config → labo selection step first
    setWizardStep(!editingId && !isDuplicate && configHasLabo ? 2 : 4);
  };

  const handleFinalSave = () => {
    submit({ preventDefault: () => {} } as React.FormEvent);
  };

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

  const filteredActivites = activites.filter((a) =>
    !filterName || a.nom.toLowerCase().includes(filterName.toLowerCase())
  );

  const usedLabos = new Set(activites.filter((a) => a.laboId).map((a) => a.laboId)).size;

  return (
    <div className={minimal ? '' : 'page-content'}>
      {!minimal && (
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1d4ed8 100%)',
          borderRadius: 18, padding: '24px 28px', marginBottom: 24,
          boxShadow: '0 8px 32px rgba(29,78,216,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏢</div>
              <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>{t('nav.activites')}</h1>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: 0 }}>
              Gérez vos points de vente et laboratoires de production
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {!loading && abonnementConfig && (
              <>
                <div style={{
                  background: atActiviteLimit ? '#fef2f2' : activites.length > 0 ? '#f0fdf4' : 'rgba(255,255,255,0.1)',
                  borderRadius: 12, padding: '10px 20px', textAlign: 'center', minWidth: 90,
                  border: `1px solid ${atActiviteLimit ? '#fecaca' : activites.length > 0 ? '#bbf7d0' : 'rgba(255,255,255,0.2)'}`,
                }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 700, color: atActiviteLimit || activites.length > 0 ? '#6b7280' : 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Activités</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: atActiviteLimit ? '#dc2626' : activites.length > 0 ? '#16a34a' : '#fff', lineHeight: 1 }}>
                    {activites.length}<span style={{ fontSize: '0.8rem', fontWeight: 600, color: atActiviteLimit || activites.length > 0 ? '#6b7280' : 'rgba(255,255,255,0.6)' }}> / {abonnementConfig.nbActivites}</span>
                  </div>
                </div>
                {abonnementConfig.nbLabos > 0 && (
                  <div style={{
                    background: atLaboLimit ? '#fef2f2' : usedLabos > 0 ? '#f5f3ff' : 'rgba(255,255,255,0.1)',
                    borderRadius: 12, padding: '10px 20px', textAlign: 'center', minWidth: 80,
                    border: `1px solid ${atLaboLimit ? '#fecaca' : usedLabos > 0 ? '#c4b5fd' : 'rgba(255,255,255,0.2)'}`,
                  }}>
                    <div style={{ fontSize: '0.66rem', fontWeight: 700, color: atLaboLimit || usedLabos > 0 ? '#6b7280' : 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Labos</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: atLaboLimit ? '#dc2626' : usedLabos > 0 ? '#7c3aed' : '#fff', lineHeight: 1 }}>
                      {usedLabos}<span style={{ fontSize: '0.8rem', fontWeight: 600, color: atLaboLimit || usedLabos > 0 ? '#6b7280' : 'rgba(255,255,255,0.6)' }}> / {abonnementConfig.nbLabos}</span>
                    </div>
                  </div>
                )}
              </>
            )}
            {!atActiviteLimit && !loading && (
              <button onClick={() => openAdd()}
                style={{ padding: '10px 22px', borderRadius: 10, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.25)' } as React.CSSProperties}>
                + Nouvelle activité
              </button>
            )}
            {atActiviteLimit && !loading && (
              <button
                onClick={() => navigate('/client/support?type=supplement')}
                style={{ background: 'rgba(251,191,36,0.2)', borderRadius: 10, padding: '8px 16px', fontSize: '0.8rem', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)', cursor: 'pointer' }}
              >
                ➕ Augmenter la capacité
              </button>
            )}
          </div>
        </div>
      )}

      {msg && <div className="alert alert-success">{msg}</div>}

      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : activites.length === 0 ? (
        <div style={{
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16,
          padding: '48px 32px', textAlign: 'center', maxWidth: 560, margin: '0 auto',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', marginBottom: 8 }}>
            Créez votre première activité
          </h2>
          <p style={{ fontSize: '0.88rem', color: '#6b7280', marginBottom: 28, lineHeight: 1.6 }}>
            {maxActivites === 1
              ? 'Votre abonnement inclut 1 activité. Renseignez son nom et son adresse pour commencer.'
              : maxLabos
                ? `Votre abonnement inclut jusqu'à ${maxActivites} activités et ${maxLabos} labo(s).`
                : `Votre abonnement inclut jusqu'à ${maxActivites} activités.`
            }
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {atActiviteLimit ? (
              <div style={{ fontSize: 13, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 16px' }}>
                🔒 Limite de {maxActivites} activité(s) atteinte
              </div>
            ) : (
              <button className="btn btn-primary" onClick={() => openAdd()}>
                + Ajouter mon activité
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Activités section */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '10px 16px', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', borderRadius: 12, border: '1px solid #bbf7d0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.1rem' }}>🏢</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#166534' }}>{t('nav.activites')}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '2px 10px' }}>
                  🏢 {activites.length} activité(s)
                </span>
              </div>
              {atActiviteLimit ? (
                <button className="btn btn-sm" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b', borderRadius: 8, fontSize: '0.75rem', padding: '5px 12px', cursor: 'pointer' }} onClick={() => navigate('/client/support?type=supplement')}>
                  ➕ Augmenter la capacité
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => openAdd()}>
                  + Nouvelle activité
                </button>
              )}
            </div>

            {/* Filter */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 auto', maxWidth: 260 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('common.activity_name', "Nom de l'activité")}</span>
                <input
                  type="text"
                  className="input"
                  style={{ minWidth: 140 }}
                  placeholder={t('common.activity_name', "Nom de l'activité") + '…'}
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                />
              </div>
            </div>

            {filteredActivites.length === 0 ? (
              <p className="text-muted">{t('common.no_result')}</p>
            ) : (
              <div className="table-responsive card" style={{ marginBottom: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('common.name')}</th>
                      <th style={{ width: 150 }}>{t('client.entreprise.activity_telephone')}</th>
                      <th>{t('client.entreprise.activity_adresse')}</th>
                      {activites.some((a) => a.laboId) && (
                        <th style={{ width: 130 }}>{t('client.entreprise.labo', 'Labo')}</th>
                      )}
                      <th style={{ width: 140, textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActivites.map((act) => (
                      <tr key={act.id}>
                        <td style={{ fontWeight: 700 }}>{act.nom}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{act.telephone || '—'}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{act.adresse || '—'}</td>
                        {activites.some((a) => a.laboId) && (
                          <td>
                            {act.laboNom ? (
                              <button
                                style={{ fontSize: '0.78rem', fontWeight: 600, color: '#7c3aed', background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 20, padding: '2px 8px', cursor: 'pointer' }}
                                onClick={() => setLaboPopup({ nom: act.laboNom!, tel: act.laboTel ?? null, adresse: act.laboAdresse ?? null })}
                              >
                                🏭 {act.laboNom}
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                            )}
                          </td>
                        )}
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {!act.laboId && (
                            <button className="btn btn-ghost btn-sm" title={t('client.entreprise.manage_ingredients')} onClick={() => openIngredients(act)}>🧂</button>
                          )}
                          <button className="btn btn-ghost btn-sm" title={t('common.edit')} onClick={() => openEdit(act)}>✏️</button>
                          <button className="btn btn-ghost btn-sm" title={t('client.entreprise.duplicate_activity')} onClick={() => openDuplicate(act)}>⧉</button>
                          <button className="btn btn-danger-ghost btn-sm" title={t('common.delete')} onClick={() => setDeleteTarget({ kind: 'activite', act })}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Labos section — visible when config includes labos */}
          {configHasLabo && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '10px 16px', background: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', borderRadius: 12, border: '1px solid #c4b5fd' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.1rem' }}>🏭</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#6d28d9' }}>Espace Labos</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 20, padding: '2px 10px' }}>
                    {labos.length} / {maxLabos} labo(s)
                  </span>
                </div>
                {atLaboLimit ? (
                  <button className="btn btn-sm" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b', borderRadius: 8, fontSize: '0.75rem', padding: '5px 12px', cursor: 'pointer' }} onClick={() => navigate('/client/support?type=supplement')}>
                    ➕ Augmenter la capacité
                  </button>
                ) : (
                  <button
                    className="btn btn-sm"
                    style={{ background: activites.length === 0 ? '#e9d5ff' : '#7c3aed', color: activites.length === 0 ? '#a855f7' : '#fff', border: 'none', borderRadius: 8, fontSize: '0.8rem', padding: '6px 14px', cursor: activites.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 700 }}
                    onClick={activites.length === 0 ? undefined : openAddLabo}
                    title={activites.length === 0 ? 'Ajoutez d\'abord une activité avant de créer un labo' : undefined}
                    disabled={activites.length === 0}
                  >
                    + Nouveau labo
                  </button>
                )}
              </div>

              {labos.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>Aucun labo créé. {!atLaboLimit && <button style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem', padding: 0, textDecoration: 'underline' }} onClick={openAddLabo}>Créer le premier labo</button>}</p>
              ) : (
                <div className="table-responsive card" style={{ marginBottom: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Nom</th>
                        <th style={{ width: 120 }}>Réf.</th>
                        <th style={{ width: 150 }}>Téléphone référent</th>
                        <th>Adresse</th>
                        <th style={{ width: 80, textAlign: 'right' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {labos.map((labo) => (
                        <tr key={labo.id}>
                          <td style={{ fontWeight: 700 }}>{labo.nom}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{labo.refLabo || '—'}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{labo.referentTel || '—'}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{labo.adresse || '—'}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => openEditLabo(labo)}>✏️</button>
                            <button className="btn btn-danger-ghost btn-sm" title="Supprimer" onClick={() => setDeleteLaboTarget(labo)}>🗑</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add / Edit form modal — step-based wizard */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="modal-header modal-header--primary">
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                  {editingId
                    ? (wizardStep === 4 ? '✅ Récapitulatif' : t('client.entreprise.edit_activity'))
                    : isDuplicate
                    ? (wizardStep === 4 ? '✅ Récapitulatif' : t('client.entreprise.duplicate_activity'))
                    : wizardStep === 4
                    ? '✅ Récapitulatif'
                    : t('client.entreprise.add_activity')}
                </h2>
                {/* Progress indicator — new activité with labo */}
                {!editingId && !isDuplicate && wizardStep >= 1 && configHasLabo && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    {[{ label: 'Infos', s: 1 }, { label: 'Labo', s: 2 }, { label: 'Récap', s: 4 }].map(({ label, s }, idx, arr) => (
                      <div key={s} style={{ display: 'flex', alignItems: 'center', gap: idx < arr.length - 1 ? 8 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.7rem', fontWeight: 800, flexShrink: 0,
                            background: wizardStep > s ? '#22c55e' : wizardStep === s ? 'white' : 'rgba(255,255,255,0.25)',
                            color: wizardStep > s ? 'white' : wizardStep === s ? 'var(--primary)' : 'rgba(255,255,255,0.6)',
                          }}>
                            {wizardStep > s ? '✓' : idx + 1}
                          </span>
                          <span style={{ fontSize: '0.72rem', fontWeight: wizardStep === s ? 700 : 400, color: wizardStep >= s ? 'white' : 'rgba(255,255,255,0.55)' }}>
                            {label}
                          </span>
                        </div>
                        {idx < arr.length - 1 && (
                          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginLeft: 3 }}>›</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="modal-close" onClick={closeForm}>✕</button>
            </div>

            <form onSubmit={submit}>

              {/* ── STEP 1: Activity info ── */}
              {wizardStep === 1 && (
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 600 }}>{t('client.entreprise.activity_nom')} *</label>
                    <input
                      type="text"
                      value={form.nom}
                      onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                      autoFocus
                      style={nameConflict ? { borderColor: 'var(--danger, #ef4444)' } : undefined}
                    />
                    {nameConflict && (
                      <p style={{ color: 'var(--danger, #ef4444)', fontSize: '0.78rem', margin: '4px 0 0' }}>
                        {t('client.entreprise.activity_name_exists', { name: form.nom.trim() })}
                      </p>
                    )}
                  </div>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 600 }}>{t('client.entreprise.activity_telephone')}</label>
                    <input
                      type="text"
                      placeholder="+216 …"
                      value={form.telephone}
                      onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
                    />
                  </div>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 600 }}>{t('client.entreprise.activity_adresse')}</label>
                    <textarea
                      value={form.adresse}
                      onChange={(e) => setForm((f) => ({ ...f, adresse: e.target.value }))}
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {/* ── STEP 2: Labo selection (new activité only) ── */}
              {wizardStep === 2 && !editingId && !isDuplicate && (
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    Cette activité sera-t-elle approvisionnée par un laboratoire ?
                  </p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <label style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px',
                      borderRadius: 12, flex: 1,
                      border: `2px solid ${hasLabo === true ? 'var(--primary)' : 'var(--border)'}`,
                      background: hasLabo === true ? 'var(--primary-light, #eef2ff)' : 'var(--surface)',
                      cursor: labos.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: labos.length === 0 ? 0.45 : 1,
                    }}>
                      <input type="radio" checked={hasLabo === true} disabled={labos.length === 0}
                        onChange={() => { setHasLabo(true); setSelectedLaboId(''); }} style={{ accentColor: 'var(--primary)', marginTop: 3 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                          🏭 Avec labo
                          {labos.length === 0 && <span style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 6 }}>(aucun labo créé)</span>}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          Approvisionnement via un laboratoire
                        </div>
                      </div>
                    </label>
                    <label style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px',
                      borderRadius: 12, flex: 1,
                      border: `2px solid ${hasLabo === false ? 'var(--primary)' : 'var(--border)'}`,
                      background: hasLabo === false ? 'var(--primary-light, #eef2ff)' : 'var(--surface)',
                      cursor: 'pointer',
                    }}>
                      <input type="radio" checked={hasLabo === false} onChange={() => { setHasLabo(false); setSelectedLaboId(''); }} style={{ accentColor: 'var(--primary)', marginTop: 3 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>📋 Sans labo</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>Gestion des ingrédients par activité</div>
                      </div>
                    </label>
                  </div>
                  {hasLabo === true && labos.length > 0 && (
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                        Sélectionner un labo *
                      </label>
                      <select className="input" style={{ width: '100%' }} value={selectedLaboId}
                        onChange={(e) => setSelectedLaboId(e.target.value === '' ? '' : Number(e.target.value))}>
                        <option value="">— Choisir un labo —</option>
                        {labos.map((l) => <option key={l.id} value={l.id}>🏭 {l.nom}{l.refLabo ? ` (${l.refLabo})` : ''}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* ── STEP 4: Recap / Confirmation ── */}
              {wizardStep === 4 && (() => {
                const laboNomRecap = hasLabo === true
                  ? (labos.find((l) => l.id === Number(selectedLaboId))?.nom || '—')
                  : null;
                const fieldLabel: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 2 };
                const row = (label: string, value: string) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={fieldLabel}>{label}</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>{value || '—'}</span>
                  </div>
                );
                return (
                  <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#64748b' }}>
                      Vérifiez les informations avant de confirmer.
                    </p>
                    {row('Nom', form.nom)}
                    {row('Téléphone', form.telephone)}
                    {row('Adresse', form.adresse)}
                    {laboNomRecap && row('Labo', laboNomRecap)}
                  </div>
                );
              })()}

              {error && (
                <p style={{ margin: '0 20px 12px', color: 'var(--danger, #ef4444)', fontSize: '0.82rem', fontWeight: 500 }}>
                  ⚠ {error}
                </p>
              )}

              {/* Footer */}
              <div className="modal-footer">
                {/* Left: Cancel or Back */}
                {wizardStep === 4 ? (
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    setError('');
                    setWizardStep(!editingId && !isDuplicate && configHasLabo ? 2 : 1);
                  }}>
                    ‹ {t('client.entreprise.previous')}
                  </button>
                ) : wizardStep <= 1 ? (
                  <button type="button" className="btn btn-secondary" onClick={closeForm}>
                    {t('common.cancel')}
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary" onClick={() => { setWizardStep(1); setError(''); }}>
                    ‹ {t('client.entreprise.previous')}
                  </button>
                )}

                {/* Right: Forward or Save */}
                {wizardStep === 4 ? (
                  <button type="button" className="btn btn-primary" onClick={handleFinalSave} disabled={saving}>
                    {saving ? t('common.loading') : '✅ Confirmer'}
                  </button>
                ) : wizardStep === 1 ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={nameConflict || !form.nom.trim()}
                    onClick={handleGoToRecap}
                  >
                    Suivant ›
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={handleLaboStepNext} disabled={hasLabo === null}>
                    Suivant ›
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
                Object.entries(ingredientGroups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => {
                  const isOpen = openIngCats.has(cat);
                  const selectedCount = items.filter((i) => i.selected).length;
                  return (
                  <div key={cat} style={{ marginBottom: 8 }}>
                    <button
                      type="button"
                      onClick={() => toggleIngCat(cat)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', borderRadius: 6, marginBottom: isOpen ? 6 : 0,
                        background: isOpen ? 'var(--primary-light, #eef2ff)' : '#f1f5f9',
                        border: `1px solid ${isOpen ? 'var(--primary)' : 'var(--border)'}`,
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: '0.75rem', transition: 'transform 0.15s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', color: 'var(--primary)' }}>▶</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', flex: 1 }}>🏷️ {cat}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {selectedCount > 0 ? `${selectedCount}/` : ''}{items.length}
                      </span>
                    </button>
                    {isOpen && (
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
                        </label>
                      ))}
                    </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={closeIngredients}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Labo detail popup */}
      {laboPopup && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>🏭 {laboPopup.nom}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setLaboPopup(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('client.entreprise.activity_telephone')}</span>
                <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{laboPopup.tel || '—'}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('client.entreprise.activity_adresse')}</span>
                <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{laboPopup.adresse || '—'}</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setLaboPopup(null)}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Standalone labo add/edit modal */}
      {showLaboModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                  {laboModalStep === 3 ? '✅ Récapitulatif' : editingLaboId ? '🏭 Modifier le labo' : '🏭 Nouveau labo'}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  {(editingLaboId
                    ? [{ label: 'Formulaire', s: 1 }, { label: 'Récap', s: 3 }]
                    : [{ label: 'Formulaire', s: 1 }, { label: 'Activités', s: 2 }, { label: 'Récap', s: 3 }]
                  ).map(({ label, s }, idx, arr) => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: idx < arr.length - 1 ? 8 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 800, background: laboModalStep > s ? '#22c55e' : laboModalStep === s ? 'white' : 'rgba(255,255,255,0.25)', color: laboModalStep > s ? 'white' : laboModalStep === s ? 'var(--primary)' : 'rgba(255,255,255,0.6)' }}>
                          {laboModalStep > s ? '✓' : idx + 1}
                        </span>
                        <span style={{ fontSize: '0.7rem', fontWeight: laboModalStep === s ? 700 : 400, color: laboModalStep >= s ? 'white' : 'rgba(255,255,255,0.55)' }}>{label}</span>
                      </div>
                      {idx < arr.length - 1 && <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginLeft: 3 }}>›</span>}
                    </div>
                  ))}
                </div>
              </div>
              <button className="modal-close" onClick={closeLaboModal}>✕</button>
            </div>

            {laboModalStep === 1 && (
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-field" style={{ marginBottom: 0 }}>
                  <label style={{ fontWeight: 600 }}>Nom du labo *</label>
                  <input type="text" className="input" value={laboFormData.nom} onChange={(e) => setLaboFormData((p) => ({ ...p, nom: e.target.value }))} placeholder="Ex: Labo Central" autoFocus />
                </div>
                {!editingLaboId && (
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 600 }}>Référence labo * <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.78rem' }}>(unique)</span></label>
                    <input type="text" className="input" value={laboFormData.refLabo} onChange={(e) => setLaboFormData((p) => ({ ...p, refLabo: e.target.value }))} placeholder="Ex: LABO-001" />
                  </div>
                )}
                <div className="form-field" style={{ marginBottom: 0 }}>
                  <label style={{ fontWeight: 600 }}>Téléphone référent * <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.78rem' }}>{t('validation.phone_hint')}</span></label>
                  <input type="text" className="input" value={laboFormData.referentTel} onChange={(e) => setLaboFormData((p) => ({ ...p, referentTel: e.target.value }))} placeholder="+216 …" />
                </div>
                <div className="form-field" style={{ marginBottom: 0 }}>
                  <label style={{ fontWeight: 600 }}>Adresse</label>
                  <textarea className="input" rows={2} value={laboFormData.adresse} onChange={(e) => setLaboFormData((p) => ({ ...p, adresse: e.target.value }))} placeholder="Adresse (optionnel)" />
                </div>
              </div>
            )}

            {laboModalStep === 2 && !editingLaboId && (
              <div className="modal-body" style={{ maxHeight: '52vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#64748b' }}>
                  Sélectionnez les activités que ce labo va gérer <span style={{ color: '#94a3b8' }}>(optionnel)</span>.
                </p>
                {activites.filter((a) => !a.laboId).length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                    Toutes les activités ont déjà un labo assigné.
                  </p>
                ) : (
                  activites.filter((a) => !a.laboId).map((act) => (
                    <label key={act.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                      cursor: 'pointer',
                      background: laboSelectedActivities.includes(act.id) ? 'var(--primary-light, #eef2ff)' : '#f8fafc',
                      border: `1px solid ${laboSelectedActivities.includes(act.id) ? 'var(--primary)' : 'var(--border)'}`,
                    }}>
                      <input
                        type="checkbox"
                        checked={laboSelectedActivities.includes(act.id)}
                        onChange={() => setLaboSelectedActivities((prev) =>
                          prev.includes(act.id) ? prev.filter((id) => id !== act.id) : [...prev, act.id]
                        )}
                        style={{ accentColor: 'var(--primary)', flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 600 }}>{act.nom}</span>
                    </label>
                  ))
                )}
              </div>
            )}

            {laboModalStep === 3 && (
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#64748b' }}>Vérifiez les informations avant de confirmer.</p>
                {[
                  { label: 'Nom', value: laboFormData.nom },
                  ...(!editingLaboId ? [{ label: 'Référence', value: laboFormData.refLabo }] : []),
                  { label: 'Téléphone', value: laboFormData.referentTel },
                  { label: 'Adresse', value: laboFormData.adresse },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>{value || '—'}</span>
                  </div>
                ))}
                {!editingLaboId && laboSelectedActivities.length > 0 && (
                  <div style={{ paddingTop: 6 }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                      Activités assignées ({laboSelectedActivities.length})
                    </span>
                    {activites.filter((a) => laboSelectedActivities.includes(a.id)).map((a) => (
                      <div key={a.id} style={{ fontSize: '0.83rem', padding: '3px 0 3px 4px', color: '#374151', borderBottom: '1px solid #f1f5f9' }}>
                        🏢 {a.nom}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {laboError && <p style={{ margin: '0 20px 12px', color: 'var(--danger, #ef4444)', fontSize: '0.82rem', fontWeight: 500 }}>⚠ {laboError}</p>}

            <div className="modal-footer">
              {laboModalStep === 1 && (
                <>
                  <button type="button" className="btn btn-secondary" onClick={closeLaboModal}>{t('common.cancel')}</button>
                  <button type="button" className="btn btn-primary" onClick={handleLaboNext}>Suivant ›</button>
                </>
              )}
              {laboModalStep === 2 && (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => { setLaboModalStep(1); setLaboError(''); }}>‹ {t('client.entreprise.previous')}</button>
                  <button type="button" className="btn btn-primary" onClick={() => setLaboModalStep(3)}>Suivant ›</button>
                </>
              )}
              {laboModalStep === 3 && (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => { setLaboModalStep(editingLaboId ? 1 : 2); setLaboError(''); }}>‹ {t('client.entreprise.previous')}</button>
                  <button type="button" className="btn btn-primary" onClick={saveLabo} disabled={laboSaving}>{laboSaving ? t('common.loading') : '✅ Confirmer'}</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete labo confirmation */}
      {deleteLaboTarget && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ color: '#dc2626', margin: 0 }}>⚠️ Supprimer le labo</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteLaboTarget(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>🏭 {deleteLaboTarget.nom}</p>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', fontSize: '0.85rem', color: '#991b1b', lineHeight: 1.6 }}>
                <p style={{ margin: '0 0 6px', fontWeight: 700 }}>⚠ Attention — impacts de la suppression :</p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Les activités liées à ce labo passeront en <strong>mode gestion séparée</strong> — chaque activité gérera ses ingrédients indépendamment.</li>
                  <li>Aucune activité ne pourra plus recevoir de transferts depuis ce labo.</li>
                </ul>
              </div>
              <p style={{ margin: 0, color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>
                {t('client.entreprise.irreversible', 'Cette action est irréversible.')}
              </p>
            </div>
            <div className="modal-footer" style={{ gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setDeleteLaboTarget(null)} disabled={deletingLabo}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-danger" onClick={confirmDeleteLabo} disabled={deletingLabo}>
                {deletingLabo ? '…' : '🗑 Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 style={{ color: '#dc2626', margin: 0 }}>⚠️ {t('client.entreprise.confirm_delete_title', 'Confirmer la suppression')}</h2>
            </div>
            <div className="modal-body">
              <p>
                {t('client.entreprise.delete_activity_warning', 'Supprimer l\'activité')} <strong>{deleteTarget.act.nom}</strong> ?
              </p>
              <p style={{ marginTop: 16, color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>
                {t('client.entreprise.irreversible', 'Cette action est irréversible.')}
              </p>
            </div>
            <div className="modal-footer" style={{ gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? '…' : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
