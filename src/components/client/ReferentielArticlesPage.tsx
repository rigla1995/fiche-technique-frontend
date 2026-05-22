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
  prix: string;
  seuilMin: string;
  uniteId: string;
  categorieId: string;
}

const emptyEditForm: ArticleEditForm = { nom: '', prix: '', seuilMin: '', uniteId: '', categorieId: '' };

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

  const toggleActivite = (id: number) => {
    setSelectedActiviteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleLabo = (id: number) => {
    setSelectedLaboIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCreate = async () => {
    const totalSelected = selectedActiviteIds.length + selectedLaboIds.length;
    if (totalSelected === 0) { setCreateError('Sélectionnez au moins une activité ou un labo'); return; }
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
      prix: a.price !== null && a.price !== undefined ? String(a.price) : '',
      seuilMin: a.seuilMin !== null && a.seuilMin !== undefined ? String(a.seuilMin) : '',
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
        prix: editForm.prix !== '' ? parseFloat(editForm.prix) : null,
        seuilMin: editForm.seuilMin !== '' ? parseFloat(editForm.seuilMin) : null,
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

      {/* ── Create Wizard ── */}
      {showCreate && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            {/* Header */}
            <div className="modal-header" style={{ background: GRADIENT }}>
              <div>
                <h2 style={{ color: '#fff', margin: 0 }}>Nouvel article</h2>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {[1, 2].map(s => (
                    <div key={s} style={{
                      height: 4, width: 36, borderRadius: 4,
                      background: s <= createStep ? '#fff' : 'rgba(255,255,255,0.3)',
                      transition: 'background 0.2s',
                    }} />
                  ))}
                  <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.72rem', marginLeft: 6, alignSelf: 'center' }}>
                    Étape {createStep}/2
                  </span>
                </div>
              </div>
              <button className="modal-close" onClick={closeCreate}>×</button>
            </div>

            <div className="modal-body">
              {createError && (
                <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>
                  {createError}
                </div>
              )}

              {createStep === 1 ? (
                <>
                  <div style={{ marginBottom: 6, color: '#64748b', fontSize: '0.82rem' }}>
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
                  <div style={{ marginBottom: 14, color: '#64748b', fontSize: '0.82rem' }}>
                    Affectez cet article à au moins une activité ou un labo.
                  </div>

                  {activites.length === 0 && labos.length === 0 ? (
                    <div style={{ padding: '16px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #86efac', fontSize: '0.85rem', color: '#166534', textAlign: 'center' }}>
                      Aucune activité ou labo trouvé. Créez-en depuis « Mes Activités ».
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
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
                              background: selected ? '#16a34a' : '#e2e8f0',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                            }}>
                              📍
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0f172a' }}>{act.nom}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Activité</div>
                            </div>
                            <div style={{
                              width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                              border: selected ? 'none' : '1.5px solid #cbd5e1',
                              background: selected ? '#16a34a' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {selected && <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>✓</span>}
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
                              background: selected ? '#16a34a' : '#e2e8f0',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                            }}>
                              🏭
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0f172a' }}>{labo.nom}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Laboratoire</div>
                            </div>
                            <div style={{
                              width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                              border: selected ? 'none' : '1.5px solid #cbd5e1',
                              background: selected ? '#16a34a' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {selected && <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>✓</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {(activites.length > 0 || labos.length > 0) && (
                    <div style={{ marginTop: 8, fontSize: '0.78rem', color: selectedActiviteIds.length + selectedLaboIds.length > 0 ? COLOR : '#94a3b8' }}>
                      {selectedActiviteIds.length + selectedLaboIds.length} sélectionné{selectedActiviteIds.length + selectedLaboIds.length !== 1 ? 's' : ''}
                      {selectedActiviteIds.length + selectedLaboIds.length === 0 && ' — au moins 1 requis'}
                    </div>
                  )}

                  <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={() => { setCreateStep(1); setCreateError(''); }}>← Retour</button>
                    <button
                      className="btn"
                      disabled={creating || selectedActiviteIds.length + selectedLaboIds.length === 0}
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
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
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
                <label>Prix (DT)</label>
                <input className="input" type="number" value={editForm.prix} placeholder="0.000" onChange={e => setEditForm(p => ({ ...p, prix: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Seuil minimum</label>
                <input className="input" type="number" value={editForm.seuilMin} placeholder="Quantité minimale en stock" onChange={e => setEditForm(p => ({ ...p, seuilMin: e.target.value }))} />
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
