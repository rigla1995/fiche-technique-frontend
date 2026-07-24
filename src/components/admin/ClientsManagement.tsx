import { useEffect, useState } from 'react';
import api from '../../api/client';
import type { Abonnement, DomaineActivite } from '../../types';
import AddClientModal from './AddClientModal';
import Pagination from '../common/Pagination';
import { useConfirm } from '../common/ConfirmDialog';

interface Client {
  id: number;
  name: string;
  email: string;
  phone?: string;
  adresse?: string | null;
  createdAt?: string;
  activatedAt?: string | null;
  /** 'site' = converti depuis une demande d'accès du site vitrine ; 'manuel' = ajout admin. */
  origine?: 'site' | 'manuel';
  domaineIds?: number[];
}

const fmtDT = (n: number) => `${n.toLocaleString('fr-FR')} DT`;

export default function ClientsManagement() {
  const { alerte } = useConfirm();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [domaines, setDomaines] = useState<DomaineActivite[]>([]);

  const [showAddModal, setShowAddModal] = useState(false);

  // Modal domaines — liste complète, assignation/désassignation directe par l'admin
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [editDomaines, setEditDomaines] = useState<number[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Modal « Consulter » — informations de base en lecture seule
  const [viewClient, setViewClient] = useState<Client | null>(null);

  // Téléchargement du contrat (spinner par client)
  const [contractLoadingId, setContractLoadingId] = useState<number | null>(null);

  const [resendingId, setResendingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'active' | 'pending'>('');
  const [page, setPage] = useState(1);
  const PER_PAGE = 12;

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Popups
  const [configPopup, setConfigPopup] = useState<{ client: Client; data: Abonnement | null; loading: boolean } | null>(null);

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
  // Le VRAI contrat : celui signé via DocuSeal si disponible, sinon le document
  // régénéré par le backend avec la charte contractuelle (même builder que l'envoi).
  const downloadContract = async (client: Client) => {
    if (contractLoadingId !== null) return; // un téléchargement à la fois
    setContractLoadingId(client.id);
    try {
      const res = await api.get(`/api/abonnements/client/${client.id}/contrat-pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contrat-${client.name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      // 404 = vraiment aucun contrat ; autres statuts = indisponibilité passagère
      alerte({
        title: 'Contrat indisponible',
        message: status === 404
          ? "Aucun contrat n'existe pour ce client."
          : 'Le contrat est momentanément indisponible — réessayez dans un instant.',
        tone: 'danger',
      });
    } finally {
      setContractLoadingId(null);
    }
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
    } catch (err: unknown) {
      alerte({
        title: 'Suppression impossible',
        message: (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Erreur lors de la suppression du client',
        tone: 'danger',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleResendInvite = async (id: number, email: string) => {
    setResendingId(id);
    try {
      await api.post(`/auth/invite/resend/${id}`);
      await alerte({ title: 'Invitation envoyée', message: `Invitation renvoyée à ${email}`, tone: 'primary', icon: '✉️' });
    } catch { alerte({ title: 'Envoi impossible', message: "Erreur lors de l'envoi", tone: 'danger' }); }
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
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PER_PAGE)));
  const paged = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const modeLabelMap: Record<string, { label: string; bg: string; color: string }> = {
    actif:     { label: 'Actif',      bg: '#dcfce7', color: '#15803d' },
    read_only: { label: 'Lecture',    bg: '#fef3c7', color: '#92400e' },
    desactive: { label: 'Désactivé',  bg: '#fee2e2', color: '#991b1b' },
    archive:   { label: 'Archivé',    bg: '#f1f5f9', color: '#475569' },
    bloque:    { label: 'Bloqué',     bg: '#ede9fe', color: '#5b21b6' },
  };

  // Vue d'ensemble aérée + filtres clairs (search + statut segmenté avec compteurs).
  const activeCount = clients.length - totalPending;
  const statusFilters = [
    { value: '' as const,        label: 'Tous',       count: clients.length, color: '#0d9488' },
    { value: 'active' as const,  label: 'Activés',    count: activeCount,    color: '#15803d' },
    { value: 'pending' as const, label: 'En attente', count: totalPending,   color: '#b45309' },
  ];
  const avatarFor = (name: string) => {
    const initials = name?.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
    const palette = ['#dbeafe:#1d4ed8', '#dcfce7:#166534', '#fce7f3:#9d174d', '#ede9fe:#6d28d9', '#fff7ed:#c2410c', '#e0f2fe:#075985'];
    const [bg, color] = palette[(name?.charCodeAt(0) || 0) % palette.length].split(':');
    return { initials, bg, color };
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
      {/* En-tête : titre + résumé + action, épuré */}
      <div style={{
        background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 55%, #14b8a6 100%)',
        borderRadius: 18, padding: '20px 24px', marginBottom: 18,
        boxShadow: '0 8px 32px rgba(15,118,110,0.25)',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '8px 11px', fontSize: '1.3rem' }}>👥</div>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.1 }}>Clients</h1>
          <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.78)' }}>
            {clients.length} client{clients.length > 1 ? 's' : ''} · {activeCount} activé{activeCount > 1 ? 's' : ''}{totalPending > 0 ? ` · ${totalPending} en attente` : ''}
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          style={{ marginLeft: 'auto', background: '#fff', color: '#0f766e', fontWeight: 800, border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: '0.88rem', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>
          + Ajouter un client
        </button>
      </div>

      {/* Barre de filtres — recherche arrondie + pills de statut avec compteurs */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '12px 16px',
        marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        boxShadow: '0 2px 12px rgba(15,23,42,0.05)',
      }}>
        {/* Recherche */}
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none', opacity: 0.55 }}>🔍</span>
          <input
            type="text"
            placeholder="Rechercher un client — nom, email, téléphone…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 36px 10px 38px',
              borderRadius: 24, border: '1.5px solid #e2e8f0', outline: 'none',
              fontSize: '0.85rem', color: '#0f172a', background: '#f8fafc',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#0d9488'; e.currentTarget.style.background = '#fff'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setPage(1); }}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: '#e2e8f0', color: '#475569', borderRadius: '50%', width: 20, height: 20, fontSize: 11, cursor: 'pointer', lineHeight: 1 }}
            >✕</button>
          )}
        </div>

        {/* Pills de statut */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {statusFilters.map(({ value, label, count, color }) => {
            const active = filterStatus === value;
            return (
              <button
                key={value || 'tous'}
                onClick={() => { setFilterStatus(value); setPage(1); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: 22,
                  border: `1.5px solid ${active ? color : '#e5e7eb'}`,
                  background: active ? color : '#fff',
                  color: active ? '#fff' : '#475569',
                  fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {label}
                <span style={{
                  fontSize: '0.7rem', fontWeight: 800, padding: '1px 7px', borderRadius: 10,
                  background: active ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                  color: active ? '#fff' : '#64748b',
                }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Compteur de résultats */}
        <span style={{ marginLeft: 'auto', fontSize: '0.76rem', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 56, background: '#f8fafc', borderRadius: 16, border: '1px dashed #e2e8f0' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Aucun client trouvé</div>
          <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
            {clients.length === 0 ? 'Ajoutez votre premier client pour commencer.' : 'Ajustez la recherche ou les filtres.'}
          </div>
        </div>
      ) : (
        <>
          {/* Grille de cards clients */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
            {paged.map((c) => {
              const domCount = (c.domaineIds || []).length;
              const av = avatarFor(c.name);
              const active = !!c.activatedAt;
              return (
                <div key={c.id} style={{
                  background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb',
                  boxShadow: '0 2px 12px rgba(15,23,42,0.06)', overflow: 'hidden',
                  display: 'flex', flexDirection: 'column',
                  transition: 'box-shadow 0.15s, transform 0.15s',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 8px 28px rgba(15,23,42,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(15,23,42,0.06)'; e.currentTarget.style.transform = 'none'; }}
                >
                  {/* Liseré de statut */}
                  <div style={{ height: 4, background: active ? 'linear-gradient(90deg,#0d9488,#14b8a6)' : 'linear-gradient(90deg,#f59e0b,#fbbf24)' }} />

                  {/* En-tête : avatar + identité + statut */}
                  <div style={{ padding: '16px 18px 12px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 13, background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{av.initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.name}>{c.name}</div>
                      <div style={{ fontSize: '0.76rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.email}>{c.email}</div>
                      {c.origine === 'site' && (
                        <span title="Client converti depuis une demande d'accès du site vitrine"
                          style={{ display: 'inline-block', marginTop: 4, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', fontSize: '0.64rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                          🌐 Site vitrine
                        </span>
                      )}
                    </div>
                    {active ? (
                      <span style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4', fontSize: '0.68rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>● Activé</span>
                    ) : (
                      <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', fontSize: '0.68rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>⏳ En attente</span>
                    )}
                  </div>

                  {/* Infos : téléphone, domaines, date */}
                  <div style={{ padding: '0 18px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.76rem', color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '3px 9px' }}>
                      📱 {c.phone || '—'}
                    </span>
                    <button
                      onClick={() => openEdit(c)}
                      title="Gérer les domaines d'activité"
                      style={{
                        fontSize: '0.76rem', fontWeight: 600, borderRadius: 8, padding: '3px 9px',
                        background: domCount > 0 ? '#eff6ff' : '#f8fafc',
                        color: domCount > 0 ? '#1d4ed8' : '#94a3b8',
                        border: `1px solid ${domCount > 0 ? '#bfdbfe' : '#e2e8f0'}`,
                        cursor: 'pointer',
                      }}
                    >
                      🏷️ {domCount} domaine{domCount > 1 ? 's' : ''}
                    </button>
                    {c.createdAt && (
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: 'auto' }}>
                        Créé le {new Date(c.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ marginTop: 'auto', padding: '12px 14px', borderTop: '1px solid #f1f5f9', background: '#fafbfc', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => openConfig(c)}
                      style={{ flex: 1, minWidth: 86, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 8, padding: '7px 8px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      ⚙️ Config
                    </button>
                    {active && (
                      <button
                        disabled={contractLoadingId === c.id}
                        onClick={() => downloadContract(c)}
                        style={{ flex: 1, minWidth: 86, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 8, padding: '7px 8px', fontSize: '0.76rem', fontWeight: 700, cursor: contractLoadingId === c.id ? 'default' : 'pointer', opacity: contractLoadingId === c.id ? 0.6 : 1 }}
                      >
                        {contractLoadingId === c.id ? '…' : '📄 Contrat'}
                      </button>
                    )}
                    {!active && (
                      <button
                        disabled={resendingId === c.id}
                        onClick={() => handleResendInvite(c.id, c.email)}
                        style={{ flex: 1, minWidth: 86, background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', borderRadius: 8, padding: '7px 8px', fontSize: '0.76rem', fontWeight: 700, cursor: resendingId === c.id ? 'default' : 'pointer', opacity: resendingId === c.id ? 0.6 : 1 }}
                      >
                        {resendingId === c.id ? '…' : '✉️ Renvoyer'}
                      </button>
                    )}
                    <button
                      onClick={() => setViewClient(c)}
                      title="Consulter les informations du client"
                      style={{ flex: 1, minWidth: 96, background: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 8px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      👁 Consulter
                    </button>
                    <button
                      onClick={() => setDeleteTarget(c)}
                      title="Supprimer"
                      style={{ background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '7px 10px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div style={{ marginTop: 16, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <Pagination total={filtered.length} page={safePage} perPage={PER_PAGE} onChange={setPage} />
          </div>
        </>
      )}
    </div>

    {/* ── MODAL : Consulter (informations de base, lecture seule) ─────── */}
    {viewClient && (() => {
      const av = avatarFor(viewClient.name);
      const activeV = !!viewClient.activatedAt;
      const infoRow = (icon: string, label: string, value: string | null | undefined) => (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 14px', background: '#f8fafc', border: '1px solid #eef1f5', borderRadius: 10 }}>
          <span style={{ fontSize: '1rem', lineHeight: 1.4 }}>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: value ? '#0f172a' : '#cbd5e1', marginTop: 2, wordBreak: 'break-word' }}>{value || 'Non renseigné'}</div>
          </div>
        </div>
      );
      return (
        <div className="modal-overlay" onClick={() => setViewClient(null)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()} style={{ borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 55%, #14b8a6 100%)', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 13, background: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#fff', flexShrink: 0 }}>{av.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '1.02rem', fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viewClient.name}</div>
                <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
                  {activeV ? '● Compte activé' : '⏳ En attente d\'activation'}
                  {viewClient.createdAt ? ` · créé le ${new Date(viewClient.createdAt).toLocaleDateString('fr-FR')}` : ''}
                </div>
              </div>
              <button onClick={() => setViewClient(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '1rem', cursor: 'pointer', padding: '5px 9px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {infoRow('👤', 'Nom complet', viewClient.name)}
              {infoRow('📧', 'Email', viewClient.email)}
              {infoRow('📱', 'Téléphone', viewClient.phone)}
              {infoRow('📍', 'Adresse', viewClient.adresse)}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 14px', background: '#f8fafc', border: '1px solid #eef1f5', borderRadius: 10 }}>
                <span style={{ fontSize: '1rem', lineHeight: 1.4 }}>🏷️</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Domaines d'activité</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {(viewClient.domaineIds || []).length === 0 ? (
                      <span style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600 }}>Aucun domaine assigné</span>
                    ) : (viewClient.domaineIds || []).map((id) => {
                      const d = domaines.find((x) => x.id === id);
                      return (
                        <span key={id} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 16, padding: '2px 11px', fontSize: '0.76rem', fontWeight: 600 }}>
                          {d ? d.nom : `Domaine #${id}`}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 22px 18px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => { const c = viewClient; setViewClient(null); openEdit(c); }}
                style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
              >
                🏷️ Gérer les domaines
              </button>
              <button onClick={() => setViewClient(null)} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#0d9488', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      );
    })()}

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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {(() => {
                        // Base acheteurs : palier de facturation couvrant le quota (1-10 / 11-20 / 21-50 / 51-100)
                        const nAch = cfg.nbAcheteurs ?? 0;
                        const palierAch = nAch <= 0 ? 0 : nAch <= 10 ? 10 : nAch <= 20 ? 20 : nAch <= 50 ? 50 : 100;
                        return [
                          { label: 'Activités', value: String(cfg.nbActivites), icon: '🏪' },
                          { label: 'Labos', value: String(cfg.nbLabos), icon: '🔬' },
                          { label: 'Gérants', value: String(cfg.nbGerants), icon: '👤' },
                          { label: 'Base acheteurs', value: palierAch > 0 ? `≤ ${palierAch}` : '—', icon: '🤝' },
                        ];
                      })().map(({ label, value, icon }) => (
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
                  '🛒 Base acheteurs (carnet + comptes portail)',
                  '🧾 Commandes & factures acheteurs',
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

    {/* ── MODAL : Domaines d'activité (assignation/désassignation) ─────── */}
    {editClient && (
      <div className="modal-overlay">
        <div className="modal modal-sm" onClick={(e) => e.stopPropagation()} style={{ borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 55%,#3b82f6 100%)', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Domaines d'activité</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>🏷️ {editClient.name}</div>
            </div>
            <button onClick={closeEdit} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '1rem', cursor: 'pointer', padding: '5px 9px', lineHeight: 1 }}>✕</button>
          </div>
          <form onSubmit={handleEditSubmit}>
            <div style={{ padding: '18px 22px' }}>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 14px', lineHeight: 1.55 }}>
                Cochez les domaines à assigner au client — ils déterminent les ingrédients accessibles dans son référentiel.
              </p>
              {domaines.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Aucun domaine configuré dans le référentiel.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '46vh', overflowY: 'auto', paddingRight: 4 }}>
                  {domaines.map((d) => {
                    const checked = editDomaines.includes(d.id);
                    return (
                      <label
                        key={d.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                          padding: '10px 14px', borderRadius: 10,
                          border: `1.5px solid ${checked ? '#3b82f6' : '#e5e7eb'}`,
                          background: checked ? '#eff6ff' : '#fff',
                          transition: 'all 0.12s', userSelect: 'none',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setEditDomaines((prev) =>
                            checked ? prev.filter((id) => id !== d.id) : [...prev, d.id]
                          )}
                          style={{ accentColor: '#2563eb', width: 16, height: 16, flexShrink: 0 }}
                        />
                        <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: checked ? 700 : 500, color: checked ? '#1d4ed8' : '#374151' }}>{d.nom}</span>
                        {checked && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', borderRadius: 10, padding: '2px 9px' }}>assigné</span>}
                      </label>
                    );
                  })}
                </div>
              )}

              {editError && (
                <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', marginTop: 12 }}>
                  {editError}
                </div>
              )}
            </div>

            <div style={{ padding: '12px 22px 18px', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 600 }}>
                {editDomaines.length} domaine{editDomaines.length > 1 ? 's' : ''} sélectionné{editDomaines.length > 1 ? 's' : ''}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button type="button" onClick={closeEdit} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
                <button type="submit" disabled={editSaving}
                  style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: editSaving ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#3b82f6)', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: editSaving ? 'default' : 'pointer', boxShadow: editSaving ? 'none' : '0 4px 12px rgba(59,130,246,0.35)' }}>
                  {editSaving ? 'Enregistrement…' : '✓ Enregistrer'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
}

