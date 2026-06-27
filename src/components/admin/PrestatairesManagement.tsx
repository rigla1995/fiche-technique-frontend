import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import HistoryFilterBar, { FilterField, FilterInput, FilterSegmented } from '../common/HistoryFilterBar';

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
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState<'' | 'actif' | 'inactif'>('');

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

  const activeCount = prestataires.filter((p) => p.actif).length;
  const statusFilters = [
    { value: '', label: 'Tous', count: prestataires.length },
    { value: 'actif', label: 'Actifs', count: activeCount, color: '#16a34a' },
    { value: 'inactif', label: 'Inactifs', count: prestataires.length - activeCount, color: '#64748b' },
  ];
  const filtered = prestataires.filter((p) =>
    (!search || p.nom.toLowerCase().includes(search.toLowerCase())) &&
    (filterStatut === '' || (filterStatut === 'actif' ? p.actif : !p.actif))
  );

  return (
    <div className="page">
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0369a1 0%, #6366f1 55%, #a855f7 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(39,39,42,0.28)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🚚</div>
        <div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Prestataires de livraison</h1>
          <p style={{ color: 'rgba(255,255,255,0.70)', fontSize: '0.85rem', margin: '2px 0 0' }}>
            Gérez les plateformes de livraison disponibles pour les clients
          </p>
        </div>
        <button className="btn btn-primary" style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff' }} onClick={openNew}>
          + Nouveau prestataire
        </button>
      </div>

      {/* Barre de filtres (composant partagé) */}
      {!loading && prestataires.length > 0 && (
        <HistoryFilterBar
          accent="#6366f1" accentDark="#4f46e5"
          subtitle={`${filtered.length} prestataire${filtered.length !== 1 ? 's' : ''}`}
          onReset={() => { setSearch(''); setFilterStatut(''); }}
          showReset={!!(search || filterStatut)}
        >
          <FilterField label="🔍 Recherche">
            <FilterInput type="text" placeholder="Nom du prestataire…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </FilterField>
          <FilterField label="📊 Statut" span>
            <FilterSegmented options={statusFilters} value={filterStatut} onChange={(v) => setFilterStatut(v as '' | 'actif' | 'inactif')} accent="#6366f1" />
          </FilterField>
        </HistoryFilterBar>
      )}

      {/* Table */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : prestataires.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🚚</span>
          <p>Aucun prestataire de livraison.</p>
          <button className="btn btn-primary" onClick={openNew}>Créer le premier prestataire</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>Aucun prestataire pour ces filtres.</div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Statut</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} style={{ opacity: p.actif ? 1 : 0.6 }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.actif ? '#10b981' : '#94a3b8', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{p.nom}</span>
                    </div>
                  </td>
                  <td>
                    <span className="badge" style={{
                      background: p.actif ? '#dcfce7' : '#f1f5f9',
                      color: p.actif ? '#16a34a' : '#64748b',
                    }}>
                      {p.actif ? '🟢 Actif' : '⭕ Inactif'}
                    </span>
                  </td>
                  <td className="actions-cell" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>✏️ Modifier</button>
                    <button
                      className="btn btn-sm"
                      style={{ border: `1px solid ${p.actif ? '#f59e0b' : '#16a34a'}`, color: p.actif ? '#92400e' : '#166534', background: 'none' }}
                      onClick={() => handleToggleActif(p)}
                    >
                      {p.actif ? '⏸ Désactiver' : '▶ Activer'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>{editing ? 'Modifier le prestataire' : 'Nouveau prestataire'}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="modal-body">
              {error && (
                <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>
                  ⚠️ {error}
                </div>
              )}
              <div className="form-group">
                <label>Nom *</label>
                <input
                  className="input"
                  autoFocus
                  value={nom}
                  onChange={e => setNom(e.target.value)}
                  placeholder="ex: Uber Eats"
                />
              </div>
              <div className="form-group">
                <label>Commission (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className="input"
                  value={commission}
                  onChange={e => setCommission(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Annuler</button>
                <button type="button" className="btn btn-primary" disabled={saving || !nom.trim()} onClick={handleSave}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
