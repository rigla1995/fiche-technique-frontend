import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { CategorieProduit, ActiviteIngredient } from '../../types';

interface Labo { id: number; nom: string; }
interface Act { id: number; nom: string; laboId?: number | null; }

interface Props {
  categories: CategorieProduit[]; // catégories de type 'valorise'
  editProductId?: number;         // si fourni → mode édition
  onClose: () => void;
  onCreated: () => void;
}

// Création / édition d'un PRODUIT VALORISÉ COMPOSÉ : produit fabriqué au labo (recette d'articles du labo),
// transféré vers les activités liées cochées (PT, pas d'appro manuel), vendu tel quel (valorisé).
export default function ComposedValoriseModal({ categories, editProductId, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [refProduit, setRefProduit] = useState('');
  const [categorieId, setCategorieId] = useState('');
  const [labos, setLabos] = useState<Labo[]>([]);
  const [activites, setActivites] = useState<Act[]>([]);
  const [selectedLabos, setSelectedLabos] = useState<number[]>([]);
  const [checkedActivites, setCheckedActivites] = useState<number[]>([]);
  const [articles, setArticles] = useState<ActiviteIngredient[]>([]);
  const [lines, setLines] = useState<{ ingredientId: string; portion: string }[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/labo').then(({ data }) => setLabos((data as Labo[]).map((l) => ({ id: l.id, nom: l.nom })))).catch(() => {});
    api.get('/api/entreprise/activites')
      .then(({ data }) => setActivites((data as Act[]).map((a) => ({ id: a.id, nom: a.nom, laboId: (a as any).laboId }))))
      .catch(() => {});
  }, []);

  // Articles consommables communs aux labos choisis.
  useEffect(() => {
    if (selectedLabos.length === 0) { setArticles([]); return; }
    api.get(`/api/labo/articles-consommables?laboIds=${selectedLabos.join(',')}`)
      .then(({ data }) => setArticles(data as ActiviteIngredient[]))
      .catch(() => setArticles([]));
  }, [selectedLabos]);

  // Mode édition : pré-remplit nom/réf/catégorie/labos/activités/recette.
  useEffect(() => {
    if (!editProductId) return;
    api.get(`/api/products/${editProductId}`).then(({ data }) => {
      const p = data as { name: string; refProduit?: string | null; categorieProduitId?: number | null; laboIds?: number[]; activiteStockIds?: number[]; ingredients?: { ingredientId: number; portion: number }[] };
      setName(p.name || '');
      setRefProduit(p.refProduit || '');
      setCategorieId(p.categorieProduitId ? String(p.categorieProduitId) : '');
      setSelectedLabos(p.laboIds || []);
      setCheckedActivites(p.activiteStockIds || []);
      setLines((p.ingredients || []).map((i) => ({ ingredientId: String(i.ingredientId), portion: String(i.portion) })));
    }).catch(() => {});
  }, [editProductId]);

  const linkedActivites = activites.filter((a) => a.laboId != null && selectedLabos.includes(Number(a.laboId)));
  const selectedIngIds = new Set(lines.map((l) => l.ingredientId));
  const toggleIng = (id: string) =>
    setLines((prev) => (selectedIngIds.has(id) ? prev.filter((l) => l.ingredientId !== id) : [...prev, { ingredientId: id, portion: '' }]));
  const setPortion = (id: string, v: string) => setLines((prev) => prev.map((l) => (l.ingredientId === id ? { ...l, portion: v } : l)));
  // Toggle d'un labo + recalcul des activités liées pré-cochées (mode création / re-toggle).
  const toggleLabo = (id: number) =>
    setSelectedLabos((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const linked = activites.filter((a) => a.laboId != null && next.includes(Number(a.laboId))).map((a) => a.id);
      setCheckedActivites(linked);
      return next;
    });

  const validLines = lines.filter((l) => l.ingredientId && parseFloat(l.portion) > 0);
  const canSave = !!name.trim() && !!categorieId && selectedLabos.length > 0 && validLines.length >= 1;

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const payload = {
        name: name.trim(),
        refProduit: refProduit.trim() || null,
        type: 'vendable',
        origine: 'labo',
        categorieProduitId: parseInt(categorieId),
        laboIds: selectedLabos,
        activiteIds: checkedActivites,
        ingredients: validLines.map((l) => ({ ingredientId: parseInt(l.ingredientId), portion: parseFloat(l.portion) })),
        subProducts: [],
      };
      if (editProductId) await api.put(`/api/products/${editProductId}`, payload);
      else await api.post('/api/products', payload);
      onCreated();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de la création.');
    } finally { setSaving(false); }
  };

  const filteredArticles = articles.filter((a) => !search || a.nom.toLowerCase().includes(search.toLowerCase()));
  const lbl: React.CSSProperties = { display: 'block', fontWeight: 700, fontSize: '0.8rem', color: '#065f46', marginBottom: 5 };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 600, width: '95vw', maxHeight: '92vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header modal-header--primary">
          <h2>💎 {editProductId ? 'Modifier le produit valorisé composé' : 'Nouveau produit valorisé composé'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
            Produit fabriqué au labo (recette d'articles du labo), transféré vers les activités liées cochées, vendu tel quel (valorisé).
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={lbl}>Nom <span style={{ color: '#ef4444' }}>*</span></label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Cookie maison" style={{ width: '100%' }} />
            </div>
            <div style={{ width: 140 }}>
              <label style={lbl}>Réf. <span style={{ fontWeight: 400, color: '#94a3b8' }}>(opt.)</span></label>
              <input className="input" value={refProduit} onChange={(e) => setRefProduit(e.target.value)} placeholder="REF-001" style={{ width: '100%' }} />
            </div>
          </div>

          <div>
            <label style={lbl}>Catégorie (valorisé) <span style={{ color: '#ef4444' }}>*</span></label>
            <select className="input" value={categorieId} onChange={(e) => setCategorieId(e.target.value)} style={{ width: '100%', maxWidth: 320, borderColor: categorieId ? '#6ee7b7' : '#fca5a5' }}>
              <option value="">— Sélectionner —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {categories.length === 0 && (
              <div style={{ fontSize: '0.76rem', color: '#b45309', marginTop: 4 }}>Aucune catégorie « valorisé ». Créez-en dans Catégories Produits.</div>
            )}
          </div>

          <div>
            <label style={lbl}>Labo(s) de fabrication <span style={{ color: '#ef4444' }}>*</span></label>
            {labos.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: '#b45309' }}>Aucun labo disponible.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {labos.map((l) => {
                  const on = selectedLabos.includes(l.id);
                  return (
                    <button type="button" key={l.id} onClick={() => toggleLabo(l.id)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${on ? '#059669' : '#e2e8f0'}`, background: on ? '#f0fdf4' : '#fff', color: on ? '#065f46' : '#374151', fontWeight: on ? 700 : 500, fontSize: '0.82rem', cursor: 'pointer' }}>
                      🏭 {l.nom}{on ? ' ✓' : ''}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedLabos.length > 0 && (
            <div>
              <label style={lbl}>Activités qui recevront le produit (transfert) — décochez pour exclure</label>
              {linkedActivites.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Aucune activité rattachée à ce(s) labo(s).</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {linkedActivites.map((a) => {
                    const on = checkedActivites.includes(a.id);
                    return (
                      <button type="button" key={a.id}
                        onClick={() => setCheckedActivites((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                        style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${on ? '#059669' : '#e2e8f0'}`, background: on ? '#f0fdf4' : '#fff', color: on ? '#065f46' : '#94a3b8', fontWeight: on ? 700 : 500, fontSize: '0.78rem', cursor: 'pointer' }}>
                        {on ? '✓ ' : ''}{a.nom}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {selectedLabos.length > 0 && (
            <div>
              <label style={lbl}>Recette — articles du labo <span style={{ color: '#ef4444' }}>*</span> <span style={{ fontWeight: 400, color: '#94a3b8' }}>({validLines.length} avec portion)</span></label>
              <input className="input" placeholder="🔍 Rechercher un article…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', marginBottom: 6, fontSize: '0.82rem' }} />
              <div style={{ maxHeight: 210, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {filteredArticles.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: '0.85rem' }}>Aucun article consommable commun aux labos choisis.</div>
                ) : filteredArticles.map((ing) => {
                  const sid = String(ing.id);
                  const sel = selectedIngIds.has(sid);
                  const line = lines.find((l) => l.ingredientId === sid);
                  const valid = sel && parseFloat(line?.portion || '0') > 0;
                  return (
                    <div key={ing.id} onClick={() => toggleIng(sid)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: sel ? (valid ? '#ecfdf5' : '#fef3c7') : 'transparent', cursor: 'pointer' }}>
                      <input type="checkbox" checked={sel} readOnly style={{ accentColor: '#059669', width: 15, height: 15, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: sel ? 600 : 400, color: sel ? '#065f46' : '#374151' }}>{ing.nom}</span>
                      {ing.categorie && <span style={{ fontSize: '0.68rem', color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '1px 6px' }}>{ing.categorie}</span>}
                      {sel && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                          <input type="number" step="0.001" min="0" placeholder="portion" value={line?.portion || ''}
                            onChange={(e) => setPortion(sid, e.target.value)}
                            style={{ width: 72, padding: '3px 6px', borderRadius: 6, border: `1.5px solid ${valid ? '#6ee7b7' : '#ef4444'}`, fontSize: '0.82rem', textAlign: 'right' }} />
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ing.unite}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '10px 14px', color: '#b91c1c', fontWeight: 700, fontSize: '0.85rem' }}>⛔ {error}</div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={!canSave || saving} onClick={save}>{saving ? 'Enregistrement…' : (editProductId ? 'Enregistrer' : 'Créer le produit valorisé')}</button>
        </div>
      </div>
    </div>
  );
}
