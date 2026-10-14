import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import HistoryFilterBar, { FilterField, FilterInput, FilterSegmented } from '../common/HistoryFilterBar';
import { useConfirm } from '../common/ConfirmDialog';

interface Prestataire {
  id: string;
  nom: string;
  logo_url?: string | null;
  actif: boolean;
  created_at: string;
}

// P2 : modes de paiement des prestataires (Espèces, Virement…) — liste tenue ici, choisie par le client à l'activation
// d'un prestataire ; un mode se renomme ou se désactive, jamais effacé (des ventes le citent).
interface ModePaiement {
  id: number;
  code: string;
  libelle: string;
  actif: boolean;
  ordre: number;
  nbPrestataires?: number;
}

const msgErreur = (e: unknown) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur';

export default function PrestatairesManagement() {
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Prestataire | null>(null);
  const [nom, setNom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState<'' | 'actif' | 'inactif'>('');
  const { confirm, alerte } = useConfirm();
  const [modes, setModes] = useState<ModePaiement[]>([]);
  const [modeForm, setModeForm] = useState<{ mode: ModePaiement | null } | null>(null);
  const [modeLibelle, setModeLibelle] = useState('');
  const [modeSaving, setModeSaving] = useState(false);
  const [modeError, setModeError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/admin/prestataires').then(({ data }) => setPrestataires(data)).catch(() => {}).finally(() => setLoading(false));
    api.get('/api/admin/modes-paiement').then(({ data }) => setModes(data as ModePaiement[])).catch(() => setModes([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setNom(''); setError(''); setShowForm(true); };
  const openEdit = (p: Prestataire) => { setEditing(p); setNom(p.nom); setError(''); setShowForm(true); };

  const handleSave = async () => {
    if (!nom.trim()) { setError('Nom requis'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await api.put(`/api/admin/prestataires/${editing.id}`, { nom });
      } else {
        await api.post('/api/admin/prestataires', { nom });
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const openMode = (mode: ModePaiement | null) => { setModeForm({ mode }); setModeLibelle(mode?.libelle ?? ''); setModeError(''); };
  const saveMode = async () => {
    if (!modeForm || !modeLibelle.trim()) { setModeError('Libellé requis'); return; }
    setModeSaving(true); setModeError('');
    try {
      if (modeForm.mode) await api.put(`/api/admin/modes-paiement/${modeForm.mode.id}`, { libelle: modeLibelle.trim() });
      else await api.post('/api/admin/modes-paiement', { libelle: modeLibelle.trim() });
      setModeForm(null);
      load();
    } catch (e: unknown) {
      setModeError(msgErreur(e));
    } finally {
      setModeSaving(false);
    }
  };
  const toggleMode = async (m: ModePaiement) => {
    try {
      await api.put(`/api/admin/modes-paiement/${m.id}`, { actif: !m.actif });
      load();
    } catch (e: unknown) {
      alerte({ title: 'Modification impossible', message: msgErreur(e), tone: 'danger' });
    }
  };

  const handleToggleActif = async (p: Prestataire) => {
    try {
      await api.put(`/api/admin/prestataires/${p.id}`, { actif: !p.actif });
      load();
    } catch {}
  };

  const handleDelete = async (p: Prestataire) => {
    const ok = await confirm({
      title: `Supprimer le prestataire « ${p.nom} » ?`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/admin/prestataires/${p.id}`);
      load();
    } catch (e: any) {
      alerte({ title: 'Suppression impossible', message: e.response?.data?.message || 'Erreur', tone: 'danger' });
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

      {/* Barre de filtres (composant partagé, variante compacte : 2 contrôles
          seulement — recherche et statut côte à côte sur une rangée) */}
      {!loading && prestataires.length > 0 && (
        <HistoryFilterBar
          accent="#6366f1" accentDark="#4f46e5"
          compact
          subtitle={`${filtered.length} prestataire${filtered.length !== 1 ? 's' : ''}`}
          onReset={() => { setSearch(''); setFilterStatut(''); }}
          showReset={!!(search || filterStatut)}
        >
          <FilterField label="🔍 Recherche">
            <FilterInput type="text" placeholder="Nom du prestataire…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </FilterField>
          <FilterField label="📊 Statut">
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
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modes de paiement des prestataires (P2) */}
      <div className="card" style={{ marginTop: 24, padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>💳 Modes de paiement des prestataires</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '2px 0 0' }}>
              Proposés au client quand il active un prestataire (commission, TVA, mode de paiement). Un mode se renomme ou se désactive, il ne s'efface pas.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => openMode(null)}>+ Nouveau mode</button>
        </div>
        {modes.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Aucun mode de paiement.</div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Libellé</th>
                  <th>Statut</th>
                  <th>Prestataires activés</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {modes.map((m) => (
                  <tr key={m.id} style={{ opacity: m.actif ? 1 : 0.6 }}>
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>{m.libelle} <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.75rem' }}>({m.code})</span></td>
                    <td>
                      <span className="badge" style={{ background: m.actif ? '#dcfce7' : '#f1f5f9', color: m.actif ? '#16a34a' : '#64748b' }}>
                        {m.actif ? '🟢 Actif' : '⭕ Inactif'}
                      </span>
                    </td>
                    <td>{m.nbPrestataires ?? 0}</td>
                    <td className="actions-cell" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openMode(m)}>✏️ Renommer</button>
                      <button className="btn btn-sm" onClick={() => toggleMode(m)}
                        style={{ border: `1px solid ${m.actif ? '#f59e0b' : '#16a34a'}`, color: m.actif ? '#92400e' : '#166534', background: 'none' }}>
                        {m.actif ? '⏸ Désactiver' : '▶ Activer'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modeForm && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>{modeForm.mode ? 'Renommer le mode de paiement' : 'Nouveau mode de paiement'}</h2>
              <button className="modal-close" onClick={() => setModeForm(null)}>×</button>
            </div>
            <div className="modal-body">
              {modeError && (
                <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>
                  ⚠️ {modeError}
                </div>
              )}
              <div className="form-group">
                <label>Libellé *</label>
                <input className="input" autoFocus value={modeLibelle} onChange={e => setModeLibelle(e.target.value)} placeholder="ex: Chèque" maxLength={60} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModeForm(null)}>Annuler</button>
                <button type="button" className="btn btn-primary" disabled={modeSaving || !modeLibelle.trim()} onClick={saveMode}>
                  {modeSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
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
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                La commission, la TVA et le mode de paiement sont saisis par chaque client à l'activation du prestataire pour une activité.
              </p>
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
