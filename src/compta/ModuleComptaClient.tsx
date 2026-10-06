import { useEffect, useState } from 'react';
import api from '../api/client';
import { adresseCompta } from './produit';

// LabFlow Compta, étape S2c : carte « Module Comptabilité » de « Mon abonnement ». Cachée tant que le module n'est pas
// proposé (tarif à 0) ; sinon son prix et « Demander l'activation » (validée par l'équipe LabFlow), ou, une fois actif,
// ses postes et le lien vers LabFlow Compta (connexion avec les mêmes identifiants). Rangée sous src/compta : vocabulaire
// comptable fixe, jamais traduit par le domaine du compte (hors du moteur de vocabulaire, comme toute la coquille Compta).
interface EtatModule {
  disponible: boolean;
  actif: boolean;
  activeLe: string | null;
  factureAPartirDe: string | null;
  prixModule: number;
  postes: { code: string; libelle: string; montant: number }[];
  totalMensuel: number;
  demandeEnCours: boolean;
}

const messageDe = (err: unknown, defaut: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message || defaut;
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const fmtMois = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—');

// Lignes du module dans la carte « Votre tarification » de « Mon abonnement » (rien sans le module).
export function LignesModuleCompta({ postes }: { postes?: { code: string; libelle: string; montant: number }[] }) {
  return (
    <>
      {(postes ?? []).map((p) => (
        <div key={p.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
          <span style={{ color: '#374151' }}>📒 {p.libelle}</span>
          <span style={{ fontWeight: 700, color: '#111827' }}>{p.montant.toFixed(2)} DT</span>
        </div>
      ))}
    </>
  );
}

export default function ModuleComptaClient() {
  const [etat, setEtat] = useState<EtatModule | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  // Rechargée au retour sur l'onglet, comme le reste de « Mon abonnement » (ex. demande validée entre-temps).
  useEffect(() => {
    let annule = false;
    const charger = () => {
      api.get('/api/abonnements/module-compta')
        .then(({ data }) => { if (!annule) setEtat(data as EtatModule); })
        .catch(() => { /* carte simplement absente */ });
    };
    charger();
    const auRetour = () => { if (document.visibilityState === 'visible') charger(); };
    document.addEventListener('visibilitychange', auRetour);
    return () => { annule = true; document.removeEventListener('visibilitychange', auRetour); };
  }, []);

  if (!etat || (!etat.disponible && !etat.actif)) return null;

  const demander = async () => {
    setEnvoi(true);
    setErreur('');
    try {
      await api.post('/api/abonnements/demandes', { typeDemande: 'activer_module_compta' });
      setEtat((e) => (e ? { ...e, demandeEnCours: true } : e));
    } catch (err) {
      setErreur(messageDe(err, 'Envoi impossible, réessayez plus tard'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #c7d2fe', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 24 }}>
      <div style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', padding: '16px 20px', borderBottom: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#312e81', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📒</span> Module Comptabilité
          </div>
          <div style={{ fontSize: '0.76rem', color: '#4338ca', marginTop: 3 }}>Votre comptabilité dans LabFlow Compta, l'accès de votre comptable compris</div>
        </div>
        {etat.actif && <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: '#dcfce7', color: '#166534' }}>✅ Actif</span>}
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {etat.actif ? (
          <>
            {etat.postes.map((p) => (
              <div key={p.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.86rem', color: '#374151' }}>
                <span>{p.libelle}</span><span style={{ fontWeight: 700, color: '#111827' }}>{p.montant.toFixed(2)} DT</span>
              </div>
            ))}
            <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
              Actif depuis le {fmtDate(etat.activeLe)} · facturé avec votre abonnement à partir de {fmtMois(etat.factureAPartirDe)}.
            </div>
            <a href={adresseCompta()} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir LabFlow Compta (nouvel onglet)"
              style={{ alignSelf: 'flex-start', textDecoration: 'none', padding: '9px 16px', borderRadius: 8, background: 'linear-gradient(135deg,#312e81,#4338ca)', color: '#fff', fontSize: '0.82rem', fontWeight: 700 }}>
              Ouvrir LabFlow Compta →
            </a>
            <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Connectez-vous avec la même adresse email et le même mot de passe.</div>
          </>
        ) : etat.demandeEnCours ? (
          <div style={{ background: '#fef9c3', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', color: '#854d0e', fontWeight: 600 }}>
            ⏳ Demande d'activation du module Comptabilité en attente de validation
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: '0.86rem', color: '#374151' }}>Prix du module</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#312e81' }}>{etat.prixModule.toFixed(2)} DT/mois</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
              Facturé à part, à partir du mois qui suit son activation ; les promotions de votre abonnement ne s'y appliquent pas.
            </div>
            <button type="button" onClick={demander} disabled={envoi}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid #4338ca', background: '#fff', color: '#4338ca', fontSize: '0.82rem', fontWeight: 700, cursor: envoi ? 'default' : 'pointer', opacity: envoi ? 0.7 : 1 }}>
              {envoi ? 'Envoi…' : '📒 Demander l\'activation'}
            </button>
            {erreur && <div style={{ color: '#dc2626', fontSize: '0.78rem' }}>{erreur}</div>}
          </>
        )}
      </div>
    </div>
  );
}
