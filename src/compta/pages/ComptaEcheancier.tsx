import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import BoutonAide from '../BoutonAide';
import { Modale } from '../DossierFormulaires';
import { messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import { LIBELLES_ETAT, fmtJour, fmtMontant, versMillimes } from '../ecritures';
import {
  ONGLETS, RELANCE_LIGNES_MAX, enRetard, texteIllisible, lireEcheancier, lireTiersEcheancier, nonNul, signe, telechargerEcheancier, telechargerRelance, telechargerReleve,
  type CleTranche, type EcheancierReponse, type RangeeAgee, type TiersEcheancierReponse, type TypeTiers,
} from '../echeancier';
import { bouton, inp, lbl, pastille, petit } from '../styles';

// « Échéancier » (LabFlow Compta, étape S7a ; labflow-reprise/achats-compta/PLAN-S7.md §2 « S7a », §4 « Échéance »,
// « Relevé et relance » ; réponses du client du 09/10 — « ok pour les 9 » : relevé de compte et lettre de relance en PDF,
// envoyés par le comptable lui-même) : onglets Fournisseurs / Clients ; la balance âgée (par tiers, le dû non lettré et sa
// répartition : non échu, 1 à 30, 31 à 60, 61 à 90, plus de 90 jours, au jour de la lecture) ; un tiers déplié montre ses
// lignes (échéance, retard) avec « Relevé de compte (PDF) », « Lettre de relance (PDF) » (client qui a de l'échu, texte
// modifiable dans une fenêtre) et le lien vers son lettrage ; « Exporter (Excel) ». Brouillard compris par défaut,
// retirable. Le serveur calcule ; l'écran choisit et montre. Lecture pour tout accès au dossier ; rien ne s'y écrit.
type Role = 'titulaire' | 'gerant';
const mono = 'ui-monospace, monospace';
const pluriel = (n: number, un: string, des: string) => `${n} ${n > 1 ? des : un}`;
const signeTexte = (t: string) => fmtMontant(signe(t));
const cellMontant = (t: string) => (nonNul(t) ? signeTexte(t) : '');
const montant = (v: string) => ((versMillimes(v) ?? 0n) !== 0n ? fmtMontant(v) : '');
const estType = (v: string | null): v is TypeTiers => v === 'fournisseur' || v === 'client';
type Detail = { cle: string; valeur: TiersEcheancierReponse } | 'lecture' | { cle: string; erreur: string };
// Un dû signé dit en clair (relecture : « dû -500,000 » se lisait mal) : « 1 190,000 », « 500,000 en votre faveur », « soldé ».
const texteDu = (t: string) => { const n = signe(t); return n === 0n ? 'soldé' : n > 0n ? fmtMontant(n) : `${fmtMontant(-n)} en votre faveur`; };

// Une page par dossier : changer de dossier (navigation directe) repart d'un état neuf.
export default function ComptaEcheancierPage() {
  const { dossierId } = useParams();
  return <ComptaEcheancier key={dossierId} dossierId={dossierId} />;
}

function ComptaEcheancier({ dossierId }: { dossierId?: string }) {
  const [parametres, setParametres] = useSearchParams();
  const [type, setType] = useState<TypeTiers>(() => { const v = parametres.get('type'); return estType(v) ? v : 'fournisseur'; });
  const [brouillard, setBrouillard] = useState(true);
  const cle = `${type}|${brouillard ? 1 : 0}`;
  const [lecture, setLecture] = useState<{ cle: string; valeur: EcheancierReponse } | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'erreur'>('chargement');
  const [erreurLecture, setErreurLecture] = useState<{ cle: string; message: string } | null>(null);
  const [essai, setEssai] = useState(0);
  const [details, setDetails] = useState<Map<number, Detail>>(() => new Map());
  const [info, setInfo] = useState('');
  const [erreur, setErreur] = useState('');
  // L'action en cours (« export », « releve-<tiers> », « relance ») : un seul téléchargement à la fois.
  const [action, setAction] = useState('');
  const occupe = action !== '';
  const occupeRef = useRef(false);
  // La relance en cours de rédaction : le tiers et son texte (le texte type d'abord) ; son refus s'affiche dans la fenêtre.
  const [relance, setRelance] = useState<{ tiers: { id: number; code: string; nom: string }; texte: string; erreur: string } | null>(null);
  const tour = useRef(0);
  // Les lectures d'un tiers déplié, numérotées par tiers (relecture de S7a : une réponse ancienne n'écrase jamais la
  // dernière) ; rien n'est écrit après le départ de la page.
  const tourDetail = useRef(new Map<number, number>());
  const monte = useRef(true);
  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);

  // La balance âgée de l'onglet, relue à chaque changement d'onglet ou de « Brouillard compris » (et « Réessayer »).
  const charger = useCallback((c: string, t: TypeTiers, b: boolean) => {
    const moi = ++tour.current;
    lireEcheancier(dossierId || '', t, b)
      .then((r) => { if (moi === tour.current) { setLecture({ cle: c, valeur: r }); setEtat('pret'); setErreurLecture(null); } })
      .catch((err) => {
        if (moi !== tour.current) return;
        const s = statutDe(err);
        if (s === 404) setEtat('introuvable');
        else setErreurLecture({ cle: c, message: messageDossier(err, 'Lecture impossible, réessayez.') });
      });
  }, [dossierId]);
  useEffect(() => { charger(cle, type, brouillard); return () => { tour.current += 1; }; }, [charger, cle, type, brouillard, essai]);

  const e = lecture && lecture.cle === cle ? lecture.valeur : null;
  const page = e || lecture?.valeur || null;
  const erreurCourante = erreurLecture && erreurLecture.cle === cle ? erreurLecture.message : '';
  const role: Role = page?.dossier.espace.role || 'titulaire';
  const changerType = (t: TypeTiers) => { setType(t); setDetails(new Map()); setInfo(''); setErreur(''); setParametres({ type: t }, { replace: true }); };
  const changerBrouillard = (b: boolean) => { setBrouillard(b); setDetails(new Map()); setInfo(''); setErreur(''); };
  const reessayer = () => { setErreurLecture(null); setEssai((n) => n + 1); };

  // Un tiers déplié : ses lignes, lues à la demande pour la sélection en cours (clé gardée avec la réponse ou le refus).
  const lireDetail = (id: number) => {
    if (!page) return;
    const c = cle;
    const moi = (tourDetail.current.get(id) ?? 0) + 1;
    tourDetail.current.set(id, moi);
    const derniere = () => monte.current && tourDetail.current.get(id) === moi;
    setDetails((m) => { const n = new Map(m); n.set(id, 'lecture'); return n; });
    lireTiersEcheancier(page.dossier.id, id, brouillard)
      .then((r) => { if (derniere()) setDetails((m) => { const n = new Map(m); if (n.has(id)) n.set(id, { cle: c, valeur: r }); return n; }); })
      .catch((err) => { if (derniere()) setDetails((m) => { const n = new Map(m); if (n.has(id)) n.set(id, { cle: c, erreur: messageDossier(err, 'Lecture impossible, réessayez.') }); return n; }); });
  };
  const basculer = (id: number) => {
    if (details.has(id)) {
      tourDetail.current.set(id, (tourDetail.current.get(id) ?? 0) + 1);
      setDetails((m) => { const n = new Map(m); n.delete(id); return n; });
      return;
    }
    lireDetail(id);
  };
  // Un téléchargement : → null s'il a réussi, sinon le refus (message relu du blob, statut) ; un refus sur un état périmé
  // (404, 409 : lignes lettrées entre-temps…) relit la balance et replie les tiers (convention de S3c).
  const agir = async (nom: string, travail: () => Promise<void>, defaut: string): Promise<{ message: string; statut?: number } | null> => {
    if (occupeRef.current) return { message: '' };
    occupeRef.current = true;
    setAction(nom);
    setErreur('');
    setInfo('');
    try {
      await travail();
      return null;
    } catch (err) {
      const statut = statutDe(err);
      const message = await messageTelechargement(err, defaut, role);
      if (monte.current && (statut === 404 || statut === 409)) { setDetails(new Map()); reessayer(); }
      return { message, statut };
    } finally {
      occupeRef.current = false;
      if (monte.current) setAction('');
    }
  };
  const exporter = async () => {
    if (!page) return;
    const refus = await agir('export', async () => { await telechargerEcheancier(page.dossier.id, type, brouillard); setInfo('Échéancier exporté (Excel : balance âgée et détail).'); }, 'Export impossible, réessayez.');
    if (refus?.message && monte.current) setErreur(refus.message);
  };
  const releve = async (t: { id: number; code: string }) => {
    if (!page) return;
    const refus = await agir(`releve-${t.id}`, async () => { await telechargerReleve(page.dossier.id, t, brouillard); setInfo(`Relevé de compte de ${t.code} téléchargé (PDF).`); }, 'Le relevé n\'a pas pu être produit, réessayez.');
    if (refus?.message && monte.current) setErreur(refus.message);
  };
  const imprimerRelance = async () => {
    if (!page || !relance) return;
    const texte = relance.texte.trim();
    const garde = !texte ? 'Le texte de la lettre est vide.'
      : texte.length > page.bornes.texteRelanceMax ? `${page.bornes.texteRelanceMax} caractères au plus.`
        : texte.split('\n').length > RELANCE_LIGNES_MAX ? `${RELANCE_LIGNES_MAX} lignes au plus.`
          : texteIllisible(texte) ? 'Caractères latins seulement : les lettres arabes et les émojis ne s\'impriment pas sur le PDF.' : '';
    if (garde) { setRelance({ ...relance, erreur: garde }); return; }
    const t = relance.tiers;
    // Le texte type n'a pas besoin de voyager : le serveur le connaît.
    const refus = await agir('relance', async () => { await telechargerRelance(page.dossier.id, t, brouillard, texte === page.texteRelance ? '' : texte); setInfo(`Lettre de relance de ${t.code} téléchargée (PDF) : à envoyer par vos soins.`); }, 'La relance n\'a pas pu être produite, réessayez.');
    if (!monte.current) return;
    // Le refus se lit DANS la fenêtre (relecture de S7a) ; un état périmé (rien d'échu désormais) ferme la fenêtre et le dit.
    if (!refus) setRelance(null);
    else if (refus.statut === 404 || refus.statut === 409) { setRelance(null); setErreur(refus.message); }
    else if (refus.message) setRelance((r) => (r ? { ...r, erreur: refus.message } : r));
  };

  const retour = page ? { lien: `/dossiers/${page.dossier.id}`, libelle: page.dossier.nom } : null;
  const onglet = ONGLETS.find((o) => o.valeur === type) || ONGLETS[0];
  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #7c3aed 100%)', borderRadius: 18, padding: '24px 28px',
        marginBottom: 24, boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          {retour && <Link to={retour.lien} style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none' }}>← {retour.libelle}</Link>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📅</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Échéancier</h1>
            {page?.dossier.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Dossier archivé</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {e ? `${onglet.libelle} au ${fmtJour(e.au)} · ${pluriel(e.totaux.nbTiers, 'tiers', 'tiers')} · dû ${texteDu(e.totaux.total)}${signe(e.totaux.echu) > 0n ? ` dont échu ${signeTexte(e.totaux.echu)}` : ''}` : 'Ce que vous devez et ce qu\'on vous doit, échéance par échéance (lignes non lettrées)'}
          </p>
        </div>
        <BoutonAide section="compta-lettrage" />
      </div>

      {etat === 'chargement' && !erreurCourante && <div className="loading-text">Chargement…</div>}
      {etat === 'introuvable' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '22px 24px', maxWidth: 640 }}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Ce dossier n'existe pas ou ne vous est pas ouvert</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
            Il a peut-être été supprimé, ou son accès vous a été retiré. <Link to="/" style={{ color: '#4338ca', fontWeight: 700 }}>Retour à vos comptabilités</Link>
          </p>
        </div>
      )}
      {erreurCourante && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <span>{erreurCourante}</span>
          <button type="button" onClick={reessayer} style={bouton('#b91c1c', '#fff', '#b91c1c')}>Réessayer</button>
        </div>
      )}

      {page && etat !== 'introuvable' && (
        <>
          {page.etatAbonnement !== 'actif' && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {texteEtatAbonnement(page.etatAbonnement, role)} : l'échéancier reste consultable.
            </div>
          )}

          {/* Les onglets */}
          <div role="tablist" aria-label="Échéancier" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {ONGLETS.map((o) => (
              <button key={o.valeur} type="button" role="tab" aria-selected={type === o.valeur} onClick={() => changerType(o.valeur)}
                style={bouton(type === o.valeur ? '#1e1b4b' : '#fff', type === o.valeur ? '#fff' : '#334155', type === o.valeur ? '#1e1b4b' : '#cbd5e1')}>
                {o.icone} {o.libelle}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#334155', fontWeight: 600, cursor: 'pointer' }}>
              <input type="checkbox" checked={brouillard} onChange={(ev) => changerBrouillard(ev.target.checked)} />
              Brouillard compris
            </label>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{onglet.sens.charAt(0).toUpperCase()}{onglet.sens.slice(1)} · lignes non lettrées · au jour de la lecture</span>
            <span style={{ flex: '1 1 10px' }} />
            <Link to={`/dossiers/${page.dossier.id}/lettrage`} style={{ ...petit('#fff', '#4338ca', '#c7d2fe'), textDecoration: 'none' }}>🔗 Lettrage</Link>
            <button type="button" onClick={exporter} disabled={occupe || !e} style={petit('#f0fdf4', '#166534', '#bbf7d0')}>{action === 'export' ? 'Export…' : '📥 Exporter (Excel)'}</button>
          </div>
          {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}

          <div style={cadre}>
            <div style={enTeteCadre}>
              <span role="status" aria-live="polite" style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>
                {e ? `Balance âgée — ${onglet.libelle.toLowerCase()} · ${pluriel(e.totaux.nbLignes, 'ligne non lettrée', 'lignes non lettrées')}${e.totaux.nbBrouillard ? ` dont ${e.totaux.nbBrouillard} en brouillard` : ''}` : erreurCourante ? 'Lecture impossible' : 'Lecture…'}
              </span>
              <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Retard au {e ? fmtJour(e.au) : '…'} · dépliez un tiers pour ses lignes, son relevé et sa relance</span>
            </div>
            {e && e.rangees.length === 0 && <p style={{ margin: 0, padding: '16px 18px', fontSize: '0.84rem', color: '#64748b' }}>Aucune ligne non lettrée : rien à payer ni à encaisser{brouillard ? '' : ' (écritures validées)'}.</p>}
            {e && e.rangees.length > 0 && (
              <div style={{ overflowX: 'auto', position: 'relative' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 860 }}>
                  <thead>
                    <tr style={{ color: '#64748b', textAlign: 'left' }}>
                      <th style={cellule}>Tiers</th>
                      {e.tranches.map((x) => <th key={x.cle} style={{ ...cellule, textAlign: 'right', color: x.cle === 'nonEchu' ? '#64748b' : '#b45309' }}>{x.libelle}</th>)}
                      <th style={{ ...cellule, textAlign: 'right' }}>Total dû</th><th style={cellule}><span style={cache}>Brouillard</span></th>
                    </tr>
                  </thead>
                  {e.rangees.map((r) => <RangeeTiers key={r.tiers.id} r={r} e={e} detail={details.get(r.tiers.id)} cle={cle} basculer={basculer} relire={lireDetail} occupe={occupe} action={action}
                    releve={(t) => { void releve(t); }} relancer={(t) => setRelance({ tiers: t, texte: e.texteRelance, erreur: '' })} dossierId={page.dossier.id} />)}
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #c7d2fe', fontWeight: 800, background: '#f8faff' }}>
                      <td style={cellule}>Total ({pluriel(e.totaux.nbTiers, 'tiers', 'tiers')})</td>
                      {e.tranches.map((x) => <td key={x.cle} style={nombre}>{signeTexte(e.totaux.tranches[x.cle])}</td>)}
                      <td style={nombre}>{signeTexte(e.totaux.total)}</td><td style={cellule}>{e.totaux.nbBrouillard ? <span style={pastille('#fef3c7', '#92400e')}>{e.totaux.nbBrouillard} en brouillard</span> : null}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
            L'échéance d'une ligne est celle saisie sur la ligne ; à défaut, la date de la pièce plus le délai de paiement du tiers. Un règlement ou un avoir non lettré s'impute sur les échéances les plus anciennes : la part échue ne dépasse jamais ce qui reste dû. Lettrez au fil des règlements (page Lettrage) : l'échéancier ne montre que le non lettré. LabFlow Compta n'envoie rien : le relevé et la relance se téléchargent, vous les envoyez.
          </p>
        </>
      )}

      {relance && page && (
        <Modale titre={`Lettre de relance — ${relance.tiers.code}`} sousTitre={`${relance.tiers.nom} · lignes échues au ${fmtJour(page.au)} · PDF à envoyer par vos soins`}
          onClose={() => { if (!occupe) setRelance(null); }} onSubmit={imprimerRelance} envoi={occupe} erreur={relance.erreur || null} libelleEnvoi="📄 Télécharger (PDF)" libelleAttente="Préparation du PDF…" large>
          <label htmlFor="relance-texte" style={lbl}>Texte de la lettre</label>
          <textarea id="relance-texte" value={relance.texte} onChange={(ev) => setRelance({ ...relance, texte: ev.target.value, erreur: '' })} rows={12} maxLength={page.bornes.texteRelanceMax}
            style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 6, fontSize: '0.72rem', color: '#6b7280' }}>
            <span>La lettre ajoute l'en-tête (votre dossier, le client, le lieu et la date), l'objet, le tableau des lignes échues, le montant échu et le reste dû.</span>
            <span>{relance.texte.length} / {page.bornes.texteRelanceMax}</span>
          </div>
          {relance.texte !== page.texteRelance && <button type="button" onClick={() => setRelance({ ...relance, texte: page.texteRelance, erreur: '' })} style={{ ...petit('#fff', '#475569', '#cbd5e1'), marginTop: 10 }}>Revenir au texte type</button>}
        </Modale>
      )}
    </div>
  );
}

