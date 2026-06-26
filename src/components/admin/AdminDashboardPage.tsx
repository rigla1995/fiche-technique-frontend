import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';

interface Stats {
  clients: { total: number; activated: number; pendingInvite: number };
  abonnements: { total: number; actif: number; readOnly: number; desactive: number; archive: number };
  paiementsMonth: { payeDt: number; impayeDt: number; enAttenteDt: number; remiseDt: number };
  demandes: { total: number; gerantSup: number; laboSup: number };
}

const fmtDT = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' DT';

// Carte KPI principale
function Kpi({ icon, label, value, sub, color }: { icon: string; label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: color + '18', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>{sub}</div>}
      </div>
    </div>
  );
}

// Accès rapide vers une zone admin, groupé par espace
const ESPACES: { titre: string; color: string; liens: { to: string; icon: string; label: string }[] }[] = [
  { titre: 'Espace Clients', color: '#0d9488', liens: [
    { to: '/admin/clients', icon: '👥', label: 'Clients' },
    { to: '/admin/abonnements', icon: '💳', label: 'Abonnements' },
    { to: '/admin/support', icon: '💬', label: 'Demandes' },
    { to: '/admin/rapports', icon: '📊', label: 'Rapports' },
  ] },
  { titre: 'Espace Configuration', color: '#b45309', liens: [
    { to: '/admin/domaines', icon: '🗂️', label: "Domaines d'activités" },
    { to: '/admin/prestataires', icon: '🚚', label: 'Prestataires' },
    { to: '/admin/tarifs', icon: '⚙️', label: 'Tarifs' },
  ] },
  { titre: 'Espace IA', color: '#6366f1', liens: [
    { to: '/admin/active-agents', icon: '🤖', label: 'Agents IA' },
    { to: '/admin/knowledge-base', icon: '🧠', label: 'Base IA' },
  ] },
];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/rapports/stats')
      .then(({ data }) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #4338ca 100%)', borderRadius: 18, padding: '24px 28px', marginBottom: 22, boxShadow: '0 8px 28px rgba(30,27,75,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 11, padding: '8px 10px', fontSize: '1.3rem', lineHeight: 1 }}>📊</div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>Tableau de bord</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.83rem', margin: '4px 0 0' }}>Vue d'ensemble de la plateforme LabFlow</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : !stats ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>Statistiques indisponibles.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 26 }}>
            <Kpi icon="👥" label="Clients" color="#0d9488"
              value={String(stats.clients.total)}
              sub={`${stats.clients.activated} activé${stats.clients.activated > 1 ? 's' : ''} · ${stats.clients.pendingInvite} en attente`} />
            <Kpi icon="💳" label="Abonnements actifs" color="#2563eb"
              value={String(stats.abonnements.actif)}
              sub={`sur ${stats.abonnements.total} au total`} />
            <Kpi icon="💰" label="Revenus du mois" color="#059669"
              value={fmtDT(stats.paiementsMonth.payeDt)}
              sub={stats.paiementsMonth.enAttenteDt > 0 ? `${fmtDT(stats.paiementsMonth.enAttenteDt)} en attente` : 'encaissés'} />
            <Kpi icon="📨" label="Demandes en attente" color="#d97706"
              value={String(stats.demandes.total)}
              sub={stats.demandes.total > 0 ? 'à traiter' : 'aucune'} />
          </div>

          {/* Accès rapides par espace */}
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Accès rapides</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {ESPACES.map((esp) => (
              <div key={esp.titre}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 3, height: 14, borderRadius: 2, background: esp.color, display: 'inline-block' }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: esp.color }}>{esp.titre}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  {esp.liens.map((l) => (
                    <Link key={l.to} to={l.to} style={{ textDecoration: 'none', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${esp.color}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.04)', transition: 'box-shadow 0.15s, transform 0.15s' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 6px 18px ${esp.color}22`; (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 1px 6px rgba(0,0,0,0.04)'; (e.currentTarget as HTMLAnchorElement).style.transform = 'none'; }}>
                      <span style={{ fontSize: '1.3rem' }}>{l.icon}</span>
                      <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem' }}>{l.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
