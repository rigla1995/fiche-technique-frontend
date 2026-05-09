import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';

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

const fmtDate  = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const fmtMois  = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—';

interface PaiementRow {
  id: number;
  mois: string;
  montantDt: number | null;
  statut: string;
  dateSaisie: string | null;
  notes: string | null;
  clientId: number;
  compteType: string;
  clientNom: string;
  clientEmail: string;
}

export default function HistoriquePaiementsAdmin() {
  const [rows, setRows]         = useState<PaiementRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filtStatut, setFiltStatut] = useState('');
  const [filtMois, setFiltMois] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filtStatut) params.statut = filtStatut;
      if (filtMois)   params.mois   = filtMois + '-01';
      const res = await api.get('/api/abonnements/all-paiements', { params });
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, [filtStatut, filtMois]);

  useEffect(() => { load(); }, [load]);

  const displayed = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.clientNom || '').toLowerCase().includes(q) || (r.clientEmail || '').toLowerCase().includes(q);
  });

  const totalMontant = displayed.reduce((s, r) => s + (parseFloat(String(r.montantDt ?? 0)) || 0), 0);
  const countPayé    = displayed.filter((r) => r.statut === 'payé').length;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 6 }}>Historique paiements</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>Tous les paiements mensualités, tous clients confondus.</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total lignes', value: displayed.length, color: '#2563eb' },
          { label: 'Payés', value: countPayé, color: '#16a34a' },
          { label: 'Montant total', value: `${totalMontant.toFixed(2)} DT`, color: '#7c3aed' },
        ].map((k) => (
          <div key={k.label} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 18px' }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, marginTop: 2 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          placeholder="Rechercher client..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, minWidth: 200 }}
        />
        <select value={filtStatut} onChange={(e) => setFiltStatut(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input
          type="month" value={filtMois} onChange={(e) => setFiltMois(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}
        />
        {(filtStatut || filtMois || search) && (
          <button onClick={() => { setFiltStatut(''); setFiltMois(''); setSearch(''); }}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f3f4f6', fontSize: 13, cursor: 'pointer', color: '#6b7280' }}>
            Réinitialiser
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Chargement...</div>
        ) : displayed.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Aucun paiement trouvé</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Client', 'Type', 'Mois', 'Montant', 'Statut', 'Saisi le', 'Notes'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{r.clientNom}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.clientEmail}</div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: r.compteType === 'entreprise' ? '#fef9c3' : '#ede9fe', color: r.compteType === 'entreprise' ? '#854d0e' : '#6d28d9', fontWeight: 600 }}>
                      {r.compteType === 'entreprise' ? 'Entreprise' : 'Indép.'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#374151' }}>{fmtMois(r.mois)}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: r.statut === 'gratuit' ? '#16a34a' : '#111827' }}>
                    {r.statut === 'gratuit' ? 'Gratuit' : r.montantDt != null ? `${r.montantDt} DT` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 10,
                      background: (STATUT_COLORS[r.statut] || '#6b7280') + '20',
                      color: STATUT_COLORS[r.statut] || '#6b7280',
                    }}>{STATUT_LABELS[r.statut] || r.statut}</span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>{r.dateSaisie ? fmtDate(r.dateSaisie) : '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
