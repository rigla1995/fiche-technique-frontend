import { useEffect, useState } from 'react';
import api from '../../api/client';
import type { Abonnement, DomaineActivite } from '../../types';
import AddClientModal from './AddClientModal';
import { generateContractPdf } from '../../utils/contractPdf';

interface Client {
  id: number;
  name: string;
  email: string;
  phone?: string;
  compteType?: 'independant' | 'entreprise' | null;
  onboardingStep?: number;
  createdAt?: string;
  activatedAt?: string | null;
  domaineIds?: number[];
}

const fmtDT = (n: number) => `${n.toLocaleString('fr-FR')} DT`;

export default function ClientsManagement() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [domaines, setDomaines] = useState<DomaineActivite[]>([]);

  const [showAddModal, setShowAddModal] = useState(false);

  // Edit modal — domain-only
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [editDomaines, setEditDomaines] = useState<number[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [resendingId, setResendingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'active' | 'pending'>('');

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Popups
  const [configPopup, setConfigPopup] = useState<{ client: Client; data: Abonnement | null; loading: boolean } | null>(null);
  const [domainesPopup, setDomainesPopup] = useState<{ name: string; ids: number[] } | null>(null);

  const fetchClients = () => {
    setLoading(true);
    api.get('/admin/clients').then(({ data }) => setClients(data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchClients();
    api.get('/api/domaines').then(({ data }) => setDomaines(data)).catch(() => {});
  }, []);

  // ── Config popup ──────────────────────────────────────────────────────────
  const openConfig = async (client: Client) => {
    setConfigPopup({ client, data: null, loading: true });
    try {
      const { data } = await api.get(`/api/abonnements/client/${client.id}?withPricing=1`);
      setConfigPopup({ client, data, loading: false });
    } catch {
      setConfigPopup({ client, data: null, loading: false });
    }
  };

  // ── Contrat download ──────────────────────────────────────────────────────
  const downloadContract = async (client: Client) => {
    let abo: Abonnement | null = null;
    try {
      const { data } = await api.get(`/api/abonnements/client/${client.id}?withPricing=1`);
      abo = data;
    } catch { return; }
    if (!abo?.config) return;
    const base64 = generateContractPdf({
      clientNom: client.name,
      clientEmail: client.email,
      clientTel: client.phone || '',
      nbActivites: abo.config.nbActivites,
      nbLabos: abo.config.nbLabos,
      nbGerants: abo.config.nbGerants,
      montantOnboarding: abo.config.montantOnboarding,
      totalMensuel: abo.pricing?.effectifMensuel ?? abo.pricing?.baseMensuel ?? 0,
      promos: [],
      appName: 'Fiche Technique',
    });
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${base64}`;
    link.download = `contrat-${client.name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
    link.click();
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const openEdit = (c: Client) => {
    setEditClient(c);
    setEditDomaines(c.domaineIds || []);
    setEditError(null);
  };
  const closeEdit = () => { setEditClient(null); setEditError(null); };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editClient) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await api.put(`/admin/clients/${editClient.id}`, { domaineIds: editDomaines });
      closeEdit();
      fetchClients();
    } catch (err: unknown) {
      setEditError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur');
    } finally {
      setEditSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/clients/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchClients();
    } finally {
      setDeleting(false);
    }
  };

  const handleResendInvite = async (id: number, email: string) => {
    setResendingId(id);
    try {
      await api.post(`/auth/invite/resend/${id}`);
      alert(`Invitation renvoyée à ${email}`);
    } catch { alert("Erreur lors de l'envoi"); }
    finally { setResendingId(null); }
  };

  const totalPending = clients.filter((c) => !c.activatedAt).length;

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q);
    const matchStatus =
      filterStatus === '' ||
      (filterStatus === 'active' && !!c.activatedAt) ||
      (filterStatus === 'pending' && !c.activatedAt);
    return matchSearch && matchStatus;
  });

  const modeLabelMap: Record<string, { label: string; bg: string; color: string }> = {
    actif:     { label: 'Actif',      bg: '#dcfce7', color: '#15803d' },
    read_only: { label: 'Lecture',    bg: '#fef3c7', color: '#92400e' },
    desactive: { label: 'Désactivé',  bg: '#fee2e2', color: '#991b1b' },
    archive:   { label: 'Archivé',    bg: '#f1f5f9', color: '#475569' },
    bloque:    { label: 'Bloqué',     bg: '#ede9fe', color: '#5b21b6' },
  };

  return (
    <>
    {showAddModal && (
      <AddClientModal
        onClose={() => setShowAddModal(false)}
        onCreated={() => { fetchClients(); setShowAddModal(false); }}
      />
    )}

    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #18181b 0%, #27272a 55%, #52525b 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(39,39,42,0.28)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>👥</div>
        <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Clients</h1>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowAddModal(true)}>+ Ajouter</button>
      </div>

      {/* KPI bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total', value: clients.length, icon: '👥', bg: '#eff6ff', color: '#1d4ed8' },
          { label: 'En attente', value: totalPending, icon: '⏳', bg: totalPending > 0 ? '#fee2e2' : '#f8fafc', color: totalPending > 0 ? '#991b1b' : '#64748b' },
        ].map(({ label, value, icon, bg, color }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${color}22`, borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color }}>{icon} {value}</div>
            <div style={{ fontSize: '0.78rem', color, opacity: 0.8 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter row */}
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', marginBottom: 20,
        border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#27272a', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🔍 Recherche</label>
          <input
            type="text"
            placeholder="Nom, email, téléphone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid #27272a', fontSize: '0.88rem', background: '#f4f4f5', minWidth: 160 }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>📊 Statut</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { value: '' as const, label: 'Tous' },
              { value: 'active' as const, label: '✅ Activés' },
              { value: 'pending' as const, label: '⏳ En attente' },
            ]).map(({ value, label }) => (
              <button
                key={value}
                className={`btn btn-sm ${filterStatus === value ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterStatus(value)}
              >
                {label}
                {value === 'pending' && totalPending > 0 && (
                  <span style={{ background: '#dc2626', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: '0.65rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
                    {totalPending}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th>Téléphone</th>
                <th>Domaines</th>
                <th>Configuration</th>
                <th>Contrat</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const domCount = (c.domaineIds || []).length;
                return (
                  <tr key={c.id} style={!c.activatedAt ? { background: '#fffbeb' } : {}}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{c.email}</td>
                    <td style={{ fontSize: '0.85rem' }}>{c.phone || '—'}</td>

                    {/* Domaines — count badge */}
                    <td>
                      {domCount === 0 ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        <button
                          onClick={() => setDomainesPopup({ name: c.name, ids: c.domaineIds || [] })}
                          style={{
                            background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe',
                            borderRadius: 20, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700,
                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          🏷️ {domCount} domaine{domCount > 1 ? 's' : ''}
                        </button>
                      )}
                    </td>

                    {/* Configuration */}
                    <td>
                      <button
                        onClick={() => openConfig(c)}
                        style={{
                          background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
                          borderRadius: 7, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 700,
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        ⚙️ Config
                      </button>
                    </td>

                    {/* Contrat */}
                    <td>
                      {c.activatedAt ? (
                        <button
                          onClick={() => downloadContract(c)}
                          style={{
                            background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                            borderRadius: 7, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 700,
                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                          }}
                        >
                          📄 PDF
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>

                    {/* Statut */}
                    <td>
                      {c.activatedAt ? (
                        <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>✅ Activé</span>
                      ) : (
                        <span style={{ background: '#fee2e2', color: '#991b1b', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>⏳ En attente</span>
                      )}
                    </td>

                    <td className="actions-cell">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✏️ Modifier</button>
                      {!c.activatedAt && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: '#4338ca', borderColor: '#4338ca' }}
                          disabled={resendingId === c.id}
                          onClick={() => handleResendInvite(c.id, c.email)}
                        >
                          {resendingId === c.id ? '…' : '✉️ Renvoyer'}
                        </button>
                      )}
                      {c.compteType !== 'independant' && (c.onboardingStep ?? 0) > 0 && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--warning, #b45309)', borderColor: 'var(--warning, #b45309)' }}
                          onClick={async () => {
                            if (!window.confirm(`Réinitialiser l'onboarding de ${c.name} ?`)) return;
                            await api.put(`/admin/clients/${c.id}`, { onboardingStep: 0 });
                            setClients((prev) => prev.map((x) => x.id === c.id ? { ...x, onboardingStep: 0 } : x));
                          }}
                        >
                          🔓 Reset
                        </button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(c)}>🗑️</button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="empty-cell">Aucun résultat</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {/* ── POPUP : Domaines ─────────────────────────────────────────────── */}
    {domainesPopup && (
      <div className="modal-overlay" onClick={() => setDomainesPopup(null)}>
        <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header modal-header--info">
            <h2>🏷️ Domaines — {domainesPopup.name}</h2>
            <button className="modal-close" onClick={() => setDomainesPopup(null)}>×</button>
          </div>
          <div className="modal-body">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {domainesPopup.ids.map((id) => {
                const d = domaines.find((x) => x.id === id);
                return (
                  <span key={id} style={{ background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 20, padding: '4px 14px', fontSize: '0.85rem', fontWeight: 600 }}>
                    {d ? d.nom : `Domaine #${id}`}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── POPUP : Configuration ────────────────────────────────────────── */}
    {configPopup && (
      <div className="modal-overlay" onClick={() => setConfigPopup(null)}>
        <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header" style={{ background: 'linear-gradient(135deg,#1e1b4b,#4338ca)', borderBottom: 'none' }}>
            <h2 style={{ color: '#fff' }}>⚙️ Configuration — {configPopup.client.name}</h2>
            <button className="modal-close" style={{ color: '#fff' }} onClick={() => setConfigPopup(null)}>×</button>
          </div>
          <div className="modal-body">
            {configPopup.loading ? (
              <div className="loading-text">Chargement…</div>
            ) : !configPopup.data?.config ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>
                ℹ️ Aucune configuration enregistrée
              </div>
            ) : (() => {
              const cfg = configPopup.data.config;
              const pricing = configPopup.data.pricing;
              const abo = configPopup.data;
              const modeInfo = modeLabelMap[abo.modeCompte] || { label: abo.modeCompte, bg: '#f1f5f9', color: '#475569' };
              return (
                <>
                  {/* Mode */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '10px 14px', background: modeInfo.bg, borderRadius: 8 }}>
                    <span style={{ fontWeight: 700, color: modeInfo.color }}>Mode compte</span>
                    <span style={{ fontWeight: 800, color: modeInfo.color }}>{modeInfo.label}</span>
                  </div>

                  {/* Config de base */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Configuration souscrite</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {[
                        { label: 'Activités', value: cfg.nbActivites, icon: '🏪' },
                        { label: 'Labos', value: cfg.nbLabos, icon: '🔬' },
                        { label: 'Gérants', value: cfg.nbGerants, icon: '👤' },
                      ].map(({ label, value, icon }) => (
                        <div key={label} style={{ textAlign: 'center', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 8px' }}>
                          <div style={{ fontSize: '1.5rem', marginBottom: 2 }}>{icon}</div>
                          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{value}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pricing breakdown */}
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Tarification</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ color: '#374151' }}>Mensualité de base</span>
                        <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{fmtDT(pricing?.baseMensuel ?? 0)}</span>
                      </div>
                      {pricing?.activePromoMensuel && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                          <span style={{ color: '#16a34a' }}>🏷️ Promo active</span>
                          <span style={{ fontWeight: 700, color: '#16a34a' }}>{fmtDT(pricing.effectifMensuel ?? 0)}</span>
                        </div>
                      )}
                      <div style={{ borderTop: '1px solid #bfdbfe', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 700, color: '#1e40af' }}>Mensualité effective</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e40af' }}>{fmtDT(pricing?.effectifMensuel ?? pricing?.baseMensuel ?? 0)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', paddingTop: 4, borderTop: '1px solid #bfdbfe' }}>
                        <span style={{ color: '#374151' }}>Onboarding (one-time)</span>
                        <span style={{ fontWeight: 700, color: '#0369a1' }}>{fmtDT(cfg.montantOnboarding)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Date début */}
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    Début abonnement : <strong>{new Date(abo.dateDebut).toLocaleDateString('fr-FR')}</strong>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    )}

    {/* ── MODAL : Confirmation suppression ───────────────────────────── */}
    {deleteTarget && (
      <div className="modal-overlay">
        <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
          <div style={{ background: 'linear-gradient(135deg,#7f1d1d,#dc2626)', padding: '18px 22px', borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 800, color: '#fff', fontSize: 15 }}>Suppression irréversible</div>
                <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 1 }}>{deleteTarget.name}</div>
              </div>
            </div>
            <button onClick={() => setDeleteTarget(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
          <div style={{ padding: '18px 22px' }}>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 14 }}>
              La suppression de <strong>{deleteTarget.name}</strong> entraînera la suppression définitive et irréversible de toutes les données associées :
            </p>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px', marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Données supprimées</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px' }}>
                {[
                  '🏪 Activités',
                  '🔬 Labos',
                  '👤 Gérants',
                  '📦 Inventaires',
                  '🚚 Approvisionnements',
                  '📉 Pertes',
                  '🔄 Transferts',
                  '📋 Abonnements',
                  '🏷️ Promotions',
                  '📊 Tout l\'historique',
                ].map((item) => (
                  <div key={item} style={{ fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: deleting ? '#fca5a5' : '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: deleting ? 'default' : 'pointer', boxShadow: '0 4px 12px rgba(220,38,38,0.35)' }}
              >
                {deleting ? 'Suppression…' : '🗑️ Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── MODAL : Modifier client ──────────────────────────────────────── */}
    {editClient && (
      <div className="modal-overlay">
        <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header modal-header--primary">
            <h2>✏️ Modifier — {editClient.name}</h2>
            <button className="modal-close" onClick={closeEdit}>×</button>
          </div>
          <form onSubmit={handleEditSubmit} className="modal-body">
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              Vous pouvez ajouter ou retirer des domaines d'activité. Les autres champs sont gérés via l'espace Abonnements.
            </p>

            <div className="form-group">
              <label style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>
                Domaines d'activité
              </label>
              {domaines.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Aucun domaine configuré dans le référentiel.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {domaines.map((d) => {
                    const checked = editDomaines.includes(d.id);
                    return (
                      <label
                        key={d.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                          padding: '6px 14px', borderRadius: 20, fontSize: '0.84rem', fontWeight: 600,
                          border: `1.5px solid ${checked ? '#4338ca' : 'var(--border)'}`,
                          background: checked ? '#eef2ff' : '#f8fafc',
                          color: checked ? '#4338ca' : 'var(--text-muted)',
                          userSelect: 'none', transition: 'all 0.12s',
                        }}
                      >
                        <input
                          type="checkbox"
                          style={{ display: 'none' }}
                          checked={checked}
                          onChange={() => setEditDomaines((prev) =>
                            checked ? prev.filter((id) => id !== d.id) : [...prev, d.id]
                          )}
                        />
                        {checked ? '✓ ' : ''}{d.nom}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {editError && (
              <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', fontSize: '0.85rem', marginTop: 8 }}>
                {editError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn btn-ghost" onClick={closeEdit}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={editSaving}>
                {editSaving ? 'Enregistrement…' : '✓ Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
}

