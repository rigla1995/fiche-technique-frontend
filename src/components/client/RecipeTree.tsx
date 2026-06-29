import { useState, useEffect } from 'react';
import api from '../../api/client';
import { PRODUCT_THEME } from '../../theme/productTheme';

// Recette décomposée récursivement (réponse de GET /api/products/:id/cout = mapCout).
interface RecipeIngredient { name: string; portion: number; unit: string; unitPrice: number; cost: number; }
export interface RecipeNode {
  product: string;
  ingredients: RecipeIngredient[];
  subProducts: { name: string; portion: number; unitCost: number; cost: number; details: RecipeNode }[];
  ingredientsCost: number;
  subProductsCost: number;
  totalCost: number;
}

const fmt = (n: number | null | undefined) => (n != null ? Number(n).toFixed(3) : null);

function Leaf({ ing }: { ing: RecipeIngredient }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: '0.83rem' }}>
      <span style={{ color: '#374151' }}>🧂 {ing.name}</span>
      <span style={{ color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {ing.portion} {ing.unit}{ing.cost > 0 ? `  ·  ${fmt(ing.cost)} DT` : ''}
      </span>
    </div>
  );
}

function Branch({ sp, depth }: { sp: RecipeNode['subProducts'][number]; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', background: PRODUCT_THEME.surfaceTint2, border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: '0.84rem' }}
      >
        <span style={{ color: PRODUCT_THEME.accentText, fontSize: '0.65rem', width: 10 }}>{open ? '▼' : '▶'}</span>
        <span style={{ color: '#5b21b6', fontWeight: 600 }}>🔄 {sp.name}</span>
        <span style={{ marginLeft: 'auto', color: PRODUCT_THEME.accent, fontWeight: 600, whiteSpace: 'nowrap' }}>
          ×{sp.portion}{sp.cost > 0 ? `  ·  ${fmt(sp.cost)} DT` : ''}
        </span>
      </button>
      {open && <div style={{ marginTop: 2 }}><TreeNode node={sp.details} depth={depth + 1} /></div>}
    </div>
  );
}

function TreeNode({ node, depth }: { node: RecipeNode; depth: number }) {
  const empty = node.ingredients.length === 0 && node.subProducts.length === 0;
  return (
    <div style={depth > 0 ? { borderLeft: `2px solid ${PRODUCT_THEME.border}`, paddingLeft: 10, marginLeft: 3 } : undefined}>
      {node.ingredients.map((ing, k) => <Leaf key={`i${k}`} ing={ing} />)}
      {node.subProducts.map((sp, k) => <Branch key={`s${k}`} sp={sp} depth={depth} />)}
      {empty && <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '4px 8px' }}>— Aucun composant</div>}
    </div>
  );
}

// Arborescence de la recette d'un produit (articles + sous-produits décomposés).
// Autonome : charge /cout elle-même. laboId optionnel (composé valorisé → coûts labo).
export default function RecipeTree({ productId, laboId }: { productId: number; laboId?: number }) {
  const [node, setNode] = useState<RecipeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setErr('');
    const qs = laboId ? `?laboId=${laboId}` : '';
    api.get(`/api/products/${productId}/cout${qs}`)
      .then(({ data }) => { if (active) setNode(data as RecipeNode); })
      .catch((e) => { if (active) setErr(e?.response?.data?.message || 'Recette indisponible.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productId, laboId]);

  if (loading) return <div className="loading-text">Chargement…</div>;
  if (err) return <div style={{ color: 'var(--danger)', fontSize: '0.85rem', padding: '4px 0' }}>{err}</div>;
  if (!node) return null;
  return (
    <div>
      <TreeNode node={node} depth={0} />
      {node.totalCost > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: `1px solid ${PRODUCT_THEME.borderSoft}`, fontSize: '0.85rem', fontWeight: 700 }}>
          <span style={{ color: PRODUCT_THEME.accentText }}>Coût total</span>
          <span style={{ color: PRODUCT_THEME.accent }}>{fmt(node.totalCost)} DT</span>
        </div>
      )}
    </div>
  );
}
