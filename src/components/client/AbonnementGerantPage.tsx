import { useEffect, useState } from 'react';
import api from '../../api/client';

interface AbonnementResume {
  modeCompte: string;
  dateDebut: string | null;
  prolongationJours: number;
  nbActivites: number | null;
  nbLabos: number | null;
  nbGerants: number | null;
  clientNom: string;
}

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  actif:        { label: 'Actif',        color: 'bg-emerald-100 text-emerald-700' },
  read_only:    { label: 'Lecture seule', color: 'bg-amber-100 text-amber-700' },
  bloque:       { label: 'Bloqué',        color: 'bg-red-100 text-red-700' },
  archive:      { label: 'Archivé',       color: 'bg-gray-100 text-gray-600' },
  onboarding:   { label: 'Onboarding',    color: 'bg-blue-100 text-blue-700' },
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function AbonnementGerantPage() {
  const [data, setData] = useState<AbonnementResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/gerant/abonnement')
      .then((res) => setData(res.data))
      .catch(() => setError('Impossible de charger les informations d'abonnement.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-6 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
        {error || 'Données introuvables.'}
      </div>
    );
  }

  const modeInfo = MODE_LABELS[data.modeCompte] ?? { label: data.modeCompte, color: 'bg-gray-100 text-gray-600' };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-800">Mon abonnement</h1>
        <p className="text-sm text-gray-500 mt-1">Informations sur le compte de <span className="font-medium">{data.clientNom}</span></p>
      </div>

      {/* Status card */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm divide-y divide-gray-50">
        <div className="p-5 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Statut du compte</span>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${modeInfo.color}`}>
            {modeInfo.label}
          </span>
        </div>

        <div className="p-5 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">Date de début</span>
          <span className="text-sm text-gray-800">{formatDate(data.dateDebut)}</span>
        </div>

        {data.prolongationJours > 0 && (
          <div className="p-5 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">Prolongation accordée</span>
            <span className="text-sm text-emerald-700 font-medium">+{data.prolongationJours} jour{data.prolongationJours > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Quotas */}
      {(data.nbActivites != null || data.nbLabos != null || data.nbGerants != null) && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
          <div className="px-5 pt-5 pb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Quotas inclus</p>
          </div>
          <div className="divide-y divide-gray-50">
            {data.nbActivites != null && (
              <div className="p-5 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Activités</span>
                <span className="text-sm font-bold text-gray-800">{data.nbActivites}</span>
              </div>
            )}
            {data.nbLabos != null && (
              <div className="p-5 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Labos</span>
                <span className="text-sm font-bold text-gray-800">{data.nbLabos}</span>
              </div>
            )}
            {data.nbGerants != null && (
              <div className="p-5 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Gérants</span>
                <span className="text-sm font-bold text-gray-800">{data.nbGerants}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center pb-4">
        Cette page est en lecture seule. Pour toute modification, contactez l'administrateur.
      </p>
    </div>
  );
}
