import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, ActiviteIngredient } from '../../types';

// ingId → actId → { selected, prixUnitaire }
type SelectionMap = Record<number, Record<number, { selected: boolean; prixUnitaire: number | null }>>;

export default function FranchiseCatalogPage() {
  const { t } = useTranslation();
  const { user, advanceOnboarding } = useAuth();

  const [activites, setActivites] = useState<Activite[]>([]);
  const [allIngredients, setAllIngredients] = useState<ActiviteIngredient[]>([]); // full list from first activity
  const [selectionMap, setSelectionMap] = useState<SelectionMap>({});
  const [priceEdits, setPriceEdits] = useState<Record<number, string>>({});
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
          map[ing.id][actId] = { selected: ing.selected, prixUnitaire: ing.prixUnitaire };
        }
      }
      setSelectionMap(map);

      // Init price edits: use prix_unitaire from first selected activity, or base price
      const edits: Record<number, string> = {};
      for (const ing of results[0].data) {
        // Find the first activity that has a prix_unitaire for this ingredient
        for (const { data } of results) {
          const match = data.find((i) => i.id === ing.id);
          if (match?.prixUnitaire !== null && match?.prixUnitaire !== undefined) {
            edits[ing.id] = String(match.prixUnitaire);
            break;
          }
        }
      }
      setPriceEdits(edits);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleIngredient = async (ingId: number, actId: number) => {
    const key = `${ingId}-${actId}`;
    setToggling(key);
    try {
      const prixUnitaire = priceEdits[ingId] ? parseFloat(priceEdits[ingId]) : null;
      const { data } = await api.post(`/api/entreprise/activites/${actId}/ingredients/${ingId}/select`, { prixUnitaire });
      setSelectionMap((prev) => ({
        ...prev,
        [ingId]: { ...(prev[ingId] || {}), [actId]: { selected: data.selected, prixUnitaire } },
      }));
      if (data.selected && user?.onboardingStep === 3) await advanceOnboarding(0);
    } finally {
      setToggling(null);
    }
  };

  const savePrice = async (ingId: number) => {
    const raw = priceEdits[ingId];
    const prixUnitaire = raw !== undefined && raw !== '' ? parseFloat(raw) : null;
    // Save to all currently selected activities for this ingredient
    const selectedActIds = activites
      .filter((a) => selectionMap[ingId]?.[a.id]?.selected)
      .map((a) => a.id);
    for (const actId of selectedActIds) {
      try {
        await api.put(`/api/entreprise/activites/${actId}/ingredients/${ingId}/price`, { prixUnitaire });
      } catch { /* ignore */ }
    }
    setSelectionMap((prev) => {
      const updated = { ...prev[ingId] };
      for (const actId of selectedActIds) {
        updated[actId] = { ...updated[actId], prixUnitaire };
      }
      return { ...prev, [ingId]: updated };
    });
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
                <table className="table card" style={{ minWidth: 400 + activites.length * 120 }}>
                  <thead>
                    <tr>
                      <th>{t('common.name')}</th>
                      <th>{t('common.unit')}</th>
                      <th style={{ width: 160 }}>{t('common.price')} ({t('currency')})</th>
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
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              placeholder={ing.prix !== null ? String(ing.prix) : '0.000'}
                              value={priceEdits[ing.id] ?? ''}
                              onChange={(e) => setPriceEdits((p) => ({ ...p, [ing.id]: e.target.value }))}
                              onBlur={() => savePrice(ing.id)}
                              style={{ width: 100, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: '0.85rem' }}
                            />
                          </td>
                          {activites.map((a) => {
                            const sel = ingSelections[a.id];
                            const key = `${ing.id}-${a.id}`;
                            return (
                              <td key={a.id} style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={sel?.selected ?? false}
                                  disabled={toggling === key}
                                  onChange={() => toggleIngredient(ing.id, a.id)}
                                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--primary)' }}
                                />
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
