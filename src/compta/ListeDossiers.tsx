import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { libelleForme } from '../utils/identiteLegale';
import NouveauDossier from './NouveauDossier';
import { fmtDate, texteEtatAbonnement, type LigneDossier, type ListeDossiersReponse } from './dossiers';
import { bouton, inp, pastille } from './styles';

// Les dossiers d'une comptabilité ouverts à la personne (LabFlow Compta, étapes S4a et S4b) : recherche (nom, raison
// sociale, matricule), archivés sur demande, « + Dossier » selon ses droits (titulaire ou gérant de niveau Complet) et
// l'état de l'abonnement. Quatre pages : « Dossiers » du titulaire d'un cabinet et « Ma comptabilité » du client LabFlow
// (bandeau d'abonnement ici) ; « Cabinet » du collaborateur et « Comptabilité de … » du comptable (la page a déjà son
// bandeau : `bandeau={false}`). Le dossier « Mon entreprise » d'un client (source labflow) porte sa mention.
export default function ListeDossiers({ espaceId, titre = 'Vos dossiers', bandeau = true }: { espaceId: number; titre?: string; bandeau?: boolean }) {
  const [etat, setEtat] = useState<ListeDossiersReponse | null>(null);
  const [chargement, setChargement] = useState<'en_cours' | 'pret' | 'erreur'>('en_cours');
  const [recherche, setRecherche] = useState('');
  const [archives, setArchives] = useState(false);
  const [assistant, setAssistant] = useState(false);

  const charger = useCallback(() => {
    let annule = false;
    api.get(`/api/compta/espaces/${espaceId}/dossiers`)
      .then(({ data }) => { if (!annule) { setEtat(data as ListeDossiersReponse); setChargement('pret'); } })
      .catch(() => { if (!annule) setChargement('erreur'); });
    return () => { annule = true; };
  }, [espaceId]);
  useEffect(() => charger(), [charger]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (etat?.dossiers || []).filter((d) => (archives || d.etat === 'actif')
      && (!q || [d.nom, d.raisonSociale, d.nomCommercial, d.matriculeFiscal].some((v) => (v || '').toLowerCase().includes(q))));
  }, [etat, recherche, archives]);
  const nbArchives = etat?.dossiers.filter((d) => d.etat === 'archive').length ?? 0;
  const nbActifs = (etat?.dossiers.length ?? 0) - nbArchives;
  const ouvert = etat?.etatAbonnement === 'actif';
  const peutCreer = !!etat?.droits.creer;

  return (
    <div>
      {chargement === 'en_cours' && <div className="loading-text">Chargement…</div>}
      {chargement === 'erreur' && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Impossible de charger les dossiers.</span>
          <button type="button" onClick={() => { setChargement('en_cours'); charger(); }} style={bouton('#b91c1c', '#fff', '#b91c1c')}>Réessayer</button>
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
              <div style={{ fontSize: '0.78rem', color: '#4338ca', marginTop: 3 }}>
                {nbActifs} dossier{nbActifs > 1 ? 's' : ''}{nbArchives ? ` · ${nbArchives} archivé${nbArchives > 1 ? 's' : ''}` : ''}
                {etat.espace.role === 'gerant' ? ' · ceux qui vous sont ouverts' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher (nom, matricule)" aria-label="Rechercher un dossier"
                style={{ ...inp, width: 220, maxWidth: '100%' }} />
              {nbArchives > 0 && (
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

          {visibles.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '22px 20px', textAlign: 'center', fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
              {etat.dossiers.length === 0
                ? (etat.espace.role === 'gerant'
                  // S4c : un gérant ne voit que ses dossiers ; sans aucun, la page le dit (sa carte reste sur l'accueil).
                  ? `Aucun dossier ne vous est ouvert pour l'instant : adressez-vous ${etat.espace.type === 'cabinet' ? 'au titulaire du cabinet' : 'au client'}${peutCreer && ouvert ? ', ou créez-en un (« + Dossier ») : il vous sera ouvert.' : '.'}`
                  : peutCreer && ouvert ? 'Aucun dossier pour l\'instant : cliquez sur « + Dossier » pour créer le premier.' : 'Aucun dossier pour l\'instant.')
                : recherche.trim() ? 'Aucun dossier ne correspond à cette recherche.' : 'Tous les dossiers sont archivés : cochez « Afficher les archivés ».'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 12 }}>
              {visibles.map((d) => <CarteDossier key={d.id} d={d} />)}
            </div>
          )}
        </>
      )}
      {assistant && <NouveauDossier espaceId={espaceId} dossiers={etat?.dossiers} role={etat?.espace.role} onClose={() => setAssistant(false)} />}
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
