import { useEffect, useState, useCallback } from 'react';
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
  const [allIngredients, setAllIngredients] = useState<ActiviteIngredient[]>([]); // full list from first activity
  const [selectionMap, setSelectionMap] = useState<SelectionMap>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null); // `${ingId}-${actId}`
  const [filterCategory, setFilterCategory] = useState('');
  const [filterName, setFilterName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: allActs } = await api.get('/api/entreprise/activites');
      const franchise = (allActs as Activite[]).filter((a) => a.type === 'franchise');
      setActivites(franchise);

      if (franchise.length === 0) { setLoading(false); return; }

      // Fetch ingredients for all franchise activities in parallel
      const results = await Promise.all(
        franchise.map((a) =>
          api.get(`/api/entreprise/activites/${a.id}/ingredients`).then(({ data }) => ({ actId: a.id, data: data as ActiviteIngredient[] }))
        )
      );

      // Use first activity's full list as the canonical ingredient list
      setAllIngredients(results[0].data);

      // Build selection map
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

  const groups: Record<string, ActiviteIngredient[]> = {};
  for (const ing of filtered) {
    const cat = ing.categorie || t('client.ingredients_catalog.no_category');
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(ing);
  }

  if (loading) return <div className="page-content"><p className="text-muted">{t('common.loading')}</p></div>;

  return (
    <div className="page-content">
      <h1>{t('nav.catalogue_franchise')}</h1>

      {activites.length === 0 ? (
        <p className="text-muted">{t('client.catalogue_franchise.no_activities')}</p>
      ) : (
        <>
          {/* Inline filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="input"
              style={{ minWidth: 180, flex: '0 0 auto' }}
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">{t('client.catalogue_franchise.all_categories')}</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="text"
              className="input"
              style={{ minWidth: 180, flex: '1 1 auto', maxWidth: 280 }}
              placeholder={t('common.search') + '…'}
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
            />
          </div>

          {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 8 }}>
                🏷️ {cat} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.78rem' }}>({items.length})</span>
              </h2>
              <div style={{ overflowX: 'auto' }}>
                <table className="table card" style={{ minWidth: 280 + activites.length * 120 }}>
                  <thead>
                    <tr>
                      <th>{t('common.name')}</th>
                      <th>{t('common.unit')}</th>
                      {activites.map((a) => (
                        <th key={a.id} style={{ width: 110, textAlign: 'center', fontSize: '0.78rem' }}>
                          {a.nom}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((ing) => {
                      const ingSelections = selectionMap[ing.id] || {};
                      const anySelected = activites.some((a) => ingSelections[a.id]?.selected);
                      return (
                        <tr key={ing.id} style={{ background: anySelected ? 'var(--primary-light, #eef2ff)' : undefined }}>
                          <td><span style={{ fontWeight: anySelected ? 600 : undefined }}>{ing.nom}</span></td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{ing.unite}</td>
                          {activites.map((a) => {
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
          ))}
        </>
      )}
    </div>
  );
}
