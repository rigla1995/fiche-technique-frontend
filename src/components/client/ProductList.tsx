import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Product } from '../../types';

export default function ProductList() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState<number | null>(null);

  useEffect(() => {
    api.get('/products').then(({ data }) => setProducts(data)).finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('client.products.delete_confirm'))) return;
    await api.delete(`/products/${id}`);
    setProducts((p) => p.filter((x) => x.id !== id));
  };

  const handleExport = async (id: number, name: string) => {
    setExporting(id);
    try {
      const response = await api.get(`/products/${id}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `fiche-technique-${name}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('client.products.title')}</h1>
        <Link to="/client/products/new" className="btn btn-primary">
          + {t('client.products.add')}
        </Link>
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
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🍔</span>
          <p>{products.length === 0 ? t('client.products.no_products') : 'Aucun résultat.'}</p>
          {products.length === 0 && (
            <Link to="/client/products/new" className="btn btn-primary">{t('client.products.add')}</Link>
          )}
        </div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('nav.ingredients')}</th>
                <th>Sous-produits</th>
                <th>{t('common.total_cost')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.ingredients?.length || 0}</td>
                  <td>{p.subProducts?.length || 0}</td>
                  <td><span className="cost-badge">{(p.totalCost || 0).toFixed(3)} {t('currency')}</span></td>
                  <td className="actions-cell">
                    <Link to={`/client/products/${p.id}/edit`} className="btn btn-ghost btn-sm">{t('common.edit')}</Link>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => handleExport(p.id, p.name)}
                      disabled={exporting === p.id}
                    >
                      📥 {exporting === p.id ? '...' : 'Excel'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
