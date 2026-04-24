import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, ActiviteTypesSummary, Category, Ingredient, Product } from '../../types';

interface IngredientLine {
  ingredientId: string;
  portion: string;
  categoryFilter: string;
}

interface SubProductLine {
  subProductId: string;
  portion: string;
}

export default function ProductForm() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const isEntreprise = user?.compteType === 'entreprise';

  // Activity context from URL (used in edit mode or when coming from old links)
  const urlActCtx = searchParams.get('actCtx') || '';

  // Enterprise pre-step state (new products only)
  const needsPreStep = isEntreprise && !isEdit;
  const [preStepDone, setPreStepDone] = useState(!needsPreStep);
  const [typesSummary, setTypesSummary] = useState<ActiviteTypesSummary | null>(null);
  const [allActivities, setAllActivities] = useState<Activite[]>([]);
  const [preActType, setPreActType] = useState<'franchise' | 'distincte' | ''>('');
  const [preFranchiseGroup, setPreFranchiseGroup] = useState('');
  const [preCheckedActIds, setPreCheckedActIds] = useState<Set<number>>(new Set());
  const [preDistinctActId, setPreDistinctActId] = useState<string>('');

  // Resolved activity context after pre-step
  const [resolvedActCtx, setResolvedActCtx] = useState(urlActCtx);

  const isFranchiseCtx = resolvedActCtx === 'franchise';
  const distinctActId = resolvedActCtx.startsWith('distinct-') ? parseInt(resolvedActCtx.replace('distinct-', '')) : null;

  const [name, setName] = useState('');
  const [productType, setProductType] = useState<'vendable' | 'utilisable'>(
    (searchParams.get('type') as 'vendable' | 'utilisable') || 'vendable'
  );
  const [ingredientLines, setIngredientLines] = useState<IngredientLine[]>([]);
  const [subProductLines, setSubProductLines] = useState<SubProductLine[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatSelect, setNewCatSelect] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Load activities for enterprise pre-step
  useEffect(() => {
    if (!needsPreStep) return;
    Promise.all([
      api.get('/api/entreprise/activites/types-summary'),
      api.get('/api/entreprise/activites'),
    ]).then(([summaryRes, actsRes]) => {
      const summary = summaryRes.data as ActiviteTypesSummary;
      const acts = actsRes.data as Activite[];
      setTypesSummary(summary);
      setAllActivities(acts);
      // auto-check all franchise activities
      const franchiseIds = acts.filter((a) => a.type === 'franchise').map((a) => a.id);
      setPreCheckedActIds(new Set(franchiseIds));
    });
  }, [needsPreStep]);

  useEffect(() => {
    if (needsPreStep && !preStepDone) return; // wait for pre-step

    // For enterprise with activity context, load ingredients from that activity
    const ingredientsFetch: Promise<{ data: unknown }> = resolvedActCtx
      ? (isFranchiseCtx
          ? api.get('/api/entreprise/activites').then(({ data }) => {
              const first = (data as Activite[]).find((a) => a.type === 'franchise');
              return first
                ? api.get(`/api/entreprise/activites/${first.id}/ingredients`)
                : api.get('/ingredients');
            })
          : api.get(`/api/entreprise/activites/${distinctActId}/ingredients`))
      : api.get('/ingredients');

    const productsFetch = api.get('/products');
    const categoriesFetch = api.get('/categories');
    const fetches: Promise<{ data: unknown }>[] = [ingredientsFetch, productsFetch, categoriesFetch];
    if (isEdit && id) fetches.push(api.get(`/products/${id}`));

    Promise.all(fetches)
      .then(([ing, prod, cat, productRes]) => {
        // Activity ingredients come as ActiviteIngredient[] (selected field), global comes as Ingredient[]
        const catData = cat.data as Category[];
        setCategories(catData);
        let ingData: Ingredient[];
        if (resolvedActCtx) {
          ingData = (ing.data as import('../../types').ActiviteIngredient[])
            .filter((i) => i.selected)
            .map((i) => {
              const foundCat = catData.find((c) => c.name === i.categorie);
              return {
                id: i.id,
                name: i.nom,
                price: i.prix,
                clientPrice: i.prixUnitaire,
                effectivePrice: i.prixUnitaire ?? i.prix,
                selected: true,
                unit: { id: 0, name: i.unite },
                unitId: 0,
                categorieId: foundCat?.id ?? null,
                categorieName: i.categorie,
              } as Ingredient;
            });
        } else {
          ingData = (ing.data as Ingredient[]).filter((i) => i.selected);
        }
        setIngredients(ingData);
        setProducts(
          (prod.data as Product[]).filter(
            (p) => p.type === 'utilisable' && (!id || String(p.id) !== id)
          )
        );
        if (!resolvedActCtx) setCategories(catData);

        if (isEdit && productRes) {
          const data = productRes.data as {
            name: string;
            type: string;
            ingredients: { ingredientId: number; portion: number }[];
            subProducts: { subProductId: number; portion: number }[];
          };
          setName(data.name);
          setProductType(data.type === 'utilisable' ? 'utilisable' : 'vendable');
          setIngredientLines(
            data.ingredients.map((i) => {
              const found = ingData.find((x) => x.id === i.ingredientId);
              return {
                ingredientId: String(i.ingredientId),
                portion: String(i.portion),
                categoryFilter: found?.categorieId ? String(found.categorieId) : '',
              };
            })
          );
          setSubProductLines(
            data.subProducts.map((s) => ({
              subProductId: String(s.subProductId),
              portion: String(s.portion),
            }))
          );
        }
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit, preStepDone, resolvedActCtx]);


  // --- Ingredient line helpers ---
  const addIngredientLineInCategory = (catId: string) =>
    setIngredientLines((l) => [...l, { ingredientId: '', portion: '', categoryFilter: catId }]);

  const removeIngredientLine = (i: number) =>
    setIngredientLines((l) => l.filter((_, idx) => idx !== i));

  const updateIngredientLine = (i: number, field: 'ingredientId' | 'portion', value: string) =>
    setIngredientLines((l) => l.map((line, idx) => (idx === i ? { ...line, [field]: value } : line)));

  const addNewCategory = (catId: string) => {
    if (!catId) return;
    setIngredientLines((l) => [...l, { ingredientId: '', portion: '', categoryFilter: catId }]);
    setNewCatSelect('');
  };

  // --- Sub-product helpers ---
  const addSubProductLine = () => setSubProductLines((l) => [...l, { subProductId: '', portion: '' }]);
  const removeSubProductLine = (i: number) => setSubProductLines((l) => l.filter((_, idx) => idx !== i));
  const updateSubProductLine = (i: number, field: keyof SubProductLine, value: string) =>
    setSubProductLines((l) => l.map((line, idx) => (idx === i ? { ...line, [field]: value } : line)));

  // --- Grouping logic ---
  const selectedIngredientIds = new Set(ingredientLines.map((l) => l.ingredientId).filter(Boolean));

  const orderedCatIds = ingredientLines.reduce<string[]>((acc, line) => {
    if (!acc.includes(line.categoryFilter)) acc.push(line.categoryFilter);
    return acc;
  }, []);

  const groups = orderedCatIds.map((catId) => ({
    catId,
    catName: catId
      ? (categories.find((c) => String(c.id) === catId)?.name ?? catId)
      : t('client.ingredients_catalog.no_category'),
    entries: ingredientLines.map((line, idx) => ({ line, idx })).filter(({ line }) => line.categoryFilter === catId),
  }));

  const usedCatIds = new Set(orderedCatIds.filter(Boolean));
  const availableNewCategories = categories.filter((c) => !usedCatIds.has(String(c.id)));

  const availableForLine = (idx: number) => {
    const line = ingredientLines[idx];
    const byCategory = line.categoryFilter
      ? ingredients.filter((i) => String(i.categorieId) === line.categoryFilter)
      : ingredients;
    return byCategory.filter(
      (i) => !selectedIngredientIds.has(String(i.id)) || line.ingredientId === String(i.id)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        type: productType,
        ingredients: ingredientLines
          .filter((l) => l.ingredientId && l.portion)
          .map((l) => ({ ingredientId: parseInt(l.ingredientId), portion: parseFloat(l.portion) })),
        subProducts: subProductLines
          .filter((l) => l.subProductId && l.portion)
          .map((l) => ({ subProductId: parseInt(l.subProductId), portion: parseFloat(l.portion) })),
      };
      if (resolvedActCtx && !isEdit) {
        if (isFranchiseCtx) {
          payload.activiteType = 'franchise';
        } else if (distinctActId) {
          payload.activiteId = distinctActId;
          payload.activiteType = 'distincte';
        }
      }
      if (isEdit) {
        await api.put(`/products/${id}`, payload);
        navigate(`/client/products?tab=${productType}`);
      } else {
        await api.post('/products', payload);
        setSavedOk(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAnother = () => {
    setName('');
    setIngredientLines([]);
    setSubProductLines([]);
    setSavedOk(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(t('client.products.delete_confirm'))) return;
    await api.delete(`/products/${id}`);
    navigate(`/client/products?tab=${productType}`);
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

  // Enterprise pre-step derived data
  const franchiseGroups = Array.from(new Set(
    allActivities.filter((a) => a.type === 'franchise').map((a) => a.franchiseGroup || a.nom)
  ));
  const franchiseActivitiesInGroup = allActivities.filter(
    (a) => a.type === 'franchise' && (!preFranchiseGroup || (a.franchiseGroup || a.nom) === preFranchiseGroup)
  );
  const distinctActivities = allActivities.filter((a) => a.type === 'distincte');

  const handlePreStepConfirm = () => {
    if (preActType === 'franchise') {
      setResolvedActCtx('franchise');
    } else if (preActType === 'distincte' && preDistinctActId) {
      setResolvedActCtx(`distinct-${preDistinctActId}`);
    }
    setPreStepDone(true);
    setLoading(true);
  };

  // Show pre-step for enterprise new products
  if (needsPreStep && !preStepDone) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>{productType === 'vendable' ? t('client.products.add_vendable') : t('client.products.add_utilisable')}</h1>
        </div>
        <div className="card" style={{ maxWidth: 520 }}>
          <h2 style={{ marginBottom: 16, fontSize: '1rem' }}>{t('client.products.choose_activity_type')}</h2>

          {/* Type selector */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {typesSummary?.hasFranchise && (
              <button
                type="button"
                className={`btn btn-sm ${preActType === 'franchise' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setPreActType('franchise'); setPreDistinctActId(''); }}
              >
                Franchise
              </button>
            )}
            {typesSummary?.hasDistinct && (
              <button
                type="button"
                className={`btn btn-sm ${preActType === 'distincte' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setPreActType('distincte'); setPreFranchiseGroup(''); }}
              >
                Distinct
              </button>
            )}
          </div>

          {/* Franchise: group + activities checkboxes */}
          {preActType === 'franchise' && (
            <>
              {franchiseGroups.length > 1 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>
                    {t('client.fiche_technique.choose_franchise_group')}
                  </label>
                  <select className="input" style={{ maxWidth: 280 }} value={preFranchiseGroup} onChange={(e) => setPreFranchiseGroup(e.target.value)}>
                    <option value="">— tous les groupes —</option>
                    {franchiseGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: '0.875rem' }}>
                  {t('client.products.included_activities')}
                </label>
                {franchiseActivitiesInGroup.map((a) => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={preCheckedActIds.has(a.id)}
                      onChange={(e) => {
                        const next = new Set(preCheckedActIds);
                        if (e.target.checked) next.add(a.id); else next.delete(a.id);
                        setPreCheckedActIds(next);
                      }}
                    />
                    <span>{a.nom}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {/* Distinct: activity selector */}
          {preActType === 'distincte' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: '0.875rem' }}>
                {t('client.fiche_technique.choose_activity')}
              </label>
              <select className="input" style={{ maxWidth: 280 }} value={preDistinctActId} onChange={(e) => setPreDistinctActId(e.target.value)}>
                <option value="">— {t('client.fiche_technique.choose_activity')} —</option>
                {distinctActivities.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!preActType || (preActType === 'distincte' && !preDistinctActId)}
              onClick={handlePreStepConfirm}
            >
              {t('common.continue')} →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // "Créer un autre" screen
  if (savedOk) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>{productType === 'vendable' ? t('client.products.add_vendable') : t('client.products.add_utilisable')}</h1>
        </div>
        <div className="card" style={{ maxWidth: 480, textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>✅</div>
          <p style={{ fontWeight: 600, marginBottom: 20 }}>{t('client.products.saved_success')}</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={handleCreateAnother}>
              + {t('client.products.create_another')}
            </button>
            <button className="btn btn-ghost" onClick={() => navigate(`/client/products?tab=${productType}`)}>
              {t('client.products.back_to_list')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="page"><div className="loading-text">{t('common.loading')}</div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>
          {isEdit ? t('client.products.edit') : (
            productType === 'vendable'
              ? t('client.products.add_vendable')
              : t('client.products.add_utilisable')
          )}
          <span className={`unit-badge badge-${productType}`} style={{ marginLeft: 10, fontSize: '0.85rem' }}>
            {productType === 'vendable' ? t('client.products.type_vendable') : t('client.products.type_utilisable')}
          </span>
        </h1>
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
        {/* Product name */}
        <div className="card">
          <div className="form-group">
            <label className="form-label">{t('client.products.name')}</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        {/* Ingredients grouped by category */}
        <div className="card">
          <div className="section-header">
            <h2>{t('client.products.ingredients_section')}</h2>
          </div>

          {groups.length === 0 && (
            <p className="empty-text">{t('client.products.ingredients_empty')}</p>
          )}

          {groups.map(({ catId, catName, entries }) => (
            <div key={catId} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.95rem' }}>🏷️ {catName}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>({entries.length})</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => addIngredientLineInCategory(catId)}
                >
                  + {t('client.products.add_ingredient')}
                </button>
              </div>

              {entries.map(({ line, idx }) => {
                const unit = ingredients.find((i) => String(i.id) === line.ingredientId)?.unit?.name || '';
                const available = availableForLine(idx);
                return (
                  <div key={idx} className="line-row">
                    <select
                      className="input flex-grow"
                      value={line.ingredientId}
                      onChange={(e) => updateIngredientLine(idx, 'ingredientId', e.target.value)}
                    >
                      <option value="">— {t('client.products.select_ingredient')} —</option>
                      {available.map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                    <div className="portion-input">
                      <input
                        className="input"
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder={unit === 'pièces' || unit === 'pieces'
                          ? t('client.products.portion_pieces')
                          : t('client.products.portion_grams')}
                        value={line.portion}
                        onChange={(e) => updateIngredientLine(idx, 'portion', e.target.value)}
                      />
                      {unit && <span className="unit-label">{unit}</span>}
                    </div>
                    <button type="button" className="btn-icon btn-remove" onClick={() => removeIngredientLine(idx)}>×</button>
                  </div>
                );
              })}
            </div>
          ))}

          {availableNewCategories.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <select
                className="input"
                style={{ maxWidth: 300 }}
                value={newCatSelect}
                onChange={(e) => addNewCategory(e.target.value)}
              >
                <option value="">+ {t('client.products.add_new_category')}</option>
                {availableNewCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Sub-products — only for vendable */}
        {productType === 'vendable' && (
          <div className="card">
            <div className="section-header">
              <h2>{t('client.products.subproducts_section')}</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addSubProductLine}>
                + {t('client.products.add_subproduct')}
              </button>
            </div>
            {subProductLines.length === 0 && products.length === 0 ? (
              <p className="empty-text" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {t('client.products.no_utilisable_products')}
              </p>
            ) : subProductLines.length === 0 ? (
              <p className="empty-text">{t('client.products.subproducts_empty')}</p>
            ) : null}
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
                  <span className="unit-label">×</span>
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
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(`/client/products?tab=${productType}`)}>

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
