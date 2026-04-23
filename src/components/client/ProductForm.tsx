import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Category, Ingredient, Product } from '../../types';

interface IngredientLine {
  ingredientId: string;
  portion: string;
}

interface SubProductLine {
  subProductId: string;
  portion: string;
}

export default function ProductForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [name, setName] = useState('');
  const [ingredientLines, setIngredientLines] = useState<IngredientLine[]>([]);
  const [subProductLines, setSubProductLines] = useState<SubProductLine[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetches = [api.get('/ingredients'), api.get('/products'), api.get('/categories')];
    Promise.all(fetches).then(([ing, prod, cat]) => {
      setIngredients(ing.data);
      setProducts(prod.data.filter((p: Product) => !id || String(p.id) !== id));
      setCategories(cat.data);
    });

    if (isEdit && id) {
      api.get(`/products/${id}`).then(({ data }) => {
        setName(data.name);
        setIngredientLines(data.ingredients.map((i: { ingredientId: number; portion: number }) => ({
          ingredientId: String(i.ingredientId),
          portion: String(i.portion),
        })));
        setSubProductLines(data.subProducts.map((s: { subProductId: number; portion: number }) => ({
          subProductId: String(s.subProductId),
          portion: String(s.portion),
        })));
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [id, isEdit]);

  const recalcCost = useCallback(() => {
    let cost = 0;
    for (const line of ingredientLines) {
      const ing = ingredients.find((i) => String(i.id) === line.ingredientId);
      if (ing && line.portion) {
        cost += (ing.effectivePrice ?? 0) * parseFloat(line.portion);
      }
    }
    for (const line of subProductLines) {
      const prod = products.find((p) => String(p.id) === line.subProductId);
      if (prod && line.portion) {
        cost += (prod.totalCost || 0) * parseFloat(line.portion);
      }
    }
    setTotalCost(cost);
  }, [ingredientLines, subProductLines, ingredients, products]);

  useEffect(() => { recalcCost(); }, [recalcCost]);

  const addIngredientLine = () => setIngredientLines((l) => [...l, { ingredientId: '', portion: '' }]);
  const removeIngredientLine = (i: number) => setIngredientLines((l) => l.filter((_, idx) => idx !== i));
  const updateIngredientLine = (i: number, field: keyof IngredientLine, value: string) =>
    setIngredientLines((l) => l.map((line, idx) => (idx === i ? { ...line, [field]: value } : line)));

  const addSubProductLine = () => setSubProductLines((l) => [...l, { subProductId: '', portion: '' }]);
  const removeSubProductLine = (i: number) => setSubProductLines((l) => l.filter((_, idx) => idx !== i));
  const updateSubProductLine = (i: number, field: keyof SubProductLine, value: string) =>
    setSubProductLines((l) => l.map((line, idx) => (idx === i ? { ...line, [field]: value } : line)));

  const getIngredientUnit = (ingredientId: string) => {
    const ing = ingredients.find((i) => String(i.id) === ingredientId);
    return ing?.unit?.name || '';
  };

  // Ingredients available for each line: filtered by category + not already selected in another line
  const selectedIngredientIds = new Set(ingredientLines.map((l) => l.ingredientId).filter(Boolean));
  const filteredByCategory = categoryFilter
    ? ingredients.filter((i) => String(i.categorieId) === categoryFilter)
    : ingredients;

  const availableForLine = (idx: number) =>
    filteredByCategory.filter(
      (i) => !selectedIngredientIds.has(String(i.id)) || ingredientLines[idx].ingredientId === String(i.id)
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name,
        ingredients: ingredientLines
          .filter((l) => l.ingredientId && l.portion)
          .map((l) => ({ ingredientId: parseInt(l.ingredientId), portion: parseFloat(l.portion) })),
        subProducts: subProductLines
          .filter((l) => l.subProductId && l.portion)
          .map((l) => ({ subProductId: parseInt(l.subProductId), portion: parseFloat(l.portion) })),
      };
      if (isEdit) {
        await api.put(`/products/${id}`, payload);
      } else {
        await api.post('/products', payload);
      }
      navigate('/client/products');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('client.products.delete_confirm'))) return;
    await api.delete(`/products/${id}`);
    navigate('/client/products');
  };

  const handleExport = async () => {
    setExporting(true);
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
      setExporting(false);
    }
  };

  if (loading) return <div className="page"><div className="loading-text">{t('common.loading')}</div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>{isEdit ? t('client.products.edit') : t('client.products.add')}</h1>
        <div className="page-header-actions">
          {isEdit && (
            <>
              <button className="btn btn-success" onClick={handleExport} disabled={exporting}>
                📥 {exporting ? t('common.loading') : t('client.products.export_excel')}
              </button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>{t('common.delete')}</button>
            </>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="product-form">
        <div className="card">
          <div className="form-group">
            <label className="form-label">{t('client.products.name')}</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        {/* Cost display */}
        <div className="cost-display card">
          <div className="cost-label">{t('client.products.real_time_cost')}</div>
          <div className="cost-value">{totalCost.toFixed(3)} <span className="cost-currency">{t('currency')}</span></div>
        </div>

        {/* Ingredients section */}
        <div className="card">
          <div className="section-header">
            <h2>{t('client.products.ingredients_section')}</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addIngredientLine}>
              + {t('client.products.add_ingredient')}
            </button>
          </div>

          {/* Category filter for ingredient selection */}
          {categories.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <select
                className="input"
                style={{ maxWidth: 280 }}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">{t('client.products.filter_by_category')}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {ingredientLines.length === 0 && (
            <p className="empty-text">{t('client.products.ingredients_empty')}</p>
          )}
          {ingredientLines.map((line, idx) => {
            const unit = getIngredientUnit(line.ingredientId);
            const available = availableForLine(idx);
            const effectivePrice = ingredients.find((i) => String(i.id) === line.ingredientId)?.effectivePrice ?? 0;
            return (
              <div key={idx} className="line-row">
                <select
                  className="input flex-grow"
                  value={line.ingredientId}
                  onChange={(e) => updateIngredientLine(idx, 'ingredientId', e.target.value)}
                >
                  <option value="">— {t('client.products.select_ingredient')} —</option>
                  {available.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {i.effectivePrice !== null ? ` (${i.effectivePrice.toFixed(3)} ${t('currency')}/${i.unit?.name})` : ` (— ${t('currency')}/${i.unit?.name})`}
                    </option>
                  ))}
                </select>
                <div className="portion-input">
                  <input
                    className="input"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder={unit === 'pièces' || unit === 'pieces' ? t('client.products.portion_pieces') : t('client.products.portion_grams')}
                    value={line.portion}
                    onChange={(e) => updateIngredientLine(idx, 'portion', e.target.value)}
                  />
                  {unit && <span className="unit-label">{unit}</span>}
                </div>
                {line.ingredientId && line.portion && (
                  <span className="line-cost">
                    {(effectivePrice * parseFloat(line.portion || '0')).toFixed(3)} {t('currency')}
                  </span>
                )}
                <button type="button" className="btn-icon btn-remove" onClick={() => removeIngredientLine(idx)}>×</button>
              </div>
            );
          })}
        </div>

        {/* Sub-products section */}
        <div className="card">
          <div className="section-header">
            <h2>{t('client.products.subproducts_section')}</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addSubProductLine}>
              + {t('client.products.add_subproduct')}
            </button>
          </div>
          {subProductLines.length === 0 && (
            <p className="empty-text">{t('client.products.subproducts_empty')}</p>
          )}
          {subProductLines.map((line, idx) => (
            <div key={idx} className="line-row">
              <select
                className="input flex-grow"
                value={line.subProductId}
                onChange={(e) => updateSubProductLine(idx, 'subProductId', e.target.value)}
              >
                <option value="">— {t('client.products.select_product')} —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({(p.totalCost || 0).toFixed(3)} {t('currency')})
                  </option>
                ))}
              </select>
              <div className="portion-input">
                <input
                  className="input"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder={t('common.portion')}
                  value={line.portion}
                  onChange={(e) => updateSubProductLine(idx, 'portion', e.target.value)}
                />
                <span className="unit-label">portion</span>
              </div>
              {line.subProductId && line.portion && (
                <span className="line-cost">
                  {((products.find((p) => String(p.id) === line.subProductId)?.totalCost || 0) * parseFloat(line.portion || '0')).toFixed(3)} {t('currency')}
                </span>
              )}
              <button type="button" className="btn-icon btn-remove" onClick={() => removeSubProductLine(idx)}>×</button>
            </div>
          ))}
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/client/products')}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
