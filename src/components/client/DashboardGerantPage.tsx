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
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatCurrency(v: number) {
  return v.toLocaleString('fr-TN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' DT';
}

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

  const prenom = user?.nom?.split(' ')[0] ?? 'Gérant';
  const activiteLabel = data?.type === 'labo' ? 'Labo' : 'Activité';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!data?.kpis) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow-sm border border-gray-100 text-center">
        <div className="text-4xl mb-4">👋</div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Bienvenue, {prenom}</h2>
        <p className="text-gray-500">
          Votre compte gérant n'est pas encore assigné à une activité ou un labo.
          Contactez l'administrateur pour configurer votre accès.
        </p>
      </div>
    );
  }

  const { kpis } = data;
  const now = new Date();
  const monthLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-500 rounded-2xl p-6 text-white shadow-md">
        <p className="text-emerald-100 text-sm font-medium uppercase tracking-wider mb-1">Tableau de bord</p>
        <h1 className="text-2xl font-bold">Bonjour, {prenom} 👋</h1>
        <p className="text-emerald-100 mt-1">
          {activiteLabel} : <span className="font-semibold text-white">{data.activiteNom}</span>
        </p>
      </div>

      {/* KPI Cards — current month */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
          Ce mois — {monthLabel}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Approvisionnements */}
          <KpiCard
            icon="📦"
            label="Approvisionnements"
            value={String(kpis.approsCount)}
            sub={kpis.approsValeur > 0 ? `Valeur : ${formatCurrency(kpis.approsValeur)}` : undefined}
            color="emerald"
            link={
              data.type === 'labo'
                ? `/client/labo/historique-appro?laboId=${user?.gerantActiviteId}`
                : `/client/stock/historique?activiteId=${user?.gerantActiviteId}`
            }
            linkLabel="Voir historique"
          />

          {/* Pertes */}
          <KpiCard
            icon="🗑️"
            label="Pertes enregistrées"
            value={String(kpis.pertesCount)}
            sub={kpis.pertesValeur > 0 ? `Valeur : ${formatCurrency(kpis.pertesValeur)}` : undefined}
            color="red"
            link={
              data.type === 'labo'
                ? `/client/labo/historique-pertes?laboId=${user?.gerantActiviteId}`
                : `/client/stock/historique-pertes?activiteId=${user?.gerantActiviteId}`
            }
            linkLabel="Voir pertes"
          />
        </div>
      </div>

      {/* Stock summary */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Stock</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KpiCard
            icon="🏪"
            label="Articles en stock"
            value={String(kpis.ingredientsCount)}
            sub="Articles approvisionnés au total"
            color="blue"
            link={
              data.type === 'labo'
                ? `/client/labo/stock?laboId=${user?.gerantActiviteId}`
                : `/client/stock?section=activite&activiteId=${user?.gerantActiviteId}`
            }
            linkLabel="Voir le stock"
          />

          <KpiCard
            icon="📋"
            label="Dernier inventaire"
            value={formatDate(kpis.dernierInventaire)}
            sub={kpis.dernierInventaire ? undefined : 'Aucun inventaire effectué'}
            color="amber"
            link={
              data.type === 'labo'
                ? `/client/labo/inventaire?laboId=${user?.gerantActiviteId}`
                : `/client/inventaire/historique?section=activite&activiteId=${user?.gerantActiviteId}`
            }
            linkLabel="Voir inventaires"
          />
        </div>
      </div>
    </div>
  );
}

interface KpiCardProps {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  color: 'emerald' | 'red' | 'blue' | 'amber';
  link?: string;
  linkLabel?: string;
}

const colorMap = {
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', icon: 'bg-emerald-100 text-emerald-700', value: 'text-emerald-700', link: 'text-emerald-600 hover:text-emerald-800' },
  red:     { bg: 'bg-red-50',     border: 'border-red-100',     icon: 'bg-red-100 text-red-700',         value: 'text-red-700',     link: 'text-red-600 hover:text-red-800' },
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-100',    icon: 'bg-blue-100 text-blue-700',        value: 'text-blue-700',    link: 'text-blue-600 hover:text-blue-800' },
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-100',   icon: 'bg-amber-100 text-amber-700',      value: 'text-amber-700',   link: 'text-amber-600 hover:text-amber-800' },
};

function KpiCard({ icon, label, value, sub, color, link, linkLabel }: KpiCardProps) {
  const c = colorMap[color];
  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-5 flex flex-col gap-2`}>
      <div className="flex items-center gap-3">
        <span className={`${c.icon} rounded-lg w-10 h-10 flex items-center justify-center text-xl`}>{icon}</span>
        <span className="text-sm font-medium text-gray-600">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${c.value}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
      {link && linkLabel && (
        <Link to={link} className={`text-xs font-medium ${c.link} mt-1 self-start`}>
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}
