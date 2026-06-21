import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { CategorieProduit } from '../../types';

const HERO = 'linear-gradient(135deg, #0a1628 0%, #0f2847 55%, #0d3b2e 100%)';

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

export default function ValorisesPage() {
  const [articles, setArticles] = useState<ArticleValorisable[]>([]);
  const [categories, setCategories] = useState<CategorieProduit[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

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

  const filtered = articles.filter(a => !search || a.nom.toLowerCase().includes(search.toLowerCase()));
  const assignedCount = articles.filter(a => a.categorie_produit_id).length;

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

      {/* Filter bar */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 18px', marginBottom: 20, border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 180 }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrer les articles…" style={{ flex: 1, padding: '9px 13px', borderRadius: 9, border: '1.5px solid #6ee7b7', fontSize: '0.88rem', background: '#f0fdf4', boxSizing: 'border-box' }} />
        </div>
      </div>

      {categories.length === 0 && !loading && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#92400e' }}>
          ⚠️ Aucune catégorie de type « Article valorisé ». Créez-en d'abord dans <strong>Catégories Produits</strong>.
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : articles.length === 0 ? (
        <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '2px dashed #86efac', borderRadius: 18, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 14 }}>💎</div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#14532d', margin: '0 0 8px' }}>Aucun article valorisable</h3>
          <p style={{ color: '#166534', fontSize: '0.88rem', margin: 0, maxWidth: 440, marginInline: 'auto' }}>Les articles valorisables proviennent des familles marquées « vendable » et « non consommable » dans votre référentiel.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>Aucun résultat pour cette recherche.</div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Famille / Catégorie</th>
                <th>Catégorie produit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600, color: '#0f172a' }}>
                    {a.nom}
                    {a.unite_nom && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 6 }}>({a.unite_nom})</span>}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {a.famille_nom ?? '—'}{a.categorie_nom ? ` · ${a.categorie_nom}` : ''}
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
      )}
    </div>
  );
}
