import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import type { Activite } from '../../types';

const apiMsg = (e: unknown, fallback = 'Erreur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const fmtMoney = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DT';

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';

interface ArticleVendable {
  id: string;
  activite_id: number;
  article_type: 'produit' | 'ingredient';
  article_id: number;
  prix_vente: number;
  portion: number | null;
  actif: boolean;
  nom: string;
  unite_nom?: string | null;
}

interface IngredientStock {
  ingredientId: number;
  nom: string;
  unite: string;
}

export default function CatalogueVentePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const [articles, setArticles] = useState<ArticleVendable[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrix, setEditPrix] = useState('');
  const [editPortion, setEditPortion] = useState('');
  const [editError, setEditError] = useState('');

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [allIngredients, setAllIngredients] = useState<IngredientStock[]>([]);
  const [newIngredientId, setNewIngredientId] = useState('');
  const [newPrix, setNewPrix] = useState('');
  const [newPortion, setNewPortion] = useState('');
  const [addError, setAddError] = useState('');

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => {
      const acts: Activite[] = (data as Activite[]).filter(a => !a.laboId);
      setActivites(acts);
      const paramId = searchParams.get('activiteId');
      const found = acts.find(a => String(a.id) === paramId);
      setSelectedActiviteId(found ? found.id : acts[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const loadArticles = useCallback(() => {
    if (!selectedActiviteId) return;
    setLoading(true);
    api.get(`/api/articles-vendables?activiteId=${selectedActiviteId}`)
      .then(({ data }) => setArticles((data as ArticleVendable[]).filter(a => a.article_type === 'ingredient')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedActiviteId]);

  useEffect(() => { loadArticles(); }, [loadArticles]);

  useEffect(() => {
    if (!showAdd || !selectedActiviteId) return;
    api.get(`/api/stock/entreprise/${selectedActiviteId}`)
      .then(({ data }) => setAllIngredients(data as IngredientStock[]))
      .catch(() => {});
  }, [showAdd, selectedActiviteId]);

  const handleEdit = (a: ArticleVendable) => {
    setEditingId(a.id);
    setEditPrix(String(a.prix_vente));
    setEditPortion(a.portion != null ? String(a.portion) : '');
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true); setEditError('');
    try {
      await api.put(`/api/articles-vendables/${editingId}`, {
        prix_vente: parseFloat(editPrix),
        portion: editPortion ? parseFloat(editPortion) : null,
      });
      setEditingId(null);
      loadArticles();
    } catch (e: unknown) {
      setEditError(apiMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActif = async (a: ArticleVendable) => {
    try {
      await api.put(`/api/articles-vendables/${a.id}`, { actif: !a.actif });
      loadArticles();
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Retirer cet ingrédient du catalogue vendable ?')) return;
    try {
      await api.delete(`/api/articles-vendables/${id}`);
      loadArticles();
    } catch {}
  };

  const handleAdd = async () => {
    if (!selectedActiviteId || !newIngredientId || !newPrix) return;
    setSaving(true); setAddError('');
    try {
      await api.post('/api/articles-vendables', {
        activite_id: selectedActiviteId,
        article_type: 'ingredient',
        article_id: parseInt(newIngredientId),
        prix_vente: parseFloat(newPrix),
        portion: newPortion ? parseFloat(newPortion) : null,
      });
      setShowAdd(false);
      setNewIngredientId(''); setNewPrix(''); setNewPortion('');
      loadArticles();
    } catch (e: unknown) {
      setAddError(apiMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const alreadyInCatalogue = new Set(articles.map(a => a.article_id));
  const availableIngredients = allIngredients.filter(i => !alreadyInCatalogue.has(i.ingredientId));

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #d97706 100%)`,
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(180,83,9,0.28)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🧾</div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Catalogue Vente</h1>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
          Ingrédients vendables par activité — prix de vente et portion par unité
        </p>
      </div>

      {/* Activité selector */}
      {activites.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)', padding: '10px 14px' }}>
          {activites.map(a => (
            <button key={a.id} onClick={() => { setSelectedActiviteId(a.id); setSearchParams({ activiteId: String(a.id) }); }}
              style={{
                padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                border: selectedActiviteId === a.id ? `1.5px solid ${C}` : '1.5px solid var(--border)',
                background: selectedActiviteId === a.id ? C : 'var(--bg)',
                color: selectedActiviteId === a.id ? '#fff' : 'var(--text)',
                fontWeight: selectedActiviteId === a.id ? 700 : 400,
              }}>
              {a.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner l'activité</span>
        </div>
      )}

      {!selectedActiviteId ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>Aucune activité disponible</div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => { setShowAdd(true); setAddError(''); }}
              style={{
                background: `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`,
                color: '#fff', border: 'none', borderRadius: 9, padding: '9px 20px',
                cursor: 'pointer', fontWeight: 700, boxShadow: '0 4px 14px rgba(180,83,9,0.35)',
              }}>
              + Ajouter un ingrédient
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
          ) : articles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🧾</div>
              Aucun ingrédient dans le catalogue vendable
            </div>
          ) : (
            <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: `1.5px solid ${CB}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: CL, borderBottom: `1.5px solid ${CB}` }}>
                    {['Ingrédient', 'Unité', 'Prix vente', 'Portion', 'Statut', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 700, color: C }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {articles.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border)', opacity: a.actif ? 1 : 0.55 }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{a.nom}</td>
                      <td style={{ padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{a.unite_nom || '—'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: C }}>{fmtMoney(a.prix_vente)}</td>
                      <td style={{ padding: '10px 14px', fontSize: '0.9rem' }}>
                        {a.portion != null ? <span style={{ fontWeight: 600 }}>{a.portion}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 12, fontSize: '0.78rem',
                          background: a.actif ? '#dcfce7' : '#f3f4f6',
                          color: a.actif ? '#166534' : '#6b7280',
                        }}>
                          {a.actif ? '✓ Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => handleEdit(a)}
                            style={{ background: CL, border: `1px solid ${CB}`, color: CD, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                            Modifier
                          </button>
                          <button onClick={() => handleToggleActif(a)}
                            style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.78rem' }}>
                            {a.actif ? 'Désactiver' : 'Activer'}
                          </button>
                          <button onClick={() => handleDelete(a.id)}
                            style={{ background: 'none', border: '1px solid #dc2626', color: '#dc2626', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.78rem' }}>
                            Retirer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal édition */}
      {editingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: C, marginBottom: 20 }}>Modifier l'article</h2>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Prix de vente (DT)</label>
              <input type="number" min="0" step="0.01" value={editPrix} onChange={e => setEditPrix(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Portion par unité de vente <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optionnel)</span>
              </label>
              <input type="number" min="0" step="0.001" value={editPortion} onChange={e => setEditPortion(e.target.value)}
                placeholder="ex: 0.250"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL }} />
            </div>
            {editError && <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 10 }}>{editError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingId(null)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleSaveEdit} disabled={saving || !editPrix}
                style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, color: '#fff', cursor: 'pointer', fontWeight: 700, opacity: saving || !editPrix ? 0.6 : 1 }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ajout */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: C, marginBottom: 20 }}>Ajouter un ingrédient vendable</h2>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Ingrédient</label>
              <select value={newIngredientId} onChange={e => setNewIngredientId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL }}>
                <option value="">-- Sélectionner --</option>
                {availableIngredients.map(i => (
                  <option key={i.ingredientId} value={i.ingredientId}>{i.nom}{i.unite ? ` (${i.unite})` : ''}</option>
                ))}
              </select>
              {availableIngredients.length === 0 && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>Tous les ingrédients sont déjà dans le catalogue.</p>
              )}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Prix de vente (DT)</label>
              <input type="number" min="0" step="0.01" value={newPrix} onChange={e => setNewPrix(e.target.value)}
                placeholder="0.00"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Portion par unité de vente <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optionnel)</span>
              </label>
              <input type="number" min="0" step="0.001" value={newPortion} onChange={e => setNewPortion(e.target.value)}
                placeholder="ex: 0.250"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL }} />
            </div>
            {addError && <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 10 }}>{addError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleAdd} disabled={saving || !newIngredientId || !newPrix}
                style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, color: '#fff', cursor: 'pointer', fontWeight: 700, opacity: saving || !newIngredientId || !newPrix ? 0.6 : 1 }}>
                {saving ? 'Enregistrement…' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
