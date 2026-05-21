import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../../api/client';
import type { Activite } from '../../types';

const apiMsg = (e: unknown, fallback = 'Erreur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const C = '#b45309';
const CD = '#78350f';

const LABEL: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 800, color: C,
  textTransform: 'uppercase', letterSpacing: '0.07em',
  display: 'block', marginBottom: 5,
};

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
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

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
    setOpenCats(new Set());
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
    } catch {}
    setLoading(false);
  }, [selectedActiviteId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggle = async (ing: MergedIngredient) => {
    if (!ing.actif && !portionEdits[ing.id]) {
      setToggleError(prev => ({ ...prev, [ing.id]: 'Saisir la portion avant d\'activer' }));
      return;
    }
    setToggling(ing.id);
    setToggleError(prev => { const n = { ...prev }; delete n[ing.id]; return n; });
    try {
      if (!ing.articleId) {
        await api.post('/api/articles-vendables', {
          activite_id: selectedActiviteId, article_type: 'ingredient', article_id: ing.id,
          prix_vente: 0, portion: parseFloat(portionEdits[ing.id]), actif: true,
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
          activite_id: selectedActiviteId, article_type: 'ingredient', article_id: ing.id,
          prix_vente: 0, portion: portionVal, actif: false,
        });
      } else {
        await api.put(`/api/articles-vendables/${ing.articleId}`, { portion: portionVal });
      }
      await loadData();
    } catch {}
    setSavingPortion(null);
  };

  const toggleCat = (cat: string) => {
    setOpenCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
  };

  const categories = [...new Set(ingredients.map(i => i.categorie))].sort();

  const filtered = ingredients.filter(i => {
    if (filterSearch && !i.nom.toLowerCase().includes(filterSearch.toLowerCase())) return false;
    if (filterCategorie && i.categorie !== filterCategorie) return false;
    if (filterActif === 'actif' && !i.actif) return false;
    if (filterActif === 'inactif' && i.actif) return false;
    return true;
  });

  const groups = categories.reduce<Record<string, MergedIngredient[]>>((acc, cat) => {
    const items = filtered.filter(i => i.categorie === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const activeCount = ingredients.filter(i => i.actif).length;
  const selectedActivite = activites.find(a => a.id === selectedActiviteId);

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #d97706 100%)`,
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(180,83,9,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🧾</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Catalogue Vente</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
            Activez les ingrédients pour la vente et définissez les portions
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {activeCount > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 12, padding: '8px 16px', color: '#fff', fontSize: '0.88rem', fontWeight: 600 }}>
              🛒 {activeCount} actif{activeCount !== 1 ? 's' : ''}
            </div>
          )}
          <Link to="/client/ventes/configuration"
            style={{
              background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', borderRadius: 20, padding: '5px 14px',
              fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none',
            }}>
            ⚙️ Configuration
          </Link>
        </div>
      </div>

      {/* Activité selector */}
      {activites.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: 4 }}>Activité :</span>
          {activites.map(a => (
            <button key={a.id}
              onClick={() => { setSelectedActiviteId(a.id); setSearchParams({ activiteId: String(a.id) }); }}
              style={{
                padding: '5px 14px', borderRadius: 20, fontSize: '0.83rem', cursor: 'pointer',
                border: selectedActiviteId === a.id ? `1.5px solid ${C}` : '1px solid var(--border)',
                background: selectedActiviteId === a.id ? C : 'var(--card-bg)',
                color: selectedActiviteId === a.id ? '#fff' : 'var(--text)',
                fontWeight: selectedActiviteId === a.id ? 700 : 400,
                transition: 'all 0.15s',
              }}>
              {a.nom}
            </button>
          ))}
        </div>
      )}

      {!selectedActiviteId ? (
        <p className="text-muted">Aucune activité disponible.</p>
      ) : loading ? (
        <p className="text-muted">Chargement…</p>
      ) : ingredients.length === 0 ? (
        <p className="text-muted">Aucun ingrédient sélectionné pour cette activité.</p>
      ) : (
        <>
          {/* Bandeau activité */}
          {selectedActivite && (
            <div style={{
              background: CD, borderRadius: 8, padding: '8px 16px',
              marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>—</span>
              <span style={{ color: '#fff', fontSize: '0.88rem', fontWeight: 700 }}>{selectedActivite.nom}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', marginLeft: 4 }}>
                {ingredients.length} ingrédient{ingredients.length !== 1 ? 's' : ''} · {activeCount} actif{activeCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Filtres */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18, background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)', padding: '12px 16px' }}>
            <div>
              <label style={LABEL}>Recherche</label>
              <input type="text" placeholder="Nom de l'ingrédient…" value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: '0.82rem', outline: 'none', width: 200 }} />
            </div>
            <div>
              <label style={LABEL}>Catégorie</label>
              <select value={filterCategorie} onChange={e => setFilterCategorie(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', background: 'var(--bg)', fontSize: '0.82rem', outline: 'none' }}>
                <option value="">Toutes</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>Statut</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['all', 'actif', 'inactif'] as const).map(v => (
                  <button key={v} onClick={() => setFilterActif(v)}
                    style={{
                      padding: '5px 11px', borderRadius: 6, fontSize: '0.78rem', cursor: 'pointer',
                      border: filterActif === v ? `1.5px solid ${C}` : '1.5px solid var(--border)',
                      background: filterActif === v ? C : 'var(--bg)',
                      color: filterActif === v ? '#fff' : 'var(--text)',
                      fontWeight: filterActif === v ? 700 : 400,
                    }}>
                    {v === 'all' ? 'Tous' : v === 'actif' ? '✓ Actifs' : '○ Inactifs'}
                  </button>
                ))}
              </div>
            </div>
            {(filterSearch || filterCategorie || filterActif !== 'all') && (
              <button onClick={() => { setFilterSearch(''); setFilterCategorie(''); setFilterActif('all'); }}
                style={{ padding: '5px 10px', borderRadius: 6, border: '1.5px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700, alignSelf: 'flex-end' }}>
                ✕
              </button>
            )}
          </div>

          {Object.keys(groups).length === 0 ? (
            <p className="text-muted" style={{ textAlign: 'center', padding: '40px 0' }}>Aucun résultat pour ces filtres.</p>
          ) : (
            <div>
              {Object.entries(groups).map(([cat, items]) => {
                const isOpen = openCats.has(cat);
                const catActifs = items.filter(i => i.actif).length;
                return (
                  <div key={cat} style={{ marginBottom: 8 }}>
                    {/* Category header */}
                    <button onClick={() => toggleCat(cat)}
                      style={{
                        border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', width: '100%', textAlign: 'left',
                        borderLeft: `4px solid ${C}`,
                        borderBottom: isOpen ? 'none' : '1px solid var(--border)',
                        marginBottom: 0, borderRadius: isOpen ? '4px 4px 0 0' : 4,
                        background: 'var(--card-bg)',
                      } as React.CSSProperties}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        🏷️ {cat}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                        ({items.length})
                      </span>
                      {catActifs > 0 && (
                        <span style={{ fontSize: '0.72rem', color: C, fontWeight: 600, background: `${C}18`, borderRadius: 10, padding: '1px 8px' }}>
                          🛒 {catActifs}
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {isOpen ? '▼' : '▶'}
                      </span>
                    </button>

                    {isOpen && (
                      <div style={{
                        border: `1px solid var(--border)`, borderTop: `1px solid ${C}30`,
                        borderRadius: '0 0 8px 8px', padding: 12,
                        background: 'var(--card-bg)',
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10,
                      }}>
                        {items.map(ing => {
                          const hasErr = !!toggleError[ing.id];
                          const isSaving = savingPortion === ing.id;
                          const isToggling = toggling === ing.id;
                          return (
                            <div key={ing.id} style={{
                              borderRadius: 10,
                              border: ing.actif ? `1.5px solid ${C}` : '1px solid var(--border)',
                              padding: '12px 14px',
                              background: ing.actif ? `${C}08` : 'var(--card-bg)',
                              position: 'relative',
                              transition: 'border-color 0.15s, background 0.15s',
                            }}>
                              {/* Active badge */}
                              {ing.actif && (
                                <span style={{
                                  position: 'absolute', top: 10, right: 10,
                                  background: C, color: '#fff',
                                  borderRadius: 20, padding: '1px 8px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em',
                                }}>ACTIF</span>
                              )}

                              {/* Name + unit */}
                              <div style={{ paddingRight: ing.actif ? 60 : 0, marginBottom: 10 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: 3 }}>{ing.nom}</div>
                                <span style={{ background: 'var(--border)', borderRadius: 5, padding: '1px 7px', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                                  {ing.unite}
                                </span>
                              </div>

                              {/* Portion input */}
                              <div style={{ marginBottom: 10 }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: 4, color: 'var(--text-muted)' }}>
                                  Portion ({ing.unite}) <span style={{ color: '#dc2626' }}>*</span>
                                  {isSaving && <span style={{ color: C, fontStyle: 'italic', marginLeft: 6 }}>…</span>}
                                </label>
                                <input
                                  type="number" min="0" step="0.001" placeholder="0.000"
                                  value={portionEdits[ing.id] ?? ''}
                                  onChange={e => {
                                    setPortionEdits(prev => ({ ...prev, [ing.id]: e.target.value }));
                                    if (toggleError[ing.id]) setToggleError(prev => { const n = { ...prev }; delete n[ing.id]; return n; });
                                  }}
                                  onBlur={() => handleSavePortion(ing)}
                                  style={{
                                    width: '100%', padding: '7px 10px', borderRadius: 7,
                                    border: `1px solid ${hasErr ? '#dc2626' : portionEdits[ing.id] ? C : 'var(--border)'}`,
                                    background: 'var(--bg)', fontSize: '0.9rem',
                                    outline: 'none', boxSizing: 'border-box',
                                    transition: 'border-color 0.15s',
                                  }}
                                />
                                {hasErr && (
                                  <div style={{ color: '#dc2626', fontSize: '0.72rem', marginTop: 3 }}>
                                    ⚠ {toggleError[ing.id]}
                                  </div>
                                )}
                              </div>

                              {/* Toggle row */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.78rem', color: ing.actif ? C : 'var(--text-muted)' }}>
                                  {ing.actif ? 'Vendu au détail' : 'Activer la vente'}
                                </span>
                                <button onClick={() => handleToggle(ing)} disabled={isToggling}
                                  style={{
                                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                                    background: ing.actif ? C : 'var(--border)',
                                    position: 'relative', transition: 'background 0.2s',
                                    opacity: isToggling ? 0.6 : 1, padding: 0,
                                  }}>
                                  <span style={{
                                    position: 'absolute', top: 3, left: ing.actif ? 21 : 3,
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
