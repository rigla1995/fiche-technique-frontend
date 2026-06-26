import { useState, useEffect, useMemo } from 'react';
import api from '../../api/client';
import type { CategorieProduit, Product } from '../../types';
import ComposedValoriseModal from './ComposedValoriseModal';
import FicheTechniqueModal from './FicheTechniqueModal';

const HERO = 'linear-gradient(135deg, #0a1628 0%, #0f2847 55%, #0d3b2e 100%)';
const CATS_PER_PAGE = 10;
const COMPOSES_PER_PAGE = 12;

const apiMsg = (e: unknown, fallback = 'Erreur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

interface ArticleValorisable {
  id: number;
  nom: string;
  unite_nom: string | null;
  categorie_nom: string | null;
  famille_nom: string | null;
  categorie_produit_id: number | null;
  categorie_produit_nom: string | null;
}

type StatutFilter = 'all' | 'assigned' | 'unassigned';

export default function ValorisesPage() {
  const [articles, setArticles] = useState<ArticleValorisable[]>([]);
  const [categories, setCategories] = useState<CategorieProduit[]>([]);
  const [composes, setComposes] = useState<Product[]>([]);
  const [showComposed, setShowComposed] = useState(false);
  const [editComposeId, setEditComposeId] = useState<number | null>(null);
  const [ftProduct, setFtProduct] = useState<Product | null>(null);
  const [ftLabos, setFtLabos] = useState<{ id: number; nom: string }[]>([]);
  const [ftLaboId, setFtLaboId] = useState<number | null>(null);
  const [ftLoading, setFtLoading] = useState(false);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [viewDetail, setViewDetail] = useState<{ ingredients: { ingredientName: string; portion: number; unitName: string }[]; subProducts: { subProductName: string; portion: number }[] } | null>(null);
  const [tab, setTab] = useState<'composes' | 'referentiel'>('composes');
  const [hasLabos, setHasLabos] = useState(false);
  const [composePage, setComposePage] = useState(1);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [filterFamille, setFilterFamille] = useState('');
  const [filterStatut, setFilterStatut] = useState<StatutFilter>('all');
  const [page, setPage] = useState(1);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/api/articles-valorisables'),
      api.get('/api/categories-produit?type=valorise'),
      api.get('/api/products?type=vendable&origine=labo'),
      api.get('/api/labo'),
    ])
      .then(([a, c, p, l]) => {
        setArticles(a.data); setCategories(c.data); setComposes(p.data as Product[]);
        // Les produits composés sont fabriqués au labo : sans labo, pas d'onglet « Composés »
        // ni de bouton d'ajout. On bascule alors sur l'onglet « Référentiel ».
        const labosExist = Array.isArray(l.data) && l.data.length > 0;
        setHasLabos(labosExist);
        if (!labosExist) { setTab('referentiel'); setShowComposed(false); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openView = async (p: Product) => {
    setViewProduct(p); setViewDetail(null);
    try { const { data } = await api.get(`/api/products/${p.id}`); setViewDetail(data); } catch { /* */ }
  };

  // FT d'un composé : le coût se calcule sur les prix d'appro du/des LABO(s) de fabrication,
  // indépendamment des activités. On récupère les labos liés ; sélecteur si plusieurs.
  const openFt = async (p: Product) => {
    setFtProduct(p); setFtLabos([]); setFtLaboId(null); setFtLoading(true);
    try {
      const { data } = await api.get(`/api/products/${p.id}`);
      const labos = (data.labos ?? []) as { id: number; nom: string }[];
      setFtLabos(labos);
      if (labos.length === 1) setFtLaboId(labos[0].id);
      else if (labos.length === 0) setFtLaboId(0); // repli : aucun labo → contexte activité
    } catch {
      setFtLaboId(0);
    } finally { setFtLoading(false); }
  };
  const closeFt = () => { setFtProduct(null); setFtLabos([]); setFtLaboId(null); };

  const deleteCompose = async (p: Product) => {
    if (!window.confirm(`Supprimer le produit valorisé composé « ${p.name} » ?`)) return;
    setDeletingId(p.id);
    try {
      await api.delete(`/api/products/${p.id}`);
      setComposes(prev => prev.filter(x => x.id !== p.id));
    } catch (e: unknown) { alert(apiMsg(e, 'Erreur lors de la suppression')); }
    finally { setDeletingId(null); }
  };

  const assign = async (article: ArticleValorisable, categorieId: string) => {
    setSavingId(article.id);
    const catId = categorieId ? parseInt(categorieId) : null;
    try {
      await api.put(`/api/articles-valorisables/${article.id}/categorie`, { categorie_produit_id: catId });
      setArticles(prev => prev.map(a => a.id === article.id
        ? { ...a, categorie_produit_id: catId, categorie_produit_nom: categories.find(c => c.id === catId)?.name ?? null }
        : a));
    } catch (e: unknown) { alert(apiMsg(e, "Erreur lors de l'enregistrement")); }
    finally { setSavingId(null); }
  };

  const familles = useMemo(
    () => Array.from(new Set(articles.map(a => a.famille_nom).filter(Boolean))).sort() as string[],
    [articles]
  );

  const assignedCount = articles.filter(a => a.categorie_produit_id).length;

  const filtered = articles.filter(a => {
    if (search && !a.nom.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterFamille && a.famille_nom !== filterFamille) return false;
    if (filterStatut === 'assigned' && !a.categorie_produit_id) return false;
    if (filterStatut === 'unassigned' && a.categorie_produit_id) return false;
    return true;
  });

  // Grouper par catégorie d'article (référentiel)
  const groups = useMemo(() => {
    const map = new Map<string, ArticleValorisable[]>();
    for (const a of filtered) {
      const key = a.categorie_nom ?? 'Sans catégorie';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries())
      .sort((x, y) => x[0].localeCompare(y[0], 'fr'))
      .map(([cat, items]) => ({
        cat,
        famille: items[0].famille_nom ?? null,
        items: items.slice().sort((m, n) => m.nom.localeCompare(n.nom, 'fr')),
      }));
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(groups.length / CATS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageGroups = groups.slice((safePage - 1) * CATS_PER_PAGE, safePage * CATS_PER_PAGE);

  const resetFilters = () => { setSearch(''); setFilterFamille(''); setFilterStatut('all'); setPage(1); };
  const hasFilters = !!search || !!filterFamille || filterStatut !== 'all';

  const labelStyle: React.CSSProperties = { fontSize: '0.68rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 };
  const inputStyle: React.CSSProperties = { padding: '9px 13px', borderRadius: 9, border: '1.5px solid #6ee7b7', fontSize: '0.88rem', background: '#f0fdf4', minWidth: 160 };

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: HERO, borderRadius: 18, padding: '24px 28px', marginBottom: 24, boxShadow: '0 8px 32px rgba(10,22,40,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem', lineHeight: 1 }}>💎</div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>Produits valorisés</h1>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.83rem', margin: 0 }}>
              Vendus tels quels : articles du référentiel (catégorie à assigner) + produits composés fabriqués au labo
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.22)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 80 }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10b981', lineHeight: 1 }}>{assignedCount}/{articles.length}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>articles catégorisés</div>
            </div>
            {hasLabos && (
              <button onClick={() => setShowComposed(true)}
                style={{ background: 'linear-gradient(135deg, #047857, #10b981)', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, padding: '12px 18px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                + Produit valorisé composé
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Onglets — l'onglet « Composés » n'apparaît que si le client a au moins un labo */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e2e8f0', marginBottom: 18 }}>
        {(([
          ...(hasLabos ? [['composes', `🏭 Composés (${composes.length})`]] : []),
          ['referentiel', `💎 Référentiel (${articles.length})`],
        ]) as ['composes' | 'referentiel', string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding: '9px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: tab === key ? 700 : 400, color: tab === key ? '#059669' : 'var(--text)', borderBottom: tab === key ? '3px solid #059669' : '3px solid transparent' }}>
            {label}
          </button>
        ))}
      </div>

      {hasLabos && tab === 'composes' && (
        composes.length === 0 ? (
          <div style={{ background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)', border: '2px dashed #c7d2fe', borderRadius: 18, padding: '40px 32px', textAlign: 'center', color: '#3730a3' }}>
            <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>🏭</div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Aucun produit composé</div>
            <div style={{ fontSize: '0.88rem' }}>Cliquez sur « + Produit valorisé composé » pour en créer un.</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {composes.slice((composePage - 1) * COMPOSES_PER_PAGE, composePage * COMPOSES_PER_PAGE).map((p) => (
                <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>💎</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{p.name}</div>
                      {p.refProduit && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Réf : {p.refProduit}</div>}
                      <div style={{ fontSize: '0.74rem', color: '#4338ca', marginTop: 3, background: '#eef2ff', borderRadius: 6, padding: '1px 7px', display: 'inline-block' }}>{p.categorieProduitName ?? 'Sans catégorie'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>{p.ingredientsCount ?? 0}</div>
                      <div style={{ fontSize: '0.66rem', color: '#64748b' }}>articles</div>
                    </div>
                    <div style={{ flex: 1, background: '#faf5ff', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, color: '#5b21b6' }}>{p.subProductsCount ?? 0}</div>
                      <div style={{ fontSize: '0.66rem', color: '#7c3aed' }}>PU</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <button onClick={() => openFt(p)} disabled={(p.ingredientsCount ?? 0) === 0 || (ftLoading && ftProduct?.id === p.id)} title="Générer la fiche technique (prix d'appro du labo)"
                      style={{ background: '#f0fdf4', border: '1px solid #6ee7b7', borderRadius: 8, color: '#047857', cursor: (p.ingredientsCount ?? 0) === 0 ? 'not-allowed' : 'pointer', padding: '7px', fontSize: '0.78rem', fontWeight: 700, opacity: (p.ingredientsCount ?? 0) === 0 ? 0.5 : 1 }}>📄 Fiche technique (XLS)</button>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openView(p)} style={{ flex: 1, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, color: '#475569', cursor: 'pointer', padding: '6px', fontSize: '0.78rem', fontWeight: 600 }}>👁 Voir</button>
                      <button onClick={() => setEditComposeId(p.id)} style={{ flex: 1, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, color: '#1d4ed8', cursor: 'pointer', padding: '6px', fontSize: '0.78rem', fontWeight: 600 }}>✏️ Modifier</button>
                      <button onClick={() => deleteCompose(p)} disabled={deletingId === p.id} title="Supprimer" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', cursor: 'pointer', padding: '6px 10px', fontSize: '0.78rem', fontWeight: 700 }}>🗑</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {composes.length > COMPOSES_PER_PAGE && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18 }}>
                <button disabled={composePage <= 1} onClick={() => setComposePage(composePage - 1)} style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid #c7d2fe', background: '#fff', color: '#4338ca', cursor: composePage <= 1 ? 'default' : 'pointer', fontWeight: 700, opacity: composePage <= 1 ? 0.4 : 1 }}>‹</button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{composePage} / {Math.ceil(composes.length / COMPOSES_PER_PAGE)}</span>
                <button disabled={composePage >= Math.ceil(composes.length / COMPOSES_PER_PAGE)} onClick={() => setComposePage(composePage + 1)} style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid #c7d2fe', background: '#fff', color: '#4338ca', cursor: 'pointer', fontWeight: 700, opacity: composePage >= Math.ceil(composes.length / COMPOSES_PER_PAGE) ? 0.4 : 1 }}>›</button>
              </div>
            )}
          </>
        )
      )}

      {tab === 'referentiel' && (<>
      {/* Filtres */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 18px', marginBottom: 20, border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <label style={labelStyle}>🔍 Article</label>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Nom de l'article…" style={inputStyle} />
        </div>
        {familles.length > 0 && (
          <div>
            <label style={labelStyle}>🗂️ Famille</label>
            <select value={filterFamille} onChange={e => { setFilterFamille(e.target.value); setPage(1); }} style={inputStyle}>
              <option value="">Toutes les familles</option>
              {familles.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={labelStyle}>🏷️ Statut</label>
          <select value={filterStatut} onChange={e => { setFilterStatut(e.target.value as StatutFilter); setPage(1); }} style={inputStyle}>
            <option value="all">Tous</option>
            <option value="assigned">Catégorisés</option>
            <option value="unassigned">Non catégorisés</option>
          </select>
        </div>
        {hasFilters && (
          <button onClick={resetFilters} style={{ padding: '9px 14px', borderRadius: 9, border: '1.5px solid #6ee7b7', background: '#fff', color: '#059669', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>✕ Réinitialiser</button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          {filtered.length} article{filtered.length !== 1 ? 's' : ''} · {groups.length} catégorie{groups.length !== 1 ? 's' : ''}
        </div>
      </div>

      {categories.length === 0 && !loading && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#92400e' }}>
          ⚠️ Aucune catégorie de type « Article valorisé ». Créez-en d'abord dans <strong>Catégories Produits</strong>.
        </div>
      )}

      {/* Liste groupée */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : articles.length === 0 ? (
        <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '2px dashed #86efac', borderRadius: 18, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 14 }}>💎</div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#14532d', margin: '0 0 8px' }}>Aucun article valorisable</h3>
          <p style={{ color: '#166534', fontSize: '0.88rem', margin: 0, maxWidth: 440, marginInline: 'auto' }}>Les articles valorisables proviennent des familles marquées « vendable » et « non consommable » dans votre référentiel.</p>
        </div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>Aucun résultat pour ces filtres.</div>
      ) : (
        <>
          {pageGroups.map(group => (
            <div key={group.cat} className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', borderBottom: '1px solid #bbf7d0' }}>
                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#065f46' }}>🗂️ {group.cat}</span>
                {group.famille && <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600 }}>· {group.famille}</span>}
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, background: '#dcfce7', borderRadius: 20, padding: '2px 9px' }}>{group.items.length}</span>
              </div>
              <div className="table-responsive">
                <table className="table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Article</th>
                      <th style={{ width: 220 }}>Catégorie produit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600, color: '#0f172a' }}>
                          {a.nom}
                          {a.unite_nom && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 6 }}>({a.unite_nom})</span>}
                        </td>
                        <td>
                          <select
                            value={a.categorie_produit_id ? String(a.categorie_produit_id) : ''}
                            disabled={savingId === a.id || categories.length === 0}
                            onChange={e => assign(a, e.target.value)}
                            style={{ minWidth: 180, padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${a.categorie_produit_id ? '#6ee7b7' : '#fca5a5'}`, background: a.categorie_produit_id ? '#f0fdf4' : '#fef2f2', fontSize: '0.85rem', color: '#0f172a', cursor: 'pointer' }}
                          >
                            <option value="">— Aucune —</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Catégories {(safePage - 1) * CATS_PER_PAGE + 1}–{Math.min(safePage * CATS_PER_PAGE, groups.length)} sur {groups.length}
              </span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid #6ee7b7', background: '#fff', color: '#059669', cursor: safePage <= 1 ? 'default' : 'pointer', fontWeight: 700, opacity: safePage <= 1 ? 0.4 : 1 }}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)} style={{ minWidth: 32, padding: '4px 9px', borderRadius: 7, border: `1.5px solid ${p === safePage ? '#059669' : '#6ee7b7'}`, background: p === safePage ? '#059669' : '#fff', color: p === safePage ? '#fff' : '#065f46', fontWeight: p === safePage ? 800 : 500, cursor: 'pointer' }}>{p}</button>
                ))}
                <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid #6ee7b7', background: '#fff', color: '#059669', cursor: safePage >= totalPages ? 'default' : 'pointer', fontWeight: 700, opacity: safePage >= totalPages ? 0.4 : 1 }}>›</button>
              </div>
            </div>
          )}
        </>
      )}
      </>)}

      {(showComposed || editComposeId !== null) && (
        <ComposedValoriseModal
          categories={categories}
          editProductId={editComposeId ?? undefined}
          onClose={() => { setShowComposed(false); setEditComposeId(null); }}
          onCreated={() => { setShowComposed(false); setEditComposeId(null); load(); }}
        />
      )}

      {viewProduct && (
        <div className="modal-overlay" onClick={() => setViewProduct(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>💎 {viewProduct.name}</h2>
              <button className="modal-close" onClick={() => setViewProduct(null)}>×</button>
            </div>
            <div className="modal-body">
              {!viewDetail ? <div className="loading-text">Chargement…</div> : (
                <>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#065f46', marginBottom: 6 }}>🧂 Articles</div>
                  {viewDetail.ingredients.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</div> :
                    viewDetail.ingredients.map((i, k) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 9px', fontSize: '0.85rem', borderRadius: 6, background: k % 2 ? '#f8fafc' : '#fff' }}>
                        <span style={{ color: '#374151' }}>{i.ingredientName}</span><span style={{ color: '#64748b', fontWeight: 600 }}>{i.portion} {i.unitName}</span>
                      </div>
                    ))}
                  {viewDetail.subProducts.length > 0 && (
                    <>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#7c3aed', margin: '12px 0 6px' }}>🔄 Produits utilisables</div>
                      {viewDetail.subProducts.map((s, k) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 9px', fontSize: '0.85rem', borderRadius: 6, background: '#faf5ff' }}>
                          <span style={{ color: '#5b21b6' }}>{s.subProductName}</span><span style={{ color: '#7c3aed', fontWeight: 600 }}>{s.portion}</span>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer"><button className="btn btn-ghost" onClick={() => setViewProduct(null)}>Fermer</button></div>
          </div>
        </div>
      )}

      {/* Sélecteur de labo si le composé est fabriqué dans plusieurs labos */}
      {ftProduct && !ftLoading && ftLaboId === null && ftLabos.length > 1 && (
        <div className="modal-overlay" onClick={closeFt}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>📄 Fiche technique — choisir le labo</h2>
              <button className="modal-close" onClick={closeFt}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 14px' }}>
                « {ftProduct.name} » est fabriqué dans plusieurs labos. Choisissez le labo dont les <strong>prix d'appro</strong> serviront au calcul du coût.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ftLabos.map(l => (
                  <button key={l.id} onClick={() => setFtLaboId(l.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #6ee7b7', background: '#f0fdf4', color: '#065f46', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                    🏭 {l.nom}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-ghost" onClick={closeFt}>Annuler</button></div>
          </div>
        </div>
      )}

      {/* Mode labo : coût sur les prix d'appro du labo */}
      {ftProduct && ftLaboId !== null && ftLaboId > 0 && (() => {
        const labo = ftLabos.find(l => l.id === ftLaboId);
        return (
          <FicheTechniqueModal
            productId={ftProduct.id}
            productName={ftProduct.name}
            hasIngredients={(ftProduct.ingredientsCount ?? 0) > 0}
            resolvedActId={0}
            laboId={ftLaboId}
            contextLabel={labo ? `Labo : ${labo.nom}` : ''}
            activityName={labo?.nom ?? ''}
            activities={[]}
            onClose={closeFt}
          />
        );
      })()}

      {/* Repli (aucun labo associé) : contexte activité comme avant */}
      {ftProduct && ftLaboId === 0 && (
        <FicheTechniqueModal
          productId={ftProduct.id}
          productName={ftProduct.name}
          hasIngredients={(ftProduct.ingredientsCount ?? 0) > 0}
          resolvedActId={ftProduct.activites?.[0]?.id ?? 0}
          contextLabel={ftProduct.activites?.[0]?.nom ? `Activité : ${ftProduct.activites[0].nom}` : ''}
          activityName={ftProduct.activites?.[0]?.nom ?? ''}
          activities={(ftProduct.activites ?? []).map(a => ({ id: a.id, nom: a.nom }))}
          onClose={closeFt}
        />
      )}
    </div>
  );
}
