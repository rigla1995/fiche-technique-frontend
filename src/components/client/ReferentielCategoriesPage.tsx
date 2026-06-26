import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Category, Famille } from '../../types';
import GuideButton from './GuideButton';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';

const COLOR = '#16a34a';
const GRADIENT = 'linear-gradient(135deg, #14532d 0%, #16a34a 55%, #4ade80 100%)';

interface CatRow { nom: string; familleId: string; }
const emptyRow = (): CatRow => ({ nom: '', familleId: '' });

export default function ReferentielCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [familles, setFamilles] = useState<Famille[]>([]);
  const [loading, setLoading] = useState(true);

  // Create — multi-row
  const [showCreate, setShowCreate] = useState(false);
  const [rows, setRows] = useState<CatRow[]>([emptyRow()]);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit — single
  const [editItem, setEditItem] = useState<Category | null>(null);
  const [editNom, setEditNom] = useState('');
  const [editFamilleId, setEditFamilleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterFamille, setFilterFamille] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/api/categories'), api.get('/api/familles')])
      .then(([catR, famR]) => { setCategories(catR.data); setFamilles(famR.data); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setRows([emptyRow()]); setCreateError(''); setShowCreate(true); };
  const closeCreate = () => setShowCreate(false);
  const updateRow = (i: number, field: keyof CatRow, val: string | boolean) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const handleCreate = async () => {
    const valid = rows.filter(r => r.nom.trim());
    if (!valid.length) { setCreateError('Au moins un nom requis'); return; }
    if (familles.length > 0 && valid.some(r => !r.familleId)) { setCreateError('Famille requise pour chaque ligne'); return; }
    setCreating(true); setCreateError('');
    try {
      await Promise.all(valid.map(r =>
        api.post('/api/categories', { nom: r.nom.trim(), familleId: r.familleId ? parseInt(r.familleId) : null })
      ));
      closeCreate(); load();
    } catch (e: unknown) {
      setCreateError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally { setCreating(false); }
  };

  const openEdit = (c: Category) => {
    setEditItem(c); setEditNom(c.name);
    setEditFamilleId(c.familleId ? String(c.familleId) : '');
    setEditError(''); setSaving(false);
  };
  const closeEdit = () => setEditItem(null);

  const handleSave = async () => {
    if (!editNom.trim()) { setEditError('Nom requis'); return; }
    if (familles.length > 0 && !editFamilleId) { setEditError('Famille requise'); return; }
    setSaving(true);
    try {
      await api.put(`/api/categories/${editItem!.id}`, {
        nom: editNom.trim(),
        familleId: editFamilleId ? parseInt(editFamilleId) : null,
      });
      closeEdit(); load();
    } catch (e: unknown) {
      setEditError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try { await api.delete(`/api/categories/${id}`); setDeleteId(null); load(); }
    catch (e: unknown) { alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Impossible de supprimer cette catégorie'); }
  };

  const filtered = categories.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterFamille && String(c.familleId) !== filterFamille) return false;
    return true;
  });

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: GRADIENT, borderRadius: 18, padding: '24px 28px', marginBottom: 24, boxShadow: '0 8px 32px rgba(22,163,74,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏷️</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Catégories</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {categories.length === 0 ? 'Organisez vos articles par catégorie au sein de chaque famille' : 'Catégories pour classer vos articles dans votre référentiel'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 80 }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{categories.length}</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>catégorie{categories.length !== 1 ? 's' : ''}</div>
          </div>
          <GuideButton section="referentiel-categories" />
        </div>
      </div>

      {/* Barre de filtres (composant partagé, mode direct) */}
      <HistoryFilterBar
        accent={COLOR} accentDark="#15803d"
        subtitle={`${filtered.length} catégorie${filtered.length !== 1 ? 's' : ''}`}
        onReset={() => { setSearch(''); setFilterFamille(''); }}
        showReset={!!(search || filterFamille)}
        actions={<button className="btn" onClick={openCreate} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', border: 'none' }}>+ Nouvelle catégorie</button>}
      >
        <FilterField label="🔍 Recherche"><FilterInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrer les catégories…" /></FilterField>
        {familles.length > 0 && (
          <FilterField label="🗂️ Famille">
            <FilterSelect value={filterFamille} onChange={e => setFilterFamille(e.target.value)}>
              <option value="">Toutes les familles</option>
              {familles.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </FilterSelect>
          </FilterField>
        )}
      </HistoryFilterBar>

      {/* List */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : categories.length === 0 ? (
        <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '2px dashed #86efac', borderRadius: 18, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 14 }}>🏷️</div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#14532d', margin: '0 0 8px' }}>Aucune catégorie définie</h3>
          <p style={{ color: '#166534', fontSize: '0.88rem', margin: '0 0 20px', maxWidth: 400, marginInline: 'auto' }}>Les catégories organisent vos articles au sein des familles.</p>
          <button onClick={openCreate} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 28px', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer' }}>+ Créer la première catégorie</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>Aucun résultat pour cette recherche.</div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Famille</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600, color: '#0f172a' }}>{c.name}</td>
                  <td>{c.familleName ? <span style={{ fontSize: '0.82rem', color: COLOR, fontWeight: 600 }}>🗂️ {c.familleName}</span> : <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>—</span>}</td>
                  <td className="actions-cell" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✏️ Modifier</button>
                    <button className="btn btn-danger btn-sm" disabled={c.hasAppros} title={c.hasAppros ? 'Cette catégorie ne peut pas être supprimée car des articles liés ont des approvisionnements enregistrés' : undefined} onClick={() => !c.hasAppros && setDeleteId(c.id)} style={c.hasAppros ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal — multi-row */}
      {showCreate && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ background: GRADIENT }}>
              <h2 style={{ color: '#fff', margin: 0 }}>Nouvelles catégories</h2>
              <button className="modal-close" onClick={closeCreate}>×</button>
            </div>
            <div className="modal-body">
              {createError && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{createError}</div>}
              <div style={{ display: 'flex', gap: 8, fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, paddingLeft: 2 }}>
                <div style={{ flex: 2 }}>Nom *</div>
                {familles.length > 0 && <div style={{ flex: 2 }}>Famille *</div>}
                <div style={{ width: 32 }} />
              </div>
              {rows.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input
                    className="input" style={{ flex: 2 }}
                    autoFocus={i === 0}
                    placeholder="Ex: Viandes"
                    value={row.nom}
                    onChange={e => updateRow(i, 'nom', e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (i === rows.length - 1) addRow(); } }}
                  />
                  {familles.length > 0 && (
                    <select className="input" style={{ flex: 2 }} value={row.familleId} onChange={e => updateRow(i, 'familleId', e.target.value)}>
                      <option value="">— Famille —</option>
                      {familles.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  )}
                  <button onClick={() => removeRow(i)} disabled={rows.length === 1} style={{ width: 32, height: 32, border: 'none', borderRadius: 6, background: rows.length === 1 ? '#f1f5f9' : '#fee2e2', color: rows.length === 1 ? '#94a3b8' : '#dc2626', cursor: rows.length === 1 ? 'not-allowed' : 'pointer', fontWeight: 700, flexShrink: 0 }}>×</button>
                </div>
              ))}
              <button onClick={addRow} style={{ background: 'none', border: '1.5px dashed #86efac', borderRadius: 8, padding: '7px 16px', color: COLOR, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', width: '100%', marginTop: 4 }}>+ Ajouter une ligne</button>
              <div className="modal-footer" style={{ marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={closeCreate}>Annuler</button>
                <button className="btn" disabled={creating} onClick={handleCreate} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff' }}>
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
                <input className="input" autoFocus value={editNom} placeholder="Ex: Viandes & Volailles" onChange={e => setEditNom(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} />
              </div>
              {familles.length > 0 && (
                <div className="form-group">
                  <label>Famille *</label>
                  <select className="input" value={editFamilleId} onChange={e => setEditFamilleId(e.target.value)}>
                    <option value="">— Sélectionner une famille —</option>
                    {familles.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={closeEdit}>Annuler</button>
                <button className="btn" disabled={saving || !editNom.trim() || (familles.length > 0 && !editFamilleId)} onClick={handleSave} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff' }}>
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
              <p style={{ color: 'var(--text-muted)', margin: '0 0 20px', fontSize: '0.9rem' }}>Les articles liés perdront leur catégorie.</p>
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
