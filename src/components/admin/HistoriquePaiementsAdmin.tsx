import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api/client';
import { FilterInput, FilterSegmented } from '../common/HistoryFilterBar';
import { useConfirm } from '../common/ConfirmDialog';

const STATUT_COLORS: Record<string, string> = {
  payé:       '#16a34a',
  impayé:     '#dc2626',
  en_attente: '#d97706',
  remisé:     '#7c3aed',
  gratuit:    '#16a34a',
};
const STATUT_LABELS: Record<string, string> = {
  payé:       'Payé',
  impayé:     'Impayé',
  en_attente: 'En attente',
  remisé:     'Remisé',
  gratuit:    'Gratuit',
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const fmtMois = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—';

interface PaiementRow {
  id: number;
  mois: string;
  montantDt: number | null;
  statut: string;
  dateSaisie: string | null;
  notes: string | null;
  clientId: number;
  clientNom: string;
  clientEmail: string;
}

const PALETTE = ['#dbeafe:#1d4ed8','#dcfce7:#166534','#fce7f3:#9d174d','#ede9fe:#6d28d9','#fff7ed:#c2410c','#e0f2fe:#075985'];
function getAvatar(nom: string, selected: boolean) {
  const initials = nom.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const p = PALETTE[(nom.charCodeAt(0) || 0) % PALETTE.length].split(':');
  return { initials, bg: selected ? '#e0e7ff' : p[0], color: selected ? '#4f46e5' : p[1] };
}

export default function HistoriquePaiementsAdmin() {
  const { alerte } = useConfirm();
  const [rows, setRows] = useState<PaiementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filtStatut, setFiltStatut] = useState('');
  const [filtMois, setFiltMois] = useState('');
  const [page, setPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const downloadFacture = useCallback(async (id: number) => {
    setDownloadingId(id);
    try {
      const res = await api.get(`/api/abonnements/paiements/${id}/facture`, { responseType: 'blob' });
      const cd = res.headers['content-disposition'] || '';
      const m = cd.match(/filename="?([^"]+)"?/);
      const filename = m ? m[1] : `facture-${id}.pdf`;
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alerte({ title: 'Facture indisponible', message: 'Facture indisponible pour ce paiement.', tone: 'danger' });
    } finally {
      setDownloadingId(null);
    }
  }, [alerte]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/abonnements/all-paiements');
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [selectedClientId, filtStatut, filtMois]);

  const clients = useMemo(() => {
    const map = new Map<number, { id: number; nom: string; email: string; total: number; payeCount: number; montant: number }>();
    for (const r of rows) {
      if (!map.has(r.clientId)) map.set(r.clientId, { id: r.clientId, nom: r.clientNom, email: r.clientEmail, total: 0, payeCount: 0, montant: 0 });
      const c = map.get(r.clientId)!;
      c.total++;
      if (r.statut === 'payé') { c.payeCount++; c.montant += parseFloat(String(r.montantDt ?? 0)) || 0; }
    }
    return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [rows]);

  const filteredClients = useMemo(() => {
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter(c => c.nom.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [clients, search]);

  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null;

  const clientRows = useMemo(() => {
    if (selectedClientId === null) return [];
    return rows.filter(r => {
      if (r.clientId !== selectedClientId) return false;
      if (filtStatut && r.statut !== filtStatut) return false;
      if (filtMois && r.mois.slice(0, 7) !== filtMois) return false;
      return true;
    });
  }, [rows, selectedClientId, filtStatut, filtMois]);

  const totalPayes = rows.filter(r => r.statut === 'payé').length;
  const totalMontant = rows.filter(r => r.statut === 'payé').reduce((s, r) => s + (parseFloat(String(r.montantDt ?? 0)) || 0), 0);

  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(clientRows.length / PAGE_SIZE));
  const pagedRows = clientRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div style={{ display: 'flex', gap: 20, minHeight: 600 }}>
      {/* ── Left: client list ─────────────────────────────────────── */}
      <div style={{ flex: '0 0 360px', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 24px rgba(30,27,75,0.10)' }}>
        <div style={{ padding: '18px 18px 14px', background: 'linear-gradient(135deg,#0f766e 0%,#0d9488 55%,#14b8a6 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💰</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#fff' }}>Historique paiements</h2>
              <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{clients.length} clients · {rows.length} paiements</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 12 }}>
            {[
              { label: 'Total', value: String(rows.length), color: 'rgba(255,255,255,0.9)', bg: 'rgba(255,255,255,0.1)' },
              { label: 'Payés', value: String(totalPayes), color: '#86efac', bg: 'rgba(134,239,172,0.15)' },
              { label: `${totalMontant.toFixed(0)} DT`, value: null, color: '#fde047', bg: 'rgba(253,224,71,0.15)' },
            ].map((s, i) => (
              <div key={i} style={{ background: s.bg, borderRadius: 8, padding: '7px 4px', textAlign: 'center' }}>
                {s.value !== null && <div style={{ fontSize: 17, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>}
                <div style={{ fontSize: s.value === null ? 11 : 9, fontWeight: 700, color: s.color, opacity: 0.85, marginTop: s.value !== null ? 2 : 0 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, pointerEvents: 'none', zIndex: 1 }}>🔍</span>
            <FilterInput placeholder="Rechercher un client…" value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ height: 'auto', padding: '8px 10px 8px 30px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', fontSize: 12, background: 'rgba(255,255,255,0.12)', color: '#fff' }} />
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
                style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', borderLeft: `3px solid ${isSel ? '#4f46e5' : 'transparent'}`, background: isSel ? '#f0f0ff' : 'transparent' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: av.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: av.color, flexShrink: 0 }}>{av.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#eff6ff', color: '#2563eb' }}>{c.total} pmt{c.total !== 1 ? 's' : ''}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: '#dcfce7', color: '#166534' }}>{c.montant.toFixed(0)} DT</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: detail ─────────────────────────────────────────── */}
      <div style={{ flex: 1, background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>
        {!selectedClient ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, gap: 12 }}>
            <div style={{ fontSize: 48 }}>💰</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>Sélectionner un client</div>
            <div style={{ fontSize: 13, color: '#9ca3af' }}>Cliquez sur un client pour voir son historique</div>
          </div>
        ) : (
          <div style={{ padding: 24 }}>
            {/* Hero */}
            {(() => {
              const av = getAvatar(selectedClient.nom, false);
              return (
                <div style={{ background: 'linear-gradient(135deg,#1e1b4b 0%,#3730a3 55%,#4f46e5 100%)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 13, background: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{av.initials}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{selectedClient.nom}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{selectedClient.email}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { label: 'Paiements', value: String(selectedClient.total) },
                      { label: 'Encaissé', value: `${selectedClient.montant.toFixed(0)} DT` },
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
            <div style={{
              background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', marginBottom: 20,
              border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
            }}>
              {/* Panel header */}
              <div style={{ width: '100%', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#0d9488' }}>Filtres</span>
                {(filtStatut || filtMois) && (
                  <button onClick={() => { setFiltStatut(''); setFiltMois(''); }}
                    style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✕ Réinitialiser</button>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', marginTop: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>📊 Statut</label>
                  <FilterSegmented
                    options={(['', 'payé', 'en_attente'] as const).map((v) => ({
                      value: v,
                      label: v === '' ? 'Tous' : STATUT_LABELS[v] || v,
                      color: v ? STATUT_COLORS[v] : undefined,
                    }))}
                    value={filtStatut}
                    onChange={setFiltStatut}
                    accent="#0d9488"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>📅 Période</label>
                  <FilterInput type="month" value={filtMois} onChange={(e) => setFiltMois(e.target.value)}
                    style={{ width: 'auto', minWidth: 160 }} />
                </div>
              </div>
            </div>

            {/* Payment cards */}
            {clientRows.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Aucun paiement trouvé</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pagedRows.map((r) => {
                    const color = STATUT_COLORS[r.statut] || '#6b7280';
                    const label = STATUT_LABELS[r.statut] || r.statut;
                    return (
                      <div key={r.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', borderLeft: `4px solid ${color}`, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{fmtMois(r.mois)}</div>
                          {r.dateSaisie && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Saisi le {fmtDate(r.dateSaisie)}</div>}
                          {r.notes && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, fontStyle: 'italic' }}>{r.notes}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 20, fontWeight: 800, color: r.statut === 'gratuit' ? '#16a34a' : '#0f172a' }}>
                            {r.statut === 'gratuit' ? 'Gratuit' : r.montantDt != null ? `${r.montantDt} DT` : '—'}
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: color + '18', color }}>{label}</span>
                        </div>
                        {r.statut === 'payé' && (
                          <button onClick={() => downloadFacture(r.id)} disabled={downloadingId === r.id}
                            title="Télécharger la facture (PDF)"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: '1.5px solid #c7d2fe', background: downloadingId === r.id ? '#eef2ff' : '#fff', color: '#4338ca', fontWeight: 700, fontSize: 12, cursor: downloadingId === r.id ? 'default' : 'pointer', flexShrink: 0 }}>
                            🧾 {downloadingId === r.id ? '…' : 'Facture'}
                          </button>
                        )}
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
