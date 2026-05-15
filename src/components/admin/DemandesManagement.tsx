import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Demande } from '../../types';

const STATUT_COLORS: Record<string, { bg: string; color: string }> = {
  en_attente:  { bg: '#fef9c3', color: '#854d0e' },
  validée:     { bg: '#dcfce7', color: '#166534' },
  refusée:     { bg: '#fee2e2', color: '#991b1b' },
};

const TYPE_LABELS: Record<string, string> = {
  gerant_sup:         'Gérant supplémentaire',
  labo_sup:           'Labo supplémentaire',
  upgrade_entreprise: 'Passage compte Entreprise',
};

const STATUT_OPTIONS = [
  { value: '',           label: 'Toutes' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'validée',    label: 'Validées' },
  { value: 'refusée',    label: 'Refusées' },
];

const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

export default function DemandesManagement() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatut, setFilterStatut] = useState('en_attente');
  const [traiting, setTraiting] = useState<Record<number, boolean>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [montantMigration, setMontantMigration] = useState<Record<number, string>>({});

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

  const traiter = async (id: number, statut: 'validée' | 'refusée', isUpgrade?: boolean) => {
    setTraiting((t) => ({ ...t, [id]: true }));
    try {
      const payload: Record<string, unknown> = { statut, notesAdmin: notes[id] || undefined };
      if (isUpgrade && montantMigration[id] !== undefined) {
        payload.montantMigration = parseFloat(montantMigration[id]) || 0;
      }
      await api.put(`/api/abonnements/admin/demandes/${id}`, payload);
      fetchDemandes();
    } finally {
      setTraiting((t) => ({ ...t, [id]: false }));
    }
  };

  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #18181b 0%, #27272a 55%, #52525b 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(39,39,42,0.28)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📨</div>
        <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Demandes clients</h1>
      </div>

      {/* Filter row */}
      <div style={{
        background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8,
        padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16,
      }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: 4 }}>Statut :</span>
        {STATUT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilterStatut(opt.value)}
            className={`btn btn-sm ${filterStatut === opt.value ? 'btn-primary' : 'btn-ghost'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : demandes.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📨</span>
          <p>Aucune demande</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {demandes.map((d) => {
            const sc = STATUT_COLORS[d.statut] || STATUT_COLORS.en_attente;
            return (
              <div key={d.id} className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{d.demandeurNom}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {d.demandeurType} — demande du {fmtDate(d.createdAt)}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px',
                    borderRadius: 12, background: sc.bg, color: sc.color,
                  }}>
                    {d.statut}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 24, fontSize: '0.83rem', color: 'var(--text)', marginBottom: 12, flexWrap: 'wrap' }}>
                  <div><strong>Type :</strong> {TYPE_LABELS[d.typeDemande] || d.typeDemande}</div>
                  {d.typeDemande === 'upgrade_entreprise' ? (
                    <>
                      <div><strong>Onboarding client payé :</strong> {d.montantOnboardingClient != null ? `${d.montantOnboardingClient} DT` : '—'}</div>
                      <div><strong>Frais de migration :</strong> {d.montantMensuelDt != null ? `${d.montantMensuelDt} DT` : '—'}</div>
                    </>
                  ) : (
                    <div><strong>Montant :</strong> {d.montantMensuelDt ? `${d.montantMensuelDt} DT/mois` : '—'}</div>
                  )}
                  {d.notesClient && <div><strong>Note client :</strong> {d.notesClient}</div>}
                </div>

                {d.statut === 'en_attente' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    {d.typeDemande === 'upgrade_entreprise' && (
                      <div>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
                          Frais de migration (DT)
                        </label>
                        <input
                          type="number"
                          className="input"
                          style={{ width: 110 }}
                          value={montantMigration[d.id] ?? (d.montantMensuelDt ?? '')}
                          onChange={(e) => setMontantMigration((m) => ({ ...m, [d.id]: e.target.value }))}
                        />
                      </div>
                    )}
                    <input
                      className="input"
                      style={{ flex: 1, minWidth: 160 }}
                      placeholder="Note admin (optionnel)"
                      value={notes[d.id] || ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                    />
                    <button
                      className="btn btn-sm"
                      style={{ background: '#16a34a', color: '#fff', border: 'none' }}
                      onClick={() => traiter(d.id, 'validée', d.typeDemande === 'upgrade_entreprise')}
                      disabled={traiting[d.id]}
                    >
                      {traiting[d.id] ? '…' : 'Valider'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => traiter(d.id, 'refusée', d.typeDemande === 'upgrade_entreprise')}
                      disabled={traiting[d.id]}
                    >
                      Refuser
                    </button>
                  </div>
                )}

                {d.statut !== 'en_attente' && d.notesAdmin && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
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
