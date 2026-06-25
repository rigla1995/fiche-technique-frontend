import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { Abonnement, Promotion } from '../../types';

const MODE_INFO: Record<string, { label: string; color: string; bg: string; icon: string; desc: string }> = {
  actif:     { label: 'Actif',         color: '#16a34a', bg: '#dcfce7', icon: '✅', desc: 'Votre compte est pleinement opérationnel.' },
  read_only: { label: 'Lecture seule', color: '#d97706', bg: '#fef3c7', icon: '⚠️', desc: 'Paiement en attente — création et modification bloquées.' },
  desactive: { label: 'Suspendu',      color: '#dc2626', bg: '#fee2e2', icon: '🚫', desc: 'Compte suspendu. Contactez l\'administrateur.' },
  archive:   { label: 'Archivé',       color: '#6b7280', bg: '#f3f4f6', icon: '📦', desc: 'Compte archivé suite à non-paiement.' },
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const STATUT_COLORS: Record<string, string> = {
  payé:       '#16a34a',
  en_attente: '#d97706',
  impayé:     '#dc2626',
  remisé:     '#7c3aed',
  gratuit:    '#0891b2',
};

const STATUT_LABELS: Record<string, string> = {
  payé:       'Payé',
  en_attente: 'En attente',
  impayé:     'Impayé',
  remisé:     'Remisé',
  gratuit:    'Gratuit',
};

const promoTypeLabel = (p: Promotion): string => {
  if (p.type === 'free_months') return 'Gratuit';
  if (p.type === 'percent_off') {
    const taux = p.discountMensualite ?? p.discountOnboarding ?? p.discountSupplement;
    return taux != null ? `Réduction ${taux}%` : 'Réduction';
  }
  const fixed = p.fixedMensualite ?? p.fixedOnboarding ?? p.fixedSupplement;
  return fixed != null ? `Prix fixe ${fixed} DT` : 'Prix fixe';
};

interface ConfigBreakdown {
  activite: { nb: number; total: number };
  labo:     { nb: number; total: number };
  gerant:   { nb: number; total: number };
  prixActiviteSup: number;
  prixLaboSup: number;
  prixGerantSup: number;
}

export default function MonAbonnementPage() {
  const [abo, setAbo] = useState<Abonnement | null>(null);
  const [loading, setLoading] = useState(true);
  const [moduleVenteActif, setModuleVenteActif] = useState(false);
  const [hasPendingVente, setHasPendingVente] = useState(false);
  const [requestingVente, setRequestingVente] = useState(false);
  const [requestedVente, setRequestedVente] = useState(false);
  const [requestErrorVente, setRequestErrorVente] = useState('');
  const [contratInfo, setContratInfo] = useState<{ available: boolean; date: string | null } | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const aboRes = await api.get('/api/abonnements/mon-abonnement');
      setAbo(aboRes.data);
    } finally {
      setLoading(false);
    }
    // supplementary calls — failures must not block the main page
    try {
      const [entRes, demRes] = await Promise.all([
        api.get('/api/entreprise'),
        api.get('/api/abonnements/demandes'),
      ]);
      setModuleVenteActif(!!entRes.data?.module_vente_actif);
      const pending = (demRes.data as { typeDemande: string; statut: string }[])
        .some(d => d.typeDemande === 'activer_module_vente' && d.statut === 'en_attente');
      setHasPendingVente(pending);
    } catch { /* module vente section simply won't show */ }
    try {
      const { data } = await api.get('/api/abonnements/contrat-actif?info=1');
      setContratInfo(data);
    } catch { /* bouton contrat simplement masqué */ }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchAll(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchAll]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Chargement…</div>;
  if (!abo) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Abonnement introuvable</div>;

  const handleRequestVente = async () => {
    setRequestingVente(true); setRequestErrorVente('');
    try {
      await api.post('/api/abonnements/demandes', { typeDemande: 'activer_module_vente' });
      setRequestedVente(true); setHasPendingVente(true);
    } catch (e: unknown) {
      setRequestErrorVente((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur');
    } finally {
      setRequestingVente(false);
    }
  };

  const downloadContrat = async () => {
    try {
      const res = await api.get('/api/abonnements/contrat-actif', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contrat-labflow.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch { /* contrat indisponible */ }
  };

  const mode = MODE_INFO[abo.modeCompte] || MODE_INFO.actif;
  const pricing = abo.pricing;
  const config = abo.config;
  const breakdown = pricing?.configBreakdown as ConfigBreakdown | undefined;
  const effectifMensuel = pricing?.effectifMensuel ?? pricing?.baseMensuel;
  const activeSupplActivitePromo = abo.promotions?.find((p) => p.appliesTo === 'supplement_activite' && p.isActive) ?? null;
  const activeSupplLaboPromo     = abo.promotions?.find((p) => p.appliesTo === 'supplement_labo'     && p.isActive) ?? null;
  const activeSupplGerantPromo   = abo.promotions?.find((p) => p.appliesTo === 'supplement_gerant'   && p.isActive) ?? null;

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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>💳</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Mon Abonnement</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Compte Entreprise — depuis {fmtDate(abo.dateDebut)}
          </p>
        </div>
        <div style={{ background: mode.bg, borderRadius: 12, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.3rem' }}>{mode.icon}</span>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{mode.label}</div>
            <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{mode.desc}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 24 }}>
        {/* Config card */}
        {config && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', padding: '16px 20px', borderBottom: '1px solid #ddd6fe' }}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#4c1d95', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>⚙️</span> Votre configuration
              </div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {[
                { label: 'Activité', nb: config.nbActivites ?? 0, icon: '📍' },
                { label: 'Labo',     nb: config.nbLabos ?? 0,     icon: '🏭' },
                { label: 'Gérant',   nb: config.nbGerants ?? 0,   icon: '👤' },
              ].map(({ label, nb, icon }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#374151' }}>{label}</span>
                  </div>
                  {nb > 0
                    ? <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#4c1d95' }}>{nb}</span>
                    : <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>Non inclus</span>
                  }
                </div>
              ))}
              {abo.prolongationJours > 0 && (
                <div style={{ marginTop: 10, background: '#ede9fe', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', color: '#6d28d9', fontWeight: 600 }}>
                  ✚ Prolongation accordée : {abo.prolongationJours} jour(s)
                </div>
              )}
              {contratInfo?.available && (
                <button
                  onClick={downloadContrat}
                  style={{ marginTop: 12, width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #4338ca', background: '#fff', color: '#4338ca', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
                  📄 Contrat actif{contratInfo.date ? ` — ${new Date(contratInfo.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tarification card */}
        {pricing && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', padding: '16px 20px', borderBottom: '1px solid #bfdbfe' }}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e40af', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>💰</span> Votre tarification
              </div>
            </div>
            <div style={{ padding: '20px' }}>

              {/* ── Tarification mensuelle ── */}
              <div style={{ marginBottom: pricing.baseOnboarding != null ? 18 : 0 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                  Tarification mensuelle
                </div>

                {breakdown ? (
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px' }}>
                    {[
                      { icon: '📍', label: `Activité${breakdown.activite.nb > 1 ? 's' : ''}`, nb: breakdown.activite.nb, total: breakdown.activite.total, unit: null },
                      { icon: '🏭', label: `Labo${breakdown.labo.nb > 1 ? 's' : ''}`,          nb: breakdown.labo.nb,     total: breakdown.labo.total,     unit: breakdown.prixLaboSup },
                      { icon: '👤', label: `Gérant${breakdown.gerant.nb > 1 ? 's' : ''}`,      nb: breakdown.gerant.nb,   total: breakdown.gerant.total,   unit: breakdown.prixGerantSup },
                    ].map(({ icon, label, nb, total, unit }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ color: nb > 0 ? '#374151' : '#9ca3af' }}>
                          {icon} {nb > 0 ? `${nb} ${label}${unit != null ? ` × ${unit} DT` : ''}` : label}
                        </span>
                        {nb > 0
                          ? <span style={{ fontWeight: 700, color: '#111827' }}>{total.toFixed(2)} DT</span>
                          : <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Non inclus</span>
                        }
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e40af' }}>Total mensuel</span>
                      <div style={{ textAlign: 'right' }}>
                        {pricing.activePromoMensuel && pricing.baseMensuel !== effectifMensuel && (
                          <div style={{ fontSize: '0.78rem', color: '#9ca3af', textDecoration: 'line-through' }}>
                            {(pricing.baseMensuel ?? 0).toFixed(2)} DT/mois
                          </div>
                        )}
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: pricing.activePromoMensuel ? '#7c3aed' : '#1e40af', lineHeight: 1.2 }}>
                          {effectifMensuel != null ? `${effectifMensuel} DT` : '—'}
                          <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6b7280', marginLeft: 3 }}>/mois</span>
                        </div>
                      </div>
                    </div>
                    {pricing.activePromoMensuel && (
                      <div style={{ marginTop: 8, background: '#f5f3ff', borderRadius: 6, padding: '4px 10px', display: 'inline-block', fontSize: '0.75rem', color: '#7c3aed', fontWeight: 700 }}>
                        🎉 Promotion appliquée — {promoTypeLabel(pricing.activePromoMensuel)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', borderRadius: 8 }}>
                    <span style={{ fontSize: '0.84rem', color: '#374151' }}>Mensuel</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#1e40af' }}>
                      {effectifMensuel != null ? `${effectifMensuel} DT` : '—'}
                      <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6b7280', marginLeft: 3 }}>/mois</span>
                    </span>
                  </div>
                )}
              </div>

              {/* ── Tarification onboarding ── */}
              {pricing.baseOnboarding != null && (() => {
                const onbStatut = abo.statutOnboarding || 'en_attente';
                const onbColor = STATUT_COLORS[onbStatut] || '#6b7280';
                const onbLabel = STATUT_LABELS[onbStatut] || onbStatut;
                const onbMontant = pricing.effectifOnboarding != null ? pricing.effectifOnboarding : pricing.baseOnboarding;
                return (
                  <div>
                    <div style={{ height: 1, background: '#e5e7eb', marginBottom: 18 }} />
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                      Tarification onboarding
                    </div>
                    <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #bbf7d0' }}>
                      <div>
                        <div style={{ fontSize: '0.84rem', color: '#374151', fontWeight: 600 }}>Frais d'intégration</div>
                        <div style={{ marginTop: 5 }}>
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                            background: onbColor + '20', color: onbColor,
                          }}>{onbLabel}</span>
                        </div>
                        {pricing.activePromoOnboarding && (
                          <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#7c3aed', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>🎉</span>
                            <span>Promo : {promoTypeLabel(pricing.activePromoOnboarding)}</span>
                            {pricing.baseOnboarding != null && pricing.effectifOnboarding != null && pricing.baseOnboarding !== pricing.effectifOnboarding && (
                              <span style={{ color: '#9ca3af', textDecoration: 'line-through', fontWeight: 400, marginLeft: 4 }}>{pricing.baseOnboarding} DT</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#16a34a', textAlign: 'right' }}>
                        {onbMontant} DT
                        <div style={{ fontSize: '0.72rem', fontWeight: 400, color: '#6b7280' }}>unique</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Supplement promo banners (activité / labo / gérant) */}
      {([
        { promo: activeSupplActivitePromo, title: 'Supplément Activité',  noun: 'activité' },
        { promo: activeSupplLaboPromo,     title: 'Supplément Labo',       noun: 'labo' },
        { promo: activeSupplGerantPromo,   title: 'Supplément Gérant',     noun: 'gérant' },
      ] as { promo: typeof activeSupplActivitePromo; title: string; noun: string }[]).filter(x => x.promo).map(({ promo, title, noun }) => (
        <div key={noun} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 8px rgba(217,119,6,0.1)' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>🏷️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#92400e' }}>Promotion — {title}</div>
            <div style={{ fontSize: '0.78rem', color: '#b45309', marginTop: 2 }}>
              {promo!.type === 'free_months'
                ? `Supplément ${noun} gratuit`
                : promo!.type === 'percent_off' && promo!.discountSupplement != null
                ? `${promo!.discountSupplement}% de réduction sur le supplément ${noun}`
                : promo!.fixedSupplement != null
                ? `Prix fixe ${promo!.fixedSupplement} DT sur le supplément ${noun}`
                : 'Promotion active'}
              {promo!.dateFin ? ` · Jusqu'au ${fmtDate(promo!.dateFin)}` : ' · Permanente'}
            </div>
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>Active</span>
        </div>
      ))}

      {/* Module Vente */}
      <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1.5px solid #fcd34d', overflow: 'hidden', marginBottom: 16, boxShadow: '0 2px 8px rgba(180,83,9,0.08)' }}>
        <div style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', padding: '14px 20px', borderBottom: '1px solid #fcd34d', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#78350f', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🛒</span> Module Vente
          </div>
          <span style={{
            fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: moduleVenteActif ? '#dcfce7' : '#fee2e2',
            color: moduleVenteActif ? '#166534' : '#991b1b',
          }}>
            {moduleVenteActif ? '✅ Actif' : '🔒 Inactif'}
          </span>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
            Gérez votre catalogue vendable, vos prestataires de livraison et suivez vos ventes avec le rapport de rentabilité.
          </p>
          {moduleVenteActif ? (
            <div style={{ background: '#dcfce7', borderRadius: 10, padding: '10px 16px', color: '#166534', fontWeight: 600, fontSize: '0.88rem' }}>
              ✅ Module activé — accédez à l'espace Vente depuis le menu
            </div>
          ) : (hasPendingVente || requestedVente) ? (
            <div style={{ background: '#fef9c3', borderRadius: 10, padding: '10px 16px', color: '#854d0e', fontWeight: 600, fontSize: '0.88rem' }}>
              ⏳ Demande en attente de validation par l'administrateur
            </div>
          ) : (
            <>
              <button
                onClick={handleRequestVente}
                disabled={requestingVente}
                style={{
                  background: 'linear-gradient(135deg, #78350f 0%, #b45309 100%)',
                  color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px',
                  cursor: requestingVente ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.9rem',
                  opacity: requestingVente ? 0.7 : 1,
                  boxShadow: '0 4px 14px rgba(180,83,9,0.3)',
                }}>
                {requestingVente ? 'Envoi…' : '🚀 Demander l\'activation'}
              </button>
              {requestErrorVente && <div style={{ color: '#dc2626', fontSize: '0.82rem', marginTop: 8 }}>{requestErrorVente}</div>}
            </>
          )}
        </div>
      </div>

    </div>
  );
}
