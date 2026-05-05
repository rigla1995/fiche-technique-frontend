import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Activite, ActiviteIngredient } from '../../types';

// ingId → actId → { selected }
type SelectionMap = Record<number, Record<number, { selected: boolean }>>;

export default function FranchiseCatalogPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const justCreated = new URLSearchParams(location.search).get('created') === '1';

  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectionMap, setSelectionMap] = useState<SelectionMap>({});
  const [allIngredients, setAllIngredients] = useState<ActiviteIngredient[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterIngId, setFilterIngId] = useState<number | ''>('');
  const [filterName, setFilterName] = useState('');
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const toggleCat = (cat: string) => setOpenCats((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });

  // Derive franchise groups from activites
  const groups = useMemo(() => {
    const map: Record<string, Activite[]> = {};
    for (const a of activites) {
      const g = a.franchiseGroup || a.nom;
      if (!map[g]) map[g] = [];
      map[g].push(a);
    }
    return map;
  }, [activites]);

  const groupNames = useMemo(() => Object.keys(groups).sort(), [groups]);

  // Activities in the currently selected group
  const groupActivities = useMemo(
    () => (selectedGroup ? (groups[selectedGroup] ?? []) : []),
    [groups, selectedGroup]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: allActs } = await api.get('/api/entreprise/activites');
      const franchise = (allActs as Activite[]).filter((a) => a.type === 'franchise');
      setActivites(franchise);

      if (franchise.length === 0) { setLoading(false); return; }

      const results = await Promise.all(
        franchise.map((a) =>
          api.get(`/api/entreprise/activites/${a.id}/ingredients`).then(({ data }) => ({ actId: a.id, data: data as ActiviteIngredient[] }))
        )
      );

      setAllIngredients(results[0].data);

      const map: SelectionMap = {};
      for (const { actId, data } of results) {
        for (const ing of data) {
          if (!map[ing.id]) map[ing.id] = {};
          map[ing.id][actId] = { selected: ing.selected };
        }
      }
      setSelectionMap(map);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-select first group once loaded
  useEffect(() => {
    if (groupNames.length > 0 && !selectedGroup) setSelectedGroup(groupNames[0]);
  }, [groupNames, selectedGroup]);

  const assignedIngredients = allIngredients.filter((ing) =>
    groupActivities.some((a) => selectionMap[ing.id]?.[a.id]?.selected)
  );

  const allCategories = Array.from(new Set(
    assignedIngredients.map((i) => i.categorie || t('client.ingredients_catalog.no_category'))
  )).sort();

  const ingredientsInCategory = filterCategory
    ? assignedIngredients.filter((i) => (i.categorie || t('client.ingredients_catalog.no_category')) === filterCategory)
    : assignedIngredients;

  const filtered = assignedIngredients.filter((i) => {
    const cat = i.categorie || t('client.ingredients_catalog.no_category');
    const catOk = !filterCategory || cat === filterCategory;
    const ingOk = !filterIngId || i.id === filterIngId;
    const nomOk = !filterName || i.nom.toLowerCase().includes(filterName.toLowerCase());
    return catOk && ingOk && nomOk;
  });

  const ingredientGroups: Record<string, ActiviteIngredient[]> = {};
  for (const ing of filtered) {
    const cat = ing.categorie || t('client.ingredients_catalog.no_category');
    if (!ingredientGroups[cat]) ingredientGroups[cat] = [];
    ingredientGroups[cat].push(ing);
  }

  if (loading) return <div className="page-content"><p className="text-muted">{t('common.loading')}</p></div>;

  return (
    <div className="page-content">
      {/* ── Hero header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #6366f1 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(67,56,202,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem', lineHeight: 1 }}>🏷</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>{t('nav.catalogue_franchise')}</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>Ingrédients assignés à vos activités franchise</p>
        </div>
        {assignedIngredients.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{assignedIngredients.length}</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ingrédients</div>
          </div>
        )}
      </div>

      {justCreated && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: '#15803d', fontWeight: 600 }}>
            ✅ {t('client.entreprise.activity_created')} — {t('client.catalogue.assign_ingredients_hint', 'Assignez maintenant les ingrédients à vos activités.')}
          </span>
          <button onClick={() => navigate('/client/catalogue-franchise', { replace: true })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#15803d' }}>✕</button>
        </div>
      )}

      {/* Catalogue Global banner */}
      <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: '#3730a3' }}>
        🌐 {t('client.catalogue_franchise.global_hint', 'Ce catalogue affiche les ingrédients assignés via le')}{' '}
        <Link to="/client/catalogue-global" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline' }}>
          {t('nav.catalogue_global', 'Catalogue Global')}
        </Link>.
        {' '}{t('client.catalogue_franchise.global_hint2', 'Pour modifier votre sélection (labo ou activité), rendez-vous dans le Catalogue Global.')}
      </div>

      {activites.length === 0 ? (
        <p className="text-muted">{t('client.catalogue_franchise.no_activities')}</p>
      ) : (
        <>
          {/* Filter bar */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 20, padding: '16px 20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
            {groupNames.length > 1 && (
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🏢 Groupe</span>
                <select className="input" value={selectedGroup}
                  onChange={(e) => { setSelectedGroup(e.target.value); setFilterCategory(''); setFilterIngId(''); setFilterName(''); }}>
                  {groupNames.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            )}
            <div>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🏷 Catégorie</span>
              <select className="input" value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setFilterIngId(''); }}>
                <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🔎 Ingrédient</span>
              <select className="input" value={filterIngId} disabled={!filterCategory}
                onChange={(e) => setFilterIngId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— Tous —</option>
                {ingredientsInCategory.map((i) => <option key={i.id} value={i.id}>{i.nom}</option>)}
              </select>
            </div>
            <div>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Nom</span>
              <input type="text" className="input" placeholder="Rechercher…" value={filterName} onChange={(e) => setFilterName(e.target.value)} />
            </div>
            {(filterCategory || filterIngId !== '' || filterName) && (
              <button onClick={() => { setFilterCategory(''); setFilterIngId(''); setFilterName(''); }}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)', alignSelf: 'flex-end' }}>
                ✕ Réinitialiser
              </button>
            )}
          </div>

          {groupActivities.length === 0 ? (
            <p className="text-muted">{t('client.catalogue_franchise.no_activities')}</p>
          ) : (
            Object.entries(ingredientGroups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => {
              const isOpen = openCats.has(cat);
              return (
              <div key={cat} style={{ marginBottom: 8 }}>
                <button onClick={() => toggleCat(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', width: '100%', textAlign: 'left', borderBottom: '2px solid var(--border)', marginBottom: isOpen ? 10 : 0 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏷️ {cat}</span>
                  <span style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--text-muted)' }}>({items.length})</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
                </button>
                {isOpen && (
                <div className="table-responsive card" style={{ marginBottom: 0 }}>
                  <table className="table" style={{ minWidth: 280 + groupActivities.length * 120 }}>
                    <thead>
                      <tr>
                        <th>{t('common.name')}</th>
                        <th>{t('common.unit')}</th>
                        {groupActivities.map((a) => (
                          <th key={a.id} style={{ width: 110, textAlign: 'center', fontSize: '0.78rem' }}>
                            {a.nom}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((ing) => {
                        const ingSelections = selectionMap[ing.id] || {};
                        const anySelected = groupActivities.some((a) => ingSelections[a.id]?.selected);
                        return (
                          <tr key={ing.id} style={{ background: anySelected ? 'var(--primary-light, #eef2ff)' : undefined }}>
                            <td>
                              <span style={{ fontWeight: anySelected ? 700 : undefined }}>{ing.nom}</span>
                            </td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{ing.unite}</td>
                            {groupActivities.map((a) => {
                              const sel = ingSelections[a.id];
                              return (
                                <td key={a.id} style={{ textAlign: 'center' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    fontSize: '1rem',
                                    padding: '3px 10px',
                                    borderRadius: 20,
                                    background: sel?.selected ? 'var(--success, #10b981)' : 'transparent',
                                    color: sel?.selected ? '#fff' : 'var(--text-muted)',
                                    border: sel?.selected ? 'none' : '1px solid var(--border)',
                                    fontWeight: sel?.selected ? 700 : undefined,
                                    minWidth: 36,
                                  }}>
                                    {sel?.selected ? '✓' : '○'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}

