import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import BoutonAide from '../BoutonAide';
import { messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import { fmtJour, fmtMontant, versMillimes } from '../ecritures';
import { enregistrerNotes, lireEtats, telechargerEtatsPdf, type CompteEtat, type CoteBilan, type EtatsReponse, type LigneResultat } from '../etats';
import { bouton, inp, lbl, pastille, petit } from '../styles';

// « États financiers » (LabFlow Compta, étape E1 ; labflow-reprise/achats-compta/PLAN-ETATS-FINANCIERS.md §2 ligne E1, §3 ;
// réponses du client du 14/10 — « ok pour les 5 ») : le bilan (NC 01, annexe 1) et l'état de résultat (annexe 3, par
// nature) d'un exercice du dossier, colonnes N et N−1 (l'exercice précédent, calculé pareil ; vide au premier exercice),
// chaque poste dépliable sur ses comptes, les contrôles (bilan équilibré, résultat cohérent, comptes sans poste), les
// mentions de la NC 01 (§19 : entreprise, matricule, arrêté ou situation provisoire, unité), le PDF. E2 (§2 ligne E2) :
// l'état des flux de trésorerie (annexe 5, méthode indirecte, contrôle bouclé), les notes — soldes intermédiaires de gestion
// (annexe 8), détail des postes (les postes dépliés), texte libre de l'exercice (titulaire, Complet) — et le jeu complet en
// PDF. Le serveur calcule et décide ; l'écran choisit (exercice, brouillard compris — dans l'adresse) et montre ; seules les
// notes s'écrivent. Les lectures sont numérotées : une réponse partie avant la dernière demande n'écrase jamais la
// dernière. Vocabulaire comptable fixe.
type Role = 'titulaire' | 'gerant';
const mono = 'ui-monospace, monospace';
const pluriel = (n: number, un: string, des: string) => `${n} ${n > 1 ? des : un}`;
// Un montant d'état financier, à la manière des annexes : « 1 234,500 », négatif entre parenthèses « (400,000) », zéro « — »
// (ou « 0,000 » sur un total).
const montant = (v: string, zero = '—') => {
  const negatif = v.startsWith('-');
  const abs = negatif ? v.slice(1) : v;
  if (versMillimes(abs) === 0n) return zero;
  return negatif ? `(${fmtMontant(abs)})` : fmtMontant(abs);
};
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#b91c1c', fontSize: '0.84rem' };
const carte: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '18px 20px', marginBottom: 18 };
const titreCarte: React.CSSProperties = { fontWeight: 900, color: '#1e1b4b', fontSize: '1.02rem', margin: '0 0 10px' };

// Une page par dossier : changer de dossier (navigation directe) repart d'un état neuf.
export default function ComptaEtatsPage() {
  const { dossierId } = useParams();
  return <ComptaEtats key={dossierId} dossierId={dossierId} />;
}

