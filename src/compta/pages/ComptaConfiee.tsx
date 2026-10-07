import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/client';
import BoutonAide from '../BoutonAide';
import { useAccesCompta } from '../accesCompta';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { libelleNiveau } from '../comptables';
import { libelleForme } from '../../utils/identiteLegale';

// « Comptabilité de … » (LabFlow Compta, étape S3b ; réponse du client du 07/10) : la comptabilité qu'un client LabFlow
// a confiée à la personne connectée — identité et contact du client, son accès (niveau, confiée le), « Quitter cet
// accès ». Les dossiers arriveront à l'étape suivante. Une comptabilité confiée suit l'abonnement de son client (D4).
interface Confiee {
  espace: { id: number; nom: string };
  identite: Record<string, string | null>;
  contact: { nom: string | null; email: string | null; telephone: string | null };
  acces: { niveau: string; obligatoire: boolean; confieeLe: string | null };
  etatAbonnement: 'actif' | 'lecture_seule' | 'bloque' | 'suspendu';
}

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const IDENTITE: [string, string][] = [
  ['raisonSociale', 'Raison sociale'], ['nomCommercial', 'Nom commercial'], ['formeJuridique', 'Forme juridique'],
  ['matriculeFiscal', 'Matricule fiscal'], ['rne', 'RNE'], ['adresse', 'Adresse'], ['ville', 'Ville'],
];

// Une page par comptabilité : changer d'espace (navigation directe) repart d'un état neuf, jamais de l'ancienne.
export default function ComptaConfieePage() {
  const { espaceId } = useParams();
  return <ComptaConfiee key={espaceId} espaceId={espaceId} />;
}

function ComptaConfiee({ espaceId }: { espaceId?: string }) {
  const navigate = useNavigate();
  const { recharger } = useAccesCompta();
  const { confirm } = useConfirm();
  const [donnees, setDonnees] = useState<Confiee | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'erreur'>('chargement');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let annule = false;
    api.get(`/api/compta/confiees/${encodeURIComponent(espaceId || '')}`)
      .then(({ data }) => { if (!annule) { setDonnees(data as Confiee); setEtat('pret'); } })
      .catch((err) => { if (!annule) setEtat((err as { response?: { status?: number } })?.response?.status === 404 ? 'introuvable' : 'erreur'); });
    return () => { annule = true; };
  }, [espaceId]);

  const quitter = async () => {
    if (!donnees || envoi) return;
    const ok = await confirm({
      title: 'Quitter cet accès ?',
      message: `Vous n'aurez plus accès à la comptabilité de ${donnees.espace.nom}. Le client en sera prévenu ; lui seul pourra vous redonner un accès.`,
      tone: 'danger',
      confirmLabel: 'Quitter',
    });
    if (!ok) return;
    setEnvoi(true);
    setErreur('');
    try {
      await api.post(`/api/compta/confiees/${donnees.espace.id}/quitter`);
      recharger();
      navigate('/', { replace: true });
    } catch (err) {
      // Accès déjà retiré par le client entre-temps : retour à l'accueil, comme après avoir quitté.
      if ((err as { response?: { status?: number } })?.response?.status === 404) { recharger(); navigate('/', { replace: true }); return; }
      setErreur((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Impossible de quitter cet accès pour le moment, réessayez.');
      setEnvoi(false);
    }
  };

  const lignesIdentite = donnees ? IDENTITE.filter(([cle]) => donnees.identite[cle]) : [];
  const suspendue = donnees && (donnees.etatAbonnement === 'suspendu' || donnees.etatAbonnement === 'bloque');

  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #7c3aed 100%)', borderRadius: 18, padding: '24px 28px',
        marginBottom: 24, boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🤝</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0, overflowWrap: 'anywhere' }}>
              {donnees ? `Comptabilité de ${donnees.espace.nom}` : 'Comptabilité confiée'}
            </h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>Confiée par un client LabFlow</p>
        </div>
        <BoutonAide section="compta-confiee" />
      </div>

      {etat === 'chargement' && <div className="loading-text">Chargement…</div>}
      {etat === 'erreur' && <div role="alert" style={alerte}>Impossible de charger cette comptabilité. Réessayez plus tard.</div>}
      {etat === 'introuvable' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '22px 24px', maxWidth: 640 }}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Cette comptabilité ne vous est plus confiée</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>Retrouvez vos comptabilités sur l'accueil.</p>
        </div>
      )}

      {etat === 'pret' && donnees && (
        <>
          {donnees.etatAbonnement !== 'actif' && (
            <div role="status" style={{ ...alerte, background: suspendue ? '#fef2f2' : '#fffbeb', borderColor: suspendue ? '#fecaca' : '#fde68a', color: suspendue ? '#b91c1c' : '#92400e', marginBottom: 20 }}>
              {suspendue
                ? 'Comptabilité suspendue : l\'abonnement de ce client est suspendu. Elle n\'est plus modifiable.'
                : 'Comptabilité en lecture seule : l\'abonnement de ce client attend un paiement.'}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 20 }}>
            <Carte titre="🏢 Le client" sousTitre="Son identité et son contact">
              {lignesIdentite.length === 0 && <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#64748b' }}>Identité légale pas encore renseignée.</p>}
              {lignesIdentite.map(([cle, libelle]) => (
                <Ligne key={cle} libelle={libelle} valeur={(cle === 'formeJuridique' ? libelleForme(donnees.identite[cle]) : donnees.identite[cle]) || '—'} />
              ))}
              <Ligne libelle="Contact" valeur={donnees.contact.nom || '—'} />
              <Ligne libelle="Email" valeur={donnees.contact.email || '—'} />
              {donnees.contact.telephone && <Ligne libelle="Téléphone" valeur={donnees.contact.telephone} />}
            </Carte>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Carte titre="🔑 Votre accès" sousTitre={donnees.acces.obligatoire ? 'Vous êtes le comptable de ce client' : 'Gérant comptable'}>
                <Ligne libelle="Niveau" valeur={libelleNiveau(donnees.acces.niveau)} />
                <Ligne libelle="Confiée le" valeur={fmtDate(donnees.acces.confieeLe)} />
                <button type="button" onClick={quitter} disabled={envoi}
                  style={{ marginTop: 14, padding: '9px 16px', borderRadius: 9, border: '1.5px solid #fecdd3', background: '#fff', color: '#be123c', fontSize: '0.82rem', fontWeight: 700, cursor: envoi ? 'default' : 'pointer', opacity: envoi ? 0.7 : 1 }}>
                  {envoi ? 'Envoi…' : 'Quitter cet accès'}
                </button>
                {erreur && <div role="alert" style={{ color: '#dc2626', fontSize: '0.78rem', marginTop: 8 }}>{erreur}</div>}
              </Carte>
              <Carte titre="📁 Les dossiers" sousTitre="Bientôt">
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.6 }}>Les dossiers de ce client arriveront dans une prochaine version de LabFlow Compta.</p>
              </Carte>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };

function Carte({ titre, sousTitre, children }: { titre: string; sousTitre: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #eef2ff', background: 'linear-gradient(135deg,#f8faff,#eef2ff)' }}>
        <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.95rem' }}>{titre}</div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{sousTitre}</div>
      </div>
      <div style={{ padding: '14px 18px' }}>{children}</div>
    </div>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.86rem', padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ color: '#64748b' }}>{libelle}</span>
      <span style={{ color: '#0f172a', fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{valeur}</span>
    </div>
  );
}
