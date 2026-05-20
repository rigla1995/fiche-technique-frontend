import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../../api/client';
import type { Activite } from '../../types';

const apiMsg = (e: unknown, fallback = 'Erreur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';

interface ArticleVendable {
  id: string;
  activite_id: number;
  article_type: 'produit' | 'ingredient';
  article_id: number;
  prix_vente: number;
  portion: number | null;
  actif: boolean;
  nom: string;
  unite_nom?: string | null;
}

interface IngredientSelected {
  id: number;
  nom: string;
  unite: string;
  categorie: string;
  categorieId: number | null;
}

interface MergedIngredient extends IngredientSelected {
  articleId: string | null;
  actif: boolean;
  portion: number | null;
}

export default function CatalogueVentePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const [ingredients, setIngredients] = useState<MergedIngredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [savingPortion, setSavingPortion] = useState<number | null>(null);
  const [toggleError, setToggleError] = useState<Record<number, string>>({});
  const [portionEdits, setPortionEdits] = useState<Record<number, string>>({});

  const [filterSearch, setFilterSearch] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterActif, setFilterActif] = useState<'all' | 'actif' | 'inactif'>('all');
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => {
      const acts = data as Activite[];
      setActivites(acts);
      const paramId = searchParams.get('activiteId');
      const found = acts.find(a => String(a.id) === paramId);
      setSelectedActiviteId(found ? found.id : acts[0]?.id ?? null);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = useCallback(async () => {
    if (!selectedActiviteId) return;
    setLoading(true);
    try {
      const [selRes, artRes] = await Promise.all([
        api.get(`/api/entreprise/activites/${selectedActiviteId}/selected-ingredients`),
        api.get(`/api/articles-vendables?activiteId=${selectedActiviteId}`),
      ]);
      const selected = selRes.data as IngredientSelected[];
      const articles = (artRes.data as ArticleVendable[]).filter(a => a.article_type === 'ingredient');
      const artMap = new Map(articles.map(a => [a.article_id, a]));

      const merged: MergedIngredient[] = selected.map(ing => {
        const art = artMap.get(ing.id);
        return { ...ing, articleId: art?.id ?? null, actif: art?.actif ?? false, portion: art?.portion ?? null };
      });
      setIngredients(merged);

      setPortionEdits(prev => {
        const next: Record<number, string> = {};
        merged.forEach(m => { next[m.id] = prev[m.id] !== undefined ? prev[m.id] : (m.portion != null ? String(m.portion) : ''); });
        return next;
      });

      setCollapsedCats(prev => {
        const cats = [...new Set(merged.map(m => m.categorie))];
        const next: Record<string, boolean> = {};
        cats.forEach(c => { next[c] = prev[c] !== undefined ? prev[c] : true; });
        return next;
      });
    } catch {}
    setLoading(false);
  }, [selectedActiviteId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = async (ing: MergedIngredient) => {
    // Portion is required to activate
    if (!ing.actif && !portionEdits[ing.id]) {
      setToggleError(prev => ({ ...prev, [ing.id]: 'Saisir la portion avant d\'activer' }));
      return;
    }
    setToggling(ing.id);
    setToggleError(prev => { const n = { ...prev }; delete n[ing.id]; return n; });
    try {
      if (!ing.articleId) {
        await api.post('/api/articles-vendables', {
          activite_id: selectedActiviteId,
          article_type: 'ingredient',
          article_id: ing.id,
          prix_vente: 0,
          portion: parseFloat(portionEdits[ing.id]),
          actif: true,
        });
      } else {
        await api.put(`/api/articles-vendables/${ing.articleId}`, { actif: !ing.actif });
      }
      await loadData();
    } catch (e: unknown) {
      setToggleError(prev => ({ ...prev, [ing.id]: apiMsg(e) }));
    }
    setToggling(null);
  };

  const handleSavePortion = async (ing: MergedIngredient) => {
    const portionVal = portionEdits[ing.id] ? parseFloat(portionEdits[ing.id]) : null;
    if (portionVal === ing.portion) return;
    setSavingPortion(ing.id);
    try {
      if (!ing.articleId) {
        await api.post('/api/articles-vendables', {
          activite_id: selectedActiviteId,
          article_type: 'ingredient',
          article_id: ing.id,
          prix_vente: 0,
          portion: portionVal,
          actif: false,
        });
      } else {
        await api.put(`/api/articles-vendables/${ing.articleId}`, { portion: portionVal });
      }
      await loadData();
    } catch {}
    setSavingPortion(null);
  };

  const categories = [...new Set(ingredients.map(i => i.categorie))].sort();

  const filtered = ingredients.filter(i => {
    if (filterSearch && !i.nom.toLowerCase().includes(filterSearch.toLowerCase())) return false;
    if (filterCategorie && i.categorie !== filterCategorie) return false;
    if (filterActif === 'actif' && !i.actif) return false;
    if (filterActif === 'inactif' && i.actif) return false;
    return true;
  });

  const grouped = categories.reduce<Record<string, MergedIngredient[]>>((acc, cat) => {
    const items = filtered.filter(i => i.categorie === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const toggleCat = (cat: string) => setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  const activeCount = ingredients.filter(i => i.actif).length;

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #d97706 100%)`,
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(180,83,9,0.28)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🧾</div>
            <div>
              <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Catalogue Vente</h1>
              <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
                {activeCount > 0
                  ? `${activeCount} ingrédient${activeCount !== 1 ? 's' : ''} actif${activeCount !== 1 ? 's' : ''}`
                  : 'Activez les ingrédients et définissez les portions'}
              </p>
            </div>
          </div>
          <Link to="/client/ventes/configuration"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.4)',
              color: '#fff', borderRadius: 10, padding: '8px 16px',
              fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none',
            }}>
            ⚙️ Configuration Vente
          </Link>
        </div>
      </div>

      {/* Activité selector */}
      <div style={{ background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)', padding: '10px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Activité
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {activites.length === 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Aucune activité disponible</span>
          )}
          {activites.map(a => (
            <button key={a.id}
              onClick={() => { setSelectedActiviteId(a.id); setSearchParams({ activiteId: String(a.id) }); }}
              style={{
                padding: '5px 16px', borderRadius: 20, cursor: 'pointer', fontSize: '0.85rem',
                border: selectedActiviteId === a.id ? `2px solid ${C}` : '1.5px solid var(--border)',
                background: selectedActiviteId === a.id ? C : 'var(--bg)',
                color: selectedActiviteId === a.id ? '#fff' : 'var(--text)',
                fontWeight: selectedActiviteId === a.id ? 700 : 400,
                transition: 'all 0.15s',
              }}>
              {a.nom}
            </button>
          ))}
        </div>
      </div>

      {!selectedActiviteId ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>Aucune activité disponible</div>
      ) : (
        <>
          {/* Filters */}
          <div style={{
            background: 'var(--card-bg)', borderRadius: 12, border: `1.5px solid ${CB}`,
            padding: '14px 18px', marginBottom: 20,
            display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 200px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: CD, whiteSpace: 'nowrap' }}>Recherche</span>
              <input
                type="text"
                placeholder="Nom de l'ingrédient…"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 8,
                  border: `1.5px solid ${CB}`, background: CL,
                  fontSize: '0.85rem', outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 1 200px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: CD, whiteSpace: 'nowrap' }}>Catégorie</span>
              <select value={filterCategorie} onChange={e => setFilterCategorie(e.target.value)}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 8,
                  border: `1.5px solid ${CB}`, background: CL,
                  fontSize: '0.85rem', outline: 'none',
                }}>
                <option value="">Toutes</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {(['all', 'actif', 'inactif'] as const).map(v => (
                <button key={v} onClick={() => setFilterActif(v)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: '0.78rem', cursor: 'pointer',
                    border: filterActif === v ? `2px solid ${C}` : `1.5px solid ${CB}`,
                    background: filterActif === v ? C : 'var(--bg)',
                    color: filterActif === v ? '#fff' : CD,
                    fontWeight: filterActif === v ? 700 : 500,
                  }}>
                  {v === 'all' ? 'Tous' : v === 'actif' ? '✓ Actifs' : '○ Inactifs'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🧾</div>
              {ingredients.length === 0
                ? 'Aucun ingrédient sélectionné pour cette activité'
                : 'Aucun résultat pour ces filtres'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat} style={{ background: 'var(--card-bg)', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden' }}>
                  {/* Category header */}
                  <button onClick={() => toggleCat(cat)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '13px 18px', background: CL, border: 'none', cursor: 'pointer',
                      borderBottom: collapsedCats[cat] ? 'none' : `1.5px solid ${CB}`,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1rem', fontWeight: 800, color: CD }}>{cat}</span>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700,
                        background: C, color: '#fff', borderRadius: 20, padding: '2px 9px',
                      }}>{items.length}</span>
                      <span style={{ fontSize: '0.75rem', color: C, fontWeight: 600 }}>
                        {items.filter(i => i.actif).length} actif{items.filter(i => i.actif).length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span style={{ color: C, fontSize: '0.85rem', fontWeight: 700 }}>
                      {collapsedCats[cat] ? '▼' : '▲'}
                    </span>
                  </button>

                  {!collapsedCats[cat] && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                      gap: 12, padding: 14,
                    }}>
                      {items.map(ing => {
                        const hasErr = !!toggleError[ing.id];
                        return (
                          <div key={ing.id} style={{
                            borderRadius: 12,
                            border: `1.5px solid ${ing.actif ? C : 'var(--border)'}`,
                            background: ing.actif ? CL : 'var(--bg)',
                            padding: '14px 16px',
                            display: 'flex', flexDirection: 'column', gap: 10,
                            transition: 'border-color 0.15s, background 0.15s',
                            boxShadow: ing.actif ? `0 2px 10px rgba(180,83,9,0.1)` : 'none',
                          }}>
                            {/* Top row: name + toggle */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: ing.actif ? CD : 'var(--text)', lineHeight: 1.3 }}>
                                  {ing.nom}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                  {ing.unite}
                                </div>
                              </div>
                              {/* Toggle switch */}
                              <button
                                onClick={() => handleToggle(ing)}
                                disabled={toggling === ing.id}
                                title={ing.actif ? 'Désactiver' : 'Activer pour la vente'}
                                style={{
                                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                                  background: ing.actif ? C : '#d1d5db',
                                  position: 'relative', transition: 'background 0.2s',
                                  opacity: toggling === ing.id ? 0.6 : 1, flexShrink: 0, padding: 0,
                                }}>
                                <span style={{
                                  position: 'absolute', top: 2,
                                  left: ing.actif ? 22 : 2,
                                  width: 20, height: 20, borderRadius: '50%',
                                  background: '#fff', transition: 'left 0.2s',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)', display: 'block',
                                }} />
                              </button>
                            </div>

                            {/* Status badge */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{
                                padding: '2px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700,
                                background: ing.actif ? '#dcfce7' : '#f3f4f6',
                                color: ing.actif ? '#166534' : '#6b7280',
                              }}>
                                {ing.actif ? '✓ Actif' : 'Inactif'}
                              </span>
                              {savingPortion === ing.id && (
                                <span style={{ fontSize: '0.72rem', color: C, fontStyle: 'italic' }}>Sauvegarde…</span>
                              )}
                            </div>

                            {/* Portion input */}
                            <div>
                              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: CD, display: 'block', marginBottom: 4 }}>
                                Portion{' '}
                                <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({ing.unite})</span>
                                <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>
                              </label>
                              <input
                                type="number" min="0" step="0.001"
                                placeholder="ex: 0.250"
                                value={portionEdits[ing.id] ?? ''}
                                onChange={e => {
                                  setPortionEdits(prev => ({ ...prev, [ing.id]: e.target.value }));
                                  if (toggleError[ing.id]) setToggleError(prev => { const n = { ...prev }; delete n[ing.id]; return n; });
                                }}
                                onBlur={() => handleSavePortion(ing)}
                                style={{
                                  width: '100%', padding: '7px 10px', borderRadius: 8,
                                  border: `1.5px solid ${hasErr ? '#dc2626' : CB}`,
                                  background: hasErr ? '#fef2f2' : '#fff',
                                  fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
                                }}
                              />
                              {hasErr && (
                                <div style={{ color: '#dc2626', fontSize: '0.72rem', marginTop: 3 }}>
                                  {toggleError[ing.id]}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
