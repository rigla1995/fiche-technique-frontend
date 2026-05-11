import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useSelection } from '../../context/SelectionContext';
import type { Activite, Labo, ActiviteIngredient } from '../../types';

interface GlobalIngredient {
  id: number;
  nom: string;
  unite: string;
  categorie: string;
  categorieId: number | null;
  selected: boolean;
}

// ─── Ingredient list with toggles ────────────────────────────────────────────

function IngredientList({
  ingredients,
  toggling,
  filterCategory,
  filterIngId,
  filterName,
  onToggle,
  readOnly,
}: {
  ingredients: GlobalIngredient[];
  toggling: number | null;
  filterCategory: string;
  filterIngId: number | '';
  filterName: string;
  onToggle: (id: number) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [catPage, setCatPage] = useState(1);
  const CAT_PAGE_SIZE = 10;

  const filtered = ingredients.filter((i) => {
    const catOk = !filterCategory || i.categorie === filterCategory;
    const ingOk = !filterIngId || i.id === filterIngId;
    const nameOk = !filterName || i.nom.toLowerCase().includes(filterName.toLowerCase());
    return catOk && ingOk && nameOk;
  });

  const groups: Record<string, GlobalIngredient[]> = {};
  for (const i of filtered) {
    if (!groups[i.categorie]) groups[i.categorie] = [];
    groups[i.categorie].push(i);
  }

  const selectedCount = ingredients.filter((i) => i.selected).length;

  const toggleCat = (cat: string) => setOpenCats((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });

  return (
    <>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
        {selectedCount} / {ingredients.length} {t('global_catalogue.selected_count', 'ingrédient(s) sélectionné(s)')}
      </p>
      {filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
          <span style={{ fontSize: '2rem', marginBottom: 8 }}>🏷</span>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>{t('common.no_result')}</p>
        </div>
      ) : (() => {
        const sortedGroups = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
        const totalCatPages = Math.max(1, Math.ceil(sortedGroups.length / CAT_PAGE_SIZE));
        const pagedGroups = sortedGroups.slice((catPage - 1) * CAT_PAGE_SIZE, catPage * CAT_PAGE_SIZE);
        return (<>
          {pagedGroups.map(([cat, items]) => {
            const isOpen = openCats.has(cat);
            return (
            <div key={cat} style={{ marginBottom: 8 }}>
              <button onClick={() => toggleCat(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', width: '100%', textAlign: 'left', borderBottom: '2px solid #c7d2fe', marginBottom: isOpen ? 8 : 0 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏷 {cat}</span>
                <span style={{ fontWeight: 400, fontSize: '0.72rem', color: 'var(--text-muted)' }}>({items.filter((i) => i.selected).length}/{items.length})</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
              </button>
              {isOpen && (
              <div className="table-responsive card" style={{ marginBottom: 0 }}>
                <table className="table">
                  <thead style={{ background: 'linear-gradient(135deg, #1e1b4b, #4338ca)' }}>
                    <tr>
                      <th style={{ width: 40, color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}></th>
                      <th style={{ color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('common.name')}</th>
                      <th style={{ width: 100, color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('common.unit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((ing) => (
                      <tr key={ing.id} style={{ background: ing.selected ? 'var(--primary-light)' : undefined }}>
                        <td style={{ textAlign: 'center' }}>
                          {readOnly ? (
                            <span style={{ fontSize: '1.1rem', color: ing.selected ? 'var(--success)' : 'var(--text-muted)' }}>
                              {ing.selected ? '✅' : '○'}
                            </span>
                          ) : (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: '1.1rem', padding: '2px 6px', color: ing.selected ? 'var(--success)' : 'var(--text-muted)' }}
                              disabled={toggling === ing.id}
                              onClick={() => onToggle(ing.id)}
                            >
                              {toggling === ing.id ? '…' : ing.selected ? '✅' : '○'}
                            </button>
                          )}
                        </td>
                        <td style={{ fontWeight: ing.selected ? 600 : 400 }}>{ing.nom}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{ing.unite}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
            );
          })}
          {totalCatPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 8, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              <button className="btn btn-ghost btn-sm" disabled={catPage === 1} onClick={() => setCatPage((p) => Math.max(1, p - 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>‹</button>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{catPage} / {totalCatPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={catPage === totalCatPages} onClick={() => setCatPage((p) => Math.min(totalCatPages, p + 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>›</button>
            </div>
          )}
        </>);
      })()}
    </>
  );
}

// ─── Filters bar ─────────────────────────────────────────────────────────────

function FiltersBar({
  categories,
  ingredients,
  filterCategory,
  filterIngId,
  filterName,
  onCatChange,
  onIngChange,
  onNameChange,
}: {
  categories: string[];
  ingredients: GlobalIngredient[];
  filterCategory: string;
  filterIngId: number | '';
  filterName: string;
  onCatChange: (v: string) => void;
  onIngChange: (v: number | '') => void;
  onNameChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const ingredientsInCat = filterCategory ? ingredients.filter((i) => i.categorie === filterCategory) : ingredients;
  const hasFilter = filterCategory || filterIngId !== '' || filterName;
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)' }}>Filtres</span>
        {hasFilter && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => { onCatChange(''); onIngChange(''); onNameChange(''); }}>✕ Réinitialiser</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 20px' }}>
        <div>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Catégorie</span>
          <select className="input" style={{ width: '100%' }} value={filterCategory} onChange={(e) => { onCatChange(e.target.value); onIngChange(''); }}>
            <option value="">{t('common.all_categories', 'Toutes catégories')}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Ingrédient</span>
          <select className="input" style={{ width: '100%' }} value={filterIngId}
            disabled={!filterCategory}
            onChange={(e) => onIngChange(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">— Tous —</option>
            {ingredientsInCat.map((i) => <option key={i.id} value={i.id}>{i.nom}</option>)}
          </select>
        </div>
        <div>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Nom</span>
          <input type="text" className="input" style={{ width: '100%' }} placeholder="Rechercher…"
            value={filterName} onChange={(e) => onNameChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GlobalCataloguePage() {
  const { t } = useTranslation();
  const { user, canWrite, advanceOnboarding } = useAuth();
  const { refreshSelections } = useSelection();

  const isEntreprise = user?.compteType === 'entreprise' || !user?.compteType;

  // Common state
  const [ingredients, setIngredients] = useState<GlobalIngredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterIngId, setFilterIngId] = useState<number | ''>('');
  const [filterName, setFilterName] = useState('');

  // Entreprise-only state
  const [activites, setActivites] = useState<Activite[]>([]);
  const [labos, setLabos] = useState<Labo[]>([]);
  const [activeType, setActiveType] = useState<'franchise' | 'distinct'>('franchise');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedActId, setSelectedActId] = useState<number | null>(null);

  // Load entreprise activity/labo data
  useEffect(() => {
    if (!isEntreprise) return;
    api.get('/api/entreprise/activites').then(({ data }) => {
      const acts: Activite[] = data;
      setActivites(acts);
      const franchiseActs = acts.filter((a) => a.type === 'franchise');
      const groups = Array.from(new Set(franchiseActs.map((a) => a.franchiseGroup || a.nom)));
      if (groups.length > 0) setSelectedGroup(groups[0]);
      const distinctActs = acts.filter((a) => a.type !== 'franchise');
      if (distinctActs.length > 0) setSelectedActId(distinctActs[0].id);
    });
    api.get('/api/labo').then(({ data }) => setLabos(data));
  }, [isEntreprise]);

  // Derived values for entreprise
  const franchiseGroups = Array.from(new Set(
    activites.filter((a) => a.type === 'franchise').map((a) => a.franchiseGroup || a.nom)
  )).sort();

  const distinctActivities = activites.filter((a) => a.type !== 'franchise');

  // Find labo for selected franchise group
  const groupLabo = labos.find((l) => l.franchiseGroup.toLowerCase() === selectedGroup.toLowerCase()) ?? null;

  // Find franchise activities in selected group (for gestion séparée)
  const groupActivities = activites.filter(
    (a) => a.type === 'franchise' && (a.franchiseGroup || a.nom).toLowerCase() === selectedGroup.toLowerCase()
  );
  const isGestionSeparee = !groupLabo;

  // For gestion séparée: pick first activity of the group as selector
  const [selectedFranchiseActId, setSelectedFranchiseActId] = useState<number | null>(null);
  useEffect(() => {
    if (groupActivities.length > 0) setSelectedFranchiseActId(groupActivities[0].id);
  }, [selectedGroup, groupActivities.length]);

  // Load ingredients based on current context
  const load = useCallback(async () => {
    setIngredients([]);
    setFilterCategory('');
    setFilterIngId('');
    setFilterName('');

    if (!isEntreprise) {
      // Indépendant: load all admin ingredients with client selection state
      setLoading(true);
      try {
        const { data } = await api.get('/ingredients');
        setIngredients((data as Array<{ id: number; nom?: string; name?: string; unite?: string; unitName?: string; categorieName?: string; selected: boolean }>).map((i) => ({
          id: i.id,
          nom: i.nom ?? i.name ?? '',
          unite: i.unite ?? i.unitName ?? '',
          categorie: i.categorieName ?? t('client.ingredients_catalog.no_category', 'Sans catégorie'),
          categorieId: null,
          selected: !!i.selected,
        })));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (activeType === 'franchise') {
      if (!selectedGroup) return;
      if (groupLabo) {
        // Labo case: load all admin ingredients with labo selection state
        setLoading(true);
        try {
          const { data } = await api.get(`/api/labo/${groupLabo.id}/ingredients`);
          setIngredients((data as GlobalIngredient[]).map((i) => ({ ...i })));
        } finally {
          setLoading(false);
        }
      } else if (selectedFranchiseActId) {
        // Gestion séparée: load activity ingredients
        setLoading(true);
        try {
          const { data } = await api.get(`/api/entreprise/activites/${selectedFranchiseActId}/ingredients`);
          setIngredients((data as ActiviteIngredient[]).map((i) => ({ ...i })));
        } finally {
          setLoading(false);
        }
      }
    } else {
      // Distinct
      if (!selectedActId) return;
      setLoading(true);
      try {
        const { data } = await api.get(`/api/entreprise/activites/${selectedActId}/ingredients`);
        setIngredients((data as ActiviteIngredient[]).map((i) => ({ ...i })));
      } finally {
        setLoading(false);
      }
    }
  }, [isEntreprise, activeType, selectedGroup, groupLabo, selectedFranchiseActId, selectedActId, t]);

  useEffect(() => { load(); }, [load]);

  const [deselectModal, setDeselectModal] = useState<{ ingId: number; ingName: string; approCount: number; inventaireCount: number; actId?: number | null } | null>(null);

  const toggle = async (ingId: number) => {
    const ing = ingredients.find((i) => i.id === ingId);
    if (!ing) return;

    if (ing.selected) {
      setToggling(ingId);
      try {
        if (!isEntreprise) {
          const { data } = await api.get(`/api/stock/client/${ingId}/cascade-info`);
          setToggling(null);
          setDeselectModal({ ingId, ingName: ing.nom, approCount: data.approCount ?? 0, inventaireCount: data.inventaireCount ?? 0 });
          return;
        } else if (activeType !== 'franchise' || !groupLabo) {
          const actId = activeType === 'franchise' ? selectedFranchiseActId : selectedActId;
          if (actId) {
            const { data } = await api.get(`/api/stock/entreprise/${actId}/${ingId}/cascade-info`);
            setToggling(null);
            setDeselectModal({ ingId, ingName: ing.nom, approCount: data.approCount ?? 0, inventaireCount: data.inventaireCount ?? 0, actId });
            return;
          }
          setToggling(null);
        } else {
          setToggling(null);
        }
      } catch {
        setToggling(null);
        setDeselectModal({ ingId, ingName: ing.nom, approCount: 0, inventaireCount: 0 });
        return;
      }
    }

    await doToggle(ingId);
  };

  const doToggle = async (ingId: number, deleteHistory = false) => {
    setToggling(ingId);
    try {
      let data: { selected: boolean };
      if (!isEntreprise) {
        ({ data } = await api.post(`/ingredients/${ingId}/select`));
        refreshSelections();
        if (data.selected && user?.onboardingStep === 3) await advanceOnboarding(0);
        if (deleteHistory) await api.delete(`/api/stock/client/${ingId}/all-history`);
      } else if (activeType === 'franchise' && groupLabo) {
        ({ data } = await api.post(`/api/labo/${groupLabo.id}/ingredients/${ingId}/select`));
        if (user?.onboardingStep === 3) await advanceOnboarding(0);
      } else {
        const actId = activeType === 'franchise' ? selectedFranchiseActId : selectedActId;
        if (!actId) return;
        ({ data } = await api.post(`/api/entreprise/activites/${actId}/ingredients/${ingId}/select`));
        if (user?.onboardingStep === 3) await advanceOnboarding(0);
        if (deleteHistory) await api.delete(`/api/stock/entreprise/${actId}/${ingId}/all-history`);
      }
      setIngredients((prev) => prev.map((i) => (i.id === ingId ? { ...i, selected: data.selected } : i)));
    } finally {
      setToggling(null);
    }
  };

  const categories = Array.from(new Set(ingredients.map((i) => i.categorie))).sort();

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="page-content">
      {/* ── Hero header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #6366f1 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏷</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>{t('nav.catalogue_global', 'Catalogue Global')}</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.88rem', margin: 0 }}>
            {t('global_catalogue.subtitle', 'Sélectionnez les ingrédients à inclure dans votre catalogue. Les pages Catalogue Ingrédients affichent uniquement les ingrédients sélectionnés ici.')}
          </p>
        </div>
      </div>

      {/* Entreprise type + context selector */}
      {isEntreprise && (
        <div style={{ marginBottom: 20 }}>
          {/* Type tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['franchise', 'distinct'] as const).map((type) => (
              <button
                key={type}
                className="btn btn-sm"
                style={activeType === type
                  ? { background: 'linear-gradient(135deg, #4338ca, #6366f1)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, padding: '8px 18px' }
                  : { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, padding: '8px 18px' }
                }
                onClick={() => { setActiveType(type); setIngredients([]); }}
              >
                {type === 'franchise' ? `🔗 ${t('nav.espace_franchise', 'Espace Franchise')}` : `📍 ${t('nav.espace_distinct', 'Espace Distinct')}`}
              </button>
            ))}
          </div>

          {/* Franchise context */}
          {activeType === 'franchise' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
              {franchiseGroups.length === 0 ? (
                <p className="text-muted">{t('nav.no_franchise_activity', 'Aucune activité franchise')}</p>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('client.entreprise.franchise_name', 'Franchise')}</label>
                    <select className="input" style={{ maxWidth: 220 }} value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
                      {franchiseGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>

                  {groupLabo ? (
                    <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem', color: '#3730a3' }}>
                      🏭 {t('global_catalogue.labo_mode', 'Assignation au niveau Labo')} — <strong>{groupLabo.nom}</strong>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('client.entreprise.activity_nom', 'Activité')}</label>
                        <select className="input" style={{ maxWidth: 220 }} value={selectedFranchiseActId ?? ''} onChange={(e) => setSelectedFranchiseActId(Number(e.target.value))}>
                          {groupActivities.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                        </select>
                      </div>
                      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem', color: '#c2410c' }}>
                        📋 {t('global_catalogue.gestion_separee_mode', 'Gestion Séparée — assignation par activité')}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Distinct context */}
          {activeType === 'distinct' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
              {distinctActivities.length === 0 ? (
                <p className="text-muted">{t('nav.no_distinct_activity', 'Aucune activité distincte')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('client.entreprise.activity_nom', 'Activité')}</label>
                  <select className="input" style={{ maxWidth: 260 }} value={selectedActId ?? ''} onChange={(e) => setSelectedActId(Number(e.target.value))}>
                    {distinctActivities.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      {ingredients.length > 0 && (
        <FiltersBar
          categories={categories}
          ingredients={ingredients}
          filterCategory={filterCategory}
          filterIngId={filterIngId}
          filterName={filterName}
          onCatChange={setFilterCategory}
          onIngChange={setFilterIngId}
          onNameChange={setFilterName}
        />
      )}

      {/* Ingredient list */}
      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : ingredients.length === 0 && !loading ? (
        <div className="empty-state">
          <span className="empty-icon">🧂</span>
          <p>{t('global_catalogue.select_context', 'Sélectionnez un contexte ci-dessus pour afficher les ingrédients.')}</p>
        </div>
      ) : (
        <IngredientList
          ingredients={ingredients}
          toggling={toggling}
          filterCategory={filterCategory}
          filterIngId={filterIngId}
          filterName={filterName}
          onToggle={toggle}
          readOnly={!canWrite}
        />
      )}

      {/* Link to catalogue pages */}
      {!isEntreprise && (
        <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem' }}>
          📋 {t('global_catalogue.view_catalogue_hint', 'Voir les ingrédients sélectionnés dans')} →{' '}
          <Link to="/client/ingredients" style={{ color: 'var(--primary)', fontWeight: 600 }}>
            {t('nav.ingredients_catalog', 'Catalogue Ingrédients')}
          </Link>
        </div>
      )}

      {deselectModal && (() => {
        const hasCascade = deselectModal.approCount > 0 || deselectModal.inventaireCount > 0;
        return (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header" style={{ background: hasCascade ? 'linear-gradient(135deg, #7c2d12, #dc2626)' : 'linear-gradient(135deg, #b91c1c, #dc2626)', borderRadius: '12px 12px 0 0', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                  {hasCascade ? '⚠️ Désassignation avec cascade' : '⚠️ Désassigner l\'ingrédient'}
                </h2>
                <button onClick={() => setDeselectModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1 }}>×</button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: '#f8faff', borderRadius: 8, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{deselectModal.ingName}</div>
                </div>
                {hasCascade ? (
                  <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontWeight: 800, color: '#b91c1c', fontSize: '0.88rem', marginBottom: 6 }}>
                      ⚠️ Cette désassignation entraîne des effets en cascade :
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.83rem', color: '#7f1d1d', lineHeight: 1.7 }}>
                      {deselectModal.approCount > 0 && (
                        <li><strong>{deselectModal.approCount}</strong> approvisionnement{deselectModal.approCount > 1 ? 's' : ''} supprimé{deselectModal.approCount > 1 ? 's' : ''}</li>
                      )}
                      {deselectModal.inventaireCount > 0 && (
                        <li><strong>{deselectModal.inventaireCount}</strong> inventaire{deselectModal.inventaireCount > 1 ? 's' : ''} supprimé{deselectModal.inventaireCount > 1 ? 's' : ''}</li>
                      )}
                      <li>Recalcul du stock de l'activité</li>
                    </ul>
                  </div>
                ) : null}
                <div style={{ background: '#fff7ed', border: '1px solid #fbd38d', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>
                  🔒 Action irréversible — cette suppression ne peut pas être annulée.
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-ghost" onClick={() => setDeselectModal(null)}>Annuler</button>
                <button
                  style={{ background: 'linear-gradient(135deg, #b91c1c, #dc2626)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, padding: '10px 22px', cursor: 'pointer' }}
                  onClick={async () => {
                    const m = deselectModal;
                    setDeselectModal(null);
                    await doToggle(m.ingId, m.approCount > 0 || m.inventaireCount > 0);
                  }}
                >
                  {hasCascade ? 'Désassigner et supprimer' : 'Désassigner'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
