import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Product } from '../../types';

export default function ClientDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isEntreprise = user?.compteType === 'entreprise';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/products').then(({ data }) => setProducts(data)).finally(() => setLoading(false));
  }, []);

  const totalCost = products.reduce((sum, p) => sum + (p.totalCost || 0), 0);

  // Entreprise users must go through the ProductList activity picker to add/edit
  const addProductTo = isEntreprise ? '/client/products' : '/client/products/new';
  const editProductTo = (p: Product) =>
    isEntreprise ? '/client/products' : `/client/products/${p.id}/edit`;

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('client.title')}</h1>
        <Link to={addProductTo} className="btn btn-primary">
          + {t('client.products.add')}
        </Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{products.length}</div>
          <div className="stat-label">{t('nav.products')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalCost.toFixed(3)} {t('currency')}</div>
          <div className="stat-label">{t('common.total_cost')}</div>
        </div>
      </div>

      {loading ? (
        <div className="loading-text">{t('common.loading')}</div>
      ) : (
        <div className="products-grid">
          {products.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">🍽️</span>
              <p>{t('client.products.no_products')}</p>
              <Link to={addProductTo} className="btn btn-primary">{t('client.products.add')}</Link>
            </div>
          )}
          {products.map((p) => (
            <div key={p.id} className="product-card">
              <div className="product-card-header">
                <h3>{p.name}</h3>
                <span className="cost-badge">{(p.totalCost || 0).toFixed(3)} {t('currency')}</span>
              </div>
              <div className="product-card-body">
                <p className="product-meta">
                  {p.ingredients?.length || 0} {t('nav.ingredients')} · {p.subProducts?.length || 0} sous-produits
                </p>
              </div>
              <div className="product-card-footer">
                <Link to={editProductTo(p)} className="btn btn-ghost btn-sm">{t('common.edit')}</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
