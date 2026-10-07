import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { libelleForme } from '../utils/identiteLegale';
import NouveauDossier from './NouveauDossier';
import { PAGE_DOSSIERS, fmtDate, lirePageDossiers, texteEtatAbonnement, type LigneDossier, type ListeDossiersReponse } from './dossiers';
import { bouton, inp, pastille } from './styles';

// Les dossiers d'une comptabilité ouverts à la personne (LabFlow Compta, étapes S4a et S4b) : recherche (nom, raison
// sociale, nom commercial, matricule), archivés sur demande, « + Dossier » selon ses droits (titulaire ou gérant de
// niveau Complet) et l'état de l'abonnement. Quatre pages : « Dossiers » du titulaire d'un cabinet et « Ma comptabilité »
// du client LabFlow (bandeau d'abonnement ici) ; « Cabinet » du collaborateur et « Comptabilité de … » du comptable (la
// page a déjà son bandeau : `bandeau={false}`). Le dossier « Mon entreprise » d'un client (source labflow) porte sa
// mention. S4d « grands cabinets » (remarque du client du 07/10) : la liste se lit PAR PAGES de 25 (« Afficher plus »)
// et la recherche se fait côté serveur, sur tous les dossiers ouverts à la personne.
export default function ListeDossiers({ espaceId, titre = 'Vos dossiers', bandeau = true }: { espaceId: number; titre?: string; bandeau?: boolean }) {
  // `lu` : la dernière réponse (en-tête, droits, total), les lignes accumulées depuis la page 1, et la recherche qu'elle
  // sert — une relecture en route se voit à la différence avec la recherche en cours (état dérivé, pas d'effet).
  const [lu, setLu] = useState<{ cle: string; etat: ListeDossiersReponse; lignes: LigneDossier[] } | null>(null);
  const [erreur, setErreur] = useState(false);
  const [plus, setPlus] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [q, setQ] = useState('');
  const [archives, setArchives] = useState(false);
  const [assistant, setAssistant] = useState(false);
  // Lectures numérotées : une lecture partie avant la dernière réponse reçue ne l'écrase jamais.
  const tour = useRef(0);
  const cle = `${archives ? 1 : 0}\u0000${q}`;

  useEffect(() => { const t = setTimeout(() => setQ(recherche.trim()), 300); return () => clearTimeout(t); }, [recherche]);
  const charger = useCallback((page: number) => {
    const moi = ++tour.current;
    lirePageDossiers(espaceId, { q, archives, page, limite: PAGE_DOSSIERS })
      .then((r) => {
        if (moi !== tour.current) return;
        // Pages cumulées pour la même recherche, dédoublonnées par identifiant (un dossier créé entre deux pages décale
        // la suivante) ; une autre recherche repart de sa page 1.
        setLu((prev) => {
          const reprise = page === 1 || !prev || prev.cle !== cle;
          const vus = new Set(reprise ? [] : prev.lignes.map((d) => d.id));
          return { cle, etat: r, lignes: reprise ? r.dossiers : [...prev.lignes, ...r.dossiers.filter((d) => !vus.has(d.id))] };
        });
        setErreur(false);
      })
      .catch(() => { if (moi === tour.current) setErreur(true); })
      .finally(() => { if (moi === tour.current) setPlus(false); });
  }, [espaceId, q, archives, cle]);
  useEffect(() => { charger(1); }, [charger]);

  const etat = lu?.etat ?? null;
  const lignes = lu?.lignes ?? [];
  // La réponse affichée sert-elle encore la recherche en cours ? Sinon, une relecture est en route (ou a échoué).
  const relecture = !!lu && lu.cle !== cle;
  const ouvert = etat?.etatAbonnement === 'actif';
  const peutCreer = !!etat?.droits.creer;
  const nbTotal = (etat?.nbActifs ?? 0) + (etat?.nbArchives ?? 0);

  return (
    <div>
      {!lu && !erreur && <div className="loading-text">Chargement…</div>}
      {erreur && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: lu ? 12 : 0 }}>
          <span>{lu ? 'Impossible de relire les dossiers.' : 'Impossible de charger les dossiers.'}</span>
          <button type="button" onClick={() => charger(lu && lu.cle === cle ? lu.etat.page + 1 : 1)} style={bouton('#b91c1c', '#fff', '#b91c1c')}>Réessayer</button>
        </div>
      )}
      {etat && (
        <>
          {bandeau && !ouvert && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {texteEtatAbonnement(etat.etatAbonnement, etat.espace.role)} : les dossiers restent consultables mais ne se modifient plus.
            </div>
          )}
          <div style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: '1px solid #c7d2fe', borderRadius: 14, padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontWeight: 900, fontSize: '1rem', color: '#312e81', margin: 0 }}>{titre}</h2>
              <div style={{ fontSize: '0.78rem', color: '#4338ca', marginTop: 3 }} aria-live="polite">
                {etat.nbActifs} dossier{etat.nbActifs > 1 ? 's' : ''}{etat.nbArchives ? ` · ${etat.nbArchives} archivé${etat.nbArchives > 1 ? 's' : ''}` : ''}
                {etat.espace.role === 'gerant' ? ' · ceux qui vous sont ouverts' : ''}
                {q && !relecture ? ` · ${etat.total} résultat${etat.total > 1 ? 's' : ''}` : ''}
                {relecture && !erreur ? ' · lecture…' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher (nom, raison sociale, matricule)" aria-label="Rechercher un dossier"
                style={{ ...inp, width: 260, maxWidth: '100%' }} autoComplete="off" />
              {etat.nbArchives > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={archives} onChange={(e) => setArchives(e.target.checked)} />
                  Afficher les archivés
                </label>
              )}
              {peutCreer && (
                <button type="button" onClick={() => setAssistant(true)} disabled={!ouvert} title={ouvert ? undefined : 'Comptabilité non modifiable'}
                  style={{ ...bouton('#4338ca', '#fff', '#4338ca'), ...(ouvert ? {} : inactif) }}>+ Dossier</button>
              )}
            </div>
          </div>

          {lignes.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '22px 20px', textAlign: 'center', fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
              {relecture ? (erreur ? 'Liste impossible à relire.' : 'Lecture…') : nbTotal === 0
                ? (etat.espace.role === 'gerant'
                  // S4c : un gérant ne voit que ses dossiers ; sans aucun, la page le dit (sa carte reste sur l'accueil).
                  ? `Aucun dossier ne vous est ouvert pour l'instant : adressez-vous ${etat.espace.type === 'cabinet' ? 'au titulaire du cabinet' : 'au client'}${peutCreer && ouvert ? ', ou créez-en un (« + Dossier ») : il vous sera ouvert.' : '.'}`
                  : peutCreer && ouvert ? 'Aucun dossier pour l\'instant : cliquez sur « + Dossier » pour créer le premier.' : 'Aucun dossier pour l\'instant.')
                : q ? 'Aucun dossier ne correspond à cette recherche.' : 'Tous les dossiers sont archivés : cochez « Afficher les archivés ».'}
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 12, opacity: relecture ? 0.6 : 1 }}>
                {lignes.map((d) => <CarteDossier key={d.id} d={d} />)}
              </div>
              {!relecture && lignes.length < etat.total && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                  <button type="button" onClick={() => { setPlus(true); charger(etat.page + 1); }} disabled={plus} style={{ ...bouton('#fff', '#4338ca', '#c7d2fe'), opacity: plus ? 0.7 : 1 }}>
                    {plus ? 'Lecture…' : `Afficher plus (${etat.total - lignes.length} autre${etat.total - lignes.length > 1 ? 's' : ''})`}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {assistant && <NouveauDossier espaceId={espaceId} role={etat?.espace.role} onClose={() => setAssistant(false)} />}
    </div>
  );
}

