import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Famille } from '../../types';
import GuideButton from './GuideButton';

const COLOR = '#16a34a';
const GRADIENT = 'linear-gradient(135deg, #14532d 0%, #16a34a 55%, #4ade80 100%)';

const LABEL: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3, display: 'block',
};

interface FamRow { nom: string; consommable: boolean; vendable: boolean; }
const emptyRow = (): FamRow => ({ nom: '', consommable: true, vendable: true });

export default function ReferentielFamillesPage() {
  const [familles, setFamilles] = useState<Famille[]>([]);
  const [loading, setLoading] = useState(true);

  // Create — multi-row
  const [showCreate, setShowCreate] = useState(false);
  const [rows, setRows] = useState<FamRow[]>([emptyRow()]);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit — single
  const [editItem, setEditItem] = useState<Famille | null>(null);
  const [editNom, setEditNom] = useState('');
  const [editConsommable, setEditConsommable] = useState(true);
  const [editVendable, setEditVendable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/api/familles').then(r => { setFamilles(r.data); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setRows([emptyRow()]); setCreateError(''); setShowCreate(true); };
  const closeCreate = () => setShowCreate(false);
  const updateRow = (i: number, field: keyof FamRow, val: string | boolean) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const handleCreate = async () => {
    const valid = rows.filter(r => r.nom.trim());
    if (!valid.length) { setCreateError('Au moins un nom requis'); return; }
    setCreating(true); setCreateError('');
    try {
      await Promise.all(valid.map(r => api.post('/api/familles', { nom: r.nom.trim(), consommable: r.consommable, vendable: r.vendable })));
      closeCreate(); load();
    } catch (e: unknown) {
      setCreateError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally { setCreating(false); }
  };

  const openEdit = (f: Famille) => { setEditItem(f); setEditNom(f.name); setEditConsommable(f.consommable); setEditVendable(f.vendable !== false); setEditError(''); setSaving(false); };
  const closeEdit = () => setEditItem(null);

  const handleSave = async () => {
    if (!editNom.trim()) { setEditError('Nom requis'); return; }
    setSaving(true);
    try { await api.put(`/api/familles/${editItem!.id}`, { nom: editNom.trim(), consommable: editConsommable, vendable: editVendable }); closeEdit(); load(); }
    catch (e: unknown) { setEditError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur'); }
    finally { setSaving(false); }
  };

  const toggleConsommable = async (f: Famille) => {
    try {
      await api.put(`/api/familles/${f.id}`, { nom: f.name, consommable: !f.consommable, vendable: f.vendable });
      setFamilles(prev => prev.map(x => x.id === f.id ? { ...x, consommable: !f.consommable } : x));
    } catch { load(); }
  };

  const toggleVendable = async (f: Famille) => {
    try {
      await api.put(`/api/familles/${f.id}`, { nom: f.name, consommable: f.consommable, vendable: !f.vendable });
      setFamilles(prev => prev.map(x => x.id === f.id ? { ...x, vendable: !f.vendable } : x));
    } catch { load(); }
  };

  const handleDelete = async (id: number) => {
    try { await api.delete(`/api/familles/${id}`); setDeleteId(null); load(); }
    catch (e: unknown) { alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Impossible de supprimer cette famille'); }
  };

  const filtered = search ? familles.filter(f => f.name.toLowerCase().includes(search.toLowerCase())) : familles;

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: GRADIENT, borderRadius: 18, padding: '24px 28px', marginBottom: 24, boxShadow: '0 8px 32px rgba(22,163,74,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🗂️</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Familles</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {familles.length === 0 ? 'Groupez vos catégories par famille : Viandes, Épicerie, Boissons…' : 'Familles pour organiser vos catégories et articles'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 80 }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{familles.length}</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>famille{familles.length !== 1 ? 's' : ''}</div>
          </div>
          <GuideButton section="referentiel-familles" />
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 18px', marginBottom: 20, border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 180 }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🔍</span>
          <div style={{ flex: 1 }}>
            <span style={LABEL}>Recherche</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrer les familles…" style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: '#f8fafc', boxSizing: 'border-box' }} />
          </div>
        </div>
        <button className="btn" onClick={openCreate} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', flexShrink: 0 }}>+ Nouvelle famille</button>
      </div>

      {/* List */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : familles.length === 0 ? (
        <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '2px dashed #86efac', borderRadius: 18, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 14 }}>🗂️</div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#14532d', margin: '0 0 8px' }}>Aucune famille définie</h3>
          <p style={{ color: '#166534', fontSize: '0.88rem', margin: '0 0 24px', maxWidth: 380, marginInline: 'auto' }}>Les familles regroupent vos catégories d'articles : Viandes, Épicerie, Boissons…</p>
          <button onClick={openCreate} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 28px', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer' }}>+ Créer la première famille</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>Aucun résultat pour cette recherche.</div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead><tr><th>Nom</th><th style={{ textAlign: 'center' }}>Consommable</th><th style={{ textAlign: 'center' }}>Vendable</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${COLOR}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🗂️</div>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{f.name}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => toggleConsommable(f)} title={f.consommable ? 'Cliquer pour désactiver' : 'Cliquer pour activer'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}>
                      <div style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0, background: f.consommable ? '#059669' : '#cbd5e1', transition: 'background 0.2s' }}>
                        <div style={{ position: 'absolute', top: 2, left: f.consommable ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.2s' }} />
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: f.consommable ? '#065f46' : '#64748b' }}>{f.consommable ? 'Oui' : 'Non'}</span>
                    </button>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => toggleVendable(f)} title={f.vendable !== false ? 'Cliquer pour désactiver' : 'Cliquer pour activer'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}>
                      <div style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0, background: f.vendable !== false ? '#059669' : '#cbd5e1', transition: 'background 0.2s' }}>
                        <div style={{ position: 'absolute', top: 2, left: f.vendable !== false ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.2s' }} />
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: f.vendable !== false ? '#065f46' : '#64748b' }}>{f.vendable !== false ? 'Oui' : 'Non'}</span>
                    </button>
                  </td>
                  <td className="actions-cell" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(f)}>✏️ Modifier</button>
                    <button className="btn btn-danger btn-sm" disabled={f.hasAppros} title={f.hasAppros ? 'Cette famille ne peut pas être supprimée car des articles liés ont des approvisionnements enregistrés' : undefined} onClick={() => !f.hasAppros && setDeleteId(f.id)} style={f.hasAppros ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>🗑️</button>
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
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ background: GRADIENT }}>
              <h2 style={{ color: '#fff', margin: 0 }}>Nouvelles familles</h2>
              <button className="modal-close" onClick={closeCreate}>×</button>
            </div>
            <div className="modal-body">
              {createError && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{createError}</div>}
              <div style={{ display: 'flex', gap: 8, fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, paddingLeft: 2 }}>
                <div style={{ flex: 1 }}>Nom *</div>
                <div style={{ width: 100 }}>Consommable</div>
                <div style={{ width: 100 }}>Vendable</div>
                <div style={{ width: 32 }} />
              </div>
              {rows.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input
                    className="input" style={{ flex: 1 }}
                    autoFocus={i === 0}
                    placeholder="Ex: Produits laitiers"
                    value={row.nom}
                    onChange={e => updateRow(i, 'nom', e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (i === rows.length - 1) addRow(); } }}
                  />
                  <div style={{ width: 100, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button type="button" onClick={() => updateRow(i, 'consommable', !row.consommable)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <div style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', background: row.consommable ? '#059669' : '#cbd5e1', transition: 'background 0.2s' }}>
                        <div style={{ position: 'absolute', top: 2, left: row.consommable ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.2s' }} />
                      </div>
                    </button>
                    <span style={{ fontSize: '0.78rem', color: row.consommable ? '#065f46' : '#64748b', fontWeight: 600 }}>{row.consommable ? 'Oui' : 'Non'}</span>
                  </div>
                  <div style={{ width: 100, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button type="button" onClick={() => updateRow(i, 'vendable', !row.vendable)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <div style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', background: row.vendable ? '#059669' : '#cbd5e1', transition: 'background 0.2s' }}>
                        <div style={{ position: 'absolute', top: 2, left: row.vendable ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.2s' }} />
                      </div>
                    </button>
                    <span style={{ fontSize: '0.78rem', color: row.vendable ? '#065f46' : '#64748b', fontWeight: 600 }}>{row.vendable ? 'Oui' : 'Non'}</span>
                  </div>
                  <button onClick={() => removeRow(i)} disabled={rows.length === 1} style={{ width: 32, height: 38, border: 'none', borderRadius: 6, background: rows.length === 1 ? '#f1f5f9' : '#fee2e2', color: rows.length === 1 ? '#94a3b8' : '#dc2626', cursor: rows.length === 1 ? 'not-allowed' : 'pointer', fontWeight: 700, flexShrink: 0 }}>×</button>
                </div>
              ))}
              <button onClick={addRow} style={{ background: 'none', border: `1.5px dashed ${COLOR}`, borderRadius: 8, padding: '7px 16px', color: COLOR, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', width: '100%', marginTop: 4 }}>+ Ajouter une ligne</button>
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
              <h2 style={{ color: '#fff', margin: 0 }}>Modifier la famille</h2>
              <button className="modal-close" onClick={closeEdit}>×</button>
            </div>
            <div className="modal-body">
              {editError && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{editError}</div>}
              <div className="form-group">
                <label>Nom *</label>
                <input className="input" autoFocus value={editNom} placeholder="Ex: Produits laitiers" onChange={e => setEditNom(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                  <button type="button" onClick={() => setEditConsommable(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <div style={{ width: 40, height: 22, borderRadius: 11, position: 'relative', background: editConsommable ? '#059669' : '#cbd5e1', transition: 'background 0.2s' }}>
                      <div style={{ position: 'absolute', top: 3, left: editConsommable ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.2s' }} />
                    </div>
                  </button>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: editConsommable ? '#065f46' : '#64748b' }}>Consommable {editConsommable ? '(activé)' : '(désactivé)'}</span>
                </label>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                  <button type="button" onClick={() => setEditVendable(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <div style={{ width: 40, height: 22, borderRadius: 11, position: 'relative', background: editVendable ? '#059669' : '#cbd5e1', transition: 'background 0.2s' }}>
                      <div style={{ position: 'absolute', top: 3, left: editVendable ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.2s' }} />
                    </div>
                  </button>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: editVendable ? '#065f46' : '#64748b' }}>Vendable {editVendable ? '(activé)' : '(désactivé)'}</span>
                </label>
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
              <h3 style={{ margin: '0 0 10px' }}>Supprimer cette famille ?</h3>
              <p style={{ color: 'var(--text-muted)', margin: '0 0 20px', fontSize: '0.9rem' }}>Les catégories liées perdront leur famille.</p>
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
