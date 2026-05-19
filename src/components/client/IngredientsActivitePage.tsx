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
    catch { setError('Erreur lors de l\'enregistrement'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--card-bg)', borderRadius: 18, padding: '32px 28px',
        width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, var(--primary), #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem',
          }}>🛒</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Activer comme vendable</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{ingredient.nom}</div>
          </div>
        </div>

        <div style={{
          background: 'var(--bg)', borderRadius: 10, padding: '12px 14px',
          fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: 20,
          borderLeft: '3px solid var(--primary)',
        }}>
          Cet ingrédient sera ajouté à votre catalogue vendable et pourra être vendu à l'unité ({ingredient.unite_nom}).
        </div>

        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>
          Prix de vente (DT / {ingredient.unite_nom})
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input
            type="number" min="0.01" step="0.01" autoFocus
            value={prix} onChange={e => { setPrix(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            placeholder="Ex : 3.50"
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 9, fontSize: '1rem', fontWeight: 600,
              border: error ? '2px solid #dc2626' : '1.5px solid var(--border)',
              background: 'var(--bg)', color: 'var(--text)', outline: 'none',
            }}
          />
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>DT</span>
        </div>
        {error && <div style={{ color: '#dc2626', fontSize: '0.8rem', marginBottom: 8 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px 0', borderRadius: 9, border: '1.5px solid var(--border)', background: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}>
            Annuler
          </button>
          <button onClick={handleConfirm} disabled={saving || !prix}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 9, border: 'none',
              background: saving || !prix ? 'var(--border)' : 'var(--primary)',
              color: saving || !prix ? 'var(--text-muted)' : '#fff',
              cursor: saving || !prix ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.9rem',
              transition: 'all 0.15s',
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
      setVendables((vendRes.data as ArticleVendable[]).filter((a: any) => a.article_type === 'ingredient'));
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => { loadData(); }, [loadData]);

  const isVendable = (ingId: number) => vendables.find(v => v.article_id === ingId);

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
    const article = isVendable(ingId);
    if (!article) return;
    await api.delete(`/api/articles-vendables/${article.id}`).catch(() => {});
    loadData();
  };

  const categories = [...new Set(ingredients.map(i => i.categorie))].sort();
  const filtered = filterCat ? ingredients.filter(i => i.categorie === filterCat) : ingredients;
  const vendableCount = vendables.length;

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 4, letterSpacing: '-0.02em' }}>
            Ingrédients Activités
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Gérez les ingrédients de vos activités et activez la vente au détail
          </p>
        </div>
        {vendableCount > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, var(--primary), #6366f1)',
            borderRadius: 12, padding: '10px 18px', color: '#fff',
            fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>🛒</span>
            <span>{vendableCount} vendable{vendableCount > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Activité selector */}
      {activites.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {activites.map(a => (
            <button key={a.id}
              onClick={() => { setSelectedId(a.id); setSearchParams({ activiteId: String(a.id) }); setFilterCat(''); }}
              style={{
                padding: '7px 16px', borderRadius: 20, fontSize: '0.85rem', cursor: 'pointer',
                border: '1.5px solid var(--border)', transition: 'all 0.15s',
                background: selectedId === a.id ? 'var(--primary)' : 'var(--card-bg)',
                color: selectedId === a.id ? '#fff' : 'var(--text)',
                fontWeight: selectedId === a.id ? 700 : 400,
                boxShadow: selectedId === a.id ? '0 2px 12px rgba(var(--primary-rgb,99,102,241),0.25)' : 'none',
              }}>
              {a.nom}
            </button>
          ))}
        </div>
      )}

      {!selectedId ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '80px 0' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🧂</div>
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>Aucune activité disponible</div>
        </div>
      ) : loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>Chargement…</div>
      ) : ingredients.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '80px 0' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🧂</div>
          <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>Aucun ingrédient assigné</div>
          <div style={{ fontSize: '0.85rem' }}>Assignez des ingrédients à cette activité depuis le Catalogue Global</div>
        </div>
      ) : (
        <>
          {/* Filtres catégories */}
          {categories.length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Catégorie :</span>
              <button
                onClick={() => setFilterCat('')}
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem', cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: !filterCat ? 'var(--text)' : 'var(--card-bg)',
                  color: !filterCat ? 'var(--card-bg)' : 'var(--text)',
                  fontWeight: !filterCat ? 600 : 400,
                }}>
                Tous ({ingredients.length})
              </button>
              {categories.map(cat => (
                <button key={cat}
                  onClick={() => setFilterCat(cat)}
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem', cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: filterCat === cat ? 'var(--text)' : 'var(--card-bg)',
                    color: filterCat === cat ? 'var(--card-bg)' : 'var(--text)',
                    fontWeight: filterCat === cat ? 600 : 400,
                  }}>
                  {cat} ({ingredients.filter(i => i.categorie === cat).length})
                </button>
              ))}
            </div>
          )}

          {/* Liste */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {filtered.map(ing => {
              const vendable = isVendable(ing.ingredient_id);
              return (
                <div key={ing.ingredient_id} style={{
                  background: 'var(--card-bg)', borderRadius: 14, padding: '16px 18px',
                  border: vendable ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                  transition: 'all 0.2s', position: 'relative',
                  boxShadow: vendable ? '0 2px 16px rgba(var(--primary-rgb,99,102,241),0.12)' : '0 1px 4px rgba(0,0,0,0.04)',
                }}>
                  {/* Badge vendable */}
                  {vendable && (
                    <div style={{
                      position: 'absolute', top: 12, right: 14,
                      background: 'var(--primary)', color: '#fff',
                      borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700,
                      letterSpacing: '0.04em',
                    }}>
                      VENDABLE
                    </div>
                  )}

                  {/* Nom + catégorie */}
                  <div style={{ marginBottom: 10, paddingRight: vendable ? 80 : 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.97rem', marginBottom: 2 }}>{ing.nom}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        background: 'var(--bg)', borderRadius: 6, padding: '2px 8px',
                        fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500,
                      }}>{ing.unite_nom}</span>
                      <span style={{
                        background: 'var(--bg)', borderRadius: 6, padding: '2px 8px',
                        fontSize: '0.75rem', color: 'var(--text-muted)',
                      }}>{ing.categorie}</span>
                    </div>
                  </div>

                  {/* Prix de vente si vendable */}
                  {vendable && (
                    <div style={{
                      background: 'var(--bg)', borderRadius: 8, padding: '6px 10px',
                      marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Prix de vente</span>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--primary)' }}>
                        {vendable.prix_vente.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DT
                      </span>
                    </div>
                  )}

                  {/* Toggle vendable */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {vendable ? 'Vendu au détail' : 'Activer la vente'}
                    </span>
                    <button
                      onClick={() => vendable ? handleToggleOff(ing.ingredient_id) : handleToggleOn(ing)}
                      style={{
                        width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                        background: vendable ? 'var(--primary)' : 'var(--border)',
                        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: 3, left: vendable ? 25 : 3,
                        width: 20, height: 20, borderRadius: '50%', background: '#fff',
                        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                      }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal prix */}
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
