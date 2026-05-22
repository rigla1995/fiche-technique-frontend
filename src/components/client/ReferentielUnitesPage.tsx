import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Unit } from '../../types';

const GRADIENT = 'linear-gradient(135deg, #0f766e 0%, #0d9488 55%, #14b8a6 100%)';

export default function ReferentielUnitesPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Unit | null>(null);
  const [nom, setNom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/api/unites').then(({ data }) => setUnits(data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditItem(null); setNom(''); setError(''); setShowForm(true); };
  const openEdit = (u: Unit) => { setEditItem(u); setNom(u.name); setError(''); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditItem(null); setNom(''); setError(''); };

  const handleSave = async () => {
    if (!nom.trim()) { setError('Nom requis'); return; }
    setSaving(true);
    try {
      if (editItem) {
        await api.put(`/api/unites/${editItem.id}`, { name: nom.trim() });
      } else {
        await api.post('/api/unites', { name: nom.trim() });
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
      await api.delete(`/api/unites/${id}`);
      setDeleteId(null);
      load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Impossible de supprimer cette unité');
    }
  };

  const filtered = search
    ? units.filter(u => u.name.toLowerCase().includes(search.toLowerCase()))
    : units;

  return (
    <div className="page">
      {/* ── Hero ── */}
      <div style={{
        background: GRADIENT, borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(13,148,136,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📏</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Unités de mesure</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: 0 }}>
            {units.length} unité{units.length !== 1 ? 's' : ''} dans votre référentiel
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.35)', borderRadius: 10, padding: '9px 20px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}
        >
          + Nouvelle unité
        </button>
      </div>

      {/* ── Filter ── */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 18px', marginBottom: 20, border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une unité…"
          style={{ width: '100%', padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: '#f8fafc', boxSizing: 'border-box' }}
        />
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📏</span>
          <p>{units.length === 0 ? 'Aucune unité définie.' : 'Aucun résultat pour cette recherche.'}</p>
          {units.length === 0 && (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>Exemples : kg, L, g, pièce, portion…</p>
              <button className="btn btn-primary" onClick={openCreate}>+ Créer la première unité</button>
            </>
          )}
        </div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
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
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(u.id)}>🗑️</button>
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
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>{editItem ? 'Modifier l\'unité' : 'Nouvelle unité'}</h2>
              <button className="modal-close" onClick={closeForm}>×</button>
            </div>
            <div className="modal-body">
              {error && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{error}</div>}
              <div className="form-group">
                <label>Nom *</label>
                <input
                  className="input"
                  autoFocus
                  value={nom}
                  placeholder="Ex: kg, L, pièce, portion…"
                  onChange={e => setNom(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={closeForm}>Annuler</button>
                <button className="btn btn-primary" disabled={saving || !nom.trim()} onClick={handleSave}>
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
