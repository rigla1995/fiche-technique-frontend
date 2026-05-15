import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useSelection } from '../../context/SelectionContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IngContext {
  type: 'activite' | 'labo';
  id: number;
  nom: string;
  assigned: boolean;
}

interface GlobalIngredient {
  id: number;
  nom: string;
  unite: string;
  categorie: string;
  // entreprise: per-context assignment
  contexts?: IngContext[];
  // indépendant: single flag
  selected?: boolean;
}

interface DeselectModal {
  ingId: number;
  ingName: string;
  approCount: number;
  inventaireCount: number;
  contextType?: 'activite';
  contextId?: number;
}

// ─── Indépendant ingredient list (unchanged behavior) ────────────────────────

function IndepIngredientList({
  ingredients,
  toggling,
  filterCategory,
  filterIngId,
  filterName,
  onToggle,
  readOnly,
}: {
  ingredients: GlobalIngredient[];
  toggling: Set<string>;
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
  const toggleCat = (cat: string) => setOpenCats((prev) => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

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
                          <th style={{ width: 40, color: '#fff', fontWeight: 800, fontSize: '0.78rem' }}></th>
                          <th style={{ color: '#fff', fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase' }}>{t('common.name')}</th>
                          <th style={{ width: 100, color: '#fff', fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase' }}>{t('common.unit')}</th>
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
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: '1.1rem', padding: '2px 6px', color: ing.selected ? 'var(--success)' : 'var(--text-muted)' }}
                                  disabled={toggling.has(String(ing.id))} onClick={() => onToggle(ing.id)}>
                                  {toggling.has(String(ing.id)) ? '…' : ing.selected ? '✅' : '○'}
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
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 8, fontSize: '0.82rem' }}>
              <button className="btn btn-ghost btn-sm" disabled={catPage === 1} onClick={() => setCatPage((p) => Math.max(1, p - 1))}>‹</button>
              <span style={{ fontWeight: 600 }}>{catPage} / {totalCatPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={catPage === totalCatPages} onClick={() => setCatPage((p) => Math.min(totalCatPages, p + 1))}>›</button>
            </div>
          )}
        </>);
      })()}
    </>
  );
}

// ─── Entreprise ingredient list with per-context toggles ──────────────────────

