import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
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

interface ActivitePrestataire {
  id: string;
  taux_commission: number;
  prestataire_nom: string;
  actif: boolean;
}

interface ArticleVendable {
  id: string;
  nom: string;
  article_type: 'produit' | 'ingredient';
  article_id: number;
  prix_vente: number;
  portion: number | null;
  actif: boolean;
  unite_nom?: string | null;
}

interface ArticlePrixPrestataire {
  article_vendable_id: string;
  activite_prestataire_id: string;
  prix_vente: number | null;
}

interface IngredientRow extends ActiviteIngredient {
  vendable?: ArticleVendable;
  saving?: boolean;
  error?: string;
}

type Tab = 'produits' | 'supplements';

export default function ConfigurationVentePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('produits');

  // Prestataires (read-only here, managed in Config Prestataires)
  const [prestataires, setPrestataires] = useState<ActivitePrestataire[]>([]);

  // Produits vendables (fiches techniques)
  const [produits, setProduits] = useState<ArticleVendable[]>([]);
  const [editingPrixVente, setEditingPrixVente] = useState<Record<string, string>>({});
  const [editingPrixPrest, setEditingPrixPrest] = useState<Record<string, string>>({});
  const [prixPrestataires, setPrixPrestataires] = useState<ArticlePrixPrestataire[]>([]);

  // Suppléments (ingrédients du catalogue)
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [editingSuppl, setEditingSuppl] = useState<Record<number, { portion?: string; prix?: string }>>({});

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => {
      const acts = data as Activite[];
      setActivites(acts);
      const paramId = searchParams.get('activiteId');
      const found = acts.find(a => String(a.id) === paramId);
      setSelectedActiviteId(found ? found.id : acts[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const loadAll = useCallback(() => {
    if (!selectedActiviteId) return;
    Promise.all([
      api.get(`/api/activite-prestataires?activiteId=${selectedActiviteId}`),
      api.get(`/api/articles-vendables?activiteId=${selectedActiviteId}`),
      api.get(`/api/article-prix-prestataire?activiteId=${selectedActiviteId}`),
      api.get(`/api/entreprise/activites/${selectedActiviteId}/ingredients`),
    ]).then(([ap, av, pp, ing]) => {
      const apData = ap.data as ActivitePrestataire[];
      setPrestataires(apData);
      const avData = av.data as ArticleVendable[];
      setProduits(avData.filter(a => a.article_type === 'produit'));
      setPrixPrestataires(pp.data as ArticlePrixPrestataire[]);

      const ingData = ing.data as ActiviteIngredient[];
      const avIngMap = new Map(avData.filter(a => a.article_type === 'ingredient').map(a => [a.article_id, a]));
      setIngredients(ingData.map(i => ({ ...i, vendable: avIngMap.get(i.id) })));
    }).catch(() => {});
  }, [selectedActiviteId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const activePrests = prestataires.filter(p => p.actif);

  // ── Produits handlers ──────────────────────────────────────────────────────

  const handleSavePrixVente = async (articleId: string) => {
    const val = editingPrixVente[articleId];
    if (val == null) return;
    setSaving(true);
    try {
      await api.put(`/api/articles-vendables/${articleId}`, { prix_vente: parseFloat(val) || 0 });
      setEditingPrixVente(prev => { const n = { ...prev }; delete n[articleId]; return n; });
      loadAll();
    } catch {} finally { setSaving(false); }
  };

  const getPrixKey = (articleId: string, apId: string) => `${articleId}__${apId}`;

  const handleSavePrixPrest = async (articleId: string, apId: string) => {
    const key = getPrixKey(articleId, apId);
    const val = editingPrixPrest[key];
    if (!val) return;
    setSaving(true);
    try {
      await api.post('/api/article-prix-prestataire', {
        article_vendable_id: articleId,
        activite_prestataire_id: apId,
        prix_vente: parseFloat(val),
      });
      setEditingPrixPrest(prev => { const n = { ...prev }; delete n[key]; return n; });
      loadAll();
    } catch {} finally { setSaving(false); }
  };

  // ── Suppléments handlers ───────────────────────────────────────────────────

  const toggleSupplVendable = async (ing: IngredientRow) => {
    setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, saving: true, error: undefined } : i));
    try {
      if (ing.vendable) {
        await api.put(`/api/articles-vendables/${ing.vendable.id}`, { actif: !ing.vendable.actif });
      } else {
        await api.post('/api/articles-vendables', {
          activite_id: selectedActiviteId, article_type: 'ingredient',
          article_id: ing.id, prix_vente: 0, portion: null, actif: true,
        });
      }
      loadAll();
    } catch (e: unknown) {
      setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, saving: false, error: apiMsg(e) } : i));
    }
  };

  const saveSupplField = async (ing: IngredientRow, field: 'portion' | 'prix') => {
    if (!ing.vendable) return;
    const editState = editingSuppl[ing.id];
    const val = field === 'portion' ? editState?.portion : editState?.prix;
    if (val == null) return;
    setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, saving: true, error: undefined } : i));
    try {
      const body = field === 'portion'
        ? { portion: parseFloat(val) || null }
        : { prix_vente: parseFloat(val) || 0 };
      await api.put(`/api/articles-vendables/${ing.vendable!.id}`, body);
      setEditingSuppl(prev => {
        const next = { ...prev };
        if (next[ing.id]) { const e = { ...next[ing.id] }; if (field === 'portion') delete e.portion; else delete e.prix; next[ing.id] = e; }
        return next;
      });
      loadAll();
    } catch (e: unknown) {
      setIngredients(prev => prev.map(i => i.id === ing.id ? { ...i, saving: false, error: apiMsg(e) } : i));
    }
  };

  const cats = [...new Set(ingredients.map(i => i.categorie || 'Sans catégorie'))].sort();
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  useEffect(() => {
    const allCats = new Set(ingredients.map(i => i.categorie || 'Sans catégorie'));
    setOpenCats(allCats);
  }, [ingredients.length]);

  const TabBtn = ({ tab, label }: { tab: Tab; label: string }) => (
    <button onClick={() => setActiveTab(tab)}
      style={{
        padding: '10px 22px', background: activeTab === tab ? C : '#fff',
        color: activeTab === tab ? '#fff' : CD,
        border: activeTab === tab ? `1.5px solid ${C}` : `1.5px solid ${CB}`,
        borderRadius: 10, cursor: 'pointer', fontWeight: activeTab === tab ? 700 : 500, fontSize: '0.9rem',
        boxShadow: activeTab === tab ? `0 2px 10px ${C}44` : 'none',
        transition: 'all 0.15s',
      }}>
      {label}
    </button>
  );

  const PrixVenteInput = ({ av }: { av: ArticleVendable }) => {
    const isDirty = av.id in editingPrixVente;
    const val = isDirty ? editingPrixVente[av.id] : String(av.prix_vente);
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <input type="number" min="0" step="0.01" value={val}
            onChange={e => setEditingPrixVente(prev => ({ ...prev, [av.id]: e.target.value }))}
            style={{ width: 95, padding: '7px 30px 7px 8px', borderRadius: 8, border: `1.5px solid ${isDirty ? C : CB}`, background: isDirty ? CL : '#fafafa', fontSize: '0.88rem', fontWeight: 700, color: CD, outline: 'none' }} />
          <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', color: C, pointerEvents: 'none', fontWeight: 700 }}>DT</span>
        </div>
        {isDirty && (
          <button onClick={() => handleSavePrixVente(av.id)} disabled={saving}
            style={{ padding: '5px 8px', borderRadius: 6, border: 'none', background: C, color: '#fff', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>✓</button>
        )}
      </div>
    );
  };

  const PrestInput = ({ av, ap }: { av: ArticleVendable; ap: ActivitePrestataire }) => {
    const key = getPrixKey(av.id, ap.id);
    const existing = prixPrestataires.find(p => p.article_vendable_id === av.id && p.activite_prestataire_id === ap.id);
    const autoCalc = av.prix_vente * (1 - ap.taux_commission / 100);
    const isDirty = key in editingPrixPrest;
    const currentVal = isDirty ? editingPrixPrest[key] : (existing?.prix_vente != null ? String(existing.prix_vente) : '');
    return (
      <div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <input type="number" min="0" step="0.01" value={currentVal} placeholder={autoCalc.toFixed(2)}
              onChange={e => setEditingPrixPrest(prev => ({ ...prev, [key]: e.target.value }))}
              style={{ width: 95, padding: '7px 30px 7px 8px', borderRadius: 8, border: `1.5px solid ${isDirty ? C : CB}`, background: isDirty ? CL : '#fafafa', fontSize: '0.88rem', fontWeight: 700, color: CD, outline: 'none' }} />
            <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', color: C, pointerEvents: 'none', fontWeight: 700 }}>DT</span>
          </div>
          {isDirty && (
            <button onClick={() => handleSavePrixPrest(av.id, ap.id)} disabled={saving}
              style={{ padding: '5px 8px', borderRadius: 6, border: 'none', background: C, color: '#fff', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>✓</button>
          )}
        </div>
        {!isDirty && (
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>auto : {fmtMoney(autoCalc)}</div>
        )}
      </div>
    );
  };

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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>💲</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Configuration Vente</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
            Prix de vente directs et par prestataire — produits et suppléments
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/client/ventes/prestataires" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 20, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>
            🛵 Prestataires
          </Link>
          <Link to="/client/ventes/charges" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 20, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>
            🏗️ Charges
          </Link>
        </div>
      </div>

      {/* Activité selector */}
      {activites.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 20, padding: '10px 14px', background: '#fff', borderRadius: 10, border: `1px solid ${CB}` }}>
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
      ) : (
        <>
          {activePrests.length === 0 && (
            <div style={{ background: '#fef9c3', border: `1px solid ${CB}`, borderRadius: 10, padding: '10px 16px', fontSize: '0.83rem', color: '#854d0e', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
              💡 Aucun prestataire actif — les colonnes prestataire n'apparaîtront pas.
              <Link to="/client/ventes/prestataires" style={{ color: C, fontWeight: 700, marginLeft: 4 }}>Configurer les prestataires →</Link>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
            <TabBtn tab="produits" label="🛍️ Vente Produits" />
            <TabBtn tab="supplements" label="🧂 Ventes Suppléments" />
          </div>

          {/* ── Vente Produits ── */}
          {activeTab === 'produits' && (
            <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(180,83,9,0.08)' }}>
              <div style={{ background: `linear-gradient(135deg, ${CD}18 0%, ${C}12 100%)`, borderBottom: `1.5px solid ${CB}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: C + '22', borderRadius: 8, padding: '6px 8px', fontSize: '1rem' }}>🛍️</div>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: CD }}>Produits vendables</div>
                  <div style={{ fontSize: '0.72rem', color: C }}>Fiches techniques — prix direct + prix par prestataire</div>
                </div>
              </div>
              <div style={{ padding: 0 }}>
                {produits.filter(p => p.actif).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🛍️</div>
                    Aucun produit vendable actif pour cette activité
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                      <thead>
                        <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
                          <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Produit</th>
                          <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>🏪 Vente directe</th>
                          {activePrests.map(ap => (
                            <th key={ap.id} style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                              🛵 {ap.prestataire_nom}
                              <div style={{ fontSize: '0.68rem', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'none' }}>−{ap.taux_commission}%</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {produits.filter(p => p.actif).map((av, idx) => (
                          <tr key={av.id} style={{ borderBottom: `1px solid ${CB}`, background: idx % 2 === 0 ? '#fff' : '#fffdf7' }}>
                            <td style={{ padding: '13px 16px' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: CD }}>{av.nom}</div>
                              {av.unite_nom && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{av.unite_nom}</div>}
                            </td>
                            <td style={{ padding: '10px 16px', textAlign: 'center' }}><PrixVenteInput av={av} /></td>
                            {activePrests.map(ap => (
                              <td key={ap.id} style={{ padding: '10px 16px', textAlign: 'center' }}><PrestInput av={av} ap={ap} /></td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Ventes Suppléments ── */}
          {activeTab === 'supplements' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ingredients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🧂</div>
                  Aucun ingrédient disponible pour cette activité
                </div>
              ) : cats.map(cat => {
                const catIngs = ingredients.filter(i => (i.categorie || 'Sans catégorie') === cat);
                const isOpen = openCats.has(cat);
                const activeCount = catIngs.filter(i => i.vendable?.actif).length;
                return (
                  <div key={cat} style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(180,83,9,0.06)' }}>
                    <button onClick={() => setOpenCats(prev => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; })}
                      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: `linear-gradient(135deg, ${CD}10 0%, ${C}06 100%)`, border: 'none', cursor: 'pointer', borderBottom: isOpen ? `1.5px solid ${CB}` : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ background: C + '22', borderRadius: 7, padding: '4px 7px', fontSize: '0.9rem' }}>🏷️</div>
                        <span style={{ fontWeight: 800, fontSize: '0.95rem', color: CD }}>{cat}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({catIngs.length})</span>
                        {activeCount > 0 && <span style={{ background: C, color: '#fff', borderRadius: 12, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}>{activeCount} actif{activeCount !== 1 ? 's' : ''}</span>}
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
                    </button>

                    {isOpen && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                          <thead>
                            <tr style={{ background: CL, borderBottom: `1px solid ${CB}` }}>
                              <th style={{ padding: '9px 16px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingrédient</th>
                              <th style={{ padding: '9px 16px', textAlign: 'center', fontSize: '0.72rem', fontWeight: 800, color: C, textTransform: 'uppercase' }}>Vendable</th>
                              <th style={{ padding: '9px 16px', textAlign: 'center', fontSize: '0.72rem', fontWeight: 800, color: C, textTransform: 'uppercase' }}>Portion</th>
                              <th style={{ padding: '9px 16px', textAlign: 'center', fontSize: '0.72rem', fontWeight: 800, color: C, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>🏪 Vente directe</th>
                              {activePrests.map(ap => (
                                <th key={ap.id} style={{ padding: '9px 16px', textAlign: 'center', fontSize: '0.72rem', fontWeight: 800, color: C, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                                  🛵 {ap.prestataire_nom}
                                  <div style={{ fontSize: '0.62rem', fontWeight: 500, textTransform: 'none' }}>−{ap.taux_commission}%</div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {catIngs.map((ing, idx) => {
                              const isActive = ing.vendable?.actif === true;
                              const editState = editingSuppl[ing.id];
                              const portionVal = editState?.portion ?? (ing.vendable?.portion != null ? String(ing.vendable.portion) : '');
                              const prixVal = editState?.prix ?? (ing.vendable ? String(ing.vendable.prix_vente) : '');
                              const portionDirty = editState?.portion != null;
                              const prixDirty = editState?.prix != null;

                              return (
                                <tr key={ing.id} style={{ borderBottom: `1px solid ${CB}`, background: idx % 2 === 0 ? '#fff' : '#fffdf7', opacity: ing.vendable && !isActive ? 0.55 : 1 }}>
                                  <td style={{ padding: '11px 16px' }}>
                                    <div style={{ fontWeight: isActive ? 700 : 400, fontSize: '0.88rem', color: isActive ? CD : 'var(--text)' }}>{ing.nom}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ing.unite}</div>
                                    {ing.error && <div style={{ fontSize: '0.7rem', color: '#dc2626' }}>{ing.error}</div>}
                                  </td>
                                  <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                                    <input type="checkbox" checked={isActive} disabled={ing.saving} onChange={() => toggleSupplVendable(ing)}
                                      style={{ accentColor: C, width: 17, height: 17, cursor: 'pointer' }} />
                                  </td>
                                  <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                                    {isActive ? (
                                      <div style={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
                                        <input type="number" min="0" step="0.001" value={portionVal} placeholder="—"
                                          onChange={e => setEditingSuppl(prev => ({ ...prev, [ing.id]: { portion: e.target.value, prix: prev[ing.id]?.prix ?? prixVal } }))}
                                          style={{ width: 68, padding: '5px 6px', borderRadius: 7, border: `1.5px solid ${portionDirty ? C : CB}`, background: portionDirty ? CL : '#fafafa', fontSize: '0.82rem', textAlign: 'right', outline: 'none' }} />
                                        {portionDirty && <button onClick={() => saveSupplField(ing, 'portion')} disabled={ing.saving} style={{ padding: '4px 6px', borderRadius: 5, border: 'none', background: C, color: '#fff', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700 }}>✓</button>}
                                      </div>
                                    ) : <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>—</span>}
                                  </td>
                                  <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                                    {isActive ? (
                                      <div style={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{ position: 'relative' }}>
                                          <input type="number" min="0" step="0.01" value={prixVal} placeholder="0.00"
                                            onChange={e => setEditingSuppl(prev => ({ ...prev, [ing.id]: { portion: prev[ing.id]?.portion ?? portionVal, prix: e.target.value } }))}
                                            style={{ width: 85, padding: '5px 26px 5px 6px', borderRadius: 7, border: `1.5px solid ${prixDirty ? C : CB}`, background: prixDirty ? CL : '#fafafa', fontSize: '0.82rem', fontWeight: 700, color: CD, outline: 'none' }} />
                                          <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', color: C, pointerEvents: 'none', fontWeight: 700 }}>DT</span>
                                        </div>
                                        {prixDirty && <button onClick={() => saveSupplField(ing, 'prix')} disabled={ing.saving} style={{ padding: '4px 6px', borderRadius: 5, border: 'none', background: C, color: '#fff', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700 }}>✓</button>}
                                      </div>
                                    ) : <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>—</span>}
                                  </td>
                                  {activePrests.map(ap => (
                                    <td key={ap.id} style={{ padding: '8px 16px', textAlign: 'center' }}>
                                      {isActive && ing.vendable ? (
                                        (() => {
                                          const key = getPrixKey(ing.vendable!.id, ap.id);
                                          const existing = prixPrestataires.find(p => p.article_vendable_id === ing.vendable!.id && p.activite_prestataire_id === ap.id);
                                          const autoCalc = (ing.vendable!.prix_vente) * (1 - ap.taux_commission / 100);
                                          const isDirty = key in editingPrixPrest;
                                          const cv = isDirty ? editingPrixPrest[key] : (existing?.prix_vente != null ? String(existing.prix_vente) : '');
                                          return (
                                            <div>
                                              <div style={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
                                                <div style={{ position: 'relative' }}>
                                                  <input type="number" min="0" step="0.01" value={cv} placeholder={autoCalc.toFixed(2)}
                                                    onChange={e => setEditingPrixPrest(prev => ({ ...prev, [key]: e.target.value }))}
                                                    style={{ width: 85, padding: '5px 26px 5px 6px', borderRadius: 7, border: `1.5px solid ${isDirty ? C : CB}`, background: isDirty ? CL : '#fafafa', fontSize: '0.82rem', fontWeight: 700, color: CD, outline: 'none' }} />
                                                  <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: '0.6rem', color: C, pointerEvents: 'none', fontWeight: 700 }}>DT</span>
                                                </div>
                                                {isDirty && <button onClick={() => handleSavePrixPrest(ing.vendable!.id, ap.id)} disabled={saving} style={{ padding: '4px 6px', borderRadius: 5, border: 'none', background: C, color: '#fff', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700 }}>✓</button>}
                                              </div>
                                              {!isDirty && <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 1 }}>auto : {fmtMoney(autoCalc)}</div>}
                                            </div>
                                          );
                                        })()
                                      ) : <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>—</span>}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
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
