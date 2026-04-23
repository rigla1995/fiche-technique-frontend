import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useSelection } from '../../context/SelectionContext';
import type { Ingredient } from '../../types';

export default function ClientIngredientsCatalog() {
  const { t } = useTranslation();
  const { refreshSelections } = useSelection();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingPrice, setEditingPrice] = useState<{ id: number; value: string } | null>(null);
  const [savingPrice, setSavingPrice] = useState<number | null>(null);
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
    } finally {
      setTogglingId(null);
    }
  };

  const startEditPrice = (ing: Ingredient) => {
    setEditingPrice({ id: ing.id, value: String(ing.clientPrice ?? ing.effectivePrice ?? '') });
  };

  const savePrice = async (id: number) => {
    if (!editingPrice || editingPrice.id !== id) return;
    const val = parseFloat(editingPrice.value);
    if (isNaN(val) || val < 0) return;
    setSavingPrice(id);
    try {
      const { data } = await api.put(`/ingredients/${id}/price`, { price: val });
      setIngredients((list) => list.map((i) => (i.id === id ? { ...i, clientPrice: data.clientPrice, effectivePrice: data.effectivePrice } : i)));
      setEditingPrice(null);
    } finally {
      setSavingPrice(null);
    }
  };

  const selectedCount = ingredients.filter((i) => i.selected).length;

  const filtered = ingredients.filter(
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
    <div className="page">
      <div className="page-header">
        <h1>{t('client.ingredients_catalog.title')}</h1>
        {selectedCount > 0 && (
          <span style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 600 }}>
            ✓ {t('client.ingredients_catalog.selection_count', { count: selectedCount })}
          </span>
        )}
      </div>

      {selectedCount === 0 && !loading && (
        <div className="alert alert-error" style={{ background: '#fff7ed', color: '#c05621', borderColor: '#fbd38d', marginBottom: 16 }}>
          ⚠️ {t('client.ingredients_catalog.selection_hint')}
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
                    <th style={{ textAlign: 'right' }}>{t('client.ingredients_catalog.my_price')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
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
                      <td style={{ textAlign: 'right' }}>
                        {editingPrice?.id === ing.id ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              className="input"
                              style={{ width: 100, textAlign: 'right' }}
                              value={editingPrice.value}
                              autoFocus
                              onChange={(e) => setEditingPrice({ id: ing.id, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') savePrice(ing.id); if (e.key === 'Escape') setEditingPrice(null); }}
                            />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('currency')}</span>
                          </span>
                        ) : (
                          <span className={ing.clientPrice !== null ? 'cost-badge' : ''} style={{ color: ing.clientPrice === null ? 'var(--text-muted)' : undefined }}>
                            {ing.effectivePrice !== null ? `${ing.effectivePrice.toFixed(3)} ${t('currency')}` : '—'}
                            {ing.clientPrice !== null && <span title={t('client.ingredients_catalog.my_price_set')} style={{ marginLeft: 4 }}>✓</span>}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {editingPrice?.id === ing.id ? (
                          <span className="actions-cell">
                            <button className="btn btn-primary btn-sm" disabled={savingPrice === ing.id} onClick={() => savePrice(ing.id)}>
                              {savingPrice === ing.id ? '...' : t('common.save')}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingPrice(null)}>{t('common.cancel')}</button>
                          </span>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => startEditPrice(ing)}>
                            {ing.clientPrice !== null ? t('client.ingredients_catalog.edit_price') : t('client.ingredients_catalog.set_price')}
                          </button>
                        )}
                      </td>
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
