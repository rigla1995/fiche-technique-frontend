import { useEffect, useState } from 'react';
import api from '../../api/client';
import { libelleForme } from '../../utils/identiteLegale';
import BoutonAide from '../BoutonAide';

// « Mon cabinet » (LabFlow Compta, étape S2b) : le cabinet tel que LabFlow le connaît — identité (celle de ses
// factures d'abonnement, saisie par l'admin), titulaire, gérants prévus. Lecture seule à cette étape.
interface Cabinet {
  espace: { id: number; nom: string; etat: string };
  nomAffiche: string;
  identite: Record<string, string | null>;
  contact: { nom: string; email: string; telephone: string | null };
  nbGerants: number;
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
            <Carte titre="👥 Gérants" sousTitre="Comptes de vos collaborateurs, prévus dans votre abonnement">
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#3730a3' }}>{cabinet.nbGerants}</div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                {cabinet.nbGerants > 0 ? `gérant${cabinet.nbGerants > 1 ? 's' : ''} prévu${cabinet.nbGerants > 1 ? 's' : ''} ; leurs accès s'ouvriront à une prochaine étape.` : 'Aucun gérant prévu : contactez l\'équipe LabFlow pour en ajouter.'}
              </p>
            </Carte>
          </div>
        </div>
      )}
    </div>
  );
}

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
