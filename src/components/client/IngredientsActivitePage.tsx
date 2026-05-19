import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import type { Activite } from '../../types';

const VENTE_COLOR = '#059669';
const VENTE_GRADIENT = 'linear-gradient(135deg, #065f46 0%, #059669 55%, #10b981 100%)';
const VENTE_SHADOW = '0 8px 32px rgba(5,150,105,0.28)';
const VENTE_DARK = '#064e3b';

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 380, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ background: VENTE_GRADIENT, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '6px 8px', fontSize: '1.1rem' }}>🛒</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>Activer la vente</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem', marginTop: 1 }}>{ingredient.nom}</div>
          </div>
        </div>
        <div style={{ padding: '20px 22px' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 18 }}>
            Cet ingrédient sera ajouté au catalogue vendable et pourra être vendu à l'unité ({ingredient.unite_nom}).
          </p>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>Prix de vente (DT / {ingredient.unite_nom})</label>
          <input
            type="number" min="0.01" step="0.01" autoFocus
            value={prix} onChange={e => { setPrix(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            placeholder="Ex : 3.50"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: '0.95rem', border: error ? '1px solid #dc2626' : '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
          />
          {error && <div style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: 6 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>Annuler</button>
            <button onClick={handleConfirm} disabled={saving || !prix}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: saving || !prix ? 'var(--border)' : VENTE_COLOR, color: saving || !prix ? 'var(--text-muted)' : '#fff', cursor: saving || !prix ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
              {saving ? 'Enregistrement…' : 'Confirmer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CatalogueVentePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [vendables, setVendables] = useState<ArticleVendable[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalIngredient, setModalIngredient] = useState<IngredientRow | null>(null);
  // categories fermées par défaut
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

  const selectedActivite = activites.find(a => a.id === selectedId);

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => {
      const acts: Activite[] = data as Activite[];
      setActivites(acts);
      const paramId = searchParams.get('activiteId');
      const found = acts.find(a => String(a.id) === paramId);
      setSelectedId(found ? found.id : acts[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const loadData = useCallback(() => {
    if (!selectedId) return;
    setLoading(true);
    setOpenCats(new Set()); // ferme toutes les catégories au changement d'activité
    Promise.all([
      api.get(`/api/stock/entreprise/${selectedId}`),
      api.get(`/api/articles-vendables?activiteId=${selectedId}`),
    ]).then(([ingRes, vendRes]) => {
      setIngredients(ingRes.data as IngredientRow[]);
      setVendables((vendRes.data as ArticleVendable[]).filter(a => a.article_type === 'ingredient'));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => { loadData(); }, [loadData]);

  const vendableMap = new Map(vendables.map(v => [v.article_id, v]));

  const handleConfirmVendable = async (prix: number) => {
    if (!modalIngredient || !selectedId) return;
    await api.post('/api/articles-vendables', { activite_id: selectedId, article_type: 'ingredient', article_id: modalIngredient.ingredient_id, prix_vente: prix, actif: true });
    setModalIngredient(null);
    loadData();
  };

  const handleToggleOff = async (ingId: number) => {
    const article = vendableMap.get(ingId);
    if (!article) return;
    await api.delete(`/api/articles-vendables/${article.id}`).catch(() => {});
    loadData();
  };

  const toggleCat = (cat: string) => {
    setOpenCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  // Grouper par catégorie, triées
  const groups = ingredients.reduce<Record<string, IngredientRow[]>>((acc, ing) => {
    const cat = ing.categorie || 'Sans catégorie';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ing);
    return acc;
  }, {});
  const sortedCats = Object.keys(groups).sort();
  const vendableCount = vendables.length;

  return (
    <div className="page-content">

      {/* Hero header — thème vente vert */}
      <div style={{
        background: VENTE_GRADIENT, borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: VENTE_SHADOW, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🛒</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Catalogue Vente</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: '0.85rem', margin: 0 }}>
            Activez la vente au détail sur les ingrédients de vos activités
          </p>
        </div>
        {vendableCount > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 12, padding: '8px 16px', color: '#fff', fontSize: '0.88rem', fontWeight: 600 }}>
            🛒 {vendableCount} vendable{vendableCount > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Filtres activité — même schéma ergonomique que StockPage */}
      {activites.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: 4 }}>Activité :</span>
          {activites.map(a => (
            <button key={a.id}
              onClick={() => { setSelectedId(a.id); setSearchParams({ activiteId: String(a.id) }); }}
              style={{
                padding: '5px 14px', borderRadius: 20, fontSize: '0.83rem', cursor: 'pointer',
                border: selectedId === a.id ? `1.5px solid ${VENTE_COLOR}` : '1px solid var(--border)',
                background: selectedId === a.id ? VENTE_COLOR : 'var(--card-bg)',
                color: selectedId === a.id ? '#fff' : 'var(--text)',
                fontWeight: selectedId === a.id ? 700 : 400,
                transition: 'all 0.15s',
              }}>
              {a.nom}
            </button>
          ))}
        </div>
      )}

      {!selectedId ? (
        <p className="text-muted">Aucune activité disponible.</p>
      ) : loading ? (
        <p className="text-muted">Chargement…</p>
      ) : ingredients.length === 0 ? (
        <p className="text-muted">Aucun ingrédient assigné à cette activité. Assignez des ingrédients depuis le Catalogue Global.</p>
      ) : (
        <>
          {/* Bandeau nom d'activité — style section sombre */}
          {selectedActivite && (
            <div style={{
              background: VENTE_DARK, borderRadius: 8, padding: '8px 16px',
              marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>—</span>
              <span style={{ color: '#fff', fontSize: '0.88rem', fontWeight: 700 }}>{selectedActivite.nom}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', marginLeft: 4 }}>
                {ingredients.length} ingrédient{ingredients.length > 1 ? 's' : ''} · {vendableCount} vendable{vendableCount > 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Catégories collapsibles */}
          {sortedCats.map(cat => {
            const items = groups[cat];
            const isOpen = openCats.has(cat);
            const catVendables = items.filter(i => vendableMap.has(i.ingredient_id)).length;

            return (
              <div key={cat} style={{ marginBottom: 8 }}>
                {/* Header catégorie */}
                <button
                  onClick={() => toggleCat(cat)}
                  style={{
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', width: '100%', textAlign: 'left',
                    borderLeft: `4px solid ${VENTE_COLOR}`,
                    borderBottom: isOpen ? 'none' : '1px solid var(--border)',
                    marginBottom: 0, borderRadius: isOpen ? '4px 4px 0 0' : 4,
                    background: isOpen ? 'var(--card-bg)' : 'var(--bg)',
                  } as React.CSSProperties}
                >
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: VENTE_COLOR, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    🏷️ {cat}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                    ({items.length})
                  </span>
                  {catVendables > 0 && (
                    <span style={{ fontSize: '0.72rem', color: VENTE_COLOR, fontWeight: 600, background: `${VENTE_COLOR}18`, borderRadius: 10, padding: '1px 8px' }}>
                      🛒 {catVendables}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {isOpen ? '▼' : '▶'}
                  </span>
                </button>

                {/* Cards ingrédients */}
                {isOpen && (
                  <div style={{
                    border: `1px solid var(--border)`, borderTop: `1px solid ${VENTE_COLOR}30`,
                    borderRadius: '0 0 8px 8px', padding: 12,
                    background: 'var(--card-bg)',
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10,
                  }}>
                    {items.map(ing => {
                      const vendable = vendableMap.get(ing.ingredient_id);
                      return (
                        <div key={ing.ingredient_id} style={{
                          borderRadius: 10,
                          border: vendable ? `1.5px solid ${VENTE_COLOR}` : '1px solid var(--border)',
                          padding: '12px 14px',
                          background: vendable ? `${VENTE_COLOR}08` : 'var(--bg)',
                          position: 'relative',
                          transition: 'border-color 0.15s',
                        }}>
                          {vendable && (
                            <span style={{
                              position: 'absolute', top: 10, right: 10,
                              background: VENTE_COLOR, color: '#fff',
                              borderRadius: 20, padding: '1px 8px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em',
                            }}>VENDABLE</span>
                          )}

                          <div style={{ paddingRight: vendable ? 70 : 0, marginBottom: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 3 }}>{ing.nom}</div>
                            <span style={{ background: 'var(--border)', borderRadius: 5, padding: '1px 7px', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                              {ing.unite_nom}
                            </span>
                          </div>

                          {vendable && (
                            <div style={{ marginBottom: 8, fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Prix de vente</span>
                              <span style={{ fontWeight: 700, color: VENTE_COLOR }}>
                                {vendable.prix_vente.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DT
                              </span>
                            </div>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              {vendable ? 'Vendu au détail' : 'Activer la vente'}
                            </span>
                            <button
                              onClick={() => vendable ? handleToggleOff(ing.ingredient_id) : setModalIngredient(ing)}
                              title={vendable ? 'Désactiver' : 'Activer'}
                              style={{
                                width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                                background: vendable ? VENTE_COLOR : 'var(--border)', position: 'relative', transition: 'background 0.2s',
                              }}>
                              <span style={{
                                position: 'absolute', top: 3, left: vendable ? 21 : 3,
                                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                                transition: 'left 0.2s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                              }} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {modalIngredient && (
        <PrixModal ingredient={modalIngredient} onConfirm={handleConfirmVendable} onClose={() => setModalIngredient(null)} />
      )}
    </div>
  );
}
