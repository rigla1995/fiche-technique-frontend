import { useState, useEffect, useMemo } from 'react';
import api from '../../api/client';
import type { CategorieProduit } from '../../types';

const HERO = 'linear-gradient(135deg, #0a1628 0%, #0f2847 55%, #0d3b2e 100%)';
const CATS_PER_PAGE = 10;

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
    ])
      .then(([a, c]) => { setArticles(a.data); setCategories(c.data); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

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
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>Articles valorisés</h1>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.83rem', margin: 0 }}>
              Articles des familles vendables non consommables — assignez une catégorie à chacun pour les rendre vendables
            </p>
          </div>
          <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.22)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 80 }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10b981', lineHeight: 1 }}>{assignedCount}/{articles.length}</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>catégorisés</div>
          </div>
        </div>
      </div>

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
    </div>
  );
}
