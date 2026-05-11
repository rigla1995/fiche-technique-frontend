import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';

const TYPE_LABELS: Record<string, string> = {
  percent_off:  '% Réduction',
  free_months:  'Mois gratuits',
  fixed_price:  'Prix fixe',
};
const APPLIES_LABELS: Record<string, string> = {
  onboarding:        'OnBoarding',
  mensualite:        'Mensualité',
  supplement_gerant: 'Sup. Gérant',
  supplement_labo:   'Sup. Labo',
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
  compteType: string;
  clientNom: string;
  clientEmail: string;
}

function promoRemise(p: PromoRow): string {
  if (p.type === 'free_months') return 'Gratuit (100%)';
  if (p.type === 'percent_off') {
    const parts: string[] = [];
    if (p.discountOnboarding) parts.push(`OB: -${p.discountOnboarding}%`);
    if (p.discountMensualite) parts.push(`Mens: -${p.discountMensualite}%`);
    if (p.discountSupplement) parts.push(`Sup: -${p.discountSupplement}%`);
    return parts.join(' / ') || '—';
  }
  const parts: string[] = [];
  if (p.fixedOnboarding) parts.push(`OB: ${p.fixedOnboarding} DT`);
  if (p.fixedMensualite) parts.push(`Mens: ${p.fixedMensualite} DT`);
  if (p.fixedSupplement) parts.push(`Sup: ${p.fixedSupplement} DT`);
  return parts.join(' / ') || '—';
}

export default function HistoriquePromotionsAdmin() {
  const [rows, setRows]       = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filtType, setFiltType]         = useState('');
  const [filtAppliesTo, setFiltAppliesTo] = useState('');
  const [filtActive, setFiltActive]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filtType)      params.type      = filtType;
      if (filtAppliesTo) params.appliesTo = filtAppliesTo;
      if (filtActive)    params.active    = filtActive;
      const res = await api.get('/api/abonnements/all-promotions', { params });
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, [filtType, filtAppliesTo, filtActive]);

  useEffect(() => { load(); }, [load]);

  const displayed = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.clientNom || '').toLowerCase().includes(q) || (r.clientEmail || '').toLowerCase().includes(q);
  });

  const countActive = displayed.filter((r) => r.isActive).length;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 6 }}>Historique promotions</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>Toutes les promotions accordées, tous clients confondus.</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total promos', value: displayed.length, color: '#2563eb' },
          { label: 'Actives en ce moment', value: countActive, color: '#16a34a' },
          { label: 'Expirées', value: displayed.length - countActive, color: '#6b7280' },
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
        <select value={filtType} onChange={(e) => setFiltType(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
          <option value="">Tous les types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filtAppliesTo} onChange={(e) => setFiltAppliesTo(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
          <option value="">Tous les champs</option>
          {Object.entries(APPLIES_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filtActive} onChange={(e) => setFiltActive(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }}>
          <option value="">Toutes (actives + expirées)</option>
          <option value="1">Actives uniquement</option>
        </select>
        {(filtType || filtAppliesTo || filtActive || search) && (
          <button onClick={() => { setFiltType(''); setFiltAppliesTo(''); setFiltActive(''); setSearch(''); }}
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
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Aucune promotion trouvée</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Client', 'Type', 'Appliqué à', 'Remise', 'Période', 'Statut', 'Notes'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6', background: r.isActive ? '#fffbeb' : undefined }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{r.clientNom}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.clientEmail}</div>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#374151' }}>{TYPE_LABELS[r.type] || r.type}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: '#ede9fe', color: '#6d28d9', fontWeight: 600 }}>
                      {APPLIES_LABELS[r.appliesTo] || r.appliesTo}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#374151' }}>{promoRemise(r)}</td>
                  <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 12 }}>
                    {fmtDate(r.dateDebut)} → {r.dateFin ? fmtDate(r.dateFin) : 'Permanent'}
                    {r.monthsDuration && <div style={{ fontSize: 10, color: '#9ca3af' }}>{r.monthsDuration} mois</div>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {r.isActive ? (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: '#fbbf2420', color: '#92400e' }}>Actif</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 10, background: '#f3f4f6', color: '#9ca3af' }}>Expiré</span>
                    )}
                  </td>
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
