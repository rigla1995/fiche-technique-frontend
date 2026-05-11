import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, ActiviteIngredient, Labo, AbonnementConfig } from '../../types';

type ActiviteForm = { nom: string; adresse: string; telephone: string };
const emptyForm = (): ActiviteForm => ({ nom: '', adresse: '', telephone: '' });
type FranchiseStepForm = { telephone: string; adresse: string };
const emptyFranchiseStep = (): FranchiseStepForm => ({ telephone: '', adresse: '' });

interface Props {
  onCreated?: () => void;
  minimal?: boolean;
}

const TUNISIAN_PHONE = /^(\+216[\s-]?)?[2579]\d{7}$/;

// ── Labo select/create sub-form ────────────────────────────────────────────────
interface LaboSelectOrCreateProps {
  labos: Labo[];
  laboAction: 'select' | 'create' | null;
  setLaboAction: (a: 'select' | 'create') => void;
  selectedLaboId: number | '';
  setSelectedLaboId: (id: number | '') => void;
  laboNom: string; setLaboNom: (v: string) => void;
  laboRefLabo: string; setLaboRefLabo: (v: string) => void;
  laboTel: string; setLaboTel: (v: string) => void;
  laboAdresse: string; setLaboAdresse: (v: string) => void;
  atLaboLimit?: boolean;
  maxLabos?: number | null;
}
function LaboSelectOrCreate({ labos, laboAction, setLaboAction, selectedLaboId, setSelectedLaboId, laboNom, setLaboNom, laboRefLabo, setLaboRefLabo, laboTel, setLaboTel, laboAdresse, setLaboAdresse, atLaboLimit, maxLabos }: LaboSelectOrCreateProps) {
  const fieldLabel: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 3 };
  return (
    <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
      {/* Select or Create choice */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        {labos.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, border: `2px solid ${laboAction === 'select' ? 'var(--primary)' : 'var(--border)'}`, background: laboAction === 'select' ? 'var(--primary-light, #eef2ff)' : 'white', fontWeight: 600, fontSize: '0.85rem' }}>
            <input type="radio" checked={laboAction === 'select'} onChange={() => setLaboAction('select')} style={{ accentColor: 'var(--primary)' }} />
            Sélectionner un labo existant
          </label>
        )}
        {atLaboLimit ? (
          <span style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px' }}>
            🔒 Limite de {maxLabos} labo(s) atteinte
          </span>
        ) : (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, border: `2px solid ${laboAction === 'create' ? 'var(--primary)' : 'var(--border)'}`, background: laboAction === 'create' ? 'var(--primary-light, #eef2ff)' : 'white', fontWeight: 600, fontSize: '0.85rem' }}>
            <input type="radio" checked={laboAction === 'create'} onChange={() => setLaboAction('create')} style={{ accentColor: 'var(--primary)' }} />
            Créer un nouveau labo
          </label>
        )}
      </div>

      {laboAction === 'select' && labos.length > 0 && (
        <div>
          <label style={fieldLabel}>Labo *</label>
          <select className="input" style={{ width: '100%' }} value={selectedLaboId} onChange={(e) => setSelectedLaboId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">— Choisir un labo —</option>
            {labos.map((l) => <option key={l.id} value={l.id}>🏭 {l.nom}{l.refLabo ? ` (${l.refLabo})` : ''}</option>)}
          </select>
        </div>
      )}

      {laboAction === 'create' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={fieldLabel}>Nom du labo *</label>
            <input className="input" style={{ width: '100%' }} type="text" value={laboNom} onChange={(e) => setLaboNom(e.target.value)} placeholder="Nom du labo" />
          </div>
          <div>
            <label style={fieldLabel}>Référence labo * <span style={{ textTransform: 'none', fontWeight: 400 }}>(unique par entreprise)</span></label>
            <input className="input" style={{ width: '100%' }} type="text" value={laboRefLabo} onChange={(e) => setLaboRefLabo(e.target.value)} placeholder="Ex: LABO-001" />
          </div>
          <div>
            <label style={fieldLabel}>Téléphone référent *</label>
            <input className="input" style={{ width: '100%' }} type="text" value={laboTel} onChange={(e) => setLaboTel(e.target.value)} placeholder="+216 …" />
          </div>
          <div>
            <label style={fieldLabel}>Adresse</label>
            <textarea className="input" style={{ width: '100%' }} rows={2} value={laboAdresse} onChange={(e) => setLaboAdresse(e.target.value)} placeholder="Adresse (optionnel)" />
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [laboAction, setLaboAction] = useState<'select' | 'create' | null>(null);
  const [selectedLaboId, setSelectedLaboId] = useState<number | ''>('');
  const [laboNom, setLaboNom] = useState('');
  const [laboRefLabo, setLaboRefLabo] = useState('');
  const [laboTel, setLaboTel] = useState('');
  const [laboAdresse, setLaboAdresse] = useState('');
  const [laboWizardStep, setLaboWizardStep] = useState<'choice' | 'labo-form' | 'activities'>('choice');
  const [wizardStep, setWizardStep] = useState(1); // 0=type, 1=main, 2=labo, 3=per-activity
  const [labos, setLabos] = useState<Labo[]>([]);
  const [abonnementConfig, setAbonnementConfig] = useState<AbonnementConfig | null>(null);
  // List filters
  const [filterFranchiseGroup, setFilterFranchiseGroup] = useState('');
  const [filterFranchiseName, setFilterFranchiseName] = useState('');
  const [filterDistinctName, setFilterDistinctName] = useState('');
  // Labo detail popup (click on labo badge in row)
  const [laboPopup, setLaboPopup] = useState<{ nom: string; tel: string | null; adresse: string | null } | null>(null);

  // Delete confirmation modal
  type DeleteTarget =
    | { kind: 'franchise-group'; group: string; laboNom: string | null; acts: Activite[] }
    | { kind: 'activite'; act: Activite };
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

  const isFranchise = memeActivite === true;

  const openAdd = (preType?: 'franchise' | 'franchise_labo' | 'distincte') => {
    setEditingId(null);
    setIsDuplicate(false);
    setForm(emptyForm());
    // Single-activité config: always distincte, skip type question
    const forceSingle = maxActivites === 1;
    const preIsFranchise = preType === 'franchise' || preType === 'franchise_labo';
    setMemeActivite(forceSingle ? false : preIsFranchise ? true : preType === 'distincte' ? false : null);
    setNombreActivites('2');
    setFranchiseName('');
    setFranchiseStep(0);
    setFranchiseForms([emptyFranchiseStep(), emptyFranchiseStep()]);
    // Pre-determine labo: if config has no labos → always false; if has labos → preset or ask
    if (preType === 'franchise_labo') { setHasLabo(true); }
    else if (preType === 'franchise') { setHasLabo(configHasLabo ? null : false); }
    else if (preType === 'distincte') { setHasLabo(configHasLabo ? null : false); }
    else { setHasLabo(null); }
    setLaboAction(null);
    setSelectedLaboId('');
    setLaboNom('');
    setLaboRefLabo('');
    setLaboTel('');
    setLaboAdresse('');
    setLaboWizardStep('choice');
    setError('');
    setWizardStep(preType ? 1 : 0);
    setShowForm(true);
  };

  const openEdit = (act: Activite) => {
    setEditingId(act.id);
    setIsDuplicate(false);
    setForm({ nom: act.nom, adresse: act.adresse || '', telephone: act.telephone || '' });
    setMemeActivite(null);
    setNombreActivites('1');
    setError('');
    setWizardStep(1);
    setShowForm(true);
  };

  const openDuplicate = (act: Activite) => {
    setEditingId(null);
    setIsDuplicate(true);
    // For franchise activities, auto-suggest next name: "<group> <count+1>"
    let suggestedNom = act.nom;
    if (act.type === 'franchise' && act.franchiseGroup) {
      const groupCount = activites.filter((a) => a.franchiseGroup === act.franchiseGroup).length;
      suggestedNom = `${act.franchiseGroup} ${groupCount + 1}`;
    }
    setForm({ nom: suggestedNom, adresse: '', telephone: '' });
    setMemeActivite(null);
    setNombreActivites('1');
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

    if (hasLabo === true) {
      if (laboAction === 'create') {
        if (!laboNom.trim()) { setError('Le nom du labo est requis'); return; }
        if (!laboRefLabo.trim()) { setError('La référence du labo est requise'); return; }
        if (!laboTel.trim()) { setError(t('client.labo.labo_fields_required')); return; }
      } else if (laboAction === 'select') {
        if (!selectedLaboId) { setError('Veuillez sélectionner un labo'); return; }
      }
    }

    setSaving(true);
    setError('');
    try {
      const isFirst = activites.length === 0;

      // Resolve or create labo
      let laboId: number | null = null;
      if (hasLabo === true) {
        if (laboAction === 'select' && selectedLaboId) {
          laboId = Number(selectedLaboId);
        } else if (laboAction === 'create') {
          const { data: labo } = await api.post('/api/labo', {
            franchiseGroup: fn,
            nom: laboNom.trim(),
            refLabo: laboRefLabo.trim(),
            referentTel: laboTel.trim(),
            adresse: laboAdresse.trim() || undefined,
          });
          laboId = labo.id;
        }
      }

      for (let i = 0; i < franchiseForms.length; i++) {
        const f = franchiseForms[i];
        await api.post('/api/entreprise/activites', {
          nom: `${fn} ${i + 1}`,
          franchiseName: fn,
          memeActivite: true,
          telephone: f.telephone,
          adresse: f.adresse,
          ...(laboId ? { laboId } : {}),
        });
      }
      if (onCreated) onCreated();
      if (isFirst && user?.onboardingStep === 2) await advanceOnboarding(3);
      closeForm();
      if (isFirst) {
        navigate('/client/catalogue-global?created=1');
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

  const handleFranchiseSetupNext = () => {
    if (!franchiseName.trim()) { setError('Nom du réseau requis'); return; }
    if (franchiseNameConflict) return;
    if (franchiseCount < 2) { setError('Minimum 2 activités requises'); return; }
    if (maxActivites !== null && franchiseCount > maxActivites - activites.length) {
      setError(`Seulement ${maxActivites - activites.length} activité(s) disponible(s)`); return;
    }
    setError('');
    setWizardStep(configHasLabo ? 2 : 3);
  };

  const handleLaboStepNext = () => {
    if (hasLabo === null) { setError('Veuillez choisir une option'); return; }
    if (hasLabo === true) {
      if (!laboAction) { setError('Veuillez sélectionner ou créer un labo'); return; }
      if (laboAction === 'select' && !selectedLaboId) { setError('Veuillez sélectionner un labo'); return; }
      if (laboAction === 'create') {
        if (!laboNom.trim()) { setError('Nom du labo requis'); return; }
        if (!laboRefLabo.trim()) { setError('Référence du labo requise'); return; }
        if (!laboTel.trim()) { setError('Téléphone du labo requis'); return; }
      }
    }
    setError('');
    setWizardStep(3);
  };

  const handleActivityBack = () => {
    setError('');
    if (franchiseStep > 0) {
      setFranchiseStep((s) => s - 1);
    } else {
      setWizardStep(configHasLabo ? 2 : 1);
    }
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
        await api.put(`/api/entreprise/activites/${editingId}`, { nom: form.nom, adresse: form.adresse, telephone: form.telephone });
        setMsg(t('client.entreprise.activity_updated'));
      } else {
        const isFirst = activites.length === 0;

        // Distinct + labo: resolve or create labo first
        let distinctLaboId: number | null = null;
        if (!isFranchise && hasLabo === true) {
          if (laboAction === 'select' && selectedLaboId) {
            distinctLaboId = Number(selectedLaboId);
          } else if (laboAction === 'create') {
            if (!laboNom.trim()) { setError('Le nom du labo est requis'); setSaving(false); return; }
            if (!laboRefLabo.trim()) { setError('La référence du labo est requise'); setSaving(false); return; }
            if (!laboTel.trim()) { setError(t('client.labo.labo_fields_required')); setSaving(false); return; }
            const { data: newLabo } = await api.post('/api/labo', {
              nom: laboNom.trim(),
              refLabo: laboRefLabo.trim(),
              referentTel: laboTel.trim(),
              adresse: laboAdresse.trim() || undefined,
            });
            distinctLaboId = newLabo.id;
          }
        }

        const payload: Record<string, unknown> = { nom: form.nom, adresse: form.adresse, telephone: form.telephone };
        if (memeActivite !== null) payload.memeActivite = memeActivite;
        if (distinctLaboId) payload.laboId = distinctLaboId;
        await api.post('/api/entreprise/activites', payload);
        if (onCreated) onCreated();
        if (isFirst && user?.onboardingStep === 2) await advanceOnboarding(3);
        closeForm();
        if (isFirst) {
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
      if (deleteTarget.kind === 'franchise-group') {
        await api.delete(`/api/entreprise/franchise-groups/${encodeURIComponent(deleteTarget.group)}`);
        window.dispatchEvent(new Event('labos-changed'));
      } else {
        await api.delete(`/api/entreprise/activites/${deleteTarget.act.id}`);
      }
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
              Gérez vos points de vente, franchises et laboratoires de production
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
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 16px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)' }}>
                🔒 Limite atteinte ({maxActivites})
              </div>
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
                ? `Votre abonnement inclut jusqu'à ${maxActivites} activités et ${maxLabos} labo(s). Choisissez le type pour démarrer.`
                : `Votre abonnement inclut jusqu'à ${maxActivites} activités. Choisissez le type pour démarrer.`
            }
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {atActiviteLimit ? (
              <div style={{ fontSize: 13, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 16px' }}>
                🔒 Limite de {maxActivites} activité(s) atteinte
              </div>
            ) : maxActivites === 1 ? (
              <button className="btn btn-primary" onClick={() => openAdd('distincte')}>
                + Ajouter mon activité
              </button>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => openAdd('franchise')} style={{ minWidth: 180 }}>
                  🔗 {maxLabos ? 'Franchise avec Labo' : t('client.entreprise.franchise_yes')}
                </button>
                <button className="btn btn-secondary" onClick={() => openAdd('distincte')} style={{ minWidth: 180 }}>
                  📍 {t('client.entreprise.franchise_no')}
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Franchise section — always visible so user can add a franchise activity */}
          <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '10px 16px', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', borderRadius: 12, border: '1px solid #bfdbfe' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.1rem' }}>🔗</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e40af' }}>{t('nav.espace_franchise')}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 20, padding: '2px 10px' }}>
                    🏭 {new Set(franchiseActivities.filter((a) => a.laboId).map((a) => a.laboId)).size} labo(s)
                  </span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, padding: '2px 10px' }}>
                    🏢 {franchiseActivities.length} activité(s)
                  </span>
                </div>
                {atActiviteLimit ? (
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '5px 12px' }}>
                    🔒 Limite atteinte
                  </span>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => openAdd('franchise')}>
                    + {t('client.entreprise.add_activity')}
                  </button>
                )}
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
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('common.activity_name', "Nom de l'activité")}</span>
                      <input
                        type="text"
                        className="input"
                        style={{ minWidth: 140 }}
                        placeholder={t('common.activity_name', "Nom de l'activité") + '…'}
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
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <h3 style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                              🏢 {group} <span style={{ fontWeight: 400, fontSize: '0.72rem', opacity: 0.7 }}>({acts.length})</span>
                            </h3>
                            <button
                              className="btn btn-danger-ghost btn-sm"
                              title={t('client.entreprise.delete_group', 'Supprimer le groupe')}
                              onClick={() => setDeleteTarget({ kind: 'franchise-group', group, laboNom: groupLabo, acts })}
                            >
                              🗑 {t('client.entreprise.delete_group', 'Supprimer le groupe')}
                            </button>
                          </div>
                          <div className="table-responsive card" style={{ marginBottom: 0 }}>
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>{t('common.name')}</th>
                                  <th style={{ width: 120 }}>{t('client.entreprise.activity_telephone')}</th>
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
                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{act.adresse || '—'}</td>
                                    {acts.some((a) => a.laboId) && (
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
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '10px 16px', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', borderRadius: 12, border: '1px solid #bbf7d0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.1rem' }}>📍</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#166534' }}>{t('nav.espace_distinct')}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '2px 10px' }}>
                    🏢 {distinctActivities.length} activité(s)
                  </span>
                </div>
                {atActiviteLimit ? (
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '5px 12px' }}>
                    🔒 Limite atteinte
                  </span>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={() => openAdd('distincte')}>
                    + {t('client.entreprise.add_activity')}
                  </button>
                )}
              </div>

              {distinctActivities.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>{t('nav.no_distinct_activity')}</p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 auto', maxWidth: 260 }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('common.activity_name', "Nom de l'activité")}</span>
                      <input
                        type="text"
                        className="input"
                        style={{ minWidth: 140 }}
                        placeholder={t('common.activity_name', "Nom de l'activité") + '…'}
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
                            <th>{t('client.entreprise.activity_adresse')}</th>
                            <th style={{ width: 140, textAlign: 'right' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDistinct.map((act) => (
                            <tr key={act.id}>
                              <td style={{ fontWeight: 700 }}>{act.nom}</td>
                              <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{act.telephone || '—'}</td>
                              <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{act.adresse || '—'}</td>
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <button className="btn btn-ghost btn-sm" title={t('client.entreprise.manage_ingredients')} onClick={() => openIngredients(act)}>🧂</button>
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
                </>
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
                    ? t('client.entreprise.edit_activity')
                    : isDuplicate
                    ? t('client.entreprise.duplicate_activity')
                    : wizardStep === 0
                    ? t('client.entreprise.add_activity')
                    : isFranchise
                    ? wizardStep === 1
                      ? '🔗 Nouveau réseau franchise'
                      : wizardStep === 2
                      ? '🏭 Laboratoire'
                      : `${franchiseName || 'Franchise'} — Activité ${franchiseStep + 1} / ${franchiseCount}`
                    : t('client.entreprise.add_activity')}
                </h2>
                {/* Franchise progress indicator */}
                {isFranchise && !editingId && !isDuplicate && wizardStep >= 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    {(configHasLabo
                      ? [{ label: 'Réseau', s: 1 }, { label: 'Labo', s: 2 }, { label: 'Détails', s: 3 }]
                      : [{ label: 'Réseau', s: 1 }, { label: 'Détails', s: 3 }]
                    ).map(({ label, s }, idx, arr) => (
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

              {/* ── STEP 0: Type selection ── */}
              {wizardStep === 0 && !editingId && !isDuplicate && (
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ margin: '0 0 4px', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    Choisissez le type d'activité à créer
                  </p>
                  <button
                    type="button"
                    onClick={() => { setMemeActivite(true); setHasLabo(configHasLabo ? null : false); setWizardStep(1); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 12, border: '2px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  >
                    <span style={{ fontSize: '1.8rem', flexShrink: 0 }}>🔗</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>Franchise</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 3 }}>Plusieurs points de vente partageant les mêmes recettes</div>
                    </div>
                    <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '1.1rem' }}>›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMemeActivite(false); setHasLabo(configHasLabo ? null : false); setWizardStep(1); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 12, border: '2px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  >
                    <span style={{ fontSize: '1.8rem', flexShrink: 0 }}>📍</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>Activité distincte</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 3 }}>Point de vente indépendant avec sa propre gestion</div>
                    </div>
                    <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '1.1rem' }}>›</span>
                  </button>
                </div>
              )}

              {/* ── STEP 1A: Franchise setup (name + count) ── */}
              {wizardStep === 1 && isFranchise && !editingId && !isDuplicate && (
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 600 }}>Nom du réseau *</label>
                    <input
                      type="text"
                      placeholder={t('client.entreprise.franchise_name_placeholder')}
                      value={franchiseName}
                      onChange={(e) => setFranchiseName(e.target.value)}
                      autoFocus
                      style={franchiseNameConflict ? { borderColor: 'var(--danger, #ef4444)' } : undefined}
                    />
                    {franchiseNameConflict && (
                      <p style={{ color: 'var(--danger, #ef4444)', fontSize: '0.78rem', margin: '4px 0 0' }}>
                        {t('client.entreprise.franchise_name_exists', { name: franchiseName.trim() })}
                      </p>
                    )}
                  </div>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 600 }}>
                      {t('client.entreprise.franchise_count')} *{' '}
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        (min. 2{maxActivites !== null ? `, max. ${maxActivites - activites.length} disponibles` : ''})
                      </span>
                    </label>
                    <input
                      type="number"
                      min="2"
                      max={maxActivites !== null ? maxActivites - activites.length : 20}
                      value={nombreActivites}
                      onChange={(e) => handleNombreActivitesChange(e.target.value)}
                      style={{ width: 90 }}
                    />
                  </div>
                </div>
              )}

              {/* ── STEP 1B: Distinct new / Edit / Duplicate ── */}
              {wizardStep === 1 && (!isFranchise || editingId || isDuplicate) && (
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 600 }}>{t('client.entreprise.activity_nom')} *</label>
                    <input
                      type="text"
                      value={form.nom}
                      onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                      autoFocus
                      style={distinctNameConflict ? { borderColor: 'var(--danger, #ef4444)' } : undefined}
                    />
                    {distinctNameConflict && (
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
                  {/* Optional labo for distinct new */}
                  {!editingId && !isDuplicate && configHasLabo && (
                    <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                      <p style={{ margin: '0 0 10px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Laboratoire (optionnel)
                      </p>
                      <div style={{ display: 'flex', gap: 10, marginBottom: hasLabo === true ? 14 : 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: `2px solid ${hasLabo !== true ? 'var(--primary)' : 'var(--border)'}`, background: hasLabo !== true ? 'var(--primary-light, #eef2ff)' : 'var(--surface)', cursor: 'pointer', flex: 1, fontSize: '0.88rem', fontWeight: 600 }}>
                          <input type="radio" checked={hasLabo !== true} onChange={() => { setHasLabo(false); setLaboAction(null); }} style={{ accentColor: 'var(--primary)' }} />
                          Sans labo
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: `2px solid ${hasLabo === true ? 'var(--primary)' : 'var(--border)'}`, background: hasLabo === true ? 'var(--primary-light, #eef2ff)' : 'var(--surface)', cursor: 'pointer', flex: 1, fontSize: '0.88rem', fontWeight: 600 }}>
                          <input type="radio" checked={hasLabo === true} onChange={() => { setHasLabo(true); setLaboAction(null); setSelectedLaboId(''); }} style={{ accentColor: 'var(--primary)' }} />
                          🏭 Avec labo
                        </label>
                      </div>
                      {hasLabo === true && (
                        <LaboSelectOrCreate
                          labos={labos}
                          laboAction={laboAction}
                          setLaboAction={setLaboAction}
                          selectedLaboId={selectedLaboId}
                          setSelectedLaboId={setSelectedLaboId}
                          laboNom={laboNom} setLaboNom={setLaboNom}
                          laboRefLabo={laboRefLabo} setLaboRefLabo={setLaboRefLabo}
                          laboTel={laboTel} setLaboTel={setLaboTel}
                          laboAdresse={laboAdresse} setLaboAdresse={setLaboAdresse}
                          atLaboLimit={atLaboLimit}
                          maxLabos={maxLabos}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── STEP 2: Franchise labo ── */}
              {wizardStep === 2 && isFranchise && !editingId && !isDuplicate && (
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    Le réseau <strong>{franchiseName}</strong> sera-t-il approvisionné par un laboratoire central ?
                  </p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px', borderRadius: 12, border: `2px solid ${hasLabo === true ? 'var(--primary)' : 'var(--border)'}`, background: hasLabo === true ? 'var(--primary-light, #eef2ff)' : 'var(--surface)', cursor: 'pointer', flex: 1 }}>
                      <input type="radio" checked={hasLabo === true} onChange={() => { setHasLabo(true); setLaboAction(null); setSelectedLaboId(''); }} style={{ accentColor: 'var(--primary)', marginTop: 3 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>🏭 Avec labo</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>Un labo central approvisionne toutes les franchises</div>
                      </div>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px', borderRadius: 12, border: `2px solid ${hasLabo === false ? 'var(--primary)' : 'var(--border)'}`, background: hasLabo === false ? 'var(--primary-light, #eef2ff)' : 'var(--surface)', cursor: 'pointer', flex: 1 }}>
                      <input type="radio" checked={hasLabo === false} onChange={() => { setHasLabo(false); setLaboAction(null); }} style={{ accentColor: 'var(--primary)', marginTop: 3 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>📋 Sans labo</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>Gestion des ingrédients par activité</div>
                      </div>
                    </label>
                  </div>
                  {hasLabo === true && (
                    <LaboSelectOrCreate
                      labos={labos}
                      laboAction={laboAction}
                      setLaboAction={setLaboAction}
                      selectedLaboId={selectedLaboId}
                      setSelectedLaboId={setSelectedLaboId}
                      laboNom={laboNom} setLaboNom={setLaboNom}
                      laboRefLabo={laboRefLabo} setLaboRefLabo={setLaboRefLabo}
                      laboTel={laboTel} setLaboTel={setLaboTel}
                      laboAdresse={laboAdresse} setLaboAdresse={setLaboAdresse}
                      atLaboLimit={atLaboLimit}
                      maxLabos={maxLabos}
                    />
                  )}
                </div>
              )}

              {/* ── STEP 3: Per-activity details ── */}
              {wizardStep === 3 && isFranchise && !editingId && !isDuplicate && (
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Progress bar */}
                  {franchiseCount > 2 && (
                    <div style={{ display: 'flex', gap: 3, marginBottom: 2 }}>
                      {Array.from({ length: franchiseCount }, (_, i) => (
                        <div key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: i < franchiseStep ? '#22c55e' : i === franchiseStep ? 'var(--primary)' : '#e5e7eb' }} />
                      ))}
                    </div>
                  )}
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.78rem' }}>Nom de l'activité</label>
                    <input
                      type="text"
                      value={`${franchiseName.trim()} ${franchiseStep + 1}`}
                      disabled
                      style={{ background: '#f8fafc', color: 'var(--text-muted)' }}
                    />
                  </div>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 600 }}>
                      {t('client.entreprise.activity_telephone')} *{' '}
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.78rem' }}>{t('validation.phone_hint')}</span>
                    </label>
                    <input
                      type="text"
                      placeholder={t('validation.phone_placeholder')}
                      value={franchiseForms[franchiseStep]?.telephone ?? ''}
                      onChange={(e) => updateFranchiseForm('telephone', e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="form-field" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: 600 }}>{t('client.entreprise.activity_adresse')} *</label>
                    <textarea
                      value={franchiseForms[franchiseStep]?.adresse ?? ''}
                      onChange={(e) => updateFranchiseForm('adresse', e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {error && (
                <p style={{ margin: '0 20px 12px', color: 'var(--danger, #ef4444)', fontSize: '0.82rem', fontWeight: 500 }}>
                  ⚠ {error}
                </p>
              )}

              {/* Footer */}
              <div className="modal-footer">
                {/* Left: Cancel or Back */}
                {wizardStep <= 1 ? (
                  <button type="button" className="btn btn-secondary" onClick={closeForm}>
                    {t('common.cancel')}
                  </button>
                ) : wizardStep === 2 ? (
                  <button type="button" className="btn btn-secondary" onClick={() => { setWizardStep(1); setError(''); }}>
                    ‹ {t('client.entreprise.previous')}
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary" onClick={handleActivityBack}>
                    ‹ {t('client.entreprise.previous')}
                  </button>
                )}

                {/* Right: Forward or Save */}
                {wizardStep === 0 ? null
                  : wizardStep === 1 && isFranchise && !editingId && !isDuplicate ? (
                  <button type="button" className="btn btn-primary" onClick={handleFranchiseSetupNext}>
                    Suivant ›
                  </button>
                ) : wizardStep === 1 ? (
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving || distinctNameConflict || !form.nom.trim()}
                  >
                    {saving ? t('common.loading') : t('common.save')}
                  </button>
                ) : wizardStep === 2 ? (
                  <button type="button" className="btn btn-primary" onClick={handleLaboStepNext} disabled={hasLabo === null}>
                    Suivant ›
                  </button>
                ) : franchiseStep < franchiseCount - 1 ? (
                  <button type="button" className="btn btn-primary" onClick={handleFranchiseNext} disabled={saving}>
                    Suivant ›{' '}
                    <span style={{ opacity: 0.7, fontSize: '0.78rem' }}>({franchiseStep + 1}/{franchiseCount})</span>
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={handleFranchiseSave} disabled={saving}>
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

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 style={{ color: '#dc2626', margin: 0 }}>⚠️ {t('client.entreprise.confirm_delete_title', 'Confirmer la suppression')}</h2>
            </div>
            <div className="modal-body">
              {deleteTarget.kind === 'franchise-group' ? (
                <>
                  <p style={{ marginBottom: 12 }}>
                    {t('client.entreprise.delete_group_warning', 'Cette action va supprimer définitivement le groupe franchise et toutes ses dépendances :')}
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <li style={{ fontWeight: 700, fontSize: '1rem' }}>🏢 {deleteTarget.group}</li>
                    {deleteTarget.laboNom && (
                      <li style={{ color: '#7c3aed', fontWeight: 600 }}>🏭 {t('client.entreprise.labo', 'Labo')} : {deleteTarget.laboNom}</li>
                    )}
                    <li style={{ marginTop: 4, fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {t('client.entreprise.activities_section', 'Activités')} ({deleteTarget.acts.length})
                    </li>
                    {deleteTarget.acts.map((a) => (
                      <li key={a.id} style={{ paddingLeft: 12, color: 'var(--text-muted)', fontSize: '0.88rem' }}>• {a.nom}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>
                  {t('client.entreprise.delete_activity_warning', 'Supprimer l\'activité')} <strong>{deleteTarget.act.nom}</strong> ?
                </p>
              )}
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
