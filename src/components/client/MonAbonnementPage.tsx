import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { Abonnement } from '../../types';
import { useAuth } from '../../context/AuthContext';

const MODE_INFO: Record<string, { label: string; color: string; bg: string; icon: string; desc: string }> = {
  actif:     { label: 'Actif',         color: '#16a34a', bg: '#dcfce7', icon: '✅', desc: 'Votre compte est pleinement opérationnel.' },
  read_only: { label: 'Lecture seule', color: '#d97706', bg: '#fef3c7', icon: '⚠️', desc: 'Paiement en attente — création et modification bloquées.' },
  desactive: { label: 'Suspendu',      color: '#dc2626', bg: '#fee2e2', icon: '🚫', desc: 'Compte suspendu. Contactez l\'administrateur.' },
  archive:   { label: 'Archivé',       color: '#6b7280', bg: '#f3f4f6', icon: '📦', desc: 'Compte archivé suite à non-paiement.' },
};

const STATUT_COLORS: Record<string, string> = {
  payé: '#16a34a', impayé: '#dc2626', en_attente: '#d97706', remisé: '#7c3aed', gratuit: '#16a34a',
};
const STATUT_LABELS: Record<string, string> = {
  payé: 'Payé', impayé: 'Impayé', en_attente: 'En attente', remisé: 'Remisé', gratuit: 'Gratuit',
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const fmtMois = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—';

interface ConfigBreakdown {
  activite: { nb: number; total: number };
  labo:     { nb: number; total: number };
  gerant:   { nb: number; total: number };
  prixActiviteSup: number;
  prixLaboSup: number;
  prixGerantSup: number;
}

export default function MonAbonnementPage() {
  const { user } = useAuth();
  const isIndep = user?.compteType === 'independant';
  const [abo, setAbo] = useState<Abonnement | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const aboRes = await api.get('/api/abonnements/mon-abonnement');
      setAbo(aboRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchAll(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchAll]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Chargement…</div>;
  if (!abo) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Abonnement introuvable</div>;

  const mode = MODE_INFO[abo.modeCompte] || MODE_INFO.actif;
  const pricing = abo.pricing;
  const config = abo.config;
  const breakdown = pricing?.configBreakdown as ConfigBreakdown | undefined;
  const effectifMensuel = pricing?.effectifMensuel ?? pricing?.baseMensuel;
  const activeSupplActivitePromo = abo.promotions?.find((p) => p.appliesTo === 'supplement_activite' && p.isActive) ?? null;

  return (
    <div className="page">
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #6366f1 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>💳</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Mon Abonnement</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {isIndep ? 'Compte Indépendant' : 'Compte Entreprise'} — depuis {fmtDate(abo.dateDebut)}
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
                { label: 'Activités', nb: config.nbActivites ?? 0, cost: breakdown?.activite.total, icon: '📍' },
                { label: 'Labos',     nb: config.nbLabos ?? 0,     cost: breakdown?.labo.total,     icon: '🏭' },
                { label: 'Gérants',   nb: config.nbGerants ?? 0,   cost: breakdown?.gerant.total,   icon: '👤' },
              ].map(({ label, nb, cost, icon }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: nb > 0 ? '#111827' : '#9ca3af' }}>
                        {nb} {label}
                      </div>
                    </div>
                  </div>
                  {nb > 0 && cost != null && cost > 0 && (
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#4c1d95' }}>{cost.toFixed(2)} DT</span>
                  )}
                  {nb === 0 && <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Non inclus</span>}
                </div>
              ))}
              {abo.prolongationJours > 0 && (
                <div style={{ marginTop: 10, background: '#ede9fe', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', color: '#6d28d9', fontWeight: 600 }}>
                  ✚ Prolongation accordée : {abo.prolongationJours} jour(s)
                </div>
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
                        🎉 Promotion appliquée
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

      {/* Supplément activité promo banner */}
      {activeSupplActivitePromo && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 8px rgba(217,119,6,0.1)' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>🏷️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#92400e' }}>Promotion — Supplément Activité</div>
            <div style={{ fontSize: '0.78rem', color: '#b45309', marginTop: 2 }}>
              {activeSupplActivitePromo.type === 'free_months'
                ? 'Supplément activité gratuit'
                : activeSupplActivitePromo.type === 'percent_off' && activeSupplActivitePromo.discountSupplement != null
                ? `${activeSupplActivitePromo.discountSupplement}% de réduction sur le supplément activité`
                : activeSupplActivitePromo.fixedSupplement != null
                ? `Prix fixe ${activeSupplActivitePromo.fixedSupplement} DT sur le supplément activité`
                : 'Promotion active'}
              {activeSupplActivitePromo.dateFin
                ? ` · Jusqu'au ${fmtDate(activeSupplActivitePromo.dateFin)}`
                : ' · Permanente'}
            </div>
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>Active</span>
        </div>
      )}

      {/* Paiements */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ background: 'linear-gradient(135deg, #f9fafb, #f3f4f6)', padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.1rem' }}>🧾</span>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#111827' }}>Historique des paiements</h3>
        </div>
        {!abo.paiements?.length ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: '0.9rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
            Aucun paiement enregistré
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Mois', 'Montant', 'Statut', 'Date'].map((h) => (
                    <th key={h} style={{ padding: '10px 20px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 700, color: '#374151', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {abo.paiements.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '12px 20px', color: '#111827', fontWeight: 600 }}>{fmtMois(p.mois)}</td>
                    <td style={{ padding: '12px 20px', color: '#374151', fontWeight: 700 }}>
                      {p.statut === 'gratuit' ? (
                        <span style={{ color: '#16a34a', fontWeight: 700 }}>Gratuit</span>
                      ) : p.montantDt != null ? `${p.montantDt} DT` : '—'}
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                        background: (STATUT_COLORS[p.statut] || '#6b7280') + '20',
                        color: STATUT_COLORS[p.statut] || '#6b7280',
                      }}>{STATUT_LABELS[p.statut] || p.statut}</span>
                    </td>
                    <td style={{ padding: '12px 20px', color: '#6b7280' }}>{p.dateSaisie ? fmtDate(p.dateSaisie) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
