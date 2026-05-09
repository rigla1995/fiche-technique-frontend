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

const STATUT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  payé:       { bg: '#dcfce7', text: '#166534', label: 'Payé' },
  impayé:     { bg: '#fee2e2', text: '#991b1b', label: 'Impayé' },
  en_attente: { bg: '#fef3c7', text: '#92400e', label: 'En attente' },
  remisé:     { bg: '#ede9fe', text: '#5b21b6', label: 'Remisé' },
  gratuit:    { bg: '#dcfce7', text: '#166534', label: 'Gratuit' },
  offert:     { bg: '#e0f2fe', text: '#075985', label: 'Offert' },
};

const APPLIES_LABELS: Record<string, string> = {
  onboarding:        'OnBoarding',
  mensualite:        'Mensualité',
  supplement_gerant: 'Supplément Gérant',
  supplement_labo:   'Supplément Labo',
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const fmtMois = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—';
const addOneMonth = (ym: string): string => {
  const [y, m] = ym.slice(0, 7).split('-').map(Number);
  const next = new Date(y, m, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
};

// ── Confirmation Modal ────────────────────────────────────────────────────────
interface ConfirmPayload {
  type: 'onboarding' | 'mensualite' | 'mode';
  clientNom: string;
  // payment fields
  montant?: number | null;
  statut?: string;
  datePaiement?: string;
  mois?: string;
  // mode fields
  newMode?: string;
  currentMode?: string;
}

const MODE_DANGER: Record<string, boolean> = { bloque: true };

function ConfirmationModal({
  payload,
  saving,
  onConfirm,
  onCancel,
}: {
  payload: ConfirmPayload;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isMode = payload.type === 'mode';
  const isOnboarding = payload.type === 'onboarding';

  const sc = !isMode ? (STATUT_COLORS[payload.statut || ''] || { bg: '#f3f4f6', text: '#374151', label: payload.statut || '' }) : null;
  const newModeLabel = MODE_LABELS[payload.newMode || ''];
  const currentModeLabel = MODE_LABELS[payload.currentMode || ''];
  const isDanger = MODE_DANGER[payload.newMode || ''];

  const confirmBg = isMode
    ? (isDanger ? '#dc2626' : newModeLabel?.color || '#2563eb')
    : '#2563eb';

  const modeIconMap: Record<string, string> = {
    actif: '✅', read_only: '👁️', bloque: '🚫', desactive: '⛔', archive: '🗄️',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(3px)',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: 440, maxWidth: '94vw',
        boxShadow: '0 25px 70px rgba(0,0,0,0.22)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid #f1f5f9',
          background: isMode && isDanger
            ? 'linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%)'
            : 'linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: isMode ? (isDanger ? '#fee2e2' : '#f0fdf4') : (isOnboarding ? '#e0f2fe' : '#eff6ff'),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
            }}>
              {isMode ? modeIconMap[payload.newMode || ''] || '⚙️' : (isOnboarding ? '🎯' : '📅')}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: isMode && isDanger ? '#991b1b' : '#0f172a' }}>
                {isMode ? 'Modifier le mode d\'accès' : 'Confirmer le paiement'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {isMode
                  ? `${currentModeLabel?.label || payload.currentMode} → ${newModeLabel?.label || payload.newMode}`
                  : (isOnboarding ? 'Onboarding' : `Mensualité · ${fmtMois(payload.mois || '')}`)}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {/* Client row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', background: '#f8fafc', borderRadius: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>👤</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{payload.clientNom}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Client</div>
            </div>
          </div>

          {/* Mode: transition card */}
          {isMode && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                <div style={{ padding: '14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{modeIconMap[payload.currentMode || ''] || '⚙️'}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Actuel</div>
                  <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: (currentModeLabel?.color || '#6b7280') + '20', color: currentModeLabel?.color || '#6b7280' }}>
                    {currentModeLabel?.label || payload.currentMode}
                  </span>
                </div>
                <div style={{ fontSize: 20, color: '#94a3b8', fontWeight: 300 }}>→</div>
                <div style={{ padding: '14px', background: isDanger ? '#fef2f2' : '#f0fdf4', borderRadius: 10, border: `1px solid ${isDanger ? '#fecaca' : '#bbf7d0'}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{modeIconMap[payload.newMode || ''] || '⚙️'}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Nouveau</div>
                  <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: (newModeLabel?.color || '#374151') + '20', color: newModeLabel?.color || '#374151' }}>
                    {newModeLabel?.label || payload.newMode}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderRadius: 10, border: `1px solid ${isDanger ? '#fecaca' : '#e2e8f0'}`, background: isDanger ? '#fef2f2' : '#fafafa', marginBottom: 16, fontSize: 12, color: isDanger ? '#991b1b' : '#64748b' }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{isDanger ? '⚠️' : 'ℹ️'}</span>
                <span>
                  {payload.newMode === 'bloque'
                    ? 'Ce client et tous ses gérants seront immédiatement déconnectés et ne pourront plus accéder à l\'application.'
                    : payload.newMode === 'read_only'
                    ? 'Le client pourra consulter ses données mais ne pourra effectuer aucune modification.'
                    : 'Le client et ses gérants retrouveront un accès complet à toutes les fonctionnalités.'}
                </span>
              </div>
            </>
          )}

          {/* Payment: details grid */}
          {!isMode && sc && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Montant</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                    {payload.montant != null ? `${payload.montant} DT` : '—'}
                  </div>
                </div>
                <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Statut</div>
                  <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: sc.bg, color: sc.text }}>
                    {sc.label}
                  </span>
                </div>
              </div>
              {payload.datePaiement && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0', marginBottom: 16 }}>
                  <span style={{ fontSize: 14 }}>📆</span>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date de paiement</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#14532d', marginTop: 1 }}>{fmtDate(payload.datePaiement)}</div>
                  </div>
                </div>
              )}
              {isOnboarding ? (
                <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: '#fef3c7', borderRadius: 8, border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
                  <span>Action irréversible. Une fois confirmé, vous ne pourrez plus appliquer de promotion sur l'onboarding.</span>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#64748b', background: '#fafafa', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                  Cette action enregistrera le paiement. Vous pourrez le modifier à tout moment.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e2e8f0',
              background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            style={{
              padding: '9px 24px', borderRadius: 9, border: 'none',
              background: saving ? confirmBg + 'aa' : confirmBg,
              color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: saving ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {saving && (
              <span style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
            )}
            {saving ? 'Enregistrement...' : (isMode ? 'Confirmer le changement' : 'Confirmer')}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

interface MontantMoisInfo {
  moisStr: string;
  isGratuit: boolean;
  existing: { montantDt: string | null; statut: string; datePaiement: string | null } | null;
  breakdown: {
    mensualite: { base: number; effectif: number; hasPromo: boolean; promoType: string | null };
    supplementGerant: { base: number; effectif: number; active: boolean; hasPromo: boolean; promoType: string | null };
    supplementLabo: { base: number; effectif: number; active: boolean; hasPromo: boolean; promoType: string | null };
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
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [showHistorique, setShowHistorique] = useState(false);

  // confirmation modal
  const [confirmModal, setConfirmModal] = useState<ConfirmPayload | null>(null);

  // onboarding
  const [obDatePaiement, setObDatePaiement] = useState('');
  const [obSaving, setObSaving] = useState(false);

  // mensualités
  const [pMois, setPMois] = useState('');
  const [pMontantInfo, setPMontantInfo] = useState<MontantMoisInfo | null>(null);
  const [pMontantLoading, setPMontantLoading] = useState(false);
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
    setEditingPromo(null);
    setPromoAppliesTo('mensualite');
    setPromoType('percent_off');
    setPromoMoisDebut('');
    setPromoMonths('');
    setPromoDiscountVal('');
    setPromoFixedVal('');
    setPMontantInfo(null);
    try {
      const res = await api.get(`/api/abonnements/client/${ab.clientId}?withPricing=1`);
      setSelected(res.data);
      setObDatePaiement(res.data.dateOnboarding ? res.data.dateOnboarding.slice(0, 10) : '');
      // Default mensualité month to current month
      const now = new Date();
      setPMois(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
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
      // Pre-fill date from existing payment if payé
      if (res.data.existing?.statut === 'payé' && res.data.existing.datePaiement) {
        setPDatePaiement(res.data.existing.datePaiement.slice(0, 10));
      } else {
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

  const requestOnboarding = () => {
    if (!selected || !obDatePaiement) return;
    setConfirmModal({
      type: 'onboarding',
      clientNom: selected.clientNom,
      montant: selected.pricing?.effectifOnboarding ?? selected.montantOnboarding ?? null,
      statut: 'payé',
      datePaiement: obDatePaiement,
    });
  };

  const saveOnboarding = async () => {
    if (!selected) return;
    setObSaving(true);
    try {
      const res = await api.put(`/api/abonnements/client/${selected.clientId}/onboarding`, {
        datePaiement: obDatePaiement || undefined,
      });
      setSelected((s) => s ? { ...s, statutOnboarding: res.data.statutOnboarding, dateOnboarding: res.data.dateOnboarding } : s);
      setConfirmModal(null);
    } finally {
      setObSaving(false);
    }
  };

  const requestPaiement = () => {
    if (!selected || !pMois || !pMontantInfo || pMontantInfo.isGratuit) return;
    setConfirmModal({
      type: 'mensualite',
      clientNom: selected.clientNom,
      montant: pMontantInfo.total,
      statut: 'payé',
      datePaiement: pDatePaiement,
      mois: pMois + '-01',
    });
  };

  const savePaiement = async () => {
    if (!selected || !pMois || !pMontantInfo) return;
    setPaving(true);
    try {
      await api.post(`/api/abonnements/client/${selected.clientId}/paiements`, {
        mois: pMois + '-01',
        statut: 'payé',
        montant: pMontantInfo.total,
        datePaiement: pDatePaiement || undefined,
      });
      await fetchMontantMois(pMois);
      fetchList();
      setConfirmModal(null);
    } finally {
      setPaving(false);
    }
  };

  const requestMode = (mode: string) => {
    if (!selected) return;
    setConfirmModal({
      type: 'mode',
      clientNom: selected.clientNom,
      newMode: mode,
      currentMode: selected.modeCompte,
    });
  };

  const saveMode = async () => {
    if (!selected || !confirmModal?.newMode) return;
    const mode = confirmModal.newMode;
    setModeSaving(true);
    try {
      await api.put(`/api/abonnements/client/${selected.clientId}/mode`, { mode });
      setSelected((s) => s ? { ...s, modeCompte: mode as Abonnement['modeCompte'] } : s);
      fetchList();
      setConfirmModal(null);
    } finally {
      setModeSaving(false);
    }
  };

  const savePromotion = async () => {
    if (!selected || !promoCanSubmitFull) return;
    setPromoSaving(true);
    setPromoError(null);
    const dateDebut = promoAppliesTo === 'onboarding'
      ? (selected.dateDebut || new Date().toISOString().slice(0, 10))
      : promoMoisDebut + '-01';
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
        if (promoType === 'percent_off') body.discountSupplement = Number(promoDiscountVal);
        else body.fixedSupplement = Number(promoFixedVal);
      }
    }
    try {
      if (editingPromo) {
        await api.put(`/api/abonnements/promotions/${editingPromo.id}`, body);
        setEditingPromo(null);
      } else {
        await api.post(`/api/abonnements/client/${selected.clientId}/promotions`, body);
      }
      setPromoMoisDebut('');
      setPromoMonths('');
      setPromoDiscountVal('');
      setPromoFixedVal('');
      await openDetail(selected);
      fetchList();
    } catch (err: any) {
      setPromoError(err?.response?.data?.message || (editingPromo ? 'Erreur lors de la modification' : 'Erreur lors de l\'ajout'));
    } finally {
      setPromoSaving(false);
    }
  };

  const startEditPromo = (p: Promotion) => {
    setEditingPromo(p);
    setPromoAppliesTo(p.appliesTo);
    setPromoType(p.type);
    setPromoMoisDebut(p.appliesTo !== 'onboarding' ? p.dateDebut.slice(0, 7) : '');
    setPromoMonths(p.monthsDuration != null ? String(p.monthsDuration) : '');
    setPromoDiscountVal(
      p.type === 'percent_off'
        ? String(p.discountSupplement ?? p.discountMensualite ?? p.discountOnboarding ?? '')
        : ''
    );
    setPromoFixedVal(
      p.type === 'fixed_price'
        ? String(p.fixedSupplement ?? p.fixedMensualite ?? p.fixedOnboarding ?? '')
        : ''
    );
    setPromoError(null);
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

  // Promo availability derived vars
  const activePromos = selected?.promotions?.filter((p) => p.isActive) || [];
  const activeObPromo = activePromos.find((p) => ['onboarding', 'les_deux'].includes(p.appliesTo)) || null;
  const activeMensPromo = activePromos.find((p) => ['mensualite', 'les_deux'].includes(p.appliesTo)) || null;
  const activeGerantPromo = activePromos.find((p) => p.appliesTo === 'supplement_gerant') || null;
  const activeLaboPromo = activePromos.find((p) => p.appliesTo === 'supplement_labo') || null;

  const hideOnboarding = ['payé', 'offert', 'gratuit'].includes(selected?.statutOnboarding || '') || !!activeObPromo;
  const hideMensPermanent = !!activeMensPromo && !activeMensPromo.dateFin;
  const hideGerantPermanent = !!activeGerantPromo && !activeGerantPromo.dateFin;
  const hideLaboPermanent = !!activeLaboPromo && !activeLaboPromo.dateFin;

  const mensMinMois = activeMensPromo?.dateFin
    ? addOneMonth(activeMensPromo.dateFin)
    : selected?.dateDebut?.slice(0, 7);
  const gerantMinMois = activeGerantPromo?.dateFin
    ? addOneMonth(activeGerantPromo.dateFin)
    : selected?.dateDebut?.slice(0, 7);
  const laboMinMois = activeLaboPromo?.dateFin
    ? addOneMonth(activeLaboPromo.dateFin)
    : selected?.dateDebut?.slice(0, 7);

  const promoCurrentMinMois = promoAppliesTo === 'mensualite' ? mensMinMois
    : promoAppliesTo === 'supplement_gerant' ? gerantMinMois
    : promoAppliesTo === 'supplement_labo' ? laboMinMois
    : undefined;

  const paidMonthSet = new Set(
    (selected?.paiements || [])
      .map((p) => (p.statut === 'payé' ? p.mois?.slice(0, 7) : null))
      .filter(Boolean) as string[]
  );
  const promoMoisIsPaid = promoAppliesTo !== 'onboarding' && !!promoMoisDebut && paidMonthSet.has(promoMoisDebut);

  const hasAmountFilled = promoType === 'free_months'
    || (promoType === 'percent_off' && !!promoDiscountVal)
    || (promoType === 'fixed_price' && !!promoFixedVal);
  const hasMoisFilled = promoAppliesTo === 'onboarding' || !!promoMoisDebut;
  const promoCanSubmit = hasAmountFilled && hasMoisFilled && !promoMoisIsPaid && !promoSaving;

  const visibleAppliesTo = [
    (!hideOnboarding || editingPromo?.appliesTo === 'onboarding') ? { value: 'onboarding', label: 'OnBoarding' } : null,
    (!hideMensPermanent || editingPromo?.appliesTo === 'mensualite') ? { value: 'mensualite', label: 'Mensualité' } : null,
    (!hideGerantPermanent || editingPromo?.appliesTo === 'supplement_gerant') ? { value: 'supplement_gerant', label: 'Supplément Gérant' } : null,
    (!hideLaboPermanent || editingPromo?.appliesTo === 'supplement_labo') ? { value: 'supplement_labo', label: 'Supplément Labo' } : null,
  ].filter(Boolean) as { value: string; label: string }[];

  // Compute months blocked by existing promos for the current promoAppliesTo
  const conflictAppliesMap: Record<string, string[]> = {
    mensualite: ['mensualite', 'les_deux'],
    supplement_gerant: ['supplement_gerant'],
    supplement_labo: ['supplement_labo'],
  };
  const promoBlockedMonths = new Set<string>();
  if (promoAppliesTo !== 'onboarding' && selected?.promotions) {
    const conflictTypes = conflictAppliesMap[promoAppliesTo] || [];
    selected.promotions
      .filter((p) => conflictTypes.includes(p.appliesTo) && p.id !== editingPromo?.id)
      .forEach((p) => {
        const start = new Date(p.dateDebut + 'T00:00:00');
        const end = p.dateFin ? new Date(p.dateFin + 'T00:00:00') : new Date(new Date().getFullYear() + 3, 11, 31);
        const cur = new Date(start.getFullYear(), start.getMonth(), 1);
        while (cur <= end) {
          promoBlockedMonths.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
          cur.setMonth(cur.getMonth() + 1);
        }
      });
  }
  const promoMoisIsBlocked = promoAppliesTo !== 'onboarding' && !!promoMoisDebut && promoBlockedMonths.has(promoMoisDebut);
  const promoCanSubmitFull = promoCanSubmit && !promoMoisIsBlocked;

  // Today string for delete guard
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <>
    {confirmModal && (
      <ConfirmationModal
        payload={confirmModal}
        saving={confirmModal.type === 'onboarding' ? obSaving : confirmModal.type === 'mensualite' ? paving : modeSaving}
        onConfirm={confirmModal.type === 'onboarding' ? saveOnboarding : confirmModal.type === 'mensualite' ? savePaiement : saveMode}
        onCancel={() => setConfirmModal(null)}
      />
    )}
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
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 14 }}>🏷️ Promotions — Année {new Date().getFullYear()}</div>

              {/* Active + planifié promos */}
              {(() => {
                const activeAndPlanned = (selected.promotions || []).filter((p) => p.statutPromo === 'actif');
                const expiredPromos = (selected.promotions || []).filter((p) => p.statutPromo === 'expiré');

                const promoRow = (p: Promotion, showActions: boolean) => {
                  const isFuture = p.dateDebut > todayStr;
                  const badge = isFuture ? 'Planifié' : p.statutPromo === 'expiré' ? 'Expiré' : 'Actif';
                  const badgeBg = isFuture ? '#6366f1' : p.statutPromo === 'expiré' ? '#9ca3af' : '#f59e0b';
                  let remiseStr = '';
                  if (p.type === 'free_months') remiseStr = 'Gratuit (100%)';
                  else if (p.type === 'percent_off') {
                    const val = p.discountSupplement ?? p.discountMensualite ?? p.discountOnboarding;
                    remiseStr = val ? `-${val}%` : '—';
                  } else {
                    const val = p.fixedSupplement ?? p.fixedMensualite ?? p.fixedOnboarding;
                    remiseStr = val ? `-${val} DT` : '—';
                  }
                  const isEditing = editingPromo?.id === p.id;
                  const rowBg = p.statutPromo === 'expiré' ? '#f9fafb' : isFuture ? '#eef2ff' : '#fef3c7';
                  const rowBorder = p.statutPromo === 'expiré' ? '#e5e7eb' : isFuture ? '#c7d2fe' : '#fde68a';
                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: isEditing ? '#fdf4ff' : rowBg,
                      borderRadius: 8, padding: '8px 12px', marginBottom: 6,
                      border: `1px solid ${isEditing ? '#e9d5ff' : rowBorder}`,
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 7px', flexShrink: 0, background: badgeBg, color: '#fff' }}>
                        {badge}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                        {APPLIES_LABELS[p.appliesTo] || p.appliesTo}
                      </span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        {p.type === 'percent_off' ? '% Réduction' : p.type === 'free_months' ? 'Gratuit' : 'Prix fixe'}
                        {' · '}{remiseStr}
                      </span>
                      <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
                        {fmtDate(p.dateDebut)} → {p.dateFin ? fmtDate(p.dateFin) : 'Permanent'}
                      </span>
                      {showActions && (
                        <>
                          <button
                            onClick={() => isEditing ? (setEditingPromo(null), setPromoMoisDebut(''), setPromoMonths(''), setPromoDiscountVal(''), setPromoFixedVal('')) : startEditPromo(p)}
                            style={{ padding: '2px 8px', background: isEditing ? '#f3f4f6' : '#eff6ff', color: isEditing ? '#6b7280' : '#2563eb', border: `1px solid ${isEditing ? '#e5e7eb' : '#bfdbfe'}`, borderRadius: 6, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                            {isEditing ? 'Annuler' : '✏️'}
                          </button>
                          <button
                            onClick={() => deletePromo(p.id)}
                            disabled={promoDeleting === p.id}
                            style={{ padding: '2px 8px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                            {promoDeleting === p.id ? '…' : '✕'}
                          </button>
                        </>
                      )}
                    </div>
                  );
                };

                return (
                  <>
                    {activeAndPlanned.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        {activeAndPlanned.map((p) => promoRow(p, p.dateDebut > todayStr))}
                      </div>
                    )}

                    {/* Historique (expiré) */}
                    {expiredPromos.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <button
                          onClick={() => setShowHistorique((v) => !v)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: showHistorique ? 8 : 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>
                            {showHistorique ? '▾' : '▸'} Historique ({expiredPromos.length} promo{expiredPromos.length > 1 ? 's' : ''} expirée{expiredPromos.length > 1 ? 's' : ''})
                          </span>
                        </button>
                        {showHistorique && expiredPromos.map((p) => promoRow(p, false))}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Add / edit promo form */}
              <div style={{ fontSize: 12, fontWeight: 600, color: '#78350f', marginBottom: 10 }}>
                {editingPromo ? '✏️ Modifier la promotion' : 'Ajouter une promotion'}
              </div>

              {visibleAppliesTo.length === 0 ? (
                <div style={{ fontSize: 12, color: '#a16207', background: '#fef3c7', borderRadius: 8, padding: '8px 12px' }}>
                  Aucune catégorie disponible — toutes les promotions actives sont permanentes ou l'onboarding est réglé.
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                    {/* Appliqué à */}
                    <div>
                      <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Appliqué à</label>
                      <select
                        value={visibleAppliesTo.find((o) => o.value === promoAppliesTo) ? promoAppliesTo : visibleAppliesTo[0].value}
                        onChange={(e) => { setPromoAppliesTo(e.target.value); setPromoDiscountVal(''); setPromoFixedVal(''); setPromoMoisDebut(''); }}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12 }}>
                        {visibleAppliesTo.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    {/* Type */}
                    <div>
                      <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>Type</label>
                      <select value={promoType} onChange={(e) => { setPromoType(e.target.value as Promotion['type']); setPromoDiscountVal(''); setPromoFixedVal(''); }}
                        style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #fde68a', fontSize: 12 }}>
                        <option value="percent_off">% Réduction</option>
                        <option value="free_months">Gratuit</option>
                        <option value="fixed_price">Prix fixe</option>
                      </select>
                    </div>
                    {/* Mois début — hidden for onboarding */}
                    {promoAppliesTo !== 'onboarding' && (
                      <div>
                        <label style={{ fontSize: 11, color: '#374151', display: 'block', marginBottom: 3 }}>
                          Mois début
                          {promoCurrentMinMois && (
                            <span style={{ color: '#d97706', marginLeft: 4 }}>
                              (min {promoCurrentMinMois})
                            </span>
                          )}
                        </label>
                        <input
                          type="month"
                          value={promoMoisDebut}
                          onChange={(e) => setPromoMoisDebut(e.target.value)}
                          min={promoCurrentMinMois}
                          style={{
                            width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: 12, boxSizing: 'border-box',
                            border: `1px solid ${(promoMoisIsPaid || promoMoisIsBlocked) ? '#fca5a5' : '#fde68a'}`,
                            background: (promoMoisIsPaid || promoMoisIsBlocked) ? '#fff1f2' : '#fff',
                          }} />
                      </div>
                    )}
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
                      <button
                        onClick={savePromotion}
                        disabled={!promoCanSubmitFull}
                        style={{
                          padding: '6px 18px', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12,
                          whiteSpace: 'nowrap',
                          background: promoCanSubmitFull ? '#d97706' : '#e5e7eb',
                          color: promoCanSubmitFull ? '#fff' : '#9ca3af',
                          cursor: promoCanSubmitFull ? 'pointer' : 'default',
                        }}>
                        {promoSaving ? '…' : editingPromo ? 'Modifier' : '+ Ajouter'}
                      </button>
                    </div>
                  </div>

                  {promoMoisIsPaid && (
                    <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#dc2626', marginBottom: 8 }}>
                      Ce mois est déjà marqué comme payé — impossible d'y appliquer une promotion.
                    </div>
                  )}
                  {promoMoisIsBlocked && !promoMoisIsPaid && (
                    <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#dc2626', marginBottom: 8 }}>
                      Ce mois est déjà couvert par une promotion existante pour cette catégorie.
                    </div>
                  )}

                  {promoError && (
                    <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#dc2626' }}>
                      {promoError}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Onboarding ─────────────────────────────────────────── */}
            {(() => {
              const activeObPromoFull = selected.pricing?.activePromoOnboarding;
              const isGratuitOb = selected.statutOnboarding === 'gratuit' || activeObPromoFull?.type === 'free_months';
              const isPayeOb = selected.statutOnboarding === 'payé' || !!selected.dateOnboarding;
              const isEnAttenteOb = !isGratuitOb && !isPayeOb;

              const montantBase = selected.montantOnboarding ?? null;
              const montantEffectif = selected.pricing?.effectifOnboarding ?? montantBase;
              const hasDiscount = montantBase != null && montantEffectif != null && montantEffectif !== montantBase;

              const statusBadge = isGratuitOb
                ? { bg: '#dcfce7', text: '#166534', label: 'Gratuit', icon: '🎁' }
                : isPayeOb
                  ? { bg: '#dcfce7', text: '#166534', label: 'Payé', icon: '✅' }
                  : { bg: '#fef3c7', text: '#92400e', label: 'En Attente', icon: '⏳' };

              return (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 20, overflow: 'hidden' }}>
                  {/* Card header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%)', borderBottom: '1px solid #bae6fd' }}>
                    <span style={{ fontSize: 18 }}>🎯</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0c4a6e' }}>Onboarding</div>
                      <div style={{ fontSize: 11, color: '#0369a1', marginTop: 1 }}>Formation initiale + mise en place</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: statusBadge.bg, color: statusBadge.text }}>
                      {statusBadge.icon} {statusBadge.label}
                    </span>
                  </div>

                  <div style={{ padding: '16px 18px' }}>
                    {/* Amount info row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: isEnAttenteOb ? 16 : 0, padding: '12px 16px', background: '#f8fafc', borderRadius: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                          {isGratuitOb ? 'Montant (promo gratuit)' : isPayeOb ? 'Montant réglé' : 'Montant à régler'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          {isGratuitOb ? (
                            <>
                              <span style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>0 DT</span>
                              {montantBase != null && (
                                <span style={{ fontSize: 14, color: '#94a3b8', textDecoration: 'line-through' }}>{montantBase} DT</span>
                              )}
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                                {montantEffectif != null ? `${montantEffectif} DT` : '—'}
                              </span>
                              {hasDiscount && montantBase != null && (
                                <span style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'line-through' }}>{montantBase} DT</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {isGratuitOb && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: '#dcfce7', color: '#166534' }}>🎁 Promo active</span>
                      )}
                      {!isGratuitOb && activeObPromoFull && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: '#fef3c7', color: '#92400e' }}>🏷️ Promo</span>
                      )}
                      {isPayeOb && selected.dateOnboarding && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Réglé le</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginTop: 2 }}>{fmtDate(selected.dateOnboarding)}</div>
                        </div>
                      )}
                    </div>

                    {/* Gratuit info note */}
                    {isGratuitOb && (
                      <div style={{ marginTop: 12, display: 'flex', gap: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: 12, color: '#166534' }}>
                        <span>ℹ️</span>
                        <span>L'onboarding est couvert par une promotion gratuite. Aucune action requise.</span>
                      </div>
                    )}

                    {/* En attente: payment form */}
                    {isEnAttenteOb && (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Date de paiement</label>
                          <input type="date" value={obDatePaiement} onChange={(e) => setObDatePaiement(e.target.value)}
                            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
                        </div>
                        <button
                          onClick={requestOnboarding}
                          disabled={!obDatePaiement}
                          style={{
                            padding: '8px 20px', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 13,
                            whiteSpace: 'nowrap',
                            background: obDatePaiement ? '#0ea5e9' : '#e5e7eb',
                            color: obDatePaiement ? '#fff' : '#9ca3af',
                            cursor: obDatePaiement ? 'pointer' : 'default',
                          }}>
                          Confirmer le paiement
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── Mensualités ────────────────────────────────────────── */}
            {(() => {
              const monthIsGratuit = !!pMontantInfo?.isGratuit;
              const monthIsPaye = pMontantInfo?.existing?.statut === 'payé';
              const monthIsAlreadyGratuit = pMontantInfo?.existing?.statut === 'gratuit';
              const monthIsLocked = monthIsGratuit || monthIsPaye || monthIsAlreadyGratuit;

              return (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 20, overflow: 'hidden' }}>
                  {/* Card header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'linear-gradient(135deg,#f0f9ff 0%,#dbeafe 100%)', borderBottom: '1px solid #bfdbfe' }}>
                    <span style={{ fontSize: 18 }}>📅</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f' }}>Mensualité</div>
                      <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 1 }}>Paiement mensuel récurrent</div>
                    </div>
                    {pMontantInfo && !pMontantLoading && (
                      monthIsGratuit ? (
                        <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: '#dcfce7', color: '#166534' }}>🎁 Gratuit</span>
                      ) : (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#1d4ed8', marginTop: 1 }}>{pMontantInfo.total} DT</div>
                        </div>
                      )
                    )}
                    {pMontantLoading && (
                      <div style={{ fontSize: 12, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 12, height: 12, border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                        Calcul...
                      </div>
                    )}
                  </div>

                  <div style={{ padding: '16px 18px' }}>
                    {/* Month picker — always visible */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Mois</label>
                      <input type="month" value={pMois} onChange={(e) => setPMois(e.target.value)}
                        style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>

                    {/* Detailed breakdown table */}
                    {pMontantInfo && !pMontantLoading && (
                      <div style={{ marginBottom: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        {/* Column headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 90px', gap: 0, padding: '7px 14px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                          {['Poste', 'Base', 'Remise', 'Montant'].map((h) => (
                            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: h === 'Montant' ? 'right' : 'left' }}>{h}</div>
                          ))}
                        </div>

                        {/* Line items */}
                        {[
                          { label: 'Mensualité', ...pMontantInfo.breakdown.mensualite, show: true },
                          { label: 'Sup. Gérant', ...pMontantInfo.breakdown.supplementGerant, show: pMontantInfo.breakdown.supplementGerant.active },
                          { label: 'Sup. Labo', ...pMontantInfo.breakdown.supplementLabo, show: pMontantInfo.breakdown.supplementLabo.active },
                        ].filter((i) => i.show).map((item, idx, arr) => {
                          const isFree = item.promoType === 'free_months';
                          const hasDiscount = item.hasPromo && item.effectif !== item.base;
                          const reduction = item.base - item.effectif;
                          return (
                            <div key={item.label} style={{
                              display: 'grid', gridTemplateColumns: '1fr 80px 1fr 90px', gap: 0,
                              padding: '10px 14px',
                              borderBottom: idx < arr.length - 1 ? '1px solid #e2e8f0' : 'none',
                              background: isFree ? '#f0fdf4' : '#fff',
                            }}>
                              {/* Poste */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{item.label}</span>
                              </div>
                              {/* Base */}
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                <span style={{
                                  fontSize: 13, color: hasDiscount || isFree ? '#94a3b8' : '#374151',
                                  textDecoration: hasDiscount || isFree ? 'line-through' : 'none',
                                }}>
                                  {item.base} DT
                                </span>
                              </div>
                              {/* Remise */}
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                {isFree ? (
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#dcfce7', color: '#166534' }}>🎁 Gratuit</span>
                                ) : hasDiscount ? (
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>
                                    🏷️ -{reduction} DT
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>
                                )}
                              </div>
                              {/* Montant effectif */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                <span style={{ fontSize: 14, fontWeight: 800, color: isFree ? '#16a34a' : '#0f172a' }}>
                                  {item.effectif} DT
                                </span>
                              </div>
                            </div>
                          );
                        })}

                        {/* Total row */}
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 80px 1fr 90px', gap: 0,
                          padding: '10px 14px',
                          background: 'linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%)',
                          borderTop: '2px solid #bfdbfe',
                        }}>
                          <div style={{ gridColumn: '1 / 4', display: 'flex', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total à régler</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 18, fontWeight: 800, color: pMontantInfo.isGratuit ? '#16a34a' : '#1d4ed8' }}>
                              {pMontantInfo.total} DT
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Locked month messages */}
                    {pMontantInfo && !pMontantLoading && monthIsLocked && (
                      <div style={{
                        display: 'flex', gap: 8, padding: '10px 14px',
                        background: monthIsPaye ? '#f0fdf4' : '#f0fdf4',
                        borderRadius: 10, border: '1px solid #bbf7d0',
                        fontSize: 13, color: '#166534', alignItems: 'center',
                      }}>
                        <span style={{ fontSize: 16 }}>{monthIsPaye ? '✅' : '🎁'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>
                            {monthIsPaye ? 'Paiement confirmé' : 'Mois gratuit'}
                          </div>
                          <div style={{ fontSize: 11, color: '#4ade80', marginTop: 1 }}>
                            {monthIsPaye && pMontantInfo.existing?.datePaiement
                              ? `Réglé le ${fmtDate(pMontantInfo.existing.datePaiement)}`
                              : monthIsGratuit ? 'Couvert par une promotion gratuite'
                              : 'Marqué comme gratuit'}
                          </div>
                        </div>
                        {pMontantInfo.existing?.montantDt != null && (
                          <span style={{ fontSize: 16, fontWeight: 800 }}>{pMontantInfo.existing.montantDt} DT</span>
                        )}
                      </div>
                    )}

                    {/* Payment form — only for unlocked months */}
                    {(!pMontantInfo || !monthIsLocked) && !pMontantLoading && (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 160px' }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Date de paiement</label>
                          <input type="date" value={pDatePaiement} onChange={(e) => setPDatePaiement(e.target.value)}
                            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
                        </div>
                        <button
                          onClick={requestPaiement}
                          disabled={!pMontantInfo || pMontantLoading || !pDatePaiement}
                          style={{
                            padding: '8px 22px', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 13,
                            whiteSpace: 'nowrap',
                            background: (pMontantInfo && pDatePaiement) ? '#2563eb' : '#e5e7eb',
                            color: (pMontantInfo && pDatePaiement) ? '#fff' : '#9ca3af',
                            cursor: (pMontantInfo && pDatePaiement) ? 'pointer' : 'default',
                          }}>
                          Confirmer le paiement
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── Mode compte ────────────────────────────────────────── */}
            {(() => {
              const modeConfig: Record<string, { icon: string; desc: string }> = {
                actif:     { icon: '✅', desc: 'Accès complet à toutes les fonctionnalités' },
                read_only: { icon: '👁️', desc: 'Consultation uniquement, aucune modification' },
                bloque:    { icon: '🚫', desc: 'Accès totalement bloqué pour le client et ses gérants' },
              };
              const isAuto = ['desactive', 'archive'].includes(selected.modeCompte);
              return (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%)', borderBottom: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 18 }}>⚙️</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Mode d'accès</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Contrôle manuel du niveau d'accès du compte</div>
                    </div>
                    {isAuto && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: (MODE_LABELS[selected.modeCompte]?.color || '#6b7280') + '20', color: MODE_LABELS[selected.modeCompte]?.color || '#6b7280' }}>
                        {MODE_LABELS[selected.modeCompte]?.label} (auto)
                      </span>
                    )}
                  </div>

                  <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {(['actif', 'read_only', 'bloque'] as const).map((mode) => {
                      const v = MODE_LABELS[mode];
                      const mc = modeConfig[mode];
                      const isCurrent = selected.modeCompte === mode;
                      return (
                        <button
                          key={mode}
                          disabled={modeSaving || isCurrent}
                          onClick={() => requestMode(mode)}
                          style={{
                            padding: '14px 12px', borderRadius: 10,
                            border: `2px solid ${isCurrent ? v.color : '#e2e8f0'}`,
                            background: isCurrent ? v.color + '12' : '#f8fafc',
                            cursor: modeSaving || isCurrent ? 'default' : 'pointer',
                            textAlign: 'left', transition: 'all 0.15s',
                            opacity: modeSaving && !isCurrent ? 0.5 : 1,
                          }}
                        >
                          <div style={{ fontSize: 20, marginBottom: 6 }}>{mc.icon}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: isCurrent ? v.color : '#374151', marginBottom: 3 }}>{v.label}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>{mc.desc}</div>
                          {isCurrent && (
                            <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: v.color }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: v.color, display: 'inline-block' }} />
                              Actuel
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
    </>
  );
}
