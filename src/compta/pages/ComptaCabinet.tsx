import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { libelleForme } from '../../utils/identiteLegale';
import BoutonAide from '../BoutonAide';
import { Carte, Ligne } from '../ui';

// « Mon cabinet » (LabFlow Compta, étape S2b) : le cabinet tel que LabFlow le connaît — identité (celle de ses
// factures d'abonnement, saisie par l'admin), titulaire, gérants. S3c : gérants en place (désactivés compris) sur les
// gérants prévus, et le lien vers « Mes gérants ». S4a : le nombre de dossiers et le lien vers « Dossiers ».
interface Cabinet {
  espace: { id: number; nom: string; etat: string };
  nomAffiche: string;
  identite: Record<string, string | null>;
  contact: { nom: string; email: string; telephone: string | null };
  nbGerants: number;
  gerantsEnPlace: number;
  nbDossiers?: number;
}

export default function ComptaCabinet() {
  const [cabinet, setCabinet] = useState<Cabinet | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    api.get('/api/compta/cabinet').then(({ data }) => setCabinet(data as Cabinet)).catch(() => setErreur(true));
  }, []);

  const id = cabinet?.identite || {};
  const lignesIdentite: [string, string | null | undefined][] = [
    ['Raison sociale', id.raisonSociale],
    ['Nom commercial', id.nomCommercial],
    ['Forme juridique', libelleForme(id.formeJuridique)],
    ['Matricule fiscal', id.matriculeFiscal],
    ['RNE', id.rne],
    ['Adresse', [id.adresse, id.ville].filter(Boolean).join(', ')],
    ['Représentant légal', [id.representantNom, id.representantQualite].filter(Boolean).join(' — ')],
  ];

  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #7c3aed 100%)', borderRadius: 18, padding: '24px 28px',
        marginBottom: 24, boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏢</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Mon cabinet</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>{cabinet ? cabinet.nomAffiche : 'Votre cabinet comptable'}</p>
        </div>
        <BoutonAide section="compta-cabinet" />
      </div>

      {erreur && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600 }}>Impossible de charger votre cabinet. Réessayez plus tard.</div>}
      {!erreur && !cabinet && <div className="loading-text">Chargement…</div>}

      {cabinet && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          <Carte titre="🪪 Identité" sousTitre="Celle de vos factures d'abonnement">
            {lignesIdentite.map(([l, v]) => <Ligne key={l} libelle={l} valeur={v || '—'} />)}
            <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
              Une correction ? Contactez l'équipe LabFlow : elle s'appliquera aux factures suivantes, jamais à celles déjà émises.
            </p>
          </Carte>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Carte titre="👤 Titulaire" sousTitre="La personne qui se connecte au cabinet">
              <Ligne libelle="Nom" valeur={cabinet.contact.nom} />
              <Ligne libelle="Email" valeur={cabinet.contact.email} />
              <Ligne libelle="Téléphone" valeur={cabinet.contact.telephone || '—'} />
            </Carte>
            <Carte titre="👥 Gérants" sousTitre="Accès de vos collaborateurs, prévus dans votre abonnement">
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#3730a3' }}>
                {cabinet.gerantsEnPlace}<span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#64748b' }}> / {cabinet.nbGerants}</span>
              </div>
              <p style={{ margin: '4px 0 12px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                {cabinet.nbGerants > 0
                  ? `gérant${cabinet.gerantsEnPlace > 1 ? 's' : ''} en place sur ${cabinet.nbGerants} prévu${cabinet.nbGerants > 1 ? 's' : ''}.`
                  : 'Aucun gérant prévu : vous pouvez en demander à l\'équipe LabFlow.'}
              </p>
              <Link to="/gerants" style={{ display: 'inline-block', padding: '8px 16px', borderRadius: 9, background: '#4338ca', color: '#fff', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none' }}>
                Gérer mes gérants →
              </Link>
            </Carte>
            <Carte titre="📁 Dossiers" sousTitre="Les entreprises dont vous tenez la comptabilité">
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#3730a3' }}>{cabinet.nbDossiers ?? 0}</div>
              <p style={{ margin: '4px 0 12px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                {(cabinet.nbDossiers ?? 0) > 0
                  ? `dossier${(cabinet.nbDossiers ?? 0) > 1 ? 's' : ''} (archivés compris).`
                  : 'Aucun dossier pour l\'instant : créez le premier avec l\'assistant.'}
              </p>
              <Link to="/dossiers" style={{ display: 'inline-block', padding: '8px 16px', borderRadius: 9, background: '#4338ca', color: '#fff', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none' }}>
                Voir les dossiers →
              </Link>
            </Carte>
          </div>
        </div>
      )}
    </div>
  );
}
