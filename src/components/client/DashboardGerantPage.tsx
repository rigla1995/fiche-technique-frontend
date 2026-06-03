import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const MONTHS_LONG = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const TYPE_LABELS: Record<string, string> = {
  manuel: 'Manuel',
  transfert: 'Transfert',
  PT: 'Prod. Transformé',
  vente: 'Vente',
};
const TYPE_COLORS: Record<string, string> = {
  manuel: '#2563eb',
  transfert: '#7c3aed',
  PT: '#0891b2',
  vente: '#16a34a',
};

interface ApprosParType {
  [type: string]: { count: number; valeur: number };
}

interface DashboardKpis {
  approsCount: number;
  approsValeur: number;
  approsParType: ApprosParType;
  pertesCount: number;
  pertesValeur: number;
  inventairesCount: number;
  dernierInventaire: string | null;
  articlesCount: number;
  venteCount: number | null;
  venteCA: number | null;
}

interface MonthlyData {
  approsCount: number[];
  approsValeur: number[];
  pertesCount: number[];
  pertesValeur: number[];
  venteCount: number[];
  venteCA: number[];
}

interface DashboardData {
  type: 'activite' | 'labo' | null;
  activiteNom: string | null;
  year: number;
  month: number | null;
  hasVente: boolean;
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

function MiniBar({ values, color, highlightIdx }: { values: number[]; color: string; highlightIdx: number | null }) {
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 44 }}>
      {values.map((v, i) => {
        const isHL = highlightIdx !== null ? i === highlightIdx : i === new Date().getMonth();
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 2 }}>
            <div style={{
              width: '100%', borderRadius: 3,
              height: Math.max((v / max) * 36, v > 0 ? 3 : 1),
              background: isHL ? color : `${color}44`,
            }} />
            <span style={{ fontSize: '0.5rem', color: '#9ca3af' }}>{MONTHS_FR[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardGerantPage() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState<number | null>(null);
  const [typeAppro, setTypeAppro] = useState<string>('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(year) });
    if (month) params.set('month', String(month));
    if (typeAppro) params.set('typeAppro', typeAppro);
    api.get(`/api/gerant/dashboard?${params}`)
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year, month, typeAppro]);

  const prenom = user?.name?.split(' ')[0] ?? 'Gérant';
  const isLabo = data?.type === 'labo';
  const themeColor = isLabo ? '#7e22ce' : '#059669';
  const themeDark = isLabo ? '#3b0764' : '#064e3b';
  const activiteId = user?.gerantActiviteId;
  const yearOptions = [currentYear - 1, currentYear];
  const periodLabel = month ? MONTHS_LONG[month - 1] + ' ' + year : `Année ${year}`;

  const selectStyle: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--card-bg)', color: 'var(--text)', fontSize: '0.8rem',
    cursor: 'pointer', outline: 'none',
  };

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
        <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👋</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Bienvenue, {prenom}</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Votre compte n'est pas encore assigné à une activité. Contactez l'administrateur.
          </p>
        </div>
      </div>
    );
  }

  const { kpis, monthly, hasVente } = data;
  const approsTypes = Object.entries(kpis.approsParType || {}).filter(([, v]) => v.count > 0);

  return (
    <div className="page">
      {/* Hero — no year filter here */}
      <div style={{
        background: `linear-gradient(135deg, ${themeDark} 0%, ${themeColor} 60%)`,
        borderRadius: 16, padding: '18px 24px', marginBottom: 16,
        boxShadow: `0 6px 24px rgba(0,0,0,0.16)`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: '1.4rem' }}>🏠</span>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#fff', margin: 0 }}>
            Bonjour, {prenom} 👋
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem', margin: 0 }}>
            {data.type === 'labo' ? 'Labo' : 'Activité'} : <strong style={{ color: '#fff' }}>{data.activiteNom}</strong>
            {' — '}<span style={{ color: 'rgba(255,255,255,0.65)' }}>{periodLabel}</span>
          </p>
        </div>
      </div>

      {/* Filters bar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
        background: 'var(--card-bg)', borderRadius: 12, padding: '12px 16px',
        border: '1px solid var(--border)', marginBottom: 16,
      }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: 2 }}>Filtres :</span>

        {/* Year */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Année</span>
          {yearOptions.map((y) => (
            <button key={y} onClick={() => setYear(y)} style={{
              padding: '4px 12px', borderRadius: 16, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
              border: `1.5px solid ${y === year ? themeColor : 'var(--border)'}`,
              background: y === year ? themeColor : 'var(--bg)',
              color: y === year ? '#fff' : 'var(--text)',
              transition: 'all 0.15s',
            }}>
              {y}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* Month */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Mois</span>
          <select value={month ?? ''} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)} style={selectStyle}>
            <option value="">Toute l'année</option>
            {MONTHS_LONG.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* Type appro */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Type</span>
          <select value={typeAppro} onChange={(e) => setTypeAppro(e.target.value)} style={selectStyle}>
            <option value="">Tous les types</option>
            <option value="manuel">Manuel</option>
            <option value="transfert">Transfert</option>
            {isLabo && <option value="PT">Prod. Transformé</option>}
            {hasVente && <option value="vente">Vente</option>}
          </select>
        </div>

        {(month || typeAppro) && (
          <button onClick={() => { setMonth(null); setTypeAppro(''); }} style={{
            marginLeft: 'auto', padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
            fontSize: '0.72rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: 600,
          }}>
            Réinitialiser
          </button>
        )}
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>

        {/* Appros */}
        <div style={{ background: '#eff6ff', borderRadius: 14, border: '1px solid #bfdbfe', padding: '16px 16px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ background: '#fff', borderRadius: 7, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>📦</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>Approvisionnements</span>
            </div>
            <Link to={isLabo ? `/client/labo/historique-appro?laboId=${activiteId}` : `/client/stock/historique?activiteId=${activiteId}`}
              style={{ fontSize: '0.7rem', color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>Voir →</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
            <span style={{ fontSize: '2rem', fontWeight: 900, color: '#2563eb', lineHeight: 1 }}>{kpis.approsCount}</span>
            <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>entrées</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 8 }}>
            {kpis.approsValeur > 0 ? `${fmt(kpis.approsValeur)} DT de valeur` : 'Aucune valeur enregistrée'}
          </div>
          {/* Type breakdown */}
          {approsTypes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {approsTypes.map(([type, v]) => (
                <span key={type} style={{
                  padding: '2px 7px', borderRadius: 10, fontSize: '0.65rem', fontWeight: 700,
                  background: `${TYPE_COLORS[type] || '#6b7280'}18`,
                  color: TYPE_COLORS[type] || '#6b7280',
                  border: `1px solid ${TYPE_COLORS[type] || '#6b7280'}33`,
                }}>
                  {TYPE_LABELS[type] || type} : {v.count}
                </span>
              ))}
            </div>
          )}
          {monthly && <MiniBar values={monthly.approsCount} color="#2563eb" highlightIdx={month ? month - 1 : null} />}
        </div>

        {/* Pertes */}
        <div style={{ background: '#fff1f2', borderRadius: 14, border: '1px solid #fecdd3', padding: '16px 16px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ background: '#fff', borderRadius: 7, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>🗑️</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>Pertes enregistrées</span>
            </div>
            <Link to={isLabo ? `/client/labo/historique-pertes?laboId=${activiteId}` : `/client/stock/historique-pertes?activiteId=${activiteId}`}
              style={{ fontSize: '0.7rem', color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>Voir →</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
            <span style={{ fontSize: '2rem', fontWeight: 900, color: '#dc2626', lineHeight: 1 }}>{kpis.pertesCount}</span>
            <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>pertes</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 8 }}>
            {kpis.pertesValeur > 0 ? `${fmt(kpis.pertesValeur)} DT perdus` : 'Aucune valeur pertes'}
          </div>
          {monthly && <MiniBar values={monthly.pertesCount} color="#dc2626" highlightIdx={month ? month - 1 : null} />}
        </div>

        {/* Inventaires */}
        <div style={{ background: '#fffbeb', borderRadius: 14, border: '1px solid #fde68a', padding: '16px 16px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ background: '#fff', borderRadius: 7, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>📋</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>Inventaires</span>
            </div>
            <Link to={isLabo ? `/client/labo/inventaire/historique?laboId=${activiteId}` : `/client/inventaire/historique?section=activite&activiteId=${activiteId}`}
              style={{ fontSize: '0.7rem', color: '#d97706', textDecoration: 'none', fontWeight: 600 }}>Voir →</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
            <span style={{ fontSize: '2rem', fontWeight: 900, color: '#d97706', lineHeight: 1 }}>{kpis.inventairesCount}</span>
            <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>inventaires</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
            {kpis.dernierInventaire ? `Dernier : ${fmtDate(kpis.dernierInventaire)}` : 'Aucun inventaire effectué'}
          </div>
        </div>

        {/* Articles */}
        <div style={{ background: isLabo ? '#faf5ff' : '#ecfdf5', borderRadius: 14, border: `1px solid ${isLabo ? '#e9d5ff' : '#a7f3d0'}`, padding: '16px 16px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ background: '#fff', borderRadius: 7, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>🏪</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>Articles en stock</span>
            </div>
            <Link to={isLabo ? `/client/labo/stock?laboId=${activiteId}` : `/client/stock?section=activite&activiteId=${activiteId}`}
              style={{ fontSize: '0.7rem', color: themeColor, textDecoration: 'none', fontWeight: 600 }}>Voir →</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
            <span style={{ fontSize: '2rem', fontWeight: 900, color: themeColor, lineHeight: 1 }}>{kpis.articlesCount}</span>
            <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>articles</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Références approvisionnées</div>
        </div>

        {/* Vente (if active) */}
        {hasVente && (
          <div style={{ background: '#f0fdf4', borderRadius: 14, border: '1px solid #bbf7d0', padding: '16px 16px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ background: '#fff', borderRadius: 7, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>🛒</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>Ventes</span>
              </div>
              <Link to={`/client/ventes?activiteId=${activiteId}`}
                style={{ fontSize: '0.7rem', color: '#16a34a', textDecoration: 'none', fontWeight: 600 }}>Voir →</Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
              <span style={{ fontSize: '2rem', fontWeight: 900, color: '#16a34a', lineHeight: 1 }}>{kpis.venteCount ?? 0}</span>
              <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>ventes confirmées</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 8 }}>
              {(kpis.venteCA ?? 0) > 0 ? `CA : ${fmt(kpis.venteCA ?? 0)} DT` : 'Aucun chiffre d\'affaires'}
            </div>
            {monthly && <MiniBar values={monthly.venteCount} color="#16a34a" highlightIdx={month ? month - 1 : null} />}
          </div>
        )}
      </div>

      {/* Monthly evolution table */}
      {monthly && !month && (
        <div style={{ background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)', padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
              Évolution mensuelle {year}
            </h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Appros / Pertes{hasVente ? ' / Ventes' : ''} par mois</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700 }}>Mois</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right', color: '#2563eb', fontSize: '0.72rem', fontWeight: 700 }}>Appros</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right', color: '#2563eb', fontSize: '0.72rem', fontWeight: 700 }}>Valeur appros</th>
                  <th style={{ padding: '7px 10px', textAlign: 'right', color: '#dc2626', fontSize: '0.72rem', fontWeight: 700 }}>Pertes</th>
                  {kpis.pertesValeur > 0 && <th style={{ padding: '7px 10px', textAlign: 'right', color: '#dc2626', fontSize: '0.72rem', fontWeight: 700 }}>Valeur pertes</th>}
                  {hasVente && <th style={{ padding: '7px 10px', textAlign: 'right', color: '#16a34a', fontSize: '0.72rem', fontWeight: 700 }}>Ventes</th>}
                  {hasVente && <th style={{ padding: '7px 10px', textAlign: 'right', color: '#16a34a', fontSize: '0.72rem', fontWeight: 700 }}>CA ventes</th>}
                </tr>
              </thead>
              <tbody>
                {MONTHS_FR.map((m, i) => {
                  const isCurrentMonth = i === new Date().getMonth() && year === currentYear;
                  const hasData = monthly.approsCount[i] > 0 || monthly.pertesCount[i] > 0 || (hasVente && monthly.venteCount[i] > 0);
                  return (
                    <tr key={m} style={{
                      background: isCurrentMonth ? (isLabo ? '#faf5ff' : '#ecfdf5') : 'transparent',
                      borderBottom: '1px solid var(--border)',
                      opacity: hasData || isCurrentMonth ? 1 : 0.4,
                    }}>
                      <td style={{ padding: '6px 10px', fontWeight: isCurrentMonth ? 800 : 500, color: 'var(--text)' }}>
                        {MONTHS_FR[i]}
                        {isCurrentMonth && <span style={{ fontSize: '0.62rem', color: themeColor, marginLeft: 6 }}>← actuel</span>}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: monthly.approsCount[i] > 0 ? '#2563eb' : 'var(--text-muted)' }}>
                        {monthly.approsCount[i] > 0 ? monthly.approsCount[i] : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: monthly.approsValeur[i] > 0 ? '#2563eb' : 'var(--text-muted)' }}>
                        {monthly.approsValeur[i] > 0 ? `${fmt(monthly.approsValeur[i])} DT` : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: monthly.pertesCount[i] > 0 ? '#dc2626' : 'var(--text-muted)' }}>
                        {monthly.pertesCount[i] > 0 ? monthly.pertesCount[i] : '—'}
                      </td>
                      {kpis.pertesValeur > 0 && (
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: monthly.pertesValeur[i] > 0 ? '#dc2626' : 'var(--text-muted)' }}>
                          {monthly.pertesValeur[i] > 0 ? `${fmt(monthly.pertesValeur[i])} DT` : '—'}
                        </td>
                      )}
                      {hasVente && (
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: monthly.venteCount[i] > 0 ? '#16a34a' : 'var(--text-muted)' }}>
                          {monthly.venteCount[i] > 0 ? monthly.venteCount[i] : '—'}
                        </td>
                      )}
                      {hasVente && (
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: monthly.venteCA[i] > 0 ? '#16a34a' : 'var(--text-muted)' }}>
                          {monthly.venteCA[i] > 0 ? `${fmt(monthly.venteCA[i])} DT` : '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg)', borderTop: '2px solid var(--border)' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 800, color: 'var(--text)', fontSize: '0.75rem' }}>Total {year}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#2563eb' }}>{kpis.approsCount}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#2563eb' }}>{fmt(kpis.approsValeur)} DT</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>{kpis.pertesCount}</td>
                  {kpis.pertesValeur > 0 && <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>{fmt(kpis.pertesValeur)} DT</td>}
                  {hasVente && <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{kpis.venteCount ?? 0}</td>}
                  {hasVente && <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{fmt(kpis.venteCA ?? 0)} DT</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* When month is selected, show selected month summary */}
      {month && (
        <div style={{ background: 'var(--card-bg)', borderRadius: 14, border: `1.5px solid ${themeColor}44`, padding: '14px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Affichage filtré sur <strong style={{ color: themeColor }}>{MONTHS_LONG[month - 1]} {year}</strong>
          {typeAppro && <> — type <strong style={{ color: TYPE_COLORS[typeAppro] || themeColor }}>{TYPE_LABELS[typeAppro] || typeAppro}</strong></>}
        </div>
      )}
    </div>
  );
}
