import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Unit } from '../../types';
import GuideButton from './GuideButton';
import HistoryFilterBar, { FilterField, FilterInput } from '../common/HistoryFilterBar';
import { useConfirm } from '../common/ConfirmDialog';

const COLOR = '#16a34a';
const GRADIENT = 'linear-gradient(135deg, #14532d 0%, #16a34a 55%, #4ade80 100%)';

export default function ReferentielUnitesPage() {
  const { alerte } = useConfirm();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // Create — multi-row
  const [showCreate, setShowCreate] = useState(false);
  const [rows, setRows] = useState<string[]>(['']);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit — single
  const [editItem, setEditItem] = useState<Unit | null>(null);
  const [editNom, setEditNom] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/api/unites').then(({ data }) => setUnits(data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setRows(['']); setCreateError(''); setShowCreate(true); };
  const closeCreate = () => setShowCreate(false);
  const updateRow = (i: number, val: string) => setRows(prev => prev.map((r, idx) => idx === i ? val : r));
  const addRow = () => setRows(prev => [...prev, '']);
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const handleCreate = async () => {
    const valid = rows.map(r => r.trim()).filter(Boolean);
    if (!valid.length) { setCreateError('Au moins un nom requis'); return; }
    setCreating(true); setCreateError('');
    try {
      await Promise.all(valid.map(name => api.post('/api/unites', { name })));
      closeCreate(); load();
    } catch (e: unknown) {
      setCreateError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally { setCreating(false); }
  };

  const openEdit = (u: Unit) => { setEditItem(u); setEditNom(u.name); setEditError(''); setSaving(false); };
  const closeEdit = () => setEditItem(null);

  const handleSave = async () => {
    if (!editNom.trim()) { setEditError('Nom requis'); return; }
    setSaving(true);
    try { await api.put(`/api/unites/${editItem!.id}`, { name: editNom.trim() }); closeEdit(); load(); }
    catch (e: unknown) { setEditError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try { await api.delete(`/api/unites/${id}`); setDeleteId(null); load(); }
    catch (e: unknown) { alerte({ title: 'Suppression impossible', message: (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Impossible de supprimer cette unité', tone: 'danger' }); }
  };

  const filtered = search ? units.filter(u => u.name.toLowerCase().includes(search.toLowerCase())) : units;

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: GRADIENT, borderRadius: 18, padding: '24px 28px', marginBottom: 24, boxShadow: '0 8px 32px rgba(22,163,74,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📏</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Unités de mesure</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {units.length === 0 ? 'Définissez vos unités de mesure : kg, L, g, pièce, portion…' : 'Unités utilisées pour quantifier vos articles et stocks'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 80 }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{units.length}</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>unité{units.length !== 1 ? 's' : ''}</div>
          </div>
          <GuideButton section="referentiel-unites" />
        </div>
      </div>

      {/* Barre de filtres (composant partagé, mode direct) */}
      <HistoryFilterBar
        accent={COLOR} accentDark="#15803d"
        subtitle={`${filtered.length} unité${filtered.length !== 1 ? 's' : ''}`}
        onReset={() => setSearch('')}
        showReset={!!search}
        actions={<button className="btn" onClick={openCreate} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', border: 'none' }}>+ Nouvelle unité</button>}
      >
        <FilterField label="🔍 Recherche"><FilterInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrer les unités…" /></FilterField>
      </HistoryFilterBar>

      {/* List */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : units.length === 0 ? (
        <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '2px dashed #86efac', borderRadius: 18, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 14 }}>📏</div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#14532d', margin: '0 0 8px' }}>Aucune unité définie</h3>
          <p style={{ color: '#166534', fontSize: '0.88rem', margin: '0 0 24px', maxWidth: 380, marginInline: 'auto' }}>Les unités de mesure définissent la quantité de vos articles : kg, L, g, pièce, portion…</p>
          <button onClick={openCreate} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 28px', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer' }}>+ Créer la première unité</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>Aucun résultat pour cette recherche.</div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead><tr><th>Nom</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{u.name}</span>
                    </div>
                  </td>
                  <td className="actions-cell" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>✏️ Modifier</button>
                    <button className="btn btn-danger btn-sm" disabled={u.hasAppros} title={u.hasAppros ? 'Cette unité ne peut pas être supprimée car des articles l\'utilisent et ont des approvisionnements enregistrés' : undefined} onClick={() => !u.hasAppros && setDeleteId(u.id)} style={u.hasAppros ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>🗑️</button>
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
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ background: GRADIENT }}>
              <h2 style={{ color: '#fff', margin: 0 }}>Nouvelles unités</h2>
              <button className="modal-close" onClick={closeCreate}>×</button>
            </div>
            <div className="modal-body">
              {createError && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{createError}</div>}
              <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', margin: '0 0 10px' }}>Ajoutez plusieurs unités en même temps.</p>
              {rows.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    className="input" style={{ flex: 1 }}
                    autoFocus={i === 0}
                    placeholder="Ex: kg, L, pièce…"
                    value={row}
                    onChange={e => updateRow(i, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (i === rows.length - 1) addRow(); } }}
                  />
                  <button onClick={() => removeRow(i)} disabled={rows.length === 1} style={{ width: 32, height: 38, border: 'none', borderRadius: 6, background: rows.length === 1 ? '#f1f5f9' : '#fee2e2', color: rows.length === 1 ? '#94a3b8' : '#dc2626', cursor: rows.length === 1 ? 'not-allowed' : 'pointer', fontWeight: 700, flexShrink: 0 }}>×</button>
                </div>
              ))}
              <button onClick={addRow} style={{ background: 'none', border: `1.5px dashed ${COLOR}`, borderRadius: 8, padding: '7px 16px', color: COLOR, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', width: '100%', marginTop: 4 }}>+ Ajouter une ligne</button>
              <div className="modal-footer" style={{ marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={closeCreate}>Annuler</button>
                <button className="btn" disabled={creating} onClick={handleCreate} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff' }}>
                  {creating ? 'Enregistrement…' : `Enregistrer ${rows.filter(r => r.trim()).length > 1 ? `(${rows.filter(r => r.trim()).length})` : ''}`}
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
              <h2 style={{ color: '#fff', margin: 0 }}>Modifier l'unité</h2>
              <button className="modal-close" onClick={closeEdit}>×</button>
            </div>
            <div className="modal-body">
              {editError && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{editError}</div>}
              <div className="form-group">
                <label>Nom *</label>
                <input className="input" autoFocus value={editNom} placeholder="Ex: kg, L, pièce, portion…" onChange={e => setEditNom(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} />
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={closeEdit}>Annuler</button>
                <button className="btn" disabled={saving || !editNom.trim()} onClick={handleSave} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff' }}>
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
              <h3 style={{ margin: '0 0 10px' }}>Supprimer cette unité ?</h3>
              <p style={{ color: 'var(--text-muted)', margin: '0 0 20px', fontSize: '0.9rem' }}>Les articles liés perdront leur unité.</p>
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
