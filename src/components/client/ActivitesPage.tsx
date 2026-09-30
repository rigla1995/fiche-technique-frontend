import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import GuideButton from './GuideButton';
import { useAuth } from '../../context/AuthContext';
import { useVocabulaire } from '../../hooks/useVocabulaire';
import HistoryFilterBar, { FilterField, FilterInput } from '../common/HistoryFilterBar';
import type { Activite, ActiviteIngredient, Labo, AbonnementConfig, Composant, UniteOperationnelleFields } from '../../types';

type ActiviteForm = { nom: string; adresse: string; composantId: number | null };
const emptyForm = (): ActiviteForm => ({ nom: '', adresse: '', composantId: null });

type BizActForm = { nom: string; adresse: string; useLabo: boolean | null; composantId: number | null };
const emptyBizAct = (): BizActForm => ({ nom: '', adresse: '', useLabo: null, composantId: null });

type LaboForm = { nom: string; refLabo: string; adresse: string; composantId: number | null; laboParentId: number | '' };
const emptyLaboForm = (): LaboForm => ({ nom: '', refLabo: '', adresse: '', composantId: null, laboParentId: '' });

// Lot 1b — composants du domaine (Restaurant, Bar, Cuisine, Économat…) : menu trié
// comme le serveur (ordre, id). Le select composant n'est rendu QUE si le domaine a
// ≥ 2 composants ACTIFS du type technique ; sinon le défaut est envoyé silencieusement
// (aucun changement visuel pour un compte restauration à 1 composant par type).
const composantsActifs = (all: Composant[] | undefined | null, type: 'activite' | 'labo'): Composant[] =>
  (all ?? [])
    .filter((c) => c.actif !== false && c.typeTechnique === type && typeof c.id === 'number')
    .slice()
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || (a.id ?? 0) - (b.id ?? 0));
const composantLabel = (c: Composant): string => `${c.icone ? `${c.icone} ` : ''}${c.libelle}`;
// Répartition informative « 1 Restaurant · 0 Bar » (unités sans composant imputées au 1er, comme le serveur).
const repartitionComposants = (unites: UniteOperationnelleFields[], comps: Composant[]): string => {
  const defautId = comps[0]?.id ?? null;
  return comps.map((c) => {
    const n = unites.filter((u) => (u.composant?.id ?? defautId) === c.id).length;
    return `${n} ${n > 1 ? (c.libellePluriel || c.libelle) : c.libelle}`;
  }).join(' · ');
};

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
  const voc = useVocabulaire();
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
  const [moduleAcheteursActif, setModuleAcheteursActif] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [laboPopup, setLaboPopup] = useState<{ nom: string; tel: string | null; adresse: string | null } | null>(null);
  const [deleteLaboTarget, setDeleteLaboTarget] = useState<Labo | null>(null);
  const [deletingLabo, setDeletingLabo] = useState(false);
  const [deleteLaboError, setDeleteLaboError] = useState('');

  // Standalone labo add/edit modal (single step)
  const [showLaboModal, setShowLaboModal] = useState(false);
  const [editingLaboId, setEditingLaboId] = useState<number | null>(null);
  const [laboFormData, setLaboFormData] = useState<LaboForm>(emptyLaboForm());
  const [laboSelectedActivities, setLaboSelectedActivities] = useState<number[]>([]);
  const [laboSaving, setLaboSaving] = useState(false);
  const [laboError, setLaboError] = useState('');

  // "Créer mon business" multi-step wizard
  const [showBizWizard, setShowBizWizard] = useState(false);
  const [bizStep, setBizStep] = useState<1 | 2>(1);
  const [bizLaboForm, setBizLaboForm] = useState({ nom: '', refLabo: '', adresse: '' });
  const [bizLaboSkip, setBizLaboSkip] = useState(false);
  const [bizActForms, setBizActForms] = useState<BizActForm[]>([emptyBizAct()]);
  // Labo déjà créé par le wizard : un « Réessayer » après une erreur ne le recrée jamais.
  const [bizCreatedLaboId, setBizCreatedLaboId] = useState<number | null>(null);
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
      const [actRes, laboRes, aboRes, epRes] = await Promise.all([
        api.get('/api/entreprise/activites'),
        api.get('/api/labo'),
        api.get('/api/abonnements/mon-abonnement').catch(() => null),
        api.get('/api/entreprise').catch(() => null),
      ]);
      setActivites(actRes.data);
      setLabos(laboRes.data);
      if (aboRes?.data?.config) setAbonnementConfig(aboRes.data.config);
      setModuleAcheteursActif(!!epRes?.data?.module_acheteurs_actif);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const maxActivites = abonnementConfig?.nbActivites ?? null;
  const maxLabos = abonnementConfig?.nbLabos ?? null;
  const atActiviteLimit = maxActivites !== null && activites.length >= maxActivites;
  const atLaboLimit = maxLabos !== null && labos.length >= maxLabos;
  const configHasLabo = maxLabos !== null && maxLabos > 0;

  // ── Lot 1b : composants du domaine (profil exposé par /auth/me) ────────────
  const composantsActivite = composantsActifs(user?.domaine?.composants, 'activite');
  const composantsLabo = composantsActifs(user?.domaine?.composants, 'labo');
  const showComposantActivite = composantsActivite.length >= 2;
  const showComposantLabo = composantsLabo.length >= 2;
  const defaultComposantActiviteId: number | null = composantsActivite[0]?.id ?? null;
  const defaultComposantLaboId: number | null = composantsLabo[0]?.id ?? null;
  const composantById = (id: number | null | undefined, comps: Composant[]): Composant | null =>
    id == null ? null : (comps.find((c) => c.id === id) ?? null);

  // Source d'un labo (« Alimenté par ») : laboParentId si exposé, sinon via sourceUniteId ↔ uniteId.
  const laboSourceId = (l: Labo): number | null => {
    if (typeof l.laboParentId !== 'undefined') return l.laboParentId ?? null;
    if (l.sourceUniteId == null) return null;
    return labos.find((x) => x.uniteId != null && x.uniteId === l.sourceUniteId)?.id ?? null;
  };
  const laboSourceNom = (l: Labo): string | null => {
    const sid = laboSourceId(l);
    return sid == null ? null : (labos.find((x) => x.id === sid)?.nom ?? null);
  };
  // Labos alimentés (directement ou en chaîne) par un labo : exclus des sources proposées (anti-cycle côté UI ;
  // le serveur refuse de toute façon un cycle par 400 CYCLE_INTERDIT).
  const laboDescendants = (rootId: number): Set<number> => {
    const out = new Set<number>();
    const stack = [rootId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const l of labos) {
        if (laboSourceId(l) === cur && !out.has(l.id)) { out.add(l.id); stack.push(l.id); }
      }
    }
    return out;
  };
  const laboParentOptions = (() => {
    if (!editingLaboId) return labos;
    const excluded = laboDescendants(editingLaboId);
    return labos.filter((l) => l.id !== editingLaboId && !excluded.has(l.id));
  })();
  const anyLaboHasSource = labos.some((l) => laboSourceId(l) != null);

  // ── Activité modal ───────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setIsDuplicate(false);
    setForm({ ...emptyForm(), composantId: defaultComposantActiviteId });
    setHasLabo(null);
    setSelectedLaboId('');
    setError('');
    setShowForm(true);
  };

  const openEdit = (act: Activite) => {
    setEditingId(act.id);
    setIsDuplicate(false);
    setForm({
      nom: act.nom,
      adresse: act.adresse || '',
      composantId: composantById(act.composant?.id, composantsActivite)?.id ?? defaultComposantActiviteId,
    });
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
      if (hasLabo === null) { setError(`Veuillez choisir une option pour ${voc.le('labo')}`); return; }
      if (hasLabo === true && !selectedLaboId) { setError(`Veuillez sélectionner ${voc.un('labo')}`); return; }
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
        // composantId seulement s'il CHANGE : setComposant repose les flags vente/production du
        // composant — un simple re-enregistrement ne doit pas écraser un flag réglé par unité.
        const currentComposantId = activites.find((a) => a.id === editingId)?.composant?.id ?? null;
        if (form.composantId != null && form.composantId !== currentComposantId) updatePayload.composantId = form.composantId;
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
        if (form.composantId != null) payload.composantId = form.composantId;
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
    setLaboFormData({ ...emptyLaboForm(), composantId: defaultComposantLaboId });
    setLaboSelectedActivities([]);
    setLaboError('');
    setShowLaboModal(true);
  };

  const openEditLabo = (labo: Labo) => {
    setEditingLaboId(labo.id);
    setLaboFormData({
      nom: labo.nom,
      refLabo: labo.refLabo || '',
      adresse: labo.adresse || '',
      composantId: composantById(labo.composant?.id, composantsLabo)?.id ?? defaultComposantLaboId,
      laboParentId: laboSourceId(labo) ?? '',
    });
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
    if (!laboFormData.nom.trim()) { setLaboError(`Nom ${voc.du('labo')} requis`); return; }
    if (!editingLaboId && !laboFormData.refLabo.trim()) { setLaboError('Référence requise'); return; }
    setLaboSaving(true);
    setLaboError('');
    try {
      // « Alimenté par » (lot 1b) : laboParentId — null = aucune source (vide le rattachement en édition).
      const laboParentId = laboFormData.laboParentId === '' ? null : Number(laboFormData.laboParentId);
      const editingLabo = editingLaboId ? labos.find((l) => l.id === editingLaboId) ?? null : null;
      const currentComposantId = editingLabo?.composant?.id ?? null;
      // composantId seulement à la création ou s'il CHANGE (setComposant repose les flags du composant).
      const composantPart = laboFormData.composantId != null && (!editingLabo || laboFormData.composantId !== currentComposantId)
        ? { composantId: laboFormData.composantId } : {};
      if (editingLaboId) {
        // laboParentId (PUT : absent = inchangé) envoyé seulement si le select est rendu ou si la valeur change.
        const currentParentId = editingLabo ? laboSourceId(editingLabo) ?? null : null;
        const parentPart = laboParentOptions.length > 0 || laboParentId !== currentParentId ? { laboParentId } : {};
        await api.put(`/api/labo/${editingLaboId}`, {
          nom: laboFormData.nom.trim(),
          adresse: laboFormData.adresse.trim() || undefined,
          ...parentPart,
          ...composantPart,
        });
        window.dispatchEvent(new Event('labos-changed'));
      } else {
        await api.post('/api/labo', {
          nom: laboFormData.nom.trim(),
          refLabo: laboFormData.refLabo.trim(),
          adresse: laboFormData.adresse.trim() || undefined,
          ...(laboParentId != null ? { laboParentId } : {}),
          ...composantPart,
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
    setBizActForms([{ ...emptyBizAct(), composantId: defaultComposantActiviteId }]);
    setBizCreatedLaboId(null);
    setBizError('');
    setBizStep(configHasLabo ? 1 : 2);
    setShowBizWizard(true);
  };

  const closeBizWizard = () => { setShowBizWizard(false); setBizError(''); };

  const bizNextStep = () => {
    if (!bizLaboSkip) {
      if (!bizLaboForm.nom.trim()) { setBizError(`Nom ${voc.du('labo')} requis`); return; }
      if (!bizLaboForm.refLabo.trim()) { setBizError('Référence requise'); return; }
    }
    setBizError('');
    setBizStep(2);
  };

  const bizAddSlot = () => {
    if (maxActivites === null || bizActForms.length < maxActivites) {
      setBizActForms((p) => [...p, { ...emptyBizAct(), composantId: defaultComposantActiviteId }]);
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
    const isFirst = activites.length === 0;
    let createdCount = 0;
    // Effets d'une création réussie (même partielle) : rafraîchissements + onboarding.
    const afterCreated = async () => {
      if (createdCount === 0) return;
      if (onCreated) onCreated();
      if (isFirst && user?.onboardingStep === 2) await advanceOnboarding(3);
      window.dispatchEvent(new Event('activites-changed'));
    };
    try {
      let laboId: number | null = bizCreatedLaboId;
      if (laboId === null && configHasLabo && !bizLaboSkip && bizLaboForm.nom.trim() && bizLaboForm.refLabo.trim()) {
        const res = await api.post('/api/labo', {
          nom: bizLaboForm.nom.trim(),
          refLabo: bizLaboForm.refLabo.trim(),
          adresse: bizLaboForm.adresse.trim() || undefined,
          ...(defaultComposantLaboId != null ? { composantId: defaultComposantLaboId } : {}),
        });
        laboId = res.data?.id ?? null;
        setBizCreatedLaboId(laboId);
        window.dispatchEvent(new Event('labos-changed'));
      }
      for (const act of validActs) {
        const payload: Record<string, unknown> = { nom: act.nom.trim(), adresse: act.adresse.trim() };
        if (laboId && act.useLabo === true) payload.laboId = laboId;
        const composantId = act.composantId ?? defaultComposantActiviteId;
        if (composantId != null) payload.composantId = composantId;
        await api.post('/api/entreprise/activites', payload);
        createdCount += 1;
        // Slot réussi retiré IMMÉDIATEMENT : un nouveau clic après une erreur ne recrée
        // jamais une activité déjà créée (plus de doublons).
        setBizActForms((prev) => prev.filter((f) => f !== act));
      }
      await afterCreated();
      closeBizWizard();
      await load();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { code?: string; message?: string } } })?.response?.data;
      await afterCreated();
      // 409 LIMITE_ATTEINTE : compteurs rechargés (le bouton se désactive si la limite
      // est atteinte), slots restants conservés, message serveur en bandeau. La liste est aussi
      // rechargée dès qu'au moins une activité a été créée (erreur ≠ 409 sur un slot suivant).
      if (createdCount > 0 || data?.code === 'LIMITE_ATTEINTE') await load();
      setBizActForms((prev) => (prev.length > 0 ? prev : [{ ...emptyBizAct(), composantId: defaultComposantActiviteId }]));
      setBizError(data?.message || t('common.error'));
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

  // Lot 1b : le compteur Labos = labos existants (un Économat qui n'alimente qu'une
  // Cuisine compte aussi) ; les quotas restent par TYPE technique (nbActivites/nbLabos).
  const usedLabos = labos.length;
  const repartitionActivites = showComposantActivite ? repartitionComposants(activites, composantsActivite) : '';
  const repartitionLabos = showComposantLabo ? repartitionComposants(labos, composantsLabo) : '';

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
              Gérez {voc.votre('activite_desc', true)} et {voc.pl('labo_desc')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {!loading && abonnementConfig && (
              <>
                {abonnementConfig.nbActivites > 0 && (
                <div style={{
                  background: atActiviteLimit ? '#fef2f2' : activites.length > 0 ? '#f0fdf4' : 'rgba(255,255,255,0.1)',
                  borderRadius: 12, padding: '10px 20px', textAlign: 'center', minWidth: 90,
                  border: `1px solid ${atActiviteLimit ? '#fecaca' : activites.length > 0 ? '#bbf7d0' : 'rgba(255,255,255,0.2)'}`,
                }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 700, color: atActiviteLimit || activites.length > 0 ? '#6b7280' : 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{voc.Pl('activite')}</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: atActiviteLimit ? '#dc2626' : activites.length > 0 ? '#16a34a' : '#fff', lineHeight: 1 }}>
                    {activites.length}<span style={{ fontSize: '0.8rem', fontWeight: 600, color: atActiviteLimit || activites.length > 0 ? '#6b7280' : 'rgba(255,255,255,0.6)' }}> / {abonnementConfig.nbActivites}</span>
                  </div>
                  {repartitionActivites && (
                    <div style={{ fontSize: '0.66rem', fontWeight: 600, color: atActiviteLimit || activites.length > 0 ? '#6b7280' : 'rgba(255,255,255,0.7)', marginTop: 4, whiteSpace: 'nowrap' }}>
                      {repartitionActivites}
                    </div>
                  )}
                </div>
                )}
                {abonnementConfig.nbLabos > 0 && (
                  <div style={{
                    background: atLaboLimit ? '#fef2f2' : usedLabos > 0 ? '#f5f3ff' : 'rgba(255,255,255,0.1)',
                    borderRadius: 12, padding: '10px 20px', textAlign: 'center', minWidth: 80,
                    border: `1px solid ${atLaboLimit ? '#fecaca' : usedLabos > 0 ? '#c4b5fd' : 'rgba(255,255,255,0.2)'}`,
                  }}>
                    <div style={{ fontSize: '0.66rem', fontWeight: 700, color: atLaboLimit || usedLabos > 0 ? '#6b7280' : 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{voc.Pl('labo')}</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: atLaboLimit ? '#dc2626' : usedLabos > 0 ? '#7c3aed' : '#fff', lineHeight: 1 }}>
                      {usedLabos}<span style={{ fontSize: '0.8rem', fontWeight: 600, color: atLaboLimit || usedLabos > 0 ? '#6b7280' : 'rgba(255,255,255,0.6)' }}> / {abonnementConfig.nbLabos}</span>
                    </div>
                    {repartitionLabos && (
                      <div style={{ fontSize: '0.66rem', fontWeight: 600, color: atLaboLimit || usedLabos > 0 ? '#6b7280' : 'rgba(255,255,255,0.7)', marginTop: 4, whiteSpace: 'nowrap' }}>
                        {repartitionLabos}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            <GuideButton section="activites" />
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
          {(() => {
            // Compte dépôt (0 activité au contrat) : la seule structure à créer est le labo —
            // « Limite atteinte » sur les activités ne doit JAMAIS bloquer la création du labo.
            const isDepot = maxActivites === 0 && configHasLabo;
            const canAddLabo = configHasLabo && !atLaboLimit;
            const canAddActivite = !atActiviteLimit;
            return (
              <>
                <div style={{ fontSize: 52, marginBottom: 18 }}>{isDepot ? voc.icon('labo') : '🚀'}</div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', marginBottom: 10 }}>
                  Démarrez {voc.votre(isDepot ? 'labo' : 'activite')}
                </h2>
                <p style={{ fontSize: '0.88rem', color: '#6b7280', marginBottom: 32, lineHeight: 1.7, maxWidth: 420, margin: '0 auto 32px' }}>
                  {isDepot
                    ? `Votre abonnement inclut ${maxLabos} ${voc.nomS('labo')}${moduleAcheteursActif ? ` et ${voc.le('espace_acheteurs', false, 'Nom')} (${voc.pl('vente')} B2B)` : ''}. Créez ${voc.votre('labo')} pour débloquer ${voc.le('referentiel')}, ${voc.le('stock')}${moduleAcheteursActif ? ` et ${voc.le('vente', true)} ${voc.au('acheteur', true)}` : ''}.`
                    : configHasLabo
                      ? `Votre abonnement inclut jusqu'à ${maxActivites} ${voc.nomS('activite')} et ${maxLabos} ${voc.nomS('labo')}. Configurez votre business en quelques étapes.`
                      : `Votre abonnement inclut jusqu'à ${maxActivites} ${voc.nomS('activite')}. Créez ${voc.acc('activite', 'votre premier', 'votre première')} ${voc.nom('activite')} pour commencer.`
                  }
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {isDepot && canAddLabo ? (
                    <button
                      style={{
                        padding: '13px 28px', borderRadius: 12, background: 'linear-gradient(135deg, #3b0764 0%, #7e22ce 55%, #a855f7 100%)',
                        color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
                        border: 'none', boxShadow: '0 4px 16px rgba(126,34,206,0.35)',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                      onClick={openAddLabo}
                    >
                      {voc.icon('labo')} Créer {voc.mon('labo')}
                    </button>
                  ) : canAddActivite && configHasLabo ? (
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
                  ) : canAddActivite ? (
                    <button className="btn btn-primary" style={{ padding: '11px 26px', fontWeight: 700 }} onClick={() => openAdd()}>
                      + Ajouter {voc.mon('activite')}
                    </button>
                  ) : canAddLabo ? (
                    <button
                      style={{
                        padding: '13px 28px', borderRadius: 12, background: 'linear-gradient(135deg, #3b0764 0%, #7e22ce 55%, #a855f7 100%)',
                        color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
                        border: 'none', boxShadow: '0 4px 16px rgba(126,34,206,0.35)',
                      }}
                      onClick={openAddLabo}
                    >
                      {voc.icon('labo')} Créer {voc.mon('labo')}
                    </button>
                  ) : (
                    <div style={{ fontSize: 13, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 16px' }}>
                      🔒 Limite atteinte
                    </div>
                  )}
                </div>
              </>
            );
          })()}
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
              <FilterInput type="text" placeholder={`Filtrer ${voc.pl('activite')} et ${voc.pl('labo')}…`} value={filterName} onChange={(e) => setFilterName(e.target.value)} />
            </FilterField>
          </HistoryFilterBar>

          {/* Activités section */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '10px 16px', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', borderRadius: 12, border: '1px solid #bfdbfe' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.1rem' }}>🏢</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e40af' }}>{t('nav.activites')}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, padding: '2px 10px' }}>
                  {activites.length}{maxActivites !== null ? ` / ${maxActivites}` : ''} {voc.nomS('activite')}
                </span>
              </div>
              {!atActiviteLimit ? (
                <button className="btn btn-primary btn-sm" onClick={() => openAdd()}>
                  + {voc.Nouveau('activite')}
                </button>
              ) : (
                <button className="btn btn-sm" title={`Demander l'ajout ${voc.de('activite', true)}`} onClick={() => navigate('/client/support?type=supplement')}
                  style={{ background: '#1e40af', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.8rem', padding: '6px 14px', cursor: 'pointer', fontWeight: 700 }}>
                  ⚡ Ajouter {voc.pl('activite')}
                </button>
              )}
            </div>

            {activites.length === 0 ? (
              <div style={{ background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 12, padding: '24px', textAlign: 'center' }}>
                <p style={{ color: '#6b7280', fontSize: '0.88rem', margin: '0 0 12px' }}>{voc.Aucun('activite')} {voc.acc('activite', 'créé', 'créée')}.</p>
                {!atActiviteLimit && (
                  <button className="btn btn-primary btn-sm" onClick={() => openAdd()}>+ Ajouter {voc.un('activite')}</button>
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
                        <th style={{ width: 130 }}>{t('client.entreprise.labo')}</th>
                      )}
                      <th style={{ width: 140, textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActivites.map((act) => (
                      <tr key={act.id}>
                        <td style={{ fontWeight: 700 }}>
                          {act.nom}
                          {/* Badge composant (lot 1b) : seulement si le domaine a ≥ 2 composants activité */}
                          {showComposantActivite && (() => {
                            const c = composantById(act.composant?.id, composantsActivite) ?? composantsActivite[0];
                            return c ? (
                              <span style={{ marginLeft: 8, fontSize: '0.7rem', fontWeight: 700, color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, padding: '1px 8px', whiteSpace: 'nowrap' }}>
                                {composantLabel(c)}
                              </span>
                            ) : null;
                          })()}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{act.adresse || '—'}</td>
                        {activites.some((a) => a.laboId) && (
                          <td>
                            {act.laboNom ? (
                              <button
                                style={{ fontSize: '0.78rem', fontWeight: 600, color: '#7c3aed', background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 20, padding: '2px 8px', cursor: 'pointer' }}
                                onClick={() => setLaboPopup({ nom: act.laboNom!, tel: act.laboTel ?? null, adresse: act.laboAdresse ?? null })}
                              >
                                {voc.icon('labo')} {act.laboNom}
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
                                title={locked ? `Suppression impossible : ${voc.un('article', true)} sont ${voc.acc('article', 'affectés', 'affectées')} à ${voc.ce('activite')}.` : t('common.delete')}
                                onClick={() => locked
                                  ? flashLock(`Suppression impossible : ${voc.un('article', true)} sont ${voc.acc('article', 'affectés', 'affectées')} à ${voc.ce('activite')}. Retirez d'abord ${voc.ce('article', true)} pour pouvoir ${voc.acc('activite', 'le', 'la')} supprimer.`)
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
                  <span style={{ fontSize: '1.1rem' }}>{voc.icon('labo')}</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#7e22ce' }}>Espace {voc.Court('labo', true)}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', background: '#faf5ff', border: '1px solid #a78bfa', borderRadius: 20, padding: '2px 10px' }}>
                    {labos.length} / {maxLabos} {voc.nomS('labo')}
                  </span>
                </div>
                {!atLaboLimit ? (
                  <button
                    className="btn btn-sm"
                    style={{ background: '#7e22ce', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.8rem', padding: '6px 14px', cursor: 'pointer', fontWeight: 700 }}
                    onClick={openAddLabo}
                  >
                    + {voc.Nouveau('labo')}
                  </button>
                ) : (
                  <button className="btn btn-sm" title={`Demander l'ajout ${voc.de('labo', true)}`} onClick={() => navigate('/client/support?type=supplement')}
                    style={{ background: '#7e22ce', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.8rem', padding: '6px 14px', cursor: 'pointer', fontWeight: 700 }}>
                    ⚡ Ajouter {voc.pl('labo')}
                  </button>
                )}
              </div>

              {labos.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                  {voc.Aucun('labo')} {voc.acc('labo', 'créé', 'créée')}.{' '}
                  {!atLaboLimit && (
                    <button style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem', padding: 0, textDecoration: 'underline' }} onClick={openAddLabo}>
                      Créer {voc.acc('labo', 'le premier', 'la première')} {voc.nom('labo')}
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
                        {/* Colonne « Alimenté par » (lot 1b) : seulement si au moins un labo a une source */}
                        {anyLaboHasSource && <th style={{ width: 150 }}>{voc.acc('labo', 'Alimenté', 'Alimentée')} par</th>}
                        <th style={{ width: 80, textAlign: 'right' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLabos.map((labo) => (
                        <tr key={labo.id}>
                          <td style={{ fontWeight: 700 }}>
                            {labo.nom}
                            {showComposantLabo && (() => {
                              const c = composantById(labo.composant?.id, composantsLabo) ?? composantsLabo[0];
                              return c ? (
                                <span style={{ marginLeft: 8, fontSize: '0.7rem', fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 20, padding: '1px 8px', whiteSpace: 'nowrap' }}>
                                  {composantLabel(c)}
                                </span>
                              ) : null;
                            })()}
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{labo.refLabo || '—'}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{labo.adresse || '—'}</td>
                          {anyLaboHasSource && (
                            <td>
                              {laboSourceNom(labo) ? (
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#7c3aed', background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                                  ↙ {laboSourceNom(labo)}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                              )}
                            </td>
                          )}
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => openEditLabo(labo)}>✏️</button>
                            {(() => {
                              const locked = (labo.ingredientCount ?? 0) > 0;
                              return (
                                <button className="btn btn-danger-ghost btn-sm"
                                  title={locked ? `Suppression impossible : ${voc.un('article', true)} sont ${voc.acc('article', 'affectés', 'affectées')} à ${voc.ce('labo')}.` : 'Supprimer'}
                                  onClick={() => locked
                                    ? flashLock(`Suppression impossible : ${voc.un('article', true)} sont ${voc.acc('article', 'affectés', 'affectées')} à ${voc.ce('labo')}. Retirez d'abord ${voc.ce('article', true)} pour pouvoir ${voc.acc('labo', 'le', 'la')} supprimer.`)
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
                  {editingId ? 'Modification' : isDuplicate ? 'Duplication' : voc.acc('activite', 'Nouveau', 'Nouvelle')}
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
                    placeholder={`Ex: ${voc.Nom('activite')} 1`}
                    style={nameConflict ? { borderColor: '#ef4444' } : undefined}
                  />
                  {nameConflict && (
                    <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>
                      {t('client.entreprise.activity_name_exists', { name: form.nom.trim() })}
                    </span>
                  )}
                </div>

                {/* Composant du domaine (lot 1b) — rendu seulement si ≥ 2 composants activité actifs */}
                {showComposantActivite && (
                  <div style={fieldWrap}>
                    <label style={fieldLabel}>Type <span style={{ color: '#ef4444' }}>*</span></label>
                    <select className="input" style={{ width: '100%' }} value={form.composantId ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, composantId: e.target.value === '' ? null : Number(e.target.value) }))}>
                      {composantsActivite.map((c) => <option key={c.id} value={c.id}>{composantLabel(c)}</option>)}
                    </select>
                  </div>
                )}

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

                {/* « Alimentée par » (lot 1b) = le bloc Configuration laboratoire existant :
                    mêmes radios Avec/Sans labo, envoie `laboId` (compat) — aucun champ ajouté */}
                {labos.length > 0 && (
                  <>
                    <div style={dividerStyle} />
                    <div>
                      <div style={sectionTitle('#6d28d9')}>
                        <span>{voc.icon('labo')}</span> Configuration {voc.court('labo_long')}
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
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1f2937' }}>{voc.icon('labo')} Avec {voc.nom('labo')}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 1 }}>{voc.Nom('appro')} via {voc.nom('labo')}</div>
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
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1f2937' }}>📋 Sans {voc.nom('labo')}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 1 }}>Gestion par {voc.nom('activite')}</div>
                          </div>
                        </label>
                      </div>
                      {hasLabo === true && (
                        <div style={{ marginTop: 10 }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>
                            Sélectionner {voc.un('labo')} *
                          </label>
                          <select className="input" style={{ width: '100%' }} value={selectedLaboId}
                            onChange={(e) => setSelectedLaboId(e.target.value === '' ? '' : Number(e.target.value))}>
                            <option value="">— Choisir —</option>
                            {labos.map((l) => <option key={l.id} value={l.id}>{voc.icon('labo')} {l.nom}{l.refLabo ? ` (${l.refLabo})` : ''}</option>)}
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
                  {saving ? t('common.loading') : editingId ? '💾 Enregistrer' : `+ Créer ${voc.le('activite')}`}
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
              <h2 style={{ margin: 0 }}>{voc.icon('labo')} {laboPopup.nom}</h2>
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
                  {editingLaboId ? 'Modification' : voc.acc('labo', 'Nouveau', 'Nouvelle')}
                </div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>
                  {voc.icon('labo')} {editingLaboId ? `Modifier ${voc.le('labo')}` : voc.Nouveau('labo')}
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
                <label style={fieldLabel}>Nom {voc.du('labo')} <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="text" className="input" value={laboFormData.nom}
                  onChange={(e) => setLaboFormData((p) => ({ ...p, nom: e.target.value }))}
                  placeholder={`Ex: ${voc.Nom('labo')} 1`} autoFocus />
              </div>

              {/* Composant du domaine (lot 1b) — rendu seulement si ≥ 2 composants labo actifs */}
              {showComposantLabo && (
                <div style={fieldWrap}>
                  <label style={fieldLabel}>Type <span style={{ color: '#ef4444' }}>*</span></label>
                  <select className="input" style={{ width: '100%' }} value={laboFormData.composantId ?? ''}
                    onChange={(e) => setLaboFormData((p) => ({ ...p, composantId: e.target.value === '' ? null : Number(e.target.value) }))}>
                    {composantsLabo.map((c) => <option key={c.id} value={c.id}>{composantLabel(c)}</option>)}
                  </select>
                </div>
              )}

              {/* Ref labo (new only) */}
              {!editingLaboId && (
                <div style={fieldWrap}>
                  <label style={fieldLabel}>
                    Référence <span style={{ color: '#ef4444' }}>*</span>
                    <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: '0.72rem', marginLeft: 5 }}>(unique)</span>
                  </label>
                  <input type="text" className="input" value={laboFormData.refLabo}
                    onChange={(e) => setLaboFormData((p) => ({ ...p, refLabo: e.target.value }))}
                    placeholder={`Ex: ${voc.MAJ('labo')}-001`} />
                </div>
              )}

              {/* Adresse */}
              <div style={fieldWrap}>
                <label style={fieldLabel}>Adresse</label>
                <textarea className="input" rows={2} value={laboFormData.adresse}
                  onChange={(e) => setLaboFormData((p) => ({ ...p, adresse: e.target.value }))}
                  placeholder="Adresse (optionnel)" style={{ resize: 'none' }} />
              </div>

              {/* « Alimenté par » (lot 1b) : labo source des transferts reçus — création ET édition,
                  seulement s'il existe un autre labo ; vide = aucune source. Envoie `laboParentId`. */}
              {laboParentOptions.length > 0 && (
                <div style={fieldWrap}>
                  <label style={fieldLabel}>
                    {voc.acc('labo', 'Alimenté', 'Alimentée')} par
                    <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: '0.72rem', marginLeft: 5 }}>({voc.nom('labo')} source {voc.du('transfert', true)}, optionnel)</span>
                  </label>
                  <select className="input" style={{ width: '100%' }} value={laboFormData.laboParentId}
                    onChange={(e) => setLaboFormData((p) => ({ ...p, laboParentId: e.target.value === '' ? '' : Number(e.target.value) }))}>
                    <option value="">— Aucune source —</option>
                    {laboParentOptions.map((l) => <option key={l.id} value={l.id}>{voc.icon('labo')} {l.nom}{l.refLabo ? ` (${l.refLabo})` : ''}</option>)}
                  </select>
                </div>
              )}

              {/* Activités assignment — only when creating and activités exist */}
              {!editingLaboId && activites.length > 0 && (
                <>
                  <div style={dividerStyle} />
                  <div>
                    <div style={sectionTitle('#1d4ed8')}>
                      <span>🏢</span> Assigner {voc.un('activite', true)}
                      <span style={{ fontWeight: 400, color: '#6b7280', textTransform: 'none', fontSize: '0.7rem', marginLeft: 4 }}>(optionnel)</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {activites.filter((a) => !a.laboId).length === 0 ? (
                        <p style={{ color: '#9ca3af', fontSize: '0.82rem', fontStyle: 'italic', margin: 0 }}>
                          {voc.Tous('activite')} ont déjà {voc.un('labo')} {voc.acc('labo', 'assigné', 'assignée')}.
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
                {laboSaving ? t('common.loading') : editingLaboId ? '💾 Enregistrer' : `+ Créer ${voc.le('labo')}`}
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
                    { step: 1, label: voc.Nom('labo_long'), icon: voc.icon('labo') },
                    { step: 2, label: voc.Pl('activite'), icon: '🏢' },
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
                  <div style={sectionTitle('#7c3aed')}><span>{voc.icon('labo')}</span> Créez {voc.votre('labo_long')}</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#6b7280', cursor: 'pointer' }}>
                    <input type="checkbox" checked={bizLaboSkip} onChange={(e) => { setBizLaboSkip(e.target.checked); setBizError(''); }}
                      style={{ accentColor: '#7c3aed' }} />
                    Passer cette étape
                  </label>
                </div>

                {!bizLaboSkip && (
                  <>
                    <div style={fieldWrap}>
                      <label style={fieldLabel}>Nom {voc.du('labo')} <span style={{ color: '#ef4444' }}>*</span></label>
                      <input type="text" className="input" value={bizLaboForm.nom}
                        onChange={(e) => setBizLaboForm((p) => ({ ...p, nom: e.target.value }))}
                        placeholder={`Ex: ${voc.Nom('labo')} 1`} autoFocus />
                    </div>
                    <div style={fieldWrap}>
                      <label style={fieldLabel}>Référence <span style={{ color: '#ef4444' }}>*</span>
                        <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: '0.72rem', marginLeft: 5 }}>(unique)</span>
                      </label>
                      <input type="text" className="input" value={bizLaboForm.refLabo}
                        onChange={(e) => setBizLaboForm((p) => ({ ...p, refLabo: e.target.value }))}
                        placeholder={`Ex: ${voc.MAJ('labo')}-001`} />
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
                    Étape ignorée — vous pourrez créer {voc.un('labo')} plus tard
                  </div>
                )}
              </div>
            )}

            {/* Step 2 — Activités */}
            {bizStep === 2 && (
              <div className="modal-body" style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '55vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={sectionTitle('#1e40af')}><span>🏢</span> Créez {voc.votre('activite', true)}</div>
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
                        {voc.Nom('activite')} {idx + 1}
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
                        placeholder={`Ex: ${voc.Nom('activite')} 1`}
                        autoFocus={idx === 0} />
                    </div>
                    {/* Composant par slot (lot 1b) — même règle d'affichage (≥ 2 composants activité) */}
                    {showComposantActivite && (
                      <div style={fieldWrap}>
                        <label style={fieldLabel}>Type <span style={{ color: '#ef4444' }}>*</span></label>
                        <select className="input" style={{ width: '100%' }} value={af.composantId ?? ''}
                          onChange={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); setBizActForms((p) => p.map((f, i) => i === idx ? { ...f, composantId: v } : f)); }}>
                          {composantsActivite.map((c) => <option key={c.id} value={c.id}>{composantLabel(c)}</option>)}
                        </select>
                      </div>
                    )}
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
                          {voc.icon('labo')} {voc.Nom('labo_long')}
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
                              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1f2937' }}>{voc.icon('labo')} Avec {voc.nom('labo')}</div>
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
                            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1f2937' }}>📋 Sans {voc.nom('labo')}</div>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {(maxActivites === null || bizActForms.length < maxActivites) && (
                  <button type="button" onClick={bizAddSlot}
                    style={{ background: 'none', border: '1px dashed #1e40af', color: '#1e40af', borderRadius: 10, padding: '10px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', width: '100%' }}>
                    + Ajouter {voc.un('activite')}
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
                    {voc.Pl('activite')} →
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
                  <button type="button" className="btn btn-primary" onClick={bizSaveAll}
                    disabled={bizSaving || atActiviteLimit || (bizCreatedLaboId === null && !bizLaboSkip && configHasLabo && atLaboLimit && !!bizLaboForm.nom.trim())}
                    title={atActiviteLimit ? `Limite ${voc.de('activite', true)} de votre abonnement atteinte` : (bizCreatedLaboId === null && !bizLaboSkip && configHasLabo && atLaboLimit && !!bizLaboForm.nom.trim()) ? `Limite ${voc.de('labo', true)} de votre abonnement atteinte` : undefined}
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
              <h2 style={{ color: '#dc2626', margin: 0 }}>⚠️ Supprimer {voc.le('labo')}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteLaboTarget(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>{voc.icon('labo')} {deleteLaboTarget.nom}</p>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', fontSize: '0.85rem', color: '#991b1b', lineHeight: 1.6 }}>
                <p style={{ margin: '0 0 6px', fontWeight: 700 }}>⚠ Attention — impacts de la suppression :</p>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>{voc.Le('activite', true)} {voc.acc('activite', 'liés', 'liées')} à {voc.ce('labo')} passeront en <strong>mode gestion séparée</strong>.</li>
                  <li>{voc.Le('labo', true)} {voc.acc('labo', 'alimentés', 'alimentées')} par {voc.ce('labo')} perdront leur source.</li>
                  <li>{voc.Aucun('activite')} ne pourra plus recevoir {voc.de('transfert', true)} depuis {voc.ce('labo')}.</li>
                </ul>
              </div>
              <p style={{ margin: 0, color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>
                {t('client.entreprise.irreversible')}
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
              <h2 style={{ color: '#dc2626', margin: 0 }}>⚠️ {t('client.entreprise.confirm_delete_title')}</h2>
            </div>
            <div className="modal-body">
              <p>
                {t('client.entreprise.delete_activity_warning')} <strong>{deleteTarget.act.nom}</strong> ?
              </p>
              <p style={{ marginTop: 16, color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>
                {t('client.entreprise.irreversible')}
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
