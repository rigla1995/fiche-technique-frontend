import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useConfirm } from '../../components/common/ConfirmDialog';
import BoutonAide from '../BoutonAide';
import { Modale } from '../DossierFormulaires';
import { messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import { fmtJour, fmtMontant } from '../ecritures';
import { signe, texteIllisible } from '../echeancier';
import {
  LIBELLES_SOURCE, annulerCertificat, deMois, fmtTaux, libelleMois, libelleMoisCourt, lireTaxesMois, produireCertificats, produireFichierTej, retirerFichierTej, telechargerCertificat, telechargerFichierTej, telechargerLot, telechargerTaxesMois,
  type Certificat, type FichierTej, type Operation, type Paiement, type TaxesMoisReponse,
} from '../taxesMois';
import { bouton, inp, lbl, pastille, petit } from '../styles';

// « Taxes du mois » (LabFlow Compta, étape S7b ; labflow-reprise/achats-compta/PLAN-S7.md §2 « S7b », §4 « TVA »,
// « Retenues », « Seuil des retenues sur achats », « Droits » ; réponses du client du 09/10 — « ok pour les 9 » : date de
// paiement = règlement lettré, sinon facture, modifiable avant de produire ; fichier XML au cahier des charges TEJ v2.0, à
// essayer sur la plateforme) : pour une période, l'état de TVA (collectée, déductible, retenues de TVA subies, crédit
// reporté, TVA à payer ou crédit à reporter), les retenues opérées à certifier groupées en paiements (bénéficiaire, date
// modifiable, pièces) et leur synthèse par nature, les certificats du mois (PDF, annuler), le fichier TEJ du mois (dépôt
// initial puis rectificatif ; un fichier refusé par la plateforme se retire), les retenues subies, les signalements ;
// « Exporter (Excel) ». Brouillard compris par défaut dans l'état de TVA. Le titulaire et le niveau Complet produisent,
// annulent et retirent ; tout le monde lit. Le serveur calcule et décide ; après chaque écriture la page se relit, et
// rien ne se clique tant que la lecture n'est pas à jour (relecture de S7b).
type Role = 'titulaire' | 'gerant';
type Zone = 'haut' | 'retenues' | 'certificats' | 'fichier';
type Refus = { message: string; statut?: number };
const mono = 'ui-monospace, monospace';
const pluriel = (n: number, un: string, des: string) => `${n} ${n > 1 ? des : un}`;
const montant = (v: string) => fmtMontant(signe(v));
const nonNul = (v: string) => signe(v) !== 0n;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Le serveur produit 200 certificats au plus à la fois.
const PAIEMENTS_MAX = 200;
const codeDe = (err: unknown) => (err as { response?: { data?: { code?: string } } })?.response?.data?.code;

// Une page par dossier : changer de dossier (navigation directe) repart d'un état neuf.
export default function ComptaTaxesMoisPage() {
  const { dossierId } = useParams();
  return <ComptaTaxesMois key={dossierId} dossierId={dossierId} />;
}

function ComptaTaxesMois({ dossierId }: { dossierId?: string }) {
  const { confirm } = useConfirm();
  const [parametres, setParametres] = useSearchParams();
  const [periodeId, setPeriodeId] = useState<number | null>(() => { const v = Number(parametres.get('periode')); return Number.isInteger(v) && v > 0 ? v : null; });
  // S7c : « ?brouillard=0 » (lien de la page Déclaration mensuelle) ouvre la page sur les écritures validées seulement.
  const [brouillard, setBrouillard] = useState(() => parametres.get('brouillard') !== '0');
  const cle = `${periodeId ?? ''}|${brouillard ? 1 : 0}`;
  // La dernière lecture, avec la clé (période, brouillard) et le numéro de relecture qu'elle sert : la page est « à jour »
  // seulement quand les deux correspondent (après une écriture, l'ancienne lecture reste affichée mais figée).
  const [lecture, setLecture] = useState<{ cle: string; essai: number; valeur: TaxesMoisReponse } | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'sansExercice'>('chargement');
  const [erreurLecture, setErreurLecture] = useState<{ cle: string; message: string } | null>(null);
  const [avis, setAvis] = useState('');
  const [essai, setEssai] = useState(0);
  const [message, setMessage] = useState<{ type: 'info' | 'erreur'; texte: string; zone: Zone } | null>(null);
  // Les paiements DÉCOCHÉS (les paiements producibles sont cochés d'office) et les dates corrigées, par clé de paiement.
  const [exclus, setExclus] = useState<Set<string>>(() => new Set());
  const [dates, setDates] = useState<Map<string, string>>(() => new Map());
  const [action, setAction] = useState('');
  const occupe = action !== '';
  const occupeRef = useRef(false);
  const [annulation, setAnnulation] = useState<{ certificat: Certificat; motif: string; erreur: string } | null>(null);
  const [retrait, setRetrait] = useState<{ fichier: FichierTej; motif: string; erreur: string } | null>(null);
  const tour = useRef(0);
  const monte = useRef(true);
  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);

  // La page, relue à chaque changement de période ou de « Brouillard compris », et après chaque écriture (essai).
  const charger = useCallback((c: string, p: number | null, b: boolean, n: number) => {
    const moi = ++tour.current;
    lireTaxesMois(dossierId || '', p, b)
      .then((r) => { if (moi === tour.current) { setLecture({ cle: c, essai: n, valeur: r }); setEtat('pret'); setErreurLecture(null); } })
      .catch((err) => {
        if (moi !== tour.current) return;
        const s = statutDe(err);
        // Une période inconnue (lien ancien) : la période du jour à la place, et on le dit.
        if (s === 404 && p != null) { setAvis('La période demandée n\'existe pas dans ce dossier : voici la période en cours.'); setPeriodeId(null); setParametres({}, { replace: true }); return; }
        if (s === 404) setEtat('introuvable');
        else if (s === 409 && codeDe(err) === 'EXERCICE_ABSENT') setEtat('sansExercice');
        else setErreurLecture({ cle: c, message: messageDossier(err, 'Lecture impossible, réessayez.') });
      });
  }, [dossierId, setParametres]);
  useEffect(() => { charger(cle, periodeId, brouillard, essai); return () => { tour.current += 1; }; }, [charger, cle, periodeId, brouillard, essai]);

  const e = lecture && lecture.cle === cle ? lecture.valeur : null;
  const page = e || lecture?.valeur || null;
  const aJour = !!e && lecture?.essai === essai;
  const fige = occupe || !aJour;
  const erreurCourante = erreurLecture && erreurLecture.cle === cle ? erreurLecture.message : '';
  const role: Role = page?.dossier.espace.role || 'titulaire';
  const actif = !!page && page.dossier.etat === 'actif';
  const ouvert = !!page && page.etatAbonnement === 'actif';
  const peutProduire = !!page && page.droits.configurer && actif && ouvert;
  const relire = () => { setErreurLecture(null); setEssai((n) => n + 1); };
  const changerPeriode = (id: number) => {
    setPeriodeId(id); setExclus(new Set()); setDates(new Map()); setMessage(null); setAvis('');
    setParametres({ periode: String(id) }, { replace: true });
  };
  const changerBrouillard = (b: boolean) => { setBrouillard(b); setMessage(null); };

  // Une action (écriture ou téléchargement) : un geste à la fois ; le message s'affiche près de son bouton (zone) ; un
  // refus sur un état périmé ou des droits changés (403, 404, 409) relit la page. → null si l'action a réussi, sinon le refus.
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

  const dateDe = (p: Paiement) => dates.get(p.cle) ?? p.date;
  const horsPeriode = (d: string) => !!e && RE_DATE.test(d) && (d < e.periode.debut || d > e.periode.fin);
  const producibles = (e ? e.retenues.paiements : []).filter((p) => !p.bloque);
  const choisis = producibles.filter((p) => !exclus.has(p.cle)).slice(0, PAIEMENTS_MAX);
  const produire = async () => {
    if (!e || !choisis.length) return;
    const fausses = choisis.filter((p) => { const d = dateDe(p); return !RE_DATE.test(d) || d > e.aujourdhui; });
    if (fausses.length) { setMessage({ type: 'erreur', texte: `Date du paiement invalide ou future pour ${fausses.map((p) => p.tiers?.code || '?').join(', ')}.`, zone: 'retenues' }); return; }
    const total = choisis.reduce((s, p) => s + signe(p.totaux.rs) + signe(p.totaux.taxes), 0n);
    const hors = choisis.filter((p) => horsPeriode(dateDe(p)));
    const vus = new Map<string, number>();
    for (const p of choisis) { const k = `${p.tiers?.id}|${dateDe(p)}`; vus.set(k, (vus.get(k) || 0) + 1); }
    const doublons = choisis.filter((p) => (vus.get(`${p.tiers?.id}|${dateDe(p)}`) || 0) > 1);
    const ok = await confirm({
      title: `Produire ${pluriel(choisis.length, 'certificat', 'certificats')} de retenue ?`,
      message: `Retenues (retenues de TVA comprises) : ${fmtMontant(total)} D. Chaque certificat reçoit son numéro (sans trou par année) ; ses pièces, le bénéficiaire et votre identité sont figés.`,
      details: [
        ...(hors.length ? [`Date hors ${libelleMois(e.periode.debut)} : ${hors.map((p) => `${p.tiers?.code} au ${fmtJour(dateDe(p))}`).join(', ')} — ces certificats iront avec les paiements de leur mois (et dans son fichier TEJ).`] : []),
        ...(doublons.length ? [`Même fournisseur, même date : ${[...new Set(doublons.map((p) => p.tiers?.code))].join(', ')} — deux certificats distincts seront produits.`] : []),
        'Un certificat produit se retélécharge à l\'identique ; il s\'annule (avec un motif) mais garde son numéro.',
        'Le certificat qui fait foi s\'établit sur la plateforme TEJ : produisez ensuite le fichier du mois.',
      ],
      tone: 'primary', confirmLabel: 'Produire', icon: '🧾',
    });
    if (!ok) return;
    const corps = choisis.map((p) => ({ tiersId: p.tiers?.id ?? 0, date: dateDe(p), ecritures: p.operations.map((o) => o.ecritureId) }));
    const refus = await agir('produire', 'retenues', async () => {
      const r = await produireCertificats(e.dossier.id, corps);
      return `${pluriel(r.produits.length, 'certificat produit', 'certificats produits')} : ${r.produits.map((x) => x.reference).join(', ')}.`;
    }, 'Les certificats n\'ont pas pu être produits, réessayez.');
    if (!refus && monte.current) { setExclus(new Set()); setDates(new Map()); relire(); }
    erreurDans('retenues', refus);
  };
  const fichier = async () => {
    if (!e) return;
    const f = e.prochainFichier;
    const ok = await confirm({
      title: `Produire le fichier TEJ ${deMois(e.periode.debut)} ?`,
      message: `${f.acte === 0 ? 'Dépôt initial' : 'Rectificatif'} ${f.nom || ''} : ${pluriel(f.nbAjouts, 'certificat ajouté', 'certificats ajoutés')}${f.nbAnnulations ? `, ${pluriel(f.nbAnnulations, 'annulation', 'annulations')}` : ''}. Les certificats qu'il contient y seront rattachés.`,
      details: [
        ...(e.aujourdhui.slice(0, 7) <= `${f.annee}-${String(f.mois).padStart(2, '0')}` ? [`Le mois n'est pas fini : les certificats des paiements à venir iront dans un rectificatif.`] : []),
        'Fichier au cahier des charges TEJ v2.0 : à essayer sur la plateforme (tej.finances.gov.tn) avant d\'y compter. Refusé ? Retirez-le ici, corrigez, produisez-le de nouveau ; ou saisissez les certificats sur la plateforme à partir des PDF.', 'Le fichier reste téléchargeable à l\'identique depuis cette page.'],
      tone: 'primary', confirmLabel: 'Produire le fichier', icon: '📤',
    });
    if (!ok) return;
    const refus = await agir('fichier', 'fichier', async () => {
      const nom = await produireFichierTej(e.dossier.id, f);
      return `Fichier ${nom} téléchargé : déposez-le sur la plateforme TEJ (à essayer).`;
    }, 'Le fichier n\'a pas pu être produit, réessayez.');
    if (!refus && monte.current) relire();
    erreurDans('fichier', refus);
  };
  // Annuler un certificat, retirer un fichier : le refus d'une saisie (motif illisible, droits) reste dans la fenêtre ; un
  // état périmé (404, 409) la ferme et la page se relit.
  const annuler = async () => {
    if (!e || !annulation) return;
    const motif = annulation.motif.trim();
    if (!motif) { setAnnulation({ ...annulation, erreur: 'Indiquez le motif de l\'annulation.' }); return; }
    if (texteIllisible(motif)) { setAnnulation({ ...annulation, erreur: 'Caractères latins seulement : le motif s\'imprime sur le certificat.' }); return; }
    const c = annulation.certificat;
    const refus = await agir('annuler', 'certificats', async () => {
      const r = await annulerCertificat(e.dossier.id, c.id, motif);
      return `Certificat ${r.annule.reference} annulé${r.annule.depose ? ' : l\'annulation ira dans le prochain fichier du mois (rectificatif)' : ''} ; ses pièces sont de nouveau à certifier.`;
    }, 'L\'annulation n\'a pas pu être faite, réessayez.');
    if (!monte.current) return;
    if (!refus) { setAnnulation(null); setExclus(new Set()); setDates(new Map()); relire(); return; }
    if (refus.statut === 404 || refus.statut === 409) { setAnnulation(null); erreurDans('certificats', refus); return; }
    if (refus.message) setAnnulation((a) => (a ? { ...a, erreur: refus.message } : a));
  };
  const retirer = async () => {
    if (!e || !retrait) return;
    const motif = retrait.motif.trim();
    if (!motif) { setRetrait({ ...retrait, erreur: 'Indiquez la raison (par exemple la réponse de la plateforme).' }); return; }
    if (texteIllisible(motif)) { setRetrait({ ...retrait, erreur: 'Caractères latins seulement.' }); return; }
    const f = retrait.fichier;
    const refus = await agir('retirer', 'fichier', async () => {
      const r = await retirerFichierTej(e.dossier.id, f.id, motif);
      return `Fichier ${r.retire.nom} retiré : ${pluriel(r.retire.ajouts, 'certificat est', 'certificats sont')} de nouveau à mettre dans un fichier${r.retire.acte === 0 ? ' (le dépôt initial se refait)' : ''}.`;
    }, 'Le fichier n\'a pas pu être retiré, réessayez.');
    if (!monte.current) return;
    if (!refus) { setRetrait(null); relire(); return; }
    if (refus.statut === 404 || refus.statut === 409) { setRetrait(null); erreurDans('fichier', refus); return; }
    if (refus.message) setRetrait((r) => (r ? { ...r, erreur: refus.message } : r));
  };
  const exporter = () => { if (e) void agir('export', 'haut', async () => { await telechargerTaxesMois(e.dossier.id, e.periode.id, brouillard); return 'Taxes du mois exportées (Excel).'; }, 'Export impossible, réessayez.').then((r) => erreurDans('haut', r)); };
  const telecharger = (nom: string, zone: Zone, travail: () => Promise<string>, defaut: string) => { void agir(nom, zone, travail, defaut).then((r) => erreurDans(zone, r)); };

  const retour = { lien: `/dossiers/${page?.dossier.id ?? dossierId}`, libelle: page?.dossier.nom ?? 'Fiche du dossier' };
  const tva = e?.tva;
  const resultat = tva ? signe(tva.resultat) : 0n;
  // Le premier mois de l'exercice : le crédit reporté vient des à-nouveaux (compte du crédit de TVA).
  const premiere = !!e && page?.exercices.find((x) => x.id === e.exercice.id)?.periodes[0]?.id === e.periode.id;
  const codesTva = tva ? tva.codes.filter((c) => c.type === 'tva' && [c.baseVente, c.collectee, c.baseAchat, c.deductible, c.deductibleImmo, c.nonRecuperable].some(nonNul)) : [];
  // Le dernier fichier non retiré du mois : le seul qui se retire.
  const dernier = e ? [...e.fichiers].reverse().find((f) => !f.retrait) : undefined;
  const msg = (zone: Zone) => (message && message.zone === zone ? <Message type={message.type} texte={message.texte} /> : null);
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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🧾</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Taxes du mois</h1>
            {page?.dossier.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Dossier archivé</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {e && tva
              ? `${libelleMois(e.periode.debut)} · ${resultat > 0n ? `TVA à payer ${montant(tva.aPayer)}` : resultat < 0n ? `crédit à reporter ${montant(tva.creditAReporter)}` : 'TVA nulle'} · ${pluriel(e.retenues.paiements.length, 'paiement à certifier', 'paiements à certifier')} · ${pluriel(e.certificats.filter((c) => c.etat === 'produit').length, 'certificat', 'certificats')}`
              : 'État de TVA, retenues à la source et certificats de la plateforme TEJ'}
          </p>
        </div>
        <BoutonAide section="compta-taxes-mois" />
      </div>

      {etat === 'chargement' && !erreurCourante && <div className="loading-text">Chargement…</div>}
      {etat === 'introuvable' && (
        <div style={carteVide}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Ce dossier n'existe pas ou ne vous est pas ouvert</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
            Il a peut-être été supprimé, ou son accès vous a été retiré. <Link to="/" style={lienTexte}>Retour à vos comptabilités</Link>
          </p>
        </div>
      )}
      {etat === 'sansExercice' && (
        <div style={carteVide}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Aucun exercice dans ce dossier</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
            Les taxes se lisent mois par mois sur l'exercice : ouvrez-en un depuis la <Link to={retour.lien} style={lienTexte}>fiche du dossier</Link>.
          </p>
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
          {!ouvert && <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>{texteEtatAbonnement(page.etatAbonnement, role)} : la page reste consultable ; les certificats et le fichier ne se produisent plus.</div>}
          {page.dossier.etat === 'archive' && ouvert && <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>Dossier archivé : rien ne se produit tant qu'il n'est pas désarchivé.</div>}
          {ouvert && actif && !page.droits.configurer && <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>Votre niveau d'accès permet de consulter les taxes du mois et de télécharger les certificats ; le titulaire et les gérants de niveau Complet les produisent.</div>}

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ minWidth: 220 }}>
              <label htmlFor="tm-periode" style={lbl}>Période</label>
              <select id="tm-periode" value={periodeId ?? page.periode.id} onChange={(ev) => changerPeriode(Number(ev.target.value))} disabled={occupe} style={inp}>
                {page.exercices.map((x) => (
                  <optgroup key={x.id} label={`Exercice du ${fmtJour(x.debut)} au ${fmtJour(x.fin)}${x.etat === 'clos' ? ' (clos)' : ''}`}>
                    {x.periodes.map((p) => <option key={p.id} value={p.id}>{libelleMois(p.debut)}{p.etat === 'close' ? ' — close' : ''}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#334155', fontWeight: 600, cursor: 'pointer', paddingBottom: 9 }}>
              <input type="checkbox" checked={brouillard} onChange={(ev) => changerBrouillard(ev.target.checked)} disabled={occupe} />
              Brouillard compris
            </label>
            <span style={{ flex: '1 1 10px' }} />
            {e && !aJour && <span role="status" style={{ fontSize: '0.78rem', color: '#64748b', paddingBottom: 9 }}>Mise à jour…</span>}
            <button type="button" onClick={exporter} disabled={fige} style={petit('#f0fdf4', '#166534', '#bbf7d0')}>{action === 'export' ? 'Export…' : '📥 Exporter (Excel)'}</button>
          </div>
          {msg('haut')}
          {!e && !erreurCourante && <div className="loading-text">Lecture…</div>}

          {e && tva && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
              {/* L'état de TVA */}
              <section style={cadre} aria-labelledby="tm-tva">
                <div style={enTeteCadre}>
                  <h2 id="tm-tva" style={titreCadre}>État de TVA — {libelleMois(e.periode.debut)}{e.periode.etat === 'close' ? ' (période close)' : ''}</h2>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Exigibilité aux débits : chaque facture compte dans la période de son écriture{tva.nbBrouillard ? ` · ${pluriel(tva.nbBrouillard, 'ligne en brouillard comprise', 'lignes en brouillard comprises')}` : ''}</span>
                </div>
                <div style={{ overflowX: 'auto', position: 'relative' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 700 }}>
                    <thead>
                      <tr style={{ color: '#64748b', textAlign: 'left' }}>
                        <th style={cellule}>Code</th><th style={cellule}>Libellé</th><th style={{ ...cellule, textAlign: 'right' }}>Taux</th><th style={{ ...cellule, textAlign: 'right' }}>Base ventes</th><th style={{ ...cellule, textAlign: 'right' }}>Collectée</th>
                        <th style={{ ...cellule, textAlign: 'right' }}>Base achats</th><th style={{ ...cellule, textAlign: 'right' }}>Déductible</th><th style={{ ...cellule, textAlign: 'right' }}>Sur immobilisations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {codesTva.map((c) => (
                        <tr key={c.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ ...cellule, fontFamily: mono, fontWeight: 700 }}>{c.code}</td><td style={cellule}>{c.libelle}{nonNul(c.nonRecuperable) ? <span style={{ color: '#64748b' }}> · non récupérable {montant(c.nonRecuperable)}</span> : null}</td>
                          <td style={nombre}>{fmtTaux(c.taux)}</td>
                          <td style={nombre}>{nonNul(c.baseVente) ? montant(c.baseVente) : ''}</td><td style={nombre}>{nonNul(c.collectee) ? montant(c.collectee) : ''}</td>
                          <td style={nombre}>{nonNul(c.baseAchat) ? montant(c.baseAchat) : ''}</td><td style={nombre}>{nonNul(c.deductible) ? montant(c.deductible) : ''}</td><td style={nombre}>{nonNul(c.deductibleImmo) ? montant(c.deductibleImmo) : ''}</td>
                        </tr>
                      ))}
                      {!codesTva.length && <tr><td colSpan={8} style={{ ...cellule, color: '#64748b' }}>Aucune ligne de TVA codée sur la période.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '8px 18px 14px', display: 'grid', gap: 2, maxWidth: 520, marginLeft: 'auto' }}>
                  <Rangee libelle="TVA collectée" valeur={montant(tva.collectee)} />
                  <Rangee libelle="− TVA déductible sur biens et services" valeur={montant(tva.deductibleBs)} />
                  <Rangee libelle="− TVA déductible sur immobilisations" valeur={montant(tva.deductibleImmo)} />
                  {nonNul(tva.retenuesSubies) && <Rangee libelle="− Retenues de TVA subies (secteur public)" valeur={montant(tva.retenuesSubies)} />}
                  <Rangee libelle={`− Crédit reporté${premiere ? " (à-nouveaux de l'exercice)" : ' du mois précédent'}`} valeur={montant(tva.creditReporte)} />
                  <Rangee fort libelle={resultat > 0n ? 'TVA à payer' : resultat < 0n ? 'Crédit à reporter (mois suivant)' : 'Résultat'} valeur={montant(resultat > 0n ? tva.aPayer : tva.creditAReporter)} couleur={resultat > 0n ? '#b45309' : '#166534'} />
                  {nonNul(tva.nonRecuperable) && <span style={{ fontSize: '0.74rem', color: '#64748b' }}>TVA non récupérable passée en charge : {montant(tva.nonRecuperable)} (pour mémoire).</span>}
                </div>
              </section>

              {/* Les retenues à certifier */}
              <section style={cadre} aria-labelledby="tm-retenues">
                <div style={enTeteCadre}>
                  <h2 id="tm-retenues" style={titreCadre}>Retenues à certifier — paiements {deMois(e.periode.debut)}</h2>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Un certificat par fournisseur et par paiement · date du règlement lettré, sinon de la facture, modifiable</span>
                </div>
                {e.retenues.parNature.length > 0 && (
                  <div style={{ overflowX: 'auto', position: 'relative', borderBottom: '1px solid #f1f5f9' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', minWidth: 560 }}>
                      <caption style={{ textAlign: 'left', padding: '8px 18px 2px', fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>Par nature (code TEJ) — paiements du mois</caption>
                      <thead><tr style={{ color: '#94a3b8', textAlign: 'left' }}><th style={cellule}>Code TEJ</th><th style={cellule}>Nature</th><th style={{ ...cellule, textAlign: 'right' }}>Pièces</th><th style={{ ...cellule, textAlign: 'right' }}>Retenue</th><th style={{ ...cellule, textAlign: 'right' }}>À certifier</th><th style={{ ...cellule, textAlign: 'right' }}>Certifiée</th></tr></thead>
                      <tbody>
                        {e.retenues.parNature.map((n) => (
                          <tr key={n.codeTej || n.code || '?'} style={{ borderTop: '1px solid #f8fafc' }}>
                            <td style={{ ...cellule, fontFamily: mono }}>{n.codeTej || '—'}</td><td style={cellule}>{n.code} {n.libelle ? `· ${n.libelle}` : ''}</td>
                            <td style={nombre}>{n.nb}</td><td style={nombre}>{montant(n.rs)}</td><td style={nombre}>{nonNul(n.aProduire) ? montant(n.aProduire) : ''}</td><td style={nombre}>{nonNul(n.certifie) ? montant(n.certifie) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {e.retenues.borne && <div role="status" style={{ padding: '8px 18px', fontSize: '0.78rem', color: '#92400e', background: '#fffbeb' }}>Liste bornée : seules les 5 000 pièces à retenue les plus récentes du dossier sont lues.</div>}
                {e.retenues.paiements.length === 0 && <p style={{ margin: 0, padding: '14px 18px', fontSize: '0.84rem', color: '#64748b' }}>Aucune retenue opérée à certifier pour les paiements de ce mois.</p>}
                {e.retenues.paiements.map((p) => (
                  <BlocPaiement key={p.cle} p={p} lienTiers={`/dossiers/${e.dossier.id}/tiers`} date={dateDe(p)} max={e.aujourdhui} coche={!p.bloque && choisis.includes(p)} modifiable={peutProduire && !p.bloque} fige={fige} hors={horsPeriode(dateDe(p)) ? libelleMois(dateDe(p)) : ''} periode={libelleMois(e.periode.debut)}
                    basculer={(c) => setExclus((s) => { const n = new Set(s); if (c) n.delete(p.cle); else n.add(p.cle); return n; })}
                    changerDate={(d) => setDates((m) => { const n = new Map(m); n.set(p.cle, d); return n; })} />
                ))}
                {(e.retenues.brouillard.length > 0 || e.retenues.autresMois.length > 0 || e.retenues.problemes.length > 0) && (
                  <div style={{ padding: '10px 18px', borderTop: '1px solid #f1f5f9', fontSize: '0.78rem', color: '#475569', display: 'grid', gap: 4 }}>
                    {e.retenues.brouillard.length > 0 && <span>✍️ {e.retenues.brouillard.length > 1 ? `${e.retenues.brouillard.length} pièces à retenue en brouillard (${e.retenues.brouillard.map((o) => o.reference).join(', ')}) : validez-les` : `1 pièce à retenue en brouillard (${e.retenues.brouillard[0].reference}) : validez-la`} (page <Link to={`/dossiers/${e.dossier.id}/ecritures`} style={lienTexte}>Écritures</Link>) pour produire {e.retenues.brouillard.length > 1 ? 'leur certificat' : 'son certificat'}.</span>}
                    {e.retenues.problemes.map((o) => <span key={o.ecritureId}>⛔ Pièce {o.numero || o.reference} : {o.probleme?.message}</span>)}
                    {e.retenues.autresMois.length > 0 && (
                      <span>📅 À certifier sur d'autres mois :{' '}
                        {e.retenues.autresMois.map((m, i) => (
                          <span key={m.mois}>{i > 0 ? ', ' : ''}{m.periodeId
                            ? <button type="button" onClick={() => changerPeriode(m.periodeId as number)} disabled={occupe} style={lien}>{libelleMoisCourt(m.mois)} ({m.nb})</button>
                            : <span title="Aucune période pour ce mois : créez l'exercice qui le contient">{libelleMoisCourt(m.mois)} ({m.nb}, sans période)</span>}</span>
                        ))}
                      </span>
                    )}
                  </div>
                )}
                {msg('retenues')}
                {peutProduire && producibles.length > 0 && (
                  <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#f8faff' }}>
                    <span style={{ fontSize: '0.8rem', color: '#334155' }}>{pluriel(choisis.length, 'paiement coché', 'paiements cochés')} sur {producibles.length}{producibles.length > PAIEMENTS_MAX ? ` (${PAIEMENTS_MAX} au plus par production)` : ''}</span>
                    <span style={{ flex: 1 }} />
                    <button type="button" onClick={() => setExclus(choisis.length ? new Set(producibles.map((p) => p.cle)) : new Set())} disabled={fige} style={petit('#fff', '#475569', '#cbd5e1')}>{choisis.length ? 'Tout décocher' : 'Tout cocher'}</button>
                    <button type="button" onClick={() => { void produire(); }} disabled={fige || !choisis.length || !page.declarant.complet} style={bouton('linear-gradient(135deg,#4338ca,#6366f1)', '#fff', 'transparent')}>{action === 'produire' ? 'Production…' : `🧾 Produire les certificats (${choisis.length})`}</button>
                  </div>
                )}
                {!page.declarant.complet && <div style={{ padding: '10px 18px', borderTop: '1px solid #fecaca', background: '#fef2f2', fontSize: '0.8rem', color: '#b91c1c' }}>Identité du dossier à compléter pour la plateforme TEJ : {page.declarant.manque.join(', ')} — <Link to={retour.lien} style={lienTexte}>fiche du dossier</Link>.</div>}
              </section>

              {/* Les certificats du mois et le fichier TEJ */}
              <section style={cadre} aria-labelledby="tm-certificats">
                <div style={enTeteCadre}>
                  <h2 id="tm-certificats" style={titreCadre}>Certificats des paiements {deMois(e.periode.debut)}</h2>
                  {e.certificats.some((c) => c.etat === 'produit') && <button type="button" onClick={() => telecharger('lot', 'certificats', async () => { await telechargerLot(e.dossier.id, e.periode.id); return 'Certificats du mois téléchargés (PDF).'; }, 'Le PDF n\'a pas pu être produit, réessayez.')} disabled={fige} style={petit('#f0f9ff', '#0369a1', '#bae6fd')}>{action === 'lot' ? 'Préparation…' : '📄 Certificats du mois (PDF)'}</button>}
                </div>
                {e.certificats.length === 0 && <p style={{ margin: 0, padding: '14px 18px', fontSize: '0.84rem', color: '#64748b' }}>Aucun certificat produit pour les paiements de ce mois.</p>}
                {e.certificats.length > 0 && (
                  <div style={{ overflowX: 'auto', position: 'relative' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 720 }}>
                      <thead>
                        <tr style={{ color: '#64748b', textAlign: 'left' }}>
                          <th style={cellule}>Numéro</th><th style={cellule}>Paiement</th><th style={cellule}>Bénéficiaire</th><th style={{ ...cellule, textAlign: 'right' }}>Retenue</th><th style={cellule}>État</th><th style={cellule}><span style={cache}>Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.certificats.map((c) => (
                          <tr key={c.id} style={{ borderTop: '1px solid #f1f5f9', opacity: c.etat === 'annule' ? 0.65 : 1 }}>
                            <td style={{ ...cellule, fontFamily: mono, fontWeight: 800 }}>{c.reference}</td>
                            <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{fmtJour(c.datePaiement)} <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>({LIBELLES_SOURCE[c.sourceDate]})</span></td>
                            <td style={cellule}><span style={{ fontFamily: mono, fontWeight: 700 }}>{c.tiers.code}</span> {c.tiers.nom}</td>
                            <td style={nombre}>{montant(c.totaux.rs)}{nonNul(c.totaux.taxes) ? ` + ${montant(c.totaux.taxes)}` : ''}</td>
                            <td style={cellule}>
                              {c.etat === 'annule'
                                ? <span style={pastille('#fee2e2', '#991b1b')}>Annulé{c.annulation?.fichier ? ` · annulation dans ${c.annulation.fichier.nom}` : c.fichier ? ' · annulation à mettre dans le prochain fichier' : ''}</span>
                                : c.fichier ? <span style={pastille('#dcfce7', '#166534')}>Dans le fichier {c.fichier.nom}</span> : <span style={pastille('#eef2ff', '#3730a3')}>Produit</span>}
                              {c.etat === 'annule' && c.annulation?.motif && <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>{c.annulation.motif}</span>}
                            </td>
                            <td style={{ ...cellule, whiteSpace: 'nowrap', textAlign: 'right' }}>
                              <button type="button" onClick={() => telecharger(`pdf-${c.id}`, 'certificats', async () => { await telechargerCertificat(e.dossier.id, c); return `Certificat ${c.reference} téléchargé (PDF).`; }, 'Le PDF n\'a pas pu être produit, réessayez.')} disabled={fige} aria-label={`Certificat ${c.reference} (PDF)`} style={lien}>{action === `pdf-${c.id}` ? '…' : '📄 PDF'}</button>
                              {peutProduire && c.etat === 'produit' && <button type="button" onClick={() => setAnnulation({ certificat: c, motif: '', erreur: '' })} disabled={fige} aria-label={`Annuler le certificat ${c.reference}`} style={{ ...lien, color: '#be123c' }}>Annuler</button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {msg('certificats')}
                <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', background: '#f8faff', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '0.82rem', color: '#1e1b4b', fontWeight: 700 }}>Fichier TEJ du mois</h3>
                    <span style={pastille('#fef3c7', '#92400e')} title="Cahier des charges TEJ v2.0 ; nouveau schéma de septembre 2026 non publié">À essayer sur TEJ</span>
                    <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                      {e.prochainFichier.nbAjouts + e.prochainFichier.nbAnnulations > 0
                        ? `Prochain : ${e.prochainFichier.nom || '—'} — ${e.prochainFichier.acte === 0 ? 'dépôt initial' : 'rectificatif'}, ${pluriel(e.prochainFichier.nbAjouts, 'certificat', 'certificats')}${e.prochainFichier.nbAnnulations ? `, ${pluriel(e.prochainFichier.nbAnnulations, 'annulation', 'annulations')}` : ''}`
                        : e.fichiers.some((f) => !f.retrait) ? 'Tous les certificats du mois sont dans un fichier.' : 'Aucun certificat à mettre dans un fichier.'}
                    </span>
                    <span style={{ flex: 1 }} />
                    {peutProduire && <button type="button" onClick={() => { void fichier(); }} disabled={fige || e.prochainFichier.nbAjouts + e.prochainFichier.nbAnnulations === 0 || !page.declarant.complet} style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>{action === 'fichier' ? 'Production…' : '📤 Fichier TEJ (XML)'}</button>}
                  </div>
                  {e.fichiers.map((f) => {
                    const le = new Date(f.produitLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
                    return (
                      <div key={f.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.78rem', color: '#334155', opacity: f.retrait ? 0.7 : 1 }}>
                        <span style={{ fontFamily: mono, fontWeight: 700, textDecoration: f.retrait ? 'line-through' : 'none' }}>{f.nom}</span>
                        <span>{f.acte === 0 ? 'dépôt initial' : 'rectificatif'} · {pluriel(f.nbAjouts, 'certificat', 'certificats')}{f.nbAnnulations ? ` · ${pluriel(f.nbAnnulations, 'annulation', 'annulations')}` : ''} · produit le {le}{f.produitPar ? ` par ${f.produitPar}` : ''}</span>
                        {f.retrait && <span style={pastille('#f1f5f9', '#475569')} title={f.retrait.motif || ''}>Retiré le {new Date(f.retrait.le).toLocaleDateString('fr-FR')}{f.retrait.motif ? ` : ${f.retrait.motif}` : ''}</span>}
                        <button type="button" onClick={() => telecharger(`xml-${f.id}`, 'fichier', async () => { await telechargerFichierTej(e.dossier.id, f); return `Fichier ${f.nom} retéléchargé (identique).`; }, 'Le fichier n\'a pas pu être téléchargé, réessayez.')} disabled={fige} aria-label={`Télécharger ${f.nom} du ${le}`} style={lien}>{action === `xml-${f.id}` ? '…' : '⬇️ Télécharger'}</button>
                        {peutProduire && dernier?.id === f.id && <button type="button" onClick={() => setRetrait({ fichier: f, motif: '', erreur: '' })} disabled={fige} aria-label={`Retirer ${f.nom} (refusé par la plateforme TEJ)`} style={{ ...lien, color: '#be123c' }}>Retirer (refusé par TEJ)</button>}
                      </div>
                    );
                  })}
                  {msg('fichier')}
                  <span style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.5 }}>Le fichier suit le cahier des charges TEJ v2.0 (juin 2024) ; un nouveau schéma est exigé depuis septembre 2026 et n'est pas publié : essayez le dépôt sur tej.finances.gov.tn avant d'y compter. Refusé ? « Retirer » le dernier fichier du mois rend ses certificats à mettre dans un fichier. Le certificat qui fait foi est celui de la plateforme ; le PDF en reprend le contenu.</span>
                </div>
              </section>

              {/* Les retenues subies */}
              <section style={cadre} aria-labelledby="tm-subies">
                <div style={enTeteCadre}>
                  <h2 id="tm-subies" style={titreCadre}>Retenues subies — {libelleMois(e.periode.debut)}</h2>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Ce que vos clients ont retenu sur vous (comptes de retenues subies) : {montant(e.subies.total)}</span>
                </div>
                {e.subies.lignes.length === 0 && <p style={{ margin: 0, padding: '14px 18px', fontSize: '0.84rem', color: '#64748b' }}>Aucune retenue subie sur la période.</p>}
                {e.subies.lignes.length > 0 && (
                  <div style={{ overflowX: 'auto', position: 'relative' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 600 }}>
                      <thead><tr style={{ color: '#64748b', textAlign: 'left' }}><th style={cellule}>Date</th><th style={cellule}>Pièce</th><th style={cellule}>Tiers</th><th style={cellule}>Code</th><th style={{ ...cellule, textAlign: 'right' }}>Montant</th></tr></thead>
                      <tbody>
                        {e.subies.lignes.map((s) => (
                          <tr key={s.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{fmtJour(s.date)}</td>
                            <td style={{ ...cellule, fontFamily: mono }}>{s.reference}{s.etat === 'brouillard' ? ' (*)' : ''}</td>
                            <td style={cellule}>{s.tiers ? `${s.tiers.code} ${s.tiers.nom}` : '—'}</td>
                            <td style={{ ...cellule, fontFamily: mono }}>{s.code || s.compte}</td>
                            <td style={nombre}>{montant(s.montant)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(e.subies.lignes.some((s) => s.etat === 'brouillard') || e.subies.nb > e.subies.lignes.length) && (
                  <p style={{ margin: 0, padding: '6px 18px 10px', fontSize: '0.72rem', color: '#64748b' }}>
                    {e.subies.lignes.some((s) => s.etat === 'brouillard') ? '(*) écriture en brouillard. ' : ''}{e.subies.nb > e.subies.lignes.length ? `${e.subies.lignes.length} premières lignes sur ${e.subies.nb} ; le total porte sur toutes.` : ''}
                  </p>
                )}
              </section>

              {/* Les signalements */}
              <section style={cadre} aria-labelledby="tm-signalements">
                <div style={enTeteCadre}>
                  <h2 id="tm-signalements" style={titreCadre}>Signalements</h2>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Rien n'est passé d'office : à vérifier</span>
                </div>
                {e.signalements.length === 0 && <p style={{ margin: 0, padding: '14px 18px', fontSize: '0.84rem', color: '#64748b' }}>Aucun signalement.</p>}
                {e.signalements.length > 0 && (
                  <ul style={{ margin: 0, padding: '10px 18px 14px', listStyle: 'none', display: 'grid', gap: 6 }}>
                    {e.signalements.map((s, i) => (
                      <li key={`${s.code}-${i}`} style={{ fontSize: '0.8rem', color: s.gravite === 'bloquant' ? '#b91c1c' : s.gravite === 'attention' ? '#92400e' : '#475569', lineHeight: 1.5 }}>
                        <span aria-hidden="true">{s.gravite === 'bloquant' ? '⛔' : s.gravite === 'attention' ? '⚠️' : 'ℹ️'}</span> {s.message}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
                Seules les lignes portant un code de taxe comptent dans l'état de TVA ; les retenues opérées viennent des lignes de retenue d'une facture d'achat passées sur un compte de retenues opérées (432 et ses sous-comptes) ; une retenue passée sur un règlement est bloquée.{e.seuilAchats ? ` Le seuil de ${Number(e.seuilAchats).toLocaleString('fr-FR')} D des retenues sur achats s'apprécie par paiement.` : ''} Un certificat s'établit au plus tard à la fin du mois qui suit le paiement.
              </p>
            </div>
          )}
        </>
      )}

      {annulation && e && (
        <Modale titre={`Annuler le certificat ${annulation.certificat.reference}`} sousTitre={`${annulation.certificat.tiers.code} ${annulation.certificat.tiers.nom} · paiement du ${fmtJour(annulation.certificat.datePaiement)}`}
          onClose={() => { if (!occupe) setAnnulation(null); }} onSubmit={() => { void annuler(); }} envoi={occupe} erreur={annulation.erreur || null} libelleEnvoi="✓ Confirmer l'annulation" libelleAttente="Annulation…" libelleFermer="Garder le certificat">
          <label htmlFor="tm-motif" style={lbl}>Motif</label>
          <textarea id="tm-motif" value={annulation.motif} onChange={(ev) => setAnnulation({ ...annulation, motif: ev.target.value, erreur: '' })} rows={3} maxLength={255} autoFocus style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          <p style={{ margin: '8px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
            Le certificat garde son numéro et se marque annulé ; ses pièces redeviennent à certifier.{annulation.certificat.fichier ? ` Il est dans le fichier ${annulation.certificat.fichier.nom} : l'annulation ira dans le prochain fichier du mois (rectificatif).` : ''}
          </p>
        </Modale>
      )}
      {retrait && e && (
        <Modale titre={`Retirer le fichier ${retrait.fichier.nom}`} sousTitre="Fichier refusé par la plateforme TEJ (ou jamais déposé)"
          onClose={() => { if (!occupe) setRetrait(null); }} onSubmit={() => { void retirer(); }} envoi={occupe} erreur={retrait.erreur || null} libelleEnvoi="✓ Retirer le fichier" libelleAttente="Retrait…" libelleFermer="Garder le fichier">
          <label htmlFor="tm-motif-retrait" style={lbl}>Raison (réponse de la plateforme)</label>
          <textarea id="tm-motif-retrait" value={retrait.motif} onChange={(ev) => setRetrait({ ...retrait, motif: ev.target.value, erreur: '' })} rows={3} maxLength={255} autoFocus style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          <p style={{ margin: '8px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
            Ses {pluriel(retrait.fichier.nbAjouts, 'certificat redevient', 'certificats redeviennent')} « à mettre dans un fichier »{retrait.fichier.nbAnnulations ? ', ses annulations à déclarer' : ''} ; {retrait.fichier.acte === 0 ? 'le dépôt initial se refera' : 'le rectificatif se refera'}. Le fichier reste téléchargeable, marqué retiré. Ne retirez qu'un fichier que la plateforme a refusé.
          </p>
        </Modale>
      )}
    </div>
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

// Une rangée du résumé de l'état de TVA.
function Rangee({ libelle, valeur, fort = false, couleur }: { libelle: string; valeur: string; fort?: boolean; couleur?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: fort ? '0.92rem' : '0.82rem', padding: '4px 0', borderTop: fort ? '2px solid #c7d2fe' : 'none', fontWeight: fort ? 800 : 500, color: couleur || '#0f172a' }}>
      <span style={{ color: fort ? couleur || '#0f172a' : '#475569' }}>{libelle}</span>
      <span style={{ fontFamily: mono }}>{valeur}</span>
    </div>
  );
}

// Un paiement à certifier : case, bénéficiaire, date (modifiable), pièces, ce qui bloque, ce qui est à vérifier.
function BlocPaiement({ p, lienTiers, date, max, coche, modifiable, fige, hors, periode, basculer, changerDate }: {
  p: Paiement; lienTiers: string; date: string; max: string; coche: boolean; modifiable: boolean; fige: boolean; hors: string; periode: string;
  basculer: (c: boolean) => void; changerDate: (d: string) => void;
}) {
  const t = p.tiers;
  const id = `tm-p-${p.cle.replace(/[^a-z0-9]/gi, '-')}`;
  return (
    <div style={{ borderTop: '1px solid #f1f5f9', padding: '10px 18px', background: p.bloque ? '#fffafa' : '#fff' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {modifiable && <input type="checkbox" checked={coche} onChange={(ev) => basculer(ev.target.checked)} disabled={fige} aria-label={`Certifier le paiement de ${t?.code || ''} du ${fmtJour(date)}`} />}
        <span style={{ minWidth: 0, flex: '1 1 260px' }}>
          <span style={{ fontFamily: mono, fontWeight: 800, color: '#1e1b4b' }}>{t?.code}</span> <span style={{ fontWeight: 600 }}>{t?.nom}</span>
          <span style={{ display: 'block', fontSize: '0.74rem', color: '#64748b' }}>{t?.regimeFiscalLibelle || 'Régime fiscal non renseigné'}{t?.matriculeFiscal ? ` · ${t.matriculeFiscal}` : ''}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {modifiable
            ? <><label htmlFor={id} style={{ fontSize: '0.74rem', color: '#64748b' }}>Paiement du</label><input id={id} type="date" value={date} max={max} onChange={(ev) => changerDate(ev.target.value)} disabled={fige} aria-label={`Date du paiement de ${t?.code || ''}`} style={{ ...inp, width: 'auto', padding: '6px 8px' }} /></>
            : <span style={{ fontSize: '0.74rem', color: '#64748b' }}>Paiement du <strong style={{ color: '#0f172a' }}>{fmtJour(date)}</strong></span>}
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{date === p.date ? LIBELLES_SOURCE[p.sourceDate] : 'date corrigée'}</span>
        </span>
        <span style={{ fontFamily: mono, fontWeight: 800, whiteSpace: 'nowrap' }}>{montant(p.totaux.rs)} D</span>
      </div>
      {hors && <div style={{ marginTop: 4, fontSize: '0.76rem', color: '#92400e' }}>⚠️ Hors de {periode} : ce certificat ira avec les paiements {hors.match(/^[aeiouyàâéèêh]/i) ? `d'${hors}` : `de ${hors}`} (et dans le fichier TEJ de ce mois-là).</div>}
      <div style={{ overflowX: 'auto', position: 'relative', marginTop: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', minWidth: 760 }}>
          <thead>
            <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
              <th style={cellule}>Pièce</th><th style={cellule}>Facture du</th><th style={cellule}>Nature</th><th style={{ ...cellule, textAlign: 'right' }}>Hors taxes</th><th style={{ ...cellule, textAlign: 'right' }}>TVA</th>
              <th style={{ ...cellule, textAlign: 'right' }}>TTC</th><th style={{ ...cellule, textAlign: 'right' }}>Taux</th><th style={{ ...cellule, textAlign: 'right' }}>Retenue</th><th style={{ ...cellule, textAlign: 'right' }}>Net servi</th>
            </tr>
          </thead>
          <tbody>
            {p.operations.map((o: Operation) => (
              <tr key={o.ecritureId} style={{ borderTop: '1px solid #f8fafc' }}>
                <td style={{ ...cellule, whiteSpace: 'nowrap' }}><span style={{ fontFamily: mono, fontWeight: 700 }}>{o.reference}</span> <span style={{ color: '#94a3b8' }}>{o.numero}</span></td>
                <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{fmtJour(o.dateFacture)}</td>
                <td style={cellule}><span style={{ fontFamily: mono }}>{o.code}</span> <span style={{ color: '#64748b' }}>({o.codeTej})</span></td>
                <td style={nombre}>{montant(o.ht)}</td><td style={nombre}>{montant(o.tva)}</td><td style={nombre}>{montant(o.ttc)}</td>
                <td style={nombre}>{fmtTaux(o.tauxRs)}</td><td style={{ ...nombre, fontWeight: 700 }}>{montant(o.rs)}{o.rsTva ? ` + ${montant(o.rsTva.montant)}` : ''}</td><td style={nombre}>{montant(o.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.bloque && <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#b91c1c' }}><span aria-hidden="true">⛔</span> {p.bloque} — page <Link to={lienTiers} style={lienTexte}>Tiers</Link></div>}
      {p.avertissements.map((a, i) => <div key={`${a.code}-${i}`} style={{ marginTop: 4, fontSize: '0.76rem', color: a.code === 'NON_REGLE' ? '#64748b' : '#92400e' }}><span aria-hidden="true">{a.code === 'NON_REGLE' ? 'ℹ️' : '⚠️'}</span> {a.message}</div>)}
    </div>
  );
}

// Le message d'un refus : un téléchargement rend un blob, son JSON est relu.
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

const cadre: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'clip', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const carteVide: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '22px 24px', maxWidth: 640 };
const enTeteCadre: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', background: 'linear-gradient(135deg,#f8faff,#eef2ff)', flexWrap: 'wrap' };
const titreCadre: React.CSSProperties = { fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem', margin: 0 };
const cellule: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };
const nombre: React.CSSProperties = { ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
const lien: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: '#4338ca', fontWeight: 700, fontSize: '0.74rem', padding: '2px 4px', fontFamily: 'inherit' };
const lienTexte: React.CSSProperties = { color: '#4338ca', fontWeight: 700, textDecoration: 'none' };
// Texte lu par les lecteurs d'écran, invisible (en-tête d'une colonne de boutons).
const cache: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };
