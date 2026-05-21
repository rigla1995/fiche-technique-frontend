import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Category, Famille } from '../../types';

const COLOR = '#6366f1';
const GRADIENT = 'linear-gradient(135deg, #3730a3 0%, #6366f1 55%, #818cf8 100%)';

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
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/api/categories/${id}`);
      setDeleteId(null);
      load();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Impossible de supprimer cette catégorie');
    }
  };

  const filtered = filterFamille
    ? categories.filter(c => String(c.familleId) === filterFamille)
    : categories;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '0 0 40px 0' }}>
      <div style={{ background: GRADIENT, color: '#fff', padding: '28px 24px 22px', borderRadius: '0 0 18px 18px', marginBottom: 24, boxShadow: `0 8px 32px rgba(99,102,241,0.22)` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Catégories</h2>
            <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: 14 }}>
              {categories.length} catégorie{categories.length !== 1 ? 's' : ''} dans votre référentiel
            </p>
          </div>
          <button onClick={openCreate} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: 10, padding: '9px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            + Nouvelle catégorie
          </button>
        </div>

        {familles.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              onClick={() => setFilterFamille('')}
              style={{ background: !filterFamille ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 20, padding: '5px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >Toutes</button>
            {familles.map(f => (
              <button
                key={f.id}
                onClick={() => setFilterFamille(String(f.id))}
                style={{ background: filterFamille === String(f.id) ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 20, padding: '5px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >{f.name}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', background: '#fff', borderRadius: 14, border: '1.5px dashed #e2e8f0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏷️</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Aucune catégorie</div>
            {familles.length === 0 && <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>Conseil : créez d'abord des familles pour organiser vos catégories.</div>}
            <button onClick={openCreate} style={{ background: COLOR, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 600, cursor: 'pointer' }}>
              + Créer une catégorie
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(c => (
              <div key={c.id} style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e2e8f0', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>{c.name}</div>
                  {c.familleName && <div style={{ fontSize: 12, color: '#6366f1', marginTop: 2, fontWeight: 600 }}>🗂️ {c.familleName}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => openEdit(c)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Modifier</button>
                  <button onClick={() => setDeleteId(c.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 20px', color: '#1e293b', fontSize: 18 }}>{editItem ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h3>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Nom *</label>
            <input
              value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex: Viandes & Volailles"
              autoFocus
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 14, boxSizing: 'border-box', marginBottom: 14 }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />

            {familles.length > 0 && (
              <>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Famille (optionnel)</label>
                <select
                  value={familleId} onChange={e => setFamilleId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 14, boxSizing: 'border-box', marginBottom: 14 }}
                >
                  <option value="">— Aucune famille —</option>
                  {familles.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </>
            )}

            {error && <p style={{ color: '#dc2626', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={closeForm} style={{ flex: 1, background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 9, padding: '10px', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, background: COLOR, color: '#fff', border: 'none', borderRadius: 9, padding: '10px', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 380, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ margin: '0 0 10px', color: '#1e293b' }}>Supprimer cette catégorie ?</h3>
            <p style={{ color: '#64748b', margin: '0 0 20px', fontSize: 14 }}>Les articles liés perdront leur catégorie.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 9, padding: '10px', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => handleDelete(deleteId)} style={{ flex: 1, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 9, padding: '10px', fontWeight: 600, cursor: 'pointer' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
