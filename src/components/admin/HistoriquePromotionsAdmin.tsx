import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api/client';

const TYPE_LABELS: Record<string, string> = {
  percent_off: '% Réduction',
  free_months: 'Mois gratuits',
  fixed_price: 'Prix fixe',
};
const APPLIES_LABELS: Record<string, string> = {
  onboarding:          'OnBoarding',
  mensualite:          'Mensualité',
  supplement_gerant:   'Sup. Gérant',
  supplement_labo:     'Sup. Labo',
  supplement_activite: 'Sup. Activité',
};
const APPLIES_COLORS: Record<string, string> = {
  onboarding:          '#0369a1',
  mensualite:          '#1d4ed8',
  supplement_gerant:   '#7c3aed',
  supplement_labo:     '#0891b2',
  supplement_activite: '#d97706',
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

interface PromoRow {
  id: number;
  type: string;
  appliesTo: string;
  discountOnboarding: number | null;
  discountMensualite: number | null;
  discountSupplement: number | null;
  fixedOnboarding: number | null;
  fixedMensualite: number | null;
  fixedSupplement: number | null;
  dateDebut: string;
  dateFin: string | null;
  monthsDuration: number | null;
  isActive: boolean;
  notes: string | null;
  clientId: number;
  clientNom: string;
  clientEmail: string;
}

function promoRemise(p: PromoRow): string {
  if (p.type === 'free_months') return 'Gratuit (100%)';
  if (p.type === 'percent_off') {
    const v = p.discountSupplement ?? p.discountMensualite ?? p.discountOnboarding;
    return v ? `-${v}%` : '—';
  }
  const v = p.fixedSupplement ?? p.fixedMensualite ?? p.fixedOnboarding;
  return v ? `${v} DT` : '—';
}

const PALETTE = ['#dbeafe:#1d4ed8','#dcfce7:#166534','#fce7f3:#9d174d','#ede9fe:#6d28d9','#fff7ed:#c2410c','#e0f2fe:#075985'];
function getAvatar(nom: string, selected: boolean) {
  const initials = nom.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const p = PALETTE[(nom.charCodeAt(0) || 0) % PALETTE.length].split(':');
  return { initials, bg: selected ? '#e0e7ff' : p[0], color: selected ? '#4f46e5' : p[1] };
}

export default function HistoriquePromotionsAdmin() {
  const [rows, setRows] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filtActive, setFiltActive] = useState('');
  const [filtAppliesTo, setFiltAppliesTo] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/abonnements/all-promotions');
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [selectedClientId, filtActive, filtAppliesTo]);

  const clients = useMemo(() => {
    const map = new Map<number, { id: number; nom: string; email: string; total: number; activeCount: number }>();
    for (const r of rows) {
      if (!map.has(r.clientId)) map.set(r.clientId, { id: r.clientId, nom: r.clientNom, email: r.clientEmail, total: 0, activeCount: 0 });
      const c = map.get(r.clientId)!;
      c.total++;
      if (r.isActive) c.activeCount++;
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
      if (filtActive === '1' && !r.isActive) return false;
      if (filtActive === '0' && r.isActive) return false;
      if (filtAppliesTo && r.appliesTo !== filtAppliesTo) return false;
      return true;
    });
  }, [rows, selectedClientId, filtActive, filtAppliesTo]);

  const totalActive = rows.filter(r => r.isActive).length;
  const appliesEntries: [string, string][] = [['', 'Toutes'], ...Object.entries(APPLIES_LABELS)];

  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(clientRows.length / PAGE_SIZE));
  const pagedRows = clientRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div style={{ display: 'flex', gap: 20, minHeight: 600 }}>
      {/* ── Left: client list ─────────────────────────────────────── */}
      <div style={{ flex: '0 0 360px', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 24px rgba(30,27,75,0.10)' }}>
        <div style={{ padding: '18px 18px 14px', background: 'linear-gradient(135deg,#0f766e 0%,#0d9488 55%,#14b8a6 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏷️</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#fff' }}>Historique promotions</h2>
              <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{clients.length} clients · {rows.length} promos</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 12 }}>
            {[
              { label: 'Total', value: rows.length, color: 'rgba(255,255,255,0.9)', bg: 'rgba(255,255,255,0.1)' },
              { label: 'Actives', value: totalActive, color: '#86efac', bg: 'rgba(134,239,172,0.15)' },
              { label: 'Clients', value: clients.length, color: '#fde047', bg: 'rgba(253,224,71,0.15)' },
            ].map((s) => (
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
                style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', borderLeft: `3px solid ${isSel ? '#4f46e5' : 'transparent'}`, background: isSel ? '#f0f0ff' : 'transparent' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: av.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: av.color, flexShrink: 0 }}>{av.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#fef3c7', color: '#92400e' }}>{c.total} promo{c.total !== 1 ? 's' : ''}</span>
                    {c.activeCount > 0 && <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: '#dcfce7', color: '#166534' }}>{c.activeCount} active{c.activeCount !== 1 ? 's' : ''}</span>}
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
            <div style={{ fontSize: 48 }}>🏷️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>Sélectionner un client</div>
            <div style={{ fontSize: 13, color: '#9ca3af' }}>Cliquez sur un client pour voir ses promotions</div>
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
                      { label: 'Promos', value: String(selectedClient.total) },
                      { label: 'Actives', value: String(selectedClient.activeCount) },
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
              background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', marginBottom: 16,
              border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
            }}>
              {/* Panel header */}
              <div style={{ width: '100%', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#0d9488' }}>Filtres</span>
                {(filtActive || filtAppliesTo) && (
                  <button onClick={() => { setFiltActive(''); setFiltAppliesTo(''); }}
                    style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✕ Réinitialiser</button>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', marginTop: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>📊 Statut</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {([['', 'Tous'], ['1', 'Actives'], ['0', 'Expirées']] as [string, string][]).map(([v, label]) => {
                      const active = filtActive === v;
                      return (
                        <button key={v} onClick={() => setFiltActive(v)}
                          style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${active ? '#d97706' : '#e2e8f0'}`, background: active ? '#fef3c7' : '#fff', color: active ? '#92400e' : '#94a3b8' }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🏷️ Catégorie</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {appliesEntries.map(([v, label]) => {
                      const active = filtAppliesTo === v;
                      const color = v ? (APPLIES_COLORS[v] || '#4f46e5') : '#64748b';
                      return (
                        <button key={v} onClick={() => setFiltAppliesTo(v)}
                          style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${active ? color : '#e2e8f0'}`, background: active ? color + '15' : '#fff', color: active ? color : '#94a3b8' }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Promo cards */}
            {clientRows.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Aucune promotion trouvée</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pagedRows.map((r) => {
                    const appColor = APPLIES_COLORS[r.appliesTo] || '#4f46e5';
                    return (
                      <div key={r.id} style={{ background: r.isActive ? '#fffbeb' : '#fafafa', borderRadius: 12, border: `1px solid ${r.isActive ? '#fde68a' : '#e5e7eb'}`, borderLeft: `4px solid ${r.isActive ? '#f59e0b' : '#9ca3af'}`, padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: r.isActive ? '#fef3c7' : '#f3f4f6', color: r.isActive ? '#92400e' : '#9ca3af' }}>
                            {r.isActive ? 'Actif' : 'Expiré'}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: appColor + '15', color: appColor }}>
                            {APPLIES_LABELS[r.appliesTo] || r.appliesTo}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{TYPE_LABELS[r.type] || r.type}</span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginLeft: 4 }}>{promoRemise(r)}</span>
                          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
                            {fmtDate(r.dateDebut)} → {r.dateFin ? fmtDate(r.dateFin) : 'Permanent'}
                            {r.monthsDuration && <span style={{ marginLeft: 4, fontSize: 10 }}>({r.monthsDuration} mois)</span>}
                          </span>
                        </div>
                        {r.notes && <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>{r.notes}</div>}
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
