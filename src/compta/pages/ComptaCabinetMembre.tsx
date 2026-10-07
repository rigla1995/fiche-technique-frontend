import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api/client';
import BoutonAide from '../BoutonAide';
import { libelleNiveau } from '../comptables';
import { libelleForme } from '../../utils/identiteLegale';
import { Carte, Ligne } from '../ui';

// « Cabinet … » (LabFlow Compta, étape S3c) : le cabinet dont la personne connectée est collaboratrice — identité du
// cabinet, titulaire et contact, son accès (niveau, membre depuis). Réponse du client du 07/10 : le titulaire gère son
// équipe, la page n'a pas de « Quitter ». Les dossiers arriveront à l'étape suivante.
interface Membre {
  cabinet: { id: number; nom: string };
  identite: Record<string, string | null>;
  titulaire: { nom: string | null; email: string | null; telephone: string | null };
  acces: { niveau: string; membreDepuis: string | null };
  etatAbonnement: 'actif' | 'lecture_seule' | 'bloque' | 'suspendu';
}

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const IDENTITE: [string, string][] = [
  ['raisonSociale', 'Raison sociale'], ['nomCommercial', 'Nom commercial'], ['formeJuridique', 'Forme juridique'],
  ['matriculeFiscal', 'Matricule fiscal'], ['rne', 'RNE'], ['adresse', 'Adresse'], ['ville', 'Ville'],
];

// Une page par cabinet : changer de cabinet (navigation directe) repart d'un état neuf.
export default function ComptaCabinetMembrePage() {
  const { espaceId } = useParams();
  return <ComptaCabinetMembre key={espaceId} espaceId={espaceId} />;
}

function ComptaCabinetMembre({ espaceId }: { espaceId?: string }) {
  const [donnees, setDonnees] = useState<Membre | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'erreur'>('chargement');

  useEffect(() => {
    let annule = false;
    api.get(`/api/compta/cabinets/${encodeURIComponent(espaceId || '')}`)
      .then(({ data }) => { if (!annule) { setDonnees(data as Membre); setEtat('pret'); } })
      .catch((err) => { if (!annule) setEtat((err as { response?: { status?: number } })?.response?.status === 404 ? 'introuvable' : 'erreur'); });
    return () => { annule = true; };
  }, [espaceId]);

  const lignesIdentite = donnees ? IDENTITE.filter(([cle]) => donnees.identite[cle]) : [];
  // L'état de facturation du cabinet ne regarde pas le collaborateur : « bloqué » se dit « suspendu » (comme une
  // comptabilité confiée, S3b).
  const suspendu = donnees && (donnees.etatAbonnement === 'suspendu' || donnees.etatAbonnement === 'bloque');

  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #7c3aed 100%)', borderRadius: 18, padding: '24px 28px',
        marginBottom: 24, boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏢</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0, overflowWrap: 'anywhere' }}>
              {donnees ? donnees.cabinet.nom : 'Cabinet'}
            </h1>
          </div>
          {etat !== 'introuvable' && <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>Vous êtes collaborateur de ce cabinet</p>}
        </div>
        <BoutonAide section="compta-cabinet-membre" />
      </div>

      {etat === 'chargement' && <div className="loading-text">Chargement…</div>}
      {etat === 'erreur' && <div role="alert" style={alerte}>Impossible de charger ce cabinet. Réessayez plus tard.</div>}
      {etat === 'introuvable' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '22px 24px', maxWidth: 640 }}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Ce cabinet ne vous est plus ouvert</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>Retrouvez vos comptabilités sur l'accueil.</p>
        </div>
      )}

      {etat === 'pret' && donnees && (
        <>
          {donnees.etatAbonnement !== 'actif' && (
            <div role="status" style={{ ...alerte, background: suspendu ? '#fef2f2' : '#fffbeb', borderColor: suspendu ? '#fecaca' : '#fde68a', color: suspendu ? '#b91c1c' : '#92400e', marginBottom: 20 }}>
              {suspendu
                ? 'Cabinet suspendu : son abonnement est suspendu. Il n\'est plus modifiable.'
                : 'Cabinet en lecture seule : son abonnement attend un paiement.'}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 20 }}>
            <Carte titre="🏢 Le cabinet" sousTitre="Son identité">
              {lignesIdentite.length === 0 && <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#64748b' }}>Identité légale pas encore renseignée.</p>}
              {lignesIdentite.map(([cle, libelle]) => (
                <Ligne key={cle} libelle={libelle} valeur={(cle === 'formeJuridique' ? libelleForme(donnees.identite[cle]) : donnees.identite[cle]) || '—'} />
              ))}
            </Carte>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Carte titre="👤 Le titulaire" sousTitre="Il gère les accès du cabinet">
                <Ligne libelle="Nom" valeur={donnees.titulaire.nom || '—'} />
                <Ligne libelle="Email" valeur={donnees.titulaire.email || '—'} />
                {donnees.titulaire.telephone && <Ligne libelle="Téléphone" valeur={donnees.titulaire.telephone} />}
              </Carte>
              <Carte titre="🔑 Votre accès" sousTitre="Collaborateur du cabinet">
                <Ligne libelle="Niveau" valeur={libelleNiveau(donnees.acces.niveau)} />
                <Ligne libelle="Membre depuis" valeur={fmtDate(donnees.acces.membreDepuis)} />
                <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                  Votre accès est géré par le titulaire du cabinet : pour changer votre niveau ou fermer votre accès, adressez-vous à lui.
                </p>
              </Carte>
              <Carte titre="📁 Les dossiers" sousTitre="Bientôt">
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.6 }}>Les dossiers du cabinet arriveront dans une prochaine version de LabFlow Compta.</p>
              </Carte>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
