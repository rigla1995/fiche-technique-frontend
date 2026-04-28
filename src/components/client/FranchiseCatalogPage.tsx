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

  const allCategories = Array.from(new Set(
    allIngredients.map((i) => i.categorie || t('client.ingredients_catalog.no_category'))
  )).sort();

  const ingredientsInCategory = filterCategory
    ? allIngredients.filter((i) => (i.categorie || t('client.ingredients_catalog.no_category')) === filterCategory)
    : allIngredients;

  const filtered = allIngredients.filter((i) => {
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
      <h1 style={{ marginBottom: 20 }}>{t('nav.catalogue_franchise')}</h1>

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
          {/* Single filter row: franchise group + category + ingredient + search */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {groupNames.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Groupe</span>
                <select
                  className="input"
                  style={{ maxWidth: 200 }}
                  value={selectedGroup}
                  onChange={(e) => { setSelectedGroup(e.target.value); setFilterCategory(''); setFilterIngId(''); setFilterName(''); }}
                >
                  {groupNames.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Catégorie</span>
              <select
                className="input"
                style={{ maxWidth: 200 }}
                value={filterCategory}
                onChange={(e) => { setFilterCategory(e.target.value); setFilterIngId(''); }}
              >
                <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingrédient</span>
              <select
                className="input"
                style={{ maxWidth: 220 }}
                value={filterIngId}
                disabled={!filterCategory}
                onChange={(e) => setFilterIngId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">— Tous —</option>
                {ingredientsInCategory.map((i) => <option key={i.id} value={i.id}>{i.nom}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 auto', maxWidth: 200 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nom</span>
              <input
                type="text"
                className="input"
                style={{ minWidth: 120 }}
                placeholder="Rechercher…"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
              />
            </div>
            {(filterCategory || filterIngId !== '' || filterName) && (
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => { setFilterCategory(''); setFilterIngId(''); setFilterName(''); }}>✕</button>
            )}
          </div>

          {groupActivities.length === 0 ? (
            <p className="text-muted">{t('client.catalogue_franchise.no_activities')}</p>
          ) : (
            Object.entries(ingredientGroups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  🏷️ {cat} <span style={{ fontWeight: 400, fontSize: '0.75rem', opacity: 0.7 }}>({items.length})</span>
                </h2>
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
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

