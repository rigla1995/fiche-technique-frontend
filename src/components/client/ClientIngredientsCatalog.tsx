import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useSelection } from '../../context/SelectionContext';
import { useAuth } from '../../context/AuthContext';
import type { Ingredient } from '../../types';

interface Props {
  embedded?: boolean;
  onSelectionDone?: () => void;
}

export default function ClientIngredientsCatalog({ embedded, onSelectionDone }: Props = {}) {
  const { t } = useTranslation();
  const { refreshSelections } = useSelection();
  const { user, advanceOnboarding } = useAuth();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const fetchIngredients = () => {
    setLoading(true);
    api.get('/ingredients').then(({ data }) => setIngredients(data)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchIngredients(); }, []);

  const toggleSelection = async (ing: Ingredient) => {
    setTogglingId(ing.id);
    try {
      const { data } = await api.post(`/ingredients/${ing.id}/select`);
      setIngredients((list) => list.map((i) => (i.id === ing.id ? { ...i, selected: data.selected } : i)));
      refreshSelections();
      // Advance onboarding: step 3 (catalogue) → step 0 (done) on first selection
      if (data.selected && user?.onboardingStep === 3) {
        await advanceOnboarding(0);
      }
    } finally {
      setTogglingId(null);
    }
  };

  const selectedCount = ingredients.filter((i) => i.selected).length;

  // Only show selected ingredients — modifications must go through Catalogue Global
  const selectedOnly = ingredients.filter((i) => i.selected);
  const filtered = selectedOnly.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.categorieName || '').toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const groups: Record<string, Ingredient[]> = {};
  for (const ing of filtered) {
    const cat = ing.categorieName || t('client.ingredients_catalog.no_category');
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(ing);
  }

  return (
    <div className={embedded ? '' : 'page'}>
      <div className="page-header">
        {!embedded && <h1>{t('client.ingredients_catalog.title')}</h1>}
        {selectedCount > 0 && (
          <span style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 600 }}>
            ✓ {t('client.ingredients_catalog.selection_count', { count: selectedCount })}
          </span>
        )}
        {embedded && onSelectionDone && selectedCount > 0 && (
          <button className="btn btn-primary" onClick={onSelectionDone}>
            Continuer → ({selectedCount} ingrédient{selectedCount > 1 ? 's' : ''})
          </button>
        )}
      </div>

      {/* Banner pointing to Catalogue Global for modifications */}
      {!embedded && (
        <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: '#3730a3' }}>
          🌐 {t('client.ingredients_catalog.readonly_hint', 'Ce catalogue affiche uniquement les ingrédients sélectionnés dans le')} {' '}
          <Link to="/client/catalogue-global" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline' }}>
            {t('nav.catalogue_global', 'Catalogue Global')}
          </Link>.
          {' '}{t('client.ingredients_catalog.modify_hint', 'Pour ajouter ou retirer des ingrédients, rendez-vous dans le Catalogue Global.')}
        </div>
      )}

      {selectedCount === 0 && !loading && (
        <div className="alert alert-error" style={{ background: '#fff7ed', color: '#c05621', borderColor: '#fbd38d', marginBottom: 16 }}>
          ⚠️ {t('client.ingredients_catalog.no_selection_hint', 'Aucun ingrédient sélectionné. Rendez-vous dans le')}{' '}
          <Link to="/client/catalogue-global" style={{ color: '#c05621', fontWeight: 600, textDecoration: 'underline' }}>
            {t('nav.catalogue_global', 'Catalogue Global')}
          </Link>{' '}
          {t('client.ingredients_catalog.to_select', 'pour sélectionner vos ingrédients.')}
        </div>
      )}

      <div className="search-bar">
        <input
          type="text"
          placeholder={t('common.search') + '...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
        />
      </div>

      {loading ? (
        <div className="loading-text">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
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
                  </tr>
                </thead>
                <tbody>
                  {items.map((ing) => (
                    <tr key={ing.id} style={{ background: ing.selected ? 'var(--primary-light)' : undefined }}>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{
                            fontSize: '1.1rem',
                            padding: '2px 6px',
                            color: ing.selected ? 'var(--success)' : 'var(--text-muted)',
                          }}
                          disabled={togglingId === ing.id}
                          onClick={() => toggleSelection(ing)}
                          title={ing.selected ? t('client.ingredients_catalog.deselect') : t('client.ingredients_catalog.select')}
                        >
                          {togglingId === ing.id ? '…' : ing.selected ? '✓' : '○'}
                        </button>
                      </td>
                      <td>
                        <span style={{ fontWeight: ing.selected ? 600 : undefined }}>{ing.name}</span>
                      </td>
                      <td>{ing.unit?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
