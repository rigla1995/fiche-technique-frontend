import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Ingredient } from '../../types';

export default function ClientIngredientsCatalog() {
  const { t } = useTranslation();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/ingredients')
      .then(({ data }) => setIngredients(data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = ingredients.filter((i) => {
    const q = search.toLowerCase();
    return (
      i.name.toLowerCase().includes(q) ||
      String(i.price).includes(q) ||
      (i.unit?.name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('client.ingredients_catalog.title')}</h1>
      </div>

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
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('common.price')}</th>
                <th>{t('common.unit')}</th>
                <th>{t('admin.ingredients.category')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td><span className="price-badge">{i.price.toFixed(3)} {t('currency')}</span></td>
                  <td><span className="unit-badge">{i.unit?.name}</span></td>
                  <td>{i.categorieName ? <span className="unit-badge">{i.categorieName}</span> : <span className="text-muted">—</span>}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-cell">
                    {t('client.ingredients_catalog.no_results')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
