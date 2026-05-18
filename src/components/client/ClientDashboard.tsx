import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Product } from '../../types';

export default function ClientDashboard() {
  const { t } = useTranslation();
  const isEntreprise = true;
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/products').then(({ data }) => setProducts(data)).finally(() => setLoading(false));
  }, []);

  const vendable = products.filter((p) => p.type === 'vendable');
  const utilisable = products.filter((p) => p.type === 'utilisable');
  const totalCost = vendable.reduce((sum, p) => sum + (p.totalCost || 0), 0);

  const addProductTo = isEntreprise ? '/client/products' : '/client/products/new';
  const editProductTo = (p: Product) =>
    isEntreprise ? '/client/products' : `/client/products/${p.id}/edit`;

  const renderSection = (title: string, list: Product[], emptyKey: string, addPath: string) => (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{title}</h2>
        {!isEntreprise && (
          <Link to={addPath} className="btn btn-ghost btn-sm">+ {t('common.add')}</Link>
        )}
      </div>
      {list.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t(emptyKey)}</p>
      ) : (
        <div className="products-grid">
          {list.map((p) => (
            <div key={p.id} className="product-card">
              <div className="product-card-header">
                <h3>{p.name}</h3>
                <span className="cost-badge">{(p.totalCost || 0).toFixed(3)} {t('currency')}</span>
              </div>
              <div className="product-card-body">
                <p className="product-meta">
                  {p.ingredientsCount ?? p.ingredients?.length ?? 0} {t('nav.ingredients')}
                  {p.type === 'vendable' && ` · ${p.subProductsCount ?? p.subProducts?.length ?? 0} sous-produits`}
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
          <div className="stat-value">{vendable.length}</div>
          <div className="stat-label">{t('client.products.tab_vendable')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{utilisable.length}</div>
          <div className="stat-label">{t('client.products.tab_utilisable')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalCost.toFixed(3)} {t('currency')}</div>
          <div className="stat-label">{t('common.total_cost')}</div>
        </div>
        <Link to="/client/products?tab=fiche-technique" className="stat-card" style={{ textDecoration: 'none', cursor: 'pointer', display: 'block' }}>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>📋</div>
          <div className="stat-label">{t('client.products.tab_fiche_technique')}</div>
        </Link>
      </div>

      {loading ? (
        <div className="loading-text">{t('common.loading')}</div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🍽️</span>
          <p>{t('client.products.no_products')}</p>
          <Link to={addProductTo} className="btn btn-primary">{t('client.products.add')}</Link>
        </div>
      ) : (
        <>
          {renderSection(
            t('client.products.tab_vendable'),
            vendable,
            'client.products.no_vendable_products',
            '/client/products/new?type=vendable',
          )}
          {renderSection(
            t('client.products.tab_utilisable'),
            utilisable,
            'client.products.no_utilisable_products_tab',
            '/client/products/new?type=utilisable',
          )}
        </>
      )}
    </div>
  );
}
