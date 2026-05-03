import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { Abonnement, Paiement } from '../../types';

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  actif:     { label: 'Actif',        color: '#16a34a' },
  read_only: { label: 'Lecture seule', color: '#d97706' },
  desactive: { label: 'Désactivé',    color: '#dc2626' },
  archive:   { label: 'Archivé',      color: '#6b7280' },
};

const STATUT_COLORS: Record<string, string> = {
  payé:       '#16a34a',
  impayé:     '#dc2626',
  en_attente: '#d97706',
  remisé:     '#7c3aed',
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const fmtMois = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—';

export default function AbonnementsManagement() {
  const [abonnements, setAbonnements] = useState<Abonnement[]>([]);
  const [selected, setSelected] = useState<Abonnement | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  // paiement form
  const [pMois, setPMois] = useState('');
  const [pStatut, setPStatut] = useState<Paiement['statut']>('payé');
  const [pMontant, setPMontant] = useState('');
  const [pNotes, setPNotes] = useState('');
  const [paving, setPaving] = useState(false);

  // prolongation
  const [prolongJours, setProlongJours] = useState(0);
  const [prolongSaving, setProlongSaving] = useState(false);

  // onboarding
  const [obStatut, setObStatut] = useState<'payé' | 'impayé' | 'offert'>('impayé');
  const [obSaving, setObSaving] = useState(false);

  // mode
  const [modeSaving, setModeSaving] = useState(false);

  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState('');

  useEffect(() => { fetchList(); }, []);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/abonnements/');
      setAbonnements(res.data);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = useCallback(async (ab: Abonnement) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/api/abonnements/client/${ab.clientId}`);
      setSelected(res.data);
      setProlongJours(res.data.prolongationJours || 0);
      setObStatut(res.data.statutOnboarding || 'impayé');
      setNotes(res.data.notes || '');
      // default paiement to current month
      const now = new Date();
      setPMois(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
      setPStatut('payé');
      setPMontant('');
      setPNotes('');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const savePaiement = async () => {
    if (!selected || !pMois) return;
    setPaving(true);
    try {
      await api.post(`/api/abonnements/client/${selected.clientId}/paiements`, {
        mois: pMois, statut: pStatut,
        montant: pMontant ? Number(pMontant) : undefined,
        notes: pNotes || undefined,
      });
      await openDetail(selected);
      fetchList();
    } finally {
      setPaving(false);
    }
  };

  const saveProlongation = async () => {
    if (!selected) return;
    setProlongSaving(true);
    try {
      await api.put(`/api/abonnements/client/${selected.clientId}/prolongation`, { jours: prolongJours });
      setSelected((s) => s ? { ...s, prolongationJours: prolongJours } : s);
      fetchList();
    } finally {
      setProlongSaving(false);
    }
  };

  const saveOnboarding = async () => {
    if (!selected) return;
    setObSaving(true);
    try {
      await api.put(`/api/abonnements/client/${selected.clientId}/onboarding`, { statut: obStatut });
      setSelected((s) => s ? { ...s, statutOnboarding: obStatut } : s);
    } finally {
      setObSaving(false);
    }
  };

  const saveMode = async (mode: string) => {
    if (!selected) return;
    setModeSaving(true);
    try {
      await api.put(`/api/abonnements/client/${selected.clientId}/mode`, { mode });
      setSelected((s) => s ? { ...s, modeCompte: mode as Abonnement['modeCompte'] } : s);
      fetchList();
    } finally {
      setModeSaving(false);
    }
  };

  const saveNotes = async () => {
    if (!selected) return;
    setNotesSaving(true);
    try {
      await api.put(`/api/abonnements/client/${selected.clientId}/notes`, { notes });
    } finally {
      setNotesSaving(false);
    }
  };

  const filtered = abonnements.filter((a) => {
    const matchSearch = !search ||
      a.clientNom?.toLowerCase().includes(search.toLowerCase()) ||
      a.clientEmail?.toLowerCase().includes(search.toLowerCase());
    const matchMode = !filterMode || a.modeCompte === filterMode;
    return matchSearch && matchMode;
  });

  return (
    <div style={{ display: 'flex', gap: 24, minHeight: 600 }}>
      {/* List panel */}
      <div style={{ flex: '0 0 420px', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>Abonnements</h2>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <input
              placeholder="Rechercher client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            />
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              <option value="">Tous</option>
              {Object.entries(MODE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ overflowY: 'auto', maxHeight: 600 }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Chargement...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Aucun abonnement</div>
          ) : filtered.map((ab) => {
            const m = MODE_LABELS[ab.modeCompte] || MODE_LABELS.actif;
            const isActive = selected?.clientId === ab.clientId;
            return (
              <div
                key={ab.id}
                onClick={() => openDetail(ab)}
                style={{
                  padding: '14px 20px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                  background: isActive ? '#eff6ff' : 'transparent',
                  borderLeft: isActive ? '3px solid #2563eb' : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{ab.clientNom}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{ab.clientEmail}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                      {ab.compteType === 'entreprise' ? 'Entreprise' : 'Indépendant'} — depuis {fmtDate(ab.dateDebut)}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 12,
                    background: m.color + '20', color: m.color,
                  }}>{m.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ flex: 1, background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 24, overflowY: 'auto' }}>
        {!selected ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: 80 }}>
            Sélectionner un abonnement pour voir le détail
          </div>
        ) : detailLoading ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: 80 }}>Chargement...</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111827' }}>{selected.clientNom}</h2>
                <div style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>{selected.clientEmail}</div>
                <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>
                  {selected.compteType === 'entreprise' ? 'Entreprise' : 'Indépendant'} — depuis {fmtDate(selected.dateDebut)}
                </div>
              </div>
              <span style={{
                fontSize: 13, fontWeight: 700, padding: '6px 14px', borderRadius: 20,
                background: (MODE_LABELS[selected.modeCompte]?.color || '#6b7280') + '20',
                color: MODE_LABELS[selected.modeCompte]?.color || '#6b7280',
              }}>
                {MODE_LABELS[selected.modeCompte]?.label || selected.modeCompte}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              {/* Onboarding */}
              <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Onboarding</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                  Montant : <strong>{selected.montantOnboarding ? `${selected.montantOnboarding} DT` : '—'}</strong>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={obStatut}
                    onChange={(e) => setObStatut(e.target.value as typeof obStatut)}
                    style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}
                  >
                    <option value="impayé">Impayé</option>
                    <option value="payé">Payé</option>
                    <option value="offert">Offert</option>
                  </select>
                  <button onClick={saveOnboarding} disabled={obSaving}
                    style={{ padding: '5px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                    {obSaving ? '...' : 'Sauv.'}
                  </button>
                </div>
              </div>

              {/* Prolongation */}
              <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Prolongation</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Actuel : {selected.prolongationJours} jours (max 30)</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="number" min={0} max={30}
                    value={prolongJours}
                    onChange={(e) => setProlongJours(Number(e.target.value))}
                    style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}
                  />
                  <button onClick={saveProlongation} disabled={prolongSaving}
                    style={{ padding: '5px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                    {prolongSaving ? '...' : 'Sauv.'}
                  </button>
                </div>
              </div>

              {/* Mode manuel */}
              <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Mode compte (manuel)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(MODE_LABELS).map(([k, v]) => (
                    <button
                      key={k}
                      disabled={modeSaving || selected.modeCompte === k}
                      onClick={() => saveMode(k)}
                      style={{
                        padding: '4px 10px', borderRadius: 8, border: `1px solid ${v.color}`,
                        background: selected.modeCompte === k ? v.color : 'transparent',
                        color: selected.modeCompte === k ? '#fff' : v.color,
                        fontSize: 12, cursor: 'pointer',
                      }}
                    >{v.label}</button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Notes internes</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
                />
                <button onClick={saveNotes} disabled={notesSaving}
                  style={{ marginTop: 6, padding: '4px 12px', background: '#374151', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                  {notesSaving ? '...' : 'Sauvegarder'}
                </button>
              </div>
            </div>

            {/* Paiement mensuel */}
            <div style={{ background: '#f0f9ff', borderRadius: 10, padding: 16, border: '1px solid #bae6fd', marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0369a1', marginBottom: 12 }}>Saisir un paiement mensuel</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 4 }}>Mois</label>
                  <input type="date" value={pMois} onChange={(e) => setPMois(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 4 }}>Statut</label>
                  <select value={pStatut} onChange={(e) => setPStatut(e.target.value as Paiement['statut'])}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
                    <option value="payé">Payé</option>
                    <option value="impayé">Impayé</option>
                    <option value="en_attente">En attente</option>
                    <option value="remisé">Remisé</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 4 }}>Montant DT</label>
                  <input type="number" placeholder="optionnel" value={pMontant} onChange={(e) => setPMontant(e.target.value)}
                    style={{ width: 100, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 4 }}>Notes</label>
                  <input placeholder="optionnel" value={pNotes} onChange={(e) => setPNotes(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
                </div>
                <button onClick={savePaiement} disabled={paving}
                  style={{ padding: '7px 18px', background: '#0369a1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  {paving ? '...' : 'Enregistrer'}
                </button>
              </div>
            </div>

            {/* Historique paiements */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
                Historique paiements ({selected.paiements?.length || 0})
              </div>
              {!selected.paiements?.length ? (
                <div style={{ color: '#9ca3af', fontSize: 13 }}>Aucun paiement enregistré</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['Mois', 'Montant', 'Statut', 'Saisie le', 'Notes'].map((h) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#374151' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.paiements.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '8px 12px', color: '#111827' }}>{fmtMois(p.mois)}</td>
                        <td style={{ padding: '8px 12px', color: '#374151' }}>{p.montantDt ? `${p.montantDt} DT` : '—'}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                            background: (STATUT_COLORS[p.statut] || '#6b7280') + '20',
                            color: STATUT_COLORS[p.statut] || '#6b7280',
                          }}>{p.statut}</span>
                        </td>
                        <td style={{ padding: '8px 12px', color: '#6b7280' }}>{p.dateSaisie ? fmtDate(p.dateSaisie) : '—'}</td>
                        <td style={{ padding: '8px 12px', color: '#6b7280' }}>{p.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
