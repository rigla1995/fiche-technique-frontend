import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, ActiviteIngredient } from '../../types';

export default function DistinctCatalogPage() {
  const { t } = useTranslation();
  const { user, advanceOnboarding } = useAuth();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ingredients, setIngredients] = useState<ActiviteIngredient[]>([]);
  const [loadingActivites, setLoadingActivites] = useState(true);
  const [loadingIngredients, setLoadingIngredients] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterName, setFilterName] = useState('');

  useEffect(() => {
    setLoadingActivites(true);
    api.get('/api/entreprise/activites').then(({ data }) => {
      const distinct = (data as Activite[]).filter((a) => a.type === 'distincte' || a.type == null);
      setActivites(distinct);
      if (distinct.length > 0) setSelectedId(distinct[0].id);
    }).finally(() => setLoadingActivites(false));
  }, []);

  const loadIngredients = useCallback(async (actId: number) => {
    setLoadingIngredients(true);
    setIngredients([]);
    try {
      const { data } = await api.get(`/api/entreprise/activites/${actId}/ingredients`);
      setIngredients(data);
    } catch { /* ignore */ }
    setLoadingIngredients(false);
  }, []);

  useEffect(() => {
    if (selectedId !== null) loadIngredients(selectedId);
  }, [selectedId, loadIngredients]);

  const toggleIngredient = async (ingId: number) => {
    if (selectedId === null) return;
    setToggling(ingId);
    try {
      const { data } = await api.post(`/api/entreprise/activites/${selectedId}/ingredients/${ingId}/select`);
      setIngredients((prev) => prev.map((i) => (i.id === ingId ? { ...i, selected: data.selected } : i)));
      if (data.selected && user?.onboardingStep === 3) await advanceOnboarding(0);
    } finally {
      setToggling(null);
    }
  };

  const allCategories = Array.from(new Set(
    ingredients.map((i) => i.categorie || t('client.ingredients_catalog.no_category'))
  )).sort();

  const filtered = ingredients.filter((i) => {
    const cat = i.categorie || t('client.ingredients_catalog.no_category');
    return (!filterCategory || cat === filterCategory) && (!filterName || i.nom.toLowerCase().includes(filterName.toLowerCase()));
  });

  const groups: Record<string, ActiviteIngredient[]> = {};
  for (const ing of filtered) {
    const cat = ing.categorie || t('client.ingredients_catalog.no_category');
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(ing);
  }

  if (loadingActivites) return <div className="page-content"><p className="text-muted">{t('common.loading')}</p></div>;

  return (
    <div className="page-content">
      <h1>{t('nav.catalogue_distinct')}</h1>

      {activites.length === 0 ? (
        <p className="text-muted">{t('client.catalogue_distinct.no_activities')}</p>
      ) : (
        <>
          {/* Single filter row: activity + category + search */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="input"
              style={{ minWidth: 180, flex: '0 0 auto' }}
              value={selectedId ?? ''}
              onChange={(e) => { setSelectedId(Number(e.target.value)); setFilterCategory(''); setFilterName(''); }}
            >
              {activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
            <select
              className="input"
              style={{ minWidth: 160, flex: '0 0 auto' }}
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">{t('client.catalogue_franchise.all_categories')}</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="text"
              className="input"
              style={{ minWidth: 160, flex: '1 1 auto', maxWidth: 280 }}
              placeholder={t('common.search') + '…'}
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
            />
          </div>

          {loadingIngredients ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted">{t('common.no_result')}</p>
          ) : (
            Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: 24 }}>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 8 }}>
                  🏷️ {cat} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.78rem' }}>({items.length})</span>
                </h2>
                <div className="table-responsive card">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}></th>
                        <th>{t('common.name')}</th>
                        <th>{t('common.unit')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((ing) => (
                        <tr key={ing.id} style={{ background: ing.selected ? 'var(--primary-light, #eef2ff)' : undefined }}>
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
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{ing.unite}</td>
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
