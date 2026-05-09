import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { Abonnement, Paiement, Promotion } from '../../types';

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

  // promotions
  const [promoType, setPromoType] = useState<Promotion['type']>('percent_off');
  const [promoAppliesTo, setPromoAppliesTo] = useState<Promotion['appliesTo']>('mensualite');
  const [promoDiscountOb, setPromoDiscountOb] = useState('');
  const [promoDiscountMens, setPromoDiscountMens] = useState('');
  const [promoFixedOb, setPromoFixedOb] = useState('');
  const [promoFixedMens, setPromoFixedMens] = useState('');
  const [promoDateDebut, setPromoDateDebut] = useState('');
  const [promoMonths, setPromoMonths] = useState('');
  const [promoNotes, setPromoNotes] = useState('');
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoDeleting, setPromoDeleting] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState('');
  const [confirmSending, setConfirmSending] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{ inviteUrl?: string | null } | null>(null);

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
    setConfirmResult(null);
    setPromoError(null);
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

  const handleConfirmInvite = async () => {
    if (!selected) return;
    setConfirmSending(true);
    setConfirmResult(null);
    try {
      const res = await api.post(`/api/abonnements/client/${selected.clientId}/confirm-invite`);
      setConfirmResult(res.data);
      setSelected((s) => s ? { ...s, inviteSent: true } : s);
      setAbonnements((list) => list.map((a) => a.clientId === selected.clientId ? { ...a, inviteSent: true } : a));
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erreur lors de l\'envoi');
    } finally {
      setConfirmSending(false);
    }
  };

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

  const [promoError, setPromoError] = useState<string | null>(null);

  const savePromotion = async () => {
    if (!selected || !promoDateDebut) return;
    setPromoSaving(true);
    setPromoError(null);
    try {
      await api.post(`/api/abonnements/client/${selected.clientId}/promotions`, {
        type: promoType,
        appliesTo: promoAppliesTo,
        discountOnboarding: promoDiscountOb ? Number(promoDiscountOb) : undefined,
        discountMensualite: promoDiscountMens ? Number(promoDiscountMens) : undefined,
        fixedOnboarding: promoFixedOb ? Number(promoFixedOb) : undefined,
        fixedMensualite: promoFixedMens ? Number(promoFixedMens) : undefined,
        dateDebut: promoDateDebut,
        monthsDuration: promoMonths ? Number(promoMonths) : undefined,
        notes: promoNotes || undefined,
      });
      setPromoDateDebut(''); setPromoMonths(''); setPromoNotes('');
      setPromoDiscountOb(''); setPromoDiscountMens(''); setPromoFixedOb(''); setPromoFixedMens('');
      await openDetail(selected);
      fetchList();
    } catch (err: any) {
      setPromoError(err?.response?.data?.message || 'Erreur lors de l\'ajout');
    } finally {
      setPromoSaving(false);
    }
  };

  const deletePromo = async (promoId: number) => {
    if (!selected) return;
    setPromoDeleting(promoId);
    try {
      await api.delete(`/api/abonnements/promotions/${promoId}`);
      await openDetail(selected);
      fetchList();
    } finally {
      setPromoDeleting(null);
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 12,
                      background: m.color + '20', color: m.color,
                    }}>{m.label}</span>
                    {ab.hasActivePromo && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: '#fef3c7', color: '#92400e' }}>🏷️ Promo</span>
                    )}
                  </div>
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

            {/* Confirm invite banner */}
            {!selected.inviteSent && (
              <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e', marginBottom: 10 }}>
                  Invitation non envoyée — l'abonnement doit être confirmé avant que le client puisse activer son compte.
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={handleConfirmInvite} disabled={confirmSending}
                    style={{ padding: '7px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    {confirmSending ? 'Envoi...' : 'Confirmer et envoyer l\'invitation'}
                  </button>
                  {confirmResult?.inviteUrl && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <code style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', wordBreak: 'break-all', color: '#78350f' }}>
                        {confirmResult.inviteUrl}
                      </code>
                      <button className="btn btn-sm btn-ghost" style={{ borderColor: '#d97706', color: '#d97706' }}
                        onClick={() => navigator.clipboard.writeText(confirmResult!.inviteUrl!)}>
                        Copier
                      </button>
                    </div>
                  )}
                  {confirmResult && !confirmResult.inviteUrl && (
                    <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 13 }}>Invitation envoyée avec succès</span>
                  )}
                </div>
              </div>
            )}

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

            {/* Promotions */}
            <div style={{ background: '#fffbeb', borderRadius: 10, padding: 16, border: '1px solid #fde68a', marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 12 }}>🏷️ Promotions</div>

              {/* Active promos list */}
              {selected.promotions && selected.promotions.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#fef3c7' }}>
                        {['Type', 'Appliqué à', 'Réduction', 'Période', 'Notes', ''].map((h) => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#78350f', borderBottom: '1px solid #fde68a' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.promotions.map((p) => {
                        const typeLabel = p.type === 'percent_off' ? '% Réduction' : p.type === 'free_months' ? 'Mois gratuits' : 'Prix fixe';
                        const appliesLabel = p.appliesTo === 'onboarding' ? 'Onboarding' : p.appliesTo === 'mensualite' ? 'Mensualité' : 'Les deux';
                        let remiseStr = '';
                        if (p.type === 'percent_off') {
                          const parts = [];
                          if (p.discountOnboarding) parts.push(`OB: -${p.discountOnboarding}%`);
                          if (p.discountMensualite) parts.push(`Mens: -${p.discountMensualite}%`);
                          remiseStr = parts.join(' / ') || '—';
                        } else if (p.type === 'free_months') {
                          remiseStr = '100% (gratuit)';
                        } else {
                          const parts = [];
                          if (p.fixedOnboarding) parts.push(`OB: ${p.fixedOnboarding} DT`);
                          if (p.fixedMensualite) parts.push(`Mens: ${p.fixedMensualite} DT`);
                          remiseStr = parts.join(' / ') || '—';
                        }
                        const periode = p.dateFin
                          ? `${fmtDate(p.dateDebut)} → ${fmtDate(p.dateFin)}`
                          : `${fmtDate(p.dateDebut)} (permanent)`;
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid #fef3c7', background: p.isActive ? '#fffbeb' : '#f9fafb' }}>
                            <td style={{ padding: '6px 10px' }}>
                              <span style={{ fontWeight: 600, color: p.isActive ? '#92400e' : '#6b7280' }}>{typeLabel}</span>
                              {p.isActive && <span style={{ marginLeft: 4, fontSize: 10, background: '#fbbf24', color: '#fff', borderRadius: 6, padding: '1px 5px', fontWeight: 700 }}>Actif</span>}
                            </td>
                            <td style={{ padding: '6px 10px', color: '#374151' }}>{appliesLabel}</td>
                            <td style={{ padding: '6px 10px', color: '#374151', fontWeight: 600 }}>{remiseStr}</td>
                            <td style={{ padding: '6px 10px', color: '#6b7280', fontSize: 11 }}>{periode}</td>
                            <td style={{ padding: '6px 10px', color: '#9ca3af', fontSize: 11 }}>{p.notes || '—'}</td>
                            <td style={{ padding: '6px 10px' }}>
                              <button
                                onClick={() => deletePromo(p.id)}
                                disabled={promoDeleting === p.id}
                                style={{ padding: '3px 8px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
                              >
                                {promoDeleting === p.id ? '…' : '✕'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add promo form */}
              <div style={{ fontSize: 12, fontWeight: 600, color: '#78350f', marginBottom: 8 }}>Ajouter une promotion</div>
              {(() => {
                const activePromos = selected.promotions?.filter((p) => p.isActive) || [];
                const blockedMens = activePromos.some((p) => ['mensualite', 'les_deux'].includes(p.appliesTo));
                const blockedOb = activePromos.some((p) => ['onboarding', 'les_deux'].includes(p.appliesTo));
                const blockedLesDeux = blockedMens || blockedOb;
                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Type</label>
                        <select value={promoType} onChange={(e) => setPromoType(e.target.value as Promotion['type'])}
                          style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12 }}>
                          <option value="percent_off">% Réduction</option>
                          <option value="free_months">Mois gratuits</option>
                          <option value="fixed_price">Prix fixe</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Appliqué à</label>
                        <select value={promoAppliesTo} onChange={(e) => setPromoAppliesTo(e.target.value as Promotion['appliesTo'])}
                          style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12 }}>
                          <option value="mensualite" disabled={blockedMens}>Mensualité{blockedMens ? ' (promo active)' : ''}</option>
                          <option value="onboarding" disabled={blockedOb}>Onboarding{blockedOb ? ' (promo active)' : ''}</option>
                          <option value="les_deux" disabled={blockedLesDeux}>Les deux{blockedLesDeux ? ' (promo active)' : ''}</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Date début</label>
                        <input type="date" value={promoDateDebut} onChange={(e) => setPromoDateDebut(e.target.value)}
                          min={selected.dateDebut}
                          style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12, boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    {promoError && (
                      <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#dc2626', marginBottom: 8 }}>
                        {promoError}
                      </div>
                    )}
                  </>
                );
              })()}

              {promoType !== 'free_months' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
                  {promoType === 'percent_off' && (promoAppliesTo === 'onboarding' || promoAppliesTo === 'les_deux') && (
                    <div>
                      <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>% Onboarding</label>
                      <input type="number" min="0" max="100" step="0.5" placeholder="ex: 20" value={promoDiscountOb} onChange={(e) => setPromoDiscountOb(e.target.value)}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12, boxSizing: 'border-box' }} />
                    </div>
                  )}
                  {promoType === 'percent_off' && (promoAppliesTo === 'mensualite' || promoAppliesTo === 'les_deux') && (
                    <div>
                      <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>% Mensualité</label>
                      <input type="number" min="0" max="100" step="0.5" placeholder="ex: 30" value={promoDiscountMens} onChange={(e) => setPromoDiscountMens(e.target.value)}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12, boxSizing: 'border-box' }} />
                    </div>
                  )}
                  {promoType === 'fixed_price' && (promoAppliesTo === 'onboarding' || promoAppliesTo === 'les_deux') && (
                    <div>
                      <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Montant OB (DT)</label>
                      <input type="number" min="0" step="0.01" placeholder="ex: 800" value={promoFixedOb} onChange={(e) => setPromoFixedOb(e.target.value)}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12, boxSizing: 'border-box' }} />
                    </div>
                  )}
                  {promoType === 'fixed_price' && (promoAppliesTo === 'mensualite' || promoAppliesTo === 'les_deux') && (
                    <div>
                      <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Montant Mens (DT)</label>
                      <input type="number" min="0" step="0.01" placeholder="ex: 140" value={promoFixedMens} onChange={(e) => setPromoFixedMens(e.target.value)}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12, boxSizing: 'border-box' }} />
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 10, alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Durée (mois)</label>
                  <input type="number" min="1" max="120" placeholder="vide = permanent" value={promoMonths} onChange={(e) => setPromoMonths(e.target.value)}
                    style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Notes</label>
                  <input placeholder="optionnel" value={promoNotes} onChange={(e) => setPromoNotes(e.target.value)}
                    style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12, boxSizing: 'border-box' }} />
                </div>
                <div />
                <button onClick={savePromotion} disabled={promoSaving || !promoDateDebut}
                  style={{ padding: '6px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {promoSaving ? '…' : '+ Ajouter'}
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
