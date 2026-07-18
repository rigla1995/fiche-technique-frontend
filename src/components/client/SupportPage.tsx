import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import type { SupportDemande } from '../../types';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../common/ConfirmDialog';

const TYPE_LABELS: Record<string, { label: string; icon: string; desc: string }> = {
  supplement: { label: 'Ajout de capacité', icon: '➕', desc: 'Demander l\'ajout d\'activités, labos, gérants ou de l\'option Acheteurs' },
  aide:       { label: 'Besoin d\'aide',     icon: '💬', desc: 'Nous décrire votre besoin ou signaler un problème' },
};

const STATUT: Record<string, { label: string; bg: string; text: string; border: string }> = {
  en_attente: { label: 'En attente', bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  validée:    { label: 'Validée',    bg: '#dcfce7', text: '#166534', border: '#22c55e' },
  refusée:    { label: 'Refusée',    bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
};

const FILTERS = [
  { key: 'all',        label: 'Toutes' },
  { key: 'en_attente', label: 'En attente' },
  { key: 'validée',    label: 'Validées' },
  { key: 'refusée',    label: 'Refusées' },
] as const;

type FilterKey = typeof FILTERS[number]['key'];

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

interface PromoInfo { type: string; discount?: number | null; fixed?: number | null; }
interface SupplPricing {
  prixActiviteSup: number;
  prixLaboSup: number;
  prixGerantSup: number;
  currentMensuel: number;
  currentMensuelEffectif?: number;
  mensPromo?: { type: string; discount_mensualite?: number | null; fixed_mensualite?: number | null } | null;
  nbActivites: number;
  nbLabos: number;
  nbGerants: number;
  /** Option Acheteurs : quota actuel, palier couvrant, coût mensuel actuel, barème. */
  nbAcheteurs?: number;
  palierAcheteurs?: number | null;
  acheteursCost?: number;
  paliersAcheteurs?: { palier: number; prix: number }[];
  formuleActivites?: 'basique' | 'premium' | null;
  activitePromo?: PromoInfo | null;
  laboPromo?:     PromoInfo | null;
  gerantPromo?:   PromoInfo | null;
}

// Applique la promo mensualité (miroir backend applyPromoMensualite) au montant de base.
const applyMensPromo = (base: number, p?: SupplPricing['mensPromo']): number => {
  if (!p) return base;
  if (p.type === 'free_months') return 0;
  if (p.type === 'percent_off' && p.discount_mensualite != null) return Math.round(base * (1 - p.discount_mensualite / 100) * 100) / 100;
  if (p.type === 'fixed_price' && p.fixed_mensualite != null) return Number(p.fixed_mensualite);
  return base;
};

export default function SupportPage() {
  const { user } = useAuth();
  const isGerant = user?.role === 'gerant';
  const { clearAllFromDB } = useNotifications();
  const { confirm } = useConfirm();
  const [searchParams] = useSearchParams();
  const [demandes, setDemandes] = useState<SupportDemande[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<Record<number, boolean>>({});
  const [formType, setFormType] = useState<SupportDemande['type'] | null>(() => {
    const t = searchParams.get('type');
    return t && ['supplement', 'aide'].includes(t) ? t as SupportDemande['type'] : null;
  });
  const [showForm, setShowForm] = useState(() => {
    const t = searchParams.get('type');
    return !!(t && ['supplement', 'aide'].includes(t));
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterStatut, setFilterStatut] = useState<FilterKey>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  // Reference data
  const [supplPricing, setSupplPricing] = useState<SupplPricing | null>(null);

  // Supplement form
  const [nbActivites, setNbActivites] = useState(0);
  const [nbLabos, setNbLabos] = useState(0);
  const [nbGerants, setNbGerants] = useState(0);
  // Option Acheteurs : palier cible (0 = pas de changement)
  const [acheteursCible, setAcheteursCible] = useState(0);

  // Passage en formule Premium (demande dédiée, dédupliquée côté serveur)
  const [hasPendingPremium, setHasPendingPremium] = useState(false);
  const [requestingPremium, setRequestingPremium] = useState(false);

  // Aide form
  const [description, setDescription] = useState('');

  const fetchDemandes = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/abonnements/support');
      setDemandes(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchDemandes();
    clearAllFromDB();
    api.get('/api/abonnements/supplement-pricing').then(({ data }) => setSupplPricing(data)).catch(() => {});
    api.get('/api/abonnements/demandes')
      .then(({ data }) => setHasPendingPremium((data as { typeDemande: string; statut: string }[])
        .some(d => d.typeDemande === 'passer_formule_premium' && d.statut === 'en_attente')))
      .catch(() => {});
  }, [fetchDemandes, clearAllFromDB]);

  const resetForm = () => {
    setFormType(null);
    setNbActivites(0); setNbLabos(0); setNbGerants(0); setAcheteursCible(0); setDescription('');
    setError(null);
  };

  // Demande de passage en formule Premium (endpoint dédié — dédup 409 serveur)
  const requestPremium = async () => {
    setRequestingPremium(true);
    setError(null);
    try {
      await api.post('/api/abonnements/demandes', { typeDemande: 'passer_formule_premium' });
      setHasPendingPremium(true);
      setSuccess('Demande de passage en formule Activité Premium envoyée — nous revenons vers vous sous 24h.');
      setShowForm(false);
      resetForm();
      setTimeout(() => setSuccess(null), 8000);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      if (e?.response?.status === 409) setHasPendingPremium(true);
      setError(e?.response?.data?.message || 'Erreur lors de l\'envoi');
    } finally { setRequestingPremium(false); }
  };

  const deleteDemande = async (id: number) => {
    const ok = await confirm({
      title: 'Supprimer cette demande ?',
      tone: 'danger',
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    setDeleting(d => ({ ...d, [id]: true }));
    try {
      await api.delete(`/api/abonnements/support/${id}`);
      setDemandes(prev => prev.filter(d => d.id !== id));
    } catch { /* already processed — ignore */ }
    finally { setDeleting(d => ({ ...d, [id]: false })); }
  };

  const handleSubmit = async () => {
    if (!formType) return;
    setError(null);
    setSaving(true);
    try {
      let body: Record<string, unknown> = { type: formType };
      if (formType === 'supplement') {
        if (nbActivites + nbLabos + nbGerants + acheteursCible === 0) { setError('Indiquez au moins un supplément'); setSaving(false); return; }
        if (acheteursCible > 0 && acheteursNeedsLabo) {
          setError("L'option Acheteurs nécessite au moins un labo — ajoutez-en un à votre demande.");
          setSaving(false);
          return;
        }
        body = { ...body, nbActivitesSupp: nbActivites, nbLabosSupp: nbLabos, nbGerantsSupp: nbGerants };
        if (acheteursCible > 0) body.nbAcheteursCible = acheteursCible;
      } else {
        if (!description.trim()) { setError('Description requise'); setSaving(false); return; }
        body = { ...body, description: description.trim() };
      }
      const { data } = await api.post('/api/abonnements/support', body);
      if (formType === 'supplement' && data?.avenantEmailSent) {
        setSuccess('Votre avenant a été généré : un email avec le lien de signature vous a été envoyé. Signez-le pour que la capacité soit ajoutée automatiquement.');
      } else {
        setSuccess('Demande envoyée avec succès.');
      }
      setShowForm(false);
      resetForm();
      fetchDemandes();
      setTimeout(() => setSuccess(null), 8000);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e?.response?.data?.message || 'Erreur lors de l\'envoi');
    } finally { setSaving(false); }
  };

  const downloadContrat = async (id: number) => {
    try {
      const res = await api.get(`/api/abonnements/support/${id}/contrat-signe`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contrat-avenant-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Le contrat signé n\'est pas encore disponible.');
    }
  };

  const filtered = demandes.filter((d) => {
    if (filterStatut !== 'all' && d.statut !== filterStatut) return false;
    if (dateFrom && new Date(d.createdAt) < new Date(dateFrom)) return false;
    if (dateTo && new Date(d.createdAt) > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pending = demandes.filter(d => d.statut === 'en_attente').length;

  const promoLabel = (p: PromoInfo) =>
    p.type === 'percent_off' && p.discount != null ? `${p.discount}% de réduction`
    : p.type === 'free_months' ? 'Gratuit'
    : p.fixed != null ? `Prix fixe ${p.fixed} DT`
    : 'Promotion active';

  // Supplement live pricing
  // Option Acheteurs : le palier cible REMPLACE le palier actuel — le delta est la
  // différence de prix entre les deux paliers (pas une addition). Seuls les
  // paliers STRICTEMENT SUPÉRIEURS au palier COURANT sont proposés (comparer au
  // quota brut laissait le palier déjà détenu dans la liste — ex. quota 4 →
  // palier actuel 10 mais « Jusqu'à 10 » encore proposé).
  const paliersDispo = (supplPricing?.paliersAcheteurs ?? []).filter(p => p.palier > (supplPricing?.palierAcheteurs ?? 0));
  const cibleInfo = supplPricing?.paliersAcheteurs?.find(p => p.palier === acheteursCible) ?? null;
  const acheteursDelta = acheteursCible > 0 && cibleInfo
    ? Math.max(0, cibleInfo.prix - (supplPricing?.acheteursCost ?? 0))
    : 0;
  // L'option exige un labo : existant, ou ajouté dans cette même demande
  const acheteursNeedsLabo = (supplPricing?.nbLabos ?? 0) + nbLabos < 1;
  const supplTotal = supplPricing
    ? (supplPricing.currentMensuel ?? 0)
      + nbActivites * (supplPricing.prixActiviteSup ?? 0)
      + nbLabos * (supplPricing.prixLaboSup ?? 0)
      + nbGerants * (supplPricing.prixGerantSup ?? 0)
      + acheteursDelta
    : null;
  const supplDelta = supplPricing
    ? nbActivites * (supplPricing.prixActiviteSup ?? 0)
      + nbLabos * (supplPricing.prixLaboSup ?? 0)
      + nbGerants * (supplPricing.prixGerantSup ?? 0)
      + acheteursDelta
    : 0;
  // Total après application de la promo mensualité active (= ce qui sera sur l'avenant signé)
  const supplTotalEff = supplTotal != null ? applyMensPromo(supplTotal, supplPricing?.mensPromo) : null;
  const supplHasMensPromo = !!supplPricing?.mensPromo && supplTotalEff != null && supplTotal != null && supplTotalEff !== supplTotal;

  return (
    <div className="page">
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #164e63 0%, #0e7490 55%, #06b6d4 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(14,116,144,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>💬</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Demandes</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: 0 }}>
            Faites vos demandes — nous répondons sous 24h
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {pending > 0 && (
            <div style={{ background: '#fef3c7', borderRadius: 10, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1rem' }}>⏳</span>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700 }}>{pending} en attente</div>
              </div>
            </div>
          )}
          {!showForm && (
            <button onClick={() => { resetForm(); setShowForm(true); }}
              style={{ padding: '10px 22px', borderRadius: 10, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.25)' } as React.CSSProperties}>
              + Nouvelle demande
            </button>
          )}
        </div>
      </div>

      {success && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#166534', fontWeight: 600 }}>
          ✓ {success}
        </div>
      )}

      {/* New request form */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginBottom: 18 }}>Nouvelle demande</div>

          {!formType ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(TYPE_LABELS).filter(([key]) => !(isGerant && key === 'supplement')).map(([key, { label, icon, desc }]) => (
                <button key={key} onClick={() => setFormType(key as SupportDemande['type'])}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#f5f3ff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#fff'; }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>{icon}</div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{label}</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>{desc}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '1rem' }}>→</span>
                </button>
              ))}

              {/* Passage en formule Premium — visible seulement pour les comptes en formule Basique */}
              {!isGerant && supplPricing?.formuleActivites === 'basique' && (
                <button
                  onClick={hasPendingPremium || requestingPremium ? undefined : requestPremium}
                  disabled={hasPendingPremium || requestingPremium}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 12,
                    border: '1.5px solid #fcd34d', background: '#fffbeb', textAlign: 'left',
                    cursor: hasPendingPremium || requestingPremium ? 'default' : 'pointer',
                    opacity: hasPendingPremium ? 0.75 : 1,
                  }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>⭐</div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#78350f' }}>Passer en formule Activité Premium</div>
                    <div style={{ fontSize: '0.78rem', color: '#92400e', marginTop: 2 }}>
                      {hasPendingPremium
                        ? 'Demande déjà envoyée — en attente de validation.'
                        : 'Débloquez l\'Espace Produit complet : produits composés, fiches techniques, production.'}
                    </div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: '#b45309', fontSize: '0.85rem', fontWeight: 700 }}>
                    {requestingPremium ? '…' : hasPendingPremium ? '⏳' : 'Demander →'}
                  </span>
                </button>
              )}
              <button onClick={() => { resetForm(); setShowForm(false); }}
                style={{ marginTop: 4, padding: '9px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                Annuler
              </button>
            </div>
          ) : (
            <div>
              <button onClick={() => setFormType(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#6366f1', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
                ← Changer de type
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: '10px 14px', background: '#f5f3ff', borderRadius: 10 }}>
                <span style={{ fontSize: '1.25rem' }}>{TYPE_LABELS[formType].icon}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4c1d95' }}>{TYPE_LABELS[formType].label}</span>
              </div>

              {/* Supplement form */}
              {formType === 'supplement' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {supplPricing && (
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', fontSize: '0.82rem', color: '#1e40af', marginBottom: 4 }}>
                      Configuration actuelle :{' '}
                      <strong>
                        {supplPricing.nbActivites} activité{supplPricing.nbActivites !== 1 ? 's' : ''}
                        {supplPricing.nbLabos > 0 ? ` · ${supplPricing.nbLabos} labo${supplPricing.nbLabos !== 1 ? 's' : ''}` : ''}
                        {supplPricing.nbGerants > 0 ? ` · ${supplPricing.nbGerants} gérant${supplPricing.nbGerants !== 1 ? 's' : ''}` : ''}
                      </strong>
                    </div>
                  )}
                  {([
                    { promo: supplPricing?.activitePromo, label: 'activités supplémentaires' },
                    { promo: supplPricing?.laboPromo,     label: 'labos supplémentaires' },
                    { promo: supplPricing?.gerantPromo,   label: 'gérants supplémentaires' },
                  ] as { promo: PromoInfo | null | undefined; label: string }[]).filter(x => x.promo).map(({ promo, label }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, fontSize: '0.8rem', color: '#92400e', fontWeight: 600 }}>
                      <span style={{ fontSize: '1rem' }}>🏷️</span>
                      <span>Promotion active sur les {label} — {promoLabel(promo!)}</span>
                    </div>
                  ))}
                  {[
                    { label: 'Activités supplémentaires', value: nbActivites, set: setNbActivites, prix: supplPricing?.prixActiviteSup, promo: supplPricing?.activitePromo, hasPromo: !!supplPricing?.activitePromo },
                    { label: 'Labos supplémentaires',     value: nbLabos,     set: setNbLabos,     prix: supplPricing?.prixLaboSup,     promo: supplPricing?.laboPromo,     hasPromo: !!supplPricing?.laboPromo },
                    { label: 'Gérants supplémentaires',   value: nbGerants,   set: setNbGerants,   prix: supplPricing?.prixGerantSup,   promo: supplPricing?.gerantPromo,   hasPromo: !!supplPricing?.gerantPromo },
                  ].map(({ label, value, set, prix, promo, hasPromo }) => {
                    const prixApresPromo = promo && prix != null
                      ? promo.type === 'free_months' ? 0
                      : promo.type === 'percent_off' && promo.discount != null ? prix * (1 - promo.discount / 100)
                      : promo.fixed != null ? promo.fixed
                      : prix
                      : prix;
                    return (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: hasPromo ? '#fffbeb' : '#f8fafc', borderRadius: 10, border: `1px solid ${hasPromo ? '#fde68a' : '#e2e8f0'}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>{label}</div>
                          {hasPromo && <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: '#fef3c7', color: '#92400e' }}>🏷️ {promoLabel(promo!)}</span>}
                        </div>
                        {prix != null && !hasPromo && <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>{prix} DT / unité / mois</div>}
                        {prix != null && hasPromo && (
                          <div style={{ fontSize: '0.75rem', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: '#9ca3af', textDecoration: 'line-through' }}>{prix} DT</span>
                            <span style={{ color: '#6b7280' }}>→</span>
                            <span style={{ color: '#16a34a', fontWeight: 700 }}>{prixApresPromo?.toFixed(2)} DT</span>
                            <span style={{ color: '#9ca3af' }}>/ unité / mois</span>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button onClick={() => set(Math.max(0, value - 1))} disabled={value === 0}
                          style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid #e2e8f0', background: value === 0 ? '#f8fafc' : '#f1f5f9', color: value === 0 ? '#cbd5e1' : '#334155', fontSize: '1rem', cursor: value === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', minWidth: 24, textAlign: 'center' }}>{value}</span>
                        <button onClick={() => set(value + 1)}
                          style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid #4338ca', background: '#4338ca', color: '#fff', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      </div>
                      {value > 0 && prix != null && (
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#4338ca', minWidth: 60, textAlign: 'right' }}>+{(value * (prixApresPromo ?? prix)).toFixed(0)} DT</span>
                      )}
                    </div>
                  );})}

                  {/* Option Acheteurs — activation ou passage à un palier supérieur */}
                  {supplPricing && paliersDispo.length > 0 && (
                    <div style={{ padding: '12px 16px', background: '#faf5ff', borderRadius: 10, border: '1px solid #ddd6fe' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                            🤝 Option Acheteurs
                            {(supplPricing.nbAcheteurs ?? 0) > 0 && (
                              <span style={{ marginLeft: 8, fontSize: '0.68rem', fontWeight: 700, padding: '1px 8px', borderRadius: 8, background: '#ede9fe', color: '#6d28d9' }}>
                                palier actuel : jusqu'à {supplPricing.palierAcheteurs} acheteurs
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>
                            {(supplPricing.nbAcheteurs ?? 0) > 0
                              ? 'Passez à un palier supérieur — le nouveau palier remplace l\'actuel.'
                              : 'Activez le carnet d\'acheteurs B2B (ventes depuis votre labo, portail de commande).'}
                          </div>
                          {acheteursNeedsLabo && (
                            <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: 4, fontWeight: 600 }}>
                              ⚠️ Nécessite au moins un labo — ajoutez-en un à cette demande pour activer l'option.
                            </div>
                          )}
                        </div>
                        <select
                          value={acheteursCible}
                          onChange={(e) => setAcheteursCible(parseInt(e.target.value, 10) || 0)}
                          style={{ ...inp, width: 'auto', minWidth: 210, cursor: 'pointer' }}
                        >
                          <option value={0}>{(supplPricing.nbAcheteurs ?? 0) > 0 ? 'Palier inchangé' : 'Non merci'}</option>
                          {paliersDispo.map(({ palier, prix }) => (
                            <option key={palier} value={palier}>
                              Jusqu'à {palier} acheteurs — {prix.toFixed(0)} DT/mois
                            </option>
                          ))}
                        </select>
                        {acheteursCible > 0 && (
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#6d28d9', minWidth: 60, textAlign: 'right' }}>
                            +{acheteursDelta.toFixed(0)} DT
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {supplDelta > 0 && supplPricing && (
                    <div style={{ background: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', border: '1px solid #ddd6fe', borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.78rem', color: '#6d28d9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Nouveau total estimé</div>
                        <div style={{ fontSize: '0.78rem', color: '#7c3aed', marginTop: 2 }}>+{supplDelta.toFixed(0)} DT/mois de plus</div>
                        <div style={{ fontSize: '0.7rem', color: '#8b5cf6', marginTop: 3 }}>Base : mensualité actuelle (option Acheteurs incluse le cas échéant)</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {supplHasMensPromo && (
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#9ca3af', textDecoration: 'line-through' }}>{supplTotal?.toFixed(0)} DT</div>
                        )}
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#4c1d95' }}>{(supplTotalEff ?? supplTotal)?.toFixed(0)} DT<span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#7c3aed' }}>/mois</span></div>
                        {supplHasMensPromo && (
                          <div style={{ fontSize: '0.68rem', color: '#7c3aed', fontWeight: 600 }}>promotion appliquée</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Aide form */}
              {formType === 'aide' && (
                <div>
                  <label style={lbl}>Décrivez votre besoin *</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5}
                    placeholder="Décrivez votre besoin, le problème rencontré ou la fonctionnalité souhaitée…"
                    style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
              )}

              {error && <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem', color: '#dc2626', marginTop: 10 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button onClick={() => { resetForm(); setShowForm(false); }}
                  style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                  Annuler
                </button>
                <button onClick={handleSubmit} disabled={saving}
                  style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: saving ? '#e5e7eb' : 'linear-gradient(135deg,#1e3a5f,#1e40af)', color: saving ? '#9ca3af' : '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
                  {saving ? 'Envoi…' : 'Envoyer la demande'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter bar */}
      {!showForm && demandes.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FILTERS.map(({ key, label }) => {
              const count = key === 'all' ? demandes.length : demandes.filter(d => d.statut === key).length;
              const active = filterStatut === key;
              return (
                <button key={key} onClick={() => { setFilterStatut(key); setPage(1); }}
                  style={{ padding: '5px 13px', borderRadius: 20, border: `1.5px solid ${active ? '#1e40af' : '#e2e8f0'}`, background: active ? '#1e40af' : '#fff', color: active ? '#fff' : '#374151', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                  {label} {count > 0 && <span style={{ opacity: 0.75 }}>({count})</span>}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</span>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.8rem', color: '#374151', background: '#fff' }} />
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>→</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.8rem', color: '#374151', background: '#fff' }} />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
                style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Demandes list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: '0.88rem' }}>Chargement…</div>
      ) : demandes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: '#f8fafc', borderRadius: 16, border: '1px dashed #e2e8f0' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💬</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Aucune demande pour le moment</div>
          <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Cliquez sur "Nouvelle demande" pour nous contacter.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: '0.85rem' }}>Aucune demande dans cette catégorie.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {paginated.map((d) => {
            const s = STATUT[d.statut] || STATUT.en_attente;
            // Repli pour d'éventuelles anciennes demandes d'un type retiré (ex. ingrédient manquant)
            const t = TYPE_LABELS[d.type] || { label: 'Demande', icon: '📝', desc: '' };
            return (
              <div key={d.id} style={{ background: '#fff', border: `1px solid #e2e8f0`, borderLeft: `4px solid ${s.border}`, borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: '1.25rem' }}>{t.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>{t.label}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 1 }}>
                      {fmtDate(d.createdAt)}
                      {d.createdBy != null && d.createdBy !== d.clientId && d.createdByNom && (
                        <span style={{ marginLeft: 8, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 6, padding: '1px 7px', fontSize: '0.7rem', fontWeight: 700 }}>
                          par {d.createdByNom}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: s.bg, color: s.text }}>{s.label}</span>
                  {d.statut === 'en_attente' && (
                    <button onClick={() => deleteDemande(d.id)} disabled={deleting[d.id]}
                      style={{ marginLeft: 6, padding: '4px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: '0.72rem', fontWeight: 700, cursor: deleting[d.id] ? 'default' : 'pointer', opacity: deleting[d.id] ? 0.6 : 1 }}>
                      {deleting[d.id] ? '…' : '🗑 Supprimer'}
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#374151' }}>
                  {d.type === 'supplement' && (
                    <span>
                      {[
                        d.nbActivitesSupp && `+${d.nbActivitesSupp} activité${(d.nbActivitesSupp || 0) > 1 ? 's' : ''}`,
                        d.nbLabosSupp && `+${d.nbLabosSupp} labo${(d.nbLabosSupp || 0) > 1 ? 's' : ''}`,
                        d.nbGerantsSupp && `+${d.nbGerantsSupp} gérant${(d.nbGerantsSupp || 0) > 1 ? 's' : ''}`,
                        d.nbAcheteursCible && `Option Acheteurs → palier jusqu'à ${d.nbAcheteursCible}`,
                      ].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {d.type === 'aide' && d.description && (
                    <span style={{ color: '#64748b', fontStyle: 'italic' }}>{d.description.slice(0, 120)}{d.description.length > 120 ? '…' : ''}</span>
                  )}
                </div>
                {d.type === 'supplement' && d.docusealSubmissionId && (
                  <div style={{ marginTop: 10, background: '#f5f3ff', borderRadius: 8, padding: '10px 12px', borderLeft: '3px solid #4338ca' }}>
                    <div style={{ fontSize: '0.78rem', color: '#374151' }}>
                      📄 Contrat avenant envoyé à <strong>{d.clientEmail || 'votre adresse email'}</strong> · {d.statut === 'validée' ? 'signé ✓' : 'en attente de signature'}
                    </div>
                    {d.statut === 'validée' && (
                      <button
                        onClick={() => downloadContrat(d.id)}
                        style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, border: '1.5px solid #4338ca', background: '#fff', color: '#4338ca', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                        ⬇️ Contrat avenant{d.traiteLe ? ` — ${fmtDate(d.traiteLe)}` : ''}
                      </button>
                    )}
                  </div>
                )}
                {d.notesAdmin && (
                  <div style={{ marginTop: 10, background: '#f8fafc', borderRadius: 8, padding: '10px 12px', borderLeft: '3px solid #4338ca' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Réponse de l'administration</div>
                    <div style={{ fontSize: '0.82rem', color: '#374151' }}>{d.notesAdmin}</div>
                    {d.traiteLe && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>Le {fmtDate(d.traiteLe)}</div>}
                  </div>
                )}
              </div>
            );
          })}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 8 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                style={{ padding: '5px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: safePage === 1 ? '#f8fafc' : '#fff', color: safePage === 1 ? '#cbd5e1' : '#374151', fontSize: '0.82rem', fontWeight: 600, cursor: safePage === 1 ? 'default' : 'pointer' }}>
                ← Précédent
              </button>
              <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                Page {safePage} / {totalPages} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({filtered.length} demandes)</span>
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                style={{ padding: '5px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: safePage === totalPages ? '#f8fafc' : '#fff', color: safePage === totalPages ? '#cbd5e1' : '#374151', fontSize: '0.82rem', fontWeight: 600, cursor: safePage === totalPages ? 'default' : 'pointer' }}>
                Suivant →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#fff' };
