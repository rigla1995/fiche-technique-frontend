import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useConfirm } from '../../components/common/ConfirmDialog';
import BoutonAide from '../BoutonAide';
import { Modale } from '../DossierFormulaires';
import { messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import { ajouterJours, aujourdhui as aujourdhuiTunis, fmtJour, fmtMontant } from '../ecritures';
import { signe } from '../echeancier';
import { deMois, fmtTaux, libelleMois } from '../taxesMois';
import {
  RAISONS_LIQUIDATION, demarquerDeclaration, lireDeclaration, marquerDeclaration, preparerDeclaration, proposerEcritureTva, telechargerDeclarationExcel, telechargerDeclarationPdf,
  type DeclarationReponse,
} from '../declaration';
import { bouton, inp, lbl, pastille, petit } from '../styles';

// « Déclaration mensuelle » (LabFlow Compta, étape S7c ; labflow-reprise/achats-compta/PLAN-S7.md §2 « S7c », §4 ; réponses
// du client du 09/10 — « ok pour les 9 » : état préparatoire à recopier sur impots.finances.gov.tn, salaires saisis à la
// main, écriture de liquidation de la TVA proposée ; question 7 : pas de vente à l'export pour l'instant) : pour une
// période, les lignes de la déclaration (TVA à payer, retenues à la source par nature, retenues de TVA, avances, timbre,
// FODEC, TCL, lignes saisies à la main) et le total à payer, l'échéance ; préparer (montants à la main, TCL corrigée) ;
// l'écriture de liquidation (aperçu, proposer) ; marquer comme déclarée (avec l'écart et les lignes déclarées si les
// montants ont changé depuis), retirer la marque ; la TVA, les retenues par nature, l'historique de l'exercice, les
// signalements ; PDF et Excel. Écritures validées seulement. Le titulaire et le niveau Complet écrivent ; tout le monde
// lit. Le serveur calcule et décide ; après chaque écriture la page se relit, rien ne se clique tant que la lecture n'est
// pas à jour, et rien ne part (marquer, proposer, imprimer, exporter, changer de mois) tant qu'une saisie à la main n'est
// pas enregistrée (relecture de S7c).
type Zone = 'haut' | 'declaration' | 'saisies' | 'ecriture';
type Refus = { message: string; statut?: number };
type Brouillon = { cle: string; valeurs: Record<string, string>; tcl: string };
const mono = 'ui-monospace, monospace';
const montant = (v: string) => fmtMontant(signe(v));
const nonNul = (v: string) => signe(v) !== 0n;
const RE_MONTANT = /^\d{1,15}([.,]\d{1,3})?$/;
const nettoye = (v: string) => v.replace(/\s/g, '');
const enSaisie = (t: string | null | undefined) => (t != null ? t.replace('.', ',') : '');
const codeDe = (err: unknown) => (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
const PERSONNES: Record<string, string> = { physique: 'personne physique', morale: 'personne morale' };

// Une page par dossier : changer de dossier (navigation directe) repart d'un état neuf.
export default function ComptaDeclarationPage() {
  const { dossierId } = useParams();
  return <ComptaDeclaration key={dossierId} dossierId={dossierId} />;
}

function ComptaDeclaration({ dossierId }: { dossierId?: string }) {
  const { confirm } = useConfirm();
  const [parametres, setParametres] = useSearchParams();
  const [periodeId, setPeriodeId] = useState<number | null>(() => { const v = Number(parametres.get('periode')); return Number.isInteger(v) && v > 0 ? v : null; });
  const cle = `${periodeId ?? ''}`;
  // La dernière lecture, avec la période et le numéro de relecture qu'elle sert : la page est « à jour » seulement quand
  // les deux correspondent (après une écriture, l'ancienne lecture reste affichée mais figée).
  const [lecture, setLecture] = useState<{ cle: string; essai: number; valeur: DeclarationReponse } | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'sansExercice'>('chargement');
  const [erreurLecture, setErreurLecture] = useState<{ cle: string; message: string } | null>(null);
  const [avis, setAvis] = useState('');
  const [essai, setEssai] = useState(0);
  const [message, setMessage] = useState<{ type: 'info' | 'erreur'; texte: string; zone: Zone } | null>(null);
  const [action, setAction] = useState('');
  const occupe = action !== '';
  const occupeRef = useRef(false);
  const [marque, setMarque] = useState<{ date: string; erreur: string } | null>(null);
  // La saisie à la main en cours, attachée au CONTENU enregistré qu'elle modifie (période, montants, TCL) : une relecture
  // qui ne touche pas aux montants (écriture proposée…) la garde ; un enregistrement la remplace.
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [fausses, setFausses] = useState<Set<string>>(() => new Set());
  const tour = useRef(0);
  const monte = useRef(true);
  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);

  const charger = useCallback((c: string, p: number | null, n: number) => {
    const moi = ++tour.current;
    lireDeclaration(dossierId || '', p)
      .then((r) => { if (moi === tour.current) { setLecture({ cle: c, essai: n, valeur: r }); setEtat('pret'); setErreurLecture(null); } })
      .catch((err) => {
        if (moi !== tour.current) return;
        const s = statutDe(err);
        // Une période inconnue (lien ancien) : la période par défaut à la place, et on le dit.
        if (s === 404 && p != null) { setAvis('La période demandée n\'existe pas dans ce dossier : voici la période par défaut.'); setPeriodeId(null); setParametres({}, { replace: true }); return; }
        if (s === 404) setEtat('introuvable');
        else if (s === 409 && codeDe(err) === 'EXERCICE_ABSENT') setEtat('sansExercice');
        else setErreurLecture({ cle: c, message: messageDossier(err, 'Lecture impossible, réessayez.') });
      });
  }, [dossierId, setParametres]);
  useEffect(() => { charger(cle, periodeId, essai); return () => { tour.current += 1; }; }, [charger, cle, periodeId, essai]);

  const e = lecture && lecture.cle === cle ? lecture.valeur : null;
  const page = e || lecture?.valeur || null;
  const aJour = !!e && lecture?.essai === essai;
  const fige = occupe || !aJour;
  const erreurCourante = erreurLecture && erreurLecture.cle === cle ? erreurLecture.message : '';
  const role = page?.dossier.espace.role || 'titulaire';
  const actif = !!page && page.dossier.etat === 'actif';
  const ouvert = !!page && page.etatAbonnement === 'actif';
  const peutEcrire = !!page && page.droits.configurer && actif && ouvert;
  const declaree = e?.declaration?.marque || null;

  // La saisie à la main : valeurs enregistrées, brouillon courant, modifications non enregistrées.
  const cleSaisies = e ? `${e.periode.id}|${JSON.stringify(e.saisies.map((s) => [s.cle, s.montant]))}|${e.declaration?.tcl ?? ''}` : '';
  const initiales: Record<string, string> = e ? Object.fromEntries(e.saisies.map((s) => [s.cle, enSaisie(s.montant)])) : {};
  const tclInitiale = enSaisie(e?.declaration?.tcl);
  const courant = brouillon && brouillon.cle === cleSaisies ? brouillon : null;
  const valeurs = courant ? courant.valeurs : initiales;
  const tclSaisie = courant ? courant.tcl : tclInitiale;
  const nonEnregistre = !!e && peutEcrire && !declaree && (e.saisies.some((s) => (valeurs[s.cle] || '') !== initiales[s.cle]) || tclSaisie !== tclInitiale);
  const poser = (partie: Partial<Omit<Brouillon, 'cle'>>) => {
    setFausses(new Set());
    setBrouillon({ cle: cleSaisies, valeurs: { ...valeurs, ...(partie.valeurs || {}) }, tcl: partie.tcl ?? tclSaisie });
  };

  const relire = () => { setErreurLecture(null); setEssai((n) => n + 1); };
  // Changer de mois : une saisie non enregistrée se confirme avant d'être abandonnée.
  const changerPeriode = async (id: number) => {
    if (nonEnregistre && !(await confirm({ title: 'Abandonner les montants non enregistrés ?', message: 'Les montants saisis à la main sur ce mois ne sont pas enregistrés : ils seront perdus.', tone: 'danger', confirmLabel: 'Abandonner', icon: '⚠️' }))) return;
    setBrouillon(null);
    setPeriodeId(id); setMessage(null); setAvis(''); setParametres({ periode: String(id) }, { replace: true });
  };

  // Une action : un geste à la fois ; le message s'affiche près de son bouton ; un refus sur un état périmé ou des droits
  // changés (403, 404, 409) relit la page. → null si l'action a réussi, sinon le refus.
  const agir = async (nom: string, zone: Zone, travail: () => Promise<string>, defaut: string): Promise<Refus | null> => {
    if (occupeRef.current) return { message: '' };
    occupeRef.current = true;
    setAction(nom);
    setMessage(null);
    try {
      const texte = await travail();
      if (monte.current) setMessage({ type: 'info', texte, zone });
      return null;
    } catch (err) {
      const statut = statutDe(err);
      const texte = await messageTelechargement(err, defaut, role);
      if (monte.current && statut && [403, 404, 409].includes(statut)) relire();
      return { message: texte, statut };
    } finally {
      occupeRef.current = false;
      if (monte.current) setAction('');
    }
  };
  const erreurDans = (zone: Zone, refus: Refus | null) => { if (refus?.message && monte.current) setMessage({ type: 'erreur', texte: refus.message, zone }); };

  const enregistrer = async () => {
    if (!e) return;
    const f = new Set([...e.saisies.filter((s) => nettoye(valeurs[s.cle] || '') && !RE_MONTANT.test(nettoye(valeurs[s.cle] || ''))).map((s) => s.cle), ...(nettoye(tclSaisie) && !RE_MONTANT.test(nettoye(tclSaisie)) ? ['tcl'] : [])]);
    if (f.size) {
      setFausses(f);
      setMessage({ type: 'erreur', texte: `Montant en dinars, 3 décimales au plus (ex. 1 190,500) : ${[...f].map((c) => (c === 'tcl' ? 'TCL' : e.saisies.find((s) => s.cle === c)?.libelle)).join(', ')}.`, zone: 'saisies' });
      return;
    }
    const corps = Object.fromEntries(e.saisies.map((s) => [s.cle, nettoye(valeurs[s.cle] || '')]));
    const refus = await agir('preparer', 'saisies', async () => { await preparerDeclaration(e.dossier.id, e.periode.id, corps, nettoye(tclSaisie)); return 'Montants enregistrés : le total est recalculé.'; }, 'Les montants n\'ont pas pu être enregistrés, réessayez.');
    if (!refus && monte.current) relire();
    erreurDans('saisies', refus);
  };
  const proposer = async () => {
    if (!e) return;
    const l = e.liquidation;
    const ok = await confirm({
      title: `Proposer l'écriture de TVA ${deMois(e.periode.fin)} ?`,
      message: `Une écriture en brouillard dans le journal des opérations diverses, datée du ${fmtJour(l.date)}${l.dateReelle ? ` (vraie date : ${fmtJour(l.dateReelle)}, la période étant close)` : ''}, de ${montant(l.total)} D au débit et au crédit.`,
      details: [
        ...l.lignes.map((x) => `${x.numero} — ${x.libelle} : ${nonNul(x.debit) ? `débit ${montant(x.debit)}` : `crédit ${montant(x.credit)}`}`),
        'Vérifiez-la puis validez-la sur la page Écritures ; tant qu\'elle est en brouillard, elle se supprime et se propose de nouveau.',
      ],
      tone: 'primary', confirmLabel: 'Proposer l\'écriture', icon: '🧮',
    });
    if (!ok) return;
    const refus = await agir('proposer', 'ecriture', async () => {
      const r = await proposerEcritureTva(e.dossier.id, e.periode.id);
      return `Écriture ${r.ecriture.numeroProvisoire} proposée en brouillard (${r.ecriture.reference}, ${montant(r.ecriture.total)} D) : vérifiez-la puis validez-la sur la page Écritures.`;
    }, 'L\'écriture n\'a pas pu être proposée, réessayez.');
    if (!refus && monte.current) relire();
    erreurDans('ecriture', refus);
  };
  // Marquer : le refus d'une saisie (date) reste dans la fenêtre ; un état périmé (409) la ferme et la page se relit.
  const marquer = async () => {
    if (!e || !marque) return;
    const d = marque.date;
    const jour = aujourdhuiTunis() > e.aujourdhui ? aujourdhuiTunis() : e.aujourdhui;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { setMarque({ ...marque, erreur: 'Indiquez la date du dépôt sur le portail.' }); return; }
    if (d > jour) { setMarque({ ...marque, erreur: 'La date du dépôt ne peut pas être après aujourd\'hui.' }); return; }
    if (d <= e.periode.fin) { setMarque({ ...marque, erreur: `La déclaration se dépose après la fin de la période (${fmtJour(e.periode.fin)}).` }); return; }
    const refus = await agir('marquer', 'declaration', async () => { const r = await marquerDeclaration(e.dossier.id, e.periode.id, d, e.total); return `Déclaration ${deMois(e.periode.fin)} marquée comme déposée le ${fmtJour(r.marque.date)} (total ${montant(r.marque.total)} D).`; }, 'La déclaration n\'a pas pu être marquée, réessayez.');
    if (!monte.current) return;
    if (!refus) { setMarque(null); relire(); return; }
    if (refus.statut === 404 || refus.statut === 409) { setMarque(null); erreurDans('declaration', refus); return; }
    if (refus.message) setMarque((m) => (m ? { ...m, erreur: refus.message } : m));
  };
  const demarquer = async () => {
    if (!e || !declaree) return;
    const ok = await confirm({
      title: 'Retirer la marque « déclarée » ?',
      message: `La déclaration ${deMois(e.periode.fin)} (déposée le ${fmtJour(declaree.date)}, total ${montant(declaree.total)} D) redevient modifiable ; l'état figé reste dans le journal.`,
      tone: 'danger', confirmLabel: 'Retirer la marque', icon: '↩️',
    });
    if (!ok) return;
    const refus = await agir('demarquer', 'declaration', async () => { await demarquerDeclaration(e.dossier.id, e.periode.id); return 'Marque retirée : la déclaration est de nouveau modifiable.'; }, 'La marque n\'a pas pu être retirée, réessayez.');
    if (!refus && monte.current) relire();
    erreurDans('declaration', refus);
  };
  const telecharger = (nom: string, travail: () => Promise<string>, defaut: string) => { void agir(nom, 'haut', travail, defaut).then((r) => erreurDans('haut', r)); };

  const retour = { lien: `/dossiers/${page?.dossier.id ?? dossierId}`, libelle: page?.dossier.nom ?? 'Fiche du dossier' };
  const msg = (zone: Zone) => (message && message.zone === zone ? <Message type={message.type} texte={message.texte} /> : null);
  const bloqueParSaisie = nonEnregistre ? 'Enregistrez d\'abord les montants saisis à la main (carte « Lignes saisies à la main »).' : '';
  // Les lignes déclarées (état figé au marquage), par clé : la colonne « Déclaré » quand les montants ont changé depuis.
  const declarees = new Map((declaree?.lignes || []).map((l) => [l.cle, l]));
  const montrerDeclare = !!declaree && !!e?.ecart;
  const lignesAffichees = e ? [...e.lignes, ...(montrerDeclare ? (declaree?.lignes || []).filter((l) => !e.lignes.some((x) => x.cle === l.cle)).map((l) => ({ ...l, montant: '0.000' })) : [])] : [];
  // La période de l'écriture de TVA (lien vers la page Écritures sur le bon mois).
  const periodeEcriture = e?.declaration?.ecriture ? page?.exercices.flatMap((x) => x.periodes).find((p) => e.declaration?.ecriture && e.declaration.ecriture.date >= p.debut && e.declaration.ecriture.date <= p.fin) : null;
  const alertes = e ? e.signalements.filter((s) => s.gravite !== 'info') : [];
  // L'écriture de TVA en vigueur (une contre-passée ne compte plus).
  const ecritureActive = e?.declaration?.ecriture && !e.declaration.ecriture.contrepassee ? e.declaration.ecriture : null;
  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #7c3aed 100%)', borderRadius: 18, padding: '24px 28px',
        marginBottom: 24, boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          <Link to={retour.lien} style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none' }}>← {retour.libelle}</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🗓️</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Déclaration mensuelle</h1>
            {page?.dossier.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Dossier archivé</span>}
            {declaree && <span style={pastille('#dcfce7', '#166534')}>Déclarée le {fmtJour(declaree.date)}</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {e ? `${libelleMois(e.periode.debut)} · total à payer ${montant(e.total)} D${e.echeance ? ` · échéance le ${fmtJour(e.echeance.date)}` : ''}` : 'État préparatoire à recopier sur le portail des impôts'}
          </p>
        </div>
        <BoutonAide section="compta-declaration" />
      </div>

      {etat === 'chargement' && !erreurCourante && <div className="loading-text">Chargement…</div>}
      {etat === 'introuvable' && (
        <div style={carteVide}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Ce dossier n'existe pas ou ne vous est pas ouvert</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>Il a peut-être été supprimé, ou son accès vous a été retiré. <Link to="/" style={lienTexte}>Retour à vos comptabilités</Link></p>
        </div>
      )}
      {etat === 'sansExercice' && (
        <div style={carteVide}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Aucun exercice dans ce dossier</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>La déclaration se prépare mois par mois sur l'exercice : ouvrez-en un depuis la <Link to={retour.lien} style={lienTexte}>fiche du dossier</Link>.</p>
        </div>
      )}
      {erreurCourante && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <span>{erreurCourante}</span>
          <button type="button" onClick={relire} style={bouton('#b91c1c', '#fff', '#b91c1c')}>Réessayer</button>
        </div>
      )}

      {page && etat === 'pret' && (
        <>
          {avis && <div role="status" style={{ ...alerte, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af', marginBottom: 16 }}>{avis}</div>}
          {!ouvert && <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>{texteEtatAbonnement(page.etatAbonnement, role)} : la page reste consultable ; rien ne se prépare ni ne se marque.</div>}
          {page.dossier.etat === 'archive' && ouvert && <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>Dossier archivé : rien ne s'écrit tant qu'il n'est pas désarchivé.</div>}
          {ouvert && actif && !page.droits.configurer && <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>Votre niveau d'accès permet de consulter, d'imprimer et d'exporter la déclaration ; le titulaire et les gérants de niveau Complet la préparent, proposent l'écriture de TVA et la marquent.</div>}

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ minWidth: 220 }}>
              <label htmlFor="dm-periode" style={lbl}>Période</label>
              <select id="dm-periode" value={periodeId ?? page.periode.id} onChange={(ev) => { void changerPeriode(Number(ev.target.value)); }} disabled={occupe} style={inp}>
                {page.exercices.map((x) => (
                  <optgroup key={x.id} label={`Exercice du ${fmtJour(x.debut)} au ${fmtJour(x.fin)}${x.etat === 'clos' ? ' (clos)' : ''}`}>
                    {x.periodes.map((p) => <option key={p.id} value={p.id}>{libelleMois(p.debut)}{p.etat === 'close' ? ' — close' : ''}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <span style={{ flex: '1 1 10px' }} />
            {e && !aJour && <span role="status" style={{ fontSize: '0.78rem', color: '#64748b', paddingBottom: 9 }}>Mise à jour…</span>}
            <button type="button" onClick={() => e && telecharger('pdf', async () => { await telechargerDeclarationPdf(e.dossier.id, e.periode.id, e.periode.debut.slice(0, 7)); return 'Déclaration téléchargée (PDF) : ouvrez-la pour l\'imprimer.'; }, 'Le PDF n\'a pas pu être produit, réessayez.')} disabled={fige || nonEnregistre} title={bloqueParSaisie || undefined} style={petit('#f0f9ff', '#0369a1', '#bae6fd')}>{action === 'pdf' ? 'Préparation…' : '📄 Imprimer (PDF)'}</button>
            <button type="button" onClick={() => e && telecharger('excel', async () => { await telechargerDeclarationExcel(e.dossier.id, e.periode.id, e.periode.debut.slice(0, 7)); return 'Déclaration téléchargée (Excel).'; }, 'Export impossible, réessayez.')} disabled={fige || nonEnregistre} title={bloqueParSaisie || undefined} style={petit('#f0fdf4', '#166534', '#bbf7d0')}>{action === 'excel' ? 'Export…' : '📥 Exporter (Excel)'}</button>
          </div>
          {msg('haut')}
          {!e && !erreurCourante && <div className="loading-text">Lecture…</div>}
          {e && nonEnregistre && <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 12 }}>Des montants saisis à la main ne sont pas enregistrés : enregistrez-les avant d'imprimer, d'exporter, de proposer l'écriture de TVA ou de marquer la déclaration.</div>}

          {e && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
              {/* Les lignes de la déclaration */}
              <section style={cadre} aria-labelledby="dm-lignes">
                <div style={enTeteCadre}>
                  <h2 id="dm-lignes" style={titreCadre}>Déclaration {deMois(e.periode.fin)} — à recopier sur impots.finances.gov.tn</h2>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Écritures validées · période {e.periode.etat === 'close' ? 'close' : 'ouverte'}{e.echeance ? ` · échéance le ${fmtJour(e.echeance.date)}${e.echeance.reportee ? ` (le ${fmtJour(e.echeance.legale)} tombe un week-end)` : ''}` : ''}</span>
                </div>
                <div style={{ overflowX: 'auto', position: 'relative' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ color: '#64748b', textAlign: 'left' }}>
                        <th style={cellule}>Ligne</th>
                        {montrerDeclare && <th style={{ ...cellule, textAlign: 'right' }}>Déclaré</th>}
                        <th style={{ ...cellule, textAlign: 'right' }}>{montrerDeclare ? 'Recalculé' : 'Montant (D)'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignesAffichees.map((l) => {
                        const d = declarees.get(l.cle);
                        const different = montrerDeclare && signe(d ? d.montant : '0') !== signe(l.montant);
                        return (
                          <tr key={l.cle} style={{ borderTop: '1px solid #f1f5f9', color: nonNul(l.montant) || (d && nonNul(d.montant)) ? '#0f172a' : '#94a3b8', background: different ? '#fffbeb' : undefined }}>
                            <td style={cellule}>
                              <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{l.rubrique}</span>
                              {l.libelle}{l.corrigee ? <span style={{ ...pastille('#fef3c7', '#92400e'), marginLeft: 6 }}>corrigé</span> : null}
                            </td>
                            {montrerDeclare && <td style={nombre}>{d ? montant(d.montant) : '—'}</td>}
                            <td style={{ ...nombre, fontWeight: different ? 800 : 400 }}>{montant(l.montant)}</td>
                          </tr>
                        );
                      })}
                      <tr style={{ borderTop: '2px solid #c7d2fe', background: '#f8faff' }}>
                        <td style={{ ...cellule, fontWeight: 800, color: '#1e1b4b' }}>Total à payer</td>
                        {montrerDeclare && <td style={{ ...nombre, fontWeight: 800 }}>{declaree ? montant(declaree.total) : ''}</td>}
                        <td style={{ ...nombre, fontWeight: 900, color: '#1e1b4b', fontSize: '0.92rem' }}>{montant(e.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {nonNul(e.tva.creditAReporter) && <p style={{ margin: 0, padding: '6px 18px', fontSize: '0.76rem', color: '#166534' }}>Crédit de TVA à reporter : {montant(e.tva.creditAReporter)} D (il passe au mois suivant ; il ne s'impute pas sur les autres impôts).</p>}
                {montrerDeclare && declaree && (
                  <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', margin: '10px 18px' }}>
                    Les montants ont changé depuis la déclaration du {fmtJour(declaree.date)} : déclaré {montant(declaree.total)} D, recalculé {montant(e.total)} D. Une déclaration rectificative peut être nécessaire (lignes surlignées).
                  </div>
                )}
                {msg('declaration')}
                <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#f8faff' }}>
                  {declaree
                    ? <span style={{ fontSize: '0.82rem', color: '#166534', fontWeight: 700 }}>✓ Déclarée le {fmtJour(declaree.date)}{declaree.par ? ` (marquée par ${declaree.par})` : ''} — total déclaré {montant(declaree.total)} D</span>
                    : <span style={{ fontSize: '0.8rem', color: '#475569' }}>{!e.finie ? `Le mois n'est pas fini : la déclaration se dépose à partir du ${fmtJour(ajouterJours(e.periode.fin, 1))}.` : peutEcrire ? 'Recopiez ces lignes sur le portail, payez, puis marquez la déclaration.' : 'Recopiez ces lignes sur le portail ; le titulaire ou un gérant de niveau Complet marque la déclaration.'}</span>}
                  <span style={{ flex: 1 }} />
                  {peutEcrire && !declaree && e.finie && <button type="button" onClick={() => setMarque({ date: e.aujourdhui, erreur: '' })} disabled={fige || nonEnregistre} title={bloqueParSaisie || undefined} style={bouton('linear-gradient(135deg,#4338ca,#6366f1)', '#fff', 'transparent')}>✓ Marquer comme déclarée</button>}
                  {peutEcrire && declaree && <button type="button" onClick={() => { void demarquer(); }} disabled={fige} style={petit('#fff', '#be123c', '#fecdd3')}>{action === 'demarquer' ? 'Retrait…' : 'Retirer la marque'}</button>}
                </div>
              </section>

              {/* Les lignes saisies à la main et la TCL */}
              <section style={cadre} aria-labelledby="dm-saisies">
                <div style={enTeteCadre}>
                  <h2 id="dm-saisies" style={titreCadre}>Lignes saisies à la main et TCL</h2>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Salaires et autres impôts sans écriture : à reprendre de la paie ou des pièces</span>
                </div>
                <form noValidate onSubmit={(ev) => { ev.preventDefault(); if (peutEcrire && !declaree && !fige && nonEnregistre) void enregistrer(); }} style={{ padding: '12px 18px', display: 'grid', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 10 }}>
                    {e.saisies.map((s) => (
                      <div key={s.cle}>
                        <label htmlFor={`dm-s-${s.cle}`} style={lbl}>{s.libelle}</label>
                        {peutEcrire && !declaree
                          ? <input id={`dm-s-${s.cle}`} value={valeurs[s.cle] || ''} onChange={(ev) => poser({ valeurs: { [s.cle]: ev.target.value } })} disabled={fige} inputMode="decimal" placeholder="0,000" aria-invalid={fausses.has(s.cle) || undefined} style={{ ...inp, fontFamily: mono, textAlign: 'right', ...(fausses.has(s.cle) ? { borderColor: '#dc2626' } : {}) }} />
                          : <input id={`dm-s-${s.cle}`} readOnly value={s.montant != null ? montant(s.montant) : '—'} style={{ ...inp, background: '#f8fafc', fontFamily: mono, textAlign: 'right' }} />}
                      </div>
                    ))}
                    {e.tcl && (
                      <div>
                        <label htmlFor="dm-tcl" style={lbl}>TCL — calculée {montant(e.tcl.montant)} D</label>
                        {peutEcrire && !declaree
                          ? <input id="dm-tcl" value={tclSaisie} onChange={(ev) => poser({ tcl: ev.target.value })} disabled={fige} inputMode="decimal" placeholder={`${montant(e.tcl.montant)} (calcul)`} aria-invalid={fausses.has('tcl') || undefined} aria-describedby="dm-tcl-aide" style={{ ...inp, fontFamily: mono, textAlign: 'right', ...(fausses.has('tcl') ? { borderColor: '#dc2626' } : {}) }} />
                          : <input id="dm-tcl" readOnly value={e.declaration?.tcl != null ? `${montant(e.declaration.tcl)} (corrigée)` : `${montant(e.tcl.montant)} (calcul)`} aria-describedby="dm-tcl-aide" style={{ ...inp, background: '#f8fafc', fontFamily: mono, textAlign: 'right' }} />}
                        <span id="dm-tcl-aide" style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginTop: 3 }}>{Number(e.tcl.taux).toLocaleString('fr-FR')} % de {montant(e.tcl.base)} D ({e.tcl.assiette === 'ttc' ? 'chiffre d\'affaires brut, TVA comprise' : 'chiffre d\'affaires hors taxes'}{e.tcl.exportateur ? ', exportateur total' : ''}){peutEcrire && !declaree ? ' ; vide : le calcul' : ''}.</span>
                      </div>
                    )}
                  </div>
                  {peutEcrire && !declaree && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.76rem', color: nonEnregistre ? '#92400e' : '#64748b' }}>
                        {fige && action === 'preparer' ? 'Mise à jour…' : nonEnregistre ? 'Modifications non enregistrées.' : e.declaration ? 'Montants enregistrés.' : 'Aucun montant saisi.'}{e.declaration?.modifiePar ? ` Dernière préparation par ${e.declaration.modifiePar}.` : ''}
                      </span>
                      <span style={{ flex: 1 }} />
                      {nonEnregistre && <button type="button" onClick={() => { setBrouillon(null); setFausses(new Set()); }} disabled={fige} style={petit('#fff', '#475569', '#cbd5e1')}>Annuler les modifications</button>}
                      <button type="submit" disabled={fige || !nonEnregistre} style={bouton('linear-gradient(135deg,#4338ca,#6366f1)', '#fff', 'transparent')}>{action === 'preparer' ? 'Enregistrement…' : '✓ Enregistrer'}</button>
                    </div>
                  )}
                  {peutEcrire && declaree && <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Déclaration marquée : retirez la marque pour modifier ces montants.</span>}
                </form>
                {msg('saisies')}
              </section>

              {/* L'écriture de liquidation */}
              <section style={cadre} aria-labelledby="dm-ecriture">
                <div style={enTeteCadre}>
                  <h2 id="dm-ecriture" style={titreCadre}>Écriture de TVA (liquidation {deMois(e.periode.fin)})</h2>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Proposée en brouillard, à valider sur la page Écritures — jamais passée seule</span>
                </div>
                {ecritureActive ? (
                  <p style={{ margin: 0, padding: '14px 18px', fontSize: '0.84rem', color: '#334155' }}>
                    Écriture <strong style={{ fontFamily: mono }}>{ecritureActive.numero || ecritureActive.numeroProvisoire}</strong> du {fmtJour(ecritureActive.date)}{ecritureActive.total ? ` (${montant(ecritureActive.total)} D)` : ''} — {ecritureActive.etat === 'validee' ? <span style={pastille('#dcfce7', '#166534')}>Validée</span> : <span style={pastille('#fef3c7', '#92400e')}>Brouillard : à vérifier puis valider</span>}{' '}
                    <Link to={`/dossiers/${e.dossier.id}/ecritures${periodeEcriture ? `?periode=${periodeEcriture.id}` : ''}`} style={lienTexte}>Page Écritures</Link>
                  </p>
                ) : (
                  <>
                    {e.declaration?.ecriture?.contrepassee && <p style={{ margin: 0, padding: '10px 18px 0', fontSize: '0.8rem', color: '#475569' }}>L'écriture {e.declaration.ecriture.numero || e.declaration.ecriture.numeroProvisoire} a été contre-passée : une nouvelle se propose.</p>}
                    {e.liquidation.lignes.length > 0 && (
                      <div style={{ overflowX: 'auto', position: 'relative' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 480 }}>
                          <thead><tr style={{ color: '#64748b', textAlign: 'left' }}><th style={cellule}>Compte</th><th style={cellule}>Libellé</th><th style={{ ...cellule, textAlign: 'right' }}>Débit</th><th style={{ ...cellule, textAlign: 'right' }}>Crédit</th></tr></thead>
                          <tbody>
                            {e.liquidation.lignes.map((x, i) => (
                              <tr key={`${x.compteId}-${i}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                                <td style={{ ...cellule, fontFamily: mono, fontWeight: 700 }}>{x.numero}</td><td style={cellule}>{x.libelle}</td>
                                <td style={nombre}>{nonNul(x.debit) ? montant(x.debit) : ''}</td><td style={nombre}>{nonNul(x.credit) ? montant(x.credit) : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#f8faff' }}>
                      <span style={{ fontSize: '0.8rem', color: e.liquidation.possible ? '#334155' : '#92400e' }}>
                        {e.liquidation.possible
                          ? `Datée du ${fmtJour(e.liquidation.date)}${e.liquidation.dateReelle ? ` avec sa vraie date (${fmtJour(e.liquidation.dateReelle)}) : la période est close` : ''} ; journal des opérations diverses.`
                          : e.liquidation.detail || (e.liquidation.raison ? RAISONS_LIQUIDATION[e.liquidation.raison] : '')}
                        {!e.liquidation.possible && e.liquidation.raison === 'BROUILLARD' && <> <Link to={`/dossiers/${e.dossier.id}/ecritures?periode=${e.periode.id}`} style={lienTexte}>Écritures du mois</Link></>}
                      </span>
                      <span style={{ flex: 1 }} />
                      {peutEcrire && e.liquidation.possible && <button type="button" onClick={() => { void proposer(); }} disabled={fige || nonEnregistre} title={bloqueParSaisie || undefined} style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>{action === 'proposer' ? 'Proposition…' : '🧮 Proposer l\'écriture de TVA'}</button>}
                    </div>
                  </>
                )}
                {msg('ecriture')}
              </section>

              {/* La TVA du mois */}
              <section style={cadre} aria-labelledby="dm-tva">
                <div style={enTeteCadre}>
                  <h2 id="dm-tva" style={titreCadre}>TVA {deMois(e.periode.fin)}</h2>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Écritures validées seulement — voir aussi la page <Link to={`/dossiers/${e.dossier.id}/taxes-mois?periode=${e.periode.id}&brouillard=0`} style={lienTexte}>Taxes du mois</Link> (sans le brouillard)</span>
                </div>
                {e.tva.codes.length === 0 && <p style={{ margin: 0, padding: '14px 18px 0', fontSize: '0.84rem', color: '#64748b' }}>Aucune ligne de TVA codée sur la période.</p>}
                {e.tva.codes.length > 0 && (
                  <div style={{ overflowX: 'auto', position: 'relative' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 700 }}>
                      <thead><tr style={{ color: '#64748b', textAlign: 'left' }}><th style={cellule}>Code</th><th style={cellule}>Libellé</th><th style={{ ...cellule, textAlign: 'right' }}>Taux</th><th style={{ ...cellule, textAlign: 'right' }}>Base ventes</th><th style={{ ...cellule, textAlign: 'right' }}>Collectée</th><th style={{ ...cellule, textAlign: 'right' }}>Base achats</th><th style={{ ...cellule, textAlign: 'right' }}>Déductible</th><th style={{ ...cellule, textAlign: 'right' }}>Immobilisations</th></tr></thead>
                      <tbody>
                        {e.tva.codes.map((c) => (
                          <tr key={c.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={{ ...cellule, fontFamily: mono, fontWeight: 700 }}>{c.code}</td><td style={cellule}>{c.libelle}</td><td style={nombre}>{fmtTaux(c.taux)}</td>
                            <td style={nombre}>{nonNul(c.baseVente) ? montant(c.baseVente) : ''}</td><td style={nombre}>{nonNul(c.collectee) ? montant(c.collectee) : ''}</td>
                            <td style={nombre}>{nonNul(c.baseAchat) ? montant(c.baseAchat) : ''}</td><td style={nombre}>{nonNul(c.deductible) ? montant(c.deductible) : ''}</td><td style={nombre}>{nonNul(c.deductibleImmo) ? montant(c.deductibleImmo) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ padding: '8px 18px 14px', display: 'grid', gap: 2, maxWidth: 520, marginLeft: 'auto' }}>
                  <Rangee libelle="TVA collectée" valeur={montant(e.tva.collectee)} />
                  <Rangee libelle="− TVA déductible sur biens et services" valeur={montant(e.tva.deductibleBs)} />
                  <Rangee libelle="− TVA déductible sur immobilisations" valeur={montant(e.tva.deductibleImmo)} />
                  {nonNul(e.tva.retenuesSubies) && <Rangee libelle="− Retenues de TVA subies" valeur={montant(e.tva.retenuesSubies)} />}
                  <Rangee libelle="− Crédit reporté" valeur={montant(e.tva.creditReporte)} />
                  <Rangee fort libelle={signe(e.tva.resultat) > 0n ? 'TVA à payer' : signe(e.tva.resultat) < 0n ? 'Crédit à reporter' : 'TVA nulle'} valeur={montant(signe(e.tva.resultat) > 0n ? e.tva.aPayer : e.tva.creditAReporter)} couleur={signe(e.tva.resultat) > 0n ? '#b45309' : '#166534'} />
                </div>
              </section>

              {/* Les retenues par nature */}
              <section style={cadre} aria-labelledby="dm-retenues">
                <div style={enTeteCadre}>
                  <h2 id="dm-retenues" style={titreCadre}>Retenues à la source par nature — paiements {deMois(e.periode.fin)}</h2>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Certificats produits et paiements encore à certifier (page <Link to={`/dossiers/${e.dossier.id}/taxes-mois?periode=${e.periode.id}&brouillard=0`} style={lienTexte}>Taxes du mois</Link>)</span>
                </div>
                {e.retenues.natures.length === 0 && e.retenues.tva.length === 0 && <p style={{ margin: 0, padding: '14px 18px', fontSize: '0.84rem', color: '#64748b' }}>Aucune retenue opérée sur les paiements de ce mois.</p>}
                {(e.retenues.natures.length > 0 || e.retenues.tva.length > 0) && (
                  <div style={{ overflowX: 'auto', position: 'relative' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 780 }}>
                      <thead><tr style={{ color: '#64748b', textAlign: 'left' }}><th style={cellule}>Code TEJ</th><th style={cellule}>Nature</th><th style={{ ...cellule, textAlign: 'right' }}>Taux</th><th style={{ ...cellule, textAlign: 'right' }}>Pièces</th><th style={{ ...cellule, textAlign: 'right' }}>Base</th><th style={{ ...cellule, textAlign: 'right' }}>Certifiée</th><th style={{ ...cellule, textAlign: 'right' }}>À certifier</th><th style={{ ...cellule, textAlign: 'right' }}>Sans certificat</th><th style={{ ...cellule, textAlign: 'right' }}>Retenue</th></tr></thead>
                      <tbody>
                        {e.retenues.natures.map((n) => (
                          <tr key={n.cle} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={{ ...cellule, fontFamily: mono }}>{n.codeTej || '—'}</td><td style={cellule}>{n.code} · {n.libelle}</td><td style={nombre}>{fmtTaux(n.taux)}</td><td style={nombre}>{n.nb}</td>
                            <td style={nombre}>{montant(n.base)}</td><td style={nombre}>{nonNul(n.certifie) ? montant(n.certifie) : ''}</td><td style={nombre}>{nonNul(n.aCertifier) ? montant(n.aCertifier) : ''}</td><td style={nombre}>{nonNul(n.nonCertifiable) ? montant(n.nonCertifiable) : ''}</td><td style={{ ...nombre, fontWeight: 700 }}>{montant(n.montant)}</td>
                          </tr>
                        ))}
                        {e.retenues.tva.map((x) => (
                          <tr key={x.code} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={{ ...cellule, fontFamily: mono }}>{x.code}</td><td style={cellule}>{x.libelle}</td><td style={cellule} /><td style={cellule} /><td style={cellule} /><td style={cellule} /><td style={cellule} /><td style={cellule} /><td style={{ ...nombre, fontWeight: 700 }}>{montant(x.montant)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {e.retenues.sansCertificat.length > 0 && <p style={{ margin: 0, padding: '6px 18px 4px', fontSize: '0.76rem', color: '#92400e' }}>⚠️ Comptées sans certificat possible sur la plateforme (certificat à établir à la main sur TEJ) : {e.retenues.sansCertificat.map((b) => `${b.reference} — ${b.message}`).join(' ; ')}</p>}
                {e.retenues.exclues.length > 0 && <p style={{ margin: 0, padding: '4px 18px 12px', fontSize: '0.76rem', color: '#b91c1c' }}>⛔ Non comptées : {e.retenues.exclues.map((b) => `${b.reference} — ${b.message}`).join(' ; ')}</p>}
              </section>

              {/* L'historique de l'exercice */}
              <section style={cadre} aria-labelledby="dm-historique">
                <div style={enTeteCadre}>
                  <h2 id="dm-historique" style={titreCadre}>Historique de l'exercice</h2>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Du {fmtJour(e.exercice.debut)} au {fmtJour(e.exercice.fin)}</span>
                </div>
                <div style={{ overflowX: 'auto', position: 'relative' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 620 }}>
                    <thead><tr style={{ color: '#64748b', textAlign: 'left' }}><th style={cellule}>Mois</th><th style={cellule}>Échéance</th><th style={cellule}>Déclaration</th><th style={{ ...cellule, textAlign: 'right' }}>Total déclaré</th><th style={cellule}>Écriture de TVA</th></tr></thead>
                    <tbody>
                      {e.historique.map((h) => {
                        const courant = h.periodeId === e.periode.id;
                        const enRetard = !h.marque && h.echeance && e.aujourdhui > h.echeance.date;
                        return (
                          <tr key={h.periodeId} style={{ borderTop: '1px solid #f1f5f9', background: courant ? '#eef2ff' : undefined }}>
                            <td style={cellule}>
                              {courant ? <strong>{libelleMois(h.debut)}</strong> : <button type="button" onClick={() => { void changerPeriode(h.periodeId); }} disabled={occupe} style={lien}>{libelleMois(h.debut)}</button>}
                              {h.etat === 'close' ? <span style={{ color: '#94a3b8' }}> · close</span> : null}
                            </td>
                            <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{h.echeance ? fmtJour(h.echeance.date) : '—'}</td>
                            <td style={cellule}>
                              {h.marque ? <span style={pastille('#dcfce7', '#166534')}>Déclarée le {fmtJour(h.marque.date)}</span>
                                : h.fin >= e.aujourdhui ? <span style={{ color: '#94a3b8' }}>mois en cours ou à venir</span>
                                  : enRetard ? <span style={pastille('#fee2e2', '#991b1b')}>Non marquée, échéance passée</span>
                                    : <span style={pastille('#fef3c7', '#92400e')}>À déclarer</span>}
                            </td>
                            <td style={nombre}>{h.marque ? montant(h.marque.total) : ''}</td>
                            <td style={cellule}>{h.ecriture ? `${h.ecriture.numero || h.ecriture.numeroProvisoire}${h.ecriture.etat === 'brouillard' ? ' (brouillard)' : ''}` : ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Les signalements */}
              <section style={cadre} aria-labelledby="dm-signalements">
                <div style={enTeteCadre}>
                  <h2 id="dm-signalements" style={titreCadre}>Signalements</h2>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Rien n'est passé d'office : à vérifier</span>
                </div>
                {e.signalements.length === 0 && <p style={{ margin: 0, padding: '14px 18px', fontSize: '0.84rem', color: '#64748b' }}>Aucun signalement.</p>}
                {e.signalements.length > 0 && <ListeSignalements liste={e.signalements} />}
              </section>
              <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
                LabFlow Compta prépare la déclaration, il ne la dépose pas : le portail de la Direction générale des impôts (impots.finances.gov.tn) ne propose pas de dépôt par fichier.{e.echeance ? ` Échéance de ce dossier (${PERSONNES[e.regime.personne] || 'personne'}${e.regime.personne === 'morale' ? (e.regime.teledeclaration ? ' télédéclarante' : ' non télédéclarante') : ''}) : le ${e.echeance.jour} du mois suivant, reportée au lundi un samedi ou un dimanche (jours fériés non pris en compte).` : ''}
              </p>
            </div>
          )}
        </>
      )}

      {marque && e && (
        <Modale titre={`Marquer la déclaration ${deMois(e.periode.fin)} comme déposée`} sousTitre={`Total à payer ${montant(e.total)} D${e.echeance ? ` · échéance le ${fmtJour(e.echeance.date)}` : ''}`}
          onClose={() => { if (!occupe) setMarque(null); }} onSubmit={() => { void marquer(); }} envoi={occupe} erreur={marque.erreur || null} libelleEnvoi="✓ Marquer comme déclarée" libelleAttente="Enregistrement…" libelleFermer="Fermer">
          {alertes.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: '0.78rem', color: '#92400e' }}>
              <strong>À vérifier avant de marquer :</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 3 }}>{alertes.map((s, i) => <li key={`${s.code}-${i}`}>{s.message}</li>)}</ul>
            </div>
          )}
          <label htmlFor="dm-date-depot" style={lbl}>Date du dépôt sur le portail</label>
          <input id="dm-date-depot" type="date" value={marque.date} min={ajouterJours(e.periode.fin, 1)} max={aujourdhuiTunis() > e.aujourdhui ? aujourdhuiTunis() : e.aujourdhui} onChange={(ev) => setMarque({ ...marque, date: ev.target.value, erreur: '' })} style={inp} />
          <p style={{ margin: '8px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
            L'état de la déclaration est figé dans l'historique (lignes et total), sans effet comptable. Si les montants changent ensuite, la page le signale. La marque se retire si besoin.
          </p>
        </Modale>
      )}
    </div>
  );
}

// Les signalements : la gravité est dite en texte (lecteurs d'écran), pas seulement par l'icône et la couleur.
function ListeSignalements({ liste }: { liste: DeclarationReponse['signalements'] }) {
  const GRAVITES = { bloquant: ['⛔', 'Bloquant', '#b91c1c'], attention: ['⚠️', 'À vérifier', '#92400e'], info: ['ℹ️', 'Pour information', '#475569'] } as const;
  return (
    <ul style={{ margin: 0, padding: '10px 18px 14px', listStyle: 'none', display: 'grid', gap: 6 }}>
      {liste.map((s, i) => {
        const [icone, texte, couleur] = GRAVITES[s.gravite] || GRAVITES.info;
        return (
          <li key={`${s.code}-${i}`} style={{ fontSize: '0.8rem', color: couleur, lineHeight: 1.5 }}>
            <span aria-hidden="true">{icone}</span> <span style={cache}>{texte} : </span>{s.message}
          </li>
        );
      })}
    </ul>
  );
}

// Le message d'une action, affiché près de son bouton ; il se fait voir (défilement) quand il apparaît.
function Message({ type, texte }: { type: 'info' | 'erreur'; texte: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest' }); }, [texte]);
  return type === 'erreur'
    ? <div ref={ref} role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', margin: '10px 18px', fontSize: '0.82rem', color: '#dc2626' }}>{texte}</div>
    : <div ref={ref} role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', margin: '10px 18px', fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{texte}</div>;
}

// Une rangée du résumé de la TVA.
function Rangee({ libelle, valeur, fort = false, couleur }: { libelle: string; valeur: string; fort?: boolean; couleur?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: fort ? '0.92rem' : '0.82rem', padding: '4px 0', borderTop: fort ? '2px solid #c7d2fe' : 'none', fontWeight: fort ? 800 : 500, color: couleur || '#0f172a' }}>
      <span style={{ color: fort ? couleur || '#0f172a' : '#475569' }}>{libelle}</span>
      <span style={{ fontFamily: mono }}>{valeur}</span>
    </div>
  );
}

// Le message d'un refus : un téléchargement rend un blob, son JSON est relu.
async function messageTelechargement(err: unknown, defaut: string, role: 'titulaire' | 'gerant') {
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

const cadre: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'clip', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const carteVide: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '22px 24px', maxWidth: 640 };
const enTeteCadre: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', background: 'linear-gradient(135deg,#f8faff,#eef2ff)', flexWrap: 'wrap' };
const titreCadre: React.CSSProperties = { fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem', margin: 0 };
const cellule: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };
const nombre: React.CSSProperties = { ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
const lien: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: '#4338ca', fontWeight: 700, fontSize: '0.8rem', padding: 0, fontFamily: 'inherit' };
const lienTexte: React.CSSProperties = { color: '#4338ca', fontWeight: 700, textDecoration: 'none' };
// Texte lu par les lecteurs d'écran, invisible.
const cache: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };
