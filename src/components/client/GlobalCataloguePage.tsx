import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

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
}

interface DeselectModal {
  ingId: number;
  ingName: string;
  approCount: number;
  inventaireCount: number;
  contextType?: 'activite';
  contextId?: number;
}

// ─── Entreprise ingredient list with per-context toggles ──────────────────────

function EntrepriseIngredientList({
  ingredients,
  toggling,
  filterCategory,
  filterName,
  filterContext,
  filterIngId,
  onToggle,
  onToggleAll,
  readOnly,
}: {
  ingredients: GlobalIngredient[];
  toggling: Set<string>;
  filterCategory: string;
  filterName: string;
  filterContext: string;
  filterIngId: number | '';
  onToggle: (ingId: number, ctx: IngContext) => void;
  onToggleAll: (ingId: number, contexts: IngContext[], assign: boolean) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [catPage, setCatPage] = useState(1);
  const CAT_PAGE_SIZE = 10;
  const prevFilters = useRef({ filterName, filterCategory, filterContext, filterIngId });

  useEffect(() => {
    const prev = prevFilters.current;
    const changed = prev.filterName !== filterName || prev.filterCategory !== filterCategory || prev.filterContext !== filterContext || prev.filterIngId !== filterIngId;
    if (!changed) return;
    prevFilters.current = { filterName, filterCategory, filterContext, filterIngId };
    setCatPage(1);
    if (filterName) {
      const matchedCats = new Set(
        ingredients
          .filter(i => i.nom.toLowerCase().includes(filterName.toLowerCase()))
          .map(i => i.categorie)
      );
      setOpenCats(matchedCats);
    }
  });

  const filtered = ingredients.filter((i) => {
    const catOk = !filterCategory || i.categorie === filterCategory;
    const nameOk = !filterName || i.nom.toLowerCase().includes(filterName.toLowerCase());
    const ingOk = !filterIngId || i.id === filterIngId;
    const ctxOk = !filterContext || (() => {
      const [type, idStr] = filterContext.split(':');
      const id = Number(idStr);
      return i.contexts?.some((c) => c.type === type && c.id === id) ?? false;
    })();
    return catOk && nameOk && ingOk && ctxOk;
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
        {totalAssigned} / {ingredients.length} {t('global_catalogue.selected_count', 'article(s) avec au moins une assignation')}
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8 }}>
                    {items.map((ing) => {
                      const hasAny = ing.contexts?.some((c) => c.assigned);
                      return (
                        <div key={ing.id} style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderLeft: hasAny ? '3px solid #2563eb' : '3px solid transparent',
                          borderRadius: 8,
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          flexWrap: 'wrap',
                        }}>
                          <div style={{ minWidth: 160, flexShrink: 0 }}>
                            <div style={{ fontWeight: hasAny ? 700 : 500, fontSize: '0.88rem', color: 'var(--text)' }}>{ing.nom}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>{ing.unite}</div>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', flex: 1 }}>
                            {(ing.contexts ?? []).length === 0 ? (
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('global_catalogue.no_context', 'Aucune activité / labo')}</span>
                            ) : (() => {
                              const ctxs = ing.contexts ?? [];
                              const allAssigned = ctxs.length > 0 && ctxs.every((c) => c.assigned);
                              const isBulkToggling = ctxs.some((c) => toggling.has(`${ing.id}:${c.type}:${c.id}`));
                              return (
                                <>
                                  {!readOnly && ctxs.length > 1 && (
                                    <button
                                      disabled={isBulkToggling}
                                      onClick={() => onToggleAll(ing.id, ctxs, !allAssigned)}
                                      title={allAssigned ? 'Désélectionner tout' : 'Sélectionner tout'}
                                      style={{
                                        padding: '3px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700,
                                        cursor: 'pointer',
                                        border: '1.5px solid #94a3b8',
                                        background: 'transparent',
                                        color: '#475569',
                                        opacity: isBulkToggling ? 0.5 : 1,
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {isBulkToggling ? '…' : allAssigned ? '✕ Tout retirer' : '✓ Tout assigner'}
                                    </button>
                                  )}
                                  {ctxs.map((ctx) => {
                                    const key = `${ing.id}:${ctx.type}:${ctx.id}`;
                                    const isToggling = toggling.has(key);
                                    const isLabo = ctx.type === 'labo';
                                    return (
                                      <button
                                        key={key}
                                        disabled={readOnly || isToggling}
                                        onClick={() => onToggle(ing.id, ctx)}
                                        style={{
                                          display: 'inline-flex', alignItems: 'center', gap: 4,
                                          padding: '3px 10px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600,
                                          cursor: readOnly ? 'default' : 'pointer',
                                          border: '1.5px solid',
                                          borderColor: ctx.assigned
                                            ? (isLabo ? '#16a34a' : '#2563eb')
                                            : '#cbd5e1',
                                          background: ctx.assigned
                                            ? (isLabo ? '#f0fdf4' : '#eff6ff')
                                            : '#f8fafc',
                                          color: ctx.assigned
                                            ? (isLabo ? '#15803d' : '#1d4ed8')
                                            : '#94a3b8',
                                          opacity: isToggling ? 0.5 : 1,
                                          transition: 'all 0.12s',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        <span style={{ fontSize: '0.68rem' }}>{isLabo ? '🏭' : '📍'}</span>
                                        {ctx.nom}
                                        {isToggling
                                          ? <span style={{ fontSize: '0.65rem' }}>…</span>
                                          : ctx.assigned
                                            ? <span style={{ fontSize: '0.65rem', color: isLabo ? '#16a34a' : '#2563eb' }}>✔</span>
                                            : <span style={{ fontSize: '0.65rem' }}>+</span>
                                        }
                                      </button>
                                    );
                                  })}
                                </>
                              );
                            })()}
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
  // entreprise extras
  contexts,
  filterContext,
  onContextChange,
  ingredientsInCategory,
  filterIngId,
  onIngIdChange,
}: {
  categories: string[];
  filterCategory: string;
  filterName: string;
  onCatChange: (v: string) => void;
  onNameChange: (v: string) => void;
  contexts?: { key: string; label: string; type: 'activite' | 'labo' }[];
  filterContext?: string;
  onContextChange?: (v: string) => void;
  ingredientsInCategory?: { id: number; nom: string }[];
  filterIngId?: number | '';
  onIngIdChange?: (v: number | '') => void;
}) {
  const { t } = useTranslation();
  const hasFilter = filterCategory || filterName || filterContext || filterIngId;

  const activites = contexts?.filter((c) => c.type === 'activite') ?? [];
  const labos = contexts?.filter((c) => c.type === 'labo') ?? [];

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', marginBottom: 20,
      border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end',
    }}>
      <div style={{ width: '100%', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#92400e' }}>Filtres</span>
        {hasFilter && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => { onCatChange(''); onNameChange(''); onContextChange?.(''); onIngIdChange?.(''); }}>✕ Réinitialiser</button>
        )}
      </div>
      <div>
        <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🏷️ Catégorie</label>
        <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid #92400e', fontSize: '0.88rem', background: '#fffbeb', minWidth: 160 }} value={filterCategory}
          onChange={(e) => { onCatChange(e.target.value); onIngIdChange?.(''); }}>
          <option value="">{t('common.all_categories', 'Toutes catégories')}</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {filterCategory && ingredientsInCategory && ingredientsInCategory.length > 0 && onIngIdChange && (
        <div>
          <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🧂 Article</label>
          <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }} value={filterIngId ?? ''}
            onChange={(e) => onIngIdChange(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">— Tous —</option>
            {ingredientsInCategory.map((i) => <option key={i.id} value={i.id}>{i.nom}</option>)}
          </select>
        </div>
      )}
      {contexts && contexts.length > 0 && onContextChange && (
        <div>
          <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>📍 Activité / Labo</label>
          <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 180 }} value={filterContext ?? ''}
            onChange={(e) => onContextChange(e.target.value)}>
            <option value="">— Tous —</option>
            {activites.length > 0 && (
              <optgroup label="Activités">
                {activites.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </optgroup>
            )}
            {labos.length > 0 && (
              <optgroup label="Labos">
                {labos.map((c) => <option key={c.key} value={c.key}>🏭 {c.label}</option>)}
              </optgroup>
            )}
          </select>
        </div>
      )}
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

  const [ingredients, setIngredients] = useState<GlobalIngredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [filterCategory, setFilterCategory] = useState('');
  const [filterIngId, setFilterIngId] = useState<number | ''>('');
  const [filterName, setFilterName] = useState('');
  const [filterContext, setFilterContext] = useState('');

  const load = useCallback(async () => {
    setIngredients([]);
    setFilterCategory('');
    setFilterIngId('');
    setFilterName('');
    setFilterContext('');
    setLoading(true);
    try {
      const { data } = await api.get('/api/entreprise/catalogue-global-ingredients');
      setIngredients(data as GlobalIngredient[]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const [deselectModal, setDeselectModal] = useState<DeselectModal | null>(null);

  const setTogglingKey = (key: string, on: boolean) => setToggling((prev) => {
    const n = new Set(prev);
    on ? n.add(key) : n.delete(key);
    return n;
  });

  // Entreprise bulk toggle (all contexts for one ingredient)
  const toggleContextAll = async (ingId: number, contexts: IngContext[], assign: boolean) => {
    const targets = contexts.filter((c) => c.assigned !== assign);
    for (const ctx of targets) {
      if (assign) {
        await doToggleContext(ingId, ctx);
      } else {
        // For deselect: skip cascade check, deselect directly
        await doToggleContext(ingId, ctx);
      }
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
        if (user?.onboardingStep === 3) {
          await advanceOnboarding(0);
          window.dispatchEvent(new Event('activites-changed'));
        }
        if (deleteHistory) await api.delete(`/api/stock/entreprise/${ctx.id}/${ingId}/all-history`);
        newAssigned = data.selected;
      } else {
        const { data } = await api.post(`/api/labo/${ctx.id}/ingredients/${ingId}/select`);
        if (user?.onboardingStep === 3) {
          await advanceOnboarding(0);
          window.dispatchEvent(new Event('activites-changed'));
        }
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

  // Collect unique contexts across all ingredients for the filter dropdown
  const allContexts = (() => {
    const map = new Map<string, { key: string; label: string; type: 'activite' | 'labo' }>();
    for (const ing of ingredients) {
      for (const ctx of ing.contexts ?? []) {
        const key = `${ctx.type}:${ctx.id}`;
        if (!map.has(key)) map.set(key, { key, label: ctx.nom, type: ctx.type });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  })();

  const ingredientsInCategory = filterCategory
    ? ingredients.filter((i) => i.categorie === filterCategory)
    : [];

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
            {t('global_catalogue.subtitle_ent', 'Assignez vos articles par activité et par labo.')}
          </p>
        </div>
      </div>

      {/* Filters */}
      {ingredients.length > 0 && (
        <FiltersBar
          categories={categories}
          filterCategory={filterCategory}
          filterName={filterName}
          onCatChange={(v) => { setFilterCategory(v); setFilterIngId(''); }}
          onNameChange={setFilterName}
          contexts={allContexts}
          filterContext={filterContext}
          onContextChange={setFilterContext}
          ingredientsInCategory={ingredientsInCategory}
          filterIngId={filterIngId}
          onIngIdChange={setFilterIngId}
        />
      )}

      {/* Ingredient list */}
      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : ingredients.length === 0 && !loading ? (
        <div className="empty-state">
          <span className="empty-icon">🧂</span>
          <p>{t('global_catalogue.no_ingredients', 'Aucun article disponible.')}</p>
        </div>
      ) : (
        <EntrepriseIngredientList
          ingredients={ingredients}
          toggling={toggling}
          filterCategory={filterCategory}
          filterName={filterName}
          filterContext={filterContext}
          filterIngId={filterIngId}
          onToggle={toggleContext}
          onToggleAll={toggleContextAll}
          readOnly={!canWrite}
        />
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
