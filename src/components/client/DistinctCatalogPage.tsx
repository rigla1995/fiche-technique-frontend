import { useEffect, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, ActiviteIngredient } from '../../types';

export default function DistinctCatalogPage() {
  const { t } = useTranslation();
  const { user, advanceOnboarding } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const justCreated = new URLSearchParams(location.search).get('created') === '1';
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
      <h1 style={{ marginBottom: 20 }}>{t('nav.catalogue_distinct')}</h1>

      {justCreated && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: '#15803d', fontWeight: 600 }}>
            ✅ {t('client.entreprise.activity_created')} — {t('client.catalogue.assign_ingredients_hint', 'Assignez maintenant les ingrédients à vos activités.')}
          </span>
          <button onClick={() => navigate('/client/catalogue-distinct', { replace: true })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#15803d' }}>✕</button>
        </div>
      )}

      {/* Catalogue Global banner */}
      <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: '#3730a3' }}>
        🌐 {t('client.catalogue_distinct.global_hint', 'Ce catalogue affiche les ingrédients assignés via le')}{' '}
        <Link to="/client/catalogue-global" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline' }}>
          {t('nav.catalogue_global', 'Catalogue Global')}
        </Link>.
        {' '}{t('client.catalogue_distinct.global_hint2', 'Pour modifier votre sélection par activité, rendez-vous dans le Catalogue Global.')}
      </div>

      {activites.length === 0 ? (
        <p className="text-muted">{t('client.catalogue_distinct.no_activities')}</p>
      ) : (
        <>
          {/* Single filter row: activity + category + search */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activité</span>
              <select
                className="input"
                style={{ maxWidth: 220 }}
                value={selectedId ?? ''}
                onChange={(e) => { setSelectedId(Number(e.target.value)); setFilterCategory(''); setFilterName(''); }}
              >
                {activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
            </div>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 auto', maxWidth: 220 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('common.ingredient_name', "Nom de l'ingrédient")}</span>
              <input
                type="text"
                className="input"
                style={{ minWidth: 140 }}
                placeholder={t('common.ingredient_name', "Nom de l'ingrédient") + '…'}
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
              />
            </div>
          </div>

          {loadingIngredients ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted">{t('common.no_result')}</p>
          ) : (
            Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  🏷️ {cat} <span style={{ fontWeight: 400, fontSize: '0.75rem', opacity: 0.7 }}>({items.length})</span>
                </h2>
                <div className="table-responsive card" style={{ marginBottom: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('common.name')}</th>
                        <th style={{ width: 120 }}>{t('common.unit')}</th>
                        <th style={{ width: 80, textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((ing) => (
                        <tr key={ing.id} style={{ background: ing.selected ? 'var(--primary-light, #eef2ff)' : undefined }}>
                          <td>
                            <span style={{ fontWeight: ing.selected ? 700 : undefined }}>{ing.nom}</span>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{ing.unite}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{
                                fontSize: '1rem',
                                padding: '3px 10px',
                                borderRadius: 20,
                                background: ing.selected ? 'var(--success, #10b981)' : 'transparent',
                                color: ing.selected ? '#fff' : 'var(--text-muted)',
                                border: ing.selected ? 'none' : '1px solid var(--border)',
                                fontWeight: ing.selected ? 700 : undefined,
                                minWidth: 36,
                              }}
                              disabled={toggling === ing.id}
                              onClick={() => toggleIngredient(ing.id)}
                            >
                              {toggling === ing.id ? '…' : ing.selected ? '✓' : '○'}
                            </button>
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
