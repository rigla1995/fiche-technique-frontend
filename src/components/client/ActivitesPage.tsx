import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, ActiviteIngredient, Labo } from '../../types';

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
}
function LaboSelectOrCreate({ labos, laboAction, setLaboAction, selectedLaboId, setSelectedLaboId, laboNom, setLaboNom, laboRefLabo, setLaboRefLabo, laboTel, setLaboTel, laboAdresse, setLaboAdresse }: LaboSelectOrCreateProps) {
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, border: `2px solid ${laboAction === 'create' ? 'var(--primary)' : 'var(--border)'}`, background: laboAction === 'create' ? 'var(--primary-light, #eef2ff)' : 'white', fontWeight: 600, fontSize: '0.85rem' }}>
          <input type="radio" checked={laboAction === 'create'} onChange={() => setLaboAction('create')} style={{ accentColor: 'var(--primary)' }} />
          Créer un nouveau labo
        </label>
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
  const [labos, setLabos] = useState<Labo[]>([]);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [actRes, laboRes] = await Promise.all([
        api.get('/api/entreprise/activites'),
        api.get('/api/labo'),
      ]);
      setActivites(actRes.data);
      setLabos(laboRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const isFranchise = memeActivite === true;

  const openAdd = (preType?: 'franchise' | 'franchise_labo' | 'distincte') => {
    setEditingId(null);
    setIsDuplicate(false);
    setForm(emptyForm());
    setMemeActivite(preType === 'franchise' || preType === 'franchise_labo' ? true : preType === 'distincte' ? false : null);
    setNombreActivites('2');
    setFranchiseName('');
    setFranchiseStep(0);
    setFranchiseForms([emptyFranchiseStep(), emptyFranchiseStep()]);
    setHasLabo(preType === 'franchise_labo' ? true : null);
    setLaboAction(null);
    setSelectedLaboId('');
    setLaboNom('');
    setLaboRefLabo('');
    setLaboTel('');
    setLaboAdresse('');
    setLaboWizardStep('choice');
    setError('');
    setShowForm(true);
  };

  const openEdit = (act: Activite) => {
    setEditingId(act.id);
    setIsDuplicate(false);
    setForm({ nom: act.nom, adresse: act.adresse || '', telephone: act.telephone || '' });
    setMemeActivite(null);
    setNombreActivites('1');
    setError('');
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
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>🏭 {new Set(activites.filter((a) => a.laboId).map((a) => a.laboId)).size} labo(s)</span>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span>🏢 {activites.length} {t('client.entreprise.activities_section').toLowerCase()}</span>
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
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 20, padding: '2px 10px' }}>
                    🏭 {new Set(franchiseActivities.filter((a) => a.laboId).map((a) => a.laboId)).size}
                  </span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', border: '1px solid #bfdbfe', borderRadius: 20, padding: '2px 10px' }}>
                    🏢 {franchiseActivities.length}
                  </span>
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
            <div style={{ marginBottom: 36 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 4, height: 22, borderRadius: 4, background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)', display: 'inline-block', flexShrink: 0 }} />
                  <h2 style={{ fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text)', margin: 0 }}>
                    {t('nav.espace_distinct')}
                  </h2>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 20, padding: '2px 10px' }}>
                    🏢 {distinctActivities.length}
                  </span>
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
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.95rem' }}>{t('client.entreprise.franchise_question')}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 10, border: '2px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', transition: 'border-color 0.15s' }}
                      onClick={() => setMemeActivite(true)}>
                      <span style={{ fontSize: '1.4rem', marginTop: 2 }}>🏪</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t('client.entreprise.franchise_yes')}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>Plusieurs points de vente partageant les mêmes ingrédients</div>
                      </div>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 10, border: '2px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', transition: 'border-color 0.15s' }}
                      onClick={() => { setMemeActivite(true); setHasLabo(true); }}>
                      <span style={{ fontSize: '1.4rem', marginTop: 2 }}>🏭</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Franchise avec Labo <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8rem' }}>(gestion séparée)</span></div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>Franchises approvisionnées par un labo central — nécessite min. 2 franchises</div>
                      </div>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 10, border: '2px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', transition: 'border-color 0.15s' }}
                      onClick={() => setMemeActivite(false)}>
                      <span style={{ fontSize: '1.4rem', marginTop: 2 }}>🏬</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t('client.entreprise.franchise_no')}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>Activité avec sa propre gestion indépendante</div>
                      </div>
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
                          <input type="radio" name="hasLabo" checked={hasLabo === true} onChange={() => { setHasLabo(true); setLaboAction(null); setSelectedLaboId(''); }} style={{ accentColor: 'var(--primary)' }} />
                          🏭 {t('client.labo.avec_labo')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: `2px solid ${hasLabo === false ? 'var(--primary)' : 'var(--border)'}`, background: hasLabo === false ? 'var(--primary-light, #eef2ff)' : 'var(--surface)', cursor: 'pointer', flex: 1, fontWeight: 600, fontSize: '0.9rem' }}>
                          <input type="radio" name="hasLabo" checked={hasLabo === false} onChange={() => { setHasLabo(false); setLaboAction(null); }} style={{ accentColor: 'var(--primary)' }} />
                          📋 {t('client.labo.gestion_separee')}
                        </label>
                      </div>

                      {/* Labo: select existing or create new */}
                      {hasLabo === true && <LaboSelectOrCreate
                        labos={labos}
                        laboAction={laboAction}
                        setLaboAction={setLaboAction}
                        selectedLaboId={selectedLaboId}
                        setSelectedLaboId={setSelectedLaboId}
                        laboNom={laboNom}
                        setLaboNom={setLaboNom}
                        laboRefLabo={laboRefLabo}
                        setLaboRefLabo={setLaboRefLabo}
                        laboTel={laboTel}
                        setLaboTel={setLaboTel}
                        laboAdresse={laboAdresse}
                        setLaboAdresse={setLaboAdresse}
                      />}
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
                  {/* Distinct + labo option (not shown when editing) */}
                  {!editingId && !isDuplicate && !isFranchise && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
                      <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {t('client.labo.labo_choice_label')}
                      </p>
                      <div style={{ display: 'flex', gap: 10, marginBottom: hasLabo ? 14 : 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: `2px solid ${hasLabo === true ? 'var(--primary)' : 'var(--border)'}`, background: hasLabo === true ? 'var(--primary-light, #eef2ff)' : 'var(--surface)', cursor: 'pointer', flex: 1, fontWeight: 600, fontSize: '0.88rem' }}>
                          <input type="radio" name="hasLaboDistinct" checked={hasLabo === true} onChange={() => { setHasLabo(true); setLaboAction(null); setSelectedLaboId(''); }} style={{ accentColor: 'var(--primary)' }} />
                          🏭 {t('client.labo.avec_labo')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: `2px solid ${hasLabo === false ? 'var(--primary)' : 'var(--border)'}`, background: hasLabo === false ? 'var(--primary-light, #eef2ff)' : 'var(--surface)', cursor: 'pointer', flex: 1, fontWeight: 600, fontSize: '0.88rem' }}>
                          <input type="radio" name="hasLaboDistinct" checked={hasLabo === false} onChange={() => { setHasLabo(false); setLaboAction(null); }} style={{ accentColor: 'var(--primary)' }} />
                          📋 {t('client.labo.gestion_separee')}
                        </label>
                      </div>
                      {hasLabo === true && <LaboSelectOrCreate
                        labos={labos}
                        laboAction={laboAction}
                        setLaboAction={setLaboAction}
                        selectedLaboId={selectedLaboId}
                        setSelectedLaboId={setSelectedLaboId}
                        laboNom={laboNom}
                        setLaboNom={setLaboNom}
                        laboRefLabo={laboRefLabo}
                        setLaboRefLabo={setLaboRefLabo}
                        laboTel={laboTel}
                        setLaboTel={setLaboTel}
                        laboAdresse={laboAdresse}
                        setLaboAdresse={setLaboAdresse}
                      />}
                    </div>
                  )}
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
                    ) : (() => {
                      const laboReady = hasLabo === false || (hasLabo === true && laboAction !== null && (laboAction === 'select' ? !!selectedLaboId : true));
                      return (
                        <button type="button" className="btn btn-primary" onClick={franchiseUnlocked && laboReady ? handleFranchiseSave : undefined} disabled={saving || !franchiseUnlocked || hasLabo === null || !laboReady}>
                          {saving ? t('common.loading') : t('common.save')}
                        </button>
                      );
                    })()}
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

      {/* Labo detail popup */}
      {laboPopup && (
        <div className="modal-overlay" onClick={() => setLaboPopup(null)}>
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
