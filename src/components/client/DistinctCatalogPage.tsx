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
  const [priceEdits, setPriceEdits] = useState<Record<number, string>>({});
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
      const edits: Record<number, string> = {};
      for (const ing of data as ActiviteIngredient[]) {
        if (ing.prixUnitaire !== null) edits[ing.id] = String(ing.prixUnitaire);
      }
      setPriceEdits(edits);
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

  const savePrice = async (ingId: number) => {
    if (selectedId === null) return;
    const raw = priceEdits[ingId];
    const prixUnitaire = raw !== undefined && raw !== '' ? parseFloat(raw) : null;
    try {
      await api.put(`/api/entreprise/activites/${selectedId}/ingredients/${ingId}/price`, { prixUnitaire });
      setIngredients((prev) => prev.map((i) => (i.id === ingId ? { ...i, prixUnitaire } : i)));
    } catch { /* ignore */ }
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
          {/* Activity tabs — D · {nom} */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
            {activites.map((a) => (
              <button
                key={a.id}
                onClick={() => { setSelectedId(a.id); setFilterCategory(''); setFilterName(''); }}
                style={{
                  padding: '8px 16px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  border: 'none',
                  borderRadius: '6px 6px 0 0',
                  cursor: 'pointer',
                  background: selectedId === a.id ? 'var(--primary)' : 'var(--surface)',
                  color: selectedId === a.id ? '#fff' : 'var(--text)',
                  borderBottom: selectedId === a.id ? '2px solid var(--primary)' : '2px solid transparent',
                  marginBottom: -2,
                }}
              >
                D · {a.nom}
              </button>
            ))}
          </div>

          {/* Inline filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
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
                        <th style={{ width: 180 }}>{t('client.catalogue_distinct.price_per_unit')} ({t('currency')})</th>
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
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              placeholder={ing.prix !== null ? String(ing.prix) : '0.000'}
                              value={priceEdits[ing.id] ?? ''}
                              onChange={(e) => setPriceEdits((p) => ({ ...p, [ing.id]: e.target.value }))}
                              onBlur={() => savePrice(ing.id)}
                              style={{ width: 110, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: '0.85rem' }}
                            />
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
