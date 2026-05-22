import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Category, Famille } from '../../types';

const COLOR = '#16a34a';
const GRADIENT = 'linear-gradient(135deg, #14532d 0%, #16a34a 55%, #4ade80 100%)';

const LABEL: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3, display: 'block',
};

export default function ReferentielCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [familles, setFamilles] = useState<Famille[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Category | null>(null);
  const [nom, setNom] = useState('');
  const [familleId, setFamilleId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterFamille, setFilterFamille] = useState<string>('');

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/api/categories'),
      api.get('/api/familles'),
    ]).then(([catR, famR]) => {
      setCategories(catR.data);
      setFamilles(famR.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditItem(null); setNom(''); setFamilleId(''); setError(''); setShowForm(true); };
  const openEdit = (c: Category) => { setEditItem(c); setNom(c.name); setFamilleId(c.familleId ? String(c.familleId) : ''); setError(''); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditItem(null); setNom(''); setFamilleId(''); setError(''); };

  const handleSave = async () => {
    if (!nom.trim()) { setError('Nom requis'); return; }
    setSaving(true);
    try {
      const payload = { nom: nom.trim(), familleId: familleId ? parseInt(familleId) : null };
      if (editItem) {
        await api.put(`/api/categories/${editItem.id}`, payload);
      } else {
        await api.post('/api/categories', payload);
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
      await api.delete(`/api/categories/${id}`);
      setDeleteId(null);
      load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Impossible de supprimer cette catégorie');
    }
  };

  const filtered = categories.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterFamille && String(c.familleId) !== filterFamille) return false;
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
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏷️</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Catégories</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {categories.length === 0
              ? 'Organisez vos articles par catégorie au sein de chaque famille'
              : 'Catégories pour classer vos articles dans votre référentiel'}
          </p>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)',
          borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 80,
        }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{categories.length}</div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
            catégorie{categories.length !== 1 ? 's' : ''}
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
              placeholder="Filtrer les catégories…"
              style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: '#f8fafc', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        {familles.length > 0 && (
          <div style={{ minWidth: 160 }}>
            <span style={LABEL}>🗂️ Famille</span>
            <select
              value={filterFamille} onChange={e => setFilterFamille(e.target.value)}
              style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: '#f8fafc' }}
            >
              <option value="">Toutes les familles</option>
              {familles.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}
        <button className="btn btn-primary" onClick={openCreate} style={{ flexShrink: 0 }}>
          + Nouvelle catégorie
        </button>
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🏷️</span>
          <p>{categories.length === 0 ? 'Aucune catégorie définie.' : 'Aucun résultat pour cette recherche.'}</p>
          {categories.length === 0 && (
            <>
              {familles.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>Conseil : créez d'abord des familles pour organiser vos catégories.</p>}
              <button className="btn btn-primary" onClick={openCreate}>+ Créer une catégorie</button>
            </>
          )}
        </div>
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
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(c.id)}>🗑️</button>
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
              <h2>{editItem ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h2>
              <button className="modal-close" onClick={closeForm}>×</button>
            </div>
            <div className="modal-body">
              {error && <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{error}</div>}
              <div className="form-group">
                <label>Nom *</label>
                <input className="input" autoFocus value={nom} placeholder="Ex: Viandes & Volailles" onChange={e => setNom(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} />
              </div>
              {familles.length > 0 && (
                <div className="form-group">
                  <label>Famille (optionnel)</label>
                  <select className="input" value={familleId} onChange={e => setFamilleId(e.target.value)}>
                    <option value="">— Aucune famille —</option>
                    {familles.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
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
