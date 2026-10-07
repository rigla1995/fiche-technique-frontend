import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import BoutonAide from '../BoutonAide';
import { libelleNiveau } from '../comptables';

// Accueil de LabFlow Compta : les comptabilités de la personne, en trois groupes TOUJOURS distincts (exigence du client,
// CADRAGE §2) — son cabinet, sa comptabilité de client LabFlow, celles que des clients LabFlow lui ont confiées.
// Étape S1 : aucune comptabilité n'existe encore (le serveur renvoie trois listes vides).
// Présentation de LabFlow (demande du client du 06/10) : page dans la mise en page commune (LayoutCompta), bandeau
// coloré en tête avec son « ? », comme chaque page de LabFlow.
// `lien` (étape S2b) : page ouverte par la carte (le cabinet de son titulaire) ; absent = carte sans lien à cette étape.
// `etatAbonnement` (S3b, D4) : état de l'abonnement du titulaire — un cabinet bloqué se connecte encore (sa carte le
// dit) ; une comptabilité confiée suit l'abonnement de son client.
// `role`, `niveau` (S3c) : un collaborateur voit le cabinet dans « Mon cabinet », avec la mention « Collaborateur » et
// son niveau.
type EtatAbonnement = 'actif' | 'lecture_seule' | 'bloque' | 'suspendu';
type Comptabilite = { id: number; nom: string; role?: 'titulaire' | 'gerant'; niveau?: string; lien?: string | null; etatAbonnement?: EtatAbonnement };
const ETATS: Record<string, { libelle: string; fond: string; texte: string }> = {
  lecture_seule: { libelle: 'Lecture seule', fond: '#fef3c7', texte: '#92400e' },
  bloque: { libelle: 'Abonnement bloqué', fond: '#fee2e2', texte: '#991b1b' },
  suspendu: { libelle: 'Suspendue', fond: '#fee2e2', texte: '#991b1b' },
};
type Acces = { cabinets: Comptabilite[]; maComptabilite: Comptabilite[]; confiees: Comptabilite[] };

const GROUPES: { cle: keyof Acces; titre: string; badge: string; couleur: string }[] = [
  { cle: 'cabinets', titre: 'Mon cabinet', badge: 'Cabinet', couleur: '#4338ca' },
  { cle: 'maComptabilite', titre: 'Ma comptabilité', badge: 'Client LabFlow', couleur: '#0f766e' },
  { cle: 'confiees', titre: 'Comptabilités confiées par des clients LabFlow', badge: 'Confiée', couleur: '#b45309' },
];

export default function ComptaAccueil() {
  const [acces, setAcces] = useState<Acces | null>(null);
  const [erreur, setErreur] = useState(false);

  const charger = useCallback(() => {
    setErreur(false);
    api.get('/api/compta/acces')
      .then(({ data }) => setAcces(data as Acces))
      .catch(() => setErreur(true));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const vide = acces && GROUPES.every((g) => (acces[g.cle] || []).length === 0);

  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #7c3aed 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📒</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Vos comptabilités</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>Choisissez la comptabilité à ouvrir.</p>
        </div>
        <BoutonAide section="compta-bienvenue" />
      </div>

        {erreur && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Impossible de charger vos comptabilités.</span>
            <button type="button" onClick={charger} style={{ background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Réessayer</button>
          </div>
        )}

        {!erreur && !acces && <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Chargement…</p>}

        {vide && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '32px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.04)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>📒</div>
            <p style={{ margin: '0 0 6px', fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>Aucune comptabilité n'est encore ouverte pour ce compte.</p>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem', lineHeight: 1.6 }}>
              Quand un cabinet ou un client LabFlow vous ouvrira une comptabilité, elle apparaîtra ici.
            </p>
          </div>
        )}

        {acces && !vide && GROUPES.filter((g) => (acces[g.cle] || []).length > 0).map((g) => (
          <section key={g.cle} style={{ marginBottom: 26 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px', fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
              {g.titre}
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#fff', background: g.couleur, borderRadius: 999, padding: '3px 9px' }}>{g.badge}</span>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {acces[g.cle].map((c) => {
                const style: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#fff', border: '1px solid #e2e8f0', borderLeft: `4px solid ${g.couleur}`, borderRadius: 12, padding: '14px 16px', fontWeight: 700, color: '#0f172a', textDecoration: 'none' };
                // Une comptabilité confiée d'un client bloqué se dit « Suspendue » (cadrage S3b §2 : l'état de facturation du
                // client ne regarde pas son comptable) ; sa carte s'ouvre encore, pour pouvoir quitter l'accès. S3c : de même
                // pour le cabinet d'un collaborateur.
                const cleEtat = (g.cle === 'confiees' || c.role === 'gerant') && c.etatAbonnement === 'bloque' ? 'suspendu' : c.etatAbonnement;
                const e = cleEtat ? ETATS[cleEtat] : undefined;
                const nom = (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0, overflowWrap: 'anywhere' }}>
                    {c.nom}
                    {g.cle === 'cabinets' && c.role === 'gerant' && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#eef2ff', color: '#3730a3' }}>
                        Collaborateur{c.niveau ? ` · ${libelleNiveau(c.niveau)}` : ''}
                      </span>
                    )}
                    {e && <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: e.fond, color: e.texte }}>{e.libelle}</span>}
                  </span>
                );
                return c.lien ? (
                  <Link key={`${g.cle}-${c.id}`} to={c.lien} style={style}>
                    {nom}<span style={{ color: g.couleur, fontSize: '0.85rem', flexShrink: 0 }}>Ouvrir →</span>
                  </Link>
                ) : (
                  <div key={`${g.cle}-${c.id}`} style={style}>{nom}</div>
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );
}
