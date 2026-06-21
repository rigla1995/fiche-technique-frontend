import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { CategorieProduit } from '../../types';

const COLOR = '#ea580c';
const GRADIENT = 'linear-gradient(135deg, #7c2d12 0%, #ea580c 55%, #fb923c 100%)';

const apiMsg = (e: unknown, fallback = 'Erreur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

interface CatRow { nom: string; }
const emptyRow = (): CatRow => ({ nom: '' });

export default function ProductCategoriesPage() {
  const [categories, setCategories] = useState<CategorieProduit[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [rows, setRows] = useState<CatRow[]>([emptyRow()]);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [editItem, setEditItem] = useState<CategorieProduit | null>(null);
  const [editNom, setEditNom] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/api/categories-produit')
      .then(r => { setCategories(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setRows([emptyRow()]); setCreateError(''); setShowCreate(true); };
  const closeCreate = () => setShowCreate(false);
  const updateRow = (i: number, val: string) => setRows(prev => prev.map((r, idx) => idx === i ? { nom: val } : r));
  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const handleCreate = async () => {
    const valid = rows.filter(r => r.nom.trim());
    if (!valid.length) { setCreateError('Au moins un nom requis'); return; }
    setCreating(true); setCreateError('');
    try {
      await Promise.all(valid.map(r => api.post('/api/categories-produit', { nom: r.nom.trim() })));
      closeCreate(); load();
    } catch (e: unknown) {
      setCreateError(apiMsg(e, "Erreur lors de l'enregistrement"));
    } finally { setCreating(false); }
  };

  const openEdit = (c: CategorieProduit) => { setEditItem(c); setEditNom(c.name); setEditError(''); setSaving(false); };
  const closeEdit = () => setEditItem(null);

  const handleSave = async () => {
    if (!editNom.trim()) { setEditError('Nom requis'); return; }
    setSaving(true);
    try {
      await api.put(`/api/categories-produit/${editItem!.id}`, { nom: editNom.trim() });
      closeEdit(); load();
    } catch (e: unknown) {
      setEditError(apiMsg(e, "Erreur lors de l'enregistrement"));
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try { await api.delete(`/api/categories-produit/${id}`); setDeleteId(null); load(); }
    catch (e: unknown) { alert(apiMsg(e, 'Impossible de supprimer cette catégorie')); }
  };

  const filtered = categories.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: GRADIENT, borderRadius: 18, padding: '24px 28px', marginBottom: 24, boxShadow: '0 8px 32px rgba(234,88,12,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏷️</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Catégories de produit</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Classez vos produits vendables, suppléments et articles valorisés par catégorie
          </p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 80 }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{categories.length}</div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>catégorie{categories.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 18px', marginBottom: 20, border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 180 }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrer les catégories…" style={{ flex: 1, padding: '8px 11px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: '#f8fafc', boxSizing: 'border-box' }} />
        </div>
        <button className="btn" onClick={openCreate} style={{ background: 'linear-gradient(135deg,#c2410c,#ea580c)', color: '#fff', flexShrink: 0 }}>+ Nouvelle catégorie</button>
      </div>

      {/* List */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : categories.length === 0 ? (
        <div style={{ background: 'linear-gradient(135deg,#fff7ed,#ffedd5)', border: '2px dashed #fdba74', borderRadius: 18, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 14 }}>🏷️</div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#7c2d12', margin: '0 0 8px' }}>Aucune catégorie de produit</h3>
          <p style={{ color: '#9a3412', fontSize: '0.88rem', margin: '0 0 20px', maxWidth: 440, marginInline: 'auto' }}>Les catégories servent à classer vos produits vendables et suppléments (obligatoire à la création) ainsi que vos articles valorisés.</p>
          <button onClick={openCreate} style={{ background: 'linear-gradient(135deg,#c2410c,#ea580c)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 28px', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer' }}>+ Créer la première catégorie</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>Aucun résultat pour cette recherche.</div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Produits</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600, color: '#0f172a' }}>{c.name}</td>
                  <td><span style={{ fontSize: '0.82rem', color: COLOR, fontWeight: 600 }}>{c.produitsCount ?? 0} produit{(c.produitsCount ?? 0) !== 1 ? 's' : ''}</span></td>
                  <td className="actions-cell" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✏️ Modifier</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(c.id)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ background: GRADIENT }}>
              <h2 style={{ color: '#fff', margin: 0 }}>Nouvelles catégories</h2>
              <button className="modal-close" onClick={closeCreate}>×</button>
            </div>
            <div className="modal-body">
              {createError && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{createError}</div>}
              {rows.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input
                    className="input" style={{ flex: 1 }}
                    autoFocus={i === 0}
                    placeholder="Ex: Boissons"
                    value={row.nom}
                    onChange={e => updateRow(i, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (i === rows.length - 1) addRow(); } }}
                  />
                  <button onClick={() => removeRow(i)} disabled={rows.length === 1} style={{ width: 32, height: 32, border: 'none', borderRadius: 6, background: rows.length === 1 ? '#f1f5f9' : '#fee2e2', color: rows.length === 1 ? '#94a3b8' : '#dc2626', cursor: rows.length === 1 ? 'not-allowed' : 'pointer', fontWeight: 700, flexShrink: 0 }}>×</button>
                </div>
              ))}
              <button onClick={addRow} style={{ background: 'none', border: '1.5px dashed #fdba74', borderRadius: 8, padding: '7px 16px', color: COLOR, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', width: '100%', marginTop: 4 }}>+ Ajouter une ligne</button>
              <div className="modal-footer" style={{ marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={closeCreate}>Annuler</button>
                <button className="btn" disabled={creating} onClick={handleCreate} style={{ background: 'linear-gradient(135deg,#c2410c,#ea580c)', color: '#fff' }}>
                  {creating ? 'Enregistrement…' : `Enregistrer ${rows.filter(r => r.nom.trim()).length > 1 ? `(${rows.filter(r => r.nom.trim()).length})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editItem && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ background: GRADIENT }}>
              <h2 style={{ color: '#fff', margin: 0 }}>Modifier la catégorie</h2>
              <button className="modal-close" onClick={closeEdit}>×</button>
            </div>
            <div className="modal-body">
              {editError && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{editError}</div>}
              <div className="form-group">
                <label>Nom *</label>
                <input className="input" autoFocus value={editNom} placeholder="Ex: Boissons" onChange={e => setEditNom(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} />
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={closeEdit}>Annuler</button>
                <button className="btn" disabled={saving || !editNom.trim()} onClick={handleSave} style={{ background: 'linear-gradient(135deg,#c2410c,#ea580c)', color: '#fff' }}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteId !== null && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <div className="modal-body" style={{ padding: '28px 24px' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
              <h3 style={{ margin: '0 0 10px' }}>Supprimer cette catégorie ?</h3>
              <p style={{ color: 'var(--text-muted)', margin: '0 0 20px', fontSize: '0.9rem' }}>Les produits et articles valorisés liés perdront leur catégorie.</p>
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
