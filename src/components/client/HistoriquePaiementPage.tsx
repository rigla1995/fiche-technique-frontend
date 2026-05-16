import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { Paiement } from '../../types';

const STATUT_COLORS: Record<string, string> = {
  payé: '#16a34a', impayé: '#dc2626', en_attente: '#d97706', remisé: '#7c3aed', gratuit: '#16a34a',
};
const STATUT_LABELS: Record<string, string> = {
  payé: 'Payé', impayé: 'Impayé', en_attente: 'En attente', remisé: 'Remisé', gratuit: 'Gratuit',
};

const fmtMois = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—';
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const isoMois = (d: string) => d ? d.slice(0, 7) : '';

function resolveStatut(p: Paiement): string {
  if (p.statut === 'payé' || p.statut === 'remisé' || p.statut === 'gratuit') return p.statut;
  const now = new Date();
  const mois = new Date(p.mois);
  const moisStr = isoMois(p.mois);
  const currentStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (moisStr < currentStr) return 'impayé';
  return 'en_attente';
}

export default function HistoriquePaiementPage() {
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMois, setFilterMois] = useState('');
  const [filterStatut, setFilterStatut] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/abonnements/mon-abonnement');
      setPaiements(data.paiements || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const now = new Date();
  const currentMoisStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const sorted = [...paiements].sort((a, b) => a.mois < b.mois ? -1 : 1);

  const upcoming = sorted
    .filter(p => {
      const m = isoMois(p.mois);
      return m >= currentMoisStr && resolveStatut(p) === 'en_attente';
    })
    .slice(0, 3);

  const history = sorted
    .filter(p => isoMois(p.mois) < currentMoisStr || p.statut === 'payé' || p.statut === 'remisé' || p.statut === 'gratuit')
    .sort((a, b) => a.mois > b.mois ? -1 : 1);

  const filtered = history.filter(p => {
    if (filterMois && !isoMois(p.mois).startsWith(filterMois)) return false;
    if (filterStatut && resolveStatut(p) !== filterStatut) return false;
    return true;
  });

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Chargement…</div>;

  return (
    <div className="page">
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 60%, #3b82f6 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(30,64,175,0.25)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem', flexShrink: 0 }}>🧾</div>
        <div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 900, color: '#fff', margin: 0 }}>Historique paiements</h1>
          <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.85rem', margin: 0, marginTop: 4 }}>
            Vos paiements passés et les prochaines échéances
          </p>
        </div>
      </div>

      {/* Upcoming payments */}
      {upcoming.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #fde68a', overflow: 'hidden', boxShadow: '0 2px 8px rgba(217,119,6,0.1)', marginBottom: 24 }}>
          <div style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', padding: '14px 20px', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1rem' }}>📅</span>
            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#92400e' }}>Prochaines échéances</h3>
          </div>
          <div style={{ padding: '4px 0' }}>
            {upcoming.map((p, i) => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', borderBottom: i < upcoming.length - 1 ? '1px solid #fef3c7' : 'none',
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111827' }}>{fmtMois(p.mois)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 700, color: '#1e40af' }}>
                    {p.statut === 'gratuit' ? 'Gratuit' : p.montantDt != null ? `${p.montantDt} DT` : '—'}
                  </span>
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                    background: '#d97706' + '20', color: '#d97706',
                  }}>En attente</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>Mois / Année</label>
          <input type="month" value={filterMois} onChange={e => setFilterMois(e.target.value)}
            style={{ fontSize: '0.82rem', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', color: '#374151', background: '#f9fafb', cursor: 'pointer' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>Statut</label>
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}
            style={{ fontSize: '0.82rem', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', color: '#374151', background: '#f9fafb', cursor: 'pointer' }}>
            <option value="">Tous</option>
            <option value="payé">Payé</option>
            <option value="impayé">Impayé</option>
            <option value="en_attente">En attente</option>
            <option value="remisé">Remisé</option>
            <option value="gratuit">Gratuit</option>
          </select>
        </div>
        {(filterMois || filterStatut) && (
          <button onClick={() => { setFilterMois(''); setFilterStatut(''); }}
            style={{ fontSize: '0.78rem', padding: '5px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>
            Réinitialiser
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#9ca3af' }}>{filtered.length} enregistrement(s)</span>
      </div>

      {/* History table */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        {!filtered.length ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: '0.9rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
            Aucun paiement pour ces critères
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Mois', 'Montant', 'Statut', 'Date paiement'].map((h) => (
                    <th key={h} style={{ padding: '10px 20px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 700, color: '#374151', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const statut = resolveStatut(p);
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '12px 20px', color: '#111827', fontWeight: 600 }}>{fmtMois(p.mois)}</td>
                      <td style={{ padding: '12px 20px', color: '#374151', fontWeight: 700 }}>
                        {statut === 'gratuit' ? (
                          <span style={{ color: '#16a34a', fontWeight: 700 }}>Gratuit</span>
                        ) : p.montantDt != null ? `${p.montantDt} DT` : '—'}
                      </td>
                      <td style={{ padding: '12px 20px' }}>
                        <span style={{
                          fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                          background: (STATUT_COLORS[statut] || '#6b7280') + '20',
                          color: STATUT_COLORS[statut] || '#6b7280',
                        }}>{STATUT_LABELS[statut] || statut}</span>
                      </td>
                      <td style={{ padding: '12px 20px', color: '#6b7280' }}>{p.datePaiement ? fmtDate(p.datePaiement) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
