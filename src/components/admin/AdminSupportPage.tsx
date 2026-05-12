import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api/client';
import type { SupportDemande } from '../../types';
import { useNotifications } from '../../context/NotificationContext';

const TYPE_INFO: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  ingredient_manquant: { label: 'Ingrédient manquant', icon: '🥕', color: '#92400e', bg: '#fef3c7' },
  supplement:          { label: 'Ajout de capacité',   icon: '➕', color: '#1e40af', bg: '#dbeafe' },
  aide:                { label: 'Besoin d\'aide',       icon: '💬', color: '#4c1d95', bg: '#ede9fe' },
};

const STATUT_INFO: Record<string, { label: string; bg: string; text: string; border: string }> = {
  en_attente: { label: 'En attente', bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  validée:    { label: 'Validée',    bg: '#dcfce7', text: '#166534', border: '#22c55e' },
  refusée:    { label: 'Refusée',    bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function DemandeDetails({ d }: { d: SupportDemande }) {
  if (d.type === 'ingredient_manquant') {
    return (
      <div style={{ fontSize: '0.82rem', color: '#374151', marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        {d.domaineNom && <span><span style={{ color: '#9ca3af' }}>Domaine :</span> {d.domaineNom}</span>}
        {d.categorieNom && <span><span style={{ color: '#9ca3af' }}>Catégorie :</span> {d.categorieNom}</span>}
        {d.uniteNom && <span><span style={{ color: '#9ca3af' }}>Unité :</span> {d.uniteNom}</span>}
        {d.nomIngredient && <span style={{ fontWeight: 700, color: '#0f172a' }}>"{d.nomIngredient}"</span>}
      </div>
    );
  }
  if (d.type === 'supplement') {
    const parts: string[] = [];
    if (d.nbActivitesSupp) parts.push(`+${d.nbActivitesSupp} activité${d.nbActivitesSupp > 1 ? 's' : ''}`);
    if (d.nbLabosSupp) parts.push(`+${d.nbLabosSupp} labo${d.nbLabosSupp > 1 ? 's' : ''}`);
    if (d.nbGerantsSupp) parts.push(`+${d.nbGerantsSupp} gérant${d.nbGerantsSupp > 1 ? 's' : ''}`);
    return <div style={{ fontSize: '0.82rem', color: '#374151', marginTop: 8, fontWeight: 600 }}>{parts.join(' · ')}</div>;
  }
  if (d.description) {
    return <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 8, fontStyle: 'italic' }}>"{d.description.slice(0, 180)}{d.description.length > 180 ? '…' : ''}"</div>;
  }
  return null;
}

const PALETTE = ['#dbeafe:#1d4ed8','#dcfce7:#166534','#fce7f3:#9d174d','#ede9fe:#6d28d9','#fff7ed:#c2410c','#e0f2fe:#075985'];
function getAvatar(nom: string, selected: boolean) {
  const initials = nom.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const p = PALETTE[(nom.charCodeAt(0) || 0) % PALETTE.length].split(':');
  return { initials, bg: selected ? '#e0e7ff' : p[0], color: selected ? '#4f46e5' : p[1] };
}

const PAGE_SIZE = 5;

export default function AdminSupportPage() {
  const { clearAllFromDB } = useNotifications();
  const [demandes, setDemandes] = useState<SupportDemande[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('en_attente');
  const [filterType, setFilterType] = useState('');
  const [page, setPage] = useState(1);

  const fetchDemandes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/abonnements/admin/support');
      setDemandes(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDemandes(); clearAllFromDB(); }, [fetchDemandes, clearAllFromDB]);

  // Reset page when client or filters change
  useEffect(() => { setPage(1); }, [selectedClientId, filterStatut, filterType]);

  const clients = useMemo(() => {
    const map = new Map<number, { id: number; nom: string; email: string; total: number; pending: number }>();
    for (const d of demandes) {
      if (!map.has(d.clientId)) map.set(d.clientId, { id: d.clientId, nom: d.clientNom || `Client #${d.clientId}`, email: d.clientEmail || '', total: 0, pending: 0 });
      const c = map.get(d.clientId)!;
      c.total++;
      if (d.statut === 'en_attente') c.pending++;
    }
    return Array.from(map.values()).sort((a, b) => b.pending - a.pending || a.nom.localeCompare(b.nom, 'fr'));
  }, [demandes]);

  const filteredClients = useMemo(() => {
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter(c => c.nom.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [clients, search]);

  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null;

  const clientDemandes = useMemo(() => {
    if (selectedClientId === null) return [];
    return demandes.filter(d => {
      if (d.clientId !== selectedClientId) return false;
      if (filterStatut && d.statut !== filterStatut) return false;
      if (filterType && d.type !== filterType) return false;
      return true;
    });
  }, [demandes, selectedClientId, filterStatut, filterType]);

  const totalPages = Math.max(1, Math.ceil(clientDemandes.length / PAGE_SIZE));
  const pagedDemandes = clientDemandes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pendingTotal = demandes.filter(d => d.statut === 'en_attente').length;

  return (
    <div style={{ display: 'flex', gap: 20, minHeight: 600 }}>
      {/* ── Left: client list ─────────────────────────────────────── */}
      <div style={{ flex: '0 0 360px', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 24px rgba(30,27,75,0.10)' }}>
        <div style={{ padding: '18px 18px 14px', background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 55%,#1e40af 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💬</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#fff' }}>Support clients</h2>
              <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{clients.length} clients · {demandes.length} demandes</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 12 }}>
            {[
              { label: 'Total', value: demandes.length, color: 'rgba(255,255,255,0.9)', bg: 'rgba(255,255,255,0.1)' },
              { label: 'En attente', value: pendingTotal, color: '#fde047', bg: 'rgba(253,224,71,0.15)' },
              { label: 'Traitées', value: demandes.length - pendingTotal, color: '#86efac', bg: 'rgba(134,239,172,0.15)' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: '7px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: s.color, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, pointerEvents: 'none' }}>🔍</span>
            <input placeholder="Rechercher un client…" value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ overflowY: 'auto', maxHeight: 520 }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Chargement...</div>
          ) : filteredClients.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#9ca3af' }}>Aucun client</div>
            </div>
          ) : filteredClients.map((c) => {
            const isSel = selectedClientId === c.id;
            const av = getAvatar(c.nom, isSel);
            return (
              <div key={c.id} onClick={() => setSelectedClientId(isSel ? null : c.id)}
                style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', borderLeft: `3px solid ${isSel ? '#1e40af' : 'transparent'}`, background: isSel ? '#eff6ff' : 'transparent' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: isSel ? '#dbeafe' : av.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: isSel ? '#1e40af' : av.color, flexShrink: 0 }}>{av.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#e0f2fe', color: '#0369a1' }}>{c.total} dem.</span>
                    {c.pending > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#fef3c7', color: '#92400e' }}>⏳ {c.pending}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: detail ─────────────────────────────────────────── */}
      <div style={{ flex: 1, background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>
        {!selectedClient ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, gap: 12 }}>
            <div style={{ fontSize: 48 }}>💬</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>Sélectionner un client</div>
            <div style={{ fontSize: 13, color: '#9ca3af' }}>Cliquez sur un client pour voir ses demandes</div>
          </div>
        ) : (
          <div style={{ padding: 24 }}>
            {/* Hero */}
            {(() => {
              const av = getAvatar(selectedClient.nom, false);
              return (
                <div style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 55%,#1e40af 100%)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 13, background: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{av.initials}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{selectedClient.nom}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{selectedClient.email}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { label: 'Demandes', value: String(selectedClient.total) },
                      { label: 'En attente', value: String(selectedClient.pending) },
                    ].map(s => (
                      <div key={s.label} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{s.value}</div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Filters */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>Statut</span>
              {([['', 'Tous'], ['en_attente', '⏳ En attente'], ['validée', '✅ Validée'], ['refusée', '❌ Refusée']] as [string, string][]).map(([v, label]) => {
                const active = filterStatut === v;
                const color = v === 'en_attente' ? '#d97706' : v === 'validée' ? '#16a34a' : v === 'refusée' ? '#dc2626' : '#64748b';
                return (
                  <button key={v} onClick={() => setFilterStatut(v)}
                    style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${active ? color : '#e2e8f0'}`, background: active ? color + '18' : '#fff', color: active ? color : '#94a3b8' }}>
                    {label}
                  </button>
                );
              })}
              <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginLeft: 8, marginRight: 2 }}>Type</span>
              {([['', 'Tous'], ['ingredient_manquant', ''], ['supplement', ''], ['aide', '']] as [string, string][]).map(([v]) => {
                const info = v ? TYPE_INFO[v] : null;
                const active = filterType === v;
                return (
                  <button key={v} onClick={() => setFilterType(v)}
                    style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${active ? (info?.color || '#64748b') : '#e2e8f0'}`, background: active ? (info?.bg || '#f1f5f9') : '#fff', color: active ? (info?.color || '#64748b') : '#94a3b8' }}>
                    {info ? `${info.icon} ${info.label}` : 'Tous'}
                  </button>
                );
              })}
              {(filterStatut || filterType) && (
                <button onClick={() => { setFilterStatut(''); setFilterType(''); }}
                  style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✕</button>
              )}
            </div>

            {/* Demande cards */}
            {clientDemandes.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Aucune demande trouvée</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pagedDemandes.map((d) => {
                    const s = STATUT_INFO[d.statut] || STATUT_INFO.en_attente;
                    const t = TYPE_INFO[d.type] || { label: d.type, icon: '📝', color: '#374151', bg: '#f3f4f6' };
                    return (
                      <div key={d.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', borderLeft: `4px solid ${s.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: t.bg, color: t.color }}>{t.icon} {t.label}</span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.text }}>{s.label}</span>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: 'auto' }}>{fmtDate(d.createdAt)}</span>
                        </div>
                        <DemandeDetails d={d} />
                        {d.notesAdmin && (
                          <div style={{ marginTop: 10, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', borderLeft: '3px solid #4338ca' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Note admin</div>
                            <div style={{ fontSize: '0.82rem', color: '#374151' }}>{d.notesAdmin}</div>
                          </div>
                        )}
                        {d.traiteLe && <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#94a3b8' }}>Traité le {fmtDate(d.traiteLe)}{d.traiteParNom ? ` par ${d.traiteParNom}` : ''}</div>}
                      </div>
                    );
                  })}
                </div>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
                    <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: page === 1 ? '#f8fafc' : '#fff', color: page === 1 ? '#cbd5e1' : '#374151', fontWeight: 600, fontSize: 12, cursor: page === 1 ? 'default' : 'pointer' }}>← Précédent</button>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Page {page} / {totalPages}</span>
                    <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: page === totalPages ? '#f8fafc' : '#fff', color: page === totalPages ? '#cbd5e1' : '#374151', fontWeight: 600, fontSize: 12, cursor: page === totalPages ? 'default' : 'pointer' }}>Suivant →</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
