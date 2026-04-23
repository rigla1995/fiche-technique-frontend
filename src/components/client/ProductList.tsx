import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Product } from '../../types';

interface ProductDetail {
  ingredients: { ingredientName: string; portion: number; unitName: string; unitPrice: number }[];
  subProducts: { subProductName: string; portion: number }[];
}

type PopupType = 'ingredients' | 'subProducts' | null;

export default function ProductList() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState<number | null>(null);
  const [popup, setPopup] = useState<{ type: PopupType; productId: number; productName: string } | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    api.get('/products').then(({ data }) => setProducts(data)).finally(() => setLoading(false));
  }, []);

  const openPopup = async (type: PopupType, product: Product) => {
    setPopup({ type, productId: product.id, productName: product.name });
    setDetail(null);
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/products/${product.id}`);
      setDetail(data);
    } finally {
      setLoadingDetail(false);
    }
  };

  const closePopup = () => { setPopup(null); setDetail(null); };

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
          <p>{products.length === 0 ? t('client.products.no_products') : t('common.no_result')}</p>
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
                <th>{t('client.products.type_label')}</th>
                <th style={{ textAlign: 'center' }}>{t('nav.ingredients')}</th>
                <th style={{ textAlign: 'center' }}>{t('client.products.subproducts_section')}</th>
                <th style={{ textAlign: 'right' }}>{t('common.total_cost')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    <span className={`unit-badge ${p.type === 'utilisable' ? 'badge-utilisable' : 'badge-vendable'}`}>
                      {p.type === 'utilisable' ? t('client.products.type_utilisable') : t('client.products.type_vendable')}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ minWidth: 36 }}
                      onClick={() => openPopup('ingredients', p)}
                    >
                      {p.ingredientsCount ?? 0}
                    </button>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ minWidth: 36 }}
                      onClick={() => openPopup('subProducts', p)}
                    >
                      {p.subProductsCount ?? 0}
                    </button>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="cost-badge">{(p.totalCost || 0).toFixed(3)} {t('currency')}</span>
                  </td>
                  <td className="actions-cell">
                    <Link to={`/client/products/${p.id}/edit`} className="btn btn-ghost btn-sm">{t('common.edit')}</Link>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => handleExport(p.id, p.name)}
                      disabled={exporting === p.id}
                    >
                      📥 {exporting === p.id ? t('common.loading') : 'Excel'}
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

      {popup && (
        <div className="modal-overlay" onClick={closePopup}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {popup.type === 'ingredients'
                  ? t('client.products.popup_ingredients_title')
                  : t('client.products.popup_subproducts_title')} — {popup.productName}
              </h2>
              <button className="modal-close" onClick={closePopup}>×</button>
            </div>
            <div className="modal-body">
              {loadingDetail ? (
                <div className="loading-text">{t('common.loading')}</div>
              ) : popup.type === 'ingredients' ? (
                detail?.ingredients && detail.ingredients.length > 0 ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('client.products.popup_col_ingredient')}</th>
                        <th style={{ textAlign: 'right' }}>{t('client.products.popup_col_portion')}</th>
                        <th>{t('client.products.popup_col_unit')}</th>
                        <th style={{ textAlign: 'right' }}>{t('client.products.popup_col_unit_price')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.ingredients.map((ing, i) => (
                        <tr key={i}>
                          <td>{ing.ingredientName}</td>
                          <td style={{ textAlign: 'right' }}>{ing.portion}</td>
                          <td>{ing.unitName}</td>
                          <td style={{ textAlign: 'right' }}>{ing.unitPrice?.toFixed(3)} {t('currency')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ color: '#888', textAlign: 'center', padding: '16px 0' }}>
                    {t('client.products.popup_no_ingredients')}
                  </p>
                )
              ) : (
                detail?.subProducts && detail.subProducts.length > 0 ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('client.products.popup_col_subproduct')}</th>
                        <th style={{ textAlign: 'right' }}>{t('client.products.popup_col_portion')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.subProducts.map((sp, i) => (
                        <tr key={i}>
                          <td>{sp.subProductName}</td>
                          <td style={{ textAlign: 'right' }}>{sp.portion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ color: '#888', textAlign: 'center', padding: '16px 0' }}>
                    {t('client.products.popup_no_subproducts')}
                  </p>
                )
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closePopup}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
