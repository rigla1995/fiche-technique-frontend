import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface DashboardKpis {
  approsCount: number;
  approsValeur: number;
  pertesCount: number;
  pertesValeur: number;
  dernierInventaire: string | null;
  ingredientsCount: number;
}

interface DashboardData {
  type: 'activite' | 'labo' | null;
  activiteNom: string | null;
  kpis: DashboardKpis | null;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatCurrency(v: number) {
  return v.toLocaleString('fr-TN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' DT';
}

const KPI_CARDS = (kpis: DashboardKpis, type: string, activiteId?: number) => [
  {
    icon: '📦',
    label: 'Approvisionnements',
    value: String(kpis.approsCount),
    sub: kpis.approsValeur > 0 ? `Valeur : ${formatCurrency(kpis.approsValeur)}` : 'Aucune valeur ce mois',
    accent: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    link: type === 'labo'
      ? `/client/labo/historique-appro?laboId=${activiteId}`
      : `/client/stock/historique?activiteId=${activiteId}`,
    linkLabel: 'Voir historique →',
  },
  {
    icon: '🗑️',
    label: 'Pertes enregistrées',
    value: String(kpis.pertesCount),
    sub: kpis.pertesValeur > 0 ? `Valeur : ${formatCurrency(kpis.pertesValeur)}` : 'Aucune perte ce mois',
    accent: '#dc2626',
    bg: '#fff1f2',
    border: '#fecdd3',
    link: type === 'labo'
      ? `/client/labo/historique-pertes?laboId=${activiteId}`
      : `/client/stock/historique-pertes?activiteId=${activiteId}`,
    linkLabel: 'Voir pertes →',
  },
  {
    icon: '🏪',
    label: 'Articles en stock',
    value: String(kpis.ingredientsCount),
    sub: 'Articles approvisionnés au total',
    accent: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    link: type === 'labo'
      ? `/client/labo/stock?laboId=${activiteId}`
      : `/client/stock?section=activite&activiteId=${activiteId}`,
    linkLabel: 'Voir le stock →',
  },
  {
    icon: '📋',
    label: 'Dernier inventaire',
    value: formatDate(kpis.dernierInventaire),
    sub: kpis.dernierInventaire ? undefined : 'Aucun inventaire effectué',
    accent: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    link: type === 'labo'
      ? `/client/labo/inventaire?laboId=${activiteId}`
      : `/client/inventaire/historique?section=activite&activiteId=${activiteId}`,
    linkLabel: 'Voir inventaires →',
  },
];

export default function DashboardGerantPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/gerant/dashboard')
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const prenom = user?.name?.split(' ')[0] ?? 'Gérant';
  const activiteLabel = data?.type === 'labo' ? 'Labo' : 'Activité';
  const now = new Date();
  const monthLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
          Chargement…
        </div>
      </div>
    );
  }

  if (!data?.kpis) {
    return (
      <div className="page">
        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb',
          padding: '40px 32px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👋</div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', marginBottom: 8 }}>
            Bienvenue, {prenom}
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Votre compte gérant n'est pas encore assigné à une activité ou un labo.
            Contactez l'administrateur pour configurer votre accès.
          </p>
        </div>
      </div>
    );
  }

  const { kpis } = data;
  const cards = KPI_CARDS(kpis, data.type ?? '', user?.gerantActiviteId);

  return (
    <div className="page">
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #059669 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(5,150,105,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏠</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              Bonjour, {prenom} 👋
            </h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {activiteLabel} : <strong style={{ color: '#fff' }}>{data.activiteNom}</strong>
          </p>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.15)', borderRadius: 12,
          padding: '10px 18px', fontSize: '0.8rem', color: '#fff', fontWeight: 600,
          backdropFilter: 'blur(4px)',
        }}>
          📅 {monthLabel}
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {cards.map((card) => (
          <div key={card.label} style={{
            background: card.bg,
            borderRadius: 14, border: `1px solid ${card.border}`,
            padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                background: '#fff', borderRadius: 8, width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              }}>{card.icon}</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>{card.label}</span>
            </div>
            <div style={{ fontSize: '1.9rem', fontWeight: 900, color: card.accent, lineHeight: 1.1 }}>
              {card.value}
            </div>
            {card.sub && (
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{card.sub}</div>
            )}
            {card.link && (
              <Link to={card.link} style={{
                fontSize: '0.75rem', fontWeight: 600, color: card.accent,
                textDecoration: 'none', marginTop: 4, alignSelf: 'flex-start',
              }}>
                {card.linkLabel}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
