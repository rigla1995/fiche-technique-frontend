import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Demande } from '../../types';

const STATUT_COLORS: Record<string, { bg: string; color: string }> = {
  en_attente: { bg: '#fef9c3', color: '#854d0e' },
  validée:    { bg: '#dcfce7', color: '#166534' },
  refusée:    { bg: '#fee2e2', color: '#991b1b' },
};

const TYPE_LABELS: Record<string, string> = {
  gerant_sup: 'Gérant supplémentaire',
  labo_sup:   'Labo supplémentaire',
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

export default function DemandesManagement() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatut, setFilterStatut] = useState('en_attente');
  const [traiting, setTraiting] = useState<Record<number, boolean>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  useEffect(() => { fetchDemandes(); }, [filterStatut]);

  const fetchDemandes = async () => {
    setLoading(true);
    try {
      const params = filterStatut ? `?statut=${filterStatut}` : '';
      const res = await api.get(`/api/abonnements/admin/demandes${params}`);
      setDemandes(res.data);
    } finally {
      setLoading(false);
    }
  };

  const traiter = async (id: number, statut: 'validée' | 'refusée') => {
    setTraiting((t) => ({ ...t, [id]: true }));
    try {
      await api.put(`/api/abonnements/admin/demandes/${id}`, { statut, notesAdmin: notes[id] || undefined });
      fetchDemandes();
    } finally {
      setTraiting((t) => ({ ...t, [id]: false }));
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111827' }}>Demandes clients</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {['', 'en_attente', 'validée', 'refusée'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatut(s)}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: filterStatut === s ? '#2563eb' : '#f3f4f6',
                color: filterStatut === s ? '#fff' : '#374151',
                border: 'none',
              }}
            >{s === '' ? 'Toutes' : s.charAt(0).toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Chargement...</div>
      ) : demandes.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Aucune demande</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {demandes.map((d) => {
            const sc = STATUT_COLORS[d.statut] || STATUT_COLORS.en_attente;
            return (
              <div key={d.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{d.demandeurNom}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      {d.demandeurType} — demande du {fmtDate(d.createdAt)}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 12, background: sc.bg, color: sc.color }}>
                    {d.statut}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 24, fontSize: 13, color: '#374151', marginBottom: 12 }}>
                  <div><strong>Type :</strong> {TYPE_LABELS[d.typeDemande] || d.typeDemande}</div>
                  <div><strong>Montant :</strong> {d.montantMensuelDt ? `${d.montantMensuelDt} DT/mois` : '—'}</div>
                  {d.notesClient && <div><strong>Note client :</strong> {d.notesClient}</div>}
                </div>

                {d.statut === 'en_attente' && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      placeholder="Note admin (optionnel)"
                      value={notes[d.id] || ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                    />
                    <button
                      onClick={() => traiter(d.id, 'validée')}
                      disabled={traiting[d.id]}
                      style={{ padding: '7px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                      {traiting[d.id] ? '...' : 'Valider'}
                    </button>
                    <button
                      onClick={() => traiter(d.id, 'refusée')}
                      disabled={traiting[d.id]}
                      style={{ padding: '7px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                      Refuser
                    </button>
                  </div>
                )}

                {d.statut !== 'en_attente' && d.notesAdmin && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    Note admin : {d.notesAdmin} — traité le {fmtDate(d.traite_le || '')} par {d.traiteParNom}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
