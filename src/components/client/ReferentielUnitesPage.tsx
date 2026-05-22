import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Unit } from '../../types';

const COLOR = '#0d9488';
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
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '0 0 40px 0' }}>
      <div style={{ background: GRADIENT, color: '#fff', padding: '28px 24px 22px', borderRadius: '0 0 18px 18px', marginBottom: 24, boxShadow: '0 8px 32px rgba(13,148,136,0.22)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Unités de mesure</h2>
            <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: 14 }}>
              {units.length} unité{units.length !== 1 ? 's' : ''} dans votre référentiel
            </p>
          </div>
          <button onClick={openCreate} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: 10, padding: '9px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            + Nouvelle unité
          </button>
        </div>

        <div style={{ marginTop: 14 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une unité…"
            style={{ background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 9, padding: '8px 14px', color: '#fff', fontSize: 13, width: 220, outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', background: '#fff', borderRadius: 14, border: '1.5px dashed #e2e8f0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📏</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
              {units.length === 0 ? 'Aucune unité' : 'Aucun résultat'}
            </div>
            {units.length === 0 && (
              <>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>Exemples : kg, L, g, pièce, portion…</div>
                <button onClick={openCreate} style={{ background: COLOR, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 600, cursor: 'pointer' }}>
                  + Créer une unité
                </button>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(u => (
              <div key={u.id} style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e2e8f0', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>{u.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => openEdit(u)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Modifier</button>
                  <button onClick={() => setDeleteId(u.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 20px', color: '#1e293b', fontSize: 18 }}>{editItem ? 'Modifier l\'unité' : 'Nouvelle unité'}</h3>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Nom *</label>
            <input
              value={nom}
              onChange={e => setNom(e.target.value)}
              placeholder="Ex: kg, L, pièce, portion…"
              autoFocus
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 14, boxSizing: 'border-box', marginBottom: 14 }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />

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
            <h3 style={{ margin: '0 0 10px', color: '#1e293b' }}>Supprimer cette unité ?</h3>
            <p style={{ color: '#64748b', margin: '0 0 20px', fontSize: 14 }}>Les articles liés à cette unité perdront leur unité.</p>
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
