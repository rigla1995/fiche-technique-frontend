import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { Article, Category, Famille, Unit } from '../../types';

const COLOR = '#6366f1';
const GRADIENT = 'linear-gradient(135deg, #3730a3 0%, #6366f1 55%, #818cf8 100%)';

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

  const openCreate = () => {
    setEditItem(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  };

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
      }
      closeForm();
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/articles/${id}`);
      setDeleteId(null);
      load();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Impossible de supprimer cet article');
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
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '0 0 40px 0' }}>
      <div style={{ background: GRADIENT, color: '#fff', padding: '28px 24px 22px', borderRadius: '0 0 18px 18px', marginBottom: 24, boxShadow: `0 8px 32px rgba(99,102,241,0.22)` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Articles</h2>
            <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: 14 }}>
              {articles.length} article{articles.length !== 1 ? 's' : ''} dans votre référentiel
            </p>
          </div>
          <button onClick={openCreate} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: 10, padding: '9px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            + Nouvel article
          </button>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 9, border: 'none', fontSize: 13, outline: 'none' }}
          />
          {familles.length > 0 && (
            <select value={filterFamille} onChange={e => { setFilterFamille(e.target.value); setFilterCat(''); }}
              style={{ padding: '8px 10px', borderRadius: 9, border: 'none', fontSize: 13, maxWidth: 160 }}>
              <option value="">Toutes les familles</option>
              {familles.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          {filteredCats.length > 0 && (
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 9, border: 'none', fontSize: 13, maxWidth: 180 }}>
              <option value="">Toutes les catégories</option>
              {filteredCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', background: '#fff', borderRadius: 14, border: '1.5px dashed #e2e8f0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🧂</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
              {articles.length === 0 ? 'Aucun article' : 'Aucun résultat'}
            </div>
            {articles.length === 0 && (
              <>
                <div style={{ fontSize: 14, marginBottom: 20, maxWidth: 360, margin: '0 auto 20px' }}>
                  Créez vos premiers articles pour les utiliser dans vos stocks et fiches techniques.
                </div>
                <button onClick={openCreate} style={{ background: COLOR, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 600, cursor: 'pointer' }}>
                  + Créer un article
                </button>
              </>
            )}
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                  <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 13, fontWeight: 700, color: '#374151' }}>Article</th>
                  <th style={{ padding: '11px 12px', textAlign: 'left', fontSize: 13, fontWeight: 700, color: '#374151' }}>Catégorie</th>
                  <th style={{ padding: '11px 12px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#374151' }}>Prix</th>
                  <th style={{ padding: '11px 12px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#374151' }}>Unité</th>
                  <th style={{ padding: '11px 12px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#374151' }}>Seuil min</th>
                  <th style={{ padding: '11px 12px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#374151' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, idx) => (
                  <tr key={a.id} style={{ borderBottom: idx < filtered.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={{ padding: '11px 16px', fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{a.name}</td>
                    <td style={{ padding: '11px 12px', fontSize: 13, color: '#64748b' }}>
                      {a.familleName && <span style={{ color: '#6366f1', fontWeight: 600 }}>{a.familleName} › </span>}
                      {a.categorieName || <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontSize: 13, color: a.price !== null ? '#1e293b' : '#cbd5e1' }}>
                      {a.price !== null ? `${a.price.toFixed(3)} DT` : '—'}
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'center', fontSize: 13 }}>
                      <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: 6, fontWeight: 600, fontSize: 12 }}>{a.unitName || a.unit?.name || '—'}</span>
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontSize: 13, color: a.seuilMin !== null ? '#374151' : '#cbd5e1' }}>
                      {a.seuilMin !== null && a.seuilMin !== undefined ? `${a.seuilMin}` : '—'}
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => openEdit(a)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Modifier</button>
                        <button onClick={() => setDeleteId(a.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', margin: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', color: '#1e293b', fontSize: 18 }}>{editItem ? 'Modifier l\'article' : 'Nouvel article'}</h3>

            {[
              { label: 'Nom *', key: 'nom', placeholder: 'Ex: Poulet entier', type: 'text' },
              { label: 'Prix (DT)', key: 'prix', placeholder: '0.000', type: 'number' },
              { label: 'Seuil minimum', key: 'seuilMin', placeholder: 'Quantité minimale en stock', type: 'number' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{f.label}</label>
                <input
                  type={f.type} value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            ))}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Unité *</label>
              <select value={form.uniteId} onChange={e => setForm(p => ({ ...p, uniteId: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}>
                <option value="">— Sélectionner une unité —</option>
                {unites.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>

            {categories.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Catégorie</label>
                <select value={form.categorieId} onChange={e => setForm(p => ({ ...p, categorieId: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}>
                  <option value="">— Sans catégorie —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.familleName ? `${c.familleName} › ${c.name}` : c.name}</option>)}
                </select>
              </div>
            )}

            {error && <p style={{ color: '#dc2626', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={closeForm} style={{ flex: 1, background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 9, padding: '10px', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, background: COLOR, color: '#fff', border: 'none', borderRadius: 9, padding: '10px', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 380, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ margin: '0 0 10px', color: '#1e293b' }}>Supprimer cet article ?</h3>
            <p style={{ color: '#64748b', margin: '0 0 20px', fontSize: 14 }}>Les stocks et historiques liés à cet article seront conservés.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 9, padding: '10px', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => handleDelete(deleteId)} style={{ flex: 1, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 9, padding: '10px', fontWeight: 600, cursor: 'pointer' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
