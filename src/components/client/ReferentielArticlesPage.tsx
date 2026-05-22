import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { Article, Category, Famille, Unit } from '../../types';

const COLOR = '#16a34a';
const GRADIENT = 'linear-gradient(135deg, #14532d 0%, #16a34a 55%, #4ade80 100%)';

const LABEL: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3, display: 'block',
};

interface ArticleForm {
  nom: string;
  prix: string;
  seuilMin: string;
  uniteId: string;
  categorieId: string;
}

const emptyForm: ArticleForm = { nom: '', prix: '', seuilMin: '', uniteId: '', categorieId: '' };

export default function ReferentielArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [familles, setFamilles] = useState<Famille[]>([]);
  const [unites, setUnites] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Article | null>(null);
  const [form, setForm] = useState<ArticleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterFamille, setFilterFamille] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/api/articles'),
      api.get('/api/categories'),
      api.get('/api/familles'),
      api.get('/api/unites'),
    ]).then(([artR, catR, famR, uniR]) => {
      setArticles(artR.data);
      setCategories(catR.data);
      setFamilles(famR.data);
      setUnites(uniR.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditItem(null); setForm(emptyForm); setError(''); setShowForm(true); };

  const openEdit = (a: Article) => {
    setEditItem(a);
    setForm({
      nom: a.name,
      prix: a.price !== null && a.price !== undefined ? String(a.price) : '',
      seuilMin: a.seuilMin !== null && a.seuilMin !== undefined ? String(a.seuilMin) : '',
      uniteId: a.unitId ? String(a.unitId) : '',
      categorieId: a.categorieId ? String(a.categorieId) : '',
    });
    setError('');
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditItem(null); setForm(emptyForm); setError(''); };

  const handleSave = async () => {
    if (!form.nom.trim()) { setError('Nom requis'); return; }
    if (!form.uniteId) { setError('Unité requise'); return; }
    setSaving(true);
    try {
      const payload = {
        nom: form.nom.trim(),
        prix: form.prix !== '' ? parseFloat(form.prix) : null,
        seuilMin: form.seuilMin !== '' ? parseFloat(form.seuilMin) : null,
        unitId: parseInt(form.uniteId),
        categorieId: form.categorieId ? parseInt(form.categorieId) : null,
      };
      if (editItem) {
        await api.put(`/api/articles/${editItem.id}`, payload);
      } else {
        await api.post('/api/articles', payload);
        window.dispatchEvent(new Event('articles-changed'));
      }
      closeForm();
      load();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/articles/${id}`);
      setDeleteId(null);
      window.dispatchEvent(new Event('articles-changed'));
      load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Impossible de supprimer cet article');
    }
  };

  const filteredCats = filterFamille
    ? categories.filter(c => String(c.familleId) === filterFamille)
    : categories;

  const filtered = articles.filter(a => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat && String(a.categorieId) !== filterCat) return false;
    if (filterFamille && String(a.familleId) !== filterFamille) return false;
    return true;
  });

  return (
    <div className="page">
      {/* ── Hero ── */}
      <div style={{
        background: GRADIENT, borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(22,163,74,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🧂</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Articles</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {articles.length === 0
              ? 'Matières premières et ingrédients utilisés dans votre production'
              : 'Articles de votre référentiel — stock, fiches techniques et approvisionnements'}
          </p>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)',
          borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 80,
        }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{articles.length}</div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
            article{articles.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: '14px 18px', marginBottom: 20,
        border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 180 }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🔍</span>
          <div style={{ flex: 1 }}>
            <span style={LABEL}>Recherche</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Filtrer les articles…"
              style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: '#f8fafc', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        {familles.length > 0 && (
          <div style={{ minWidth: 150 }}>
            <span style={LABEL}>🗂️ Famille</span>
            <select
              value={filterFamille} onChange={e => { setFilterFamille(e.target.value); setFilterCat(''); }}
              style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: '#f8fafc' }}
            >
              <option value="">Toutes</option>
              {familles.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}
        {filteredCats.length > 0 && (
          <div style={{ minWidth: 165 }}>
            <span style={LABEL}>🏷️ Catégorie</span>
            <select
              value={filterCat} onChange={e => setFilterCat(e.target.value)}
              style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: '#f8fafc' }}
            >
              <option value="">Toutes</option>
              {filteredCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <button className="btn" onClick={openCreate} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', flexShrink: 0 }}>
          + Nouvel article
        </button>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🧂</span>
          <p>{articles.length === 0 ? 'Aucun article défini.' : 'Aucun résultat pour cette recherche.'}</p>
          {articles.length === 0 && (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>Créez vos premiers articles pour les utiliser dans vos stocks et fiches techniques.</p>
              <button className="btn btn-primary" onClick={openCreate}>+ Créer un article</button>
            </>
          )}
        </div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Catégorie</th>
                <th style={{ textAlign: 'right' }}>Prix</th>
                <th style={{ textAlign: 'center' }}>Unité</th>
                <th style={{ textAlign: 'right' }}>Seuil min</th>
                <th style={{ textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600, color: '#0f172a' }}>{a.name}</td>
                  <td style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    {a.familleName && <span style={{ color: COLOR, fontWeight: 600 }}>{a.familleName} › </span>}
                    {a.categorieName || <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>{a.price !== null && a.price !== undefined ? `${a.price.toFixed(3)} DT` : '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: 6, fontWeight: 600, fontSize: '0.75rem' }}>{a.unitName || a.unit?.name || '—'}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>{a.seuilMin !== null && a.seuilMin !== undefined ? String(a.seuilMin) : '—'}</td>
                  <td className="actions-cell" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)}>✏️ Modifier</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(a.id)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create/Edit Modal ── */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header" style={{ background: GRADIENT }}>
              <h2 style={{ color: '#fff', margin: 0 }}>{editItem ? 'Modifier l\'article' : 'Nouvel article'}</h2>
              <button className="modal-close" onClick={closeForm}>×</button>
            </div>
            <div className="modal-body">
              {error && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{error}</div>}
              {[
                { label: 'Nom *', key: 'nom', placeholder: 'Ex: Poulet entier', type: 'text' },
                { label: 'Prix (DT)', key: 'prix', placeholder: '0.000', type: 'number' },
                { label: 'Seuil minimum', key: 'seuilMin', placeholder: 'Quantité minimale en stock', type: 'number' },
              ].map(f => (
                <div key={f.key} className="form-group">
                  <label>{f.label}</label>
                  <input className="input" type={f.type} value={(form as unknown as Record<string, string>)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                </div>
              ))}
              <div className="form-group">
                <label>Unité *</label>
                <select className="input" value={form.uniteId} onChange={e => setForm(p => ({ ...p, uniteId: e.target.value }))}>
                  <option value="">— Sélectionner une unité —</option>
                  {unites.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              {categories.length > 0 && (
                <div className="form-group">
                  <label>Catégorie</label>
                  <select className="input" value={form.categorieId} onChange={e => setForm(p => ({ ...p, categorieId: e.target.value }))}>
                    <option value="">— Sans catégorie —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.familleName ? `${c.familleName} › ${c.name}` : c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={closeForm}>Annuler</button>
                <button className="btn" disabled={saving || !form.nom.trim() || !form.uniteId} onClick={handleSave} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff' }}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ── */}
      {deleteId !== null && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <div className="modal-body" style={{ padding: '28px 24px' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
              <h3 style={{ margin: '0 0 10px' }}>Supprimer cet article ?</h3>
              <p style={{ color: 'var(--text-muted)', margin: '0 0 20px', fontSize: '0.9rem' }}>Les stocks et historiques liés seront conservés.</p>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setDeleteId(null)}>Annuler</button>
                <button className="btn btn-danger" onClick={() => handleDelete(deleteId!)}>Supprimer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
