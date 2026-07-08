import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { Abonnement, Promotion } from '../../types';
import { MonthPicker } from './MonthPicker';
import HistoryFilterBar, { FilterField, FilterInput, FilterSegmented } from '../common/HistoryFilterBar';

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
  onboarding:          'OnBoarding',
  mensualite:          'Mensualité',
  supplement_gerant:   'Supplément Gérant',
  supplement_labo:     'Supplément Labo',
  supplement_activite: 'Supplément Activité',
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const fmtMois = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—';

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
    mensualite: { base: number; effectif: number; hasPromo: boolean; promoType: string | null; coversAll?: boolean; baseActivite?: number; baseGerant?: number; baseLabo?: number };
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

  // detail tabs
  const [activeDetailTab, setActiveDetailTab] = useState<'configuration' | 'paiements' | 'activation' | 'promotions' | 'paiement'>('configuration');
  const [promoFilterApplies, setPromoFilterApplies] = useState<string>('');
  const [paiementFilterStatut, setPaiementFilterStatut] = useState<string>('');

  // module vente
  const [moduleVenteSaving, setModuleVenteSaving] = useState(false);
  const [moduleVenteError, setModuleVenteError] = useState<string | null>(null);

  // module acheteurs
  const [moduleAcheteursSaving, setModuleAcheteursSaving] = useState(false);
  const [moduleAcheteursError, setModuleAcheteursError] = useState<string | null>(null);
  const [nbAcheteursInput, setNbAcheteursInput] = useState('0');
  // Synchronise le champ quota avec la config du client sélectionné
  useEffect(() => {
    setNbAcheteursInput(String(selected?.config?.nbAcheteurs ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.clientId, selected?.config?.nbAcheteurs]);

  // Assistant IA (intégré à l'application)
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // AI assistant / Messenger
  const [aiMessengerLinked, setAiMessengerLinked] = useState(false);
  const [aiMessengerInviteLink, setAiMessengerInviteLink] = useState<string | null>(null);
  const [aiMessengerLinkCopied, setAiMessengerLinkCopied] = useState(false);
  const [aiMessengerInviteGenerating, setAiMessengerInviteGenerating] = useState(false);

  // invite

  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState('actif');

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
    setPromoError(null);
    setModuleVenteError(null);
    setEditingPromo(null);
    setActiveDetailTab('configuration');
    setPromoAppliesTo('mensualite');
    setPromoType('percent_off');
    setPromoMoisDebut('');
    setPromoMonths('');
    setPromoDiscountVal('');
    setPromoFixedVal('');
    setPMontantInfo(null);
    try {
      const [abRes, aiRes] = await Promise.all([
        api.get(`/api/abonnements/client/${ab.clientId}?withPricing=1`),
        api.get(`/api/ai-assistant/config/${ab.clientId}`).catch(() => ({ data: { enabled: false } })),
      ]);
      setSelected(abRes.data);
      setAiEnabled(aiRes.data.enabled ?? false);
      setAiMessengerLinked(aiRes.data.messengerLinked ?? false);
      setAiMessengerInviteLink(aiRes.data.messengerInviteLink ?? null);
      setAiError(null);
      setAiMessengerLinkCopied(false);
      setObDatePaiement(abRes.data.dateOnboarding ? abRes.data.dateOnboarding.slice(0, 10) : '');
      // Default mensualité month to current month
      const now = new Date();
      setPMois(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      setPDatePaiement('');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const toggleModuleVente = async (newActif: boolean) => {
    if (!selected || moduleVenteSaving) return;
    setModuleVenteError(null);
    setModuleVenteSaving(true);
    try {
      const res = await api.put(`/api/abonnements/client/${selected.clientId}/module-vente`, { actif: newActif });
      setSelected(s => s ? { ...s, moduleVenteActif: newActif, moduleVenteActivatedAt: res.data.moduleVenteActivatedAt ?? null } : s);
      fetchList();
    } catch (err: unknown) {
      setModuleVenteError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur');
    } finally {
      setModuleVenteSaving(false);
    }
  };

  // Module Acheteurs : activation + quota nb_acheteurs (contrôlé côté serveur à la création d'acheteurs)
  const saveModuleAcheteurs = async (newActif: boolean) => {
    if (!selected || moduleAcheteursSaving) return;
    setModuleAcheteursError(null);
    setModuleAcheteursSaving(true);
    try {
      const nb = parseInt(nbAcheteursInput, 10);
      const payload: { actif: boolean; nbAcheteurs?: number } = { actif: newActif };
      if (Number.isFinite(nb) && nb >= 0) payload.nbAcheteurs = nb;
      const res = await api.put(`/api/abonnements/client/${selected.clientId}/module-acheteurs`, payload);
      if (payload.nbAcheteurs !== undefined && res.data.nbAcheteurs == null) {
        setModuleAcheteursError("Quota non enregistré — définissez d'abord la configuration d'abonnement (activités/labos/gérants)");
      }
      setSelected(s => s ? {
        ...s,
        moduleAcheteursActif: newActif,
        moduleAcheteursActivatedAt: res.data.moduleAcheteursActivatedAt ?? null,
        config: s.config ? { ...s.config, nbAcheteurs: res.data.nbAcheteurs ?? s.config.nbAcheteurs } : s.config,
      } : s);
      fetchList();
    } catch (err: unknown) {
      setModuleAcheteursError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur');
    } finally {
      setModuleAcheteursSaving(false);
    }
  };

  const saveAiConfig = async (newEnabled: boolean) => {
    if (!selected || aiSaving) return;
    setAiError(null);
    setAiSaving(true);
    try {
      await api.put(`/api/ai-assistant/config/${selected.clientId}`, { enabled: newEnabled });
      setAiEnabled(newEnabled);
    } catch (err: unknown) {
      setAiError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur lors de la sauvegarde');
    } finally {
      setAiSaving(false);
    }
  };

  const generateMessengerInviteLink = async () => {
    if (!selected || aiMessengerInviteGenerating) return;
    setAiMessengerInviteGenerating(true);
    try {
      const res = await api.post(`/api/ai-assistant/config/${selected.clientId}/messenger-invite`);
      setAiMessengerInviteLink(res.data.messengerInviteLink);
      setAiMessengerLinked(false);
    } catch (err: unknown) {
      setAiError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur génération lien Messenger');
    } finally {
      setAiMessengerInviteGenerating(false);
    }
  };

  const copyMessengerInviteLink = () => {
    if (!aiMessengerInviteLink) return;
    navigator.clipboard.writeText(aiMessengerInviteLink);
    setAiMessengerLinkCopied(true);
    setTimeout(() => setAiMessengerLinkCopied(false), 2000);
  };

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

  // Affichage global (vue d'ensemble) — stats aérées + filtres par statut.
  const countMode = (mode: string) => abonnements.filter((a) => a.modeCompte === mode).length;
  const statStrip = [
    { label: 'Clients', value: abonnements.length, color: '#0f172a' },
    { label: 'Actifs', value: countMode('actif'), color: '#16a34a' },
    { label: 'Promos', value: abonnements.filter((a) => a.hasActivePromo).length, color: '#d97706' },
  ];
  // « Tous » + uniquement les statuts présents (déclutter automatique).
  const modeFilters = [
    { value: '', label: 'Tous', color: '#0d9488', count: abonnements.length },
    ...Object.entries(MODE_LABELS)
      .map(([value, m]) => ({ value, label: m.label, color: m.color, count: countMode(value) }))
      .filter((f) => f.count > 0),
  ];

  // Promo availability derived vars
  const activePromos = selected?.promotions?.filter((p) => p.isActive) || [];
  const activeObPromo = activePromos.find((p) => ['onboarding', 'les_deux'].includes(p.appliesTo)) || null;
  const activeMensPromo = activePromos.find((p) => ['mensualite', 'les_deux'].includes(p.appliesTo)) || null;
  const activeGerantPromo = activePromos.find((p) => p.appliesTo === 'supplement_gerant') || null;
  const activeLaboPromo = activePromos.find((p) => p.appliesTo === 'supplement_labo') || null;
  const activeActivitePromo = activePromos.find((p) => p.appliesTo === 'supplement_activite') || null;

  const hideOnboarding = ['payé', 'offert', 'gratuit'].includes(selected?.statutOnboarding || '') || !!activeObPromo;
  const hideMensPermanent = !!activeMensPromo && !activeMensPromo.dateFin;
  const hideGerantPermanent = !!activeGerantPromo && !activeGerantPromo.dateFin;
  const hideLaboPermanent = !!activeLaboPromo && !activeLaboPromo.dateFin;
  const hideActivitePermanent = !!activeActivitePromo && !activeActivitePromo.dateFin;



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
    (!hideActivitePermanent || editingPromo?.appliesTo === 'supplement_activite') ? { value: 'supplement_activite', label: 'Supplément Activité' } : null,
  ].filter(Boolean) as { value: string; label: string }[];

  // Compute months blocked by existing promos for the current promoAppliesTo
  const conflictAppliesMap: Record<string, string[]> = {
    mensualite: ['mensualite', 'les_deux'],
    supplement_gerant: ['supplement_gerant'],
    supplement_labo: ['supplement_labo'],
    supplement_activite: ['supplement_activite'],
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
      <div style={{ flex: '0 0 380px', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 24px rgba(30,27,75,0.10)' }}>
        {/* Hero — épuré */}
        <div style={{ padding: '20px 20px 16px', background: 'linear-gradient(135deg,#0f766e 0%,#0d9488 55%,#14b8a6 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>💳</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>Abonnements clients</h2>
              <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(255,255,255,0.7)' }}>{abonnements.length} client{abonnements.length !== 1 ? 's' : ''} · {countMode('actif')} actif{countMode('actif') !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
        {/* Bandeau statistiques — aéré, fond clair */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
          {statStrip.map((s, i) => (
            <div key={s.label} style={{ flex: 1, padding: '13px 8px', textAlign: 'center', borderRight: i < statStrip.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 5 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {/* Filtres — enveloppés dans HistoryFilterBar (recherche + statut segmenté) */}
        <div style={{ padding: '12px 14px 0' }}>
          <HistoryFilterBar
            accent="#0d9488"
            accentDark="#0f766e"
            title="Filtrer par statut"
            subtitle={`${filtered.length} résultat${filtered.length !== 1 ? 's' : ''}`}
          >
            <FilterField label="🔍 Recherche">
              <FilterInput
                type="text"
                placeholder="Rechercher par nom ou email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </FilterField>
            <FilterField label="📊 Statut" span>
              <FilterSegmented
                options={modeFilters.map(({ value, label, count }) => ({ value, label, count }))}
                value={filterMode}
                onChange={(v) => setFilterMode(v)}
                accent="#0d9488"
              />
            </FilterField>
          </HistoryFilterBar>
        </div>
        {/* Client list */}
        <div style={{ overflowY: 'auto', maxHeight: 520 }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Chargement...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#9ca3af' }}>Aucun abonnement</div>
              {filterMode && <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>Essayez un autre filtre</div>}
            </div>
          ) : filtered.map((ab) => {
            const m = MODE_LABELS[ab.modeCompte] || MODE_LABELS.actif;
            const isSelected = selected?.clientId === ab.clientId;
            const initials = ab.clientNom ? ab.clientNom.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?';
            const palette = ['#dbeafe:#1d4ed8','#dcfce7:#166534','#fce7f3:#9d174d','#ede9fe:#6d28d9','#fff7ed:#c2410c','#e0f2fe:#075985'];
            const parts = palette[(ab.clientNom?.charCodeAt(0) || 0) % palette.length].split(':');
            const avBg = parts[0], avText = parts[1];
            return (
              <div key={ab.id} onClick={() => openDetail(ab)}
                style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', borderLeft: `3px solid ${isSelected ? '#4f46e5' : 'transparent'}`, background: isSelected ? '#f0f0ff' : 'transparent', transition: 'background 0.1s' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: isSelected ? '#e0e7ff' : avBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: isSelected ? '#4f46e5' : avText, flexShrink: 0 }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ab.clientNom}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ab.clientEmail}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>Depuis {fmtDate(ab.dateDebut)}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: m.color + '18', color: m.color, whiteSpace: 'nowrap' }}>{m.label}</span>
                    {ab.hasActivePromo && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: '#fef3c7', color: '#92400e' }}>🏷️</span>}
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
            {(() => {
              const detailInitials = selected.clientNom ? selected.clientNom.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?';
              const detailM = MODE_LABELS[selected.modeCompte] || MODE_LABELS.actif;
              return (
                <div style={{ background: 'linear-gradient(135deg,#1e1b4b 0%,#3730a3 55%,#4f46e5 100%)', borderRadius: 14, padding: '18px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {detailInitials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.clientNom}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.clientEmail}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Client depuis {fmtDate(selected.dateDebut)}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: '#fff', border: `1.5px solid ${detailM.color}60` }}>
                      {detailM.label}
                    </span>
                    {selected.hasActivePromo && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(253,224,71,0.2)', color: '#fde047', border: '1px solid rgba(253,224,71,0.3)' }}>🏷️ Promo active</span>
                    )}
                  </div>
                </div>
              );
            })()}


            {/* ── Tab bar ────────────────────────────────────────────── */}
            {(() => {
              const TAB_COLOR = '#0d9488';
              const tabs: { key: typeof activeDetailTab; label: string }[] = [
                { key: 'configuration', label: 'Configuration' },
                { key: 'paiements', label: 'Paiements et Promotions' },
                { key: 'activation', label: 'Activation' },
                { key: 'promotions', label: 'Promotions' },
                { key: 'paiement', label: 'Paiement' },
              ];
              return (
                <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
                  {tabs.map((t) => {
                    const isActive = activeDetailTab === t.key;
                    return (
                      <button key={t.key} onClick={() => setActiveDetailTab(t.key)} style={{
                        padding: '8px 16px', fontSize: '0.85rem', cursor: 'pointer',
                        background: 'none', border: 'none',
                        borderBottom: isActive ? `3px solid ${TAB_COLOR}` : 'none',
                        color: isActive ? TAB_COLOR : 'var(--text-muted)',
                        fontWeight: isActive ? 700 : 400,
                        marginBottom: -2,
                      }}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── Tab 1: Configuration ───────────────────────────────── */}
            {activeDetailTab === 'configuration' && (
              <>
            {/* ── Configuration Souscrite ────────────────────────────── */}
            {selected.config && (() => {
              const cfg = selected.config!;
              const bd = selected.pricing?.configBreakdown;
              // Use real breakdown totals from API; fall back to pricing.baseMensuel
              const totalActivite = bd?.activite.total ?? (selected.pricing?.baseMensuel ?? 0);
              const totalLabo     = bd?.labo.total     ?? 0;
              const totalGerant   = bd?.gerant.total   ?? 0;
              const totalMensuel  = bd
                ? (bd.activite.total + bd.labo.total + bd.gerant.total)
                : (selected.pricing?.baseMensuel ?? 0);
              const pLaboUnit   = bd?.prixLaboSup;
              const pGerantUnit = bd?.prixGerantSup;

              const activiteLabel = `${cfg.nbActivites} activité${cfg.nbActivites > 1 ? 's' : ''} — ${totalActivite} DT/mois`;
              const items = [
                { icon: '🏪', label: 'Activité(s)', value: activiteLabel },
                ...(cfg.nbLabos > 0 ? [{
                  icon: '🧪', label: 'Labo(s)',
                  value: `${cfg.nbLabos} labo${cfg.nbLabos > 1 ? 's' : ''}${pLaboUnit ? ` — ${cfg.nbLabos} × ${pLaboUnit} DT` : ''} — ${totalLabo} DT/mois`,
                }] : []),
                ...(cfg.nbGerants > 0 ? [{
                  icon: '👤', label: 'Gérant(s)',
                  value: `${cfg.nbGerants} gérant${cfg.nbGerants > 1 ? 's' : ''}${pGerantUnit ? ` — ${cfg.nbGerants} × ${pGerantUnit} DT` : ''} — ${totalGerant} DT/mois`,
                }] : []),
              ];
              return (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 20, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)', borderBottom: '1px solid #ddd6fe' }}>
                    <span style={{ fontSize: 18 }}>⚙️</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#4c1d95' }}>Configuration souscrite</div>
                      <div style={{ fontSize: 11, color: '#6d28d9', marginTop: 1 }}>Capacité configurée par l'administrateur</div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#4c1d95' }}>{totalMensuel} DT/mois</span>
                  </div>
                  <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 28, height: 28, background: '#f5f3ff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</span>
                          <div style={{ fontSize: 13, color: '#374151', marginTop: 1 }}>{item.value}</div>
                        </div>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid #e9d5ff', paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>Onboarding (one-time)</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#4c1d95' }}>{cfg.montantOnboarding} DT</span>
                    </div>
                  </div>
                </div>
              );
            })()}

              </>
            )}

            {/* ── Tab 2: Paiements et Promotions ─────────────────────── */}
            {activeDetailTab === 'paiements' && (
              <>
            {/* ── Promotions ─────────────────────────────────────────── */}
            <div style={{ background: '#fffbeb', borderRadius: 10, padding: 16, border: '1px solid #fde68a', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 14 }}>🏷️ Promotions</div>

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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10, alignItems: 'start' }}>
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
                          {!promoMoisDebut && <span style={{ color: '#d97706', marginLeft: 4 }}>(requis)</span>}
                        </label>
                        <MonthPicker
                          value={promoMoisDebut}
                          onChange={setPromoMoisDebut}
                          isDisabled={(ym) => {
                            const minMois = selected?.dateDebut?.slice(0, 7);
                            if (minMois && ym < minMois) return true;
                            if (paidMonthSet.has(ym)) return true;
                            if (promoBlockedMonths.has(ym)) return true;
                            return false;
                          }}
                        />
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

            {/* ── Mensualité + Onboarding 2-col grid ─────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
                        {(() => {
                          const mens = pMontantInfo.breakdown.mensualite;
                          const cfg = selected.config;
                          if (mens.coversAll) {
                            // Show individual component rows + a discount row
                            const sg = pMontantInfo.breakdown.supplementGerant;
                            const sl = pMontantInfo.breakdown.supplementLabo;
                            // Derive activité base robustly: fallback = total minus gérant and labo
                            const baseActivite = (mens.baseActivite != null && mens.baseActivite > 0)
                              ? mens.baseActivite
                              : mens.base - (sg.active ? sg.base : 0) - (sl.active ? sl.base : 0);
                            const compRows = [
                              { label: cfg ? `Activités (×${cfg.nbActivites})` : 'Activités', base: baseActivite, show: true },
                              { label: cfg && sg.active ? `Gérant(s) (×${cfg.nbGerants})` : 'Gérant(s)', base: sg.base, show: sg.active },
                              { label: cfg && sl.active ? `Labo(s) (×${cfg.nbLabos})` : 'Labo(s)', base: sl.base, show: sl.active },
                            ].filter((r) => r.show);
                            const isFree = mens.promoType === 'free_months';
                            const pct = !isFree && mens.promoType === 'percent_off' && mens.base > 0
                              ? Math.round((1 - mens.effectif / mens.base) * 100)
                              : null;
                            return (
                              <>
                                {compRows.map((r) => (
                                  <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 90px', padding: '10px 14px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center' }}>{r.label}</span>
                                    <span style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center' }}>{r.base} DT</span>
                                    <span style={{ fontSize: 11, color: '#cbd5e1', display: 'flex', alignItems: 'center' }}>—</span>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>{r.base} DT</span>
                                  </div>
                                ))}
                                {/* Discount row */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 90px', padding: '10px 14px', borderBottom: '1px solid #e2e8f0', background: isFree ? '#f0fdf4' : '#fffbeb' }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: isFree ? '#166534' : '#92400e', display: 'flex', alignItems: 'center' }}>
                                    {isFree ? '🎁 Gratuit (promo mensualité)' : '🏷️ Remise mensualité'}
                                  </span>
                                  <span style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'line-through', display: 'flex', alignItems: 'center' }}>{mens.base} DT</span>
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: isFree ? '#dcfce7' : '#fef3c7', color: isFree ? '#166534' : '#92400e', display: 'flex', alignItems: 'center', width: 'fit-content' }}>
                                    {isFree ? '100%' : pct != null ? `-${pct}%` : `-${mens.base - mens.effectif} DT`}
                                  </span>
                                  <span style={{ fontSize: 14, fontWeight: 800, color: isFree ? '#16a34a' : '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                    {isFree ? '0 DT' : `${mens.effectif} DT`}
                                  </span>
                                </div>
                              </>
                            );
                          }
                          // Normal breakdown (no global promo or per-component promos)
                          return [
                            { label: cfg ? `Activités (×${cfg.nbActivites})` : 'Activités', ...mens, show: true },
                            { label: cfg && pMontantInfo.breakdown.supplementGerant.active ? `Gérant(s) (×${cfg.nbGerants})` : 'Gérant(s)', ...pMontantInfo.breakdown.supplementGerant, show: pMontantInfo.breakdown.supplementGerant.active },
                            { label: cfg && pMontantInfo.breakdown.supplementLabo.active ? `Labo(s) (×${cfg.nbLabos})` : 'Labo(s)', ...pMontantInfo.breakdown.supplementLabo, show: pMontantInfo.breakdown.supplementLabo.active },
                          ].filter((i) => i.show).map((item, idx, arr) => {
                            const isFree = item.promoType === 'free_months';
                            const hasDiscount = item.hasPromo && item.effectif !== item.base;
                            const reduction = item.base - item.effectif;
                            return (
                              <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 90px', gap: 0, padding: '10px 14px', borderBottom: idx < arr.length - 1 ? '1px solid #e2e8f0' : 'none', background: isFree ? '#f0fdf4' : '#fff' }}>
                                <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{item.label}</span></div>
                                <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ fontSize: 13, color: hasDiscount || isFree ? '#94a3b8' : '#374151', textDecoration: hasDiscount || isFree ? 'line-through' : 'none' }}>{item.base} DT</span></div>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                  {isFree ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#dcfce7', color: '#166534' }}>🎁 Gratuit</span>
                                  : hasDiscount ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>🏷️ -{reduction} DT</span>
                                  : <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}><span style={{ fontSize: 14, fontWeight: 800, color: isFree ? '#16a34a' : '#0f172a' }}>{item.effectif} DT</span></div>
                              </div>
                            );
                          });
                        })()}

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

            </div>{/* end 2-col grid */}
              </>
            )}

            {/* ── Tab 3: Activation ──────────────────────────────────── */}
            {activeDetailTab === 'activation' && (
              <>
            {/* ── Module Vente ────────────────────────────────────────── */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #fcd34d', overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)', borderBottom: '1px solid #fcd34d' }}>
                <span style={{ fontSize: 20 }}>🛒</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#78350f' }}>Module Vente</div>
                  <div style={{ fontSize: 11, color: '#92400e', marginTop: 1 }}>Catalogue vendable, prestataires, rapport de rentabilité</div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: selected.moduleVenteActif ? '#dcfce7' : '#fee2e2', color: selected.moduleVenteActif ? '#166534' : '#991b1b' }}>
                  {selected.moduleVenteActif ? '✅ Actif' : '🔒 Inactif'}
                </span>
              </div>
              <div style={{ padding: '14px 18px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {selected.moduleVenteActif ? (
                  <button onClick={() => toggleModuleVente(false)} disabled={moduleVenteSaving}
                    style={{ fontSize: 12, padding: '7px 16px', borderRadius: 8, border: '1.5px solid #dc2626', background: '#fff', color: '#dc2626', cursor: moduleVenteSaving ? 'default' : 'pointer', fontWeight: 700, opacity: moduleVenteSaving ? 0.7 : 1 }}>
                    {moduleVenteSaving ? '…' : '🔒 Désactiver'}
                  </button>
                ) : (
                  <button onClick={() => toggleModuleVente(true)} disabled={moduleVenteSaving}
                    style={{ fontSize: 12, padding: '7px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#78350f,#b45309)', color: '#fff', cursor: moduleVenteSaving ? 'default' : 'pointer', fontWeight: 700, opacity: moduleVenteSaving ? 0.7 : 1 }}>
                    {moduleVenteSaving ? '…' : '🚀 Activer'}
                  </button>
                )}
                {selected.moduleVenteActivatedAt && (
                  <span style={{ fontSize: 11, color: '#92400e' }}>
                    Activé le {fmtDate(selected.moduleVenteActivatedAt)}
                  </span>
                )}
                {moduleVenteError && <span style={{ fontSize: 11, color: '#dc2626' }}>{moduleVenteError}</span>}
              </div>
            </div>

            {/* ── Module Acheteurs ────────────────────────────────────── */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #c4b5fd', overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)', borderBottom: '1px solid #c4b5fd' }}>
                <span style={{ fontSize: 20 }}>🤝</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#4c1d95' }}>Module Acheteurs</div>
                  <div style={{ fontSize: 11, color: '#6d28d9', marginTop: 1 }}>Carnet d'acheteurs B2B, vente depuis le stock labo, portail de commande</div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: selected.moduleAcheteursActif ? '#dcfce7' : '#fee2e2', color: selected.moduleAcheteursActif ? '#166534' : '#991b1b' }}>
                  {selected.moduleAcheteursActif ? '✅ Actif' : '🔒 Inactif'}
                </span>
              </div>
              <div style={{ padding: '14px 18px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#4c1d95' }}>
                  Quota acheteurs
                  <input value={nbAcheteursInput} onChange={e => setNbAcheteursInput(e.target.value)}
                    style={{ width: 64, padding: '6px 8px', borderRadius: 8, border: '1px solid #c4b5fd', fontSize: 12, fontFamily: 'inherit' }} />
                </label>
                {selected.moduleAcheteursActif ? (
                  <>
                    <button onClick={() => saveModuleAcheteurs(true)} disabled={moduleAcheteursSaving}
                      style={{ fontSize: 12, padding: '7px 16px', borderRadius: 8, border: '1.5px solid #6d28d9', background: '#fff', color: '#6d28d9', cursor: moduleAcheteursSaving ? 'default' : 'pointer', fontWeight: 700, opacity: moduleAcheteursSaving ? 0.7 : 1 }}>
                      {moduleAcheteursSaving ? '…' : '💾 Enregistrer le quota'}
                    </button>
                    <button onClick={() => saveModuleAcheteurs(false)} disabled={moduleAcheteursSaving}
                      style={{ fontSize: 12, padding: '7px 16px', borderRadius: 8, border: '1.5px solid #dc2626', background: '#fff', color: '#dc2626', cursor: moduleAcheteursSaving ? 'default' : 'pointer', fontWeight: 700, opacity: moduleAcheteursSaving ? 0.7 : 1 }}>
                      {moduleAcheteursSaving ? '…' : '🔒 Désactiver'}
                    </button>
                  </>
                ) : (
                  <button onClick={() => saveModuleAcheteurs(true)} disabled={moduleAcheteursSaving}
                    style={{ fontSize: 12, padding: '7px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#4c1d95,#6d28d9)', color: '#fff', cursor: moduleAcheteursSaving ? 'default' : 'pointer', fontWeight: 700, opacity: moduleAcheteursSaving ? 0.7 : 1 }}>
                    {moduleAcheteursSaving ? '…' : '🚀 Activer'}
                  </button>
                )}
                {selected.moduleAcheteursActivatedAt && (
                  <span style={{ fontSize: 11, color: '#6d28d9' }}>
                    Activé le {fmtDate(selected.moduleAcheteursActivatedAt)}
                  </span>
                )}
                {moduleAcheteursError && <span style={{ fontSize: 11, color: '#dc2626' }}>{moduleAcheteursError}</span>}
              </div>
            </div>

            {/* ── Contrat ─────────────────────────────────────────────── */}
            <div style={{ background: '#fff', borderRadius: 12, border: `1.5px solid ${selected.contratAccepteLe ? '#86efac' : '#fca5a5'}`, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: selected.contratAccepteLe ? 'linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%)' : 'linear-gradient(135deg,#fff1f2 0%,#fee2e2 100%)', borderBottom: `1px solid ${selected.contratAccepteLe ? '#86efac' : '#fca5a5'}` }}>
                <span style={{ fontSize: 20 }}>📄</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: selected.contratAccepteLe ? '#14532d' : '#7f1d1d' }}>Contrat d'abonnement</div>
                  <div style={{ fontSize: 11, color: selected.contratAccepteLe ? '#16a34a' : '#b91c1c', marginTop: 1 }}>
                    {selected.contratAccepteLe ? `Signé le ${fmtDate(selected.contratAccepteLe)}${selected.contratAccepteIp ? ` · IP ${selected.contratAccepteIp}` : ''}` : 'En attente de signature client'}
                  </div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: selected.contratAccepteLe ? '#dcfce7' : '#fee2e2', color: selected.contratAccepteLe ? '#166534' : '#991b1b' }}>
                  {selected.contratAccepteLe ? '✅ Signé' : '⏳ En attente'}
                </span>
              </div>
            </div>

            {/* ── Assistant IA ────────────────────────────────────────── */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%)', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 20 }}>🤖</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Assistant IA</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>Assistant intégré à l'application : répond aux questions du client sur ses données (stock, ventes, pertes…) et sur le fonctionnement de LabFlow</div>
                </div>
                <div style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: aiEnabled ? '#dcfce7' : '#f1f5f9', color: aiEnabled ? '#16a34a' : '#94a3b8' }}>
                  {aiEnabled ? '🟢 Actif' : '⭕ Inactif'}
                </div>
              </div>

              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {aiError && (
                  <div style={{ fontSize: 12, color: '#ef4444', background: '#fee2e2', borderRadius: 8, padding: '8px 12px' }}>
                    {aiError}
                  </div>
                )}

                {!aiEnabled ? (
                  <button
                    onClick={() => saveAiConfig(true)}
                    disabled={aiSaving}
                    style={{ padding: '10px', borderRadius: 8, border: 'none', background: aiSaving ? '#e2e8f0' : 'linear-gradient(135deg,#3b82f6,#6366f1)', color: aiSaving ? '#94a3b8' : '#fff', fontWeight: 700, fontSize: 13, cursor: aiSaving ? 'not-allowed' : 'pointer' }}
                  >
                    {aiSaving ? 'Activation…' : '🟢 Activer l\'assistant IA'}
                  </button>
                ) : (
                  <button
                    onClick={() => saveAiConfig(false)}
                    disabled={aiSaving}
                    style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff', color: '#ef4444', fontWeight: 700, fontSize: 13, cursor: aiSaving ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}
                  >
                    {aiSaving ? 'Désactivation…' : '🔒 Désactiver'}
                  </button>
                )}

                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  Une fois activé, le client dispose de l'onglet <strong>Assistant IA</strong> dans son application (menu latéral). Messenger, ci-dessous, est un canal optionnel qui s'appuie sur ce même assistant.
                </div>
              </div>
            </div>

            {/* ── Agent IA Messenger ─────────────────────────────────── */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%)', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 20 }}>💬</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Agent IA Messenger</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>L'agent répond sur Facebook Messenger aux questions stock, inventaire, pertes et envoie des rapports par email</div>
                </div>
                <div style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: aiEnabled && aiMessengerLinked ? '#dcfce7' : aiEnabled ? '#fef3c7' : '#f1f5f9', color: aiEnabled && aiMessengerLinked ? '#16a34a' : aiEnabled ? '#92400e' : '#94a3b8' }}>
                  {aiEnabled && aiMessengerLinked ? '🟢 Actif' : aiEnabled ? '⏳ En attente' : '⭕ Inactif'}
                </div>
              </div>

              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Messenger invite link */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {aiMessengerLinked ? (
                    <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✅ Client lié à Messenger — l'agent est opérationnel</div>
                  ) : aiMessengerInviteLink ? (
                    <>
                      <div style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>📨 Envoyez ce lien au client pour lier Messenger :</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <code style={{ flex: 1, fontSize: 11, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {aiMessengerInviteLink}
                        </code>
                        <button
                          onClick={copyMessengerInviteLink}
                          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0', background: aiMessengerLinkCopied ? '#dcfce7' : '#fff', color: aiMessengerLinkCopied ? '#16a34a' : '#374151', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                        >
                          {aiMessengerLinkCopied ? '✅ Copié' : '📋 Copier'}
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>Le client clique → Messenger s'ouvre → l'agent l'identifie et lui envoie un message de bienvenue.</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>Aucun lien généré</div>
                  )}
                  <button
                    onClick={generateMessengerInviteLink}
                    disabled={aiMessengerInviteGenerating}
                    style={{ fontSize: 11, padding: '6px 12px', borderRadius: 6, border: '1px solid #1877f2', background: '#fff', color: '#1877f2', cursor: aiMessengerInviteGenerating ? 'not-allowed' : 'pointer', fontWeight: 600, alignSelf: 'flex-start' }}
                  >
                    {aiMessengerInviteGenerating ? 'Génération…' : '🔗 Générer un nouveau lien'}
                  </button>
                </div>
              </div>
            </div>

              </>
            )}

            {/* ── Tab 4: Promotions ──────────────────────────────────── */}
            {activeDetailTab === 'promotions' && (
              <>
              {/* Filter buttons */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {(['', 'mensualite', 'onboarding', 'supplement_gerant', 'supplement_labo', 'supplement_activite'] as const).map((val) => {
                  const labelMap: Record<string, string> = { '': 'Toutes', mensualite: 'Mensualité', onboarding: 'Onboarding', supplement_gerant: 'Supplément Gérant', supplement_labo: 'Supplément Labo', supplement_activite: 'Supplément Activité' };
                  const isActive = promoFilterApplies === val;
                  return (
                    <button key={val} onClick={() => setPromoFilterApplies(val)} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${isActive ? '#0d9488' : '#e2e8f0'}`, background: isActive ? '#0d948818' : '#fff', color: isActive ? '#0d9488' : '#94a3b8' }}>
                      {labelMap[val] ?? val}
                    </button>
                  );
                })}
              </div>
              {/* Promo cards */}
              {(() => {
                const promos = (selected.promotions || []).filter((p) => !promoFilterApplies || p.appliesTo === promoFilterApplies);
                if (promos.length === 0) return <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '32px 0' }}>Aucune promotion</div>;
                return promos.map((p) => {
                  const isFuture = p.dateDebut > todayStr;
                  const badge = isFuture ? 'Planifié' : p.statutPromo === 'expiré' ? 'Expiré' : 'Actif';
                  const badgeBg = isFuture ? '#6366f1' : p.statutPromo === 'expiré' ? '#9ca3af' : '#f59e0b';
                  let remiseStr = '';
                  if (p.type === 'free_months') remiseStr = 'Gratuit (100%)';
                  else if (p.type === 'percent_off') { const v = p.discountSupplement ?? p.discountMensualite ?? p.discountOnboarding; remiseStr = v ? `-${v}%` : '—'; }
                  else { const v = p.fixedSupplement ?? p.fixedMensualite ?? p.fixedOnboarding; remiseStr = v ? `-${v} DT` : '—'; }
                  return (
                    <div key={p.id} style={{ background: '#fafafa', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 16px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 8px', background: badgeBg, color: '#fff', flexShrink: 0 }}>{badge}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{APPLIES_LABELS[p.appliesTo] || p.appliesTo}</span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{p.type === 'percent_off' ? '% Réduction' : p.type === 'free_months' ? 'Gratuit' : 'Prix fixe'} · {remiseStr}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>{fmtDate(p.dateDebut)} → {p.dateFin ? fmtDate(p.dateFin) : 'Permanent'}</span>
                    </div>
                  );
                });
              })()}
              <div style={{ marginTop: 8 }}>
                <button onClick={() => setActiveDetailTab('paiements')} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#0d9488', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  + Ajouter une promotion
                </button>
              </div>
              </>
            )}

            {/* ── Tab 5: Paiement ────────────────────────────────────── */}
            {activeDetailTab === 'paiement' && (
              <>
              {/* Filter buttons */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {(['', 'payé', 'impayé', 'en_attente', 'remisé', 'gratuit'] as const).map((val) => {
                  const labelMap: Record<string, string> = { '': 'Tous', payé: 'Payé', impayé: 'Impayé', en_attente: 'En attente', remisé: 'Remisé', gratuit: 'Gratuit' };
                  const isActive = paiementFilterStatut === val;
                  return (
                    <button key={val} onClick={() => setPaiementFilterStatut(val)} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${isActive ? '#0d9488' : '#e2e8f0'}`, background: isActive ? '#0d948818' : '#fff', color: isActive ? '#0d9488' : '#94a3b8' }}>
                      {labelMap[val] ?? val}
                    </button>
                  );
                })}
              </div>
              {/* Table */}
              {(() => {
                const paiements = (selected.paiements || []).filter((p) => !paiementFilterStatut || p.statut === paiementFilterStatut);
                if (paiements.length === 0) return <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '32px 0' }}>Aucun paiement</div>;
                return (
                  <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px 110px 1fr', padding: '8px 14px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                      {['Date (mois)', 'Montant', 'Statut', 'Date paiement', 'Notes'].map((h) => (
                        <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                      ))}
                    </div>
                    {paiements.map((p, idx) => {
                      const sc = STATUT_COLORS[p.statut] || { bg: '#f3f4f6', text: '#374151', label: p.statut };
                      return (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px 110px 1fr', padding: '10px 14px', borderBottom: '1px solid #f1f5f9', background: '#fff', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>{fmtMois(p.mois)}</span>
                          <span style={{ fontSize: 13, color: '#374151' }}>{p.montantDt != null ? `${p.montantDt} DT` : '—'}</span>
                          <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 12, background: sc.bg, color: sc.text, whiteSpace: 'nowrap' }}>{sc.label}</span>
                          <span style={{ fontSize: 12, color: '#6b7280' }}>{p.datePaiement ? fmtDate(p.datePaiement) : '—'}</span>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>{p.notes || '—'}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              </>
            )}

            {/* ── Tab 1 continued: Mode compte ───────────────────────── */}
            {activeDetailTab === 'configuration' && (() => {
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
