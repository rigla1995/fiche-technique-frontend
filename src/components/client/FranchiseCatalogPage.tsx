import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Activite, ActiviteIngredient } from '../../types';

export default function FranchiseCatalogPage() {
  const { t } = useTranslation();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [ingredientsMap, setIngredientsMap] = useState<Record<number, ActiviteIngredient[]>>({});
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterName, setFilterName] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  const loadIngredients = useCallback(async (acts: Activite[]) => {
    const results = await Promise.all(
      acts.map((a) => api.get(`/api/entreprise/activites/${a.id}/ingredients`).then(({ data }) => ({ id: a.id, data })))
    );
    const map: Record<number, ActiviteIngredient[]> = {};
    for (const { id, data } of results) map[id] = data;
    setIngredientsMap(map);
  }, []);

  useEffect(() => {
    setLoading(true);
    api.get('/api/entreprise/activites').then(({ data }) => {
      const franchise = (data as Activite[]).filter((a) => a.type === 'franchise');
      setActivites(franchise);
      return loadIngredients(franchise);
    }).finally(() => setLoading(false));
  }, [loadIngredients]);

  const toggleIngredient = async (actId: number, ingId: number) => {
    const key = `${actId}-${ingId}`;
    setToggling(key);
    try {
      const { data } = await api.post(`/api/entreprise/activites/${actId}/ingredients/${ingId}/select`);
      setIngredientsMap((prev) => ({
        ...prev,
        [actId]: (prev[actId] || []).map((i) => (i.id === ingId ? { ...i, selected: data.selected } : i)),
      }));
    } finally {
      setToggling(null);
    }
  };

  const duplicateToOthers = async (sourceActId: number, ingId: number) => {
    const key = `${sourceActId}-${ingId}`;
    setDuplicating(key);
    try {
      const sourceIng = ingredientsMap[sourceActId]?.find((i) => i.id === ingId);
      if (!sourceIng) return;
      const targetState = sourceIng.selected;
      for (const act of activites.filter((a) => a.id !== sourceActId)) {
        const actIng = ingredientsMap[act.id]?.find((i) => i.id === ingId);
        if (!actIng || actIng.selected === targetState) continue;
        const { data } = await api.post(`/api/entreprise/activites/${act.id}/ingredients/${ingId}/select`);
        setIngredientsMap((prev) => ({
          ...prev,
          [act.id]: (prev[act.id] || []).map((i) => (i.id === ingId ? { ...i, selected: data.selected } : i)),
        }));
      }
    } finally {
      setDuplicating(null);
    }
  };

  // Collect all categories across all activities
  const allCategories = Array.from(
    new Set(
      Object.values(ingredientsMap)
        .flat()
        .map((i) => i.categorie || t('client.ingredients_catalog.no_category'))
    )
  ).sort();

  const visibleCategories = filterCategory ? allCategories.filter((c) => c === filterCategory) : allCategories;

  if (loading) return <div className="page"><div className="loading-text">{t('common.loading')}</div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('client.catalogue_franchise.title')}</h1>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select
          className="input"
          style={{ minWidth: 200 }}
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">{t('client.catalogue_franchise.all_categories')}</option>
          {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="text"
          className="input"
          style={{ minWidth: 220 }}
          placeholder={t('client.catalogue_franchise.filter_category') + '…'}
          value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
        />
      </div>

      {activites.length === 0 ? (
        <div className="empty-state"><p>{t('client.catalogue_franchise.no_activities')}</p></div>
      ) : (
        visibleCategories.map((cat) => (
          <div key={cat} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              🏷️ {cat}
            </h2>
            {activites.map((act) => {
              const ings = (ingredientsMap[act.id] || []).filter(
                (i) =>
                  (i.categorie || t('client.ingredients_catalog.no_category')) === cat &&
                  (!filterName || i.nom.toLowerCase().includes(filterName.toLowerCase()))
              );
              if (ings.length === 0) return null;
              return (
                <div key={act.id} style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, paddingLeft: 8, borderLeft: '3px solid var(--primary)' }}>
                    🏢 {act.nom}
                  </h3>
                  <div className="table-responsive card">
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}></th>
                          <th>{t('common.name')}</th>
                          <th>{t('common.unit')}</th>
                          <th style={{ textAlign: 'right' }}>{t('common.price')}</th>
                          <th style={{ textAlign: 'right' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {ings.map((ing) => {
                          const toggleKey = `${act.id}-${ing.id}`;
                          const dupKey = `${act.id}-${ing.id}`;
                          return (
                            <tr key={ing.id} style={{ background: ing.selected ? 'var(--primary-light)' : undefined }}>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ fontSize: '1.1rem', padding: '2px 6px', color: ing.selected ? 'var(--success)' : 'var(--text-muted)' }}
                                  disabled={toggling === toggleKey || duplicating === dupKey}
                                  onClick={() => toggleIngredient(act.id, ing.id)}
                                >
                                  {toggling === toggleKey ? '…' : ing.selected ? '✓' : '○'}
                                </button>
                              </td>
                              <td><span style={{ fontWeight: ing.selected ? 600 : undefined }}>{ing.nom}</span></td>
                              <td>{ing.unite}</td>
                              <td style={{ textAlign: 'right' }}>
                                {ing.prix !== null ? `${ing.prix.toFixed(3)} ${t('currency')}` : '—'}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {activites.length > 1 && (
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                    disabled={duplicating === dupKey || toggling === toggleKey}
                                    onClick={() => duplicateToOthers(act.id, ing.id)}
                                    title={t('client.catalogue_franchise.duplicate_to_others')}
                                  >
                                    {duplicating === dupKey ? '…' : '⧉ ' + t('client.catalogue_franchise.duplicate_to_others')}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