function ComptaEtats({ dossierId }: { dossierId?: string }) {
  const [parametres, setParametres] = useSearchParams();
  const exerciceInitial = parametres.get('exercice');
  const [exerciceId, setExerciceId] = useState<number | null>(exerciceInitial && /^\d+$/.test(exerciceInitial) ? Number(exerciceInitial) : null);
  const [brouillard, setBrouillard] = useState(parametres.get('brouillard') === '1');
  const [etatPx, setEtatPx] = useState<EtatsReponse | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'erreur'>('chargement');
  // La clé de la sélection servie ; différente de la demande en cours = lecture en route.
  const [servie, setServie] = useState('');
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [ouverts, setOuverts] = useState<Set<string>>(() => new Set());
  // E2 : le texte libre des notes en cours de rédaction, repris du serveur à chaque changement d'exercice.
  const [texteNotes, setTexteNotes] = useState('');
  const notesPour = useRef<number | null>(null);
  const tour = useRef(0);

  const cleDemandee = `${exerciceId ?? ''}/${brouillard}`;
  const charger = useCallback(() => {
    const moi = ++tour.current;
    lireEtats(dossierId || '', { exerciceId, brouillard })
      .then((r) => {
        if (moi !== tour.current) return;
        setEtatPx(r);
        setEtat('pret');
        setErreur('');
        setExerciceId((x) => x ?? r.selection.exercice);
        setServie(`${exerciceId ?? r.selection.exercice}/${brouillard}`);
        if (notesPour.current !== r.exercice.id) { notesPour.current = r.exercice.id; setTexteNotes(r.notes.texte); }
      })
      .catch((err) => {
        if (moi !== tour.current) return;
        const s = statutDe(err);
        setServie(`${exerciceId ?? ''}/${brouillard}`);
        if (!etatPx || (s === 404 && !exerciceId)) setEtat(s === 404 ? 'introuvable' : 'erreur');
        else setErreur(messageDossier(err, 'Lecture impossible, réessayez.', (etatPx?.dossier.espace.role || 'titulaire') as Role));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierId, exerciceId, brouillard]);
  const lecture = etat === 'pret' && servie !== cleDemandee;
  useEffect(() => { charger(); return () => { tour.current += 1; }; }, [charger]);
  // La sélection vit dans l'adresse (retour, partage).
  useEffect(() => {
    const q: Record<string, string> = {};
    if (exerciceId) q.exercice = String(exerciceId);
    if (brouillard) q.brouillard = '1';
    setParametres(q, { replace: true });
  }, [exerciceId, brouillard, setParametres]);

  const role: Role = etatPx?.dossier.espace.role || 'titulaire';
  const basculer = (cle: string) => setOuverts((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  const pdf = async (complet: boolean) => {
    if (!etatPx || occupe) return;
    setOccupe(true);
    setInfo('');
    try {
      await telechargerEtatsPdf(etatPx.dossier.id, { exerciceId, brouillard }, complet);
      setInfo(complet ? 'PDF téléchargé : jeu complet (bilan, état de résultat, flux de trésorerie, notes).' : 'PDF téléchargé : bilan et état de résultat.');
    } catch (err) {
      setErreur(messageDossier(err, 'PDF impossible, réessayez.', role));
    } finally {
      setOccupe(false);
    }
  };
  // E2 : enregistrer les notes ; un refus sur un état périmé (404, 409) relit la page.
  const peutEcrire = !!etatPx && etatPx.droits.configurer && etatPx.dossier.etat === 'actif' && etatPx.etatAbonnement === 'actif';
  const notesModifiees = !!etatPx && texteNotes !== etatPx.notes.texte;
  const enregistrer = async () => {
    if (!etatPx || occupe) return;
    setOccupe(true);
    setInfo('');
    try {
      const n = await enregistrerNotes(etatPx.dossier.id, etatPx.exercice.id, texteNotes);
      setEtatPx({ ...etatPx, notes: n });
      setTexteNotes(n.texte);
      setErreur('');
      setInfo(n.texte ? 'Notes enregistrées.' : 'Notes effacées.');
    } catch (err) {
      const s = statutDe(err);
      setErreur(messageDossier(err, 'Enregistrement impossible, réessayez.', role));
      if (s === 404 || s === 409) charger();
    } finally {
      setOccupe(false);
    }
  };

  const retour = etatPx ? { lien: `/dossiers/${etatPx.dossier.id}`, libelle: etatPx.dossier.nom } : null;
  const x = etatPx?.exercice;
  const e = etatPx?.entete;
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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📊</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>États financiers{x ? ` ${x.millesime}` : ''}</h1>
            {x?.clos && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Exercice clos</span>}
            {e?.provisoire && <span style={pastille('rgba(254,243,199,0.9)', '#92400e')}>Situation provisoire</span>}
            {etatPx?.dossier.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Dossier archivé</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {e ? `${e.arrete} · ${e.unite}` : 'Bilan et état de résultat (NC 01, annexes 1 et 3), colonnes N et N−1, PDF'}
          </p>
        </div>
        <BoutonAide section="compta-etats" />
      </div>

      {etat === 'chargement' && <div className="loading-text">Chargement…</div>}
      {etat === 'erreur' && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>Impossible de charger les états financiers.</span>
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

      {etatPx && etat === 'pret' && x && e && (
        <>
          {etatPx.etatAbonnement !== 'actif' && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {texteEtatAbonnement(etatPx.etatAbonnement, role)} : les états financiers restent consultables.
            </div>
          )}
          {erreur && <div role="alert" style={{ ...alerte, marginBottom: 14 }}>{erreur}</div>}
          {info && <div role="status" style={{ ...alerte, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', marginBottom: 14 }}>{info}</div>}

          {/* La sélection : exercice, brouillard compris, PDF, liens */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <label htmlFor="fe-exercice" style={lbl}>Exercice</label>
              <select id="fe-exercice" value={exerciceId ?? ''} onChange={(ev) => { setExerciceId(ev.target.value ? Number(ev.target.value) : null); setInfo(''); }} style={{ ...inp, width: 'auto', minWidth: 210 }}>
                {etatPx.exercices.map((y) => <option key={y.id} value={y.id}>{y.millesime} — {fmtJour(y.debut)} → {fmtJour(y.fin)}{y.etat === 'clos' ? ' (clos)' : ''}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#334155', fontWeight: 600, padding: '9px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={brouillard} onChange={(ev) => { setBrouillard(ev.target.checked); setInfo(''); }} />
              Brouillard compris{etatPx.brouillard.nb ? ` (${pluriel(etatPx.brouillard.nb, 'écriture', 'écritures')})` : ''}
            </label>
            <button type="button" onClick={() => pdf(false)} disabled={occupe || lecture} style={{ ...bouton('#1e1b4b', '#fff', '#1e1b4b'), opacity: occupe || lecture ? 0.6 : 1 }}>📄 PDF</button>
            <button type="button" onClick={() => pdf(true)} disabled={occupe || lecture} title="Bilan, état de résultat, flux de trésorerie et notes en un seul document" style={{ ...bouton('#fff', '#1e1b4b', '#1e1b4b'), opacity: occupe || lecture ? 0.6 : 1 }}>📚 Jeu complet (PDF)</button>
            <Link to={`/dossiers/${etatPx.dossier.id}/livres?vue=balance`} style={{ ...petit('#f8fafc', '#334155', '#cbd5e1'), textDecoration: 'none' }}>⚖️ Balance</Link>
            {(x.clos || x.fini) && <Link to={`/dossiers/${etatPx.dossier.id}/exercices/${x.id}/cloture`} style={{ ...petit('#f8fafc', '#334155', '#cbd5e1'), textDecoration: 'none' }}>🔒 Clôture</Link>}
            {lecture && <span style={{ fontSize: '0.78rem', color: '#64748b', padding: '9px 0' }}>Lecture…</span>}
          </div>

          {/* Les mentions de la NC 01 (§19) */}
          <div style={{ ...carte, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div>
              <div style={lbl}>Entreprise</div>
              <div style={{ fontWeight: 800, color: '#1e1b4b' }}>{e.entreprise}{e.forme ? ` (${e.forme})` : ''}</div>
              {e.matricule && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Matricule fiscal {e.matricule}</div>}
            </div>
            <div>
              <div style={lbl}>Arrêté</div>
              <div style={{ fontWeight: 700, color: e.provisoire ? '#92400e' : '#166534' }}>{e.arrete}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{e.unite}</div>
            </div>
            <div>
              <div style={lbl}>Colonnes</div>
              <div style={{ fontSize: '0.84rem', color: '#334155' }}>
                <strong>{e.colonnes.n}</strong> (du {fmtJour(x.debut)} au {fmtJour(x.fin)})<br />
                {etatPx.precedent ? <><strong>{e.colonnes.n1}</strong> (du {fmtJour(etatPx.precedent.debut)} au {fmtJour(etatPx.precedent.fin)}{etatPx.precedent.etat === 'clos' ? ', clos' : ', non clos'})</> : <span style={{ color: '#64748b' }}>Premier exercice du dossier : la seconde colonne est vide (NC 01 §20).</span>}
              </div>
            </div>
            {(etatPx.brouillard.nb > 0 || etatPx.provisoire.report) && (
              <div style={{ gridColumn: '1 / -1', fontSize: '0.8rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
                {etatPx.brouillard.nb > 0 && <div>{etatPx.brouillard.compris ? `${pluriel(etatPx.brouillard.nb, 'écriture en brouillard comprise', 'écritures en brouillard comprises')} : situation provisoire.` : `${pluriel(etatPx.brouillard.nb, 'écriture en brouillard non comprise', 'écritures en brouillard non comprises')} (écritures validées seulement).`}</div>}
                {etatPx.provisoire.report && <div>Soldes d'ouverture provisoires : l'exercice {etatPx.provisoire.report.precedent.millesime} n'est pas clos, ses soldes de fin sont repris (rien n'est écrit) ; son résultat {etatPx.provisoire.report.resultat ? `(${fmtMontant(etatPx.provisoire.report.resultat.replace('-', ''))}, ${etatPx.provisoire.report.resultat.startsWith('-') ? 'perte' : 'bénéfice'}) ` : ''}est en résultats reportés.</div>}
              </div>
            )}
          </div>

          {/* Les contrôles */}
          <div style={carte}>
            <h2 style={titreCarte}>{etatPx.pret ? '✅ Contrôles au vert' : '⚠️ Contrôles'}</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {etatPx.controles.map((c) => (
                <li key={c.code} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.84rem', color: c.ok ? '#334155' : '#b91c1c' }}>
                  <span aria-hidden style={{ fontWeight: 900, flexShrink: 0 }}>{c.ok ? '✓' : '✗'}</span>
                  <span><strong>{c.libelle}</strong> — {c.detail}{!c.ok && c.code === 'sansPoste' && <> <Link to={`/dossiers/${etatPx.dossier.id}/plan`} style={{ color: '#4338ca', fontWeight: 700 }}>Plan de comptes →</Link></>}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Le bilan */}
          <div style={carte}>
            <h2 style={titreCarte}>⚖️ Bilan</h2>
            <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#64748b' }}>NC 01, annexe 1. Cliquez un poste pour voir ses comptes. Les postes à zéro sur les deux exercices ne sont pas présentés.</p>
            <Cote titre="Actifs" cote={etatPx.bilan.actifs} colonnes={e.colonnes} prefixe="A" ouverts={ouverts} basculer={basculer} />
            <Cote titre="Capitaux propres et passifs" cote={etatPx.bilan.passifs} colonnes={e.colonnes} prefixe="P" ouverts={ouverts} basculer={basculer} />
          </div>

          {/* L'état de résultat */}
          <div style={carte}>
            <h2 style={titreCarte}>📈 État de résultat</h2>
            <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#64748b' }}>NC 01, annexe 3 (présentation autorisée, par nature) : produits en plus, charges entre parenthèses.</p>
            <Tableau colonnes={e.colonnes}>
              {etatPx.resultat.lignes.map((l, i) => (l.titre !== undefined
                ? <tr key={`T${i}`}><td colSpan={3} style={{ padding: '10px 8px 4px', fontWeight: 800, color: '#1e1b4b' }}>{l.titre}</td></tr>
                : <Rangee key={l.code} cle={`R/${l.code}`} libelle={l.libelle} n={l.n} n1={l.n1} niveau={l.calcul ? 0 : 1} gras={!!l.calcul} fond={l.code === 'resultatNet' ? '#eef2ff' : l.calcul ? '#f8fafc' : undefined} zero={l.calcul ? '0,000' : '—'} comptes={l.comptes} ouverts={ouverts} basculer={basculer} />))}
            </Tableau>
          </div>

          {/* E2 : l'état des flux de trésorerie (annexe 5, méthode indirecte) */}
          {etatPx.flux && (
            <div style={carte}>
              <h2 style={titreCarte}>💧 État des flux de trésorerie</h2>
              <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#64748b' }}>NC 01, annexe 5 (méthode indirecte) : du résultat net à la variation de trésorerie, puis investissement et financement. Trésorerie : {etatPx.flux.tresorerie.libelle.toLowerCase()}.</p>
              <Tableau colonnes={e.colonnes}>
                {etatPx.flux.lignes.map((l, i) => (l.titre !== undefined
                  ? <tr key={`F${i}`}><td colSpan={3} style={{ padding: '10px 8px 4px', fontWeight: 800, color: '#1e1b4b' }}>{l.titre}</td></tr>
                  : <Rangee key={l.code} cle={`F/${l.code}`} libelle={l.libelle} n={l.n} n1={l.n1} niveau={l.calcul === 'total' ? 0 : 1} gras={l.calcul === 'total' || l.calcul === 'resultat'} italique={l.calcul === 'tresorerieDebut' || l.calcul === 'tresorerieFin'} fond={l.code === 'variationTresorerie' ? '#eef2ff' : l.calcul === 'total' ? '#f8fafc' : undefined} zero={l.calcul ? '0,000' : '—'} comptes={l.comptes} ouverts={ouverts} basculer={basculer} />))}
              </Tableau>
            </div>
          )}

          {/* E2 : les notes — soldes intermédiaires de gestion, détail des postes, texte libre */}
          <div style={carte}>
            <h2 style={titreCarte}>📝 Notes aux états financiers</h2>
            {etatPx.sig && (
              <>
                <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.95rem', margin: '0 0 4px' }}>1. Soldes intermédiaires de gestion</div>
                <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: '#64748b' }}>NC 01, annexe 8 : marge commerciale, production, valeur ajoutée, excédent brut d'exploitation, résultat des activités ordinaires, résultat net.</p>
                <Tableau colonnes={e.colonnes}>
                  {etatPx.sig.lignes.map((l, i) => (l.titre !== undefined
                    ? <tr key={`S${i}`}><td colSpan={3} style={{ padding: '10px 8px 4px', fontWeight: 800, color: '#1e1b4b' }}>{l.titre}</td></tr>
                    : <Rangee key={l.code} cle={`S/${l.code}`} libelle={l.libelle} n={l.n} n1={l.n1} niveau={l.calcul ? 0 : 1} gras={!!l.calcul} fond={l.code === 'resultatNet' ? '#eef2ff' : l.calcul ? '#f8fafc' : undefined} zero={l.calcul ? '0,000' : '—'} comptes={l.comptes} ouverts={ouverts} basculer={basculer} />))}
                </Tableau>
              </>
            )}
            <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.95rem', margin: '16px 0 4px' }}>{etatPx.sig ? '2' : '1'}. Détail des postes</div>
            <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: '#64748b' }}>Les comptes de chaque poste se lisent en dépliant les postes du bilan et de l'état de résultat ci-dessus ; le jeu complet (PDF) les reprend tous.</p>
            <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.95rem', margin: '16px 0 4px' }}>{etatPx.sig ? '3' : '2'}. Notes de l'entreprise</div>
            <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: '#64748b' }}>
              Méthodes comptables, faits marquants, engagements : un texte libre par exercice, repris dans le jeu complet.
              {etatPx.notes.modifieLe ? ` Rédigées le ${new Date(etatPx.notes.modifieLe).toLocaleDateString('fr-FR')}${etatPx.notes.modifiePar ? ` par ${etatPx.notes.modifiePar}` : ''}.` : ' Aucune note pour cet exercice.'}
            </p>
            <label htmlFor="fe-notes" style={lbl}>Texte des notes</label>
            <textarea id="fe-notes" value={texteNotes} onChange={(ev) => setTexteNotes(ev.target.value)} readOnly={!peutEcrire} maxLength={etatPx.notes.longueurMax} rows={8}
              placeholder={peutEcrire ? 'Méthodes comptables retenues, faits marquants de l\'exercice, engagements hors bilan…' : 'Rédaction réservée au titulaire et au niveau Complet.'}
              style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, background: peutEcrire ? '#fff' : '#f8fafc' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              {peutEcrire && <button type="button" onClick={enregistrer} disabled={occupe || !notesModifiees} style={{ ...bouton('#1e1b4b', '#fff', '#1e1b4b'), opacity: occupe || !notesModifiees ? 0.6 : 1 }}>Enregistrer les notes</button>}
              <span style={{ fontSize: '0.76rem', color: '#64748b' }}>{texteNotes.length} / {etatPx.notes.longueurMax} caractères{notesModifiees ? ' · modifications non enregistrées' : ''}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Un côté du bilan : groupes → rubriques → postes (brut, moins, net), totaux, total du côté.
function Cote({ titre, cote, colonnes, prefixe, ouverts, basculer }: { titre: string; cote: CoteBilan; colonnes: { n: string; n1: string }; prefixe: string; ouverts: Set<string>; basculer: (cle: string) => void }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 900, color: '#1e1b4b', fontSize: '0.95rem', margin: '0 0 6px' }}>{titre}</div>
      <Tableau colonnes={colonnes}>
        {cote.groupes.map((g) => (
          <GroupeRangees key={g.code} prefixe={prefixe} groupe={g} ouverts={ouverts} basculer={basculer} />
        ))}
        <Rangee cle={`${prefixe}/total`} libelle={cote.total.libelle} n={cote.total.n} n1={cote.total.n1} niveau={0} gras fond="#eef2ff" zero="0,000" ouverts={ouverts} basculer={basculer} />
      </Tableau>
    </div>
  );
}
function GroupeRangees({ prefixe, groupe: g, ouverts, basculer }: { prefixe: string; groupe: CoteBilan['groupes'][number]; ouverts: Set<string>; basculer: (cle: string) => void }) {
  return (
    <>
      <tr><td colSpan={3} style={{ padding: '10px 8px 4px', fontWeight: 800, color: '#1e1b4b' }}>{g.libelle}</td></tr>
      {g.rubriques.map((r) => (
        <RubriqueRangees key={r.code} prefixe={`${prefixe}/${g.code}`} rubrique={r} ouverts={ouverts} basculer={basculer} />
      ))}
      {g.total && <Rangee cle={`${prefixe}/${g.code}/total`} libelle={g.total.libelle} n={g.total.n} n1={g.total.n1} niveau={0} gras fond="#f1f5f9" zero="0,000" ouverts={ouverts} basculer={basculer} />}
    </>
  );
}
function RubriqueRangees({ prefixe, rubrique: r, ouverts, basculer }: { prefixe: string; rubrique: CoteBilan['groupes'][number]['rubriques'][number]; ouverts: Set<string>; basculer: (cle: string) => void }) {
  return (
    <>
      {r.libelle && <tr><td colSpan={3} style={{ padding: '6px 8px 2px 20px', fontWeight: 700, color: '#334155', fontSize: '0.84rem' }}>{r.libelle}</td></tr>}
      {r.postes.map((p) => (
        <PosteRangees key={p.code} cle={`${prefixe}/${p.code}`} poste={p} ouverts={ouverts} basculer={basculer} />
      ))}
      {r.total && <Rangee cle={`${prefixe}/total`} libelle={r.total.libelle} n={r.total.n} n1={r.total.n1} niveau={1} gras fond="#f8fafc" zero="0,000" ouverts={ouverts} basculer={basculer} />}
    </>
  );
}
function PosteRangees({ cle, poste: p, ouverts, basculer }: { cle: string; poste: CoteBilan['groupes'][number]['rubriques'][number]['postes'][number]; ouverts: Set<string>; basculer: (cle: string) => void }) {
  if (p.calcul === 'sousTotal') return <Rangee cle={cle} libelle={p.libelle} n={p.n} n1={p.n1} niveau={1} gras zero="0,000" ouverts={ouverts} basculer={basculer} />;
  if (p.calcul === 'resultat') return <Rangee cle={cle} libelle={p.libelle} n={p.n} n1={p.n1} niveau={2} gras zero="0,000" ouverts={ouverts} basculer={basculer} />;
  return (
    <>
      <Rangee cle={cle} libelle={p.libelle} n={p.n} n1={p.n1} niveau={2} comptes={p.comptes} ouverts={ouverts} basculer={basculer} />
      {p.moins && (
        <>
          <Rangee cle={`${cle}/moins`} libelle={p.moins.libelle} n={`-${p.moins.n.replace('-', '')}`} n1={`-${p.moins.n1.replace('-', '')}`} niveau={3} italique comptes={p.moins.comptes} ouverts={ouverts} basculer={basculer} />
          {p.net && <Rangee cle={`${cle}/net`} libelle="" n={p.net.n} n1={p.net.n1} niveau={2} gras zero="0,000" ouverts={ouverts} basculer={basculer} />}
        </>
      )}
    </>
  );
}

function Tableau({ colonnes, children }: { colonnes: { n: string; n1: string }; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem', minWidth: 520 }}>
        <thead>
          <tr style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>Poste</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', width: 150 }}>{colonnes.n}</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', width: 150 }}>{colonnes.n1}</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
// Une rangée (poste, ligne, total) ; avec `comptes`, elle se déplie sur ses comptes et leurs montants.
function Rangee({ cle, libelle, n, n1, niveau, gras = false, italique = false, fond, zero = '—', comptes, ouverts, basculer }: {
  cle: string; libelle: string; n: string; n1: string; niveau: number; gras?: boolean; italique?: boolean; fond?: string; zero?: string; comptes?: CompteEtat[]; ouverts: Set<string>; basculer: (cle: string) => void;
}) {
  const depliable = !!comptes && comptes.length > 0;
  const ouvert = depliable && ouverts.has(cle);
  const style: React.CSSProperties = { padding: '5px 8px', borderBottom: '1px solid #f1f5f9', fontWeight: gras ? 800 : 500, color: italique ? '#64748b' : '#0f172a', fontStyle: italique ? 'italic' : 'normal', background: fond };
  const chiffre: React.CSSProperties = { ...style, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' };
  return (
    <>
      <tr>
        <td style={{ ...style, paddingLeft: 8 + niveau * 14 }}>
          {depliable ? (
            <button type="button" onClick={() => basculer(cle)} aria-expanded={ouvert} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 'inherit', color: '#1e3a8a', cursor: 'pointer', textAlign: 'left' }}>
              {ouvert ? '▾' : '▸'} {libelle}
            </button>
          ) : libelle}
        </td>
        <td style={chiffre}>{montant(n, zero)}</td>
        <td style={chiffre}>{montant(n1, zero)}</td>
      </tr>
      {ouvert && comptes!.map((c) => (
        <tr key={c.id} style={{ background: '#fafafa' }}>
          <td style={{ padding: '3px 8px', paddingLeft: 8 + (niveau + 1) * 14 + 14, fontSize: '0.78rem', color: '#475569', borderBottom: '1px solid #f1f5f9' }}><span style={{ fontFamily: mono }}>{c.numero}</span> {c.libelle}</td>
          <td style={{ padding: '3px 8px', textAlign: 'right', fontFamily: mono, fontSize: '0.78rem', color: '#475569', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{montant(c.n)}</td>
          <td style={{ padding: '3px 8px', textAlign: 'right', fontFamily: mono, fontSize: '0.78rem', color: '#475569', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{montant(c.n1)}</td>
        </tr>
      ))}
    </>
  );
}
// Pour les relectures : le type d'une ligne de l'état de résultat est partagé avec etats.ts.
export type { LigneResultat };