function EntrepriseIngredientList({
  ingredients,
  toggling,
  filterCategory,
  filterName,
  onToggle,
  readOnly,
}: {
  ingredients: GlobalIngredient[];
  toggling: Set<string>;
  filterCategory: string;
  filterName: string;
  onToggle: (ingId: number, ctx: IngContext) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [catPage, setCatPage] = useState(1);
  const CAT_PAGE_SIZE = 10;

  const filtered = ingredients.filter((i) => {
    const catOk = !filterCategory || i.categorie === filterCategory;
    const nameOk = !filterName || i.nom.toLowerCase().includes(filterName.toLowerCase());
    return catOk && nameOk;
  });

  const groups: Record<string, GlobalIngredient[]> = {};
  for (const i of filtered) {
    if (!groups[i.categorie]) groups[i.categorie] = [];
    groups[i.categorie].push(i);
  }

  const totalAssigned = ingredients.filter((i) => i.contexts?.some((c) => c.assigned)).length;
  const toggleCat = (cat: string) => setOpenCats((prev) => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  return (
    <>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
        {totalAssigned} / {ingredients.length} {t('global_catalogue.selected_count', 'ingrédient(s) avec au moins une assignation')}
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
            const catAssigned = items.filter((i) => i.contexts?.some((c) => c.assigned)).length;
            return (
              <div key={cat} style={{ marginBottom: 8 }}>
                <button onClick={() => toggleCat(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', width: '100%', textAlign: 'left', borderBottom: '2px solid #c7d2fe', marginBottom: isOpen ? 8 : 0 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏷 {cat}</span>
                  <span style={{ fontWeight: 400, fontSize: '0.72rem', color: 'var(--text-muted)' }}>({catAssigned}/{items.length})</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
                </button>
                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8 }}>
                    {items.map((ing) => {
                      const hasAny = ing.contexts?.some((c) => c.assigned);
                      return (
                        <div key={ing.id} style={{ background: hasAny ? 'var(--primary-light)' : 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 160, flexShrink: 0 }}>
                            <div style={{ fontWeight: hasAny ? 700 : 400, fontSize: '0.9rem' }}>{ing.nom}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ing.unite}</div>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                            {(ing.contexts ?? []).length === 0 ? (
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('global_catalogue.no_context', 'Aucune activité / labo')}</span>
                            ) : (ing.contexts ?? []).map((ctx) => {
                              const key = `${ing.id}:${ctx.type}:${ctx.id}`;
                              const isToggling = toggling.has(key);
                              return (
                                <button
                                  key={key}
                                  disabled={readOnly || isToggling}
                                  onClick={() => onToggle(ing.id, ctx)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    padding: '4px 10px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, cursor: readOnly ? 'default' : 'pointer', border: 'none',
                                    background: ctx.assigned ? (ctx.type === 'labo' ? '#d1fae5' : '#e0e7ff') : 'var(--border)',
                                    color: ctx.assigned ? (ctx.type === 'labo' ? '#065f46' : '#3730a3') : 'var(--text-muted)',
                                    opacity: isToggling ? 0.6 : 1,
                                    transition: 'all 0.15s',
                                  }}
                                >
                                  {ctx.type === 'labo' ? '🏭' : '📍'}
                                  {' '}{ctx.nom}
                                  {' '}{isToggling ? '…' : ctx.assigned ? '✅' : '○'}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {totalCatPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 8, fontSize: '0.82rem' }}>
              <button className="btn btn-ghost btn-sm" disabled={catPage === 1} onClick={() => setCatPage((p) => Math.max(1, p - 1))}>‹</button>
              <span style={{ fontWeight: 600 }}>{catPage} / {totalCatPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={catPage === totalCatPages} onClick={() => setCatPage((p) => Math.min(totalCatPages, p + 1))}>›</button>
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
  filterCategory,
  filterName,
  onCatChange,
  onNameChange,
}: {
  categories: string[];
  filterCategory: string;
  filterName: string;
  onCatChange: (v: string) => void;
  onNameChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const hasFilter = filterCategory || filterName;
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', marginBottom: 20,
      border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end',
    }}>
      <div style={{ width: '100%', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#92400e' }}>Filtres</span>
        {hasFilter && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => { onCatChange(''); onNameChange(''); }}>✕ Réinitialiser</button>
        )}
      </div>
      <div>
        <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🏷️ Catégorie</label>
        <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid #92400e', fontSize: '0.88rem', background: '#fffbeb', minWidth: 160 }} value={filterCategory} onChange={(e) => onCatChange(e.target.value)}>
          <option value="">{t('common.all_categories', 'Toutes catégories')}</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🔍 Nom</label>
        <input type="text" style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }} placeholder="Rechercher…"
          value={filterName} onChange={(e) => onNameChange(e.target.value)} />
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

  const [ingredients, setIngredients] = useState<GlobalIngredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [filterCategory, setFilterCategory] = useState('');
  const [filterIngId, setFilterIngId] = useState<number | ''>('');
  const [filterName, setFilterName] = useState('');

  const load = useCallback(async () => {
    setIngredients([]);
    setFilterCategory('');
    setFilterIngId('');
    setFilterName('');
    setLoading(true);
    try {
      if (isEntreprise) {
        const { data } = await api.get('/api/entreprise/catalogue-global-ingredients');
        setIngredients(data as GlobalIngredient[]);
      } else {
        const { data } = await api.get('/ingredients');
        setIngredients((data as Array<{ id: number; nom?: string; name?: string; unite?: string; unitName?: string; categorieName?: string; selected: boolean }>).map((i) => ({
          id: i.id,
          nom: i.nom ?? i.name ?? '',
          unite: i.unite ?? i.unitName ?? '',
          categorie: i.categorieName ?? t('client.ingredients_catalog.no_category', 'Sans catégorie'),
          selected: !!i.selected,
        })));
      }
    } finally {
      setLoading(false);
    }
  }, [isEntreprise, t]);

  useEffect(() => { load(); }, [load]);

  const [deselectModal, setDeselectModal] = useState<DeselectModal | null>(null);

  const setTogglingKey = (key: string, on: boolean) => setToggling((prev) => {
    const n = new Set(prev);
    on ? n.add(key) : n.delete(key);
    return n;
  });

  // Indépendant toggle
  const toggleIndep = async (ingId: number) => {
    const ing = ingredients.find((i) => i.id === ingId);
    if (!ing) return;
    const key = String(ingId);
    if (ing.selected) {
      setTogglingKey(key, true);
      try {
        const { data } = await api.get(`/api/stock/client/${ingId}/cascade-info`);
        setTogglingKey(key, false);
        setDeselectModal({ ingId, ingName: ing.nom, approCount: data.approCount ?? 0, inventaireCount: data.inventaireCount ?? 0 });
        return;
      } catch {
        setTogglingKey(key, false);
        setDeselectModal({ ingId, ingName: ing.nom, approCount: 0, inventaireCount: 0 });
        return;
      }
    }
    setTogglingKey(key, true);
    try {
      const { data } = await api.post(`/ingredients/${ingId}/select`);
      refreshSelections();
      if (data.selected && user?.onboardingStep === 3) await advanceOnboarding(0);
      setIngredients((prev) => prev.map((i) => i.id === ingId ? { ...i, selected: data.selected } : i));
    } finally {
      setTogglingKey(key, false);
    }
  };

  const doToggleIndep = async (ingId: number, deleteHistory = false) => {
    const key = String(ingId);
    setTogglingKey(key, true);
    try {
      const { data } = await api.post(`/ingredients/${ingId}/select`);
      refreshSelections();
      if (data.selected && user?.onboardingStep === 3) await advanceOnboarding(0);
      if (deleteHistory) await api.delete(`/api/stock/client/${ingId}/all-history`);
      setIngredients((prev) => prev.map((i) => i.id === ingId ? { ...i, selected: data.selected } : i));
    } finally {
      setTogglingKey(key, false);
    }
  };

  // Entreprise context toggle
  const toggleContext = async (ingId: number, ctx: IngContext) => {
    const key = `${ingId}:${ctx.type}:${ctx.id}`;
    if (ctx.assigned && ctx.type === 'activite') {
      // Check cascade before deselecting an activité
      setTogglingKey(key, true);
      try {
        const { data } = await api.get(`/api/stock/entreprise/${ctx.id}/${ingId}/cascade-info`);
        setTogglingKey(key, false);
        setDeselectModal({ ingId, ingName: ingredients.find((i) => i.id === ingId)?.nom ?? '', approCount: data.approCount ?? 0, inventaireCount: data.inventaireCount ?? 0, contextType: 'activite', contextId: ctx.id });
        return;
      } catch {
        setTogglingKey(key, false);
        setDeselectModal({ ingId, ingName: ingredients.find((i) => i.id === ingId)?.nom ?? '', approCount: 0, inventaireCount: 0, contextType: 'activite', contextId: ctx.id });
        return;
      }
    }
    await doToggleContext(ingId, ctx);
  };

  const doToggleContext = async (ingId: number, ctx: IngContext, deleteHistory = false) => {
    const key = `${ingId}:${ctx.type}:${ctx.id}`;
    setTogglingKey(key, true);
    try {
      let newAssigned: boolean;
      if (ctx.type === 'activite') {
        const { data } = await api.post(`/api/entreprise/activites/${ctx.id}/ingredients/${ingId}/select`);
        if (user?.onboardingStep === 3) await advanceOnboarding(0);
        if (deleteHistory) await api.delete(`/api/stock/entreprise/${ctx.id}/${ingId}/all-history`);
        newAssigned = data.selected;
      } else {
        const { data } = await api.post(`/api/labo/${ctx.id}/ingredients/${ingId}/select`);
        if (user?.onboardingStep === 3) await advanceOnboarding(0);
        newAssigned = data.selected;
      }
      setIngredients((prev) => prev.map((ing) => {
        if (ing.id !== ingId) return ing;
        return { ...ing, contexts: ing.contexts?.map((c) => c.type === ctx.type && c.id === ctx.id ? { ...c, assigned: newAssigned } : c) };
      }));
    } finally {
      setTogglingKey(key, false);
    }
  };

  const categories = Array.from(new Set(ingredients.map((i) => i.categorie))).sort();

  return (
    <div className="page-content">
      {/* Hero header */}
      <div style={{ background: 'linear-gradient(135deg, #78350f 0%, #92400e 55%, #f59e0b 100%)', borderRadius: 18, padding: '24px 28px', marginBottom: 24, boxShadow: '0 8px 32px rgba(146,64,14,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏷</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>{t('nav.catalogue_global', 'Catalogue Global')}</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.88rem', margin: 0 }}>
            {isEntreprise
              ? t('global_catalogue.subtitle_ent', 'Sélectionnez les ingrédients par activité et par labo.')
              : t('global_catalogue.subtitle', 'Sélectionnez les ingrédients à inclure dans votre catalogue.')}
          </p>
        </div>
      </div>

      {/* Filters */}
      {ingredients.length > 0 && (
        <FiltersBar
          categories={categories}
          filterCategory={filterCategory}
          filterName={filterName}
          onCatChange={setFilterCategory}
          onNameChange={setFilterName}
        />
      )}

      {/* Ingredient list */}
      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : ingredients.length === 0 && !loading ? (
        <div className="empty-state">
          <span className="empty-icon">🧂</span>
          <p>{t('global_catalogue.no_ingredients', 'Aucun ingrédient disponible.')}</p>
        </div>
      ) : isEntreprise ? (
        <EntrepriseIngredientList
          ingredients={ingredients}
          toggling={toggling}
          filterCategory={filterCategory}
          filterName={filterName}
          onToggle={toggleContext}
          readOnly={!canWrite}
        />
      ) : (
        <IndepIngredientList
          ingredients={ingredients}
          toggling={toggling}
          filterCategory={filterCategory}
          filterIngId={filterIngId}
          filterName={filterName}
          onToggle={toggleIndep}
          readOnly={!canWrite}
        />
      )}

      {/* Link to catalogue pages (indépendant only) */}
      {!isEntreprise && (
        <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem' }}>
          📋 {t('global_catalogue.view_catalogue_hint', 'Voir les ingrédients sélectionnés dans')} →{' '}
          <Link to="/client/ingredients" style={{ color: 'var(--primary)', fontWeight: 600 }}>
            {t('nav.ingredients_catalog', 'Catalogue Ingrédients')}
          </Link>
        </div>
      )}

      {/* Deselect confirmation modal */}
      {deselectModal && (() => {
        const { ingId, ingName, approCount, inventaireCount, contextType, contextId } = deselectModal;
        const hasCascade = approCount > 0 || inventaireCount > 0;
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
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{ingName}</div>
                </div>
                {hasCascade && (
                  <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontWeight: 800, color: '#b91c1c', fontSize: '0.88rem', marginBottom: 6 }}>
                      ⚠️ Cette désassignation entraîne des effets en cascade :
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.83rem', color: '#7f1d1d', lineHeight: 1.7 }}>
                      {approCount > 0 && <li><strong>{approCount}</strong> approvisionnement{approCount > 1 ? 's' : ''} supprimé{approCount > 1 ? 's' : ''}</li>}
                      {inventaireCount > 0 && <li><strong>{inventaireCount}</strong> inventaire{inventaireCount > 1 ? 's' : ''} supprimé{inventaireCount > 1 ? 's' : ''}</li>}
                      <li>Recalcul du stock de l'activité</li>
                    </ul>
                  </div>
                )}
                <div style={{ background: '#fff7ed', border: '1px solid #fbd38d', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>
                  🔒 Action irréversible — cette suppression ne peut pas être annulée.
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-ghost" onClick={() => setDeselectModal(null)}>Annuler</button>
                <button
                  style={{ background: 'linear-gradient(135deg, #b91c1c, #dc2626)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, padding: '10px 22px', cursor: 'pointer' }}
                  onClick={async () => {
                    setDeselectModal(null);
                    if (contextType === 'activite' && contextId != null) {
                      const ctx: IngContext = { type: 'activite', id: contextId, nom: '', assigned: true };
                      await doToggleContext(ingId, ctx, hasCascade);
                    } else {
                      await doToggleIndep(ingId, hasCascade);
                    }
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
