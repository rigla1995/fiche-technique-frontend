import { useState, useEffect, useMemo } from 'react';
import api from '../../api/client';

const todayStr = () => new Date().toISOString().split('T')[0];
const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;

interface RecipeIngredient {
  ingredientId: number;
  nom: string;
  unite: string;
  categorie: string;
  categorieId: number | null;
  portionStandard: number;
  lastPrix: number | null;
}

export interface CustomPortion {
  ingredientId: number;
  portionCustom: number;
}

interface Props {
  produitNom: string;
  recipeUrl: string;
  stockMap?: Record<number, number>;
  onSave: (qty: number, dateAppro: string, customPortions: CustomPortion[]) => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
  theme?: 'labo' | 'activite';
}

const THEMES = {
  labo: {
    gradientStart: '#4c1d95', gradientEnd: '#7c3aed',
    primary: '#7c3aed', primaryDark: '#6d28d9', primaryDeep: '#5b21b6',
    bg: '#f5f3ff', border: '#ddd6fe',
  },
  activite: {
    gradientStart: '#1e40af', gradientEnd: '#2563eb',
    primary: '#2563eb', primaryDark: '#1d4ed8', primaryDeep: '#1e40af',
    bg: '#eff6ff', border: '#bfdbfe',
  },
};

export default function PortionsModal({ produitNom, recipeUrl, stockMap, onSave, onClose, onSaved, theme = 'labo' }: Props) {
  const T = THEMES[theme];
  const [recipe, setRecipe] = useState<RecipeIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [portions, setPortions] = useState<Record<number, string>>({});
  const [qty, setQty] = useState('');
  const [dateAppro, setDateAppro] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState<{ msg: string; disponible?: number; demande?: number } | null>(null);
  const [done, setDone] = useState(false);

  // Filters
  const [fCategorie, setFCategorie] = useState('');
  const [fIngredient, setFIngredient] = useState('');
  const [fNom, setFNom] = useState('');

  useEffect(() => {
    api.get(recipeUrl).then(({ data }) => {
      const rows = data as RecipeIngredient[];
      setRecipe(rows);
      const init: Record<number, string> = {};
      for (const r of rows) init[r.ingredientId] = String(r.portionStandard);
      setPortions(init);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [recipeUrl]);

  // Derived filter options
  const categories = useMemo(() => {
    const seen = new Set<string>();
    return recipe.filter((r) => { const k = r.categorie; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((r) => ({ id: r.categorieId, nom: r.categorie }));
  }, [recipe]);

  const ingredientsForCat = useMemo(() => {
    if (!fCategorie) return recipe;
    return recipe.filter((r) => String(r.categorieId) === fCategorie);
  }, [recipe, fCategorie]);

  const visibleRecipe = useMemo(() => {
    return recipe.filter((r) => {
      if (fCategorie && String(r.categorieId) !== fCategorie) return false;
      if (fIngredient && String(r.ingredientId) !== fIngredient) return false;
      if (fNom && !r.nom.toLowerCase().includes(fNom.toLowerCase())) return false;
      return true;
    });
  }, [recipe, fCategorie, fIngredient, fNom]);

  // Live prixCalcule based on current portions × lastPrix
  const prixCalcule = useMemo(() => {
    let total = 0;
    for (const r of recipe) {
      const p = parseFloat(portions[r.ingredientId] ?? String(r.portionStandard));
      if (!isNaN(p) && r.lastPrix != null) total += p * r.lastPrix;
    }
    return total;
  }, [recipe, portions]);

  const coutTotal = qty && parseFloat(qty) > 0 ? prixCalcule * parseFloat(qty) : null;

  // Max realizable qty based on current ingredient stock vs current portions
  const maxQty = useMemo(() => {
    if (!stockMap || recipe.length === 0) return null;
    let min = Infinity;
    for (const r of recipe) {
      const p = parseFloat(portions[r.ingredientId] ?? String(r.portionStandard));
      if (isNaN(p) || p <= 0) continue;
      const stock = stockMap[r.ingredientId];
      if (stock == null) continue;
      min = Math.min(min, stock / p);
    }
    return isFinite(min) ? min : null;
  }, [recipe, portions, stockMap]);

  const qtyNum = parseFloat(qty);
  const qtyExceedsMax = maxQty != null && !isNaN(qtyNum) && qtyNum > maxQty;

  const handleSave = async () => {
    if (!qty || parseFloat(qty) <= 0) { setError('Quantité invalide'); return; }
    if (qtyExceedsMax) { setError(`Quantité dépasse le max réalisable (${maxQty!.toFixed(3)})`); return; }
    setSaving(true);
    setError('');
    setErrorDetail(null);
    try {
      // Only send portions that differ from standard
      const customPortions: CustomPortion[] = recipe
        .filter((r) => {
          const custom = parseFloat(portions[r.ingredientId] ?? String(r.portionStandard));
          return !isNaN(custom) && custom !== r.portionStandard;
        })
        .map((r) => ({ ingredientId: r.ingredientId, portionCustom: parseFloat(portions[r.ingredientId]) }));

      await onSave(parseFloat(qty), dateAppro, customPortions);
      setDone(true);
      onSaved();
      setTimeout(onClose, 1200);
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { message?: string; disponible?: number; demande?: number } } })?.response?.data;
      if (d?.disponible !== undefined) {
        setErrorDetail({ msg: d.message ?? 'Stock insuffisant', disponible: d.disponible, demande: d.demande });
      } else {
        setError(d?.message ?? 'Erreur serveur');
      }
    }
    setSaving(false);
  };

  const LABEL: React.CSSProperties = { fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 700, width: '95vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: `linear-gradient(135deg, ${T.gradientStart}, ${T.gradientEnd})`, borderBottom: 'none' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>⚙️ Portions personnalisées — {produitNom}</h2>
          <button className="modal-close" onClick={onClose} style={{ color: '#fff' }}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {done ? (
            <p style={{ color: 'var(--success)', fontWeight: 700, textAlign: 'center' }}>✓ Appro enregistrée</p>
          ) : loading ? (
            <p className="text-muted" style={{ textAlign: 'center', padding: '20px 0' }}>Chargement de la recette…</p>
          ) : recipe.length === 0 ? (
            <p className="text-muted" style={{ textAlign: 'center', padding: '20px 0' }}>Ce produit n'a pas d'ingrédients dans la recette.</p>
          ) : (
            <>
              {/* Header inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ ...LABEL, display: 'block', marginBottom: 4 }}>Quantité PT appro</label>
                  <input type="number" min="0.001" step="0.001"
                    max={maxQty != null ? maxQty : undefined}
                    className="input" style={{ width: '100%', border: qtyExceedsMax ? '1.5px solid #dc2626' : undefined, background: qtyExceedsMax ? '#fef2f2' : undefined }}
                    value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Ex: 10" autoFocus />
                  {qtyExceedsMax && (
                    <p style={{ color: '#dc2626', fontSize: '0.72rem', marginTop: 3 }}>
                      Dépasse le max réalisable ({maxQty!.toFixed(3)})
                    </p>
                  )}
                </div>
                <div>
                  <label style={{ ...LABEL, display: 'block', marginBottom: 4 }}>Date d'appro</label>
                  <input type="date" className="input" style={{ width: '100%' }}
                    min={yearStart} max={todayStr()} value={dateAppro} onChange={(e) => setDateAppro(e.target.value)} />
                </div>
              </div>

              {/* Prix indicator */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: T.primaryDeep, fontWeight: 700 }}>Prix unitaire PT</span>
                  <span style={{ fontWeight: 900, color: T.primary }}>{prixCalcule.toFixed(3)} DT</span>
                </div>
                {coutTotal != null && coutTotal > 0 && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 700 }}>Coût total appro</span>
                    <span style={{ fontWeight: 900, color: '#15803d' }}>{coutTotal.toFixed(3)} DT</span>
                  </div>
                )}
                {maxQty != null && (
                  <div style={{ background: qtyExceedsMax ? '#fef2f2' : T.bg, border: `1px solid ${qtyExceedsMax ? '#fecaca' : T.border}`, borderRadius: 8, padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: qtyExceedsMax ? '#991b1b' : T.primaryDark, fontWeight: 700 }}>Qté max réalisable</span>
                    <span style={{ fontWeight: 900, color: qtyExceedsMax ? '#dc2626' : T.primary }}>{maxQty.toFixed(3)}</span>
                  </div>
                )}
              </div>

              {/* Filters */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 14px' }}>
                  <div>
                    <label style={{ ...LABEL, display: 'block', marginBottom: 3 }}>Catégorie</label>
                    <select className="input" style={{ width: '100%', fontSize: '0.85rem' }} value={fCategorie}
                      onChange={(e) => { setFCategorie(e.target.value); setFIngredient(''); }}>
                      <option value="">— Toutes —</option>
                      {categories.map((c) => <option key={c.nom} value={String(c.id ?? '')}>{c.nom}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ ...LABEL, display: 'block', marginBottom: 3 }}>Article</label>
                    <select className="input" style={{ width: '100%', fontSize: '0.85rem' }} value={fIngredient}
                      onChange={(e) => setFIngredient(e.target.value)} disabled={ingredientsForCat.length === 0}>
                      <option value="">— Tous —</option>
                      {ingredientsForCat.map((r) => <option key={r.ingredientId} value={String(r.ingredientId)}>{r.nom}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ ...LABEL, display: 'block', marginBottom: 3 }}>Nom</label>
                    <input type="text" className="input" style={{ width: '100%', fontSize: '0.85rem' }}
                      placeholder="Recherche…" value={fNom} onChange={(e) => setFNom(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Ingredients table */}
              <div className="table-responsive" style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', maxHeight: 320, overflowY: 'auto' }}>
                <table className="table" style={{ minWidth: 500 }}>
                  <thead>
                    <tr>
                      <th style={{ background: T.primary, color: '#fff' }}>Article</th>
                      <th style={{ background: T.primary, color: '#fff', textAlign: 'right' }}>Portion standard</th>
                      <th style={{ background: T.primary, color: '#fff', textAlign: 'right' }}>Portion custom</th>
                      <th style={{ background: T.primary, color: '#fff', textAlign: 'right' }}>Prix unit.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRecipe.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px 0' }}>Aucun article pour ces filtres</td></tr>
                    ) : visibleRecipe.map((r, i) => {
                      const customVal = portions[r.ingredientId] ?? String(r.portionStandard);
                      const isModified = parseFloat(customVal) !== r.portionStandard && customVal !== '';
                      return (
                        <tr key={r.ingredientId} style={{ background: i % 2 === 0 ? 'var(--surface)' : '#f8faff' }}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{r.nom}</div>
                            {r.categorie && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>{r.categorie}</div>}
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: T.primary, marginTop: 1 }}>{r.unite}</div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: T.primaryDark, background: T.bg, borderRadius: 6, padding: '2px 8px' }}>{r.portionStandard.toFixed(3)}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number" min="0" step="0.001" className="input"
                              style={{ width: 90, textAlign: 'right', padding: '3px 6px', fontSize: '0.88rem',
                                border: isModified ? '1.5px solid #f59e0b' : undefined,
                                background: isModified ? '#fffbeb' : undefined }}
                              value={customVal}
                              onChange={(e) => setPortions((prev) => ({ ...prev, [r.ingredientId]: e.target.value }))}
                            />
                          </td>
                          <td style={{ textAlign: 'right', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {r.lastPrix != null ? r.lastPrix.toFixed(3) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 600 }}>⚠ {error}</p>}
              {errorDetail && (
                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                    <span style={{ fontWeight: 700, color: '#dc2626', fontSize: '0.88rem' }}>{errorDetail.msg}</span>
                    <button onClick={() => setErrorDetail(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', opacity: 0.6, fontSize: '0.9rem' }}>✕</button>
                  </div>
                  {errorDetail.disponible !== undefined && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '7px 12px', flex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Disponible</div>
                        <div style={{ fontWeight: 900, color: '#15803d', fontSize: '1.05rem' }}>{errorDetail.disponible}</div>
                      </div>
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '7px 12px', flex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Demandé</div>
                        <div style={{ fontWeight: 900, color: '#dc2626', fontSize: '1.05rem' }}>{errorDetail.demande}</div>
                      </div>
                      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '7px 12px', flex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Excédent</div>
                        <div style={{ fontWeight: 900, color: '#ea580c', fontSize: '1.05rem' }}>+{((errorDetail.demande ?? 0) - (errorDetail.disponible ?? 0)).toFixed(3)}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        {!done && !loading && recipe.length > 0 && (
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button
              className="btn btn-primary btn-sm"
              style={{ background: `linear-gradient(135deg, ${T.gradientStart}, ${T.gradientEnd})`, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700 }}
              onClick={handleSave} disabled={saving || !qty || parseFloat(qty) <= 0 || qtyExceedsMax}
            >
              {saving ? '…' : 'Enregistrer l\'appro'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
