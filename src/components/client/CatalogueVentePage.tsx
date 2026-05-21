import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import type { Activite, ActiviteIngredient } from '../../types';

const apiMsg = (e: unknown, fallback = 'Erreur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const fmtMoney = (n: number | null | undefined) => {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DT';
};

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';

interface ArticleVendable {
  id: string;
  article_type: 'ingredient';
  article_id: number;
  prix_vente: number;
  portion: number | null;
  actif: boolean;
  nom: string;
  unite_nom: string | null;
}

interface IngredientRow extends ActiviteIngredient {
  vendable?: ArticleVendable;
  saving?: boolean;
  error?: string;
}

export default function CatalogueVentePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Record<number, { portion: string; prix: string }>>({});

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => {
      const acts = (data as Activite[]).filter(a => !a.laboId);
      setActivites(acts);
      const paramId = searchParams.get('activiteId');
      const found = acts.find(a => String(a.id) === paramId);
      setSelectedActiviteId(found ? found.id : acts[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const loadData = useCallback(() => {
    if (!selectedActiviteId) return;
    setLoading(true);
    Promise.all([
      api.get(`/api/entreprise/activites/${selectedActiviteId}/ingredients`),
      api.get(`/api/articles-vendables?activiteId=${selectedActiviteId}`),
    ]).then(([ingRes, avRes]) => {
      const ings = ingRes.data as ActiviteIngredient[];
      const avs = (avRes.data as ArticleVendable[]).filter(a => a.article_type === 'ingredient');
      const avMap = new Map(avs.map(av => [av.article_id, av]));
      setIngredients(ings.map(i => ({ ...i, vendable: avMap.get(i.id) })));
      // Open all categories by default
      const cats = new Set(ings.map(i => i.categorie || 'Sans catégorie'));
      setOpenCats(cats);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedActiviteId]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleVendable = async (ing: IngredientRow) => {
    setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, saving: true, error: undefined } : i));
    try {
      if (ing.vendable) {
        await api.put(`/api/articles-vendables/${ing.vendable.id}`, { actif: !ing.vendable.actif });
      } else {
        await api.post('/api/articles-vendables', {
          activite_id: selectedActiviteId,
          article_type: 'ingredient',
          article_id: ing.id,
          prix_vente: 0,
          portion: null,
          actif: true,
        });
      }
      loadData();
    } catch (e: unknown) {
      setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, saving: false, error: apiMsg(e) } : i));
    }
  };

  const saveField = async (ing: IngredientRow, field: 'portion' | 'prix') => {
    if (!ing.vendable) return;
    const val = editing[ing.id]?.[field === 'portion' ? 'portion' : 'prix'];
    if (val == null) return;
    setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, saving: true, error: undefined } : i));
    try {
      const body = field === 'portion'
        ? { portion: parseFloat(val) || null }
        : { prix_vente: parseFloat(val) || 0 };
      await api.put(`/api/articles-vendables/${ing.vendable!.id}`, body);
      setEditing(prev => {
        const next = { ...prev };
        if (next[ing.id]) delete next[ing.id][field === 'portion' ? 'portion' : 'prix'];
        return next;
      });
      loadData();
    } catch (e: unknown) {
      setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, saving: false, error: apiMsg(e) } : i));
    }
  };

  const cats = [...new Set(ingredients.map(i => i.categorie || 'Sans catégorie'))].sort();
  const selectedActivite = activites.find(a => a.id === selectedActiviteId);
  const totalVendables = ingredients.filter(i => i.vendable?.actif).length;

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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🛒</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              Catalogue Vente{selectedActivite ? ` — ${selectedActivite.nom}` : ''}
            </h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
            Sélectionnez les ingrédients vendables et définissez leur portion et prix
          </p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>{totalVendables}</div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>ingrédients actifs</div>
        </div>
      </div>

      {/* Activité selector */}
      {activites.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16, padding: '10px 14px', background: '#fff', borderRadius: 10, border: `1px solid ${CB}` }}>
          {activites.map(a => (
            <button key={a.id} onClick={() => { setSelectedActiviteId(a.id); setSearchParams({ activiteId: String(a.id) }); }}
              style={{
                padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                border: selectedActiviteId === a.id ? `1.5px solid ${C}` : `1.5px solid ${CB}`,
                background: selectedActiviteId === a.id ? C : CL,
                color: selectedActiviteId === a.id ? '#fff' : CD,
                fontWeight: selectedActiviteId === a.id ? 700 : 400,
              }}>
              {a.nom}
            </button>
          ))}
        </div>
      )}

      {!selectedActiviteId ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>Aucune activité disponible</div>
      ) : loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Chargement…</div>
      ) : ingredients.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🥗</div>
          Aucun ingrédient disponible pour cette activité
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cats.map(cat => {
            const catIngs = ingredients.filter(i => (i.categorie || 'Sans catégorie') === cat);
            const isOpen = openCats.has(cat);
            const activeCount = catIngs.filter(i => i.vendable?.actif).length;
            return (
              <div key={cat} style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(180,83,9,0.06)' }}>
                {/* Category header */}
                <button onClick={() => setOpenCats(prev => {
                  const next = new Set(prev);
                  if (next.has(cat)) next.delete(cat); else next.add(cat);
                  return next;
                })}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: `linear-gradient(135deg, ${CD}12 0%, ${C}08 100%)`, border: 'none', cursor: 'pointer', borderBottom: isOpen ? `1.5px solid ${CB}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ background: C + '22', borderRadius: 8, padding: '5px 8px', fontSize: '0.9rem' }}>🏷️</div>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: CD }}>{cat}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>({catIngs.length} ingrédient{catIngs.length !== 1 ? 's' : ''})</span>
                    {activeCount > 0 && (
                      <span style={{ background: C, color: '#fff', borderRadius: 12, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}>{activeCount} actif{activeCount !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div>
                    {/* Table header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 120px 120px', gap: 0, padding: '8px 20px', background: CL, borderBottom: `1px solid ${CB}` }}>
                      {['Ingrédient', 'Unité', 'Portion', 'Prix vente'].map(h => (
                        <div key={h} style={{ fontSize: '0.72rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                      ))}
                    </div>

                    {catIngs.map((ing, idx) => {
                      const isActive = ing.vendable?.actif === true;
                      const editState = editing[ing.id];
                      const portionVal = editState?.portion ?? (ing.vendable?.portion != null ? String(ing.vendable.portion) : '');
                      const prixVal = editState?.prix ?? (ing.vendable ? String(ing.vendable.prix_vente) : '');
                      const portionDirty = editState?.portion != null;
                      const prixDirty = editState?.prix != null;

                      return (
                        <div key={ing.id} style={{
                          display: 'grid', gridTemplateColumns: '1fr 80px 120px 120px',
                          gap: 0, padding: '12px 20px', alignItems: 'center',
                          background: idx % 2 === 0 ? '#fff' : '#fffdf7',
                          borderBottom: `1px solid ${CB}`,
                          opacity: ing.vendable && !isActive ? 0.5 : 1,
                        }}>
                          {/* Name + toggle */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input type="checkbox" checked={isActive || false}
                              disabled={ing.saving}
                              onChange={() => toggleVendable(ing)}
                              style={{ accentColor: C, width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />
                            <span style={{ fontSize: '0.88rem', fontWeight: isActive ? 700 : 400, color: isActive ? CD : 'var(--text)' }}>
                              {ing.nom}
                            </span>
                            {ing.saving && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>…</span>}
                            {ing.error && <span style={{ fontSize: '0.7rem', color: '#dc2626' }}>{ing.error}</span>}
                          </div>

                          {/* Unit */}
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                            {ing.unite}
                          </div>

                          {/* Portion */}
                          <div>
                            {isActive ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input type="number" min="0" step="0.001"
                                  value={portionVal}
                                  placeholder="—"
                                  onChange={e => setEditing(prev => ({
                                    ...prev,
                                    [ing.id]: { portion: e.target.value, prix: prev[ing.id]?.prix ?? prixVal },
                                  }))}
                                  style={{ width: 68, padding: '5px 6px', borderRadius: 7, border: `1.5px solid ${portionDirty ? C : CB}`, background: portionDirty ? CL : '#fafafa', fontSize: '0.82rem', textAlign: 'right', outline: 'none' }} />
                                {portionDirty && (
                                  <button onClick={() => saveField(ing, 'portion')} disabled={ing.saving}
                                    style={{ padding: '4px 7px', borderRadius: 5, border: 'none', background: C, color: '#fff', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}>✓</button>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>—</span>
                            )}
                          </div>

                          {/* Prix vente */}
                          <div>
                            {isActive ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <div style={{ position: 'relative' }}>
                                  <input type="number" min="0" step="0.01"
                                    value={prixVal}
                                    placeholder="0.00"
                                    onChange={e => setEditing(prev => ({
                                      ...prev,
                                      [ing.id]: { portion: prev[ing.id]?.portion ?? portionVal, prix: e.target.value },
                                    }))}
                                    style={{ width: 78, padding: '5px 26px 5px 6px', borderRadius: 7, border: `1.5px solid ${prixDirty ? C : CB}`, background: prixDirty ? CL : '#fafafa', fontSize: '0.82rem', fontWeight: 700, color: CD, outline: 'none' }} />
                                  <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', color: C, pointerEvents: 'none', fontWeight: 700 }}>DT</span>
                                </div>
                                {prixDirty && (
                                  <button onClick={() => saveField(ing, 'prix')} disabled={ing.saving}
                                    style={{ padding: '4px 7px', borderRadius: 5, border: 'none', background: C, color: '#fff', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}>✓</button>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>—</span>
                            )}
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
    </div>
  );
}
