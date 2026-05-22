import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { Article, Activite, Category, Famille, Labo, Unit } from '../../types';

const COLOR = '#16a34a';
const GRADIENT = 'linear-gradient(135deg, #14532d 0%, #16a34a 55%, #4ade80 100%)';

const LABEL: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3, display: 'block',
};

interface ArticleEditForm {
  nom: string;
  uniteId: string;
  categorieId: string;
}

const emptyEditForm: ArticleEditForm = { nom: '', uniteId: '', categorieId: '' };

export default function ReferentielArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [familles, setFamilles] = useState<Famille[]>([]);
  const [unites, setUnites] = useState<Unit[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [labos, setLabos] = useState<Labo[]>([]);
  const [loading, setLoading] = useState(true);

  // Create wizard state
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [createNom, setCreateNom] = useState('');
  const [createUniteId, setCreateUniteId] = useState('');
  const [createCategorieId, setCreateCategorieId] = useState('');
  const [selectedActiviteIds, setSelectedActiviteIds] = useState<number[]>([]);
  const [selectedLaboIds, setSelectedLaboIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit state
  const [editItem, setEditItem] = useState<Article | null>(null);
  const [editForm, setEditForm] = useState<ArticleEditForm>(emptyEditForm);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterFamille, setFilterFamille] = useState('');
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/api/articles'),
      api.get('/api/categories'),
      api.get('/api/familles'),
      api.get('/api/unites'),
      api.get('/api/entreprise/activites'),
      api.get('/api/labo'),
    ]).then(([artR, catR, famR, uniR, actR, labR]) => {
      setArticles(artR.data);
      setCategories(catR.data);
      setFamilles(famR.data);
      setUnites(uniR.data);
      setActivites(actR.data);
      setLabos(labR.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Create wizard ──
  const openCreate = () => {
    setCreateNom(''); setCreateUniteId(''); setCreateCategorieId('');
    setSelectedActiviteIds([]); setSelectedLaboIds([]);
    setCreateError(''); setCreateStep(1); setShowCreate(true);
  };
  const closeCreate = () => { setShowCreate(false); setCreateError(''); };

  const step1Valid = createNom.trim() !== '' && createUniteId !== '' && (categories.length === 0 || createCategorieId !== '');

  const goStep2 = () => {
    if (!step1Valid) { setCreateError('Veuillez remplir tous les champs obligatoires'); return; }
    setCreateError(''); setCreateStep(2);
  };

  const allCount = activites.length + labos.length;
  const selectedCount = selectedActiviteIds.length + selectedLaboIds.length;
  const allSelected = allCount > 0 && selectedCount === allCount;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedActiviteIds([]);
      setSelectedLaboIds([]);
    } else {
      setSelectedActiviteIds(activites.map(a => a.id));
      setSelectedLaboIds(labos.map(l => l.id));
    }
  };

  const toggleActivite = (id: number) => {
    setSelectedActiviteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleLabo = (id: number) => {
    setSelectedLaboIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCreate = async () => {
    if (selectedCount === 0) { setCreateError('Sélectionnez au moins une activité ou un labo'); return; }
    setCreating(true);
    setCreateError('');
    try {
      const res = await api.post('/api/articles', {
        nom: createNom.trim(),
        unitId: parseInt(createUniteId),
        categorieId: createCategorieId ? parseInt(createCategorieId) : null,
      });
      const articleId = res.data.id;
      await Promise.all([
        ...selectedActiviteIds.map(actId =>
          api.post(`/api/entreprise/activites/${actId}/ingredients/${articleId}/select`)
        ),
        ...selectedLaboIds.map(laboId =>
          api.post(`/api/labo/${laboId}/ingredients/${articleId}/select`)
        ),
      ]);
      window.dispatchEvent(new Event('articles-changed'));
      closeCreate();
      load();
    } catch (e: unknown) {
      setCreateError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  // ── Edit ──
  const openEdit = (a: Article) => {
    setEditItem(a);
    setEditForm({
      nom: a.name,
      uniteId: a.unitId ? String(a.unitId) : '',
      categorieId: a.categorieId ? String(a.categorieId) : '',
    });
    setEditError('');
  };
  const closeEdit = () => { setEditItem(null); setEditForm(emptyEditForm); setEditError(''); };

  const handleSave = async () => {
    if (!editForm.nom.trim()) { setEditError('Nom requis'); return; }
    if (!editForm.uniteId) { setEditError('Unité requise'); return; }
    setSaving(true);
    try {
      await api.put(`/api/articles/${editItem!.id}`, {
        nom: editForm.nom.trim(),
        unitId: parseInt(editForm.uniteId),
        categorieId: editForm.categorieId ? parseInt(editForm.categorieId) : null,
      });
      closeEdit();
      load();
    } catch (e: unknown) {
      setEditError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──
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

  const toggleCat = (key: string) => {
    setOpenCats(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Group filtered articles by famille then catégorie
  type CatGroup = { catKey: string; catName: string | null; catId: number | null; items: Article[] };
  type FamGroup = { famKey: string; famName: string | null; cats: CatGroup[] };
  const grouped: FamGroup[] = [];
  const famMap = new Map<string, FamGroup>();
  for (const a of filtered) {
    const famKey = a.familleId != null ? String(a.familleId) : '__none__';
    const famName = a.familleName || null;
    const catKey = `${famKey}::${a.categorieId ?? '__none__'}`;
    const catName = a.categorieName || null;
    const catId = a.categorieId || null;
    if (!famMap.has(famKey)) {
      const fg: FamGroup = { famKey, famName, cats: [] };
      famMap.set(famKey, fg);
      grouped.push(fg);
    }
    const fg = famMap.get(famKey)!;
    let cg = fg.cats.find(c => c.catKey === catKey);
    if (!cg) { cg = { catKey, catName, catId, items: [] }; fg.cats.push(cg); }
    cg.items.push(a);
  }

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

      {/* ── Grouped list ── */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : articles.length === 0 ? (
        <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '2px dashed #86efac', borderRadius: 18, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 14 }}>🧂</div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#14532d', margin: '0 0 8px' }}>Aucun article défini</h3>
          <p style={{ color: '#166534', fontSize: '0.88rem', margin: '0 0 24px', maxWidth: 420, marginInline: 'auto' }}>
            Les articles sont vos matières premières et ingrédients. Créez-en pour commencer à gérer votre stock, vos approvisionnements et vos fiches techniques.
          </p>
          <button onClick={openCreate} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 28px', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer' }}>
            + Créer le premier article
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          Aucun résultat pour cette recherche.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.map(fg => (
            <div key={fg.famKey} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Famille header */}
              {fg.famName && (
                <div style={{
                  padding: '10px 18px',
                  background: 'linear-gradient(90deg,#f0fdf4,#dcfce7)',
                  borderBottom: '1px solid #bbf7d0',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: '1rem' }}>🗂️</span>
                  <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#14532d' }}>{fg.famName}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#16a34a', fontWeight: 600 }}>
                    {fg.cats.reduce((s, c) => s + c.items.length, 0)} article{fg.cats.reduce((s, c) => s + c.items.length, 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              )}

              {/* Categories */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {fg.cats.map((cg, ci) => {
                  const isOpen = openCats.has(cg.catKey);
                  const isLast = ci === fg.cats.length - 1;
                  return (
                    <div key={cg.catKey} style={{ borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
                      {/* Category toggle */}
                      <button
                        onClick={() => toggleCat(cg.catKey)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '11px 18px', background: 'transparent', border: 'none',
                          cursor: 'pointer', textAlign: 'left',
                          borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{
                          fontSize: '0.65rem', color: '#94a3b8',
                          transform: isOpen ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.2s', display: 'inline-block',
                        }}>▶</span>
                        <span style={{ fontSize: '0.9rem' }}>🏷️</span>
                        <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#374151' }}>
                          {cg.catName || 'Sans catégorie'}
                        </span>
                        <span style={{
                          marginLeft: 8, background: '#f1f5f9', color: '#64748b',
                          borderRadius: 10, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 600,
                        }}>
                          {cg.items.length}
                        </span>
                      </button>

                      {/* Articles */}
                      {isOpen && (
                        <div>
                          {cg.items.map((a, ai) => (
                            <div
                              key={a.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '9px 18px 9px 46px',
                                borderBottom: ai < cg.items.length - 1 ? '1px solid #f1f5f9' : 'none',
                                background: '#fafafa',
                              }}
                            >
                              <span style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: COLOR, flexShrink: 0, display: 'inline-block',
                              }} />
                              <span style={{ flex: 1, fontWeight: 600, fontSize: '0.88rem', color: '#0f172a' }}>
                                {a.name}
                              </span>
                              <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: 6, fontWeight: 600, fontSize: '0.72rem' }}>
                                {a.unitName || a.unit?.name || '—'}
                              </span>
                              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)}>✏️ Modifier</button>
                                <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(a.id)}>🗑️</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create Wizard ── */}
      {showCreate && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            {/* Header with step indicator */}
            <div className="modal-header" style={{ background: GRADIENT, flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <h2 style={{ color: '#fff', margin: 0 }}>Nouvel article</h2>
                <button className="modal-close" onClick={closeCreate} style={{ color: '#fff' }}>×</button>
              </div>
              {/* Step indicator */}
              <div style={{ display: 'flex', gap: 16, width: '100%' }}>
                {[
                  { n: 1, label: 'Informations' },
                  { n: 2, label: 'Affectation' },
                ].map(s => (
                  <div key={s.n} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{
                      height: 4, borderRadius: 4,
                      background: s.n <= createStep ? '#fff' : 'rgba(255,255,255,0.3)',
                      transition: 'background 0.2s',
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                        background: s.n <= createStep ? '#fff' : 'rgba(255,255,255,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.65rem', fontWeight: 800,
                        color: s.n <= createStep ? '#16a34a' : 'rgba(255,255,255,0.6)',
                      }}>
                        {s.n < createStep ? '✓' : s.n}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: s.n <= createStep ? '#fff' : 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
                        {s.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-body">
              {createError && (
                <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>
                  {createError}
                </div>
              )}

              {createStep === 1 ? (
                <>
                  <div style={{ marginBottom: 14, color: '#64748b', fontSize: '0.82rem' }}>
                    Renseignez les informations de base de l'article.
                  </div>
                  <div className="form-group">
                    <label>Nom *</label>
                    <input
                      className="input" autoFocus value={createNom}
                      placeholder="Ex: Poulet entier"
                      onChange={e => setCreateNom(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && step1Valid && goStep2()}
                    />
                  </div>
                  <div className="form-group">
                    <label>Unité *</label>
                    <select className="input" value={createUniteId} onChange={e => setCreateUniteId(e.target.value)}>
                      <option value="">— Sélectionner une unité —</option>
                      {unites.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Catégorie *</label>
                    {categories.length === 0 ? (
                      <div style={{ padding: '10px 12px', borderRadius: 8, background: '#fefce8', border: '1px solid #fde68a', fontSize: '0.84rem', color: '#92400e' }}>
                        💡 Créez d'abord des catégories dans le référentiel pour pouvoir les sélectionner.
                      </div>
                    ) : (
                      <select className="input" value={createCategorieId} onChange={e => setCreateCategorieId(e.target.value)}>
                        <option value="">— Sélectionner une catégorie —</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.familleName ? `${c.familleName} › ${c.name}` : c.name}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={closeCreate}>Annuler</button>
                    <button
                      className="btn"
                      disabled={!step1Valid}
                      onClick={goStep2}
                      style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff' }}
                    >
                      Suivant →
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 12, color: '#64748b', fontSize: '0.82rem' }}>
                    Affectez cet article à au moins une activité ou un labo.
                  </div>

                  {allCount === 0 ? (
                    <div style={{ padding: '16px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #86efac', fontSize: '0.85rem', color: '#166534', textAlign: 'center' }}>
                      Aucune activité ou labo trouvé. Créez-en depuis « Mes Activités ».
                    </div>
                  ) : (
                    <>
                      {/* Select all */}
                      <button
                        onClick={toggleSelectAll}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                          padding: '8px 14px', marginBottom: 8, borderRadius: 8, cursor: 'pointer',
                          border: '1.5px solid var(--border)', background: allSelected ? '#f0fdf4' : 'transparent',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          border: allSelected ? 'none' : '1.5px solid #cbd5e1',
                          background: allSelected ? '#16a34a' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {allSelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#374151' }}>Tout sélectionner</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#94a3b8' }}>
                          {selectedCount}/{allCount}
                        </span>
                      </button>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                        {activites.map(act => {
                          const selected = selectedActiviteIds.includes(act.id);
                          return (
                            <button
                              key={`act-${act.id}`}
                              onClick={() => toggleActivite(act.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                                border: selected ? '2px solid #16a34a' : '1.5px solid var(--border)',
                                background: selected ? '#f0fdf4' : 'var(--surface)',
                                transition: 'all 0.15s',
                              }}
                            >
                              <div style={{
                                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                background: selected ? '#dcfce7' : '#f1f5f9',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                              }}>
                                📍
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0f172a' }}>{act.nom}</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Activité</div>
                              </div>
                              <div style={{
                                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                border: selected ? 'none' : '1.5px solid #cbd5e1',
                                background: selected ? '#16a34a' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {selected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                              </div>
                            </button>
                          );
                        })}
                        {labos.map(labo => {
                          const selected = selectedLaboIds.includes(labo.id);
                          return (
                            <button
                              key={`labo-${labo.id}`}
                              onClick={() => toggleLabo(labo.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                                border: selected ? '2px solid #16a34a' : '1.5px solid var(--border)',
                                background: selected ? '#f0fdf4' : 'var(--surface)',
                                transition: 'all 0.15s',
                              }}
                            >
                              <div style={{
                                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                background: selected ? '#dcfce7' : '#f1f5f9',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                              }}>
                                🏭
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0f172a' }}>{labo.nom}</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Laboratoire</div>
                              </div>
                              <div style={{
                                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                border: selected ? 'none' : '1.5px solid #cbd5e1',
                                background: selected ? '#16a34a' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {selected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {allCount > 0 && (
                    <div style={{ marginTop: 8, fontSize: '0.78rem', color: selectedCount > 0 ? COLOR : '#94a3b8' }}>
                      {selectedCount} sélectionné{selectedCount !== 1 ? 's' : ''}
                      {selectedCount === 0 && ' — au moins 1 requis'}
                    </div>
                  )}

                  <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={() => { setCreateStep(1); setCreateError(''); }}>← Retour</button>
                    <button
                      className="btn"
                      disabled={creating || selectedCount === 0}
                      onClick={handleCreate}
                      style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff' }}
                    >
                      {creating ? 'Création…' : 'Créer l\'article'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editItem && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header" style={{ background: GRADIENT }}>
              <h2 style={{ color: '#fff', margin: 0 }}>Modifier l'article</h2>
              <button className="modal-close" onClick={closeEdit}>×</button>
            </div>
            <div className="modal-body">
              {editError && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{editError}</div>}
              <div className="form-group">
                <label>Nom *</label>
                <input className="input" autoFocus value={editForm.nom} placeholder="Ex: Poulet entier" onChange={e => setEditForm(p => ({ ...p, nom: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Unité *</label>
                <select className="input" value={editForm.uniteId} onChange={e => setEditForm(p => ({ ...p, uniteId: e.target.value }))}>
                  <option value="">— Sélectionner une unité —</option>
                  {unites.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              {categories.length > 0 && (
                <div className="form-group">
                  <label>Catégorie</label>
                  <select className="input" value={editForm.categorieId} onChange={e => setEditForm(p => ({ ...p, categorieId: e.target.value }))}>
                    <option value="">— Sans catégorie —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.familleName ? `${c.familleName} › ${c.name}` : c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={closeEdit}>Annuler</button>
                <button className="btn" disabled={saving || !editForm.nom.trim() || !editForm.uniteId} onClick={handleSave} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff' }}>
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
