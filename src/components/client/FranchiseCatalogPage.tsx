import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, ActiviteIngredient } from '../../types';

// ingId → actId → { selected }
type SelectionMap = Record<number, Record<number, { selected: boolean }>>;

export default function FranchiseCatalogPage() {
  const { t } = useTranslation();
  const { user, advanceOnboarding } = useAuth();

  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectionMap, setSelectionMap] = useState<SelectionMap>({});
  const [allIngredients, setAllIngredients] = useState<ActiviteIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState('');
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

  const toggleIngredient = async (ingId: number, actId: number) => {
    const key = `${ingId}-${actId}`;
    setToggling(key);
    try {
      const { data } = await api.post(`/api/entreprise/activites/${actId}/ingredients/${ingId}/select`);
      setSelectionMap((prev) => ({
        ...prev,
        [ingId]: { ...(prev[ingId] || {}), [actId]: { selected: data.selected } },
      }));
      if (data.selected && user?.onboardingStep === 3) await advanceOnboarding(0);
    } finally {
      setToggling(null);
    }
  };

  const allCategories = Array.from(new Set(
    allIngredients.map((i) => i.categorie || t('client.ingredients_catalog.no_category'))
  )).sort();

  const filtered = allIngredients.filter((i) => {
    const cat = i.categorie || t('client.ingredients_catalog.no_category');
    return (!filterCategory || cat === filterCategory) && (!filterName || i.nom.toLowerCase().includes(filterName.toLowerCase()));
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

      {activites.length === 0 ? (
        <p className="text-muted">{t('client.catalogue_franchise.no_activities')}</p>
      ) : (
        <>
          {/* Single filter row: franchise group + category + search */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {groupNames.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Groupe</span>
                <select
                  className="input"
                  style={{ maxWidth: 200 }}
                  value={selectedGroup}
                  onChange={(e) => { setSelectedGroup(e.target.value); setFilterCategory(''); setFilterName(''); }}
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
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <input
              type="text"
              className="input"
              style={{ minWidth: 140, flex: '1 1 auto', maxWidth: 220, alignSelf: 'flex-end' }}
              placeholder={t('common.search') + '…'}
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
            />
          </div>

          {groupActivities.length === 0 ? (
            <p className="text-muted">{t('client.catalogue_franchise.no_activities')}</p>
          ) : (
            Object.entries(ingredientGroups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 8 }}>
                  🏷️ {cat} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.78rem' }}>({items.length})</span>
                </h2>
                <div style={{ overflowX: 'auto' }}>
                  <table className="table card" style={{ minWidth: 280 + groupActivities.length * 120 }}>
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
                            <td><span style={{ fontWeight: anySelected ? 600 : undefined }}>{ing.nom}</span></td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{ing.unite}</td>
                            {groupActivities.map((a) => {
                              const sel = ingSelections[a.id];
                              const key = `${ing.id}-${a.id}`;
                              return (
                                <td key={a.id} style={{ textAlign: 'center' }}>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize: '1.1rem', padding: '2px 6px', color: sel?.selected ? 'var(--success)' : 'var(--text-muted)' }}
                                    disabled={toggling === key}
                                    onClick={() => toggleIngredient(ing.id, a.id)}
                                  >
                                    {toggling === key ? '…' : sel?.selected ? '✓' : '○'}
                                  </button>
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
