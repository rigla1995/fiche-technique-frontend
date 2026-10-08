import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import BoutonAide from '../BoutonAide';
import { ChoixCompte } from '../ChoixCompte';
import { ChoixTiers } from '../ChoixTiers';
import { messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import { LIBELLES_ETAT, fmtJour, fmtMontant, libellePeriode, periodeDe, versMillimes, type Ecriture, type PeriodeExercice } from '../ecritures';
import {
  LIBELLES_TYPE_BALANCE, VUES, estControleGenerale, estVue, lireBalance, lireGrandLivre, lireJournal, lireLivres, telechargerBalance, telechargerGrandLivre, telechargerJournal, texteSolde,
  type BalanceReponse, type GrandLivreReponse, type JournalReponse, type LivresReponse, type ParametresLivres, type TypeBalance, type Vue,
} from '../livres';
import { bouton, inp, lbl, pastille, petit } from '../styles';

// « Livres » (LabFlow Compta, étape S6c ; labflow-reprise/achats-compta/PLAN-S6.md §2 « S6c », §4 « Livres » ; réponse 7
// du client du 08/10 : livres calculés à la demande) : trois onglets — le grand livre (un compte ou un tiers : solde
// d'ouverture, lignes dans l'ordre chronologique avec le solde après chacune, par pages de 100), la balance (générale par
// compte, auxiliaire par fournisseur ou client : ouverture, mouvements, soldes, totaux, contrôles NC 01) et le livre-journal
// (les écritures d'un journal avec leurs lignes, par pages de 50) — sur une sélection commune : exercice, période (un mois
// ou l'exercice entier), brouillard compris ou non ; « Exporter (Excel) » avec la sélection en cours. Le serveur calcule et
// décide ; l'écran choisit et montre. Lecture pour tout accès au dossier. Les lectures sont numérotées : une réponse partie
// avant la dernière demande n'écrase jamais la dernière ; l'onglet et la sélection vivent dans l'adresse (?vue=…).
type Role = 'titulaire' | 'gerant';
type Lecture<T> = { cle: string; valeur: T } | null;
const mono = 'ui-monospace, monospace';
const pluriel = (n: number, un: string, des: string) => `${n} ${n > 1 ? des : un}`;
const nonNul = (v: string) => versMillimes(v) !== 0n;
const montant = (v: string) => (nonNul(v) ? fmtMontant(v) : '');

// Une page par dossier : changer de dossier (navigation directe) repart d'un état neuf.
export default function ComptaLivresPage() {
  const { dossierId } = useParams();
  return <ComptaLivres key={dossierId} dossierId={dossierId} />;
}

function ComptaLivres({ dossierId }: { dossierId?: string }) {
  const [parametres, setParametres] = useSearchParams();
  const vueInitiale = parametres.get('vue');
  const [vue, setVue] = useState<Vue>(estVue(vueInitiale) ? vueInitiale : 'balance');
  const [etatPx, setEtatPx] = useState<LivresReponse | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'erreur'>('chargement');
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [occupe, setOccupe] = useState(false);
  const occupeRef = useRef(false);
  // La sélection commune ; l'exercice se pose à la première réponse (celui par défaut du serveur).
  const [exerciceId, setExerciceId] = useState<number | null>(null);
  const [periodeId, setPeriodeId] = useState<number | null>(null);
  const [brouillard, setBrouillard] = useState(true);
  // Les choix propres à chaque onglet.
  const [typeBalance, setTypeBalance] = useState<TypeBalance>('generale');
  const [compteId, setCompteId] = useState<number | null>(null);
  const [tiersId, setTiersId] = useState<number | null>(null);
  const [journalId, setJournalId] = useState<number | null>(null);
  // Ce qui est lu : la clé dit pour quelle sélection ; une clé différente de la demande en cours = lecture en route.
  const [balance, setBalance] = useState<Lecture<BalanceReponse>>(null);
  const [grandLivre, setGrandLivre] = useState<Lecture<GrandLivreReponse>>(null);
  const [journal, setJournal] = useState<Lecture<JournalReponse>>(null);
  // L'erreur d'une lecture, avec la clé qu'elle concerne (affichée sur son onglet seulement) ; « Réessayer » relance.
  const [erreurLecture, setErreurLecture] = useState<{ cle: string; message: string } | null>(null);
  const [essai, setEssai] = useState(0);
  const forcer = useRef(false);
  const [plus, setPlus] = useState(false);
  const tour = useRef(0);
  const tourLivre = useRef(0);

  const charger = useCallback(() => {
    const moi = ++tour.current;
    lireLivres(dossierId || '')
      .then((r) => {
        if (moi !== tour.current) return;
        setEtatPx(r);
        setEtat('pret');
        setExerciceId((x) => x ?? r.exerciceParDefaut);
        setJournalId((j) => j ?? (r.journaux.find((x) => x.actif)?.id ?? null));
      })
      .catch((err) => { if (moi === tour.current) setEtat(statutDe(err) === 404 ? 'introuvable' : 'erreur'); });
  }, [dossierId]);
  useEffect(() => { charger(); return () => { tour.current += 1; tourLivre.current += 1; }; }, [charger]);

  const exercice = useMemo(() => etatPx?.exercices.find((x) => x.id === exerciceId) || null, [etatPx, exerciceId]);
  const periodes = exercice?.periodes ?? [];
  const selection: ParametresLivres = useMemo(() => ({ exerciceId, periodeId, brouillard }), [exerciceId, periodeId, brouillard]);
  const cleCommune = `${exerciceId ?? ''}\u0000${periodeId ?? ''}\u0000${brouillard ? 1 : 0}`;
  const cleBalance = `${cleCommune}\u0000${typeBalance}`;
  const cleGrandLivre = `${cleCommune}\u0000${compteId ?? ''}\u0000${tiersId ?? ''}`;
  const cleJournal = `${cleCommune}\u0000${journalId ?? ''}`;
  const dossierIdNum = etatPx?.dossier.id ?? null;

  const cleCourante = vue === 'balance' ? cleBalance : vue === 'grand-livre' ? cleGrandLivre : cleJournal;
  // Le livre de l'onglet courant, relu à chaque changement de sélection ; rien n'est demandé sans exercice, ni sans
  // compte / tiers (grand livre), ni sans journal (livre-journal). Un livre déjà servi pour la même clé (retour sur un onglet)
  // n'est pas relu : les pages cumulées par « Afficher plus » restent — sauf « Réessayer » (`forcer`). Un refus sur un état
  // périmé (404, 409 : exercice, période, compte, tiers, journal, dossier) relit l'état de la page (convention de S3c).
  useEffect(() => {
    if (!dossierIdNum || !exerciceId) return;
    const servi = vue === 'balance' ? balance?.cle === cleBalance : vue === 'grand-livre' ? grandLivre?.cle === cleGrandLivre : journal?.cle === cleJournal;
    if (servi && !forcer.current) return;
    forcer.current = false;
    const moi = ++tourLivre.current;
    const cle = vue === 'balance' ? cleBalance : vue === 'grand-livre' ? cleGrandLivre : cleJournal;
    const fini = (f: () => void) => { if (moi === tourLivre.current) { f(); setErreurLecture(null); setPlus(false); } };
    const raté = (err: unknown) => {
      if (moi !== tourLivre.current) return;
      setErreurLecture({ cle, message: messageDossier(err, 'Lecture impossible, réessayez.') });
      setPlus(false);
      const s = statutDe(err);
      if (s === 404 || s === 409) charger();
    };
    if (vue === 'balance') {
      lireBalance(dossierIdNum, selection, typeBalance).then((r) => fini(() => setBalance({ cle: cleBalance, valeur: r }))).catch(raté);
    } else if (vue === 'grand-livre') {
      if (!compteId && !tiersId) return;
      lireGrandLivre(dossierIdNum, selection, { compteId, tiersId }, 1).then((r) => fini(() => setGrandLivre({ cle: cleGrandLivre, valeur: r }))).catch(raté);
    } else if (journalId) {
      lireJournal(dossierIdNum, selection, journalId, 1).then((r) => fini(() => setJournal({ cle: cleJournal, valeur: r }))).catch(raté);
    }
  }, [vue, dossierIdNum, exerciceId, selection, typeBalance, compteId, tiersId, journalId, cleBalance, cleGrandLivre, cleJournal, balance, grandLivre, journal, essai, charger]);

  const changerVue = (v: Vue) => { setVue(v); setInfo(''); setErreur(''); setParametres({ vue: v }, { replace: true }); };
  const role: Role = etatPx?.dossier.espace.role || 'titulaire';
  const b = balance && balance.cle === cleBalance ? balance.valeur : null;
  const g = grandLivre && grandLivre.cle === cleGrandLivre ? grandLivre.valeur : null;
  const j = journal && journal.cle === cleJournal ? journal.valeur : null;
  const erreurCourante = erreurLecture && erreurLecture.cle === cleCourante ? erreurLecture.message : '';
  const lecture = !!exerciceId && ((vue === 'balance' && !b) || (vue === 'grand-livre' && (!!compteId || !!tiersId) && !g) || (vue === 'journaux' && !!journalId && !j)) && !erreurCourante;
  // Le texte d'un cadre sans livre : aucun exercice, lecture refusée, ou lecture en cours.
  const vide = !exerciceId ? 'Aucun exercice dans ce dossier : aucun livre à lire.' : erreurCourante ? 'Lecture impossible : corrigez la sélection ou réessayez.' : 'Lecture…';
  const reessayer = () => { forcer.current = true; setErreurLecture(null); setEssai((n) => n + 1); };

  // « Afficher plus » : la page suivante du grand livre ou du livre-journal, ajoutée à ce qui est lu (le cumul des soldes
  // est calculé par le serveur sur toute la sélection : la page n reprend au bon solde).
  const afficherPlus = async () => {
    if (!dossierIdNum || plus) return;
    setPlus(true);
    const moi = ++tourLivre.current;
    try {
      if (vue === 'grand-livre' && g) {
        const r = await lireGrandLivre(dossierIdNum, selection, { compteId, tiersId }, Math.floor(g.lignes.length / g.limite) + 1);
        if (moi === tourLivre.current) { const vus = new Set(g.lignes.map((l) => l.id)); setGrandLivre({ cle: cleGrandLivre, valeur: { ...r, lignes: [...g.lignes, ...r.lignes.filter((l) => !vus.has(l.id))] } }); }
      } else if (vue === 'journaux' && j && journalId) {
        const r = await lireJournal(dossierIdNum, selection, journalId, Math.floor(j.ecritures.length / j.limite) + 1);
        if (moi === tourLivre.current) { const vus = new Set(j.ecritures.map((e) => e.id)); setJournal({ cle: cleJournal, valeur: { ...r, ecritures: [...j.ecritures, ...r.ecritures.filter((e) => !vus.has(e.id))] } }); }
      }
    } catch (err) {
      if (moi === tourLivre.current) setErreur(messageDossier(err, 'Lecture impossible, réessayez.', role));
    } finally {
      // Toujours (relecture) : une sélection vidée pendant la lecture n'appelle aucune lecture qui le remettrait.
      setPlus(false);
    }
  };
  const exporter = async () => {
    if (!dossierIdNum || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    setErreur('');
    setInfo('');
    try {
      if (vue === 'balance') { await telechargerBalance(dossierIdNum, selection, typeBalance); setInfo('Balance exportée (Excel).'); } else if (vue === 'grand-livre') { await telechargerGrandLivre(dossierIdNum, selection, { compteId, tiersId }); setInfo('Grand livre exporté (Excel).'); } else if (journalId) { await telechargerJournal(dossierIdNum, selection, journalId); setInfo('Livre-journal exporté (Excel).'); }
    } catch (err) {
      setErreur(messageDossier(err, 'Export impossible, réessayez.', role));
      const s = statutDe(err);
      if (s === 404 || s === 409) charger();
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };
  const exportable = !!exerciceId && (vue === 'balance' || (vue === 'grand-livre' && (!!compteId || !!tiersId)) || (vue === 'journaux' && !!journalId));

  const retour = etatPx ? { lien: `/dossiers/${etatPx.dossier.id}`, libelle: etatPx.dossier.nom } : null;
  const vueCourante = VUES.find((v) => v.valeur === vue) || VUES[1];
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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📚</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Livres</h1>
            {etatPx?.dossier.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Dossier archivé</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {etatPx
              ? `${pluriel(etatPx.nb.validees, 'écriture validée', 'écritures validées')} · ${pluriel(etatPx.nb.brouillard, 'en brouillard', 'en brouillard')}${exercice ? ` · exercice du ${fmtJour(exercice.debut)} au ${fmtJour(exercice.fin)}` : ' · aucun exercice'}`
              : 'Grand livre, balance et livre-journal, calculés à la demande sur les écritures'}
          </p>
        </div>
        <BoutonAide section="compta-livres" />
      </div>

      {etat === 'chargement' && <div className="loading-text">Chargement…</div>}
      {etat === 'erreur' && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Impossible de charger les livres.</span>
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
          {etatPx.etatAbonnement !== 'actif' && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {texteEtatAbonnement(etatPx.etatAbonnement, role)} : les livres restent consultables.
            </div>
          )}
          {!etatPx.exercices.length && (
            <div role="status" style={{ ...alerte, background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e', marginBottom: 16 }}>
              Aucun exercice dans ce dossier : aucun livre à lire.
            </div>
          )}

          {/* Les onglets */}
          <div role="tablist" aria-label="Livres" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {VUES.map((v) => (
              <button key={v.valeur} type="button" role="tab" aria-selected={vue === v.valeur} onClick={() => changerVue(v.valeur)}
                style={{ ...bouton(vue === v.valeur ? '#1e1b4b' : '#fff', vue === v.valeur ? '#fff' : '#334155', vue === v.valeur ? '#1e1b4b' : '#cbd5e1') }}>
                {v.icone} {v.libelle}
              </button>
            ))}
          </div>

          {/* La sélection commune */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <label htmlFor="fl-exercice" style={lbl}>Exercice</label>
              <select id="fl-exercice" value={exerciceId ?? ''} onChange={(e) => { setExerciceId(e.target.value ? Number(e.target.value) : null); setPeriodeId(null); setInfo(''); }} style={{ ...inp, width: 'auto', minWidth: 190 }}>
                {!etatPx.exercices.length && <option value="">Aucun exercice</option>}
                {etatPx.exercices.map((x) => <option key={x.id} value={x.id}>{fmtJour(x.debut)} → {fmtJour(x.fin)}{x.etat === 'clos' ? ' (clos)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fl-periode" style={lbl}>Période</label>
              <select id="fl-periode" value={periodeId ?? ''} onChange={(e) => { setPeriodeId(e.target.value ? Number(e.target.value) : null); setInfo(''); }} style={{ ...inp, width: 'auto', minWidth: 170 }}>
                <option value="">Exercice entier</option>
                {periodes.map((p) => <option key={p.id} value={p.id}>{libellePeriode(p)}{p.etat === 'close' ? ' (close)' : ''}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#334155', fontWeight: 600, padding: '9px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={brouillard} onChange={(e) => { setBrouillard(e.target.checked); setInfo(''); }} />
              Brouillard compris
            </label>
            {vue === 'balance' && (
              <div>
                <label htmlFor="fl-type" style={lbl}>Balance</label>
                <select id="fl-type" value={typeBalance} onChange={(e) => { setTypeBalance(e.target.value as TypeBalance); setInfo(''); }} style={{ ...inp, width: 'auto', minWidth: 200 }}>
                  {(Object.keys(LIBELLES_TYPE_BALANCE) as TypeBalance[]).map((t) => <option key={t} value={t}>{LIBELLES_TYPE_BALANCE[t]}</option>)}
                </select>
              </div>
            )}
            {vue === 'journaux' && (
              <div>
                <label htmlFor="fl-journal" style={lbl}>Journal</label>
                <select id="fl-journal" value={journalId ?? ''} onChange={(e) => { setJournalId(e.target.value ? Number(e.target.value) : null); setInfo(''); }} style={{ ...inp, width: 'auto', minWidth: 190 }}>
                  <option value="">Choisissez le journal</option>
                  {etatPx.journaux.map((x) => <option key={x.id} value={x.id}>{x.code} — {x.libelle}{x.actif ? '' : ' (désactivé)'}</option>)}
                </select>
              </div>
            )}
            <span style={{ flex: '1 1 10px' }} />
            <button type="button" onClick={exporter} disabled={occupe || !exportable || lecture} style={{ ...petit('#f0fdf4', '#166534', '#bbf7d0'), marginBottom: 1, opacity: exportable ? 1 : 0.5 }} title={exportable ? `Exporter ${vueCourante.article} (Excel, sélection en cours)` : 'Choisissez d\'abord ce qu\'il faut exporter'}>
              {occupe ? 'Export…' : '📥 Exporter (Excel)'}
            </button>
          </div>
          {vue === 'grand-livre' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 14, marginBottom: 6 }}>
              <ChoixCompte id="fl-compte" libelle="Compte" comptes={etatPx.comptes} valeur={compteId} onChange={(id) => { setCompteId(id); setInfo(''); }} facultatif aide={etatPx.comptes.length ? 'Les comptes qui ont des lignes dans le dossier.' : 'Aucun compte mouvementé pour l\'instant.'} />
              <div style={{ marginBottom: 12 }}>
                <ChoixTiers id="fl-tiers" libelle="Tiers (fournisseur ou client)" tiers={etatPx.tiers} valeur={tiersId} onChange={(t) => { setTiersId(t?.id ?? null); setInfo(''); }} facultatif vide="Aucun tiers mouvementé pour l'instant." aide={tiersId || compteId ? 'Compte et tiers se combinent : le grand livre d\'un tiers sur un compte collectif.' : 'Choisissez un compte, un tiers, ou les deux.'} />
              </div>
            </div>
          )}
          {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}
          {erreurCourante && (
            <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>{erreurCourante}</span>
              <button type="button" onClick={reessayer} style={petit('#fff', '#b91c1c', '#fecaca')}>Réessayer</button>
            </div>
          )}

          {vue === 'balance' && <Balance b={b} lecture={lecture} vide={vide} />}
          {vue === 'grand-livre' && <GrandLivre g={g} lecture={lecture} vide={vide} choisi={!!compteId || !!tiersId} plus={plus} afficherPlus={afficherPlus} dossierId={etatPx.dossier.id} periodes={periodes} />}
          {vue === 'journaux' && <LivreJournal j={j} lecture={lecture} vide={vide} choisi={!!journalId} plus={plus} afficherPlus={afficherPlus} dossierId={etatPx.dossier.id} periodes={periodes} />}
          <p style={{ margin: '12px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
            Les livres se lisent sur les écritures validées et en brouillard (décochez « Brouillard compris » pour un état définitif). Les à-nouveaux (journal AN) forment le solde d'ouverture et n'entrent jamais dans les mouvements (NC 01 §35, §36) ; total des journaux = total du grand livre = balance (§37, §40).
          </p>
        </>
      )}
    </div>
  );
}

// Une pastille « N en brouillard » quand des lignes en brouillard entrent dans un total.
function Brouillard({ n, lignes = true }: { n: number; lignes?: boolean }) {
  if (!n) return null;
  return <span style={pastille('#fef3c7', '#92400e')} title={`${pluriel(n, lignes ? 'ligne en brouillard comprise' : 'écriture en brouillard comprise', lignes ? 'lignes en brouillard comprises' : 'écritures en brouillard comprises')}`}>{n} brouillard</span>;
}
// Le lien d'une écriture vers la page Écritures, filtrée sur le mois de sa date.
const lienEcritures = (dossierId: number, periodes: PeriodeExercice[], date: string) => { const p = periodeDe(periodes, date); return `/dossiers/${dossierId}/ecritures${p ? `?periode=${p.id}` : ''}`; };
const Attente = ({ lecture, texte }: { lecture: boolean; texte: string }) => (
  <p style={{ margin: 0, padding: '16px 18px', fontSize: '0.84rem', color: '#64748b', lineHeight: 1.6 }}>{lecture ? 'Lecture…' : texte}</p>
);

// ── Balance ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function Balance({ b, lecture, vide }: { b: BalanceReponse | null; lecture: boolean; vide: string }) {
  const generale = !b || b.type === 'generale';
  return (
    <div style={cadre}>
      <div style={enTeteCadre}>
        <span role="status" aria-live="polite" style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>
          {!b ? (lecture ? 'Lecture…' : 'Balance') : `${LIBELLES_TYPE_BALANCE[b.type]} · ${b.selection.periode ? libellePeriode(b.selection.periode) : 'exercice entier'} · ${pluriel(b.rangees.length, generale ? 'compte' : 'tiers', generale ? 'comptes' : 'tiers')}`}
        </span>
        <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Ouverture = à-nouveaux et mouvements d'avant la période · mouvements de la période · solde</span>
      </div>
      {b && b.rangees.length === 0 && <Attente lecture={false} texte="Aucune ligne dans cette sélection." />}
      {!b && <Attente lecture={lecture} texte={vide} />}
      {b && b.rangees.length > 0 && (
        <div style={{ overflowX: 'auto', opacity: lecture ? 0.6 : 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 760 }}>
            <thead>
              <tr style={{ color: '#64748b', textAlign: 'left' }}>
                <th style={cellule}>{generale ? 'Compte' : 'Tiers'}</th><th style={cellule}>{generale ? 'Libellé' : 'Nom'}</th>
                <th style={{ ...cellule, textAlign: 'right' }}>Ouverture D</th><th style={{ ...cellule, textAlign: 'right' }}>Ouverture C</th>
                <th style={{ ...cellule, textAlign: 'right' }}>Mouvements D</th><th style={{ ...cellule, textAlign: 'right' }}>Mouvements C</th>
                <th style={{ ...cellule, textAlign: 'right' }}>Solde D</th><th style={{ ...cellule, textAlign: 'right' }}>Solde C</th><th style={cellule}><span style={cache}>Brouillard</span></th>
              </tr>
            </thead>
            <tbody>
              {b.rangees.map((r) => (
                <tr key={r.compte ? `k${r.compte.id}` : `t${r.tiers?.id}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ ...cellule, fontFamily: mono, fontWeight: 800, color: '#1e1b4b', whiteSpace: 'nowrap' }}>{r.compte ? r.compte.numero : r.tiers?.code}</td>
                  <td style={{ ...cellule, color: '#0f172a', minWidth: 160 }}>{r.compte ? r.compte.libelle : r.tiers?.nom}{r.tiers && !r.tiers.actif ? <span style={{ ...pastille('#f1f5f9', '#64748b'), marginLeft: 6 }}>désactivé</span> : null}</td>
                  <td style={nombre}>{montant(r.ouverture.soldeDebit)}</td><td style={nombre}>{montant(r.ouverture.soldeCredit)}</td>
                  <td style={nombre}>{montant(r.mouvements.debit)}</td><td style={nombre}>{montant(r.mouvements.credit)}</td>
                  <td style={{ ...nombre, fontWeight: 800 }}>{montant(r.soldeDebit)}</td><td style={{ ...nombre, fontWeight: 800 }}>{montant(r.soldeCredit)}</td>
                  <td style={cellule}><Brouillard n={r.nbBrouillard} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #c7d2fe', fontWeight: 800, background: '#f8faff' }}>
                <td style={cellule} colSpan={2}>Total</td>
                <td style={nombre}>{fmtMontant(b.totaux.ouverture.soldeDebit)}</td><td style={nombre}>{fmtMontant(b.totaux.ouverture.soldeCredit)}</td>
                <td style={nombre}>{fmtMontant(b.totaux.mouvements.debit)}</td><td style={nombre}>{fmtMontant(b.totaux.mouvements.credit)}</td>
                <td style={nombre}>{fmtMontant(b.totaux.soldeDebit)}</td><td style={nombre}>{fmtMontant(b.totaux.soldeCredit)}</td>
                <td style={cellule}><Brouillard n={b.totaux.nbBrouillard} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {b && (
        <div style={{ padding: '12px 18px', borderTop: '1px solid #f1f5f9', background: b.controles.coherent ? '#f0fdf4' : '#fef2f2', fontSize: '0.8rem', color: b.controles.coherent ? '#166534' : '#b91c1c' }}>
          {estControleGenerale(b.controles) ? (
            <>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                {b.controles.coherent ? '✓' : '⚠️'} Contrôles NC 01 (§37, §40), depuis l'ouverture de l'exercice jusqu'au {fmtJour(b.selection.a)}, à-nouveaux compris : total des journaux {fmtMontant(b.controles.totalJournaux.debit)} = total du grand livre {fmtMontant(b.controles.totalLignes.debit)} = total des écritures {fmtMontant(b.controles.totalEcritures.total)} ({pluriel(b.controles.totalEcritures.nb, 'écriture', 'écritures')}{b.controles.totalEcritures.nbBrouillard ? `, dont ${b.controles.totalEcritures.nbBrouillard} en brouillard` : ''}) ; débits = crédits {b.controles.totalLignes.debit === b.controles.totalLignes.credit ? '✓' : '≠ ' + fmtMontant(b.controles.totalLignes.credit)}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: '#475569' }}>
                {b.controles.journaux.map((x) => <span key={x.id} style={pastille('#fff', '#334155')} title={`${x.libelle} : ${pluriel(x.nbEcritures, 'écriture', 'écritures')}`}>{x.code} {fmtMontant(x.debit)}{x.debit !== x.credit ? ` / ${fmtMontant(x.credit)}` : ''}</span>)}
                {!b.controles.journaux.length && <span>Aucune écriture dans la sélection.</span>}
              </div>
            </>
          ) : (
            <div style={{ fontWeight: 800 }}>
              {b.controles.coherent ? '✓' : '⚠️'} Balance auxiliaire = comptes collectifs ({b.controles.nature}) : solde des collectifs {texteSolde(b.controles.collectifs, fmtMontant)}, mouvements {fmtMontant(b.controles.collectifs.mouvements.debit)} / {fmtMontant(b.controles.collectifs.mouvements.credit)}{b.controles.coherent ? '' : ' — écart avec les tiers : une ligne sur un compte collectif sans tiers, ou un tiers sur un autre compte'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Grand livre ─────────────────────────────────────────────────────────────────────────────────────────────────────
function GrandLivre({ g, lecture, vide, choisi, plus, afficherPlus, dossierId, periodes }: { g: GrandLivreReponse | null; lecture: boolean; vide: string; choisi: boolean; plus: boolean; afficherPlus: () => void; dossierId: number; periodes: PeriodeExercice[] }) {
  const titre = g ? [g.compte ? `${g.compte.numero} ${g.compte.libelle}` : null, g.tiers ? `${g.tiers.code} ${g.tiers.nom}` : null].filter(Boolean).join(' · ') : '';
  return (
    <>
      <div style={cadre}>
        <div style={enTeteCadre}>
          <span role="status" aria-live="polite" style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>
            {!g ? (lecture ? 'Lecture…' : 'Grand livre') : `${titre} · ${g.selection.periode ? libellePeriode(g.selection.periode) : 'exercice entier'} · ${pluriel(g.total, 'ligne', 'lignes')}`}
          </span>
          <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Ordre chronologique · solde après chaque ligne · par pages de {g?.limite ?? 100}</span>
        </div>
        {!choisi && <Attente lecture={false} texte="Choisissez un compte ou un tiers pour lire son grand livre." />}
        {choisi && !g && <Attente lecture={lecture} texte={vide} />}
        {g && (
          <div style={{ overflowX: 'auto', opacity: lecture ? 0.6 : 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 820 }}>
              <thead>
                <tr style={{ color: '#64748b', textAlign: 'left' }}>
                  <th style={cellule}>Date</th><th style={cellule}>Journal</th><th style={cellule}>Numéro</th><th style={cellule}>Pièce</th><th style={cellule}>Libellé</th><th style={cellule}>{g.compte && !g.tiers ? 'Tiers' : 'Compte'}</th>
                  <th style={{ ...cellule, textAlign: 'right' }}>Débit</th><th style={{ ...cellule, textAlign: 'right' }}>Crédit</th><th style={{ ...cellule, textAlign: 'right' }}>Solde</th><th style={cellule}>État</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderTop: '1px solid #f1f5f9', background: '#f8faff', fontWeight: 700 }}>
                  <td style={cellule} colSpan={6}>Solde d'ouverture <span style={{ fontWeight: 400, color: '#64748b' }}>(à-nouveaux et mouvements antérieurs)</span></td>
                  <td style={nombre}>{montant(g.ouverture.debit)}</td><td style={nombre}>{montant(g.ouverture.credit)}</td>
                  <td style={{ ...nombre, fontWeight: 800 }}>{texteSolde(g.ouverture, fmtMontant)}</td><td style={cellule}><Brouillard n={g.ouverture.nbBrouillard ?? 0} /></td>
                </tr>
                {g.lignes.map((l) => (
                  <tr key={l.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{fmtJour(l.date)}{l.ecriture.dateReelle ? <span style={{ color: '#b45309', fontSize: '0.72rem' }}> (op. {fmtJour(l.ecriture.dateReelle)})</span> : null}</td>
                    <td style={cellule}><span style={pastille('#eef2ff', '#3730a3')}>{l.ecriture.journal.code}</span></td>
                    <td style={{ ...cellule, whiteSpace: 'nowrap' }}><Link to={lienEcritures(dossierId, periodes, l.date)} style={{ fontFamily: mono, fontWeight: 800, color: '#1e1b4b', textDecoration: 'none' }} title="Voir sur la page Écritures (mois de l'écriture)">{l.ecriture.numero || l.ecriture.numeroProvisoire}</Link></td>
                    <td style={{ ...cellule, fontFamily: mono, fontSize: '0.76rem', color: '#64748b', overflowWrap: 'anywhere' }}>{l.ecriture.reference}</td>
                    <td style={{ ...cellule, color: '#0f172a', minWidth: 160 }}>{l.libelle}</td>
                    <td style={{ ...cellule, whiteSpace: 'nowrap' }}>{g.compte && !g.tiers ? (l.tiers ? <><span style={{ fontFamily: mono, fontWeight: 700 }}>{l.tiers.code}</span> {l.tiers.nom}</> : '—') : <><span style={{ fontFamily: mono, fontWeight: 700 }}>{l.compte.numero}</span> <span style={{ color: '#475569' }}>{l.compte.libelle}</span></>}</td>
                    <td style={nombre}>{montant(l.debit)}</td><td style={nombre}>{montant(l.credit)}</td>
                    <td style={{ ...nombre, fontWeight: 800 }}>{texteSolde(l, fmtMontant)}</td>
                    <td style={cellule}><span style={pastille(l.ecriture.etat === 'validee' ? '#dcfce7' : '#fef3c7', l.ecriture.etat === 'validee' ? '#166534' : '#92400e')}>{LIBELLES_ETAT[l.ecriture.etat]}</span></td>
                  </tr>
                ))}
                {g.lignes.length === 0 && <tr><td style={{ ...cellule, color: '#64748b' }} colSpan={10}>Aucune ligne dans cette sélection (le solde d'ouverture est reporté).</td></tr>}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #c7d2fe', fontWeight: 800, background: '#f8faff' }}>
                  <td style={cellule} colSpan={6}>Mouvements de la sélection ({pluriel(g.totaux.nbLignes, 'ligne', 'lignes')}) et solde <Brouillard n={g.totaux.nbBrouillard} /></td>
                  <td style={nombre}>{fmtMontant(g.totaux.debit)}</td><td style={nombre}>{fmtMontant(g.totaux.credit)}</td>
                  <td style={nombre}>{texteSolde(g.totaux, fmtMontant)}</td><td style={cellule} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      {g && g.lignes.length < g.total && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <button type="button" onClick={afficherPlus} disabled={plus || lecture} style={{ ...bouton('#fff', '#4338ca', '#c7d2fe'), opacity: plus ? 0.7 : 1 }}>{plus ? 'Lecture…' : `Afficher plus (${pluriel(g.total - g.lignes.length, 'autre ligne', 'autres lignes')})`}</button>
        </div>
      )}
    </>
  );
}

// ── Livre-journal ───────────────────────────────────────────────────────────────────────────────────────────────────
function LivreJournal({ j, lecture, vide, choisi, plus, afficherPlus, dossierId, periodes }: { j: JournalReponse | null; lecture: boolean; vide: string; choisi: boolean; plus: boolean; afficherPlus: () => void; dossierId: number; periodes: PeriodeExercice[] }) {
  return (
    <>
      <div style={cadre}>
        <div style={enTeteCadre}>
          <span role="status" aria-live="polite" style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>
            {!j ? (lecture ? 'Lecture…' : 'Livre-journal') : `${j.journal.code} — ${j.journal.libelle} · ${j.selection.periode ? libellePeriode(j.selection.periode) : 'exercice entier'} · ${pluriel(j.totaux.nbEcritures, 'écriture', 'écritures')}`}
          </span>
          <span style={{ fontSize: '0.76rem', color: '#64748b' }}>Ordre chronologique, chaque écriture avec ses lignes · par pages de {j?.limite ?? 50}</span>
        </div>
        {!choisi && <Attente lecture={false} texte="Choisissez le journal à lire." />}
        {choisi && !j && <Attente lecture={lecture} texte={vide} />}
        {j && j.ecritures.length === 0 && <Attente lecture={false} texte="Aucune écriture dans cette sélection." />}
        {j && j.ecritures.length > 0 && (
          <div style={{ overflowX: 'auto', opacity: lecture ? 0.6 : 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 760 }}>
              <thead>
                <tr style={{ color: '#64748b', textAlign: 'left' }}>
                  <th style={cellule}>Compte</th><th style={cellule}>Tiers</th><th style={cellule}>Libellé</th><th style={{ ...cellule, textAlign: 'right' }}>Débit</th><th style={{ ...cellule, textAlign: 'right' }}>Crédit</th><th style={cellule}>Taxe</th><th style={cellule}>Échéance</th>
                </tr>
              </thead>
              {j.ecritures.map((e: Ecriture) => (
                <tbody key={e.id}>
                  <tr style={{ borderTop: '1px solid #e2e8f0', background: '#f8faff' }}>
                    <td style={cellule} colSpan={7}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Link to={lienEcritures(dossierId, periodes, e.date)} style={{ fontFamily: mono, fontWeight: 800, color: '#1e1b4b', textDecoration: 'none' }} title="Voir sur la page Écritures (mois de l'écriture)">{e.numero || e.numeroProvisoire}</Link>
                        <span style={{ color: '#334155' }}>{fmtJour(e.date)}{e.dateReelle ? <span style={{ color: '#b45309', fontSize: '0.72rem' }}> (op. {fmtJour(e.dateReelle)})</span> : null}</span>
                        <span style={{ fontFamily: mono, fontSize: '0.76rem', color: '#64748b' }}>{e.reference}</span>
                        <span style={{ color: '#0f172a', fontWeight: 700, flex: '1 1 160px' }}>{e.libelle}</span>
                        {e.origine === 'contrepassation' && <span style={pastille('#fef2f2', '#be123c')}>↩ annule {e.origineNumero}</span>}
                        <span style={{ fontFamily: mono, fontWeight: 700 }}>{fmtMontant(e.total)}</span>
                        <span style={pastille(e.etat === 'validee' ? '#dcfce7' : '#fef3c7', e.etat === 'validee' ? '#166534' : '#92400e')}>{LIBELLES_ETAT[e.etat]}</span>
                      </span>
                    </td>
                  </tr>
                  {(e.lignes || []).map((l) => (
                    <tr key={l.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ ...cellule, whiteSpace: 'nowrap' }}><span style={{ fontFamily: mono, fontWeight: 800, color: '#1e1b4b' }}>{l.compte.numero}</span> <span style={{ color: '#475569' }}>{l.compte.libelle}</span></td>
                      <td style={cellule}>{l.tiers ? <><span style={{ fontFamily: mono, fontWeight: 700 }}>{l.tiers.code}</span> {l.tiers.nom}</> : '—'}</td>
                      <td style={{ ...cellule, color: l.libelle ? '#0f172a' : '#94a3b8' }}>{l.libelle || e.libelle}</td>
                      <td style={nombre}>{montant(l.debit)}</td><td style={nombre}>{montant(l.credit)}</td>
                      <td style={cellule}>{l.taxe ? <span style={pastille('#f1f5f9', '#475569')}>{l.taxe.code}</span> : ''}</td>
                      <td style={cellule}>{fmtJour(l.echeance)}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
              <tfoot>
                <tr style={{ borderTop: '2px solid #c7d2fe', fontWeight: 800, background: '#f8faff' }}>
                  <td style={cellule} colSpan={3}>Total ({pluriel(j.totaux.nbEcritures, 'écriture', 'écritures')}) <Brouillard n={j.totaux.nbBrouillard} lignes={false} /></td>
                  <td style={nombre}>{fmtMontant(j.totaux.debit)}</td><td style={nombre}>{fmtMontant(j.totaux.credit)}</td>
                  <td style={cellule} colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      {j && j.ecritures.length < j.total && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <button type="button" onClick={afficherPlus} disabled={plus || lecture} style={{ ...bouton('#fff', '#4338ca', '#c7d2fe'), opacity: plus ? 0.7 : 1 }}>{plus ? 'Lecture…' : `Afficher plus (${pluriel(j.total - j.ecritures.length, 'autre écriture', 'autres écritures')})`}</button>
        </div>
      )}
    </>
  );
}

const cadre: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const enTeteCadre: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', background: 'linear-gradient(135deg,#f8faff,#eef2ff)', flexWrap: 'wrap' };
const cellule: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };
const nombre: React.CSSProperties = { ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
// Texte lu par les lecteurs d'écran, invisible (en-tête de la colonne des pastilles).
const cache: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };
