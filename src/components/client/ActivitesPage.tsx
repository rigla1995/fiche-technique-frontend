import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import HistoryFilterBar, { FilterField, FilterInput } from '../common/HistoryFilterBar';
import type { Activite, ActiviteIngredient, Labo, AbonnementConfig } from '../../types';

type ActiviteForm = { nom: string; adresse: string };
const emptyForm = (): ActiviteForm => ({ nom: '', adresse: '' });

type BizActForm = { nom: string; adresse: string; useLabo: boolean | null };
const emptyBizAct = (): BizActForm => ({ nom: '', adresse: '', useLabo: null });

interface Props {
  onCreated?: () => void;
  minimal?: boolean;
}

// ── Shared modal styles ──────────────────────────────────────────────────────
const sectionTitle = (color: string): React.CSSProperties => ({
  fontSize: '0.7rem', fontWeight: 800, color, textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
});
const fieldWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 0 };
const fieldLabel: React.CSSProperties = { fontSize: '0.78rem', fontWeight: 700, color: '#374151' };
const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid #f1f5f9', margin: '6px 0',
};

export default function ActivitesPage({ onCreated, minimal }: Props) {
  const { t } = useTranslation();
  const { user, advanceOnboarding } = useAuth();
  const navigate = useNavigate();

  const [activites, setActivites] = useState<Activite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [form, setForm] = useState<ActiviteForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [lockMsg, setLockMsg] = useState('');
  const flashLock = (text: string) => { setLockMsg(text); setTimeout(() => setLockMsg(''), 5000); };

  // Labo selection for activité modal (inline section)
  const [hasLabo, setHasLabo] = useState<boolean | null>(null);
  const [selectedLaboId, setSelectedLaboId] = useState<number | ''>('');

  const [labos, setLabos] = useState<Labo[]>([]);
  const [abonnementConfig, setAbonnementConfig] = useState<AbonnementConfig | null>(null);
  const [filterName, setFilterName] = useState('');
  const [laboPopup, setLaboPopup] = useState<{ nom: string; tel: string | null; adresse: string | null } | null>(null);
  const [deleteLaboTarget, setDeleteLaboTarget] = useState<Labo | null>(null);
  const [deletingLabo, setDeletingLabo] = useState(false);
  const [deleteLaboError, setDeleteLaboError] = useState('');

  // Standalone labo add/edit modal (single step)
  const [showLaboModal, setShowLaboModal] = useState(false);
  const [editingLaboId, setEditingLaboId] = useState<number | null>(null);
  const [laboFormData, setLaboFormData] = useState({ nom: '', refLabo: '', adresse: '' });
  const [laboSelectedActivities, setLaboSelectedActivities] = useState<number[]>([]);
  const [laboSaving, setLaboSaving] = useState(false);
  const [laboError, setLaboError] = useState('');

  // "Créer mon business" multi-step wizard
  const [showBizWizard, setShowBizWizard] = useState(false);
  const [bizStep, setBizStep] = useState<1 | 2>(1);
  const [bizLaboForm, setBizLaboForm] = useState({ nom: '', refLabo: '', adresse: '' });
  const [bizLaboSkip, setBizLaboSkip] = useState(false);
  const [bizActForms, setBizActForms] = useState<BizActForm[]>([emptyBizAct()]);
  const [bizSaving, setBizSaving] = useState(false);
  const [bizError, setBizError] = useState('');

  // Delete confirmation
  type DeleteTarget = { kind: 'activite'; act: Activite };
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Ingredient assignment modal
  const [ingredientsActivite, setIngredientsActivite] = useState<Activite | null>(null);
  const [ingredients, setIngredients] = useState<ActiviteIngredient[]>([]);
  const [ingredientsLoading] = useState(false);
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

  // ── Activité modal ───────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setIsDuplicate(false);
    setForm(emptyForm());
    setHasLabo(null);
    setSelectedLaboId('');
    setError('');
    setShowForm(true);
  };

  const openEdit = (act: Activite) => {
    setEditingId(act.id);
    setIsDuplicate(false);
    setForm({ nom: act.nom, adresse: act.adresse || '' });
    setHasLabo(act.laboId ? true : false);
    setSelectedLaboId(act.laboId ?? '');
    setError('');
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

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.nom.trim()) { setError(t('validation.name_required')); return; }
    // Validate labo config if labos exist
    if (labos.length > 0) {
      if (hasLabo === null) { setError('Veuillez choisir une option pour le labo'); return; }
      if (hasLabo === true && !selectedLaboId) { setError('Veuillez sélectionner un labo'); return; }
    }
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        const laboIdValue = labos.length > 0
          ? (hasLabo === true && selectedLaboId ? Number(selectedLaboId) : null)
          : undefined;
        const updatePayload: Record<string, unknown> = { nom: form.nom, adresse: form.adresse };
        if (typeof laboIdValue !== 'undefined') updatePayload.laboId = laboIdValue;
        await api.put(`/api/entreprise/activites/${editingId}`, updatePayload);
        setMsg(t('client.entreprise.activity_updated'));
        setTimeout(() => setMsg(''), 3000);
        closeForm();
        load();
      } else {
        const isFirst = activites.length === 0;
        const laboId: number | null = hasLabo === true && selectedLaboId ? Number(selectedLaboId) : null;
        const payload: Record<string, unknown> = { nom: form.nom, adresse: form.adresse };
        if (laboId) payload.laboId = laboId;
        await api.post('/api/entreprise/activites', payload);
        if (onCreated) onCreated();
        if (isFirst && user?.onboardingStep === 2) await advanceOnboarding(3);
        window.dispatchEvent(new Event('activites-changed'));
        closeForm();
        const newActCount = activites.length + 1;
        const allActsFilled = maxActivites !== null ? newActCount >= maxActivites : isFirst;
        const allLabosFilled = (maxLabos ?? 0) === 0 || labos.length >= (maxLabos ?? 0);
        if (allActsFilled && allLabosFilled) {
          // Étape suivante logique : créer les articles dans le Référentiel (débloqué dès la 1ʳᵉ activité/labo).
          navigate('/client/referentiel/unites');
          return;
        }
        setMsg(t('client.entreprise.activity_created'));
        setTimeout(() => setMsg(''), 3000);
        load();
      }
    } catch (err: unknown) {
      const errMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(errMsg || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/entreprise/activites/${deleteTarget.act.id}`);
      setDeleteTarget(null);
      window.dispatchEvent(new Event('activites-changed'));
      load();
    } catch { /* ignore */ }
    setDeleting(false);
  };

  const closeIngredients = () => { setIngredientsActivite(null); setIngredients([]); setOpenIngCats(new Set()); };

  // ── Labo modal ───────────────────────────────────────────────────────────
  const openAddLabo = () => {
    setEditingLaboId(null);
    setLaboFormData({ nom: '', refLabo: '', adresse: '' });
    setLaboSelectedActivities([]);
    setLaboError('');
    setShowLaboModal(true);
  };

  const openEditLabo = (labo: Labo) => {
    setEditingLaboId(labo.id);
    setLaboFormData({ nom: labo.nom, refLabo: labo.refLabo || '', adresse: labo.adresse || '' });
    setLaboError('');
    setShowLaboModal(true);
  };

  const closeLaboModal = () => { setShowLaboModal(false); setEditingLaboId(null); setLaboError(''); };

  const confirmDeleteLabo = async () => {
    if (!deleteLaboTarget) return;
    setDeletingLabo(true);
    setDeleteLaboError('');
    try {
      await api.delete(`/api/labo/${deleteLaboTarget.id}`);
      setDeleteLaboTarget(null);
      setDeleteLaboError('');
      window.dispatchEvent(new Event('labos-changed'));
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteLaboError(msg || 'Erreur lors de la suppression');
    }
    setDeletingLabo(false);
  };

  const saveLabo = async () => {
    if (!laboFormData.nom.trim()) { setLaboError('Nom du labo requis'); return; }
    if (!editingLaboId && !laboFormData.refLabo.trim()) { setLaboError('Référence requise'); return; }
    setLaboSaving(true);
    setLaboError('');
    try {
      if (editingLaboId) {
        await api.put(`/api/labo/${editingLaboId}`, {
          nom: laboFormData.nom.trim(),
          adresse: laboFormData.adresse.trim() || undefined,
        });
      } else {
        await api.post('/api/labo', {
          nom: laboFormData.nom.trim(),
          refLabo: laboFormData.refLabo.trim(),
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

  // ── Business Wizard ──────────────────────────────────────────────────────
  const openBizWizard = () => {
    setBizLaboForm({ nom: '', refLabo: '', adresse: '' });
    setBizLaboSkip(false);
    setBizActForms([emptyBizAct()]);
    setBizError('');
    setBizStep(configHasLabo ? 1 : 2);
    setShowBizWizard(true);
  };

  const closeBizWizard = () => { setShowBizWizard(false); setBizError(''); };

  const bizNextStep = () => {
    if (!bizLaboSkip) {
      if (!bizLaboForm.nom.trim()) { setBizError('Nom du labo requis'); return; }
      if (!bizLaboForm.refLabo.trim()) { setBizError('Référence requise'); return; }
    }
    setBizError('');
    setBizStep(2);
  };

  const bizAddSlot = () => {
    if (maxActivites === null || bizActForms.length < maxActivites) {
      setBizActForms((p) => [...p, emptyBizAct()]);
    }
  };

  const bizRemoveSlot = (idx: number) => {
    if (bizActForms.length <= 1) return;
    setBizActForms((p) => p.filter((_, i) => i !== idx));
  };

  const bizSaveAll = async () => {
    const validActs = bizActForms.filter((f) => f.nom.trim());
    setBizSaving(true);
    setBizError('');
    try {
      let createdLaboId: number | null = null;
      if (configHasLabo && !bizLaboSkip && bizLaboForm.nom.trim() && bizLaboForm.refLabo.trim()) {
        const res = await api.post('/api/labo', {
          nom: bizLaboForm.nom.trim(),
          refLabo: bizLaboForm.refLabo.trim(),
          adresse: bizLaboForm.adresse.trim() || undefined,
        });
        createdLaboId = res.data?.id ?? null;
        window.dispatchEvent(new Event('labos-changed'));
      }
      const isFirst = activites.length === 0;
      for (const act of validActs) {
        const payload: Record<string, unknown> = { nom: act.nom.trim(), adresse: act.adresse.trim() };
        if (createdLaboId && act.useLabo === true) payload.laboId = createdLaboId;
        await api.post('/api/entreprise/activites', payload);
      }
      if (validActs.length > 0 && onCreated) onCreated();
      if (validActs.length > 0 && isFirst && user?.onboardingStep === 2) await advanceOnboarding(3);
      if (validActs.length > 0) window.dispatchEvent(new Event('activites-changed'));
      closeBizWizard();
      await load();
    } catch (err: unknown) {
      const errMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setBizError(errMsg || t('common.error'));
    }
    setBizSaving(false);
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
  const filteredLabos = labos.filter((l) =>
    !filterName || l.nom.toLowerCase().includes(filterName.toLowerCase())
  );

  const usedLabos = new Set(activites.filter((a) => a.laboId).map((a) => a.laboId)).size;

  // Show empty-state card only when truly nothing exists
  const showEmptyCard = !loading && activites.length === 0 && labos.length === 0;
  // Show full layout when at least one thing exists
  const showFullLayout = !loading && (activites.length > 0 || labos.length > 0);

  return (
    <div className={minimal ? '' : 'page-content'}>
      {!minimal && (
        <div style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #4338ca 45%, #7e22ce 80%, #a855f7 100%)',
          borderRadius: 18, padding: '24px 28px', marginBottom: 24,
          boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
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
          </div>
        </div>
      )}

      {msg && <div className="alert alert-success">{msg}</div>}

      {lockMsg && (
        <div style={{ position: 'fixed', top: 76, left: '50%', transform: 'translateX(-50%)', zIndex: 2000, background: '#fffbeb', border: '1.5px solid #fcd34d', color: '#92400e', borderRadius: 12, padding: '12px 16px', fontSize: '0.88rem', fontWeight: 600, boxShadow: '0 8px 28px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 520 }}>
          <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>🔒</span>
          <span style={{ flex: 1 }}>{lockMsg}</span>
          <button onClick={() => setLockMsg('')} style={{ background: 'none', border: 'none', color: '#92400e', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : showEmptyCard ? (
        /* ── TRUE empty state (0 activités + 0 labos) ── */
        <div style={{
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20,
          padding: '52px 36px', textAlign: 'center', maxWidth: 580, margin: '0 auto',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: 52, marginBottom: 18 }}>🚀</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', marginBottom: 10 }}>
            Démarrez votre activité
          </h2>
          <p style={{ fontSize: '0.88rem', color: '#6b7280', marginBottom: 32, lineHeight: 1.7, maxWidth: 400, margin: '0 auto 32px' }}>
            {configHasLabo
              ? `Votre abonnement inclut jusqu'à ${maxActivites} activité(s) et ${maxLabos} labo(s). Configurez votre business en quelques étapes.`
              : `Votre abonnement inclut jusqu'à ${maxActivites} activité(s). Créez votre première activité pour commencer.`
            }
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {atActiviteLimit ? (
              <div style={{ fontSize: 13, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 16px' }}>
                🔒 Limite atteinte
              </div>
            ) : configHasLabo ? (
              <button
                style={{
                  padding: '13px 28px', borderRadius: 12, background: 'linear-gradient(135deg, #1e3a8a 0%, #4338ca 45%, #7e22ce 80%, #a855f7 100%)',
                  color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
                  border: 'none', boxShadow: '0 4px 16px rgba(67,56,202,0.35)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onClick={openBizWizard}
              >
                ✨ Créer mon business
              </button>
            ) : (
              <button className="btn btn-primary" style={{ padding: '11px 26px', fontWeight: 700 }} onClick={() => openAdd()}>
                + Ajouter mon activité
              </button>
            )}
          </div>
        </div>
      ) : showFullLayout ? (
        <>
          {/* Barre de filtres (composant partagé, mode direct) */}
          <HistoryFilterBar
            accent="#059669" accentDark="#047857"
            subtitle={`${filteredActivites.length + filteredLabos.length} résultat${(filteredActivites.length + filteredLabos.length) !== 1 ? 's' : ''}`}
            onReset={() => setFilterName('')} showReset={!!filterName}
          >
            <FilterField label="🔍 Nom">
              <FilterInput type="text" placeholder="Filtrer activités et labos…" value={filterName} onChange={(e) => setFilterName(e.target.value)} />
            </FilterField>
          </HistoryFilterBar>

          {/* Activités section */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '10px 16px', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', borderRadius: 12, border: '1px solid #bfdbfe' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.1rem' }}>🏢</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e40af' }}>{t('nav.activites')}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, padding: '2px 10px' }}>
                  {activites.length}{maxActivites !== null ? ` / ${maxActivites}` : ''} activité(s)
                </span>
              </div>
              {!atActiviteLimit ? (
                <button className="btn btn-primary btn-sm" onClick={() => openAdd()}>
                  + Nouvelle activité
                </button>
              ) : (
                <button className="btn btn-sm" title="Demander l'ajout d'activités" onClick={() => navigate('/client/support?type=supplement')}
                  style={{ background: '#1e40af', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.8rem', padding: '6px 14px', cursor: 'pointer', fontWeight: 700 }}>
                  ⚡ Ajouter activités
                </button>
              )}
            </div>

            {activites.length === 0 ? (
              <div style={{ background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 12, padding: '24px', textAlign: 'center' }}>
                <p style={{ color: '#6b7280', fontSize: '0.88rem', margin: '0 0 12px' }}>Aucune activité créée.</p>
                {!atActiviteLimit && (
                  <button className="btn btn-primary btn-sm" onClick={() => openAdd()}>+ Ajouter une activité</button>
                )}
              </div>
            ) : filteredActivites.length === 0 ? (
              <p className="text-muted">{t('common.no_result')}</p>
            ) : (
              <div className="table-responsive card" style={{ marginBottom: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('common.name')}</th>
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
                          <button className="btn btn-ghost btn-sm" title={t('common.edit')} onClick={() => openEdit(act)}>✏️</button>
                          {(() => {
                            const locked = (act.ingredientCount ?? 0) > 0;
                            return (
                              <button className="btn btn-danger-ghost btn-sm"
                                title={locked ? 'Suppression impossible : des articles sont affectés à cette activité.' : t('common.delete')}
                                onClick={() => locked
                                  ? flashLock("Suppression impossible : des articles sont affectés à cette activité. Retirez d'abord ces articles pour pouvoir la supprimer.")
                                  : setDeleteTarget({ kind: 'activite', act })}>🗑</button>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Labos section */}
          {configHasLabo && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '10px 16px', background: 'linear-gradient(135deg,#faf5ff,#ede9fe)', borderRadius: 12, border: '1px solid #a78bfa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.1rem' }}>🏭</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#7e22ce' }}>Espace Labos</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', background: '#faf5ff', border: '1px solid #a78bfa', borderRadius: 20, padding: '2px 10px' }}>
                    {labos.length} / {maxLabos} labo(s)
                  </span>
                </div>
                {!atLaboLimit ? (
                  <button
                    className="btn btn-sm"
                    style={{ background: '#7e22ce', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.8rem', padding: '6px 14px', cursor: 'pointer', fontWeight: 700 }}
                    onClick={openAddLabo}
                  >
                    + Nouveau labo
                  </button>
                ) : (
                  <button className="btn btn-sm" title="Demander l'ajout de labos" onClick={() => navigate('/client/support?type=supplement')}
                    style={{ background: '#7e22ce', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.8rem', padding: '6px 14px', cursor: 'pointer', fontWeight: 700 }}>
                    ⚡ Ajouter labos
                  </button>
                )}
              </div>

              {labos.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                  Aucun labo créé.{' '}
                  {!atLaboLimit && (
                    <button style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem', padding: 0, textDecoration: 'underline' }} onClick={openAddLabo}>
                      Créer le premier labo
                    </button>
                  )}
                </p>
              ) : filteredLabos.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>{t('common.no_result')}</p>
              ) : (
                <div className="table-responsive card" style={{ marginBottom: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Nom</th>
                        <th style={{ width: 120 }}>Réf.</th>
                        <th>Adresse</th>
                        <th style={{ width: 80, textAlign: 'right' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLabos.map((labo) => (
                        <tr key={labo.id}>
                          <td style={{ fontWeight: 700 }}>{labo.nom}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{labo.refLabo || '—'}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{labo.adresse || '—'}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => openEditLabo(labo)}>✏️</button>
                            {(() => {
                              const locked = (labo.ingredientCount ?? 0) > 0;
                              return (
                                <button className="btn btn-danger-ghost btn-sm"
                                  title={locked ? 'Suppression impossible : des articles sont affectés à ce labo.' : 'Supprimer'}
                                  onClick={() => locked
                                    ? flashLock("Suppression impossible : des articles sont affectés à ce labo. Retirez d'abord ces articles pour pouvoir le supprimer.")
                                    : setDeleteLaboTarget(labo)}>🗑</button>
                              );
                            })()}
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
      ) : null}

      {/* ── Activité modal (single-step, modern) ── */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480, borderRadius: 16, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 55%, #3b82f6 100%)',
              padding: '22px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  {editingId ? 'Modification' : isDuplicate ? 'Duplication' : 'Nouvelle'}
                </div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>
                  {editingId ? t('client.entreprise.edit_activity') : isDuplicate ? t('client.entreprise.duplicate_activity') : t('client.entreprise.add_activity')}
                </h2>
              </div>
              <button
                onClick={closeForm}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '1rem', cursor: 'pointer', padding: '6px 10px', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={submit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '22px 24px' }}>

                {/* Nom */}
                <div style={fieldWrap}>
                  <label style={fieldLabel}>{t('client.entreprise.activity_nom')} <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="text" className="input"
                    value={form.nom}
                    onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                    autoFocus
                    placeholder="Ex: Point de vente Tunis"
                    style={nameConflict ? { borderColor: '#ef4444' } : undefined}
                  />
                  {nameConflict && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>
                      {t('client.entreprise.activity_name_exists', { name: form.nom.trim() })}
                    </span>
                  )}
                </div>

                {/* Adresse */}
                <div style={fieldWrap}>
                  <label style={fieldLabel}>{t('client.entreprise.activity_adresse')}</label>
                  <textarea
                    className="input" rows={2}
                    value={form.adresse}
                    onChange={(e) => setForm((f) => ({ ...f, adresse: e.target.value }))}
                    placeholder="Adresse (optionnel)"
                    style={{ resize: 'none' }}
                  />
                </div>

                {/* Labo config — when labos exist (create or edit) */}
                {labos.length > 0 && (
                  <>
                    <div style={dividerStyle} />
                    <div>
                      <div style={sectionTitle('#6d28d9')}>
                        <span>🏭</span> Configuration laboratoire
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <label style={{
                          flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                          padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                          border: `2px solid ${hasLabo === true ? '#7c3aed' : '#e5e7eb'}`,
                          background: hasLabo === true ? '#faf5ff' : '#f9fafb',
                          transition: 'all 0.15s',
                        }}>
                          <input type="radio" checked={hasLabo === true}
                            onChange={() => { setHasLabo(true); setSelectedLaboId(''); }}
                            style={{ accentColor: '#7c3aed', flexShrink: 0 }}
                          />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1f2937' }}>🏭 Avec labo</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 1 }}>Approvisionnement via labo</div>
                          </div>
                        </label>
                        <label style={{
                          flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                          padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                          border: `2px solid ${hasLabo === false ? '#7c3aed' : '#e5e7eb'}`,
                          background: hasLabo === false ? '#faf5ff' : '#f9fafb',
                          transition: 'all 0.15s',
                        }}>
                          <input type="radio" checked={hasLabo === false}
                            onChange={() => { setHasLabo(false); setSelectedLaboId(''); }}
                            style={{ accentColor: '#7c3aed', flexShrink: 0 }}
                          />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1f2937' }}>📋 Sans labo</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 1 }}>Gestion par activité</div>
                          </div>
                        </label>
                      </div>
                      {hasLabo === true && (
                        <div style={{ marginTop: 10 }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>
                            Sélectionner un labo *
                          </label>
                          <select className="input" style={{ width: '100%' }} value={selectedLaboId}
                            onChange={(e) => setSelectedLaboId(e.target.value === '' ? '' : Number(e.target.value))}>
                            <option value="">— Choisir —</option>
                            {labos.map((l) => <option key={l.id} value={l.id}>🏭 {l.nom}{l.refLabo ? ` (${l.refLabo})` : ''}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {error && (
                <div style={{ margin: '0 24px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: '0.82rem', fontWeight: 500 }}>
                  ⚠ {error}
                </div>
              )}

              <div className="modal-footer" style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9' }}>
                <button type="button" className="btn btn-secondary" onClick={closeForm}>{t('common.cancel')}</button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || nameConflict || !form.nom.trim()}
                  style={{ minWidth: 120, fontWeight: 700 }}
                >
                  {saving ? t('common.loading') : editingId ? '💾 Enregistrer' : '+ Créer l\'activité'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Ingredient assignment modal ── */}
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
                      <button type="button" onClick={() => toggleIngCat(cat)} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', borderRadius: 6, marginBottom: isOpen ? 6 : 0,
                        background: isOpen ? 'var(--primary-light, #eef2ff)' : '#f1f5f9',
                        border: `1px solid ${isOpen ? 'var(--primary)' : 'var(--border)'}`,
                        cursor: 'pointer', textAlign: 'left',
                      }}>
                        <span style={{ fontSize: '0.75rem', transition: 'transform 0.15s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', color: 'var(--primary)' }}>▶</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', flex: 1 }}>🏷️ {cat}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{selectedCount > 0 ? `${selectedCount}/` : ''}{items.length}</span>
                      </button>
                      {isOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {items.map((ing) => (
                            <label key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: ing.selected ? 'var(--primary-light, #eef2ff)' : 'transparent' }}>
                              <input type="checkbox" checked={ing.selected} onChange={() => toggleIngredient(ing.id)} />
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

      {/* ── Labo detail popup ── */}
      {laboPopup && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>🏭 {laboPopup.nom}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setLaboPopup(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Adresse</span>
                <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{laboPopup.adresse || '—'}</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setLaboPopup(null)}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Labo add/edit modal (single-step, modern) ── */}
      {showLaboModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480, borderRadius: 16, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>

            <div style={{
              background: 'linear-gradient(135deg, #3b0764 0%, #7e22ce 55%, #a855f7 100%)',
              padding: '22px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  {editingLaboId ? 'Modification' : 'Nouveau'}
                </div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>
                  🏭 {editingLaboId ? 'Modifier le labo' : 'Nouveau labo'}
                </h2>
              </div>
              <button
                onClick={closeLaboModal}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '1rem', cursor: 'pointer', padding: '6px 10px', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '22px 24px', maxHeight: '62vh', overflowY: 'auto' }}>

              {/* Nom */}
              <div style={fieldWrap}>
                <label style={fieldLabel}>Nom du labo <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="text" className="input" value={laboFormData.nom}
                  onChange={(e) => setLaboFormData((p) => ({ ...p, nom: e.target.value }))}
                  placeholder="Ex: Labo Central" autoFocus />
              </div>

              {/* Ref labo (new only) */}
              {!editingLaboId && (
                <div style={fieldWrap}>
                  <label style={fieldLabel}>
                    Référence <span style={{ color: '#ef4444' }}>*</span>
                    <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: '0.72rem', marginLeft: 5 }}>(unique)</span>
                  </label>
                  <input type="text" className="input" value={laboFormData.refLabo}
                    onChange={(e) => setLaboFormData((p) => ({ ...p, refLabo: e.target.value }))}
                    placeholder="Ex: LABO-001" />
                </div>
              )}

              {/* Adresse */}
              <div style={fieldWrap}>
                <label style={fieldLabel}>Adresse</label>
                <textarea className="input" rows={2} value={laboFormData.adresse}
                  onChange={(e) => setLaboFormData((p) => ({ ...p, adresse: e.target.value }))}
                  placeholder="Adresse (optionnel)" style={{ resize: 'none' }} />
              </div>

              {/* Activités assignment — only when creating and activités exist */}
              {!editingLaboId && activites.length > 0 && (
                <>
                  <div style={dividerStyle} />
                  <div>
                    <div style={sectionTitle('#1d4ed8')}>
                      <span>🏢</span> Assigner des activités
                      <span style={{ fontWeight: 400, color: '#6b7280', textTransform: 'none', fontSize: '0.7rem', marginLeft: 4 }}>(optionnel)</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {activites.filter((a) => !a.laboId).length === 0 ? (
                        <p style={{ color: '#9ca3af', fontSize: '0.82rem', fontStyle: 'italic', margin: 0 }}>
                          Toutes les activités ont déjà un labo assigné.
                        </p>
                      ) : (
                        activites.filter((a) => !a.laboId).map((act) => (
                          <label key={act.id} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                            cursor: 'pointer',
                            background: laboSelectedActivities.includes(act.id) ? '#eff6ff' : '#f8fafc',
                            border: `1px solid ${laboSelectedActivities.includes(act.id) ? '#93c5fd' : '#e5e7eb'}`,
                            transition: 'all 0.12s',
                          }}>
                            <input type="checkbox"
                              checked={laboSelectedActivities.includes(act.id)}
                              onChange={() => setLaboSelectedActivities((prev) =>
                                prev.includes(act.id) ? prev.filter((id) => id !== act.id) : [...prev, act.id]
                              )}
                              style={{ accentColor: '#2563eb', flexShrink: 0 }}
                            />
                            <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 600, color: '#1f2937' }}>🏢 {act.nom}</span>
                            {act.adresse && <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{act.adresse}</span>}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {laboError && (
              <div style={{ margin: '0 24px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: '0.82rem', fontWeight: 500 }}>
                ⚠ {laboError}
              </div>
            )}

            <div className="modal-footer" style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9' }}>
              <button type="button" className="btn btn-secondary" onClick={closeLaboModal}>{t('common.cancel')}</button>
              <button type="button" className="btn btn-primary" onClick={saveLabo} disabled={laboSaving} style={{ minWidth: 120, fontWeight: 700, background: '#7c3aed', borderColor: '#7c3aed' }}>
                {laboSaving ? t('common.loading') : editingLaboId ? '💾 Enregistrer' : '+ Créer le labo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── "Créer mon business" wizard ── */}
      {showBizWizard && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 540, borderRadius: 20, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>

            {/* Wizard header */}
            <div style={{
              background: bizStep === 1
                ? 'linear-gradient(135deg, #3b0764 0%, #7e22ce 55%, #a855f7 100%)'
                : 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 55%, #3b82f6 100%)',
              padding: '24px 28px',
              transition: 'background 0.3s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
                    Configuration initiale
                  </div>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>
                    ✨ Créer mon business
                  </h2>
                </div>
                <button onClick={closeBizWizard} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '1rem', cursor: 'pointer', padding: '6px 10px' }}>✕</button>
              </div>

              {/* Step indicators */}
              {configHasLabo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  {[
                    { step: 1, label: 'Laboratoire', icon: '🏭' },
                    { step: 2, label: 'Activités', icon: '🏢' },
                  ].map(({ step, label, icon }, idx) => (
                    <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: bizStep > step ? '#22c55e' : bizStep === step ? '#fff' : 'rgba(255,255,255,0.12)',
                          fontSize: bizStep > step ? '0.8rem' : '0.72rem', fontWeight: 800,
                          color: bizStep > step ? '#fff' : bizStep === step ? '#0f172a' : 'rgba(255,255,255,0.4)',
                          flexShrink: 0,
                        }}>
                          {bizStep > step ? '✓' : icon}
                        </div>
                        <span style={{ fontSize: '0.78rem', fontWeight: bizStep === step ? 700 : 400, color: bizStep >= step ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                          {label}
                        </span>
                      </div>
                      {idx < 1 && (
                        <div style={{ width: 32, height: 2, background: bizStep > step ? '#22c55e' : 'rgba(255,255,255,0.15)', margin: '0 8px' }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step 1 — Labo */}
            {bizStep === 1 && configHasLabo && (
              <div className="modal-body" style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={sectionTitle('#7c3aed')}><span>🏭</span> Créez votre laboratoire</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#6b7280', cursor: 'pointer' }}>
                    <input type="checkbox" checked={bizLaboSkip} onChange={(e) => { setBizLaboSkip(e.target.checked); setBizError(''); }}
                      style={{ accentColor: '#7c3aed' }} />
                    Passer cette étape
                  </label>
                </div>

                {!bizLaboSkip && (
                  <>
                    <div style={fieldWrap}>
                      <label style={fieldLabel}>Nom du labo <span style={{ color: '#ef4444' }}>*</span></label>
                      <input type="text" className="input" value={bizLaboForm.nom}
                        onChange={(e) => setBizLaboForm((p) => ({ ...p, nom: e.target.value }))}
                        placeholder="Ex: Labo Central" autoFocus />
                    </div>
                    <div style={fieldWrap}>
                      <label style={fieldLabel}>Référence <span style={{ color: '#ef4444' }}>*</span>
                        <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: '0.72rem', marginLeft: 5 }}>(unique)</span>
                      </label>
                      <input type="text" className="input" value={bizLaboForm.refLabo}
                        onChange={(e) => setBizLaboForm((p) => ({ ...p, refLabo: e.target.value }))}
                        placeholder="Ex: LABO-001" />
                    </div>
                    <div style={fieldWrap}>
                      <label style={fieldLabel}>Adresse</label>
                      <textarea className="input" rows={2} value={bizLaboForm.adresse}
                        onChange={(e) => setBizLaboForm((p) => ({ ...p, adresse: e.target.value }))}
                        placeholder="Adresse (optionnel)" style={{ resize: 'none' }} />
                    </div>
                  </>
                )}
                {bizLaboSkip && (
                  <div style={{ background: '#f8fafc', border: '1px dashed #d1d5db', borderRadius: 10, padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
                    Étape ignorée — vous pourrez créer un labo plus tard
                  </div>
                )}
              </div>
            )}

            {/* Step 2 — Activités */}
            {bizStep === 2 && (
              <div className="modal-body" style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '55vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={sectionTitle('#1e40af')}><span>🏢</span> Créez vos activités</div>
                  {maxActivites !== null && (
                    <span style={{ fontSize: '0.72rem', color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 20, padding: '2px 10px' }}>
                      {bizActForms.filter(f => f.nom.trim()).length} / {maxActivites}
                    </span>
                  )}
                </div>

                {bizActForms.map((af, idx) => (
                  <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        Activité {idx + 1}
                      </span>
                      {bizActForms.length > 1 && (
                        <button type="button" onClick={() => bizRemoveSlot(idx)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 6px', borderRadius: 4 }}>
                          ✕ Retirer
                        </button>
                      )}
                    </div>
                    <div style={fieldWrap}>
                      <label style={fieldLabel}>Nom <span style={{ color: '#ef4444' }}>*</span></label>
                      <input type="text" className="input" value={af.nom}
                        onChange={(e) => setBizActForms((p) => p.map((f, i) => i === idx ? { ...f, nom: e.target.value } : f))}
                        placeholder="Ex: Point de vente Tunis"
                        autoFocus={idx === 0} />
                    </div>
                    <div style={fieldWrap}>
                      <label style={fieldLabel}>Adresse</label>
                      <input type="text" className="input" value={af.adresse}
                        onChange={(e) => setBizActForms((p) => p.map((f, i) => i === idx ? { ...f, adresse: e.target.value } : f))}
                        placeholder="Adresse (optionnel)" />
                    </div>
                    {/* Labo config — only when labo is being created */}
                    {!bizLaboSkip && bizLaboForm.nom.trim() && (
                      <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                          🏭 Laboratoire
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <label style={{
                            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                            padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                            border: `1.5px solid ${af.useLabo === true ? '#7c3aed' : '#e5e7eb'}`,
                            background: af.useLabo === true ? '#faf5ff' : '#f9fafb',
                          }}>
                            <input type="radio" checked={af.useLabo === true}
                              onChange={() => setBizActForms((p) => p.map((f, i) => i === idx ? { ...f, useLabo: true } : f))}
                              style={{ accentColor: '#7c3aed', flexShrink: 0 }} />
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1f2937' }}>🏭 Avec labo</div>
                              <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{bizLaboForm.nom}</div>
                            </div>
                          </label>
                          <label style={{
                            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                            padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                            border: `1.5px solid ${af.useLabo === false ? '#7c3aed' : '#e5e7eb'}`,
                            background: af.useLabo === false ? '#faf5ff' : '#f9fafb',
                          }}>
                            <input type="radio" checked={af.useLabo === false}
                              onChange={() => setBizActForms((p) => p.map((f, i) => i === idx ? { ...f, useLabo: false } : f))}
                              style={{ accentColor: '#7c3aed', flexShrink: 0 }} />
                            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1f2937' }}>📋 Sans labo</div>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {(maxActivites === null || bizActForms.length < maxActivites) && (
                  <button type="button" onClick={bizAddSlot}
                    style={{ background: 'none', border: '1px dashed #1e40af', color: '#1e40af', borderRadius: 10, padding: '10px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', width: '100%' }}>
                    + Ajouter une activité
                  </button>
                )}
              </div>
            )}

            {bizError && (
              <div style={{ margin: '0 28px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: '0.82rem', fontWeight: 500 }}>
                ⚠ {bizError}
              </div>
            )}

            <div className="modal-footer" style={{ padding: '14px 28px', borderTop: '1px solid #f1f5f9', gap: 10 }}>
              {bizStep === 1 ? (
                <>
                  <button type="button" className="btn btn-secondary" onClick={closeBizWizard}>{t('common.cancel')}</button>
                  <button type="button" className="btn btn-primary" onClick={bizNextStep} style={{ minWidth: 130, fontWeight: 700, background: '#7c3aed', borderColor: '#7c3aed' }}>
                    Activités →
                  </button>
                </>
              ) : (
                <>
                  {configHasLabo && (
                    <button type="button" className="btn btn-secondary" onClick={() => { setBizStep(1); setBizError(''); }}>
                      ‹ Retour
                    </button>
                  )}
                  {!configHasLabo && (
                    <button type="button" className="btn btn-secondary" onClick={closeBizWizard}>{t('common.cancel')}</button>
                  )}
                  <button type="button" className="btn btn-primary" onClick={bizSaveAll} disabled={bizSaving}
                    style={{ minWidth: 140, fontWeight: 700, background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', borderColor: '#1e3a8a' }}>
                    {bizSaving ? '…' : '✅ Enregistrer tout'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete labo confirmation ── */}
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
                  <li>Les activités liées à ce labo passeront en <strong>mode gestion séparée</strong>.</li>
                  <li>Aucune activité ne pourra plus recevoir de transferts depuis ce labo.</li>
                </ul>
              </div>
              <p style={{ margin: 0, color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>
                {t('client.entreprise.irreversible', 'Cette action est irréversible.')}
              </p>
              {deleteLaboError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: '0.82rem', fontWeight: 500 }}>
                  ⚠ {deleteLaboError}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => { setDeleteLaboTarget(null); setDeleteLaboError(''); }} disabled={deletingLabo}>{t('common.cancel')}</button>
              <button className="btn btn-danger" onClick={confirmDeleteLabo} disabled={deletingLabo}>
                {deletingLabo ? '…' : '🗑 Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete activité confirmation ── */}
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
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>{t('common.cancel')}</button>
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
