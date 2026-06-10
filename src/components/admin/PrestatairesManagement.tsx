import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';

interface Prestataire {
  id: string;
  nom: string;
  logo_url?: string | null;
  commission_pct: number;
  actif: boolean;
  created_at: string;
}

export default function PrestatairesManagement() {
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Prestataire | null>(null);
  const [nom, setNom] = useState('');
  const [commission, setCommission] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/admin/prestataires').then(({ data }) => setPrestataires(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setNom(''); setCommission(''); setError(''); setShowForm(true); };
  const openEdit = (p: Prestataire) => { setEditing(p); setNom(p.nom); setCommission(String(p.commission_pct)); setError(''); setShowForm(true); };

  const handleSave = async () => {
    if (!nom.trim()) { setError('Nom requis'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await api.put(`/api/admin/prestataires/${editing.id}`, { nom, commission_pct: parseFloat(commission) || 0 });
      } else {
        await api.post('/api/admin/prestataires', { nom, commission_pct: parseFloat(commission) || 0 });
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActif = async (p: Prestataire) => {
    try {
      await api.put(`/api/admin/prestataires/${p.id}`, { actif: !p.actif });
      load();
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce prestataire ?')) return;
    try {
      await api.delete(`/api/admin/prestataires/${id}`);
      load();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur');
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 2 }}>Prestataires de livraison</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Gérez les plateformes de livraison disponibles pour les clients
          </p>
        </div>
        <button
          onClick={openNew}
          style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}
        >
          + Nouveau prestataire
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
      ) : prestataires.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Aucun prestataire</div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {['Nom', 'Statut', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prestataires.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', opacity: p.actif ? 1 : 0.55 }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>{p.nom}</td>

                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 12, fontSize: '0.78rem',
                      background: p.actif ? '#dcfce7' : '#f1f5f9',
                      color: p.actif ? '#166534' : '#64748b',
                    }}>
                      {p.actif ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(p)}
                      style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
                      Modifier
                    </button>
                    <button onClick={() => handleToggleActif(p)}
                      style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${p.actif ? '#f59e0b' : '#16a34a'}`, color: p.actif ? '#92400e' : '#166534', background: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
                      {p.actif ? 'Désactiver' : 'Activer'}
                    </button>
                    <button onClick={() => handleDelete(p.id)}
                      style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #dc2626', color: '#dc2626', background: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal form */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 20 }}>
              {editing ? 'Modifier le prestataire' : 'Nouveau prestataire'}
            </h2>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Nom</label>
              <input value={nom} onChange={e => setNom(e.target.value)} placeholder="ex: Uber Eats"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Commission (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={commission} onChange={e => setCommission(e.target.value)} placeholder="0"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }} />
            </div>

            {error && <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
