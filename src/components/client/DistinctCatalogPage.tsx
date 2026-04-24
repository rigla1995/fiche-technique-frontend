import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Activite, ActiviteIngredient } from '../../types';

export default function DistinctCatalogPage() {
  const { t } = useTranslation();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ingredients, setIngredients] = useState<ActiviteIngredient[]>([]);
  const [loadingActivites, setLoadingActivites] = useState(true);
  const [loadingIngredients, setLoadingIngredients] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);

  useEffect(() => {
    setLoadingActivites(true);
    api.get('/api/entreprise/activites').then(({ data }) => {
      const distinct = (data as Activite[]).filter((a) => a.type === 'distincte');
      setActivites(distinct);
      if (distinct.length > 0) setSelectedId(distinct[0].id);
    }).finally(() => setLoadingActivites(false));
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    setLoadingIngredients(true);
    setIngredients([]);
    api.get(`/api/entreprise/activites/${selectedId}/ingredients`)
      .then(({ data }) => setIngredients(data))
      .finally(() => setLoadingIngredients(false));
  }, [selectedId]);

  const toggleIngredient = async (ingId: number) => {
    if (selectedId === null) return;
    setToggling(ingId);
    try {
      const { data } = await api.post(`/api/entreprise/activites/${selectedId}/ingredients/${ingId}/select`);
      setIngredients((prev) => prev.map((i) => (i.id === ingId ? { ...i, selected: data.selected } : i)));
    } finally {
      setToggling(null);
    }
  };

  const groups: Record<string, ActiviteIngredient[]> = {};
  for (const ing of ingredients) {
    const cat = ing.categorie || t('client.ingredients_catalog.no_category');
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(ing);
  }

  if (loadingActivites) return <div className="page"><div className="loading-text">{t('common.loading')}</div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('client.catalogue_distinct.title')}</h1>
      </div>

      {activites.length === 0 ? (
        <div className="empty-state"><p>{t('client.catalogue_distinct.no_activities')}</p></div>
      ) : (
        <>
          <div style={{ marginBottom: 20 }}>
            <select
              className="input"
              style={{ minWidth: 240 }}
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(Number(e.target.value))}
            >
              {activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </div>

          {loadingIngredients ? (
            <div className="loading-text">{t('common.loading')}</div>
          ) : ingredients.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🧂</span>
              <p>{t('client.ingredients_catalog.no_results')}</p>
            </div>
          ) : (
            Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  🏷️ {cat}
                  <span style={{ fontSize: '0.78rem', fontWeight: 400, color: 'var(--text-muted)' }}>({items.length})</span>
                </h2>
                <div className="table-responsive card">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}></th>
                        <th>{t('common.name')}</th>
                        <th>{t('common.unit')}</th>
                        <th style={{ textAlign: 'right' }}>{t('common.price')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((ing) => (
                        <tr key={ing.id} style={{ background: ing.selected ? 'var(--primary-light)' : undefined }}>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: '1.1rem', padding: '2px 6px', color: ing.selected ? 'var(--success)' : 'var(--text-muted)' }}
                              disabled={toggling === ing.id}
                              onClick={() => toggleIngredient(ing.id)}
                            >
                              {toggling === ing.id ? '…' : ing.selected ? '✓' : '○'}
                            </button>
                          </td>
                          <td><span style={{ fontWeight: ing.selected ? 600 : undefined }}>{ing.nom}</span></td>
                          <td>{ing.unite}</td>
                          <td style={{ textAlign: 'right' }}>
                            {ing.prix !== null ? `${ing.prix.toFixed(3)} ${t('currency')}` : '—'}
                          </td>
                        </tr>
                      ))}
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
