import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { Abonnement, Promotion } from '../../types';

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  actif:     { label: 'Actif',        color: '#16a34a' },
  read_only: { label: 'Lecture seule', color: '#d97706' },
  desactive: { label: 'Désactivé',    color: '#dc2626' },
  archive:   { label: 'Archivé',      color: '#6b7280' },
  bloque:    { label: 'Bloqué',       color: '#7c3aed' },
};

const APPLIES_LABELS: Record<string, string> = {
  onboarding:       'OnBoarding',
  mensualite:       'Mensualité',
  supplement_gerant: 'Supplément Gérant',
  supplement_labo:   'Supplément Labo',
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const fmtMois = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—';

interface MontantMoisInfo {
  moisStr: string;
  existing: { montantDt: string | null; statut: string; datePaiement: string | null } | null;
  breakdown: {
    mensualite: { base: number; effectif: number; hasPromo: boolean };
    supplementGerant: { base: number; effectif: number; active: boolean; hasPromo: boolean };
    supplementLabo: { base: number; effectif: number; active: boolean; hasPromo: boolean };
  };
  total: number;
}

export default function AbonnementsManagement() {
  const [abonnements, setAbonnements] = useState<Abonnement[]>([]);
  const [selected, setSelected] = useState<Abonnement | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  // promo form
  const [promoType, setPromoType] = useState<Promotion['type']>('percent_off');
  const [promoAppliesTo, setPromoAppliesTo] = useState<string>('mensualite');
  const [promoMoisDebut, setPromoMoisDebut] = useState('');
  const [promoMonths, setPromoMonths] = useState('');
  const [promoDiscountVal, setPromoDiscountVal] = useState('');
  const [promoFixedVal, setPromoFixedVal] = useState('');
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoDeleting, setPromoDeleting] = useState<number | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  // onboarding
  const [obStatut, setObStatut] = useState<string>('impayé');
  const [obDatePaiement, setObDatePaiement] = useState('');
  const [obSaving, setObSaving] = useState(false);

  // mensualités
  const [pMois, setPMois] = useState('');
  const [pMontantInfo, setPMontantInfo] = useState<MontantMoisInfo | null>(null);
  const [pMontantLoading, setPMontantLoading] = useState(false);
  const [pStatut, setPStatut] = useState<string>('payé');
  const [pDatePaiement, setPDatePaiement] = useState('');
  const [paving, setPaving] = useState(false);

  // mode
  const [modeSaving, setModeSaving] = useState(false);

  // invite
  const [confirmSending, setConfirmSending] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{ inviteUrl?: string | null } | null>(null);

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
    setConfirmResult(null);
    setPromoError(null);
    setPMontantInfo(null);
    try {
      const res = await api.get(`/api/abonnements/client/${ab.clientId}?withPricing=1`);
      setSelected(res.data);
      setObStatut(res.data.statutOnboarding || 'impayé');
      setObDatePaiement(res.data.dateOnboarding ? res.data.dateOnboarding.slice(0, 10) : '');
      // Default mensualité month to current month
      const now = new Date();
      setPMois(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      setPStatut('payé');
      setPDatePaiement('');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Auto-fetch montant when pMois or selected changes
  const fetchMontantMois = useCallback(async (mois: string) => {
    if (!selected || !mois) return;
    setPMontantLoading(true);
    try {
      const res = await api.get(`/api/abonnements/client/${selected.clientId}/montant-mois`, { params: { mois } });
      setPMontantInfo(res.data);
      // Pre-fill statut from existing payment if any
      if (res.data.existing) {
        setPStatut(res.data.existing.statut);
        setPDatePaiement(res.data.existing.datePaiement ? res.data.existing.datePaiement.slice(0, 10) : '');
      } else {
        setPStatut('payé');
        setPDatePaiement('');
      }
    } catch {
      setPMontantInfo(null);
    } finally {
      setPMontantLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    if (pMois && selected) fetchMontantMois(pMois);
  }, [pMois, selected, fetchMontantMois]);

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

  const saveOnboarding = async () => {
    if (!selected) return;
    setObSaving(true);
    try {
      const res = await api.put(`/api/abonnements/client/${selected.clientId}/onboarding`, {
        statut: obStatut,
        datePaiement: obDatePaiement || undefined,
      });
      setSelected((s) => s ? { ...s, statutOnboarding: res.data.statutOnboarding, dateOnboarding: res.data.dateOnboarding } : s);
    } finally {
      setObSaving(false);
    }
  };

  const savePaiement = async () => {
    if (!selected || !pMois || !pMontantInfo) return;
    setPaving(true);
    try {
      await api.post(`/api/abonnements/client/${selected.clientId}/paiements`, {
        mois: pMois + '-01',
        statut: pStatut,
        montant: pMontantInfo.total,
        datePaiement: pDatePaiement || undefined,
      });
      await fetchMontantMois(pMois);
      fetchList();
    } finally {
      setPaving(false);
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

  const savePromotion = async () => {
    if (!selected || !promoMoisDebut) return;
    setPromoSaving(true);
    setPromoError(null);
    const dateDebut = promoMoisDebut + '-01';
    const body: Record<string, any> = {
      type: promoType,
      appliesTo: promoAppliesTo,
      dateDebut,
      monthsDuration: (promoAppliesTo !== 'onboarding' && promoMonths) ? Number(promoMonths) : undefined,
    };
    if (promoType !== 'free_months') {
      if (promoAppliesTo === 'onboarding') {
        if (promoType === 'percent_off') body.discountOnboarding = Number(promoDiscountVal);
        else body.fixedOnboarding = Number(promoFixedVal);
      } else if (promoAppliesTo === 'mensualite') {
        if (promoType === 'percent_off') body.discountMensualite = Number(promoDiscountVal);
        else body.fixedMensualite = Number(promoFixedVal);
      } else {
        // supplement_gerant / supplement_labo
        if (promoType === 'percent_off') body.discountSupplement = Number(promoDiscountVal);
        else body.fixedSupplement = Number(promoFixedVal);
      }
    }
    try {
      await api.post(`/api/abonnements/client/${selected.clientId}/promotions`, body);
      setPromoMoisDebut('');
      setPromoMonths('');
      setPromoDiscountVal('');
      setPromoFixedVal('');
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

  // Which applies_to options are blocked by active promos
  const activePromos = selected?.promotions?.filter((p) => p.isActive) || [];
  const blockedMens = activePromos.some((p) => ['mensualite', 'les_deux'].includes(p.appliesTo));
  const blockedOb = activePromos.some((p) => ['onboarding', 'les_deux'].includes(p.appliesTo));
  const blockedGerant = activePromos.some((p) => p.appliesTo === 'supplement_gerant');
  const blockedLabo = activePromos.some((p) => p.appliesTo === 'supplement_labo');

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
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
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

            {/* Invite banner */}
            {!selected.inviteSent && (
              <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e', marginBottom: 10 }}>
                  Invitation non envoyée — confirmez l'abonnement pour que le client puisse activer son compte.
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
                      <button
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #d97706', color: '#d97706', background: 'transparent', fontSize: 12, cursor: 'pointer' }}
                        onClick={() => navigator.clipboard.writeText(confirmResult!.inviteUrl!)}>
                        Copier
                      </button>
                    </div>
                  )}
                  {confirmResult && !confirmResult.inviteUrl && (
                    <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 13 }}>Invitation envoyée ✓</span>
                  )}
                </div>
              </div>
            )}

            {/* ── Promotions ─────────────────────────────────────────── */}
            <div style={{ background: '#fffbeb', borderRadius: 10, padding: 16, border: '1px solid #fde68a', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 14 }}>🏷️ Promotions</div>

              {/* Active promos list */}
              {selected.promotions && selected.promotions.filter((p) => p.isActive).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  {selected.promotions.filter((p) => p.isActive).map((p) => {
                    let remiseStr = '';
                    if (p.type === 'free_months') remiseStr = 'Gratuit (100%)';
                    else if (p.type === 'percent_off') {
                      const val = p.discountSupplement ?? p.discountMensualite ?? p.discountOnboarding;
                      remiseStr = val ? `-${val}%` : '—';
                    } else {
                      const val = p.fixedSupplement ?? p.fixedMensualite ?? p.fixedOnboarding;
                      remiseStr = val ? `${val} DT` : '—';
                    }
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fef3c7', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, background: '#f59e0b', color: '#fff', borderRadius: 6, padding: '2px 7px' }}>Actif</span>
                        <span style={{ fontSize: 12, color: '#78350f', fontWeight: 600 }}>{APPLIES_LABELS[p.appliesTo] || p.appliesTo}</span>
                        <span style={{ fontSize: 12, color: '#92400e' }}>
                          {p.type === 'percent_off' ? '% Réduction' : p.type === 'free_months' ? 'Gratuit' : 'Prix fixe'}
                          {' · '}{remiseStr}
                        </span>
                        <span style={{ fontSize: 11, color: '#a16207', marginLeft: 'auto' }}>
                          {fmtDate(p.dateDebut)} → {p.dateFin ? fmtDate(p.dateFin) : 'Permanent'}
                        </span>
                        <button
                          onClick={() => deletePromo(p.id)}
                          disabled={promoDeleting === p.id}
                          style={{ padding: '2px 8px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                          {promoDeleting === p.id ? '…' : '✕'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add promo form */}
              <div style={{ fontSize: 12, fontWeight: 600, color: '#78350f', marginBottom: 10 }}>Ajouter une promotion</div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Type</label>
                  <select value={promoType} onChange={(e) => setPromoType(e.target.value as Promotion['type'])}
                    style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12 }}>
                    <option value="percent_off">% Réduction</option>
                    <option value="free_months">Gratuit</option>
                    <option value="fixed_price">Prix fixe</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Appliqué à</label>
                  <select value={promoAppliesTo} onChange={(e) => { setPromoAppliesTo(e.target.value); setPromoDiscountVal(''); setPromoFixedVal(''); }}
                    style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12 }}>
                    <option value="mensualite" disabled={blockedMens}>Mensualité{blockedMens ? ' (active)' : ''}</option>
                    <option value="onboarding" disabled={blockedOb}>OnBoarding{blockedOb ? ' (active)' : ''}</option>
                    <option value="supplement_gerant" disabled={blockedGerant}>Supplément Gérant{blockedGerant ? ' (active)' : ''}</option>
                    <option value="supplement_labo" disabled={blockedLabo}>Supplément Labo{blockedLabo ? ' (active)' : ''}</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Mois début</label>
                  <input type="month" value={promoMoisDebut} onChange={(e) => setPromoMoisDebut(e.target.value)}
                    min={selected.dateDebut ? selected.dateDebut.slice(0, 7) : undefined}
                    style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12, boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                {promoType !== 'free_months' && (
                  <div>
                    <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>
                      {promoType === 'percent_off' ? 'Réduction (%)' : 'Montant fixe (DT)'}
                    </label>
                    <input
                      type="number" min="0" max={promoType === 'percent_off' ? '100' : undefined} step="0.01"
                      placeholder={promoType === 'percent_off' ? 'ex: 20' : 'ex: 120'}
                      value={promoType === 'percent_off' ? promoDiscountVal : promoFixedVal}
                      onChange={(e) => promoType === 'percent_off' ? setPromoDiscountVal(e.target.value) : setPromoFixedVal(e.target.value)}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                )}
                {promoAppliesTo !== 'onboarding' && (
                  <div>
                    <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Durée (mois, vide = permanent)</label>
                    <input type="number" min="1" max="120" placeholder="vide = permanent" value={promoMonths} onChange={(e) => setPromoMonths(e.target.value)}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12, boxSizing: 'border-box' }} />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button onClick={savePromotion} disabled={promoSaving || !promoMoisDebut}
                    style={{ padding: '6px 18px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {promoSaving ? '…' : '+ Ajouter'}
                  </button>
                </div>
              </div>

              {promoError && (
                <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#dc2626' }}>
                  {promoError}
                </div>
              )}
            </div>

            {/* ── Onboarding ─────────────────────────────────────────── */}
            <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16, border: '1px solid #e5e7eb', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Onboarding</div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Montant</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>
                    {selected.pricing?.effectifOnboarding != null
                      ? `${selected.pricing.effectifOnboarding} DT`
                      : selected.montantOnboarding ? `${selected.montantOnboarding} DT` : '—'}
                  </div>
                  {selected.pricing?.activePromoOnboarding && (
                    <div style={{ fontSize: 11, color: '#d97706', marginTop: 2 }}>🏷️ Promo appliquée</div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Statut</label>
                  <select value={obStatut} onChange={(e) => setObStatut(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
                    <option value="impayé">Impayé</option>
                    <option value="payé">Payé</option>
                    <option value="offert">Offert</option>
                    <option value="gratuit">Gratuit (promo)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Date paiement</label>
                  <input type="date" value={obDatePaiement} onChange={(e) => setObDatePaiement(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
                </div>
                <button onClick={saveOnboarding} disabled={obSaving}
                  style={{ padding: '7px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  {obSaving ? '…' : 'Sauvegarder'}
                </button>
              </div>
            </div>

            {/* ── Mensualités ────────────────────────────────────────── */}
            <div style={{ background: '#f0f9ff', borderRadius: 10, padding: 16, border: '1px solid #bae6fd', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0369a1', marginBottom: 12 }}>Mensualité</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: pMontantInfo ? 12 : 0 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Mois</label>
                  <input type="month" value={pMois} onChange={(e) => setPMois(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #bae6fd', fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Statut</label>
                  <select value={pStatut} onChange={(e) => setPStatut(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #bae6fd', fontSize: 13 }}>
                    <option value="payé">Payé</option>
                    <option value="impayé">Impayé</option>
                    <option value="en_attente">En attente</option>
                    <option value="remisé">Remisé</option>
                    <option value="gratuit">Gratuit</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Date paiement</label>
                  <input type="date" value={pDatePaiement} onChange={(e) => setPDatePaiement(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #bae6fd', fontSize: 13 }} />
                </div>
                <button onClick={savePaiement} disabled={paving || !pMontantInfo}
                  style={{ padding: '7px 18px', background: '#0369a1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  {paving ? '…' : 'Enregistrer'}
                </button>
              </div>

              {pMontantLoading && (
                <div style={{ fontSize: 12, color: '#6b7280' }}>Calcul en cours...</div>
              )}
              {pMontantInfo && !pMontantLoading && (
                <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #bae6fd', padding: '10px 14px' }}>
                  {pMontantInfo.existing && (
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
                      ⚠️ Paiement existant pour ce mois ({pMontantInfo.existing.statut})
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 12, color: '#374151' }}>
                      Mensualité : <strong>{pMontantInfo.breakdown.mensualite.effectif} DT</strong>
                      {pMontantInfo.breakdown.mensualite.hasPromo && <span style={{ color: '#d97706', marginLeft: 4 }}>🏷️</span>}
                    </div>
                    {pMontantInfo.breakdown.supplementGerant.active && (
                      <div style={{ fontSize: 12, color: '#374151' }}>
                        Sup. Gérant : <strong>{pMontantInfo.breakdown.supplementGerant.effectif} DT</strong>
                        {pMontantInfo.breakdown.supplementGerant.hasPromo && <span style={{ color: '#d97706', marginLeft: 4 }}>🏷️</span>}
                      </div>
                    )}
                    {pMontantInfo.breakdown.supplementLabo.active && (
                      <div style={{ fontSize: 12, color: '#374151' }}>
                        Sup. Labo : <strong>{pMontantInfo.breakdown.supplementLabo.effectif} DT</strong>
                        {pMontantInfo.breakdown.supplementLabo.hasPromo && <span style={{ color: '#d97706', marginLeft: 4 }}>🏷️</span>}
                      </div>
                    )}
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0369a1', marginLeft: 'auto' }}>
                      Total : {pMontantInfo.total} DT
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Mode compte ────────────────────────────────────────── */}
            <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Mode compte</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {(['actif', 'read_only', 'bloque'] as const).map((mode) => {
                  const v = MODE_LABELS[mode];
                  const isCurrent = selected.modeCompte === mode;
                  return (
                    <button
                      key={mode}
                      disabled={modeSaving || isCurrent}
                      onClick={() => saveMode(mode)}
                      style={{
                        padding: '7px 16px', borderRadius: 8, border: `1.5px solid ${v.color}`,
                        background: isCurrent ? v.color : 'transparent',
                        color: isCurrent ? '#fff' : v.color,
                        fontSize: 13, fontWeight: 600, cursor: modeSaving || isCurrent ? 'default' : 'pointer',
                        opacity: modeSaving && !isCurrent ? 0.6 : 1,
                      }}
                    >{v.label}</button>
                  );
                })}
                {['desactive', 'archive'].includes(selected.modeCompte) && (
                  <span style={{ fontSize: 12, color: '#9ca3af', alignSelf: 'center' }}>
                    (mode automatique : {MODE_LABELS[selected.modeCompte]?.label})
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
