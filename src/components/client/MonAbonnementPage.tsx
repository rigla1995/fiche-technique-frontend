import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { Abonnement, Demande } from '../../types';
import { useAuth } from '../../context/AuthContext';

const MODE_INFO: Record<string, { label: string; color: string; desc: string }> = {
  actif:     { label: 'Actif',         color: '#16a34a', desc: 'Votre compte est pleinement opérationnel.' },
  read_only: { label: 'Lecture seule', color: '#d97706', desc: 'Paiement en attente — création et modification bloquées.' },
  desactive: { label: 'Suspendu',      color: '#dc2626', desc: 'Compte suspendu. Contactez l\'administrateur.' },
  archive:   { label: 'Archivé',       color: '#6b7280', desc: 'Compte archivé suite à non-paiement.' },
};

const STATUT_COLORS: Record<string, string> = {
  payé:       '#16a34a',
  impayé:     '#dc2626',
  en_attente: '#d97706',
  remisé:     '#7c3aed',
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const fmtMois = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—';

export default function MonAbonnementPage() {
  const { user } = useAuth();
  const isIndep = user?.compteType === 'independant';
  const [abo, setAbo] = useState<Abonnement | null>(null);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDemandeForm, setShowDemandeForm] = useState(false);
  const [demandeType, setDemandeType] = useState<'gerant_sup' | 'labo_sup' | 'upgrade_entreprise'>('gerant_sup');
  const [showUpgradeForm, setShowUpgradeForm] = useState(false);
  const [upgradeNotes, setUpgradeNotes] = useState('');
  const [submittingUpgrade, setSubmittingUpgrade] = useState(false);
  const [demandeNotes, setDemandeNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [aboRes, demandesRes] = await Promise.all([
        api.get('/api/abonnements/mon-abonnement'),
        api.get('/api/abonnements/demandes'),
      ]);
      setAbo(aboRes.data);
      setDemandes(demandesRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh on tab focus when there's a pending upgrade demande
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchAll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchAll]);

  const submitDemande = async () => {
    setSubmitting(true);
    try {
      await api.post('/api/abonnements/demandes', { typeDemande: demandeType, notes: demandeNotes || undefined });
      const res = await api.get('/api/abonnements/demandes');
      setDemandes(res.data);
      setShowDemandeForm(false);
      setDemandeNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  const submitUpgrade = async () => {
    setSubmittingUpgrade(true);
    try {
      await api.post('/api/abonnements/demandes', { typeDemande: 'upgrade_entreprise', notes: upgradeNotes || undefined });
      const res = await api.get('/api/abonnements/demandes');
      setDemandes(res.data);
      setShowUpgradeForm(false);
      setUpgradeNotes('');
    } finally {
      setSubmittingUpgrade(false);
    }
  };

  const upgradeDemandeExistante = demandes.find((d) => d.typeDemande === 'upgrade_entreprise');

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Chargement...</div>;
  if (!abo) return <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Abonnement introuvable</div>;

  const mode = MODE_INFO[abo.modeCompte] || MODE_INFO.actif;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 24 }}>Mon abonnement</h1>

      {/* Upgrade banner (indép only) */}
      {isIndep && (
        <div style={{
          background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
          border: '1px solid #93c5fd',
          borderRadius: 14, padding: 20, marginBottom: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1e40af' }}>Passer en compte Entreprise</div>
              <div style={{ fontSize: 13, color: '#3b82f6', marginTop: 4 }}>
                Gérez plusieurs activités, labos et gérants sous un seul compte.
              </div>
            </div>
            {upgradeDemandeExistante ? (
              <span style={{
                fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 10,
                background: upgradeDemandeExistante.statut === 'validée' ? '#dcfce7' : upgradeDemandeExistante.statut === 'refusée' ? '#fee2e2' : '#fef9c3',
                color: upgradeDemandeExistante.statut === 'validée' ? '#166534' : upgradeDemandeExistante.statut === 'refusée' ? '#991b1b' : '#854d0e',
              }}>
                Demande {upgradeDemandeExistante.statut}
              </span>
            ) : (
              <button onClick={() => setShowUpgradeForm(!showUpgradeForm)}
                style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Demander l'upgrade
              </button>
            )}
          </div>
          {showUpgradeForm && (
            <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Message (optionnel)</label>
                <input value={upgradeNotes} onChange={(e) => setUpgradeNotes(e.target.value)}
                  placeholder="Décrivez votre activité, vos besoins..."
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #93c5fd', fontSize: 13 }} />
              </div>
              <button onClick={submitUpgrade} disabled={submittingUpgrade}
                style={{ padding: '7px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                {submittingUpgrade ? '...' : 'Envoyer'}
              </button>
              <button onClick={() => setShowUpgradeForm(false)}
                style={{ padding: '7px 12px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                Annuler
              </button>
            </div>
          )}
        </div>
      )}

      {/* Status card */}
      <div style={{
        background: `linear-gradient(135deg, ${mode.color}15, ${mode.color}05)`,
        border: `1px solid ${mode.color}40`,
        borderRadius: 14, padding: 24, marginBottom: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
            {abo.compteType === 'entreprise' ? 'Compte Entreprise' : 'Compte Indépendant'} — depuis {fmtDate(abo.dateDebut)}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: mode.color }}>{mode.label}</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{mode.desc}</div>
          {abo.prolongationJours > 0 && (
            <div style={{ fontSize: 12, color: '#7c3aed', marginTop: 6 }}>
              ✚ Prolongation accordée : {abo.prolongationJours} jour(s)
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Onboarding</div>
          <span style={{
            fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 12,
            background: abo.statutOnboarding === 'payé' ? '#dcfce7' : abo.statutOnboarding === 'offert' ? '#ede9fe' : '#fee2e2',
            color: abo.statutOnboarding === 'payé' ? '#166534' : abo.statutOnboarding === 'offert' ? '#6d28d9' : '#991b1b',
          }}>
            {abo.statutOnboarding} {abo.montantOnboarding ? `(${abo.montantOnboarding} DT)` : ''}
          </span>
        </div>
      </div>

      {/* Pricing card */}
      {abo.pricing && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#111827' }}>Tarification</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 16px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Mensualité</div>
              {abo.pricing.activePromo ? (
                <>
                  <div style={{ fontSize: 13, color: '#9ca3af', textDecoration: 'line-through' }}>
                    {abo.pricing.baseMensuel != null ? `${abo.pricing.baseMensuel} DT/mois` : '—'}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>
                    {abo.pricing.effectifMensuel != null ? `${abo.pricing.effectifMensuel} DT/mois` : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>Promotion appliquée</div>
                </>
              ) : (
                <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
                  {abo.pricing.baseMensuel != null ? `${abo.pricing.baseMensuel} DT/mois` : '—'}
                </div>
              )}
            </div>
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 16px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Onboarding</div>
              {abo.pricing.activePromo ? (
                <>
                  <div style={{ fontSize: 13, color: '#9ca3af', textDecoration: 'line-through' }}>
                    {abo.pricing.baseOnboarding != null ? `${abo.pricing.baseOnboarding} DT` : '—'}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>
                    {abo.pricing.effectifOnboarding != null ? `${abo.pricing.effectifOnboarding} DT` : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 2 }}>Promotion appliquée</div>
                </>
              ) : (
                <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
                  {abo.pricing.baseOnboarding != null ? `${abo.pricing.baseOnboarding} DT` : '—'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Paiements */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Historique des paiements</h3>
        </div>
        {!abo.paiements?.length ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Aucun paiement enregistré</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Mois', 'Montant', 'Statut', 'Date'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#374151', fontSize: 13 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {abo.paiements.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 16px', color: '#111827' }}>{fmtMois(p.mois)}</td>
                  <td style={{ padding: '10px 16px', color: '#374151' }}>{p.montantDt ? `${p.montantDt} DT` : '—'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 10,
                      background: (STATUT_COLORS[p.statut] || '#6b7280') + '20',
                      color: STATUT_COLORS[p.statut] || '#6b7280',
                    }}>{p.statut}</span>
                  </td>
                  <td style={{ padding: '10px 16px', color: '#6b7280' }}>{p.dateSaisie ? fmtDate(p.dateSaisie) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Demandes */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>Mes demandes</h3>
          <button
            onClick={() => setShowDemandeForm(!showDemandeForm)}
            style={{ padding: '6px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Nouvelle demande
          </button>
        </div>

        {showDemandeForm && (
          <div style={{ padding: 20, borderBottom: '1px solid #e5e7eb', background: '#f0f9ff' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Type de demande</label>
                <select value={demandeType} onChange={(e) => setDemandeType(e.target.value as typeof demandeType)}
                  style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
                  <option value="gerant_sup">Gérant supplémentaire (80 DT/mois)</option>
                  {!isIndep && <option value="labo_sup">Labo supplémentaire (150 DT/mois)</option>}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Message (optionnel)</label>
                <input value={demandeNotes} onChange={(e) => setDemandeNotes(e.target.value)}
                  placeholder="Précisions..."
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
              </div>
              <button onClick={submitDemande} disabled={submitting}
                style={{ padding: '7px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                {submitting ? '...' : 'Envoyer'}
              </button>
              <button onClick={() => setShowDemandeForm(false)}
                style={{ padding: '7px 12px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                Annuler
              </button>
            </div>
          </div>
        )}

        {demandes.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Aucune demande</div>
        ) : (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {demandes.map((d) => (
              <div key={d.id} style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 16px', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>
                    {d.typeDemande === 'gerant_sup' ? 'Gérant supplémentaire' : d.typeDemande === 'labo_sup' ? 'Labo supplémentaire' : 'Passage compte Entreprise'}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {d.montantMensuelDt ? `${d.montantMensuelDt} DT/mois` : ''} — {fmtDate(d.createdAt)}
                  </div>
                  {d.notesAdmin && <div style={{ fontSize: 12, color: '#7c3aed', marginTop: 4 }}>Réponse admin : {d.notesAdmin}</div>}
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 10, alignSelf: 'flex-start',
                  background: d.statut === 'validée' ? '#dcfce7' : d.statut === 'refusée' ? '#fee2e2' : '#fef9c3',
                  color: d.statut === 'validée' ? '#166534' : d.statut === 'refusée' ? '#991b1b' : '#854d0e',
                }}>{d.statut}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
