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
  const { user, canWrite } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const isEntreprise = true;

  const buildBackUrl = (tab: string) => {
    const params = new URLSearchParams();
    params.set('tab', tab);
    return `/client/products?${params.toString()}`;
  };

  // ── Activity context ─────────────────────────────────────────────────────
  const [allActivities, setAllActivities] = useState<Activite[]>([]);
  const [_typesSummary, setTypesSummary] = useState<ActiviteTypesSummary | null>(null);

  // Selected activity for new products
  const [selectedActId, setSelectedActId] = useState<string>('');

  // preStepDone: for enterprise new products, need to pick activity first
  const [preStepDone, setPreStepDone] = useState(
    !isEntreprise || isEdit
  );

  // ── Form state ───────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [refProduit, setRefProduit] = useState('');
  const [productType] = useState<'vendable' | 'utilisable'>(
    (searchParams.get('type') as 'vendable' | 'utilisable') || 'vendable'
  );
  const [ingredientLines, setIngredientLines] = useState<IngredientLine[]>([]);
  const [subProductLines, setSubProductLines] = useState<SubProductLine[]>([]);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newCatSelect, setNewCatSelect] = useState('');

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedOk, setSavedOk] = useState(false);

  // ── Load activities (enterprise) ─────────────────────────────────────────
  useEffect(() => {
    if (!isEntreprise) return;
    Promise.all([
      api.get('/api/entreprise/activites/types-summary'),
      api.get('/api/entreprise/activites'),
    ]).then(([summaryRes, actsRes]) => {
      const summary = summaryRes.data as ActiviteTypesSummary;
      const acts = actsRes.data as Activite[];
      setTypesSummary(summary);
      setAllActivities(acts);

      if (!isEdit && acts.length === 1) {
        // Auto-select when only one activity
        setSelectedActId(String(acts[0].id));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEntreprise]);

  // ── Load ingredients + product data ──────────────────────────────────────
  useEffect(() => {
    if (!preStepDone) return;

    const mapActiviteIngredient = (i: import('../../types').ActiviteIngredient): Ingredient => ({
      id: i.id,
      name: i.nom,
      price: i.prix,
      clientPrice: i.prixUnitaire,
      effectivePrice: i.prixUnitaire ?? i.prix,
      selected: true,
      unit: { id: 0, name: i.unite },
      unitId: 0,
      categorieId: i.categorieId,
      categorieName: i.categorie,
    } as Ingredient);

    const buildIngredientsFetch = async (): Promise<{ data: unknown }> => {
      const actId = selectedActId ? parseInt(selectedActId) : null;
      if (actId) {
        return api.get(`/api/entreprise/activites/${actId}/ingredients`);
      }
      return api.get('/ingredients');
    };

    setLoading(true);
    const buildProductFetch = () => {
      const params = new URLSearchParams();
      if (selectedActId) params.set('activiteId', selectedActId);
      const qs = params.toString();
      return api.get(qs ? `/products?${qs}` : '/products');
    };

    const fetches: Promise<{ data: unknown }>[] = [
      buildIngredientsFetch(),
      buildProductFetch(),
      api.get('/categories'),
    ];
    if (isEdit && id) fetches.push(api.get(`/products/${id}`));

    Promise.all(fetches)
      .then(([ing, prod, cat, productRes]) => {
        setCategories(cat.data as Category[]);
        let ingData: Ingredient[];
        if (selectedActId) {
          ingData = (ing.data as import('../../types').ActiviteIngredient[]).filter((i) => i.selected).map(mapActiviteIngredient);
        } else {
          ingData = (ing.data as Ingredient[]).filter((i) => i.selected);
        }
        setProducts((prod.data as Product[]).filter((p) => p.type === 'utilisable' && (!id || String(p.id) !== id)));

        if (isEdit && productRes) {
          const data = productRes.data as {
            name: string; refProduit?: string; type: string;
            ingredients: { ingredientId: number; portion: number; unitId?: number; ingredientName?: string; unitPrice?: number; unitName?: string }[];
            subProducts: { subProductId: number; portion: number }[];
          };
          for (const ing of data.ingredients) {
            if (!ingData.find((x) => x.id === ing.ingredientId)) {
              ingData.push({
                id: ing.ingredientId,
                name: ing.ingredientName || String(ing.ingredientId),
                price: ing.unitPrice ?? 0,
                clientPrice: null,
                effectivePrice: ing.unitPrice ?? 0,
                selected: true,
                unit: { id: ing.unitId || 0, name: ing.unitName || '' },
                unitId: ing.unitId || 0,
                categorieId: null,
                categorieName: null,
              } as Ingredient);
            }
          }
          setIngredients(ingData);
          setName(data.name);
          setRefProduit(data.refProduit || '');
          setIngredientLines(data.ingredients.map((i) => {
            const found = ingData.find((x) => x.id === i.ingredientId);
            return { ingredientId: String(i.ingredientId), portion: String(i.portion), categoryFilter: found?.categorieId ? String(found.categorieId) : '' };
          }));
          setSubProductLines(data.subProducts.map((s) => ({ subProductId: String(s.subProductId), portion: String(s.portion) })));
        } else {
          setIngredients(ingData);
        }
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit, preStepDone, selectedActId, allActivities.length]);

  // ── Ingredient helpers ───────────────────────────────────────────────────
  const addIngredientLineInCategory = (catId: string) =>
    setIngredientLines((l) => [...l, { ingredientId: '', portion: '', categoryFilter: catId }]);

  const removeIngredientLine = (i: number) =>
    setIngredientLines((l) => l.filter((_, idx) => idx !== i));

  const updateIngredientLine = (i: number, field: 'ingredientId' | 'portion', value: string) =>
    setIngredientLines((l) => l.map((line, idx) => idx === i ? { ...line, [field]: value } : line));

  const addNewCategory = (catId: string) => {
    if (!catId) return;
    const filter = catId === '__none__' ? '' : catId;
    setIngredientLines((l) => [...l, { ingredientId: '', portion: '', categoryFilter: filter }]);
    setNewCatSelect('');
  };

  // ── Sub-product helpers ──────────────────────────────────────────────────
  const addSubProductLine = () => setSubProductLines((l) => [...l, { subProductId: '', portion: '' }]);
  const removeSubProductLine = (i: number) => setSubProductLines((l) => l.filter((_, idx) => idx !== i));
  const updateSubProductLine = (i: number, field: keyof SubProductLine, value: string) =>
    setSubProductLines((l) => l.map((line, idx) => idx === i ? { ...line, [field]: value } : line));

  // ── Grouping ─────────────────────────────────────────────────────────────
  const selectedIngredientIds = new Set(ingredientLines.map((l) => l.ingredientId).filter(Boolean));

  const orderedCatIds = ingredientLines.reduce<string[]>((acc, line) => {
    if (!acc.includes(line.categoryFilter)) acc.push(line.categoryFilter);
    return acc;
  }, []);

  const groups = orderedCatIds.map((catId) => ({
    catId,
    catName: catId ? (categories.find((c) => String(c.id) === catId)?.name ?? catId) : t('client.ingredients_catalog.no_category'),
    entries: ingredientLines.map((line, idx) => ({ line, idx })).filter(({ line }) => line.categoryFilter === catId),
  }));

  const usedCatIds = new Set(orderedCatIds.filter(Boolean));
  const usedHasNone = orderedCatIds.includes('');
  const catIdsWithIngredients = new Set(
    ingredients.filter((i) => i.categorieId !== null && i.categorieId !== undefined).map((i) => String(i.categorieId))
  );
  const hasUncategorized = ingredients.some((i) => i.categorieId === null || i.categorieId === undefined);
  const availableNewCategories = categories.filter((c) => !usedCatIds.has(String(c.id)) && catIdsWithIngredients.has(String(c.id)));

  const availableForCategory = (catId: string) => {
    const byCategory = catId === '' ? ingredients.filter((i) => !i.categorieId) : ingredients.filter((i) => String(i.categorieId) === catId);
    return byCategory.filter((i) => !selectedIngredientIds.has(String(i.id)));
  };

  const availableForLine = (idx: number) => {
    const line = ingredientLines[idx];
    let byCategory: typeof ingredients;
    if (line.categoryFilter === '') byCategory = ingredients.filter((i) => !i.categorieId);
    else if (line.categoryFilter) byCategory = ingredients.filter((i) => String(i.categorieId) === line.categoryFilter);
    else byCategory = ingredients;
    return byCategory.filter((i) => !selectedIngredientIds.has(String(i.id)) || line.ingredientId === String(i.id));
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        refProduit: refProduit.trim() || null,
        type: productType,
        ingredients: ingredientLines
          .filter((l) => l.ingredientId && l.portion)
          .map((l) => ({ ingredientId: parseInt(l.ingredientId), portion: parseFloat(l.portion) })),
        subProducts: subProductLines
          .filter((l) => l.subProductId && l.portion)
          .map((l) => ({ subProductId: parseInt(l.subProductId), portion: parseFloat(l.portion) })),
      };
      if (selectedActId && !isEdit) {
        payload.activiteId = parseInt(selectedActId);
      }
      if (isEdit) {
        await api.put(`/products/${id}`, payload);
        navigate(buildBackUrl(productType));
      } else {
        await api.post('/products', payload);
        setSavedOk(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('client.products.delete_confirm'))) return;
    await api.delete(`/products/${id}`);
    navigate(buildBackUrl(productType));
  };

  const handlePreStepConfirm = () => {
    setPreStepDone(true);
    setLoading(true);
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const filledIngredients = ingredientLines.filter((l) => l.ingredientId && l.portion);
  const canSubmit = name.trim().length > 0 && filledIngredients.length >= 1;
  const hasNoIngredients = !loading && preStepDone && ingredients.length === 0;

  // ── "Created successfully" screen ─────────────────────────────────────────
  if (savedOk) {
    return (
      <div className="page">
        <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#22c55e,#16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', margin: '0 auto 16px' }}>✓</div>
          <h2 style={{ marginBottom: 8, color: '#166534', fontWeight: 700 }}>{t('client.products.saved_success')}</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 28 }}>Le produit <strong>{name}</strong> a été créé avec succès.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => { setName(''); setRefProduit(''); setIngredientLines([]); setSubProductLines([]); setSavedOk(false); }}>
              + {t('client.products.create_another')}
            </button>
            <button className="btn btn-ghost" onClick={() => navigate(buildBackUrl(productType))}>
              {t('client.products.back_to_list')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Enterprise pre-step (activity selection) ──────────────────────────────
  if (isEntreprise && !isEdit && !preStepDone) {
    return (
      <div className="page">
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
              {productType === 'vendable' ? t('client.products.add_vendable') : t('client.products.add_utilisable')}
            </h1>
            <p style={{ color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
              Sélectionnez l'activité pour ce produit.
            </p>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,#eff6ff,#f8faff)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e40af', marginBottom: 2 }}>🏪 Activité</div>
              <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>Choisissez l'activité pour ce produit</div>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {allActivities.map((a) => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: '1px solid', cursor: 'pointer', transition: 'all 0.15s',
                    borderColor: selectedActId === String(a.id) ? '#bfdbfe' : 'var(--border)',
                    background: selectedActId === String(a.id) ? '#eff6ff' : 'var(--bg)',
                  }}>
                    <input type="radio" name="act-select" checked={selectedActId === String(a.id)} style={{ accentColor: '#3b82f6' }}
                      onChange={() => setSelectedActId(String(a.id))}
                    />
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: selectedActId === String(a.id) ? '#3b82f6' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', flexShrink: 0 }}>🏪</div>
                    <span style={{ fontWeight: selectedActId === String(a.id) ? 600 : 400 }}>{a.nom}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface)' }}>
              <button className="btn btn-ghost" onClick={() => navigate(buildBackUrl(productType))}>{t('common.cancel')}</button>
              <button className="btn btn-primary" disabled={!selectedActId} onClick={handlePreStepConfirm}>
                {t('common.continue')} →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  if (loading) return <div className="page"><div className="loading-text">{t('common.loading')}</div></div>;

  return (
    <div className="page">
      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0 }}>
            {isEdit ? t('client.products.edit') : (
              productType === 'vendable' ? t('client.products.add_vendable') : t('client.products.add_utilisable')
            )}
            <span className={`unit-badge badge-${productType}`} style={{ marginLeft: 10, fontSize: '0.82rem' }}>
              {productType === 'vendable' ? t('client.products.type_vendable') : t('client.products.type_utilisable')}
            </span>
          </h1>
          {selectedActId && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#1e40af' }}>
              🏪 {allActivities.find((a) => String(a.id) === selectedActId)?.nom || `Activité #${selectedActId}`}
            </div>
          )}
        </div>
        <div className="page-header-actions">
          {isEdit && (
            <button className="btn btn-danger btn-sm" onClick={handleDelete}>{t('common.delete')}</button>
          )}
        </div>
      </div>

      {/* No ingredients guard */}
      {hasNoIngredients ? (
        <div style={{ maxWidth: 540, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 14, padding: '28px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#92400e', marginBottom: 8 }}>Aucun ingrédient disponible</div>
          <div style={{ fontSize: '0.88rem', color: '#78350f', lineHeight: 1.5 }}>
            Aucun ingrédient n'est encore sélectionné pour cette activité. Rendez-vous dans le Catalogue Ingrédients pour les sélectionner.
          </div>
          <button className="btn btn-ghost" style={{ marginTop: 20 }} onClick={() => navigate(buildBackUrl(productType))}>
            ← Retour à la liste
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Card: Identité produit ── */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>📝</div>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>Identité du produit</span>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.85rem', marginBottom: 8, color: 'var(--text)' }}>
                  {t('client.products.name')}
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ef4444', background: '#fee2e2', borderRadius: 4, padding: '1px 5px' }}>obligatoire</span>
                </label>
                <input
                  className="input"
                  style={{ fontSize: '1rem', fontWeight: 600, maxWidth: 480 }}
                  required
                  placeholder="Ex. Burger, Pizza Margherita…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 8, color: 'var(--text)' }}>
                  Réf. Produit
                  <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.78rem', marginLeft: 6 }}>(optionnel)</span>
                </label>
                <input
                  className="input"
                  style={{ maxWidth: 300 }}
                  placeholder="Ex. BRG-001, REF-42…"
                  value={refProduit}
                  onChange={(e) => setRefProduit(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── Card: Ingrédients ── */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#22c55e,#16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🧂</div>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{t('client.products.ingredients_section')}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ef4444', background: '#fee2e2', borderRadius: 4, padding: '1px 5px', marginLeft: 2 }}>min 1</span>
              {filledIngredients.length > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: '0.78rem', fontWeight: 600, color: '#15803d', background: '#dcfce7', borderRadius: 12, padding: '2px 10px' }}>
                  {filledIngredients.length} renseigné{filledIngredients.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div style={{ padding: '20px 24px' }}>
              {groups.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>{t('client.products.ingredients_empty')}</p>
              )}

              {groups.map(({ catId, catName, entries }) => (
                <div key={catId} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 700, color: '#16a34a', fontSize: '0.88rem' }}>🏷️ {catName}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({entries.length})</span>
                    {availableForCategory(catId).length > 0 && (
                      <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', fontSize: '0.78rem' }} onClick={() => addIngredientLineInCategory(catId)}>
                        + {t('client.products.add_ingredient')}
                      </button>
                    )}
                  </div>
                  {entries.map(({ line, idx }) => {
                    const unit = ingredients.find((i) => String(i.id) === line.ingredientId)?.unit?.name || '';
                    const available = availableForLine(idx);
                    return (
                      <div key={idx} className="line-row" style={{ marginBottom: 6 }}>
                        <select
                          className="input flex-grow"
                          value={line.ingredientId}
                          onChange={(e) => updateIngredientLine(idx, 'ingredientId', e.target.value)}
                        >
                          <option value="">— {t('client.products.select_ingredient')} —</option>
                          {available.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>
                        <div className="portion-input">
                          <input
                            className="input"
                            type="number" step="0.001" min="0"
                            placeholder={unit === 'pièces' || unit === 'pieces' ? t('client.products.portion_pieces') : t('client.products.portion_grams')}
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

              {(availableNewCategories.length > 0 || (hasUncategorized && !usedHasNone)) && (
                <div style={{ marginTop: 8 }}>
                  <select className="input" style={{ maxWidth: 280, fontSize: '0.85rem' }} value={newCatSelect} onChange={(e) => addNewCategory(e.target.value)}>
                    <option value="">+ {t('client.products.add_new_category')}</option>
                    {availableNewCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    {hasUncategorized && !usedHasNone && <option value="__none__">{t('client.ingredients_catalog.no_category')}</option>}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* ── Card: Produits Utilisables (optional) ── */}
          {(products.length > 0 || subProductLines.length > 0) && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,#fdf4ff,#f3e8ff)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#a855f7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🔧</div>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>{t('client.products.subproducts_section')}</span>
                <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.78rem', marginLeft: 2 }}>(optionnel)</span>
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', fontSize: '0.78rem' }} onClick={addSubProductLine}>
                  + {t('client.products.add_subproduct')}
                </button>
              </div>
              <div style={{ padding: '20px 24px' }}>
                {subProductLines.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>{t('client.products.subproducts_empty')}</p>
                ) : subProductLines.map((line, idx) => (
                  <div key={idx} className="line-row" style={{ marginBottom: 6 }}>
                    <select className="input flex-grow" value={line.subProductId} onChange={(e) => updateSubProductLine(idx, 'subProductId', e.target.value)}>
                      <option value="">— {t('client.products.select_product')} —</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div className="portion-input">
                      <input className="input" type="number" step="0.001" min="0" placeholder={t('common.portion')} value={line.portion} onChange={(e) => updateSubProductLine(idx, 'portion', e.target.value)} />
                      <span className="unit-label">×</span>
                    </div>
                    <button type="button" className="btn-icon btn-remove" onClick={() => removeSubProductLine(idx)}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Actions ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingBottom: 40 }}>
            <button type="button" className="btn btn-ghost" onClick={() => navigate(buildBackUrl(productType))}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !canSubmit || !canWrite}
              style={{ paddingLeft: 28, paddingRight: 28 }}
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
