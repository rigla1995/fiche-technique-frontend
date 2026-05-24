import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Famille } from '../../types';

const COLOR = '#16a34a';
const GRADIENT = 'linear-gradient(135deg, #14532d 0%, #16a34a 55%, #4ade80 100%)';

const LABEL: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3, display: 'block',
};

export default function ReferentielFamillesPage() {
  const [familles, setFamilles] = useState<Famille[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Famille | null>(null);
  const [nom, setNom] = useState('');
  const [consommable, setConsommable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/api/familles').then(r => { setFamilles(r.data); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditItem(null); setNom(''); setConsommable(true); setError(''); setShowForm(true); };
  const openEdit = (f: Famille) => { setEditItem(f); setNom(f.name); setConsommable(f.consommable); setError(''); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditItem(null); setNom(''); setConsommable(true); setError(''); };

  const handleSave = async () => {
    if (!nom.trim()) { setError('Nom requis'); return; }
    setSaving(true);
    try {
      if (editItem) {
        await api.put(`/api/familles/${editItem.id}`, { nom: nom.trim(), consommable });
      } else {
        await api.post('/api/familles', { nom: nom.trim(), consommable });
      }
      closeForm();
      load();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const toggleConsommable = async (f: Famille) => {
    try {
      await api.put(`/api/familles/${f.id}`, { nom: f.name, consommable: !f.consommable });
      setFamilles(prev => prev.map(x => x.id === f.id ? { ...x, consommable: !f.consommable } : x));
    } catch {
      // silent — reload to sync
      load();
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/familles/${id}`);
      setDeleteId(null);
      load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Impossible de supprimer cette famille');
    }
  };

  const filtered = search
    ? familles.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : familles;

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
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🗂️</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Familles</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {familles.length === 0
              ? 'Groupez vos catégories par famille : Viandes, Épicerie, Boissons…'
              : 'Familles pour organiser vos catégories et articles'}
          </p>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)',
          borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 80,
        }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{familles.length}</div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
            famille{familles.length !== 1 ? 's' : ''}
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
              placeholder="Filtrer les familles…"
              style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: '#f8fafc', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <button className="btn" onClick={openCreate} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', flexShrink: 0 }}>
          + Nouvelle famille
        </button>
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : familles.length === 0 ? (
        <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '2px dashed #86efac', borderRadius: 18, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 14 }}>🗂️</div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#14532d', margin: '0 0 8px' }}>Aucune famille définie</h3>
          <p style={{ color: '#166534', fontSize: '0.88rem', margin: '0 0 24px', maxWidth: 380, marginInline: 'auto' }}>
            Les familles regroupent vos catégories d'articles : Viandes, Épicerie, Boissons… (optionnel mais recommandé)
          </p>
          <button onClick={openCreate} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 28px', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer' }}>
            + Créer la première famille
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
                <th>Nom</th>
                <th style={{ textAlign: 'center' }}>Consommable</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
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
                    <button
                      onClick={() => toggleConsommable(f)}
                      title={f.consommable ? 'Consommable — cliquer pour désactiver' : 'Non consommable — cliquer pour activer'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 8,
                      }}
                    >
                      <div style={{
                        width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0,
                        background: f.consommable ? '#059669' : '#cbd5e1', transition: 'background 0.2s',
                      }}>
                        <div style={{
                          position: 'absolute', top: 2, left: f.consommable ? 18 : 2,
                          width: 16, height: 16, borderRadius: '50%', background: '#fff',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.2s',
                        }} />
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: f.consommable ? '#065f46' : '#64748b' }}>
                        {f.consommable ? 'Oui' : 'Non'}
                      </span>
                    </button>
                  </td>
                  <td className="actions-cell" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(f)}>✏️ Modifier</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(f.id)}>🗑️</button>
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
            <div className="modal-header" style={{ background: GRADIENT }}>
              <h2 style={{ color: '#fff', margin: 0 }}>{editItem ? 'Modifier la famille' : 'Nouvelle famille'}</h2>
              <button className="modal-close" onClick={closeForm}>×</button>
            </div>
            <div className="modal-body">
              {error && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{error}</div>}
              <div className="form-group">
                <label>Nom *</label>
                <input
                  className="input" autoFocus value={nom}
                  placeholder="Ex: Produits laitiers"
                  onChange={e => setNom(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                  <button type="button" onClick={() => setConsommable(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <div style={{ width: 40, height: 22, borderRadius: 11, position: 'relative', background: consommable ? '#059669' : '#cbd5e1', transition: 'background 0.2s' }}>
                      <div style={{ position: 'absolute', top: 3, left: consommable ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.2s' }} />
                    </div>
                  </button>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: consommable ? '#065f46' : '#64748b' }}>
                    Consommable {consommable ? '(activé)' : '(désactivé)'}
                  </span>
                </label>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
                  Si désactivé, les articles de cette famille n'apparaîtront pas dans les wizards de création/modification de produits.
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={closeForm}>Annuler</button>
                <button className="btn" disabled={saving || !nom.trim()} onClick={handleSave} style={{ background: 'linear-gradient(135deg,#15803d,#16a34a)', color: '#fff' }}>
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
