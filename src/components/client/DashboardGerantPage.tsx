import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

interface DashboardKpis {
  approsCount: number;
  approsValeur: number;
  pertesCount: number;
  pertesValeur: number;
  inventairesCount: number;
  dernierInventaire: string | null;
  articlesCount: number;
}

interface MonthlyData {
  approsCount: number[];
  approsValeur: number[];
  pertesCount: number[];
  pertesValeur: number[];
}

interface DashboardData {
  type: 'activite' | 'labo' | null;
  activiteNom: string | null;
  year: number;
  kpis: DashboardKpis | null;
  monthly: MonthlyData | null;
}

function fmt(v: number) {
  return v.toLocaleString('fr-TN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function MiniBar({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const currentMonth = new Date().getMonth();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48 }}>
      {values.map((v, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 2 }}>
          <div style={{
            width: '100%', borderRadius: 3,
            height: Math.max((v / max) * 40, v > 0 ? 3 : 1),
            background: i === currentMonth ? color : `${color}55`,
            transition: 'height 0.3s',
          }} />
          <span style={{ fontSize: '0.52rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>{MONTHS_FR[i]}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardGerantPage() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/gerant/dashboard?year=${year}`)
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year]);

  const prenom = user?.name?.split(' ')[0] ?? 'Gérant';
  const isLabo = data?.type === 'labo';
  const themeColor = isLabo ? '#7e22ce' : '#059669';
  const themeDark = isLabo ? '#3b0764' : '#064e3b';
  const themeMid = isLabo ? '#a855f7' : '#10b981';
  const activiteId = user?.gerantActiviteId;

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1].filter((y) => y <= currentYear);

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: '64px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
          Chargement…
        </div>
      </div>
    );
  }

  if (!data?.kpis) {
    return (
      <div className="page">
        <div style={{
          background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)',
          padding: '48px 32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👋</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            Bienvenue, {prenom}
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Votre compte n'est pas encore assigné à une activité. Contactez l'administrateur.
          </p>
        </div>
      </div>
    );
  }

  const { kpis, monthly } = data;

  const statsCards = [
    {
      icon: '📦',
      label: 'Approvisionnements',
      value: kpis.approsCount,
      unit: 'entrées',
      sub: kpis.approsValeur > 0 ? `${fmt(kpis.approsValeur)} DT de valeur` : 'Aucune valeur enregistrée',
      accent: '#2563eb',
      bg: '#eff6ff',
      border: '#bfdbfe',
      link: isLabo
        ? `/client/labo/historique-appro?laboId=${activiteId}`
        : `/client/stock/historique?activiteId=${activiteId}`,
      barValues: monthly?.approsCount,
      barColor: '#2563eb',
    },
    {
      icon: '🗑️',
      label: 'Pertes enregistrées',
      value: kpis.pertesCount,
      unit: 'pertes',
      sub: kpis.pertesValeur > 0 ? `${fmt(kpis.pertesValeur)} DT perdus` : 'Aucune valeur pertes',
      accent: '#dc2626',
      bg: '#fff1f2',
      border: '#fecdd3',
      link: isLabo
        ? `/client/labo/historique-pertes?laboId=${activiteId}`
        : `/client/stock/historique-pertes?activiteId=${activiteId}`,
      barValues: monthly?.pertesCount,
      barColor: '#dc2626',
    },
    {
      icon: '📋',
      label: 'Inventaires',
      value: kpis.inventairesCount,
      unit: 'inventaires',
      sub: kpis.dernierInventaire ? `Dernier : ${fmtDate(kpis.dernierInventaire)}` : 'Aucun inventaire effectué',
      accent: '#d97706',
      bg: '#fffbeb',
      border: '#fde68a',
      link: isLabo
        ? `/client/labo/inventaire/historique?laboId=${activiteId}`
        : `/client/inventaire/historique?section=activite&activiteId=${activiteId}`,
      barValues: null,
      barColor: '#d97706',
    },
    {
      icon: '🏪',
      label: 'Articles en stock',
      value: kpis.articlesCount,
      unit: 'articles',
      sub: 'Références approvisionnées',
      accent: themeColor,
      bg: isLabo ? '#faf5ff' : '#ecfdf5',
      border: isLabo ? '#e9d5ff' : '#a7f3d0',
      link: isLabo
        ? `/client/labo/stock?laboId=${activiteId}`
        : `/client/stock?section=activite&activiteId=${activiteId}`,
      barValues: null,
      barColor: themeColor,
    },
  ];

  return (
    <div className="page">
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${themeDark} 0%, ${themeColor} 60%, ${themeMid} 100%)`,
        borderRadius: 16, padding: '20px 24px', marginBottom: 20,
        boxShadow: `0 8px 32px rgba(0,0,0,0.18)`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: '1.5rem' }}>🏠</span>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              Bonjour, {prenom} 👋
            </h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.83rem', margin: 0 }}>
            {data.type === 'labo' ? 'Labo' : 'Activité'} :{' '}
            <strong style={{ color: '#fff' }}>{data.activiteNom}</strong>
          </p>
        </div>
        {/* Year selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', fontWeight: 600 }}>Année</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {yearOptions.map((y) => (
              <button key={y} onClick={() => setYear(y)} style={{
                padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                border: 'none',
                background: y === year ? '#fff' : 'rgba(255,255,255,0.18)',
                color: y === year ? themeColor : '#fff',
                transition: 'all 0.15s',
              }}>
                {y}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginBottom: 20 }}>
        {statsCards.map((card) => (
          <div key={card.label} style={{
            background: card.bg, borderRadius: 14, border: `1px solid ${card.border}`,
            padding: '18px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8,
            boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  background: '#fff', borderRadius: 8, width: 34, height: 34,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                }}>{card.icon}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>{card.label}</span>
              </div>
              <Link to={card.link} style={{ fontSize: '0.7rem', color: card.accent, textDecoration: 'none', fontWeight: 600 }}>
                Voir →
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: '2rem', fontWeight: 900, color: card.accent, lineHeight: 1 }}>
                {card.value}
              </span>
              <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 500 }}>{card.unit}</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{card.sub}</div>
            {card.barValues && (
              <MiniBar values={card.barValues} color={card.barColor} />
            )}
          </div>
        ))}
      </div>

      {/* Monthly breakdown table */}
      {monthly && (
        <div style={{
          background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)',
          padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
              Évolution mensuelle {year}
            </h2>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Appros / Pertes par mois
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.72rem' }}>Mois</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#2563eb', fontSize: '0.72rem' }}>Appros</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#2563eb', fontSize: '0.72rem' }}>Valeur appros</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#dc2626', fontSize: '0.72rem' }}>Pertes</th>
                  {kpis.pertesValeur > 0 && (
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#dc2626', fontSize: '0.72rem' }}>Valeur pertes</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {MONTHS_FR.map((m, i) => {
                  const hasData = monthly.approsCount[i] > 0 || monthly.pertesCount[i] > 0;
                  const isCurrentMonth = i === new Date().getMonth() && year === currentYear;
                  return (
                    <tr key={m} style={{
                      background: isCurrentMonth ? (isLabo ? '#faf5ff' : '#ecfdf5') : hasData ? 'var(--card-bg)' : 'transparent',
                      borderBottom: '1px solid var(--border)',
                      opacity: hasData || isCurrentMonth ? 1 : 0.45,
                    }}>
                      <td style={{ padding: '7px 10px', fontWeight: isCurrentMonth ? 800 : 500, color: 'var(--text)' }}>
                        {m} {isCurrentMonth && <span style={{ fontSize: '0.65rem', color: themeColor, marginLeft: 4 }}>← actuel</span>}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: monthly.approsCount[i] > 0 ? '#2563eb' : 'var(--text-muted)' }}>
                        {monthly.approsCount[i] > 0 ? monthly.approsCount[i] : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: monthly.approsValeur[i] > 0 ? '#2563eb' : 'var(--text-muted)' }}>
                        {monthly.approsValeur[i] > 0 ? `${fmt(monthly.approsValeur[i])} DT` : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: monthly.pertesCount[i] > 0 ? '#dc2626' : 'var(--text-muted)' }}>
                        {monthly.pertesCount[i] > 0 ? monthly.pertesCount[i] : '—'}
                      </td>
                      {kpis.pertesValeur > 0 && (
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: monthly.pertesValeur[i] > 0 ? '#dc2626' : 'var(--text-muted)' }}>
                          {monthly.pertesValeur[i] > 0 ? `${fmt(monthly.pertesValeur[i])} DT` : '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg)', borderTop: '2px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 800, color: 'var(--text)', fontSize: '0.75rem' }}>Total {year}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#2563eb' }}>{kpis.approsCount}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#2563eb' }}>{fmt(kpis.approsValeur)} DT</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>{kpis.pertesCount}</td>
                  {kpis.pertesValeur > 0 && (
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>{fmt(kpis.pertesValeur)} DT</td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
