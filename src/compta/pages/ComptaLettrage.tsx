import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useConfirm } from '../../components/common/ConfirmDialog';
import BoutonAide from '../BoutonAide';
import { ChoixTiers } from '../ChoixTiers';
import { messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import { LIBELLES_ETAT, fmtJour, fmtMontant, versMillimes } from '../ecritures';
import {
  LIBELLES_MOTIF, comptesCoches, delettrer, lettrer, lireLettrage, lireTiersLettrage, piedSelection,
  type LettrageReponse, type LigneALettrer, type Proposition, type TiersLettrageReponse,
} from '../lettrage';
import { bouton, pastille, petit } from '../styles';

// « Lettrage » (LabFlow Compta, étape S7a ; labflow-reprise/achats-compta/PLAN-S7.md §2 « S7a », §4 « Lettrage » et
// « Droits » ; réponses du client du 09/10 — « ok pour les 9 » : seules les lignes d'écritures validées se lettrent, une
// lettre = somme nulle) : choisir un tiers (recherche, ou les tiers qui ont des lignes à lettrer), cocher ses lignes non
// lettrées — le pied donne le total coché au débit, au crédit et l'écart ; « Lettrer » à écart nul sur un seul compte ;
// « Proposer » liste les rapprochements évidents (même pièce, même montant), à cocher un par un ou à lettrer tous ; les
// lettres du tiers repliées, avec « Délettrer ». Le serveur contrôle et décide ; chaque action rend l'état du tiers, que
// l'écran remplace ; un refus sur un état périmé (404, 409) relit la page (convention de S3c). Lecture pour tout accès ;
// lettrer et délettrer : titulaire, Complet, Saisie.
type Role = 'titulaire' | 'gerant';
const mono = 'ui-monospace, monospace';
const pluriel = (n: number, un: string, des: string) => `${n} ${n > 1 ? des : un}`;
const montant = (v: string) => ((versMillimes(v) ?? 0n) !== 0n ? fmtMontant(v) : '');
const quand = (d: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const numero = (l: LigneALettrer) => l.ecriture.numero || l.ecriture.numeroProvisoire;

// Une page par dossier : changer de dossier (navigation directe) repart d'un état neuf.
export default function ComptaLettragePage() {
  const { dossierId } = useParams();
  return <ComptaLettrage key={dossierId} dossierId={dossierId} />;
}

function ComptaLettrage({ dossierId }: { dossierId?: string }) {
  const { confirm } = useConfirm();
  const [parametres, setParametres] = useSearchParams();
  const [etatPx, setEtatPx] = useState<LettrageReponse | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'erreur'>('chargement');
  // Le tiers choisi (aussi dans l'adresse : ?tiers=, lien de la page Tiers) et ce qui en est lu (clé = son identifiant).
  const [tiersId, setTiersId] = useState<number | null>(() => Number(parametres.get('tiers')) || null);
  const [lecture, setLecture] = useState<{ cle: number; valeur: TiersLettrageReponse } | null>(null);
  const [erreurLecture, setErreurLecture] = useState<{ cle: number; message: string } | null>(null);
  const [essai, setEssai] = useState(0);
  const forcer = useRef(false);
  const [cochees, setCochees] = useState<Set<number>>(() => new Set());
  const [voirPropositions, setVoirPropositions] = useState(false);
  const [depliees, setDepliees] = useState<Set<number>>(() => new Set());
  const [info, setInfo] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const occupeRef = useRef(false);
  const tour = useRef(0);
  const tourTiers = useRef(0);
  // La page est montée (une action finie après le départ ne relance rien) ; elle a déjà été lue une fois (une relecture
  // de fond qui échoue ne remplace pas la page par l'écran d'erreur : relecture de S7a).
  const monte = useRef(true);
  const lue = useRef(false);

  const charger = useCallback(() => {
    const moi = ++tour.current;
    lireLettrage(dossierId || '')
      .then((r) => { if (moi === tour.current) { lue.current = true; setEtatPx(r); setEtat('pret'); } })
      .catch((err) => {
        if (moi !== tour.current) return;
        if (statutDe(err) === 404) setEtat('introuvable');
        else if (lue.current) setErreur(messageDossier(err, 'Relecture de la page impossible : rechargez-la.'));
        else setEtat('erreur');
      });
  }, [dossierId]);
  useEffect(() => {
    monte.current = true;
    charger();
    return () => { monte.current = false; tour.current += 1; tourTiers.current += 1; };
  }, [charger]);

  const dossierIdNum = etatPx?.dossier.id ?? null;
  // Le tiers choisi, lu à chaque changement ; un tiers déjà servi n'est pas relu, sauf « Réessayer » ou après un refus.
  useEffect(() => {
    if (!dossierIdNum || !tiersId) return;
    if (lecture?.cle === tiersId && !forcer.current) return;
    forcer.current = false;
    const moi = ++tourTiers.current;
    lireTiersLettrage(dossierIdNum, tiersId)
      .then((r) => { if (moi === tourTiers.current) { setLecture({ cle: tiersId, valeur: r }); setErreurLecture(null); } })
      .catch((err) => { if (moi === tourTiers.current) setErreurLecture({ cle: tiersId, message: messageDossier(err, 'Lecture impossible, réessayez.') }); });
  }, [dossierIdNum, tiersId, lecture, essai]);

  const role: Role = etatPx?.dossier.espace.role || 'titulaire';
  const ouvert = !!etatPx && etatPx.etatAbonnement === 'actif';
  const dossierActif = !!etatPx && etatPx.dossier.etat === 'actif';
  const peutLettrer = !!etatPx && etatPx.droits.saisir && ouvert && dossierActif;
  const t = lecture && lecture.cle === tiersId ? lecture.valeur : null;
  const erreurTiers = erreurLecture && erreurLecture.cle === tiersId ? erreurLecture.message : '';
  const lignes = useMemo(() => t?.lignes ?? [], [t]);
  // Les lignes par identifiant (résumé des propositions, relu une fois par tiers lu).
  const parId = useMemo(() => new Map(lignes.map((l) => [l.id, l])), [lignes]);
  // Le choix du tiers : les tiers mouvementés, et le tiers lu s'il n'en est pas (ouvert depuis la page Tiers sans ligne).
  const tiersChoix = useMemo(() => {
    const liste = etatPx?.tiers ?? [];
    if (!t || liste.some((x) => x.id === t.tiers.id)) return liste;
    return [...liste, { ...t.tiers, compteId: t.tiers.compteId, retenue: null, nbALettrer: 0, nbBrouillard: 0, nbLettrees: 0 }];
  }, [etatPx, t]);
  const pied = piedSelection(lignes, cochees);
  const comptes = comptesCoches(lignes, cochees);
  const nbCochees = lignes.filter((l) => cochees.has(l.id)).length;
  const lettrable = peutLettrer && nbCochees >= 2 && pied.ecart === 0n && comptes.length === 1;
  // L'écart avec son sens : « 100,000 D » (les débits cochés dépassent les crédits), « 100,000 C » sinon.
  const ecartTexte = pied.ecart === 0n ? fmtMontant(0n) : `${fmtMontant(pied.ecart < 0n ? -pied.ecart : pied.ecart)} ${pied.ecart > 0n ? 'D' : 'C'}`;
  const raison = !peutLettrer ? '' : nbCochees < 2 ? 'Cochez au moins deux lignes qui se soldent (une facture et son règlement…).'
    : comptes.length > 1 ? `Les lignes d'une lettre sont sur un même compte collectif (ici ${comptes.join(' et ')}).`
      : pied.ecart !== 0n ? `Écart de ${ecartTexte} : une lettre se fait à écart nul (un règlement partiel reste non lettré jusqu'au solde).` : '';

  const choisirTiers = (id: number | null) => {
    setTiersId(id);
    setCochees(new Set());
    setVoirPropositions(false);
    setDepliees(new Set());
    setInfo('');
    setErreur('');
    setParametres(id ? { tiers: String(id) } : {}, { replace: true });
  };
  const relireTiers = () => { forcer.current = true; setErreurLecture(null); setEssai((n) => n + 1); };
  // L'état rendu par une action : remplacé ; la page (comptes rendus des tiers) est relue. Rien après le départ de la page.
  const appliquer = (r: TiersLettrageReponse, message: string) => {
    if (!monte.current) return;
    tourTiers.current += 1;
    setLecture({ cle: r.tiers.id, valeur: r });
    setCochees(new Set());
    setErreur('');
    setInfo(message);
    charger();
  };
  const agir = async (travail: () => Promise<void>, defaut: string) => {
    if (occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    try {
      await travail();
    } catch (err) {
      if (!monte.current) return;
      setInfo('');
      setErreur(messageDossier(err, defaut, role));
      const s = statutDe(err);
      if (s === 404 || s === 409) { setCochees(new Set()); relireTiers(); charger(); }
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };
  const lettrerCochees = () => {
    if (!etatPx || !t || !lettrable) return;
    const ids = lignes.filter((l) => cochees.has(l.id)).map((l) => l.id);
    void agir(async () => {
      const r = await lettrer(etatPx.dossier.id, t.tiers.id, [ids]);
      const f = r.faites?.[0];
      appliquer(r, f ? `${r.tiers.code} — lettre ${f.lettre} : ${pluriel(f.nbLignes, 'ligne lettrée', 'lignes lettrées')} pour ${fmtMontant(f.montant)}.` : `${r.tiers.code} : lignes lettrées.`);
    }, 'Lettrage impossible, réessayez.');
  };
  const lettrerPropositions = async () => {
    if (!etatPx || !t || !t.propositions.length) return;
    const ok = await confirm({
      title: `Lettrer ${pluriel(t.propositions.length, 'proposition', 'propositions')} ?`,
      message: `Chaque proposition reçoit sa lettre (${t.tiers.code}). Relisez-les d'abord : un même montant ne désigne pas toujours la même facture. Une lettre se défait à tout moment (Délettrer).`,
      details: [
        ...t.propositions.slice(0, 8).map((p) => `${LIBELLES_MOTIF[p.motif]} · ${fmtMontant(p.montant)} · ${resumeProposition(p, parId)}`),
        ...(t.propositions.length > 8 ? [`… et ${pluriel(t.propositions.length - 8, 'autre proposition', 'autres propositions')}`] : []),
      ],
      tone: 'primary',
      confirmLabel: 'Lettrer',
      icon: '🔗',
    });
    if (!ok) return;
    await agir(async () => {
      const r = await lettrer(etatPx.dossier.id, t.tiers.id, t.propositions.map((p) => p.lignes));
      setVoirPropositions(false);
      const faites = r.faites || [];
      const lettres = faites.length > 3 ? `${faites[0].lettre} à ${faites[faites.length - 1].lettre}` : faites.map((f) => f.lettre).join(', ');
      appliquer(r, `${r.tiers.code} — ${pluriel(faites.length, 'lettre faite', 'lettres faites')} : ${lettres}.`);
    }, 'Lettrage impossible, réessayez.');
  };
  const defaire = async (lettreId: number, lettre: string, nb: number) => {
    if (!etatPx || !t) return;
    const ok = await confirm({
      title: `Délettrer ${lettre} ?`,
      message: `Ses ${pluriel(nb, 'ligne redevient non lettrée', 'lignes redeviennent non lettrées')} (aucune écriture ne change : le lettrage est une marque). Le journal de la comptabilité garde la trace.`,
      tone: 'danger',
      confirmLabel: 'Délettrer',
      icon: '✂️',
    });
    if (!ok) return;
    await agir(async () => { const r = await delettrer(etatPx.dossier.id, lettreId); appliquer(r, `${r.tiers.code} — lettre ${lettre} défaite : ${pluriel(nb, 'ligne', 'lignes')} à relettrer.`); }, 'Délettrage impossible, réessayez.');
  };
  const basculer = (id: number) => setCochees((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const basculerLettre = (id: number) => setDepliees((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const retour = etatPx ? { lien: `/dossiers/${etatPx.dossier.id}`, libelle: etatPx.dossier.nom } : null;
  const aLettrer = (etatPx?.tiers ?? []).filter((x) => x.nbALettrer > 0).sort((a, b) => b.nbALettrer - a.nbALettrer).slice(0, 12);
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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🔗</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Lettrage</h1>
            {etatPx?.dossier.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Dossier archivé</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {etatPx
              ? `${pluriel(etatPx.nb.aLettrer, 'ligne validée à lettrer', 'lignes validées à lettrer')} · ${pluriel(etatPx.nb.lettres, 'lettre', 'lettres')}${etatPx.nb.brouillard ? ` · ${pluriel(etatPx.nb.brouillard, 'ligne en brouillard', 'lignes en brouillard')} (à valider d'abord)` : ''}`
              : 'Rapprocher les factures et leurs règlements, tiers par tiers'}
          </p>
        </div>
        <BoutonAide section="compta-lettrage" />
      </div>

      {etat === 'chargement' && <div className="loading-text">Chargement…</div>}
      {etat === 'erreur' && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Impossible de charger le lettrage.</span>
          <button type="button" onClick={() => { setEtat('chargement'); charger(); }} style={bouton('#b91c1c', '#fff', '#b91c1c')}>Réessayer</button>
        </div>
      )}
      {etat === 'introuvable' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '22px 24px', maxWidth: 640 }}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Ce dossier n'existe pas ou ne vous est pas ouvert</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
            Il a peut-être été supprimé, ou son accès vous a été retiré. <Link to="/" style={{ color: '#4338ca', fontWeight: 700 }}>Retour à vos comptabilités</Link>
          </p>
        </div>
      )}

      {etatPx && etat === 'pret' && (
        <>
          {!ouvert && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {texteEtatAbonnement(etatPx.etatAbonnement, role)} : le lettrage reste consultable mais ne change plus.
            </div>
          )}
          {etatPx.dossier.etat === 'archive' && ouvert && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Dossier archivé : son lettrage se lit mais ne change pas tant qu'il n'est pas désarchivé.
            </div>
          )}
          {ouvert && dossierActif && !etatPx.droits.saisir && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Votre niveau d'accès permet de consulter le lettrage ; le titulaire et les gérants de niveau Complet ou Saisie lettrent et délettrent.
            </div>
          )}

          {/* Le choix du tiers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14, marginBottom: 14, alignItems: 'start' }}>
            <ChoixTiers id="lt-tiers" libelle="Tiers (fournisseur ou client)" tiers={tiersChoix} valeur={tiersId} onChange={(x) => choisirTiers(x?.id ?? null)} facultatif disabled={occupe}
              vide="Aucun tiers n'a encore de ligne : saisissez et validez des écritures (page Écritures)." aide="Les tiers qui ont des lignes dans le dossier ; recherche par code ou par nom." />
            <div>
              <div style={lblBloc}>À lettrer</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {aLettrer.map((x) => (
                  <button key={x.id} type="button" onClick={() => choisirTiers(x.id)} disabled={occupe} title={`${x.nom} : ${pluriel(x.nbALettrer, 'ligne à lettrer', 'lignes à lettrer')}`}
                    aria-label={`${x.code} ${x.nom} : ${pluriel(x.nbALettrer, 'ligne à lettrer', 'lignes à lettrer')}`}
                    style={{ ...petit(x.id === tiersId ? '#1e1b4b' : '#fff', x.id === tiersId ? '#fff' : '#334155', x.id === tiersId ? '#1e1b4b' : '#cbd5e1'), fontFamily: mono }}>
                    {x.code} · {x.nbALettrer}
                  </button>
                ))}
                {!aLettrer.length && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Aucune ligne validée à lettrer.</span>}
              </div>
              <div style={{ marginTop: 10 }}>
                <Link to={`/dossiers/${etatPx.dossier.id}/echeancier`} style={{ ...petit('#fff', '#4338ca', '#c7d2fe'), textDecoration: 'none', display: 'inline-block' }}>📅 Échéancier</Link>
              </div>
            </div>
          </div>

          {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}
          {erreurTiers && (
            <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>{erreurTiers}</span>
              <button type="button" onClick={relireTiers} style={petit('#fff', '#b91c1c', '#fecaca')}>Réessayer</button>
            </div>
          )}

          {!tiersId && (
            <div style={{ ...cadre, padding: '18px 20px', fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
              Choisissez un tiers : ses lignes non lettrées s'affichent, à cocher. Une lettre réunit des lignes d'un même compte dont le total des débits égale le total des crédits (une facture et son règlement, plusieurs factures et un règlement global…). Seules les écritures validées se lettrent.
            </div>
          )}
          {tiersId && !t && !erreurTiers && <div className="loading-text">Lecture…</div>}

          {t && (
            <>
              {/* Les lignes non lettrées ; « clip » et non « hidden » : le pied reste collé au bas de la fenêtre (relecture). */}
              <div style={{ ...cadre, overflow: 'clip' }}>
                <div style={enTeteCadre}>
                  <span role="status" aria-live="polite" style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>
                    {t.tiers.code} — {t.tiers.nom} · {pluriel(t.total, 'ligne non lettrée', 'lignes non lettrées')}{t.totaux.nbBrouillard ? ` dont ${t.totaux.nbBrouillard} en brouillard` : ''}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.78rem', color: '#475569' }}>Solde non lettré : <strong style={{ fontFamily: mono }}>{t.totaux.soldeDebit !== '0.000' ? `${fmtMontant(t.totaux.soldeDebit)} D` : t.totaux.soldeCredit !== '0.000' ? `${fmtMontant(t.totaux.soldeCredit)} C` : fmtMontant('0.000')}</strong></span>
                    {t.propositions.length > 0 && (
                      <button type="button" onClick={() => setVoirPropositions((v) => !v)} aria-expanded={voirPropositions} aria-controls="lt-propositions" style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>
                        💡 {voirPropositions ? 'Masquer les propositions' : `Proposer (${t.propositions.length})`}
                      </button>
                    )}
                  </span>
                </div>
                {voirPropositions && t.propositions.length > 0 && (
                  <div id="lt-propositions" style={{ padding: '10px 18px', background: '#fefce8', borderBottom: '1px solid #fde68a' }}>
                    <div style={{ fontSize: '0.78rem', color: '#854d0e', marginBottom: 8 }}>Rapprochements évidents parmi les lignes validées (une écriture contre-passée avec sa contre-passation, puis même pièce qui se solde, puis même montant, la plus ancienne avec la plus ancienne). Relisez-les : rien n'est lettré sans vous.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {t.propositions.map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.8rem' }}>
                          <span style={pastille(p.motif === 'piece' ? '#e0e7ff' : '#f1f5f9', p.motif === 'piece' ? '#3730a3' : '#475569')}>{LIBELLES_MOTIF[p.motif]}</span>
                          <span style={{ fontFamily: mono, fontWeight: 700 }}>{fmtMontant(p.montant)}</span>
                          <span style={{ color: '#334155', overflowWrap: 'anywhere', flex: '1 1 200px' }}>{resumeProposition(p, parId)}</span>
                          {peutLettrer && <button type="button" onClick={() => setCochees(new Set(p.lignes))} aria-label={`Cocher la proposition ${fmtMontant(p.montant)} : ${resumeProposition(p, parId)}`} style={petit('#fff', '#4338ca', '#c7d2fe')}>Cocher</button>}
                        </div>
                      ))}
                    </div>
                    {peutLettrer && (
                      <div style={{ marginTop: 10 }}>
                        <button type="button" onClick={lettrerPropositions} disabled={occupe} style={bouton('#4338ca', '#fff', '#4338ca')}>🔗 Lettrer les propositions ({t.propositions.length})</button>
                      </div>
                    )}
                  </div>
                )}
                {lignes.length === 0 && (
                  <p style={{ margin: 0, padding: '16px 18px', fontSize: '0.84rem', color: '#64748b' }}>
                    {t.nbLettres > 0 ? 'Aucune ligne non lettrée : le compte de ce tiers est entièrement lettré.' : 'Aucune ligne pour ce tiers : saisissez et validez ses écritures (page Écritures).'}
                  </p>
                )}
                {lignes.length > 0 && (
                  <div style={{ overflowX: 'auto', position: 'relative' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 820 }}>
                      <thead>
                        <tr style={{ color: '#64748b', textAlign: 'left' }}>
                          {peutLettrer && <th style={cellule}><span style={cache}>Cocher</span></th>}<th style={cellule}>Date</th><th style={cellule}>Journal</th><th style={cellule}>Numéro</th><th style={cellule}>Pièce</th><th style={cellule}>Libellé</th><th style={cellule}>Compte</th>
                          <th style={{ ...cellule, textAlign: 'right' }}>Débit</th><th style={{ ...cellule, textAlign: 'right' }}>Crédit</th><th style={cellule}>Échéance</th><th style={cellule}>État</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lignes.map((l) => {
                          const brouillard = l.ecriture.etat !== 'validee';
                          const coche = cochees.has(l.id);
                          return (
                            <tr key={l.id} style={{ borderTop: '1px solid #f1f5f9', background: coche ? '#eef2ff' : brouillard ? '#fffbeb' : '#fff' }}>
                              {peutLettrer && (
                                <td style={cellule}>
                                  <input type="checkbox" checked={coche} disabled={brouillard || occupe} onChange={() => basculer(l.id)}
                                    aria-label={`Cocher ${l.ecriture.reference} du ${fmtJour(l.date)} (${montant(l.debit) || montant(l.credit)})`} title={brouillard ? 'Écriture en brouillard : validez-la d\'abord (page Écritures)' : undefined} />
                                </td>
                              )}
                              <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{fmtJour(l.date)}</td>
                              <td style={cellule}><span style={pastille('#eef2ff', '#3730a3')}>{l.ecriture.journal}</span></td>
                              <td style={{ ...cellule, fontFamily: mono, fontWeight: 800, color: '#1e1b4b', whiteSpace: 'nowrap' }}>{numero(l)}</td>
                              <td style={{ ...cellule, fontFamily: mono, fontSize: '0.76rem', color: '#64748b', whiteSpace: 'nowrap' }}>{l.ecriture.reference}</td>
                              <td style={{ ...cellule, color: '#0f172a', minWidth: 150 }}>{l.libelle}</td>
                              <td style={{ ...cellule, fontFamily: mono }}>{l.compte.numero}</td>
                              <td style={nombre}>{montant(l.debit)}</td><td style={nombre}>{montant(l.credit)}</td>
                              <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{l.echeance ? fmtJour(l.echeance) : ''}</td>
                              <td style={cellule}><span style={pastille(brouillard ? '#fef3c7' : '#dcfce7', brouillard ? '#92400e' : '#166534')}>{LIBELLES_ETAT[l.ecriture.etat]}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {t.total > lignes.length && <p style={{ margin: 0, padding: '8px 18px', fontSize: '0.76rem', color: '#64748b' }}>Les {lignes.length} lignes les plus anciennes sont affichées sur {t.total} : lettrez-les, les suivantes viendront.</p>}
                {lignes.length > 0 && peutLettrer && (
                  <div style={{ position: 'sticky', bottom: 0, padding: '10px 18px', borderTop: '2px solid #c7d2fe', background: '#f8faff', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span role="status" aria-live="polite" style={{ fontSize: '0.82rem', color: '#1e1b4b', fontWeight: 700 }}>
                      {pluriel(nbCochees, 'ligne cochée', 'lignes cochées')} · débit <span style={{ fontFamily: mono }}>{fmtMontant(pied.debit)}</span> · crédit <span style={{ fontFamily: mono }}>{fmtMontant(pied.credit)}</span> · écart <span style={{ fontFamily: mono, color: pied.ecart === 0n ? '#166534' : '#b91c1c' }}>{ecartTexte}</span>
                    </span>
                    <span style={{ flex: '1 1 10px' }} />
                    {peutLettrer && nbCochees > 0 && <button type="button" onClick={() => setCochees(new Set())} disabled={occupe} style={petit('#fff', '#475569', '#cbd5e1')}>Tout décocher</button>}
                    {peutLettrer && <button type="button" onClick={lettrerCochees} disabled={occupe || !lettrable} title={raison || 'Lettrer les lignes cochées'} style={{ ...bouton(lettrable ? '#4338ca' : '#e5e7eb', lettrable ? '#fff' : '#9ca3af', lettrable ? '#4338ca' : '#e5e7eb') }}>{occupe ? 'Lettrage…' : '🔗 Lettrer'}</button>}
                    {raison && nbCochees > 0 && <div style={{ flexBasis: '100%', fontSize: '0.76rem', color: '#b45309' }}>{raison}</div>}
                  </div>
                )}
              </div>

              {/* Les lettres du tiers */}
              <div style={{ ...cadre, marginTop: 16 }}>
                <div style={enTeteCadre}>
                  <span style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>Lettres de {t.tiers.code} · {t.nbLettres}</span>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Les plus récentes d'abord{t.nbLettres > t.lettres.length ? ` (${t.lettres.length} affichées)` : ''} · dépliez pour voir les lignes</span>
                </div>
                {t.lettres.length === 0 && <p style={{ margin: 0, padding: '14px 18px', fontSize: '0.84rem', color: '#64748b' }}>Aucune lettre pour ce tiers.</p>}
                {t.lettres.map((x) => {
                  const ouverte = depliees.has(x.id);
                  return (
                    <div key={x.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', flexWrap: 'wrap', background: ouverte ? '#f8faff' : '#fff' }}>
                        <button type="button" onClick={() => basculerLettre(x.id)} aria-expanded={ouverte} aria-controls={`lettre-${x.id}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.84rem', padding: 0, flex: '1 1 260px', textAlign: 'left', minWidth: 0 }}>
                          <span style={{ color: '#94a3b8', fontSize: '0.7rem', width: 10 }}>{ouverte ? '▾' : '▸'}</span>
                          <span style={{ fontFamily: mono, fontWeight: 900, color: '#4338ca', fontSize: '0.95rem' }}>{x.lettre}</span>
                          <span style={{ fontFamily: mono, color: '#475569' }}>{x.compte.numero}</span>
                          <span style={{ fontFamily: mono, fontWeight: 700, color: '#0f172a' }}>{fmtMontant(x.montant)}</span>
                          <span style={{ color: '#64748b', fontSize: '0.76rem' }}>{pluriel(x.nbLignes, 'ligne', 'lignes')}{x.lignes.length < x.nbLignes ? ` (${x.lignes.length} affichées)` : ''}{x.creePar ? ` · ${x.creePar}` : ''} · {quand(x.creeLe)}</span>
                        </button>
                        {peutLettrer && <button type="button" onClick={() => defaire(x.id, x.lettre, x.nbLignes)} disabled={occupe} aria-label={`Délettrer ${x.lettre} (${fmtMontant(x.montant)})`} style={petit('#fff', '#be123c', '#fecdd3')}>✂️ Délettrer</button>}
                      </div>
                      {ouverte && (
                        <div id={`lettre-${x.id}`} style={{ padding: '0 18px 10px 38px', background: '#f8faff', overflowX: 'auto', position: 'relative' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: 560 }}>
                            <tbody>
                              {x.lignes.map((l) => (
                                <tr key={l.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                  <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{fmtJour(l.date)}</td>
                                  <td style={{ ...cellule, fontFamily: mono, fontWeight: 700 }}>{numero(l)}</td>
                                  <td style={{ ...cellule, fontFamily: mono, color: '#64748b' }}>{l.ecriture.reference}</td>
                                  <td style={cellule}>{l.libelle}</td>
                                  <td style={nombre}>{montant(l.debit)}</td><td style={nombre}>{montant(l.credit)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <p style={{ margin: '12px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
            Le lettrage est une marque, jamais une écriture (NC 01) : lettrer ou délettrer ne change aucun solde. Une écriture contre-passée est délettrée d'office ; sa contre-passation se lettre avec elle (même pièce). La lettre se voit aussi dans le grand livre (page Livres).
          </p>
        </>
      )}
    </div>
  );
}

// « F-0305 (05/03) ↔ RLV-0401 (01/04) » : les pièces d'une proposition, lues parmi les lignes affichées.
function resumeProposition(p: Proposition, parId: Map<number, LigneALettrer>) {
  return p.lignes.map((id) => parId.get(id)).filter((l): l is LigneALettrer => !!l).map((l) => `${l.ecriture.reference} (${fmtJour(l.date).slice(0, 5)})`).join(' ↔ ');
}

const cadre: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const enTeteCadre: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', background: 'linear-gradient(135deg,#f8faff,#eef2ff)', flexWrap: 'wrap' };
const cellule: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };
const nombre: React.CSSProperties = { ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
const lblBloc: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };
// Texte lu par les lecteurs d'écran, invisible (en-tête de la colonne des cases).
const cache: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };
