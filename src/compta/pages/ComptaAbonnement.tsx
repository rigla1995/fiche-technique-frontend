import { useEffect, useState } from 'react';
import api from '../../api/client';
import BoutonAide from '../BoutonAide';

// « Abonnement et factures » (LabFlow Compta, étape S2b) : l'abonnement du cabinet — état du compte, mensualité poste
// par poste, promotion en cours, frais de mise en route — et ses mensualités, chacune avec sa facture une fois réglée.
interface Abonnement {
  modeCompte: string;
  dateDebut: string;
  postes: { code: string; libelle: string; montant: number }[];
  totalMensuel: number;
  effectifMensuel: number;
  promotion: { type: string; pourcentage: number | null; prixFixe: number | null; dateDebut: string; dateFin: string | null } | null;
  miseEnRoute: { montant: number; montantInitial?: number; statut: string };
  paiements: { id: number; mois: string; montant: number; statut: string; datePaiement: string | null; facture: boolean }[];
}

const fmt = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} DT`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const fmtMois = (d: string) => new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const MODES: Record<string, { label: string; aide: string; fond: string; couleur: string }> = {
  actif: { label: 'Actif', aide: 'Compte pleinement opérationnel', fond: '#ecfdf5', couleur: '#047857' },
  read_only: { label: 'Lecture seule', aide: 'Paiement en attente — consultation seulement', fond: '#fffbeb', couleur: '#b45309' },
  desactive: { label: 'Suspendu', aide: 'Contactez l\'équipe LabFlow', fond: '#fef2f2', couleur: '#b91c1c' },
  bloque: { label: 'Bloqué', aide: 'Contactez l\'équipe LabFlow', fond: '#fef2f2', couleur: '#b91c1c' },
  archive: { label: 'Archivé', aide: 'Compte archivé', fond: '#f1f5f9', couleur: '#475569' },
};
const STATUTS: Record<string, { label: string; fond: string; couleur: string }> = {
  'payé': { label: 'Réglée', fond: '#ecfdf5', couleur: '#047857' },
  impayé: { label: 'Impayée', fond: '#fef2f2', couleur: '#b91c1c' },
  en_attente: { label: 'En attente', fond: '#fffbeb', couleur: '#b45309' },
  gratuit: { label: 'Offerte', fond: '#eef2ff', couleur: '#4338ca' },
  'remisé': { label: 'Remisée', fond: '#f1f5f9', couleur: '#475569' },
};
const MER: Record<string, string> = { 'payé': 'payés', impayé: 'impayés', gratuit: 'offerts', en_attente: 'en attente' };

export default function ComptaAbonnement() {
  const [abo, setAbo] = useState<Abonnement | null>(null);
  const [erreur, setErreur] = useState(false);
  const [telechargement, setTelechargement] = useState<number | null>(null);
  const [erreurFacture, setErreurFacture] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/compta/abonnement').then(({ data }) => setAbo(data as Abonnement)).catch(() => setErreur(true));
  }, []);

  const telecharger = async (id: number) => {
    setTelechargement(id);
    setErreurFacture(null);
    try {
      const res = await api.get(`/api/compta/abonnement/paiements/${id}/facture`, { responseType: 'blob' });
      const cd = res.headers['content-disposition'] || '';
      const m = cd.match(/filename="?([^"]+)"?/);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const lien = document.createElement('a');
      lien.href = url;
      lien.setAttribute('download', m ? m[1] : `facture-${id}.pdf`);
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setErreurFacture('Facture indisponible pour cette mensualité. Réessayez plus tard.');
    } finally {
      setTelechargement(null);
    }
  };

  const mode = MODES[abo?.modeCompte || 'actif'] || MODES.actif;
  const promo = abo?.promotion;

  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #164e63 0%, #0e7490 55%, #06b6d4 100%)', borderRadius: 18, padding: '24px 28px',
        marginBottom: 24, boxShadow: '0 8px 32px rgba(14,116,144,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>💳</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Abonnement et factures</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            LabFlow Compta{abo ? ` — depuis le ${fmtDate(abo.dateDebut)}` : ''}
          </p>
        </div>
        {abo && (
          <div style={{ background: mode.fond, borderRadius: 12, padding: '10px 18px' }}>
            <div style={{ fontSize: '0.78rem', color: mode.couleur, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{mode.label}</div>
            <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{mode.aide}</div>
          </div>
        )}
        <BoutonAide section="compta-abonnement" />
      </div>

      {erreur && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600 }}>Impossible de charger votre abonnement. Réessayez plus tard.</div>}
      {!erreur && !abo && <div className="loading-text">Chargement…</div>}

      {abo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, alignItems: 'start' }}>
          <div style={carte}>
            <div style={enteteCarte}>
              <div style={{ fontWeight: 800, color: '#164e63' }}>💰 Votre abonnement</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>Mensualité poste par poste</div>
            </div>
            <div style={{ padding: '14px 18px' }}>
              {abo.postes.map((p) => (
                <div key={p.code} style={ligne}><span style={{ color: '#475569' }}>{p.libelle}</span><span style={{ fontWeight: 700 }}>{fmt(p.montant)}</span></div>
              ))}
              <div style={{ ...ligne, borderTop: '1px solid #e2e8f0', marginTop: 6, paddingTop: 10, fontWeight: 900, color: '#164e63' }}>
                <span>Total mensuel</span>
                <span>{promo && abo.effectifMensuel !== abo.totalMensuel
                  ? <><s style={{ color: '#94a3b8', fontWeight: 600, marginRight: 8 }}>{fmt(abo.totalMensuel)}</s>{fmt(abo.effectifMensuel)}</>
                  : fmt(abo.totalMensuel)}</span>
              </div>
              {promo && (
                <div style={{ marginTop: 10, background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px', fontSize: '0.8rem', color: '#854d0e' }}>
                  🎉 Promotion appliquée{promo.pourcentage != null ? ` (−${promo.pourcentage} %)` : promo.prixFixe != null ? ` (prix fixe ${fmt(promo.prixFixe)})` : promo.type === 'free_months' ? ' (mois offert)' : ''} :
                  {promo.dateFin ? ` du ${fmtDate(promo.dateDebut)} au ${fmtDate(promo.dateFin)}, tarif normal à partir du lendemain.` : ' promotion permanente.'}
                </div>
              )}
              <div style={{ ...ligne, marginTop: 12 }}>
                <span style={{ color: '#475569' }}>Frais de mise en route (une fois)</span>
                <span style={{ fontWeight: 700 }}>
                  {abo.miseEnRoute.montantInitial != null && <s style={{ color: '#94a3b8', fontWeight: 600, marginRight: 6 }}>{fmt(abo.miseEnRoute.montantInitial)}</s>}
                  {fmt(abo.miseEnRoute.montant)} · {MER[abo.miseEnRoute.statut] || abo.miseEnRoute.statut}
                </span>
              </div>
            </div>
          </div>

          <div style={carte}>
            <div style={enteteCarte}>
              <div style={{ fontWeight: 800, color: '#164e63' }}>🧾 Vos mensualités</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>Une facture par mensualité réglée</div>
            </div>
            <div style={{ padding: '6px 18px 14px' }}>
              {abo.paiements.length === 0 && <p style={{ color: '#64748b', fontSize: '0.86rem' }}>Aucune mensualité pour l'instant.</p>}
              {abo.paiements.map((p) => {
                const s = STATUTS[p.statut] || { label: p.statut, fond: '#f1f5f9', couleur: '#475569' };
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>{fmtMois(p.mois)}</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{fmt(p.montant)}{p.datePaiement ? ` · réglée le ${fmtDate(p.datePaiement)}` : ''}</div>
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: s.fond, color: s.couleur }}>{s.label}</span>
                    {p.facture && (
                      <button type="button" disabled={telechargement === p.id} onClick={() => telecharger(p.id)}
                        style={{ fontSize: '0.78rem', fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: '1px solid #a5f3fc', background: '#ecfeff', color: '#0e7490', cursor: 'pointer', opacity: telechargement === p.id ? 0.6 : 1 }}>
                        {telechargement === p.id ? '…' : '📄 Facture'}
                      </button>
                    )}
                  </div>
                );
              })}
              {erreurFacture && <div style={{ marginTop: 10, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem' }}>{erreurFacture}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const carte: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const enteteCarte: React.CSSProperties = { padding: '14px 18px', borderBottom: '1px solid #ecfeff', background: 'linear-gradient(135deg,#f8feff,#ecfeff)', fontSize: '0.95rem' };
const ligne: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.86rem', padding: '5px 0' };