function CarteDossier({ d }: { d: LigneDossier }) {
  const archive = d.etat === 'archive';
  return (
    <Link to={`/dossiers/${d.id}`} style={{ display: 'block', background: archive ? '#f8fafc' : '#fff', borderRadius: 14, border: '1px solid #e5e7eb', borderLeft: `4px solid ${archive ? '#94a3b8' : '#4338ca'}`, padding: '14px 16px', textDecoration: 'none', color: '#0f172a', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontWeight: 800, fontSize: '0.92rem', color: archive ? '#64748b' : '#0f172a', overflowWrap: 'anywhere' }}>{d.nom}</span>
        {d.source === 'labflow' && <span style={pastille('#dcfce7', '#166534')} title="Dossier créé d'après l'identité du compte LabFlow">Mon entreprise · LabFlow</span>}
        {archive && <span style={pastille('#e2e8f0', '#475569')}>Archivé</span>}
        {!d.identiteComplete && <span style={pastille('#fef3c7', '#92400e')}>Identité à compléter</span>}
      </div>
      {d.nomCommercial && <div style={{ fontSize: '0.78rem', color: '#64748b', overflowWrap: 'anywhere' }}>{d.raisonSociale}</div>}
      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>{libelleForme(d.formeJuridique) || 'Forme non renseignée'}</span>
        <span style={{ fontFamily: 'ui-monospace, monospace' }}>{d.matriculeFiscal || 'MF à compléter'}</span>
      </div>
      <div style={{ fontSize: '0.76rem', color: '#4338ca', fontWeight: 600, marginTop: 6 }}>
        {d.exercice ? `Exercice du ${fmtDate(d.exercice.debut)} au ${fmtDate(d.exercice.fin)}` : 'Aucun exercice ouvert'}
      </div>
    </Link>
  );
}

const inactif: React.CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
