import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import type { Activite } from '../../types';

interface IngredientRow {
  ingredient_id: number;
  nom: string;
  unite_nom: string;
  categorie: string;
  total_quantite: number;
  prix_unitaire: number | null;
}

interface ArticleVendable {
  id: string;
  article_id: number;
  article_type: string;
  prix_vente: number;
}

function PrixModal({
  ingredient,
  onConfirm,
  onClose,
}: {
  ingredient: IngredientRow;
  onConfirm: (prix: number) => Promise<void>;
  onClose: () => void;
}) {
  const [prix, setPrix] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    const p = parseFloat(prix);
    if (!p || p <= 0) { setError('Prix de vente requis'); return; }
    setSaving(true);
    try { await onConfirm(p); }
    catch { setError("Erreur lors de l'enregistrement"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--card-bg)', borderRadius: 16, padding: '28px 24px',
        width: '100%', maxWidth: 380, border: '1px solid var(--border)',
      }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 6 }}>
          Activer la vente
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20 }}>
          <strong>{ingredient.nom}</strong> sera ajouté au catalogue vendable
          en tant qu'article vendu à l'unité ({ingredient.unite_nom}).
        </p>

        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>
          Prix de vente (DT / {ingredient.unite_nom})
        </label>
        <input
          type="number" min="0.01" step="0.01" autoFocus
          value={prix} onChange={e => { setPrix(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleConfirm()}
          placeholder="Ex : 3.50"
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: '0.95rem',
            border: error ? '1px solid #dc2626' : '1px solid var(--border)',
            background: 'var(--bg)', color: 'var(--text)', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {error && <div style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: 6 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={handleConfirm} disabled={saving || !prix}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: saving || !prix ? 'var(--border)' : 'var(--primary)',
              color: saving || !prix ? 'var(--text-muted)' : '#fff',
              cursor: saving || !prix ? 'not-allowed' : 'pointer', fontWeight: 600,
            }}>
            {saving ? 'Enregistrement…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IngredientsActivitePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [vendables, setVendables] = useState<ArticleVendable[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalIngredient, setModalIngredient] = useState<IngredientRow | null>(null);
  const [filterCat, setFilterCat] = useState('');

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => {
      const acts: Activite[] = (data as Activite[]).filter(a => !a.laboId);
      setActivites(acts);
      const paramId = searchParams.get('activiteId');
      const found = acts.find(a => String(a.id) === paramId);
      setSelectedId(found ? found.id : acts[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const loadData = useCallback(() => {
    if (!selectedId) return;
    setLoading(true);
    Promise.all([
      api.get(`/api/stock/entreprise/${selectedId}`),
      api.get(`/api/articles-vendables?activiteId=${selectedId}`),
    ]).then(([ingRes, vendRes]) => {
      setIngredients(ingRes.data as IngredientRow[]);
      setVendables((vendRes.data as ArticleVendable[]).filter(a => a.article_type === 'ingredient'));
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => { loadData(); }, [loadData]);

  const vendableMap = new Map(vendables.map(v => [v.article_id, v]));

  const handleToggleOn = (ing: IngredientRow) => setModalIngredient(ing);

  const handleConfirmVendable = async (prix: number) => {
    if (!modalIngredient || !selectedId) return;
    await api.post('/api/articles-vendables', {
      activite_id: selectedId,
      article_type: 'ingredient',
      article_id: modalIngredient.ingredient_id,
      prix_vente: prix,
      actif: true,
    });
    setModalIngredient(null);
    loadData();
  };

  const handleToggleOff = async (ingId: number) => {
    const article = vendableMap.get(ingId);
    if (!article) return;
    await api.delete(`/api/articles-vendables/${article.id}`).catch(() => {});
    loadData();
  };

  const categories = [...new Set(ingredients.map(i => i.categorie))].sort();
  const filtered = filterCat ? ingredients.filter(i => i.categorie === filterCat) : ingredients;
  const vendableCount = vendables.length;

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Ingrédients Activités</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 20 }}>
        Ingrédients assignés à vos activités — activez la vente au détail sur chacun
      </p>

      {/* Activité selector */}
      {activites.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {activites.map(a => (
            <button key={a.id}
              onClick={() => { setSelectedId(a.id); setSearchParams({ activiteId: String(a.id) }); setFilterCat(''); }}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: '0.85rem', cursor: 'pointer',
                border: '1.5px solid var(--border)',
                background: selectedId === a.id ? 'var(--primary)' : 'var(--card-bg)',
                color: selectedId === a.id ? '#fff' : 'var(--text)',
                fontWeight: selectedId === a.id ? 600 : 400,
              }}>
              {a.nom}
            </button>
          ))}
        </div>
      )}

      {!selectedId ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>
          Aucune activité disponible
        </div>
      ) : loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Chargement…</div>
      ) : ingredients.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>
          Aucun ingrédient assigné à cette activité.<br />
          <span style={{ fontSize: '0.82rem' }}>Assignez des ingrédients depuis le Catalogue Global.</span>
        </div>
      ) : (
        <>
          {/* Filtres catégories + compteur vendables */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            {categories.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Catégorie :</span>
                {[{ label: `Tous (${ingredients.length})`, value: '' }, ...categories.map(c => ({ label: `${c} (${ingredients.filter(i => i.categorie === c).length})`, value: c }))].map(opt => (
                  <button key={opt.value}
                    onClick={() => setFilterCat(opt.value)}
                    style={{
                      padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem', cursor: 'pointer',
                      border: filterCat === opt.value ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                      background: filterCat === opt.value ? 'var(--primary)' : 'var(--card-bg)',
                      color: filterCat === opt.value ? '#fff' : 'var(--text)',
                      fontWeight: filterCat === opt.value ? 600 : 400,
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            {vendableCount > 0 && (
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                🛒 {vendableCount} ingrédient{vendableCount > 1 ? 's' : ''} vendable{vendableCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Table */}
          <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                  {['Ingrédient', 'Catégorie', 'Unité', 'Prix de vente', 'Vendable'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(ing => {
                  const vendable = vendableMap.get(ing.ingredient_id);
                  return (
                    <tr key={ing.ingredient_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: '0.9rem' }}>{ing.nom}</td>
                      <td style={{ padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{ing.categorie}</td>
                      <td style={{ padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{ing.unite_nom}</td>
                      <td style={{ padding: '10px 14px', fontSize: '0.9rem' }}>
                        {vendable
                          ? <span style={{ fontWeight: 600 }}>{vendable.prix_vente.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DT</span>
                          : <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          onClick={() => vendable ? handleToggleOff(ing.ingredient_id) : handleToggleOn(ing)}
                          style={{
                            width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                            background: vendable ? 'var(--primary)' : 'var(--border)',
                            position: 'relative', transition: 'background 0.2s', display: 'inline-block', verticalAlign: 'middle',
                          }}
                          title={vendable ? 'Désactiver la vente' : 'Activer la vente'}
                        >
                          <span style={{
                            position: 'absolute', top: 3, left: vendable ? 23 : 3,
                            width: 18, height: 18, borderRadius: '50%', background: '#fff',
                            transition: 'left 0.2s', display: 'block',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalIngredient && (
        <PrixModal
          ingredient={modalIngredient}
          onConfirm={handleConfirmVendable}
          onClose={() => setModalIngredient(null)}
        />
      )}
    </div>
  );
}