// Une rangée de la balance âgée (un tiers) et, dépliée, ses lignes et ses documents.
function RangeeTiers({ r, e, detail, cle, basculer, relire, occupe, action, releve, relancer, dossierId }: {
  r: RangeeAgee; e: EcheancierReponse; detail: Detail | undefined; cle: string; basculer: (id: number) => void; relire: (id: number) => void; occupe: boolean; action: string;
  releve: (t: { id: number; code: string }) => void; relancer: (t: { id: number; code: string; nom: string }) => void; dossierId: number;
}) {
  const ouvert = !!detail;
  const d = detail && detail !== 'lecture' && 'valeur' in detail && detail.cle === cle ? detail.valeur : null;
  const echu = signe(r.echu) > 0n;
  return (
    <tbody>
      <tr style={{ borderTop: '1px solid #f1f5f9', background: ouvert ? '#f8faff' : '#fff' }}>
        <td style={cellule}>
          <button type="button" onClick={() => basculer(r.tiers.id)} aria-expanded={ouvert} aria-controls={`echeances-${r.tiers.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', padding: 0, textAlign: 'left' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.7rem', width: 10 }}>{ouvert ? '▾' : '▸'}</span>
            <span style={{ fontFamily: mono, fontWeight: 800, color: '#1e1b4b' }}>{r.tiers.code}</span>
            <span style={{ color: '#0f172a', overflowWrap: 'anywhere' }}>{r.tiers.nom}</span>
            {!r.tiers.actif && <span style={pastille('#f1f5f9', '#64748b')}>Désactivé</span>}
          </button>
        </td>
        {e.tranches.map((x) => <td key={x.cle} style={{ ...nombre, color: x.cle !== 'nonEchu' && signe(r.tranches[x.cle]) > 0n ? '#b45309' : '#0f172a' }}>{cellMontant(r.tranches[x.cle as CleTranche])}</td>)}
        <td style={{ ...nombre, fontWeight: 800 }}>{signeTexte(r.total)}</td>
        <td style={cellule}>{r.nbBrouillard ? <span style={pastille('#fef3c7', '#92400e')} title={`${pluriel(r.nbBrouillard, 'ligne en brouillard comprise', 'lignes en brouillard comprises')}`}>{r.nbBrouillard} en brouillard</span> : null}</td>
      </tr>
      {ouvert && (
        <tr>
          <td colSpan={e.tranches.length + 3} id={`echeances-${r.tiers.id}`} style={{ padding: '4px 18px 14px 30px', background: '#f8faff' }}>
            {detail === 'lecture' && <div style={{ fontSize: '0.8rem', color: '#64748b', padding: '6px 0' }}>Lecture des lignes…</div>}
            {detail && detail !== 'lecture' && 'erreur' in detail && detail.cle === cle && <div role="alert" style={{ fontSize: '0.8rem', color: '#b91c1c', padding: '6px 0' }}>{detail.erreur} <button type="button" onClick={() => relire(r.tiers.id)} style={lien}>Réessayer</button></div>}
            {d && (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 8px' }}>
                  <button type="button" onClick={() => releve(d.tiers)} disabled={occupe} aria-label={`Relevé de compte de ${d.tiers.code} (PDF)`} style={petit('#f0f9ff', '#0369a1', '#bae6fd')}>{action === `releve-${d.tiers.id}` ? 'Préparation…' : '📄 Relevé de compte (PDF)'}</button>
                  {d.tiers.type === 'client' && <button type="button" onClick={() => relancer(d.tiers)} disabled={occupe || !echu} aria-label={`Lettre de relance de ${d.tiers.code} (PDF)`} title={echu ? 'Rédiger la lettre de relance' : 'Aucun montant échu : rien à relancer'} style={{ ...petit('#fff7ed', '#c2410c', '#fed7aa'), opacity: echu ? 1 : 0.5 }}>✉️ Lettre de relance (PDF)</button>}
                  <Link to={`/dossiers/${dossierId}/lettrage?tiers=${d.tiers.id}`} aria-label={`Lettrage de ${d.tiers.code}`} style={{ ...petit('#fff', '#4338ca', '#c7d2fe'), textDecoration: 'none' }}>🔗 Lettrage</Link>
                  <span style={{ fontSize: '0.76rem', color: '#64748b', alignSelf: 'center' }}>Délai de paiement : {d.tiers.delaiPaiement ? `${d.tiers.delaiPaiement} jours` : 'comptant'}{d.tiers.ville ? ` · ${d.tiers.ville}` : ''}</span>
                </div>
                <div style={{ overflowX: 'auto', position: 'relative' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: 720 }}>
                    <thead>
                      <tr style={{ color: '#64748b', textAlign: 'left' }}>
                        <th style={cellule}>Date</th><th style={cellule}>Numéro</th><th style={cellule}>Pièce</th><th style={cellule}>Libellé</th><th style={cellule}>Échéance</th><th style={{ ...cellule, textAlign: 'right' }}>Retard</th>
                        <th style={{ ...cellule, textAlign: 'right' }}>Débit</th><th style={{ ...cellule, textAlign: 'right' }}>Crédit</th><th style={cellule}>État</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.lignes.map((l) => (
                        <tr key={l.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                          <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{fmtJour(l.date)}</td>
                          <td style={{ ...cellule, fontFamily: mono, fontWeight: 700, whiteSpace: 'nowrap' }}>{l.ecriture.numero || l.ecriture.numeroProvisoire}</td>
                          <td style={{ ...cellule, fontFamily: mono, color: '#64748b', whiteSpace: 'nowrap' }}>{l.ecriture.reference}</td>
                          <td style={{ ...cellule, minWidth: 140 }}>{l.libelle}</td>
                          <td style={{ ...cellule, whiteSpace: 'nowrap' }} title={!l.tranche ? 'Règlement ou avoir : imputé sur les échéances les plus anciennes' : l.echeanceSaisie ? 'Échéance saisie sur la ligne' : 'Date de la pièce + délai du tiers'}>{l.tranche ? <>{fmtJour(l.echeance)}{l.echeanceSaisie ? '' : <span style={{ color: '#94a3b8' }}> *</span>}</> : <span style={{ color: '#64748b', fontStyle: 'italic' }}>à imputer</span>}</td>
                          <td style={{ ...nombre, color: enRetard(l) ? '#b91c1c' : '#64748b', fontWeight: enRetard(l) ? 700 : 400 }}>{enRetard(l) ? `${l.retard} j` : ''}</td>
                          <td style={nombre}>{montant(l.debit)}</td><td style={nombre}>{montant(l.credit)}</td>
                          <td style={cellule}><span style={pastille(l.ecriture.etat === 'validee' ? '#dcfce7' : '#fef3c7', l.ecriture.etat === 'validee' ? '#166534' : '#92400e')}>{LIBELLES_ETAT[l.ecriture.etat]}</span></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid #c7d2fe', fontWeight: 800 }}>
                        <td style={cellule} colSpan={6}>Dû {texteDu(d.totaux.du)}{signe(d.totaux.echu) > 0n ? ` · échu ${signeTexte(d.totaux.echu)}` : ''}{d.total > d.lignes.length ? ` · ${d.lignes.length} lignes affichées sur ${d.total} (export pour toutes)` : ''}</td>
                        <td style={nombre}>{fmtMontant(d.totaux.debit)}</td><td style={nombre}>{fmtMontant(d.totaux.credit)}</td><td style={cellule} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>* échéance calculée (date de la pièce + délai de paiement du tiers). « À imputer » : un règlement ou un avoir non lettré, déduit des échéances les plus anciennes.</div>
              </>
            )}
          </td>
        </tr>
      )}
    </tbody>
  );
}

// Le message d'un refus de téléchargement : la réponse est un blob, son JSON est relu.
async function messageTelechargement(err: unknown, defaut: string, role: Role) {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const corps = JSON.parse(await data.text()) as { message?: string; code?: string };
      return messageDossier({ response: { data: corps } }, defaut, role);
    } catch {
      return defaut;
    }
  }
  return messageDossier(err, defaut, role);
}

const cadre: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const enTeteCadre: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', background: 'linear-gradient(135deg,#f8faff,#eef2ff)', flexWrap: 'wrap' };
const cellule: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };
const nombre: React.CSSProperties = { ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
const lien: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: '#4338ca', fontWeight: 700, fontSize: '0.74rem', padding: '2px 4px', fontFamily: 'inherit' };
// Texte lu par les lecteurs d'écran, invisible (en-tête de la colonne des pastilles).
const cache: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };
