import { useEffect, useState } from 'react';
import api from '../../api/client';
import BoutonAide from '../BoutonAide';

// « Ma comptabilité » (LabFlow Compta, étape S2c) : la comptabilité d'un client LabFlow qui a le module Comptabilité —
// son module (postes, mois de première facturation), l'accès de son comptable (à désigner à l'étape S3) et les accès
// comptables supplémentaires prévus. Lecture seule à cette étape ; sans module, un message renvoie vers LabFlow.
interface MaComptabilite {
  espace: { id: number; nom: string; etat: string; ouvertLe: string };
  module: {
    actif: boolean; activeLe: string | null; factureAPartirDe: string | null; nbGerants: number;
    postes: { code: string; libelle: string; montant: number }[]; totalMensuel: number;
  } | null;
  comptables: { id: number; etat: 'a_attribuer' | 'actif' | 'desactive'; obligatoire: boolean; nom: string | null; email: string | null }[];
}

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const fmtMois = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—');

export default function ComptaMaComptabilite() {
  const [donnees, setDonnees] = useState<MaComptabilite | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'inactif' | 'erreur'>('chargement');

  useEffect(() => {
    api.get('/api/compta/ma-comptabilite')
      .then(({ data }) => { setDonnees(data as MaComptabilite); setEtat('pret'); })
      .catch((err) => setEtat((err as { response?: { status?: number } })?.response?.status === 404 ? 'inactif' : 'erreur'));
  }, []);

  const comptable = donnees?.comptables.find((c) => c.obligatoire) || null;
  const module = donnees?.module || null;

  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #7c3aed 100%)', borderRadius: 18, padding: '24px 28px',
        marginBottom: 24, boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🧮</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Ma comptabilité</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>{donnees ? donnees.espace.nom : 'La comptabilité de votre entreprise'}</p>
        </div>
        <BoutonAide section="compta-ma-comptabilite" />
      </div>

      {etat === 'chargement' && <div className="loading-text">Chargement…</div>}
      {etat === 'erreur' && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600 }}>Impossible de charger votre comptabilité. Réessayez plus tard.</div>}
      {etat === 'inactif' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '22px 24px', maxWidth: 640 }}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Le module Comptabilité n'est pas activé sur votre compte</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
            Lorsqu'il vous est proposé, vous pouvez le demander depuis LabFlow : page <strong>Mon abonnement</strong>, carte
            <strong> Module Comptabilité</strong>, bouton <strong>Demander l'activation</strong>.
          </p>
        </div>
      )}

      {etat === 'pret' && donnees && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          <Carte titre="📒 Votre module" sousTitre="Facturé avec votre abonnement LabFlow, à plein tarif">
            {(module?.postes || []).map((p) => <Ligne key={p.code} libelle={p.libelle} valeur={`${p.montant.toFixed(2)} DT/mois`} />)}
            <Ligne libelle="Activé le" valeur={fmtDate(module?.activeLe || null)} />
            {(module?.postes.length ?? 0) > 1 && <Ligne libelle="Total mensuel" valeur={`${(module?.totalMensuel ?? 0).toFixed(2)} DT/mois`} />}
            <Ligne libelle="Facturé à partir de" valeur={fmtMois(module?.factureAPartirDe || null)} />
          </Carte>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Carte titre="👤 Votre comptable" sousTitre="Son accès est compris dans le module">
              {comptable && comptable.etat !== 'a_attribuer' ? (
                <>
                  <Ligne libelle="Nom" valeur={comptable.nom || '—'} />
                  <Ligne libelle="Email" valeur={comptable.email || '—'} />
                </>
              ) : (
                <>
                  <span style={{ display: 'inline-block', fontSize: '0.75rem', fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: '#fef3c7', color: '#92400e' }}>À désigner</span>
                  <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                    Vous pourrez bientôt indiquer le nom et l'adresse email de votre comptable : il recevra alors son accès.
                  </p>
                </>
              )}
            </Carte>
            <Carte titre="👥 Gérants comptables supplémentaires" sousTitre="Accès comptables prévus en plus de celui de votre comptable">
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#3730a3' }}>{module?.nbGerants ?? 0}</div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                {(module?.nbGerants ?? 0) > 0 ? 'Leurs accès s\'ouvriront à une prochaine étape.' : 'Aucun pour l\'instant : contactez l\'équipe LabFlow pour en ajouter.'}
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
