import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import api from '../../api/client';

interface RapportsStats {
  clients: {
    total: number; indep: number; entreprise: number;
    activated: number; pendingInvite: number;
  };
  abonnements: {
    total: number; actif: number; readOnly: number;
    desactive: number; archive: number;
  };
  paiementsMonth: {
    payeDt: number; impayeDt: number; enAttenteDt: number; remiseDt: number;
    payeCount: number; impayeCount: number; enAttenteCount: number;
  };
  revenueTrend: { mois: string; payeDt: number; impayeDt: number; totalDt: number }[];
  newClientsTrend: { mois: string; count: number }[];
  demandes: { total: number; gerantSup: number; laboSup: number };
}

const PIE_COLORS = ['#16a34a', '#ef4444', '#f59e0b', '#94a3b8'];

function KpiCard({ icon, label, value, sub, color }: {
  icon: string; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
      padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: '1.3rem' }}>{icon}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: color || 'var(--text)', lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.06em', color: 'var(--text-muted)', margin: '24px 0 12px',
    }}>
      {children}
    </h2>
  );
}

const fmt = (n: number) => n.toLocaleString('fr-TN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDT = (n: unknown) => `${fmt(n as number)} DT`;
const monthLabel = (s: string) => {
  const [y, m] = s.split('-');
  const d = new Date(parseInt(y), parseInt(m) - 1);
  return d.toLocaleString('fr-FR', { month: 'short', year: '2-digit' });
};

export default function AdminRapportsPage() {
  const [stats, setStats] = useState<RapportsStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/rapports/stats')
      .then(({ data }) => setStats(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><div className="loading-text">Chargement…</div></div>;
  if (!stats) return <div className="page"><div className="empty-state">Erreur lors du chargement</div></div>;

  const { clients, abonnements, paiementsMonth, revenueTrend, newClientsTrend, demandes } = stats;

  const aboStatusData = [
    { name: 'Actif', value: abonnements.actif },
    { name: 'Read-only', value: abonnements.readOnly },
    { name: 'Désactivé', value: abonnements.desactive },
    { name: 'Archivé', value: abonnements.archive },
  ].filter((d) => d.value > 0);



  const revenueTrendFormatted = revenueTrend.map((r) => ({
    ...r,
    label: monthLabel(r.mois),
  }));

  const newClientsFormatted = newClientsTrend.map((r) => ({
    ...r,
    label: monthLabel(r.mois),
  }));

  return (
    <div className="page">
      <div className="page-header">
        <h1>📊 Rapports</h1>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Vue d'ensemble — {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* ── KPIs principaux ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        <KpiCard icon="👥" label="Clients total" value={clients.total} sub={`${clients.indep} indép · ${clients.entreprise} entreprise`} color="var(--primary)" />
        <KpiCard icon="✅" label="Comptes activés" value={clients.activated} sub={clients.pendingInvite > 0 ? `${clients.pendingInvite} invitation(s) en attente` : 'Tous activés'} color="#16a34a" />
        <KpiCard icon="💰" label="Revenus ce mois" value={fmtDT(paiementsMonth.payeDt)} color="#16a34a" />
        <KpiCard icon="⚠️" label="Impayés ce mois" value={fmtDT(paiementsMonth.impayeDt)} color={paiementsMonth.impayeDt > 0 ? '#ef4444' : 'var(--text-muted)'} />
        <KpiCard icon="🔄" label="Abonnements actifs" value={abonnements.actif} sub={`${abonnements.total} total`} color="var(--primary)" />
        <KpiCard icon="📨" label="Demandes en attente" value={demandes.total} sub={demandes.total > 0 ? `${demandes.gerantSup} gérant · ${demandes.laboSup} labo` : 'Aucune'} color={demandes.total > 0 ? '#f59e0b' : 'var(--text-muted)'} />
      </div>

      {/* ── Revenus mensuels ── */}
      <SectionTitle>Revenus mensuels (6 derniers mois)</SectionTitle>
      <div className="card" style={{ padding: '16px 20px' }}>
        {revenueTrendFormatted.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 0' }}>Aucune donnée de paiement</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenueTrendFormatted} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${fmt(v)}`} />
              <Tooltip formatter={(v: unknown) => [`${fmtDT(v)}`]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="payeDt" name="Encaissé" fill="#16a34a" radius={[3, 3, 0, 0]} />
              <Bar dataKey="impayeDt" name="Impayé" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Clients + Abonnements ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
        {/* Nouveaux clients */}
        <div>
          <SectionTitle>Nouveaux clients / mois</SectionTitle>
          <div className="card" style={{ padding: '16px 20px' }}>
            {newClientsFormatted.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 0' }}>Aucun client récent</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={newClientsFormatted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: unknown) => [String(v), 'Nouveaux clients']} />
                  <Bar dataKey="count" name="Clients" fill="#2563eb" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Statuts abonnements */}
        <div>
          <SectionTitle>Statuts des abonnements</SectionTitle>
          <div className="card" style={{ padding: '16px 20px' }}>
            {aboStatusData.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 0' }}>Aucun abonnement</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={aboStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {aboStatusData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Paiements ce mois ── */}
      <SectionTitle>Paiements ce mois</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <KpiCard icon="✅" label="Payé" value={fmtDT(paiementsMonth.payeDt)} sub={`${paiementsMonth.payeCount} paiement(s)`} color="#16a34a" />
        <KpiCard icon="❌" label="Impayé" value={fmtDT(paiementsMonth.impayeDt)} sub={`${paiementsMonth.impayeCount} compte(s)`} color="#ef4444" />
        <KpiCard icon="⏳" label="En attente" value={fmtDT(paiementsMonth.enAttenteDt)} sub={`${paiementsMonth.enAttenteCount} en attente`} color="#f59e0b" />
        <KpiCard icon="🎁" label="Remisé" value={fmtDT(paiementsMonth.remiseDt)} color="#8b5cf6" />
      </div>

      {/* ── Abonnements détail ── */}
      <SectionTitle>État des comptes</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <KpiCard icon="🟢" label="Actifs" value={abonnements.actif} color="#16a34a" />
        <KpiCard icon="🟡" label="Read-only" value={abonnements.readOnly} color="#f59e0b" />
        <KpiCard icon="🔴" label="Désactivés" value={abonnements.desactive} color="#ef4444" />
        <KpiCard icon="📦" label="Archivés" value={abonnements.archive} color="#94a3b8" />
      </div>

      {/* ── Demandes ── */}
      {demandes.total > 0 && (
        <>
          <SectionTitle>Demandes en attente</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            <KpiCard icon="📨" label="Total" value={demandes.total} color="#f59e0b" />
            <KpiCard icon="👤" label="Gérant sup" value={demandes.gerantSup} color="#f59e0b" />
            <KpiCard icon="🏭" label="Labo sup" value={demandes.laboSup} color="#f59e0b" />
          </div>
        </>
      )}
    </div>
  );
}
